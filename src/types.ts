// Types for hime Chrome extension
export type { ErrorKind, ClassifiedError } from './errors.js';

export interface TranslationConfig {
  sourceLanguage: string;
  targetLanguage: string;
  formality: 'auto' | 'casual' | 'polite' | 'formal';
  customPrompt?: string;
}

export interface ProviderConfig {
  provider: 'openai' | 'gemini' | 'openrouter';
  apiKeys: Partial<Record<'openai' | 'gemini' | 'openrouter', string>>;
  model: string;
  storageMode: 'persistent' | 'session';
}

export interface Settings extends TranslationConfig, ProviderConfig {
  predictHotkey: string;
  composeHotkey: string;
  yoloHotkey: string;
  swapHotkey: string;
  // Brave Search API key — top-level, NOT inside apiKeys (apiKeys is keyed by LLM
  // provider only, D-03). Read from storage in the worker; never passed in a message.
  braveApiKey: string;
  // Google Cloud Vision + Translation API key (Phase 12 / v1.3). Top-level, same
  // rationale as braveApiKey. Read from storage in the worker ONLY; never passed
  // in a message, never logged (T-12-01).
  googleApiKey: string;
  // Phase 13 / PROG-01 master opt-in toggle for progressive viewport mode.
  // Default OFF (D-01) — silent auto-upload must be explicitly consented to by the user.
  // Takes effect immediately via storage.onChanged without an extension reload (PROG-01).
  progressiveEnabled: boolean;
}

export interface TranslationRequest {
  text: string;
  config: TranslationConfig;
}

export interface TranslationResponse {
  translatedText: string;
  error?: string;
  kind?: import('./errors.js').ErrorKind;
}

export interface TranslationResult {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface TranslationProvider {
  name: string;
  translate(text: string, config: TranslationConfig, apiKey: string, model: string): Promise<TranslationResult>;
  predict(text: string, apiKey: string, model: string): Promise<TranslationResult>;
}

// Phase 12 (v1.3 Image Translation) — provider-agnostic OCR contract.
// Sibling of TranslationProvider. VisionProvider does OCR ONLY: it extracts the
// source text from an image and returns an OcrResult. Translation is NOT the
// vision provider's job — the worker routes the OCR'd text through the main LLM
// TranslationProvider pipeline (settings.provider/model/apiKeys), so image
// translations use the same model + key the user already configured. The vision
// apiKey is read from storage in the worker and passed in here; it is NEVER
// serialized into a message (T-12-01).
//
// A text-free image short-circuits to the distinct no-text sentinel `null`
// WITHOUT throwing (Pitfall 4 / IMG-05): the worker maps a null return to
// TranslateImageResponse `{ noText: true }`.
export interface VisionProvider {
  name: string;
  ocr(imageBase64: string, mime: string, apiKey: string): Promise<OcrResult | null>;
}

// OCR-only output of a VisionProvider — the source text plus detection metadata.
// The worker translates `originalText` via the LLM pipeline and assembles the
// final ImageResult (which adds translatedText).
export interface OcrResult {
  // The OCR'd source text (verbatim).
  originalText: string;
  // Detected source language — ISO code, for the "Detected: X → Y" line.
  detectedLang: string;
  // Mean word confidence in 0..1. <0.60 drives the D-04 low-confidence amber badge.
  confidence: number;
  // Optional OCR usage for recordUsage('<provider>-vision', ...) in the worker.
  usage?: { inputTokens: number; outputTokens: number };
}

// Normalized OCR+translation result rendered by the side panel.
// Modeled on SearchResult + the Phase 12 RESEARCH Code Examples shape.
export interface ImageResult {
  // The OCR'd source text (verbatim; rendered textContent-only by panel-render).
  originalText: string;
  // The translated text (target→user language). Rendered textContent-only.
  translatedText: string;
  // Detected source language — ISO code or display name, for the "Detected: X → Y" line.
  detectedLang: string;
  // Mean word confidence in 0..1. <0.60 drives the D-04 low-confidence amber badge.
  confidence: number;
  // Optional usage for recordUsage in the worker (units are provider-specific).
  usage?: { inputTokens: number; outputTokens: number };
}

// One side-panel session-list entry — a discriminated union over per-entry
// states (IMG-05 / D-04). `id` is the dedupKey; `thumbnailUrl` is optional.
// D-04: low-confidence is a *populated* entry carrying `lowConfidence: true`
// (amber badge), NOT a distinct kind.
export type ImageEntry =
  | { kind: 'loading'; id: string; thumbnailUrl?: string }
  // `target` is the resolved target-language display name/code for the
  // "Detected: X → Y" direction line (D-02/IMG-03); supplied by the panel/worker
  // and rendered verbatim via textContent. Optional so legacy entries never break.
  | { kind: 'populated'; id: string; thumbnailUrl?: string; result: ImageResult; lowConfidence: boolean; target?: string }
  | { kind: 'no-text'; id: string; thumbnailUrl?: string }
  | { kind: 'error'; id: string; thumbnailUrl?: string; errorKind: import('./errors.js').ErrorKind; message: string };

// Panel-level render input. `empty` is the first-open zero-state; `list` carries
// the accumulated entries (newest-first prepend is the renderer's job, D-01).
export type ImageState =
  | { kind: 'empty' }
  | { kind: 'list'; entries: ImageEntry[] };

export interface UsageRecord {
  inputTokens: number;
  outputTokens: number;
  requests: number;
}

// Message types for content script <-> background communication
export type MessageType =
  | 'translate'
  | 'translateResponse'
  | 'setBadge'
  | 'getSettings'
  | 'settingsResponse'
  | 'swapDirection'
  | 'toggleCompose'
  | 'yoloTranslate'
  | 'directionSwapped'
  | 'getUsage'
  | 'resetUsage'
  | 'predict'
  | 'searchTranslated'
  | 'testBraveKey'
  | 'testVisionKey'
  | 'translateBatch'
  | 'translateImage'
  // Phase 13 progressive viewport mode messages:
  | 'progressiveTranslate'  // content → worker: enqueue a progressive image job (gated, content-hash dedupKey)
  | 'openImagePanel'        // content → worker: badge-click gesture asks worker to sidePanel.open + scroll to entry (D-04, PROG-06)
  | 'progressiveActivity';  // worker → content (and toolbar): activity count update (pending+done, D-04a)

export interface Message {
  type: MessageType;
  payload?: unknown;
}

export interface TranslateMessage extends Message {
  type: 'translate';
  payload: {
    text: string;
    targetElement?: string;
  };
}

export interface PredictMessage extends Message {
  type: 'predict';
  payload: { text: string };
}

// A single Brave Search result, normalized for the Phase 9 SERP renderer.
export interface SearchResult {
  title: string;
  // The verbatim Brave result URL. NEVER mutated or rewritten (SERP-02).
  url: string;
  // Raw Brave snippet. May contain <strong> HTML when text_decorations=true.
  // Phase 8 passes this through untouched; Phase 9 MUST strip to plain text and
  // render via textContent (never innerHTML) — XSS-safe rendering is Phase 9's
  // contract (SERP-03).
  description: string;
  // Pre-parsed hostname for display / favicon lookup.
  hostname: string;
  faviconUrl?: string;
}

export interface SearchTranslatedMessage extends Message {
  type: 'searchTranslated';
  payload: {
    query: string;
    sourceLanguage: string;
    targetLanguage: string;
  };
}

// Worker → page reply for a searchTranslated request.
// Success → { results, direct?, translatedQuery?, translationFailed? }; failure → { error, kind } (D-02).
// translatedQuery: the source→target translated query string the worker searched with (D-04).
//   Present only when source != target and LLM translation succeeded.
// translationFailed: true when an LLM translation was attempted but failed/timed out (D-10),
//   so the page can show a degraded disclosure. Absent (undefined) on success or when direct.
export interface SearchTranslatedResponse {
  results?: SearchResult[];
  direct?: boolean;
  translatedQuery?: string;
  translationFailed?: boolean;
  error?: string;
  kind?: import('./errors.js').ErrorKind;
}

// Probe the stored Brave key. NO payload — the key is read from storage in the
// worker (D-04), never passed in the message (T-08-01 / XLT-01).
export interface TestBraveKeyMessage extends Message {
  type: 'testBraveKey';
}

// Probe the stored Google Cloud Vision/Translation key. NO payload — the key is
// read from storage in the worker (T-12-01 precedent: testBraveKey), never passed
// in the message, never logged. The worker exercises BOTH the Vision and the
// Translation v2 endpoints so the test validates the same two-call path image
// translation uses.
export interface TestVisionKeyMessage extends Message {
  type: 'testVisionKey';
}

// Page/worker request to OCR+translate one image (right-click or progressive).
// Clones SearchTranslatedMessage's shape. The googleApiKey is read from storage
// in the worker — NEVER carried in this payload (T-12-01).
export interface TranslateImageMessage extends Message {
  type: 'translateImage';
  payload: {
    // The image source URL (may be cross-origin; resolved to bytes in the worker).
    srcUrl: string;
    // The originating tab — needed for captureVisibleTab crop fallback (IMG-04).
    tabId: number;
    // Content-hash / identity key used for in-flight + result dedup and as the
    // panel entry id (D-01 prepend, Pitfall 5 durable state).
    dedupKey: string;
  };
}

// Worker → panel reply for a translateImage request.
// Success → { result } (optionally noText:false); no-text → { noText: true };
// failure → { error, kind } (the established D-02 reply contract).
export interface TranslateImageResponse {
  result?: ImageResult;
  noText?: boolean;
  error?: string;
  kind?: import('./errors.js').ErrorKind;
}

// --- Phase 13: Progressive Viewport Mode message interfaces ---
//
// Security law (T-12-01): BYOK API keys are NEVER carried in ANY message payload.
// The worker reads apiKeys and googleApiKey from storage.local exclusively.
// Progressive payloads carry only geometry/identity data: {srcUrl, dedupKey, tabId?}.

// content → worker: enqueue a progressive image job, gated by the IntersectionObserver
// dwell debounce + per-page budget + concurrency cap (D-01, D-02).
// No API keys in payload (T-12-01). `tabId` is optional; the worker falls back to
// chrome.tabs.query if omitted (captureVisibleTab crop fallback, IMG-04 precedent).
export interface ProgressiveTranslateMessage extends Message {
  type: 'progressiveTranslate';
  payload: {
    // The image source URL (may be cross-origin; resolved to bytes in the worker).
    srcUrl: string;
    // Content-hash / identity key for in-flight + result dedup and as the panel entry id
    // (PROG-03 / D-01 prepend). Same dedup map as translateImage (storage.session).
    dedupKey: string;
    // Originating tab — needed for captureVisibleTab crop fallback (IMG-04 precedent).
    tabId?: number;
  };
}

// content → worker: a user badge-click gesture asks the worker to call sidePanel.open()
// and scroll the panel to the image's entry (D-04, PROG-06). PROG-06 forbids
// auto-opening (IntersectionObserver is not a gesture); a human click is sanctioned.
export interface OpenImagePanelMessage extends Message {
  type: 'openImagePanel';
  payload: {
    // The originating tab — needed for sidePanel.open({ tabId }).
    tabId: number;
    // The panel entry to scroll to (matches the progressiveTranslate dedupKey).
    dedupKey: string;
  };
}

// worker → content (and toolbar): activity count update so the user can see work
// happening without the panel being auto-opened (D-04a). Displayed on the toolbar
// action badge or near the persistent "progressive ON" indicator (D-03a).
export interface ProgressiveActivityMessage extends Message {
  type: 'progressiveActivity';
  payload: {
    // Jobs currently in-flight (concurrency-capped at D-02 default of 2).
    pending: number;
    // Jobs completed (successes + no-text + errors) this page session (D-02a).
    done: number;
  };
}

// storage.local key for the one-time progressive consent acknowledgement (D-03).
// Ack lives in storage.local (persisted across sessions — re-prompt would be hostile UX).
// Per-page budget counter lives in storage.session (ephemeral, per 13-CONTEXT).
export const STORAGE_PROGRESSIVE_ACK = 'progressiveAck' as const;

export interface TranslateBatchMessage extends Message {
  type: 'translateBatch';
  payload: {
    items: Record<string, { t: string; d: string }>;
    config: TranslationConfig;
  };
}

// Worker → page reply for a translateBatch request.
// Success → { translations }; failure → { error, kind } (D-02).
export interface TranslateBatchResponse {
  translations?: Record<string, { t: string; d: string }>;
  error?: string;
  kind?: import('./errors.js').ErrorKind;
}

export interface SetBadgeMessage extends Message {
  type: 'setBadge';
  payload: {
    text: string;
    color?: string;
    kind?: import('./errors.js').ErrorKind;
  };
}

// Supported translation languages (display names — sent verbatim to the LLM as
// the language name). Used to populate the source/target dropdowns in options.
// Stored free-text values not in this list are still honored: options.ts injects
// the persisted value as an extra option so legacy/custom settings never break.
export const SUPPORTED_LANGUAGES: readonly string[] = [
  'English',
  'Japanese',
  'Korean',
  'Chinese (Simplified)',
  'Chinese (Traditional)',
  'Spanish',
  'French',
  'German',
  'Italian',
  'Portuguese',
  'Dutch',
  'Russian',
  'Polish',
  'Turkish',
  'Arabic',
  'Hindi',
  'Vietnamese',
  'Thai',
  'Indonesian',
];

// Display-name → ISO-639-1 code map (Phase 12, A3). hime stores languages as
// display names ("English"); Google Translation v2 needs an ISO `target` code,
// and the panel's "Detected: X → Y" line prefers codes. Covers every entry in
// SUPPORTED_LANGUAGES. Chinese uses region-qualified codes (zh-CN / zh-TW) since
// Translation v2 distinguishes Simplified vs Traditional.
const LANGUAGE_ISO: Readonly<Record<string, string>> = {
  English: 'en',
  Japanese: 'ja',
  Korean: 'ko',
  'Chinese (Simplified)': 'zh-CN',
  'Chinese (Traditional)': 'zh-TW',
  Spanish: 'es',
  French: 'fr',
  German: 'de',
  Italian: 'it',
  Portuguese: 'pt',
  Dutch: 'nl',
  Russian: 'ru',
  Polish: 'pl',
  Turkish: 'tr',
  Arabic: 'ar',
  Hindi: 'hi',
  Vietnamese: 'vi',
  Thai: 'th',
  Indonesian: 'id',
};

// Resolve a SUPPORTED_LANGUAGES display name to its ISO-639-1 code. Unknown or
// free-text values fall back to the trimmed/lowercased input (or 'en' if blank)
// rather than throwing — legacy/custom persisted settings never break (A3).
export function languageToIso(displayName: string): string {
  const code = LANGUAGE_ISO[displayName];
  if (code) return code;
  const fallback = displayName.trim().toLowerCase();
  return fallback || 'en';
}

// Default settings
export const DEFAULT_SETTINGS: Settings = {
  provider: 'openai',
  apiKeys: {},
  model: 'gpt-5-mini',
  storageMode: 'persistent',
  sourceLanguage: 'English',
  targetLanguage: 'Japanese',
  formality: 'auto',
  // Ctrl+/ default avoids the CJK IME Ctrl+Space conflict (D-03 / 05-RESEARCH Pitfall 1).
  predictHotkey: 'Ctrl+/',
  composeHotkey: 'Ctrl+Y',
  yoloHotkey: 'Ctrl+Shift+Y',
  swapHotkey: 'Ctrl+Shift+S',
  braveApiKey: '',
  googleApiKey: '',
  // PROG-01: progressive mode is OFF by default — auto-upload is privacy-sensitive
  // and requires an explicit first-enable consent (D-03 / PROG-05).
  progressiveEnabled: false,
};

// Migrate legacy single apiKey to per-provider apiKeys
export function migrateSettings(raw: Record<string, unknown>): Settings {
  const s = { ...DEFAULT_SETTINGS, ...raw } as Settings & { apiKey?: string };
  if (s.apiKey && (!s.apiKeys || Object.keys(s.apiKeys).length === 0)) {
    s.apiKeys = { [s.provider]: s.apiKey };
  }
  delete s.apiKey;
  return s;
}

// Available models per provider
export const PROVIDER_MODELS = {
  openai: ['gpt-5-mini', 'gpt-5-nano'],
  gemini: ['gemini-2.5-flash'],
  openrouter: [],
} as const;

// Model metadata: tok/s, JP↔EN quality, and pricing
// tokPerSec = median output throughput (tokens/sec)
// jpEn = FLORES-200 chrF++ ja↔en normalized to 0-5 (approximate)
// inPrice / outPrice = USD per 1M tokens (input / output)
//   Direct provider prices from official pricing pages.
//   OpenRouter prices from openrouter.ai/models (may include markup).
export interface ModelMeta {
  tokPerSec: number;
  jpEn: number;
  inPrice: number;
  outPrice: number;
}

export const MODEL_META: Record<string, ModelMeta> = {
  // Direct provider models
  'gpt-5-mini':                     { tokPerSec: 150, jpEn: 4.5, inPrice: 0.40,  outPrice: 1.60  },
  'gpt-5-nano':                     { tokPerSec: 250, jpEn: 3.8, inPrice: 0.10,  outPrice: 0.40  },
  'gemini-2.5-flash':               { tokPerSec: 300, jpEn: 4.2, inPrice: 0.15,  outPrice: 0.60  },
  // OpenRouter — fast tier
  'google/gemini-2.5-flash':        { tokPerSec: 300, jpEn: 4.2, inPrice: 0.15,  outPrice: 0.60  },
  'openai/gpt-4.1-mini':            { tokPerSec: 150, jpEn: 4.3, inPrice: 0.40,  outPrice: 1.60  },
  'openai/gpt-4.1-nano':            { tokPerSec: 200, jpEn: 3.6, inPrice: 0.10,  outPrice: 0.40  },
  'anthropic/claude-haiku':         { tokPerSec: 180, jpEn: 4.1, inPrice: 0.80,  outPrice: 4.00  },
  'deepseek/deepseek-chat-v3':      { tokPerSec: 120, jpEn: 4.0, inPrice: 0.27,  outPrice: 1.10  },
  'qwen/qwen3-8b':                  { tokPerSec: 250, jpEn: 3.4, inPrice: 0.05,  outPrice: 0.20  },
  'qwen/qwen3-14b':                 { tokPerSec: 180, jpEn: 3.9, inPrice: 0.10,  outPrice: 0.40  },
  'meta-llama/llama-4-scout':       { tokPerSec: 200, jpEn: 3.3, inPrice: 0.15,  outPrice: 0.60  },
  'mistralai/mistral-small':        { tokPerSec: 200, jpEn: 3.2, inPrice: 0.10,  outPrice: 0.30  },
  // OpenRouter — quality tier
  'anthropic/claude-sonnet-4':      { tokPerSec: 90,  jpEn: 4.7, inPrice: 3.00,  outPrice: 15.00 },
  'google/gemini-2.5-pro':          { tokPerSec: 80,  jpEn: 4.6, inPrice: 1.25,  outPrice: 10.00 },
  'qwen/qwen3-32b':                 { tokPerSec: 100, jpEn: 4.2, inPrice: 0.20,  outPrice: 0.80  },
  'meta-llama/llama-4-maverick':    { tokPerSec: 120, jpEn: 3.7, inPrice: 0.50,  outPrice: 2.00  },
  'mistralai/mistral-medium':       { tokPerSec: 100, jpEn: 3.8, inPrice: 0.40,  outPrice: 2.00  },
};

function metaLabel(id: string): string {
  const m = MODEL_META[id];
  if (!m) return id;
  const avgPrice = (m.inPrice + m.outPrice) / 2;
  const priceStr = avgPrice < 1 ? `$${avgPrice.toFixed(2)}` : `$${avgPrice.toFixed(2)}`;
  return `${id}  ·  ${m.tokPerSec} tok/s  ·  jp↔en ${m.jpEn.toFixed(1)}  ·  ${priceStr}/1M`;
}

export { metaLabel };

// Curated OpenRouter models known to produce quality JP/EN translation
// Ordered: fast/cheap first, then quality tier
export const OPENROUTER_ALLOWLIST: readonly string[] = [
  'google/gemini-2.5-flash',
  'openai/gpt-4.1-mini',
  'openai/gpt-4.1-nano',
  'anthropic/claude-haiku',
  'deepseek/deepseek-chat-v3',
  'qwen/qwen3-8b',
  'qwen/qwen3-14b',
  'meta-llama/llama-4-scout',
  'mistralai/mistral-small',
  'anthropic/claude-sonnet-4',
  'google/gemini-2.5-pro',
  'qwen/qwen3-32b',
  'meta-llama/llama-4-maverick',
  'mistralai/mistral-medium',
];
