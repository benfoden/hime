// Pure query-translation config builder for hime — no Chrome API imports.
// D-02: explicit-direction contract — source and target are taken verbatim from
// the caller and NEVER auto-flipped by detecting Japanese characters in any text.
// This intentionally does NOT replicate the jpPattern flip in background.translateText.
import type { TranslationConfig } from './types.js';

/**
 * Build an explicit-direction TranslationConfig for query-before-search translation.
 *
 * Explicit-direction contract (D-02):
 *   - sourceLanguage and targetLanguage are taken verbatim from the arguments.
 *   - No jpPattern detection, no source/target swap.
 *   - No customPrompt — query search uses neutral translation (mirrors batch-path omission).
 *
 * @param sourceLanguage  Human-readable source language name (e.g. 'English').
 * @param targetLanguage  Human-readable target language name (e.g. 'Japanese').
 * @param formality       Formality level passed through from user settings.
 * @returns               A TranslationConfig without customPrompt (explicit direction only).
 */
export function buildQueryTranslateConfig(
  sourceLanguage: string,
  targetLanguage: string,
  formality: TranslationConfig['formality'],
): TranslationConfig {
  return { sourceLanguage, targetLanguage, formality };
}
