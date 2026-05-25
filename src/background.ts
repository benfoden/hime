import { OpenAIProvider } from './providers/openai.js';
import { GeminiProvider } from './providers/gemini.js';
import { OpenRouterProvider } from './providers/openrouter.js';
import type { 
  TranslationConfig, 
  TranslationProvider, 
  Settings, 
  Message,
  TranslateMessage,
  SetBadgeMessage 
} from './types.js';

// Provider registry
const providers: Record<string, TranslationProvider> = {
  openai: new OpenAIProvider(),
  gemini: new GeminiProvider(),
  openrouter: new OpenRouterProvider(),
};

// Current compose mode state
let composeState: {
  isActive: boolean;
  elementSelector?: string;
  originalText?: string;
} = { isActive: false };

// Get settings from storage
async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(['himeSettings']);
  return result.himeSettings || getDefaultSettings();
}

function getDefaultSettings(): Settings {
  return {
    provider: 'openai',
    apiKey: '',
    model: 'gpt-5-mini',
    storageMode: 'persistent',
    sourceLanguage: 'English',
    targetLanguage: 'Japanese',
    formality: 'auto',
    composeHotkey: 'Ctrl+Y',
    yoloHotkey: 'Ctrl+Shift+Y',
    swapHotkey: 'Ctrl+Shift+S',
  };
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

// Translate text
async function translateText(text: string): Promise<string> {
  const settings = await getSettings();
  
  if (!settings.apiKey) {
    throw new Error('API key not configured. Please set it in the extension options.');
  }
  
  const provider = providers[settings.provider];
  if (!provider) {
    throw new Error(`Unknown provider: ${settings.provider}`);
  }
  
  const config: TranslationConfig = {
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    formality: settings.formality,
    customPrompt: settings.customPrompt,
  };
  
  return await provider.translate(text, config, settings.apiKey, settings.model);
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
            const translated = await translateText(translateMsg.payload.text);
            sendResponse({ translatedText: translated });
          } catch (err) {
            const kind = (err as any)?.kind ?? 'unknown';
            const status = (err as any)?.status;
            const message = err instanceof Error ? err.message : 'Unknown error';
            const settings = await getSettings();
            const endpoint = settings.provider === 'openai'
              ? 'https://api.openai.com/v1/chat/completions'
              : settings.provider === 'openrouter'
              ? 'https://openrouter.ai/api/v1/chat/completions'
              : 'generativelanguage.googleapis.com';
            console.error('[hime] translate failed', { provider: settings.provider, model: settings.model, status, kind, endpoint, message });
            sendResponse({ error: message, kind });
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
