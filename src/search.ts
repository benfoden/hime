// search.ts — Browser-only page entry for the hime SERP page.
//
// IMPORTANT: This file references browser globals (chrome.*, document, window)
// and is intentionally NOT imported by the node test harness. Unit-testable
// logic lives in DOM-agnostic modules: disclosure.ts, translate-batch.ts,
// serp-render.ts. See RESEARCH Pitfall 1 + Recommended Project Structure.
//
// Phase 11 replaces the ?state= mock driver with live worker round-trips:
//   1. User submits query → searchTranslated (worker translates + Brave-searches)
//   2. Disclosure line + skeleton appear (D-11: disclosure before skeleton)
//   3. Raw Brave results render (renderSerp populated)
//   4. translateBatch overlay translates titles/snippets BACK to the reader's
//      source language (XLT-05 page half) — gated by the results toggle.
//
// Results back-translation: when source != target, Brave results come back in
// the target language. The "Translate results to <source>" toggle (default on)
// overlays a translation back to the reader's source language so an English
// user can read Japanese results. Toggling re-applies from cache — no Brave
// re-fetch (raw + translated views are both cached per search).
//
// Re-submit re-runs the pipeline in place (D-09). A run counter guards against
// stale translateBatch overlays clobbering a newer search (T-11-09).

import { renderSerp } from './serp-render.js';
import { buildDisclosureText } from './disclosure.js';
import type { DisclosureInput } from './disclosure.js';
import { buildBatchPayload, mergeTranslations } from './translate-batch.js';
import type {
  SearchResult,
  SearchTranslatedResponse,
  TranslateBatchResponse,
  TranslationConfig,
} from './types.js';

// In-flight run counter. Incremented on each runSearch call (and each toggle
// re-apply). Each async continuation captures its own token and checks it
// before applying the translateBatch overlay — stale overlays are silently
// discarded (T-11-09).
let currentRun = 0;

// Settings read once at page load (sourceLanguage / targetLanguage / formality).
let sourceLanguage = 'English';
let targetLanguage = 'Japanese';
let formality: TranslationConfig['formality'] = 'auto';

// Results back-translation toggle (persisted). Default on.
let backTranslate = true;
const TOGGLE_KEY = 'himeSearchTranslateResults';

// Cache of the most recent search so toggling the checkbox re-applies the
// overlay WITHOUT a Brave re-fetch (and without re-translating once cached).
let lastRaw: SearchResult[] | null = null; // target-language Brave rows
let lastTranslated: SearchResult[] | null = null; // source-language overlay (lazy)
let lastInTargetLang = false; // is lastRaw in the target language (translation actually happened)?

document.addEventListener('DOMContentLoaded', async () => {
  // Resolve DOM elements
  const form = document.getElementById('search-form') as HTMLFormElement | null;
  const input = document.getElementById('search-input') as HTMLInputElement | null;
  const disclosure = document.getElementById('disclosure') as HTMLElement | null;
  const mount = document.getElementById('results') as HTMLElement | null;
  const toggle = document.getElementById('translate-results') as HTMLInputElement | null;
  const toggleLabel = document.getElementById('translate-results-label') as HTMLElement | null;
  const settingsLink = document.getElementById('open-settings') as HTMLElement | null;

  if (!form || !input || !disclosure || !mount) {
    // DOM incomplete — bail out gracefully (should never happen in production)
    return;
  }

  // Load the persisted toggle state (default on). Absent/true → on; explicit false → off.
  try {
    const stored = await chrome.storage.local.get(TOGGLE_KEY);
    backTranslate = stored?.[TOGGLE_KEY] !== false;
  } catch {
    // Storage unavailable — keep default (on)
  }
  if (toggle) toggle.checked = backTranslate;

  // Read settings once. If the worker is unavailable, keep defaults.
  try {
    const settingsReply = await chrome.runtime.sendMessage({ type: 'getSettings' }) as
      | { settings: { sourceLanguage?: string; targetLanguage?: string; formality?: TranslationConfig['formality'] } }
      | null;
    if (settingsReply?.settings) {
      const s = settingsReply.settings;
      if (s.sourceLanguage) sourceLanguage = s.sourceLanguage;
      if (s.targetLanguage) targetLanguage = s.targetLanguage;
      if (s.formality) formality = s.formality;
    }
  } catch {
    // Worker not available — use defaults; page degrades gracefully
  }

  // Label reflects the reader's source language ("Translate results to English").
  if (toggleLabel) toggleLabel.textContent = `Translate results to ${sourceLanguage}`;

  // Attach submit handler. The <form> element handles both Enter and button
  // click natively (D-09) — no keydown listener needed.
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = input.value.trim();
    void runSearch(query, disclosure, mount);
  });

  // Toggle: persist the preference and re-apply the overlay from cache. No
  // Brave re-fetch — we already hold the raw rows; the translated view is cached
  // after its first computation.
  toggle?.addEventListener('change', () => {
    backTranslate = !!toggle.checked;
    try {
      void chrome.storage.local.set({ [TOGGLE_KEY]: backTranslate });
    } catch {
      // Persist best-effort; the in-memory toggle still takes effect this session.
    }
    void applyOverlay(mount, ++currentRun);
  });

  // Settings nav: open the extension's options page.
  settingsLink?.addEventListener('click', (event) => {
    event.preventDefault();
    try {
      chrome.runtime.openOptionsPage();
    } catch {
      // Options page unavailable — no-op
    }
  });
});

/**
 * Run the 3-stage progressive search pipeline for the given query.
 *
 * Stage order (D-11):
 *   1. Guard + settings
 *   2. searchTranslated → disclosure line (textContent) + loading skeleton
 *   3. Raw results render (populated)
 *   4. translateBatch overlay (back-translates titles/snippets to source — gated)
 *
 * Re-submitting increments currentRun so a stale overlay from a prior query
 * is silently dropped before it can clobber the newer search (T-11-09).
 */
async function runSearch(
  query: string,
  disclosure: HTMLElement,
  mount: HTMLElement,
): Promise<void> {
  // Guard: empty query → clear page and drop any cached results.
  if (!query) {
    disclosure.textContent = '';
    mount.replaceChildren();
    lastRaw = null;
    lastTranslated = null;
    lastInTargetLang = false;
    return;
  }

  // Claim this run's token (increment before any await). Also invalidates any
  // cached overlay from a prior search.
  const runToken = ++currentRun;
  lastRaw = null;
  lastTranslated = null;
  lastInTargetLang = false;

  // ── Stage 1: Send searchTranslated to worker ────────────────────────────
  let reply: SearchTranslatedResponse;
  try {
    reply = await chrome.runtime.sendMessage({
      type: 'searchTranslated',
      payload: { query, sourceLanguage, targetLanguage },
    }) as SearchTranslatedResponse;
  } catch {
    // Worker communication failure — show error state
    renderSerp(
      { kind: 'error', errorKind: 'network', message: 'Could not reach the background worker.' },
      document,
      mount,
    );
    return;
  }

  // ── Stage 2: Disclosure line + loading skeleton (D-11) ──────────────────
  // Build disclosure input based on what the worker returned.
  let disclosureInput: DisclosureInput;
  if (reply.direct) {
    // source == target — no translation attempted (D-06)
    disclosureInput = { kind: 'direct', originalQuery: query };
  } else if (reply.translationFailed) {
    // Translation was attempted but failed/timed out (D-10)
    disclosureInput = { kind: 'failed', originalQuery: query };
  } else if (reply.translatedQuery) {
    // Successful translation — show in-language disclosure (D-05)
    disclosureInput = {
      kind: 'translated',
      sourceLanguage,
      targetLanguage,
      originalQuery: query,
      translatedQuery: reply.translatedQuery,
    };
  } else {
    // No translatedQuery and no direct/failed flag — treat as direct (safe fallback)
    disclosureInput = { kind: 'direct', originalQuery: query };
  }

  // Set disclosure via textContent only (XSS-safe; D-07 / T-11-06)
  disclosure.textContent = buildDisclosureText(disclosureInput);

  // Show skeleton immediately after disclosure (D-11: disclosure before skeleton)
  renderSerp({ kind: 'loading' }, document, mount);

  // ── Stage 3: Handle worker error response ────────────────────────────────
  if (reply.error) {
    renderSerp(
      {
        kind: 'error',
        errorKind: reply.kind ?? 'unknown',
        message: reply.error,
      },
      document,
      mount,
    );
    return;
  }

  // No results → empty state
  if (!reply.results || reply.results.length === 0) {
    renderSerp({ kind: 'empty' }, document, mount);
    return;
  }

  // ── Stage 4: Raw Brave results ───────────────────────────────────────────
  renderSerp({ kind: 'populated', results: reply.results }, document, mount);

  // Cache for cheap toggle re-apply. Results are in the TARGET language only when
  // a source→target translation actually happened (not direct, not failed).
  lastRaw = reply.results;
  lastTranslated = null;
  lastInTargetLang = !reply.direct && !reply.translationFailed && !!reply.translatedQuery;

  // ── Stage 5: Back-translate overlay (gated by the toggle) ────────────────
  await applyOverlay(mount, runToken);
}

/**
 * Apply (or remove) the results-back-translation overlay using the cached raw
 * rows from the most recent search — no Brave re-fetch.
 *
 * - Toggle off, or results not in the target language → show the raw rows.
 * - Toggle on + results in target language → translate titles/snippets BACK to
 *   the reader's source language (target→source) and overlay them. The first
 *   computation hits translateBatch; the result is cached so subsequent toggles
 *   are instant. On any failure the raw rows stay visible (XLT-05 graceful
 *   degradation).
 *
 * runToken guards against a stale apply (newer search/toggle started while we
 * awaited the worker) clobbering the page.
 */
async function applyOverlay(mount: HTMLElement, runToken: number): Promise<void> {
  if (!lastRaw) return;

  // No back-translation wanted (toggle off) or nothing to translate back
  // (results already in the reader's language) → show raw rows.
  if (!backTranslate || !lastInTargetLang) {
    if (currentRun === runToken) {
      renderSerp({ kind: 'populated', results: lastRaw }, document, mount);
    }
    return;
  }

  // Cached translation → render instantly.
  if (lastTranslated) {
    if (currentRun === runToken) {
      renderSerp({ kind: 'populated', results: lastTranslated }, document, mount);
    }
    return;
  }

  // Compute the overlay: translate target→source (back to the reader's language).
  // Direction is swapped vs the query path: results arrive in the target language
  // and must come back to the source language the reader understands.
  const items = buildBatchPayload(lastRaw);
  const config: TranslationConfig = {
    sourceLanguage: targetLanguage,
    targetLanguage: sourceLanguage,
    formality,
  };

  let batchReply: TranslateBatchResponse;
  try {
    batchReply = await chrome.runtime.sendMessage({
      type: 'translateBatch',
      payload: { items, config },
    }) as TranslateBatchResponse;
  } catch {
    // translateBatch communication failure — leave raw results visible (XLT-05)
    return;
  }

  // Guard: if a newer run/toggle started while we awaited translateBatch, discard
  // this stale overlay — don't clobber the newer state (T-11-09).
  if (currentRun !== runToken) {
    return;
  }

  if (batchReply.error || !batchReply.translations) {
    // translateBatch failed — leave raw results in place (XLT-05 graceful degradation)
    return;
  }

  // Apply translated overlay: merge translations onto raw results, then cache.
  lastTranslated = mergeTranslations(lastRaw, batchReply.translations);
  renderSerp({ kind: 'populated', results: lastTranslated }, document, mount);
}
