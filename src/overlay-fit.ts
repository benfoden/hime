// Pure shrink-to-fit font-search for Phase 16 in-place image overlay translation.
// NO chrome.* and NO document references: this module is imported by the node test
// harness (test/overlay-fit.mjs). The canvas/measureText wiring stays in content.ts;
// only the SEARCH LOOP lives here (Pattern law).
//
// The `measure` callback is injected: (text, fontPx) => widthPx.
// In content.ts, it is:  (t, f) => { ctx.font = `${f}px sans-serif`; return ctx.measureText(t).width; }
// In the node test, it is a deterministic stub.  No canvas referenced here.

/**
 * Result of fitText().
 *
 * fontPx    — chosen font size in CSS pixels.
 * clamped   — true if even minFont overflows the box height (apply CSS line-clamp).
 * lines     — greedy-wrapped lines at the chosen font size.
 */
export interface FitResult {
  fontPx: number;
  clamped: boolean;
  lines: string[];
}

/** fitText options — all optional; defaults match the overlay palette. */
export interface FitTextOpts {
  /** Upper bound of the binary search (default: 28). */
  maxFont?: number;
  /** Lower bound / clamp floor (default: 9). */
  minFont?: number;
  /** CSS line-height multiplier (default: 1.2). */
  lineHeight?: number;
  /** Box padding (each side, px; default: 4). */
  pad?: number;
  /** When true, wrap text per-character instead of per-word (CJK). */
  cjk?: boolean;
}

/**
 * Greedy line-wrap `text` into lines that measure at most `maxWidth` pixels wide
 * at `fontPx`, using the injected `measure` callback.
 *
 * Wrap granularity:
 *   - cjk=false (default): split on whitespace — each token is a "word".
 *   - cjk=true:            split per-character — each character is a potential break.
 *
 * An oversized single unit (wider than maxWidth) is placed alone on its own line
 * rather than silently dropped, so no text is ever lost.
 *
 * @internal
 */
function wrapLines(
  text: string,
  fontPx: number,
  maxWidth: number,
  measure: (text: string, fontPx: number) => number,
  cjk: boolean,
): string[] {
  const tokens: string[] = cjk
    ? Array.from(text) // per-character
    : text.split(/\s+/).filter((w) => w.length > 0); // per-word

  const lines: string[] = [];
  let current = '';

  for (const token of tokens) {
    const candidate = current.length === 0 ? token : (cjk ? current + token : current + ' ' + token);
    if (measure(candidate, fontPx) <= maxWidth || current.length === 0) {
      // Fits (or it's the first token — must be placed somewhere regardless of width).
      current = candidate;
    } else {
      // Flush current line and start a new one.
      lines.push(current);
      current = token;
    }
  }
  if (current.length > 0) {
    lines.push(current);
  }
  return lines;
}

/**
 * Find the largest integer font size in [minFont, maxFont] at which `text`
 * fits inside a box of `boxW × boxH` pixels (each inset by `pad` on both sides),
 * using `measure` to determine rendered text width.
 *
 * Binary-searches fontPx. For each candidate, greedily wraps into lines that fit
 * `boxW - 2*pad` wide, then checks that `lines * fontPx * lineHeight <= boxH - 2*pad`.
 * The largest passing font is returned.
 *
 * If even `minFont` overflows the height, returns `{ fontPx: minFont, clamped: true, lines }`.
 * Apply `overflow:hidden` + `text-overflow:ellipsis` or CSS `-webkit-line-clamp` when
 * `clamped` is true (OVL-05 clamp contract — Threat T-16-03).
 *
 * @param text    The translated text to render.
 * @param boxW    Box width in CSS pixels (layout space, not font metrics).
 * @param boxH    Box height in CSS pixels.
 * @param measure Injected width callback: (text, fontPx) => widthPx.
 *                In content.ts: canvas ctx.measureText. In tests: a stub.
 * @param opts    Optional tuning (maxFont, minFont, lineHeight, pad, cjk).
 */
export function fitText(
  text: string,
  boxW: number,
  boxH: number,
  measure: (text: string, fontPx: number) => number,
  opts?: FitTextOpts,
): FitResult {
  const maxFont = opts?.maxFont ?? 28;
  const minFont = opts?.minFont ?? 9;
  const lineHeight = opts?.lineHeight ?? 1.2;
  const pad = opts?.pad ?? 4;
  const cjk = opts?.cjk ?? false;

  const budgetW = boxW - 2 * pad;
  const budgetH = boxH - 2 * pad;

  /**
   * Returns true when `text` fits at `fontPx`.
   * Also yields the wrapped lines for the winning font to avoid re-wrapping.
   */
  const tryFont = (fontPx: number): { fits: boolean; lines: string[] } => {
    const lines = wrapLines(text, fontPx, budgetW, measure, cjk);
    const totalH = lines.length * fontPx * lineHeight;
    return { fits: totalH <= budgetH, lines };
  };

  // Binary search: find the largest fontPx in [minFont, maxFont] that fits.
  let low = minFont;
  let high = maxFont;
  let best: { fontPx: number; lines: string[] } | null = null;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const { fits, lines } = tryFont(mid);
    if (fits) {
      best = { fontPx: mid, lines };
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (best !== null) {
    return { fontPx: best.fontPx, clamped: false, lines: best.lines };
  }

  // Even minFont overflows: return minFont with clamped=true.
  const { lines } = tryFont(minFont);
  return { fontPx: minFont, clamped: true, lines };
}
