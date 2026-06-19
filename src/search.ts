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
//   4. translateBatch overlay replaces titles/snippets (XLT-05 page half)
//
// Re-submit re-runs the pipeline in place (D-09). A run counter guards against
// stale translateBatch overlays clobbering a newer search (T-11-09).

import { renderSerp } from './serp-render.js';
import { buildDisclosureText } from './disclosure.js';
import type { DisclosureInput } from './disclosure.js';
import { buildBatchPayload, mergeTranslations } from './translate-batch.js';
import type {
  SearchTranslatedResponse,
  TranslateBatchResponse,
  TranslationConfig,
} from './types.js';

// In-flight run counter. Incremented on each runSearch call. Each async
// continuation captures its own token and checks it before applying the
// translateBatch overlay — stale overlays are silently discarded (T-11-09).
let currentRun = 0;

// Settings read once at page load (sourceLanguage / targetLanguage / formality).
let sourceLanguage = 'English';
let targetLanguage = 'Japanese';
let formality: TranslationConfig['formality'] = 'auto';

document.addEventListener('DOMContentLoaded', async () => {
  // Resolve DOM elements
  const form = document.getElementById('search-form') as HTMLFormElement | null;
  const input = document.getElementById('search-input') as HTMLInputElement | null;
  const disclosure = document.getElementById('disclosure') as HTMLElement | null;
  const mount = document.getElementById('results') as HTMLElement | null;

  if (!form || !input || !disclosure || !mount) {
    // DOM incomplete — bail out gracefully (should never happen in production)
    return;
  }

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

  // Attach submit handler. The <form> element handles both Enter and button
  // click natively (D-09) — no keydown listener needed.
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = input.value.trim();
    void runSearch(query, disclosure, mount);
  });
});

/**
 * Run the 3-stage progressive search pipeline for the given query.
 *
 * Stage order (D-11):
 *   1. Guard + settings
 *   2. searchTranslated → disclosure line (textContent) + loading skeleton
 *   3. Raw results render (populated)
 *   4. translateBatch overlay (replaces titles/snippets)
 *
 * Re-submitting increments currentRun so a stale overlay from a prior query
 * is silently dropped before it can clobber the newer search (T-11-09).
 */
async function runSearch(
  query: string,
  disclosure: HTMLElement,
  mount: HTMLElement,
): Promise<void> {
  // Guard: empty query → clear page
  if (!query) {
    disclosure.textContent = '';
    mount.replaceChildren();
    return;
  }

  // Claim this run's token (increment before any await)
  const runToken = ++currentRun;

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

  // ── Stage 5: translateBatch overlay ─────────────────────────────────────
  // Build the batch payload (title + description only; no URL — XLT-04 / T-11-08)
  const items = buildBatchPayload(reply.results);
  const config: TranslationConfig = { sourceLanguage, targetLanguage, formality };

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

  // Guard: if a newer run started while we awaited translateBatch, discard
  // this stale overlay — don't clobber the newer search (T-11-09)
  if (currentRun !== runToken) {
    return;
  }

  if (batchReply.error || !batchReply.translations) {
    // translateBatch failed — leave raw results in place (XLT-05 graceful degradation)
    return;
  }

  // Apply translated overlay: merge translations onto raw results
  const translatedResults = mergeTranslations(reply.results, batchReply.translations);
  renderSerp({ kind: 'populated', results: translatedResults }, document, mount);
}
