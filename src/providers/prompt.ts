// Shared prompt builder for hime translation providers — no Chrome API imports.
import type { TranslationConfig } from '../types.js';

/**
 * Build the system prompt for a translation request.
 * Used by both openai.ts and gemini.ts to prevent drift.
 */
export function buildSystemPrompt(config: TranslationConfig): string {
  const formalityInstruction = getFormalityInstruction(config.formality);
  return [
    `You are a translation engine. Translate the following text to ${config.targetLanguage}.`,
    `Output ONLY the translated text — no explanations, no quotes, no markdown.`,
    `Use natural, native-sounding phrasing that a native speaker would actually use.`,
    formalityInstruction,
    config.customPrompt || '',
  ].join('\n').trim();
}

/**
 * Build the system prompt for an inline text prediction request.
 * No config parameter — LANG-02: completion is in the field's own language,
 * independent of the translate target-language setting.
 */
export function buildPredictionPrompt(): string {
  return [
    'You are an inline text completion engine.',
    'Continue the text with 2 to 3 words only.',
    'Match the exact language and register of the input.',
    'Output ONLY the continuation words — no explanation, no punctuation at the start, no quotes.',
    'If the text ends mid-word, complete that word as one of your words.',
  ].join('\n');
}

function getFormalityInstruction(formality: string): string {
  switch (formality) {
    case 'casual':
      return 'Use casual, informal language (e.g. for Japanese: タメ口、plain form).';
    case 'polite':
      return 'Use polite, standard language (e.g. for Japanese: です/ます form).';
    case 'formal':
      return 'Use formal, respectful language (e.g. for Japanese: 敬語/keigo).';
    case 'auto':
    default:
      return `Detect the register of the input and mirror it in the output:
- Casual / slang / emoji input (e.g. "hey what's up") -> casual output (for Japanese: タメ口 / plain form).
- Neutral conversational input -> polite output (for Japanese: です/ます form).
- Business / formal / deferential input (e.g. "Thank you for your help with this matter") -> polite-to-formal output (for Japanese: 敬語 where natural).
When in doubt between two registers, choose the more polite one.`;
  }
}
