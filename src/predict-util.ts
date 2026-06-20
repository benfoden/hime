// Prediction text sanitation for hime — no Chrome API imports.

/**
 * Sanitize a raw suggestion string from a prediction provider.
 *
 * - Truncates at first newline (suggestions are single inline fragments)
 * - Strips C0/C1 control characters (keeps printable + spaces)
 * - Trims surrounding whitespace
 */
export function sanitizeSuggestion(raw: string): string {
  if (!raw) return '';
  // Truncate at first newline (suggestions are single inline fragments)
  const firstLine = raw.split(/[\r\n]/)[0];
  // Strip C0/C1 control chars (U+0000–U+001F and U+007F–U+009F), keep printable + spaces
  // eslint-disable-next-line no-control-regex
  const cleaned = firstLine.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
  return cleaned.trim();
}
