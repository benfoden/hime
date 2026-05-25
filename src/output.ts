// Output sanitization for hime — no Chrome API imports.

/**
 * Strip common LLM output wrappers from a translated string.
 *
 * Applied in order:
 *  1. Trim whitespace
 *  2. Strip markdown code fences (``` ... ```)
 *  3. Strip a single leading meta-commentary line
 *     (e.g. "Here is the translation:", "Translation:", "Output:")
 *  4. Strip ONE matching pair of surrounding quote characters
 *     (" ", ' ', 「 」, " ")
 *  5. Final trim
 */
export function stripWrappers(raw: string): string {
  // Step 1: initial trim
  let s = raw.trim();

  // Step 2: markdown code fences
  // Matches ```[language-tag]\n...\n``` (language tag optional)
  const fenceMatch = s.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
  if (fenceMatch) {
    s = fenceMatch[1].trim();
  }

  // Step 3: leading meta-commentary line
  // Pattern: "here's|here is|translation|translated text|output" optionally followed by ":"
  // Two sub-cases:
  //   a) "Translation: こんにちは" — colon on same line, keep what's after the colon
  //   b) "Here is the translation:\nこんにちは" — remainder on next line
  const metaPattern = /^(here(?:'s| is)|translation(?:\s+text)?|translated text|output)\s*:?\s*/i;
  const colonSameLine = s.match(/^(here(?:'s| is)|translation(?:\s+text)?|translated text|output)\s*:[ \t]*(\S[\s\S]*)/i);
  if (colonSameLine) {
    // e.g. "Translation: こんにちは" → keep "こんにちは"
    s = colonSameLine[2].trim();
  } else {
    // e.g. "Here is the translation:\nこんにちは" → drop first line
    const newlineIdx = s.indexOf('\n');
    if (newlineIdx !== -1) {
      const firstLine = s.slice(0, newlineIdx);
      if (metaPattern.test(firstLine.trim())) {
        s = s.slice(newlineIdx + 1).trim();
      }
    }
  }

  // Step 4: strip ONE matching surrounding quote pair
  // Pairs: "" '' 「」 ""
  const pairs: [string, string][] = [
    ['"', '"'],
    ["'", "'"],
    ['「', '」'],
    ['“', '”'], // curly quotes " "
  ];
  for (const [open, close] of pairs) {
    if (s.startsWith(open) && s.endsWith(close) && s.length > open.length + close.length) {
      s = s.slice(open.length, s.length - close.length);
      break; // only strip one pair
    }
  }

  // Step 5: final trim
  return s.trim();
}
