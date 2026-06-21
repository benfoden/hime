// disclosure.ts — Pure disclosure-line text builder for hime search page.
// No Chrome API imports; no browser globals. Mirror translate-batch.ts pattern.
//
// Builds the read-only disclosure string shown above SERP results.
// The caller MUST assign the result via textContent only (never innerHTML) — XSS-safe.
// D-05: translated → "Searching in {target} for: {translated} ({source}: {original})"
// D-06: direct    → "Searching for: {original}"
// D-10: failed    → "Searching for: {original} — translation unavailable, searched as typed"

/**
 * Discriminated union for disclosure input.
 *
 * - 'translated': source != target, LLM translation succeeded (D-05)
 * - 'direct':    source == target, no translation attempted (D-06)
 * - 'failed':    translation was attempted but failed/timed out (D-10)
 */
export type DisclosureInput =
  | {
      kind: 'translated';
      sourceLanguage: string;
      targetLanguage: string;
      originalQuery: string;
      translatedQuery: string;
    }
  | {
      kind: 'direct';
      originalQuery: string;
    }
  | {
      kind: 'failed';
      originalQuery: string;
    };

/**
 * Build the read-only disclosure line text for the given input.
 *
 * Returns plain text only — never markup or HTML. The caller assigns
 * the result via `element.textContent` (XSS-safe; D-07).
 * Never throws on empty strings.
 */
export function buildDisclosureText(input: DisclosureInput): string {
  switch (input.kind) {
    case 'translated':
      // D-05: "Searching in Japanese for: 検索 (English: search)"
      return `Searching in ${input.targetLanguage} for: ${input.translatedQuery} (${input.sourceLanguage}: ${input.originalQuery})`;

    case 'direct':
      // D-06: "Searching for: ramen" — no "in {language}" framing
      return `Searching for: ${input.originalQuery}`;

    case 'failed':
      // D-10: subtle degraded note — translation unavailable
      return `Searching for: ${input.originalQuery} — translation unavailable, searched as typed`;

    default: {
      // Exhaustiveness check — TypeScript will error if a new kind is added without handling it.
      const _never: never = input;
      void _never;
      return '';
    }
  }
}
