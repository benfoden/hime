// Batch translation pipeline for hime — no Chrome API imports.
import type { TranslationConfig, SearchResult } from './types.js';
import { stripWrappers } from './output.js';
import { getFormalityInstruction } from './providers/prompt.js';

export type BatchItem = { t: string; d: string };
export type BatchTranslations = Record<string, BatchItem>;

/**
 * Build a keyed-JSON batch payload from an array of SearchResults.
 * Payload keys are "0".."n-1"; each value contains ONLY { t, d } — title and
 * description. url/hostname/faviconUrl are NEVER included (XLT-04 / T-10-01).
 */
export function buildBatchPayload(results: SearchResult[]): Record<string, BatchItem> {
  const payload: Record<string, BatchItem> = {};
  for (let i = 0; i < results.length; i++) {
    payload[String(i)] = { t: results[i].title, d: results[i].description };
  }
  return payload;
}

/**
 * Build the system prompt for a batch translation request.
 * Uses the same array-join shape as buildSystemPrompt but instructs strict JSON
 * output — never includes "Output ONLY the translated text" (conflicts with JSON).
 * customPrompt is deliberately omitted on the batch path (RESEARCH Open Q3).
 */
export function buildBatchTranslatePrompt(config: TranslationConfig): string {
  const formalityInstruction = getFormalityInstruction(config.formality);
  return [
    `You are a translation engine. Translate each item to ${config.targetLanguage}.`,
    `Input shape: {"0":{"t":<title>,"d":<description>}, "1":{...}, ...}`,
    `Return ONLY a valid JSON object with the same keys and shape — no explanation, no markdown, no code fences.`,
    `Translate each t (title) and d (description); preserve the exact same keys; do not add or remove keys.`,
    formalityInstruction,
  ].join('\n').trim();
}

/**
 * Parse a raw LLM batch reply into a BatchTranslations map.
 *
 * - Two-attempt parse: stripWrappers first, then raw.trim() fallback.
 * - Non-JSON or JSON-array input returns {} (whole-batch raw fallback, XLT-03).
 * - Iterates inputKeys (NOT the parsed object keys) to prevent key injection (XLT-03 / T-10-03).
 * - Per-key: only included when parsed[key] is a non-null object with string t AND string d.
 *   Missing/malformed keys are omitted so the caller falls back to raw (XLT-03).
 */
export function parseBatchReply(raw: string, inputKeys: string[]): BatchTranslations {
  let parsed: unknown;

  // Two-attempt parse: stripWrappers removes code fences and common wrappers
  try {
    parsed = JSON.parse(stripWrappers(raw));
  } catch {
    // fall through to raw fallback
  }
  if (parsed === undefined) {
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      return {};
    }
  }

  // Must be a non-null, non-Array object
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }

  const obj = parsed as Record<string, unknown>;
  const result: BatchTranslations = {};

  // Iterate inputKeys only — never the parsed object's keys (XLT-03 / T-10-03)
  for (const key of inputKeys) {
    const entry = obj[key];
    if (
      entry !== null &&
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      typeof (entry as Record<string, unknown>).t === 'string' &&
      typeof (entry as Record<string, unknown>).d === 'string'
    ) {
      result[key] = {
        t: (entry as Record<string, unknown>).t as string,
        d: (entry as Record<string, unknown>).d as string,
      };
    }
    // Missing or malformed key: omit from result; caller falls back to raw
  }

  return result;
}

/**
 * Merge translated titles/descriptions onto raw SearchResults.
 *
 * Returns a NEW SearchResult[] — never mutates input.
 * For each result at index i:
 *   - If translations[String(i)] exists: overlay title=t, description=d
 *   - Otherwise: carry the raw result unchanged
 * url/hostname/faviconUrl are always carried verbatim via spread (XLT-05 / D-05).
 */
export function mergeTranslations(raw: SearchResult[], translations: BatchTranslations): SearchResult[] {
  return raw.map((r, i) => {
    const t = translations[String(i)];
    return t ? { ...r, title: t.t, description: t.d } : r;
  });
}
