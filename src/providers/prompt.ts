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
