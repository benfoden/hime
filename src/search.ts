// search.ts — Browser-only page entry for the hime SERP page.
//
// Reads the ?state= URL query param, looks up the matching mock from MOCKS
// (default: DEFAULT_STATE / populated), and calls renderSerp with the real
// browser document and the #results mount element.
//
// IMPORTANT: This file references browser globals (location, document) and
// is intentionally NOT imported by the node test harness. The unit-under-test
// is serp-render.ts (DOM-agnostic). See RESEARCH Pitfall 1 + Recommended
// Project Structure.
//
// Phase 11 replaces the ?state= mock driver with the live worker round-trip
// (search-translated response) behind the same renderSerp seam — no renderer change needed.

import { MOCKS, DEFAULT_STATE } from './search-mock.js';
import { renderSerp } from './serp-render.js';

const key = new URLSearchParams(location.search).get('state') ?? '';
const state = (MOCKS as Record<string, typeof DEFAULT_STATE>)[key] ?? DEFAULT_STATE;

const mount = document.getElementById('results') as HTMLElement | null;
if (mount) {
  renderSerp(state, document, mount);
}
