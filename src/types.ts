// Types for hime Chrome extension

export interface TranslationConfig {
  sourceLanguage: string;
  targetLanguage: string;
  formality: 'auto' | 'casual' | 'polite' | 'formal';
  customPrompt?: string;
}

export interface ProviderConfig {
  provider: 'openai' | 'gemini';
  apiKey: string;
  model: string;
  storageMode: 'persistent' | 'session';
}

export interface Settings extends TranslationConfig, ProviderConfig {
  composeHotkey: string;
  yoloHotkey: string;
  swapHotkey: string;
}

export interface TranslationRequest {
  text: string;
  config: TranslationConfig;
}

export interface TranslationResponse {
  translatedText: string;
  error?: string;
}

export interface TranslationProvider {
  name: string;
  translate(text: string, config: TranslationConfig, apiKey: string, model: string): Promise<string>;
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
  | 'directionSwapped';

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

export interface SetBadgeMessage extends Message {
  type: 'setBadge';
  payload: {
    text: string;
    color?: string;
  };
}

// Default settings
export const DEFAULT_SETTINGS: Settings = {
  provider: 'openai',
  apiKey: '',
  model: 'gpt-5-mini',
  storageMode: 'persistent',
  sourceLanguage: 'English',
  targetLanguage: 'Japanese',
  formality: 'auto',
  composeHotkey: 'Ctrl+Shift+T',
  yoloHotkey: 'Ctrl+Shift+Y',
  swapHotkey: 'Ctrl+Shift+S',
};

// Available models per provider
export const PROVIDER_MODELS = {
  openai: ['gpt-5-mini', 'gpt-5-nano'],
  gemini: ['gemini-2.5-flash'],
} as const;
