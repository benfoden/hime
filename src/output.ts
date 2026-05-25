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
  // Pattern matches phrases like:
  //   "Translation:", "Here is the translation:", "Here's the translation:",
  //   "Translated text:", "Output:"
  // Then takes what comes after the colon (same line or next line).
  const metaLinePattern = /^(?:here(?:'s| is)[\s\w]*|translation(?:\s+text)?|translated(?:\s+text)?|output)\s*:/i;

  // Find where the colon is (end of the meta prefix)
  const colonIdx = s.indexOf(':');
  if (colonIdx !== -1) {
    const prefix = s.slice(0, colonIdx);
    // Check the prefix doesn't span multiple lines (it should be a single meta line)
    if (!prefix.includes('\n') && metaLinePattern.test(prefix + ':')) {
      const afterColon = s.slice(colonIdx + 1);
      // Content may be on same line ("Translation: こんにちは")
      // or on next line ("Here is the translation:\nこんにちは")
      const trimmed = afterColon.trim();
      if (trimmed.length > 0) {
        s = trimmed;
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
