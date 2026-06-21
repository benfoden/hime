import { OpenAIProvider } from './providers/openai.js';
import { GeminiProvider } from './providers/gemini.js';
import { OpenRouterProvider } from './providers/openrouter.js';
import { GoogleVisionProvider } from './providers/vision-google.js';
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
  SearchResult,
  TranslateBatchMessage,
  TranslateImageMessage,
  ImageEntry,
  ImageResult
} from './types.js';
import { migrateSettings } from './types.js';
import { sanitizeSuggestion } from './predict-util.js';
import { buildBatchTranslatePrompt, parseBatchReply } from './translate-batch.js';
import { buildQueryTranslateConfig } from './query-translate.js';
import {
  downscaleTarget,
  needsReencode,
  stripBase64Prefix,
  deriveImageEntry,
} from './image-resolve.js';
import { classifyError } from './errors.js';

// Provider registry
const providers: Record<string, TranslationProvider> = {
  openai: new OpenAIProvider(),
  gemini: new GeminiProvider(),
  openrouter: new OpenRouterProvider(),
};

// Brave Search transport (Plan 08-02). Single module-scope instance.
const braveClient = new BraveSearchClient();

// Google Vision + Translation provider (Phase 12 / v1.3). Single module-scope
// instance, mirroring braveClient. The two-call OCR+translate sequence lives
// behind visionProvider.ocrTranslate; the BYOK key is read from storage in the
// worker and passed in — never carried in a message (IMG-07 / T-12-11).
const visionProvider = new GoogleVisionProvider();

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

// ----------------------------------------------------------------------------
// Image OCR+translate pipeline (Phase 12 / v1.3 — IMG-01/04/05/07, VIS-03).
//
// This is the manual vertical slice's controller. It reuses the v1.2 worker
// doctrine (key-from-storage invariant, recordUsage, classifyError) and the
// Plan 02 provider + Plan 03 pure math, diverging only where MV3 lifecycle
// (Pitfall 5 → storage.session) and the sidePanel gesture (Pitfall 1) demand.
// ----------------------------------------------------------------------------

// ~25s budget for the full OCR+translate sequence (RESEARCH Pattern 1 / A5).
// The provider already times EACH Google call separately (~12s, vision-google
// CALL_TIMEOUT_MS); this outer race is the belt-and-suspenders ceiling so a
// stalled sequence surfaces a typed error instead of hanging the panel.
const IMAGE_JOB_TIMEOUT_MS = 25000;

// storage.session key under which the durable job/dedup/result map lives. The
// map is { [dedupKey]: ImageEntry } — survives MV3 worker termination so the
// panel can rebuild from it on open and a re-entry never re-bills a finished job.
const IMAGE_JOBS_KEY = 'himeImageJobs';

// Stable content-key for an image source URL. Used as the dedup id AND the panel
// entry id (D-01 prepend). djb2 over the srcUrl — collision-resistant enough for
// per-session dedup and avoids carrying a long data:/blob: URL as the id.
function imageDedupKey(srcUrl: string): string {
  let hash = 5381;
  for (let i = 0; i < srcUrl.length; i++) {
    hash = ((hash << 5) + hash + srcUrl.charCodeAt(i)) | 0;
  }
  return `img_${(hash >>> 0).toString(36)}`;
}

type ImageJobMap = Record<string, ImageEntry>;

async function getJobs(): Promise<ImageJobMap> {
  const result = await chrome.storage.session.get([IMAGE_JOBS_KEY]);
  return (result[IMAGE_JOBS_KEY] as ImageJobMap | undefined) ?? {};
}

async function getJob(dedupKey: string): Promise<ImageEntry | undefined> {
  const jobs = await getJobs();
  return jobs[dedupKey];
}

async function setJob(dedupKey: string, entry: ImageEntry): Promise<void> {
  const jobs = await getJobs();
  jobs[dedupKey] = entry;
  await chrome.storage.session.set({ [IMAGE_JOBS_KEY]: jobs });
}

// Push the current entry to the side panel. The panel (Plan 06) listens for this
// and swaps the matching skeleton by id. Wrapped in a catch because no panel may
// be open/listening yet — a missing receiver must never throw into the pipeline.
function pushEntry(entry: ImageEntry): void {
  chrome.runtime.sendMessage({ type: 'translateImage', payload: { entry } }).catch(() => {
    // No panel listening (not yet open / already closed) — durable state in
    // storage.session is the source of truth; the panel rebuilds on open.
  });
}

// Convert an ArrayBuffer to a base64 string without a data: prefix (Vision's
// bare-content form). Chunked to stay under the String.fromCharCode arg cap.
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// IMG-04 byte-resolution ladder (Pitfall 2 / T-12-13): resolve the right-clicked
// image to { base64, mime } WITHOUT ever reading a tainted page canvas.
//   (a) data: URL          → strip prefix, parse its own MIME directly.
//   (b) fetch(srcUrl)       → blob → base64 (works under <all_urls> for most
//                             same/cross-origin images that allow GET).
//   (c) fetch failure / blob: the worker cannot read → captureVisibleTab(png).
// The right-clicked image is visible by definition; precise scroll/sub-pixel
// cropping is a Phase 14 polish item (RESEARCH Open Question 3) — here the
// visible-tab capture is used as-is.
async function resolveImageBytes(
  srcUrl: string,
  tabId: number,
): Promise<{ base64: string; mime: string }> {
  // (a) data: URL — bytes are inline; derive MIME from the prefix.
  if (srcUrl.startsWith('data:')) {
    const mimeMatch = /^data:([^;,]*)[;,]/.exec(srcUrl);
    return {
      base64: stripBase64Prefix(srcUrl),
      mime: mimeMatch?.[1] || 'image/png',
    };
  }

  // (b) fetch under host_permissions. Only the user-selected info.srcUrl is ever
  // fetched here (not arbitrary worker input) — bounded SSRF surface (T-12-12).
  if (!srcUrl.startsWith('blob:')) {
    try {
      const response = await fetch(srcUrl);
      if (response.ok) {
        const blob = await response.blob();
        const base64 = arrayBufferToBase64(await blob.arrayBuffer());
        return { base64, mime: blob.type || 'image/png' };
      }
    } catch {
      // Fall through to the capture fallback (403 / opaque / network).
    }
  }

  // (c) captureVisibleTab fallback — for blob:, tainted, or fetch-blocked images.
  const tab = await chrome.tabs.get(tabId);
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  return { base64: stripBase64Prefix(dataUrl), mime: 'image/png' };
}

// VIS-03 MIME guard + downscale (Pitfall 3 / T-12-15). Re-encodes exotic MIME to
// PNG and/or downscales to the Vision long-edge cap using Plan 03's pure math.
// OffscreenCanvas/createImageBitmap/convertToBlob are SW-only and live here; the
// dimension math is imported from image-resolve. Returns the send-ready bytes.
async function downscaleAndGuard(
  base64: string,
  mime: string,
): Promise<{ base64: string; mime: string }> {
  const reencode = needsReencode(mime);

  // Decode to measure real dimensions. createImageBitmap from a Blob handles
  // every Vision-supported MIME the SW can decode.
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const sourceBlob = new Blob([bytes], { type: reencode ? 'image/png' : mime });

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(sourceBlob);
  } catch (err) {
    // Unsupported-and-un-decodable → typed error so the entry shows an explicit
    // error, never a blank (IMG-05). classifyError gives a stable kind.
    const e = new Error(`Unsupported image format: ${mime}`);
    (e as Error & { kind?: string }).kind = 'unknown';
    throw e;
  }

  const target = downscaleTarget(bitmap.width, bitmap.height);

  // Fast path: already a supported MIME at an in-bounds size → pass through.
  if (!reencode && !target.scaled) {
    bitmap.close();
    return { base64, mime };
  }

  const canvas = new OffscreenCanvas(target.width, target.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    const e = new Error('OffscreenCanvas 2D context unavailable');
    (e as Error & { kind?: string }).kind = 'unknown';
    throw e;
  }
  ctx.drawImage(bitmap, 0, 0, target.width, target.height);
  bitmap.close();

  // Exotic MIME → PNG (lossless, broadly Vision-accepted). Supported MIME that
  // only needed downscaling stays as-is (jpeg/webp keep their codec).
  const outMime = reencode ? 'image/png' : mime;
  const outBlob = await canvas.convertToBlob({ type: outMime });
  const outBase64 = arrayBufferToBase64(await outBlob.arrayBuffer());
  return { base64: outBase64, mime: outBlob.type || outMime };
}

// The async pipeline kicked off from the onClicked gesture. Writes a 'loading'
// entry, resolves bytes → guards/downscales → races ocrTranslate against the
// 25s ceiling → persists + pushes the final populated/no-text/error entry. Never
// leaves the entry on 'loading' (IMG-05) and never re-bills a finished dedupKey.
async function runImageJob(srcUrl: string, tabId: number, dedupKey: string): Promise<void> {
  // Dedup (Pitfall 5): a finished job is reused; an in-flight one is not restarted.
  const existing = await getJob(dedupKey);
  if (existing) {
    if (existing.kind === 'loading') return; // in-flight — don't start a second.
    pushEntry(existing); // populated / no-text / error — replay, don't re-bill.
    return;
  }

  const loading: ImageEntry = { kind: 'loading', id: dedupKey, thumbnailUrl: srcUrl };
  await setJob(dedupKey, loading);
  pushEntry(loading);

  const settings = await getSettings();
  // IMG-07 / T-12-11: key read from storage ONLY — never from a message, never logged.
  const apiKey = settings.googleApiKey;
  if (!apiKey) {
    const entry = deriveImageEntry({
      id: dedupKey,
      thumbnailUrl: srcUrl,
      error: { kind: 'auth', message: 'Google Cloud API key not configured — add it in options' },
    });
    await setJob(dedupKey, entry);
    pushEntry(entry);
    return;
  }

  try {
    const resolved = await resolveImageBytes(srcUrl, tabId);
    const guarded = await downscaleAndGuard(resolved.base64, resolved.mime);

    const result = await Promise.race([
      visionProvider.ocrTranslate(guarded.base64, guarded.mime, settings.targetLanguage, apiKey),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(Object.assign(new Error('Image translation timed out'), { name: 'AbortError' })),
          IMAGE_JOB_TIMEOUT_MS,
        ),
      ),
    ]);

    let entry: ImageEntry;
    if (result === null) {
      // No-text sentinel (Pitfall 4) — explicit no-text entry, off the error channel.
      entry = deriveImageEntry({ id: dedupKey, thumbnailUrl: srcUrl, ocr: { noText: true } });
    } else {
      const ocr: ImageResult = result;
      if (ocr.usage) await recordUsage('google-vision', ocr.usage);
      entry = deriveImageEntry({ id: dedupKey, thumbnailUrl: srcUrl, ocr });
      // D-02 / IMG-03 direction line: surface the resolved target display name so
      // the panel can render "Detected: X → Y" (entry.target on a populated entry).
      if (entry.kind === 'populated') entry.target = settings.targetLanguage;
    }
    await setJob(dedupKey, entry);
    pushEntry(entry);
  } catch (err) {
    // Provider errors already carry .kind; the synthetic timeout AbortError does
    // not, so fall back to classifyError (AbortError → 'network').
    const kind = (err as { kind?: import('./errors.js').ErrorKind })?.kind
      ?? classifyError('google', err).kind;
    const message = err instanceof Error ? err.message : 'Image translation failed';
    const entry = deriveImageEntry({
      id: dedupKey,
      thumbnailUrl: srcUrl,
      error: { kind, message },
    });
    await setJob(dedupKey, entry);
    pushEntry(entry);
  }
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

          // D-03: source==target short-circuit flag (query needs no translation).
          const isDirect = sourceLanguage === targetLanguage;

          // D-01 / D-02: Translate the query with an explicit source→target direction
          // before Brave search. Only when source != target (not isDirect).
          // Keys: Brave key from braveApiKey; LLM key from apiKeys[provider] (XLT-01 / T-11-01).
          let searchQuery = query;
          let translatedQuery: string | undefined;
          let translationFailed = false;

          if (!isDirect) {
            const llmApiKey = settings.apiKeys[settings.provider] || '';
            const provider = providers[settings.provider];
            if (!llmApiKey || !provider) {
              // No LLM key/provider — skip translation, search raw (D-10).
              translationFailed = true;
            } else {
              const queryConfig = buildQueryTranslateConfig(sourceLanguage, targetLanguage, settings.formality);
              try {
                // D-10 / T-11-03: race against an 8s timeout (mirrors translateBatch pattern).
                const result = await Promise.race([
                  provider.translate(query, queryConfig, llmApiKey, settings.model),
                  new Promise<never>((_, reject) =>
                    setTimeout(
                      () => reject(Object.assign(new Error('Query translation timed out'), { name: 'AbortError' })),
                      8000
                    )
                  ),
                ]);
                searchQuery = result.text.trim();
                translatedQuery = searchQuery;
                // Mirror translateText L108-110: record usage when present.
                if (result.usage) await recordUsage(settings.model, result.usage);
              } catch {
                // LLM failure/timeout → raw-query fallback (D-10). Never an error response.
                translationFailed = true;
                // searchQuery stays = query (raw fallback)
              }
            }
          }

          // D-05: dedup key — normalized search query (what is actually searched).
          const dedupKey = searchQuery.trim().toLowerCase();

          if (inFlightSearches.has(dedupKey)) {
            // A search for this query is already in flight — reuse its promise.
            try {
              const results = await inFlightSearches.get(dedupKey)!;
              sendResponse({ results, direct: isDirect, translatedQuery, translationFailed });
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
          const promise = braveClient.search(searchQuery, apiKey, { count: 10 });
          inFlightSearches.set(dedupKey, promise);
          try {
            const results = await promise;
            sendResponse({ results, direct: isDirect, translatedQuery, translationFailed });
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

        case 'translateBatch': {
          const msg = message as TranslateBatchMessage;
          const { items, config } = msg.payload;
          const s = await getSettings();
          const apiKey = s.apiKeys[s.provider] || '';
          if (!apiKey) {
            sendResponse({ error: `API key not configured for ${s.provider}`, kind: 'auth' });
            break;
          }
          const provider = providers[s.provider];
          if (!provider) {
            sendResponse({ error: `Unknown provider: ${s.provider}`, kind: 'unknown' });
            break;
          }
          // XLT-04: serialize ONLY the page-supplied items — url/hostname never added here.
          const inputKeys = Object.keys(items);
          const payloadText = JSON.stringify(items);
          // Batch prompt is prepended to the user content so the JSON instruction overrides
          // the system-level "output ONLY translated text" that all providers inject via
          // buildSystemPrompt. This keeps all provider files untouched (out of scope).
          // See RESEARCH §"Pattern 2" and §"Pitfall: prompt conflict".
          const batchInstruction = buildBatchTranslatePrompt(config);
          const userContent = `${batchInstruction}\n\n${payloadText}`;
          try {
            // D-04: race against an 8s timeout. The synthetic error uses name: 'AbortError'
            // so classifyError maps it to kind: 'network' (errors.ts lines 24-34).
            const result = await Promise.race([
              provider.translate(userContent, config, apiKey, s.model),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(Object.assign(new Error('Translation timed out'), { name: 'AbortError' })),
                  8000
                )
              ),
            ]);
            if (result.usage) await recordUsage(s.model, result.usage);
            const translations = parseBatchReply(result.text, inputKeys);
            sendResponse({ translations });
          } catch (err) {
            // Provider errors already carry .kind; the synthetic 8s-timeout AbortError
            // does not, so fall back to classifyError (AbortError → 'network', T-10-05/D-04).
            const kind = (err as { kind?: string })?.kind ?? classifyError(s.provider, err).kind;
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            console.error('[hime] translateBatch failed', { provider: s.provider, model: s.model, kind, message: errorMessage });
            sendResponse({ error: errorMessage, kind });
          }
          break;
        }

        case 'translateImage': {
          // The actual OCR+translate work is driven by runImageJob from the
          // contextMenus.onClicked gesture (which must open the panel before any
          // await — Pitfall 1). This message-handler path exists so the message
          // contract is complete and the panel has a dedup/replay query path:
          // given a dedupKey it replays the durable storage.session entry; given
          // a fresh { srcUrl, tabId, dedupKey } it (re-)runs the job.
          const msg = message as TranslateImageMessage;
          const { srcUrl, tabId, dedupKey } = msg.payload;
          const settings = await getSettings();
          // IMG-07 / T-12-11: key read from storage ONLY — never from the payload,
          // never logged. Empty key → auth error, no work attempted.
          const apiKey = settings.googleApiKey;
          if (!apiKey) {
            sendResponse({ error: 'Google Cloud API key not configured', kind: 'auth' });
            break;
          }
          // Replay a finished durable entry if present (no re-bill); otherwise run.
          const existing = dedupKey ? await getJob(dedupKey) : undefined;
          if (existing && existing.kind !== 'loading') {
            pushEntry(existing);
            sendResponse({ entry: existing });
            break;
          }
          if (srcUrl && typeof tabId === 'number' && dedupKey) {
            void runImageJob(srcUrl, tabId, dedupKey);
          }
          sendResponse({ accepted: true });
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

// Also set badge on install. ALSO register the image context menu here (NOT at
// module top level) so a duplicate-id error never fires on SW re-spawn (Pitfall
// 6): removeAll() first, then create the single 'hime-translate-image' item.
chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  const badgeText = settings.targetLanguage.slice(0, 2).toUpperCase();
  await chrome.action.setBadgeText({ text: badgeText });

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'hime-translate-image',
      title: 'Translate image with hime',
      contexts: ['image'],
    });
  });
});

// Right-click → "Translate image with hime" (IMG-01). Top-level listener (NOT
// inside onInstalled). Pitfall 1: chrome.sidePanel.open({ tabId }) MUST be the
// FIRST synchronous statement inside the user-gesture handler — no await, no
// preceding async call — or Chrome rejects the open as "not in a user gesture".
// Only AFTER opening the panel do we kick off the async image job.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'hime-translate-image' || !tab?.id) return;
  // Open the panel synchronously inside the gesture — before any await.
  void chrome.sidePanel.open({ tabId: tab.id });

  const srcUrl = info.srcUrl;
  if (!srcUrl) return;
  // Content-key dedup id (Pitfall 5): a stable string derived from the source
  // URL. The right-click context exposes no reliable dimensions, so the srcUrl
  // is the identity; same image right-clicked twice reuses the cached entry.
  const dedupKey = imageDedupKey(srcUrl);
  void runImageJob(srcUrl, tab.id, dedupKey);
});
