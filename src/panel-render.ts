// DOM-agnostic side-panel renderer for hime — Phase 12 (image OCR pipeline).
//
// The module references NO global document/window/location.
// The Document is always passed in as a parameter so both the browser page
// (window.document) and the node test (linkedom) can drive the same code.
//
// XSS contract (IMG-02): every OCR'd / translated string is assigned via
// textContent only — NEVER innerHTML. The thumbnail is set via img.src. This is
// the structural guarantee; no sanitizer library is needed.
//
// Structural clone of serp-render.ts. The one deliberate divergence is D-01:
// the panel ACCUMULATES entries newest-first (prepend), it does not replace.

import type { ImageState, ImageEntry } from './types.js';

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

/**
 * Render the given ImageState into mount, clearing any previous render first.
 * Used on panel open / rebuild from storage.session. A SINGLE incoming result
 * must go through prependEntry (not renderPanel) to preserve D-01 accumulation.
 *
 * @param state - The display state to render.
 * @param doc   - The Document to use for element creation (injected — never the global).
 * @param mount - The container element to render into.
 */
export function renderPanel(state: ImageState, doc: Document, mount: HTMLElement): void {
  mount.replaceChildren();
  switch (state.kind) {
    case 'empty':
      mount.appendChild(emptyNotice(doc));
      break;
    case 'list':
      // entries are already newest-first (D-01) — render top-to-bottom verbatim.
      state.entries.forEach(entry => mount.appendChild(entryEl(doc, entry)));
      break;
    default: {
      // Exhaustiveness check — TypeScript will error if a case is missing.
      const _never: never = state;
      void _never;
    }
  }
}

/**
 * Add (or update) a single entry at the TOP of the list (D-01) without wiping
 * the existing entries. Used on each incoming worker push and to swap a skeleton
 * for its filled result. If an entry with the same id already exists (a skeleton
 * being filled), replace that node in place instead of duplicating.
 *
 * @param entry - The entry to prepend or swap in.
 * @param doc   - The Document to use for element creation (injected).
 * @param mount - The container element holding the entry list.
 */
export function prependEntry(entry: ImageEntry, doc: Document, mount: HTMLElement): void {
  const node = entryEl(doc, entry);
  const existing = mount.querySelector(`[data-entry-id="${cssEscape(entry.id)}"]`);
  if (existing) {
    existing.replaceWith(node);
    return;
  }
  mount.prepend(node);
}

// ----------------------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------------------

/** Create an element, set className and/or textContent. Never innerHTML. */
function el(
  doc: Document,
  tag: string,
  opts: { text?: string; className?: string } = {},
): HTMLElement {
  const node = doc.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.text !== undefined) node.textContent = opts.text;
  return node;
}

/** Escape an id for use inside a [data-entry-id="..."] attribute selector. */
function cssEscape(id: string): string {
  return id.replace(/["\\]/g, '\\$&');
}

/** Thumbnail <img>, src set verbatim, alt='' (faviconEl precedent serp-render.ts:91-108). */
function thumbnailEl(doc: Document, thumbnailUrl: string): HTMLElement {
  const img = doc.createElement('img') as HTMLImageElement;
  img.src = thumbnailUrl;
  img.className = 'panel-thumb';
  img.alt = '';
  return img as unknown as HTMLElement;
}

/** Build a single session-list entry node for any ImageEntry kind (IMG-05). */
function entryEl(doc: Document, entry: ImageEntry): HTMLElement {
  switch (entry.kind) {
    case 'loading': {
      const row = el(doc, 'div', { className: 'panel-entry panel-loading' });
      row.setAttribute('data-entry-id', entry.id);
      // D-04: [hime N] chip correlates the row to its on-image badge (guard: legacy entries may lack himeNum).
      if (entry.himeNum != null) {
        row.appendChild(el(doc, 'span', { text: `[hime ${entry.himeNum}]`, className: 'panel-num' }));
      }
      if (entry.thumbnailUrl) row.appendChild(thumbnailEl(doc, entry.thumbnailUrl));
      row.appendChild(el(doc, 'div', { className: 'panel-skeleton' }));
      return row;
    }
    case 'populated': {
      const row = el(doc, 'div', { className: 'panel-entry' });
      row.setAttribute('data-entry-id', entry.id);

      // D-04: [hime N] chip — first in DOM order, guarded for legacy entries.
      if (entry.himeNum != null) {
        row.appendChild(el(doc, 'span', { text: `[hime ${entry.himeNum}]`, className: 'panel-num' }));
      }

      // Thumbnail (optional) — first in DOM order (D-02).
      if (entry.thumbnailUrl) row.appendChild(thumbnailEl(doc, entry.thumbnailUrl));

      // Direction line: "Detected: X → Y" (IMG-03). Strings supplied verbatim.
      row.appendChild(
        el(doc, 'div', {
          text: `Detected: ${entry.result.detectedLang} → ${entry.target ?? ''}`.trimEnd(),
          className: 'panel-direction',
        }),
      );

      // Translation ABOVE original (D-02); both pre-wrap so breaks survive (IMG-03).
      row.appendChild(
        el(doc, 'div', { text: entry.result.translatedText, className: 'panel-translation panel-text pre-wrap' }),
      );

      // D-01 (IMG-06): Copy button — carries the translated text on data-copy so the
      // browser-only click handler (sidepanel.ts) can read it without navigator here.
      // No click listener attached; panel-render.ts must stay node-testable.
      const copyBtn = el(doc, 'button', { text: 'Copy', className: 'panel-copy' });
      copyBtn.setAttribute('data-copy', entry.result.translatedText);
      copyBtn.setAttribute('data-copy-kind', 'translation');
      row.appendChild(copyBtn);

      // D-01: "show original" toggle — reveals the collapsed original block on click
      // (wired in sidepanel.ts). No click listener here.
      row.appendChild(el(doc, 'button', { text: 'show original', className: 'panel-show-original' }));

      // D-01: Original block — collapsed by default; revealed by the toggle.
      // Carries its own copy node so the user can copy the source text separately.
      const originalBlock = el(doc, 'div', { className: 'panel-original panel-text pre-wrap is-collapsed' });
      originalBlock.textContent = entry.result.originalText;
      const originalCopyBtn = el(doc, 'button', { text: 'Copy original', className: 'panel-copy panel-copy-original' });
      originalCopyBtn.setAttribute('data-copy', entry.result.originalText);
      originalCopyBtn.setAttribute('data-copy-kind', 'original');
      originalBlock.appendChild(originalCopyBtn);
      row.appendChild(originalBlock);

      // Low-confidence amber badge (D-04) — a populated entry carrying a badge.
      if (entry.lowConfidence) {
        row.appendChild(el(doc, 'span', { text: 'low confidence', className: 'panel-badge low-confidence amber' }));
      }

      // D-03: per-result CJK/vertical quality note — only on flagged entries (no standing disclaimer).
      if (entry.verticalOrCjk) {
        row.appendChild(el(doc, 'div', { text: 'vertical/CJK text — OCR may be imperfect', className: 'panel-note' }));
      }

      return row;
    }
    case 'no-text': {
      const row = el(doc, 'div', { className: 'panel-entry panel-no-text' });
      row.setAttribute('data-entry-id', entry.id);
      // D-04: [hime N] chip — guarded for legacy entries.
      if (entry.himeNum != null) {
        row.appendChild(el(doc, 'span', { text: `[hime ${entry.himeNum}]`, className: 'panel-num' }));
      }
      if (entry.thumbnailUrl) row.appendChild(thumbnailEl(doc, entry.thumbnailUrl));
      row.appendChild(el(doc, 'div', { text: 'No text found in image.', className: 'panel-message' }));
      return row;
    }
    case 'error': {
      const row = el(doc, 'div', { className: 'panel-entry panel-error' });
      row.setAttribute('data-entry-id', entry.id);
      row.setAttribute('data-error-kind', entry.errorKind);
      // D-04: [hime N] chip — guarded for legacy entries.
      if (entry.himeNum != null) {
        row.appendChild(el(doc, 'span', { text: `[hime ${entry.himeNum}]`, className: 'panel-num' }));
      }
      if (entry.thumbnailUrl) row.appendChild(thumbnailEl(doc, entry.thumbnailUrl));
      // D-02: entry.message is the worker's reason-naming string (classified error from 14-01).
      row.appendChild(el(doc, 'div', { text: entry.message, className: 'panel-message' }));
      return row;
    }
    default: {
      // Exhaustiveness check — TypeScript will error if an entry kind is missing.
      const _never: never = entry;
      void _never;
      // Unreachable; satisfies the return type for non-exhaustive runtime input.
      throw new Error('unreachable: unknown ImageEntry kind');
    }
  }
}

/** Empty-state notice — first-open zero-state. */
function emptyNotice(doc: Document): HTMLElement {
  return el(doc, 'div', {
    text: 'Right-click an image and choose “Translate image with hime”.',
    className: 'panel-empty',
  });
}
