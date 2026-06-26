// DOM-agnostic SERP renderer for hime — Phase 9.
//
// The module references NO global document/window/location.
// The Document is always passed in as a parameter so both the browser page
// (window.document) and the node test (linkedom) can drive the same code.
//
// XSS contract (SERP-03): every Brave-derived string is assigned via
// textContent only — NEVER innerHTML. This is the structural guarantee;
// no sanitizer library is needed.

import type { SearchResult, ErrorKind } from './types.js';

// ----------------------------------------------------------------------------
// SerpState discriminated union (D-03)
// ----------------------------------------------------------------------------

export type SerpState =
  | { kind: 'loading' }
  // `translating: true` marks rows whose text is being back-translated — each row
  // gets the `serp-translating` class (a left→right colour wave over the text) until
  // the search page replaces its text in place. Omitted/false = settled rows.
  | { kind: 'populated'; results: SearchResult[]; translating?: boolean }
  | { kind: 'empty' }
  | { kind: 'error'; errorKind: ErrorKind; message: string };

// Export a type alias for the state keys used in MOCKS.
export type SerpStateKey = 'populated' | 'skeleton' | 'empty' | 'auth' | 'network' | 'quota' | 'unknown';

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

/**
 * Render the given SerpState into mount, clearing any previous render first.
 *
 * @param state - The display state to render.
 * @param doc   - The Document to use for element creation (injected — never the global).
 * @param mount - The container element to render into.
 */
export function renderSerp(state: SerpState, doc: Document, mount: HTMLElement): void {
  mount.replaceChildren();
  switch (state.kind) {
    case 'loading':
      mount.appendChild(skeletonList(doc));
      break;
    case 'populated':
      state.results.forEach(r => mount.appendChild(resultRow(doc, r, state.translating === true)));
      break;
    case 'empty':
      mount.appendChild(emptyNotice(doc));
      break;
    case 'error':
      mount.appendChild(errorNotice(doc, state));
      break;
    default: {
      // Exhaustiveness check — TypeScript will error if a case is missing.
      const _never: never = state;
      void _never;
    }
  }
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

/** Strip HTML tags textually for cosmetic display — safety still comes from textContent. */
function stripToText(html: string): string {
  // Remove tags textually with a regex (cosmetics only).
  // The downstream textContent assignment is the actual XSS guard.
  return html.replace(/<[^>]*>/g, '');
}

/** Deterministic hue from hostname — stable color per site, no randomness. */
function tileColor(hostname: string): string {
  let h = 0;
  for (let i = 0; i < hostname.length; i++) h = (h * 31 + hostname.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 55% 45%)`;
}

/** Favicon element: img if faviconUrl provided, else a deterministic CSS letter-tile (D-01). */
function faviconEl(doc: Document, r: SearchResult): HTMLElement {
  if (r.faviconUrl) {
    const img = doc.createElement('img') as HTMLImageElement;
    img.src = r.faviconUrl;
    img.className = 'serp-favicon';
    img.width = 16;
    img.height = 16;
    img.alt = '';
    return img as unknown as HTMLElement;
  }
  // No faviconUrl — deterministic letter-tile, zero per-row network (D-01).
  const tile = el(doc, 'span', {
    text: (r.hostname[0] ?? '?').toUpperCase(),
    className: 'serp-favicon serp-tile',
  });
  tile.style.backgroundColor = tileColor(r.hostname);
  return tile;
}

/** Build a single result row (.serp-row) for a SearchResult. */
function resultRow(doc: Document, r: SearchResult, translating = false): HTMLElement {
  const row = el(doc, 'div', { className: translating ? 'serp-row serp-translating' : 'serp-row' });

  // Head: favicon + hostname
  const head = el(doc, 'div', { className: 'serp-head' });
  head.appendChild(faviconEl(doc, r));
  head.appendChild(el(doc, 'span', { text: r.hostname, className: 'serp-host' }));
  row.appendChild(head);

  // Title anchor — href assigned verbatim (SERP-02, no encodeURI/new URL/replace)
  const a = doc.createElement('a');
  a.href = r.url;
  a.textContent = r.title;
  a.className = 'serp-title';
  a.rel = 'noopener noreferrer';
  row.appendChild(a);

  // Snippet — textContent only (SERP-03)
  row.appendChild(el(doc, 'p', { text: stripToText(r.description), className: 'serp-snippet' }));

  return row;
}

/** Skeleton list for the loading state — ~5 shimmer rows (SERP-04). */
function skeletonList(doc: Document): HTMLElement {
  const container = el(doc, 'div', { className: 'serp-skeleton-list' });
  for (let i = 0; i < 5; i++) {
    const row = el(doc, 'div', { className: 'serp-skeleton' });
    row.appendChild(el(doc, 'div', { className: 'bar bar-head' }));
    row.appendChild(el(doc, 'div', { className: 'bar bar-title' }));
    row.appendChild(el(doc, 'div', { className: 'bar bar-snippet' }));
    container.appendChild(row);
  }
  return container;
}

/** Empty-results notice (SERP-05). */
function emptyNotice(doc: Document): HTMLElement {
  return el(doc, 'div', { text: 'No results found.', className: 'serp-empty' });
}

/** Error notice (SERP-05). No setTimeout/setInterval — no auto-retry. */
function errorNotice(
  doc: Document,
  state: { kind: 'error'; errorKind: ErrorKind; message: string },
): HTMLElement {
  const notice = el(doc, 'div', { text: state.message, className: 'serp-error' });
  notice.setAttribute('data-error-kind', state.errorKind);
  return notice;
}
