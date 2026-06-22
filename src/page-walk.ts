// Pure page-walk helpers for hime — no Chrome API imports.
import type { TranslationConfig } from './types.js';
import { stripWrappers } from './output.js';
import { getFormalityInstruction } from './providers/prompt.js';

// key → text. On a request, values are source text; on a reply, translated text.
export type PageBatch = Record<string, string>;

/**
 * Non-translatable element tag names (UPPERCASE), per RESEARCH A3 / D-03 / PAGE-02.
 * Subtrees rooted at these elements are pruned by the walk so their text is never
 * collected (code/preformatted/script/style/inline-SVG/MathML/head metadata).
 * Form inputs (<input>/<textarea>) carry no child text nodes; <textarea> is listed
 * defensively. Kept in sync with the mirrored copy in content.ts (classic-script law).
 */
export const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'CODE',
  'PRE',
  'TEXTAREA',
  'TITLE',
  'TEMPLATE',
  'SVG',
  'MATH',
  'HEAD',
]);

/**
 * True when an element's tag is translatable (case-insensitive).
 * `isTranslatableTag('SCRIPT')` / `isTranslatableTag('pre')` → false;
 * `isTranslatableTag('P')` → true.
 */
export function isTranslatableTag(tagName: string): boolean {
  return !SKIP_TAGS.has(tagName.toUpperCase());
}

/**
 * TEST-ONLY recursive walk used by the node harness (linkedom-safe).
 *
 * Returns the visible Text nodes under `root` in document order, omitting
 * whitespace-only nodes and skipping any subtree rooted at a SKIP_TAGS element
 * or an element for which the injected `isEditable` predicate returns true
 * (the contenteditable skip — PAGE-02).
 *
 * content.ts uses the browser-native `document.createTreeWalker` instead (linkedom's
 * createTreeWalker returns nothing under an acceptNode filter — RESEARCH Pitfall 3),
 * but mirrors this exact decision logic. Keep both in sync (classic-script law).
 */
export function collectTextNodesRecursive(root: Node, isEditable: (el: Element) => boolean): Node[] {
  const out: Node[] = [];
  const walk = (node: Node): void => {
    for (const c of Array.from(node.childNodes)) {
      if (c.nodeType === 3) {
        // Text node — keep only non-whitespace-only content.
        if ((c.nodeValue ?? '').trim()) out.push(c);
      } else if (c.nodeType === 1) {
        const el = c as Element;
        if (SKIP_TAGS.has(el.tagName)) continue; // prune skip subtree
        if (isEditable(el)) continue; // prune contenteditable subtree (PAGE-02)
        walk(c);
      }
    }
  };
  walk(root);
  return out;
}

// Per-chunk character budget. Larger = fewer LLM calls/cheaper but bigger failure
// blast-radius and 8s-timeout risk on a single chunk; smaller = more resilient,
// more calls. 4000 is a conservative middle ground — tune as real pages dictate.
export const PAGE_CHUNK_MAX_CHARS = 4000;
// Max simultaneous translatePageBatch chunk calls so a 500-node page does not fire
// dozens of LLM requests at once. Mirrors progressive-guard's concurrency cap — tune.
export const PAGE_CONCURRENCY_CAP = 2;

/**
 * Group node-text indices into chunks under a character budget (PAGE-04).
 *
 * Flushes the current chunk before adding the next item when doing so would exceed
 * `maxChars` AND the current chunk is non-empty — so an oversized lone node still
 * gets its own chunk (never silently dropped, never merged past budget unless it is
 * itself the only thing in the chunk). Returns arrays of indices into `texts`.
 */
export function chunkByBudget(texts: string[], maxChars = PAGE_CHUNK_MAX_CHARS): number[][] {
  const chunks: number[][] = [];
  let cur: number[] = [];
  let size = 0;
  for (let i = 0; i < texts.length; i++) {
    const len = texts[i].length;
    if (cur.length && size + len > maxChars) {
      chunks.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(i);
    size += len;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

/**
 * Build the system prompt for a page-batch translation request.
 *
 * Mirrors buildBatchTranslatePrompt (translate-batch.ts) but for a FLAT
 * `{"0":"text","1":"text",...}` shape — plain strings, no { t, d }. Instructs
 * strict JSON output (no markdown, no code fences) so parsePageBatchReply can
 * parse it. customPrompt is deliberately omitted on the batch path (RESEARCH Open Q3).
 */
export function buildPageBatchPrompt(config: TranslationConfig): string {
  const formalityInstruction = getFormalityInstruction(config.formality);
  return [
    `You are a translation engine. Translate each value to ${config.targetLanguage}.`,
    `Input shape: {"0":<text>, "1":<text>, ...} — each value is a plain string.`,
    `Return ONLY a valid JSON object with the same keys — no explanation, no markdown, no code fences.`,
    `Translate each value; preserve the exact same keys; do not add or remove keys.`,
    formalityInstruction,
  ]
    .join('\n')
    .trim();
}

/**
 * Parse a raw LLM page-batch reply into a PageBatch map.
 *
 * CLONED from parseBatchReply (translate-batch.ts) — the security-critical contract:
 * - Two-attempt parse: stripWrappers first, then raw.trim() fallback.
 * - Non-JSON, null, or JSON-array input returns {} (whole-chunk raw fallback).
 * - Iterates `inputKeys` ONLY — never the parsed object's keys — to block key
 *   injection (XLT-03 / T-15-01). A key the model invented (e.g. 'evil', '__proto__')
 *   is never read.
 * - Per-key: included only when parsed[key] is a string. Missing/non-string keys are
 *   omitted so the caller falls back to the source text for those nodes.
 */
export function parsePageBatchReply(raw: string, inputKeys: string[]): PageBatch {
  let parsed: unknown;

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

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }

  const obj = parsed as Record<string, unknown>;
  const result: PageBatch = {};

  // Iterate inputKeys only — never the parsed object's keys (XLT-03 / T-15-01).
  for (const key of inputKeys) {
    const entry = obj[key];
    if (typeof entry === 'string') {
      result[key] = entry;
    }
    // Missing or non-string key: omit; caller keeps the source text.
  }

  return result;
}

/**
 * Once-only original capture for the restore/toggle store (PAGE-03, Pitfall 7).
 *
 * Sets `original` for `key` ONLY when the key is absent, so re-running translate while
 * already translated never overwrites the true original with an already-swapped value.
 * The first capture wins; `translated` starts empty and is filled when a translation
 * lands. In the pure/test world `store` is a plain Map; content.ts uses a WeakMap keyed
 * by the live Text node (WeakMaps are not enumerable — same once-only guard applies).
 */
export function captureOriginal(
  store: Map<string, { original: string; translated: string }>,
  key: string,
  current: string,
): void {
  if (!store.has(key)) {
    store.set(key, { original: current, translated: '' });
  }
}

/**
 * Failed-node retry contract (D-04).
 *
 * Returns the failed keys as an array ready to re-chunk; the CALLER clears the set
 * after a successful retry (entries are removed on success, re-added on a fresh
 * failure). Returning a snapshot + leaving the clear to the caller keeps the set
 * authoritative across overlapping retries.
 */
export function selectFailedRetry(failed: Set<string>): string[] {
  return [...failed];
}
