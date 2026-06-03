import { OpenAIProvider } from './providers/openai.js';
import { GeminiProvider } from './providers/gemini.js';
import { OpenRouterProvider } from './providers/openrouter.js';
import { BraveSearchClient } from './brave-search.js';
import type {
  TranslationConfig,
  TranslationProvider,
  TranslationResult,
  UsageRecord,
  Settings,
  Message,
  TranslateMessage,
  SetBadgeMessage,
  PredictMessage,
  SearchTranslatedMessage,
  SearchResult
} from './types.js';
import { migrateSettings } from './types.js';
import { sanitizeSuggestion } from './predict-util.js';

// Provider registry
const providers: Record<string, TranslationProvider> = {
  openai: new OpenAIProvider(),
  gemini: new GeminiProvider(),
  openrouter: new OpenRouterProvider(),
};

// Brave Search transport (Plan 08-02). Single module-scope instance.
const braveClient = new BraveSearchClient();

// In-flight dedup map (D-05): keyed on the normalized query (trim().toLowerCase()).
// While a search for a given normalized query is pending, a second same-query
// submit awaits the SAME promise rather than issuing a second Brave fetch.
// Entries are removed in a try/finally so a failed query never leaves a hanging
// entry (RESEARCH Pitfall 4).
const inFlightSearches = new Map<string, Promise<SearchResult[]>>();

// Current compose mode state
let composeState: {
  isActive: boolean;
  elementSelector?: string;
  originalText?: string;
} = { isActive: false };

// Get settings from storage
async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(['himeSettings']);
  return migrateSettings(result.himeSettings || {});
}

// Swap language direction
async function swapLanguageDirection(): Promise<void> {
  const settings = await getSettings();
  const temp = settings.sourceLanguage;
  settings.sourceLanguage = settings.targetLanguage;
  settings.targetLanguage = temp;
  await chrome.storage.local.set({ himeSettings: settings });
  
  // Update badge
  const badgeText = settings.targetLanguage.slice(0, 2).toUpperCase();
  await chrome.action.setBadgeText({ text: badgeText });
}

// Record token usage per model
async function recordUsage(model: string, usage: { inputTokens: number; outputTokens: number }): Promise<void> {
  const result = await chrome.storage.local.get(['himeUsage']);
  const stats: Record<string, UsageRecord> = result.himeUsage || {};
  const prev = stats[model] || { inputTokens: 0, outputTokens: 0, requests: 0 };
  stats[model] = {
    inputTokens: prev.inputTokens + usage.inputTokens,
    outputTokens: prev.outputTokens + usage.outputTokens,
    requests: prev.requests + 1,
  };
  await chrome.storage.local.set({ himeUsage: stats });
}

// Translate text
async function translateText(text: string): Promise<TranslationResult> {
  const settings = await getSettings();

  const apiKey = settings.apiKeys[settings.provider] || '';
  if (!apiKey) {
    throw new Error(`API key not configured for ${settings.provider}. Please set it in the extension options.`);
  }

  const provider = providers[settings.provider];
  if (!provider) {
    throw new Error(`Unknown provider: ${settings.provider}`);
  }

  // Auto-detect: if input contains Japanese, flip direction
  const jpPattern = /[぀-ゟ゠-ヿ一-鿿]/;
  const inputIsJP = jpPattern.test(text);
  const source = inputIsJP ? settings.targetLanguage : settings.sourceLanguage;
  const target = inputIsJP ? settings.sourceLanguage : settings.targetLanguage;

  const config: TranslationConfig = {
    sourceLanguage: source,
    targetLanguage: target,
    formality: settings.formality,
    customPrompt: settings.customPrompt,
  };

  const result = await provider.translate(text, config, apiKey, settings.model);
  if (result.usage) {
    await recordUsage(settings.model, result.usage);
  }
  return result;
}

// Predict text — silent, no usage recording (D-10)
async function predictText(text: string): Promise<TranslationResult> {
  const settings = await getSettings();

  const apiKey = settings.apiKeys[settings.provider] || '';
  if (!apiKey) {
    throw new Error(`API key not configured for ${settings.provider}. Please set it in the extension options.`);
  }

  const provider = providers[settings.provider];
  if (!provider) {
    throw new Error(`Unknown provider: ${settings.provider}`);
  }

  // T-05-01: Clip to last 500 chars — bounds token cost and limits pre-cursor text transmitted
  const clipped = text.slice(-500);

  // LANG-02: No source/target config — prompt instructs model to continue in the field's own language
  // D-10: No recordUsage() — prediction is silent, no badge updates in Phase 5
  return provider.predict(clipped, apiKey, settings.model);
}

// Message handler
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'translate': {
          const translateMsg = message as TranslateMessage;
          const s = await getSettings();
          console.log('[hime] translate request', { provider: s.provider, model: s.model, length: translateMsg.payload.text.length });
          try {
            const result = await translateText(translateMsg.payload.text);
            sendResponse({ translatedText: result.text });
          } catch (err) {
            const kind = (err as any)?.kind ?? 'unknown';
            const status = (err as any)?.status;
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            console.error('[hime] translate failed', { provider: s.provider, model: s.model, status, kind, message: errorMessage });
            sendResponse({ error: errorMessage, kind });
          }
          break;
        }
        
        case 'predict': {
          const predictMsg = message as PredictMessage;
          try {
            const result = await predictText(predictMsg.payload.text);
            sendResponse({ suggestion: sanitizeSuggestion(result.text) });
          } catch (err) {
            // D-10: silent — never an error badge for predictions
            sendResponse({ suggestion: '' });
          }
          break;
        }

        case 'searchTranslated': {
          const msg = message as SearchTranslatedMessage;
          const { query, sourceLanguage, targetLanguage } = msg.payload;
          const settings = await getSettings();
          // XLT-01 / T-08-07: key read from storage ONLY — never from the payload.
          const apiKey = settings.braveApiKey;
          if (!apiKey) {
            // Empty stored key → auth error, no fetch attempted.
            sendResponse({ error: 'Brave API key not configured — add it in options', kind: 'auth' });
            break;
          }

          // D-06: source==target short-circuit flag (query needs no translation).
          const isDirect = sourceLanguage === targetLanguage;
          // D-05: dedup key — normalized query.
          const dedupKey = query.trim().toLowerCase();

          if (inFlightSearches.has(dedupKey)) {
            // A search for this query is already in flight — reuse its promise.
            try {
              const results = await inFlightSearches.get(dedupKey)!;
              sendResponse({ results, direct: isDirect });
            } catch (err) {
              // Surface the same { error, kind } the originating caller will see.
              const kind = (err as { kind?: string })?.kind ?? 'unknown';
              const errorMessage = err instanceof Error ? err.message : 'Unknown error';
              sendResponse({ error: errorMessage, kind });
            }
            break;
          }

          // First caller for this query — issue the fetch and register it.
          // D-07: NO 429 auto-retry; the transport classifies and throws.
          const promise = braveClient.search(query, apiKey, { count: 10 });
          inFlightSearches.set(dedupKey, promise);
          try {
            const results = await promise;
            sendResponse({ results, direct: isDirect });
          } catch (err) {
            const kind = (err as { kind?: string })?.kind ?? 'unknown';
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            sendResponse({ error: errorMessage, kind });
          } finally {
            // Cleanup on BOTH success and failure (Pitfall 4) — never leak an entry.
            inFlightSearches.delete(dedupKey);
          }
          break;
        }

        case 'testBraveKey': {
          // No payload — key read from storage (D-04 / T-08-01 / XLT-01).
          const settings = await getSettings();
          const apiKey = settings.braveApiKey;
          if (!apiKey) {
            sendResponse({ ok: false, error: 'Brave API key is empty — enter it in options', kind: 'auth' });
            break;
          }
          try {
            // D-04: count:1 minimizes quota cost for a validation probe.
            await braveClient.search('test', apiKey, { count: 1 });
            sendResponse({ ok: true });
          } catch (err) {
            const kind = (err as { kind?: string })?.kind ?? 'unknown';
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            sendResponse({ ok: false, error: errorMessage, kind });
          }
          break;
        }

        case 'getSettings': {
          const settings = await getSettings();
          sendResponse({ settings });
          break;
        }
        
        case 'setBadge': {
          const badgeMsg = message as SetBadgeMessage;
          await chrome.action.setBadgeText({ text: badgeMsg.payload.text });
          if (badgeMsg.payload.color) {
            await chrome.action.setBadgeBackgroundColor({ color: badgeMsg.payload.color });
          }
          sendResponse({ success: true });
          break;
        }
        
        case 'swapDirection': {
          await swapLanguageDirection();
          sendResponse({ success: true });
          break;
        }

        case 'getUsage': {
          const usage = await chrome.storage.local.get(['himeUsage']);
          sendResponse({ usage: usage.himeUsage || {} });
          break;
        }

        case 'resetUsage': {
          await chrome.storage.local.remove('himeUsage');
          sendResponse({ success: true });
          break;
        }

        default:
          sendResponse({ error: 'Unknown message type' });
      }
    } catch (error) {
      sendResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  })();
  
  return true; // Keep message channel open for async
});

// Hotkeys are handled in the content script via an in-page keydown listener
// (see src/content.ts). chrome.commands global shortcuts were removed because
// reserved-key conflicts (e.g. Ctrl+Shift+T) and unassigned defaults made them
// fire unreliably. The content script messages { type: 'swapDirection' } here
// for the swap hotkey, handled by the onMessage listener above.

// Initialize badge on startup
chrome.runtime.onStartup.addListener(async () => {
  const settings = await getSettings();
  const badgeText = settings.targetLanguage.slice(0, 2).toUpperCase();
  await chrome.action.setBadgeText({ text: badgeText });
});

// Also set badge on install
chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  const badgeText = settings.targetLanguage.slice(0, 2).toUpperCase();
  await chrome.action.setBadgeText({ text: badgeText });
});
