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
  | 'translateBatch';

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
