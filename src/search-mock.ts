// Shared mock fixtures for all 7 SERP display states + XSS probe.
// Imported by both the search page entry (search.ts, Plan 02) and the
// node test harness (test/serp.mjs) so both exercise the same fixtures.

import type { SerpState, SerpStateKey } from './serp-render.js';
import type { SearchResult } from './types.js';

// Re-export SerpStateKey so importers don't need to reach into serp-render directly.
export type { SerpStateKey };

// ----------------------------------------------------------------------------
// XSS probe (D-02) — description contains both <script> and <strong> markup.
// No faviconUrl so the letter-tile fallback is also exercised.
// ----------------------------------------------------------------------------

export const XSS_PROBE: SearchResult = {
  title: 'Totally normal result',
  url: 'https://example.com/path?q=1',
  description: 'safe text <strong>bold</strong> <script>alert(1)</script> trailing',
  hostname: 'example.com',
  // intentionally no faviconUrl — exercises letter-tile fallback (D-01)
};

// ----------------------------------------------------------------------------
// Normal result rows used in the populated mock
// ----------------------------------------------------------------------------

const RESULT_WITH_FAVICON: SearchResult = {
  title: 'Wikipedia: Ramen',
  url: 'https://en.wikipedia.org/wiki/Ramen',
  description: 'Ramen is a Japanese noodle dish <strong>popular</strong> worldwide.',
  hostname: 'en.wikipedia.org',
  faviconUrl: 'https://en.wikipedia.org/static/favicon/wikipedia.ico',
};

const RESULT_PLAIN: SearchResult = {
  title: 'Ramen Guide — Best Spots in Tokyo',
  url: 'https://tokyofoodguide.example.net/ramen',
  description: 'Our curated list of the best ramen restaurants in Tokyo.',
  hostname: 'tokyofoodguide.example.net',
};

// ----------------------------------------------------------------------------
// MOCKS: Record<SerpStateKey, SerpState>
// 7 keys: populated / skeleton / empty / auth / network / quota / unknown
// ----------------------------------------------------------------------------

export const MOCKS: Record<SerpStateKey, SerpState> = {
  /** Default state — three rows including the XSS probe. */
  populated: {
    kind: 'populated',
    results: [RESULT_WITH_FAVICON, XSS_PROBE, RESULT_PLAIN],
  },

  /** Loading / skeleton shimmer. */
  skeleton: {
    kind: 'loading',
  },

  /** No results returned. */
  empty: {
    kind: 'empty',
  },

  /** Auth failure: Brave key invalid or missing. */
  auth: {
    kind: 'error',
    errorKind: 'auth',
    message: 'Brave key invalid or missing — check it in options',
  },

  /** Network failure. */
  network: {
    kind: 'error',
    errorKind: 'network',
    message: 'Network failure — could not reach Brave Search',
  },

  /**
   * Quota exhausted (Brave 429).
   * MUST contain the literal phrase "search quota exceeded" (SERP-05).
   * No auto-retry copy per D-03 / SERP-05.
   */
  quota: {
    kind: 'error',
    errorKind: 'search_quota',
    message: 'Brave search quota exceeded — check your plan',
  },

  /** Unexpected / unclassified error. */
  unknown: {
    kind: 'error',
    errorKind: 'unknown',
    message: 'Something went wrong — please try again',
  },
};

// ----------------------------------------------------------------------------
// Default state for the search page (no ?state= param)
// ----------------------------------------------------------------------------

export const DEFAULT_STATE: SerpState = MOCKS.populated;
