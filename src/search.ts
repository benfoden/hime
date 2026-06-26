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

// Back-translation streams in small ordered batches (top → bottom), rendering each
// as it lands, rather than one big translateBatch call: smaller payloads finish well
// under the worker's 8s cap, and per-batch retries + a final failure sweep make ALL
// results translate reliably (the prior all-or-nothing batch left transient failures
// permanently raw — e.g. results 0-4 staying in the source language). Backoff between
// attempts rides out the provider's per-minute rate limit (the query translation
// fires a request immediately before, so the first batch is prone to a transient 429).
const SEARCH_BATCH_SIZE = 3; // small → finer streaming, smaller/faster payloads
const SEARCH_BATCH_STAGGER_MS = 120; // delay between concurrent batch STARTS (top first, RPM-gentle)
const SEARCH_BACKOFF_BASE_MS = 350; // base for exponential retry backoff
const SEARCH_MAX_ATTEMPTS = 3; // attempts per batch before deferring to the sweep
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Cache of the most recent search so toggling the checkbox re-applies the
// overlay WITHOUT a Brave re-fetch (and without re-translating once cached).
let lastRaw: SearchResult[] | null = null; // target-language Brave rows
let lastTranslated: SearchResult[] | null = null; // source-language overlay (lazy)
let lastInTargetLang = false; // is lastRaw in the target language (translation actually happened)?

// ── Loading state + elapsed-millisecond timer ────────────────────────────────
// A single status line shows a spinner + live elapsed ms while a search/translate
// is in flight ("Searching… 234 ms"), then freezes on the final elapsed time
// ("Searched + translated · 812 ms"). The page is browser-only and untested, so
// this lives here rather than in a DOM-agnostic module.
let timerEl: HTMLElement | null = null;
let timerLabel = '';
let timerStart = 0;
let timerHandle: ReturnType<typeof setInterval> | null = null;

function elapsedMs(): number {
  return Math.round(performance.now() - timerStart);
}

function renderTimer(): void {
  if (!timerEl) return;
  timerEl.textContent = `${timerLabel} ${elapsedMs()} ms`;
}

function startTimer(label: string): void {
  if (!timerEl) return;
  timerLabel = label;
  timerStart = performance.now();
  timerEl.classList.add('is-running');
  renderTimer();
  if (timerHandle !== null) clearInterval(timerHandle);
  timerHandle = setInterval(renderTimer, 50);
}

function setTimerLabel(label: string): void {
  timerLabel = label;
  renderTimer();
}

// Stop ticking. finalLabel: a frozen summary ("Searched · 320 ms") or '' to clear.
function stopTimer(finalLabel?: string): void {
  if (timerHandle !== null) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
  if (!timerEl) return;
  timerEl.classList.remove('is-running');
  if (finalLabel === undefined) {
    const ms = Math.round(performance.now() - timerStart);
    timerEl.textContent = `${timerLabel} · ${ms} ms`;
  } else {
    timerEl.textContent = finalLabel;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Resolve DOM elements
  const form = document.getElementById('search-form') as HTMLFormElement | null;
  const input = document.getElementById('search-input') as HTMLInputElement | null;
  const disclosure = document.getElementById('disclosure') as HTMLElement | null;
  const mount = document.getElementById('results') as HTMLElement | null;
  const toggle = document.getElementById('translate-results') as HTMLInputElement | null;
  const toggleLabel = document.getElementById('translate-results-label') as HTMLElement | null;
  const settingsLink = document.getElementById('open-settings') as HTMLElement | null;
  timerEl = document.getElementById('search-timer');

  if (!form || !input || !disclosure || !mount) {
    // DOM incomplete — bail out gracefully (should never happen in production)
    return;
  }

  // Caret in the search box on load/reload/open. The `autofocus` attribute covers
  // first paint; focus() here is the reliable cross-case path, and re-focusing on
  // window focus puts the caret back when the tab is re-activated. Select any
  // existing value so a re-open lets the user type over the prior query immediately.
  const focusSearch = (): void => {
    input.focus();
    input.select();
  };
  focusSearch();
  window.addEventListener('focus', focusSearch);

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
    // Only the first translate-on for a given search hits the worker; cached
    // re-applies are instant. Show the timer only when real work will happen.
    const willTranslate = backTranslate && lastInTargetLang && !lastTranslated;
    const token = ++currentRun;
    if (willTranslate) startTimer('Translating results…');
    void applyOverlay(mount, token).then(() => {
      if (willTranslate && currentRun === token) stopTimer(`Translated results · ${elapsedMs()} ms`);
    });
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
    stopTimer('');
    return;
  }

  // Claim this run's token (increment before any await). Also invalidates any
  // cached overlay from a prior search.
  const runToken = ++currentRun;
  lastRaw = null;
  lastTranslated = null;
  lastInTargetLang = false;

  // Start the elapsed-ms timer for the whole pipeline (search → render → overlay).
  startTimer('Searching…');

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
    stopTimer('');
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
    stopTimer('');
    return;
  }

  // No results → empty state
  if (!reply.results || reply.results.length === 0) {
    renderSerp({ kind: 'empty' }, document, mount);
    stopTimer(`No results · ${elapsedMs()} ms`);
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
  // If the overlay will actually translate, switch the live label; otherwise the
  // search itself is done and the overlay is a no-op / instant raw render.
  const willTranslate = backTranslate && lastInTargetLang;
  if (willTranslate) {
    setTimerLabel('Translating results…');
  }
  await applyOverlay(mount, runToken);
  // Freeze the timer — but only if this is still the active run (a newer search
  // or toggle may have started while we awaited the overlay; T-11-09).
  if (currentRun === runToken) {
    stopTimer(willTranslate
      ? `Searched + translated · ${elapsedMs()} ms`
      : `Searched · ${elapsedMs()} ms`);
  }
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
  const raw = lastRaw; // non-null capture for the closures/loops below

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

  // Paint ALL raw rows immediately with the "translating" wave (instant feedback),
  // then translate concurrently and replace each row's text IN PLACE as it lands.
  if (currentRun !== runToken) return;
  renderSerp({ kind: 'populated', results: raw, translating: true }, document, mount);

  // Compute the overlay: translate target→source (back to the reader's language).
  // Direction is swapped vs the query path: results arrive in the target language
  // and must come back to the source language the reader understands.
  const config: TranslationConfig = {
    sourceLanguage: targetLanguage,
    targetLanguage: sourceLanguage,
    formality,
  };

  // `merged` carries the final cache view: translated rows replace their raw
  // counterpart (mergeTranslations returns NEW objects for translated rows and the
  // SAME ref for untranslated ones, so `merged[i] !== raw[i]` ⇔ row i is translated).
  const merged = raw.slice();
  const translatedIdx = new Set<number>();
  const failed: number[] = [];

  // In-place row swap: replace one row's title + snippet text and drop the wave,
  // WITHOUT re-rendering the whole list (keeps the other rows' animation smooth).
  const swapRow = (i: number, result: SearchResult): void => {
    const row = mount.querySelectorAll('.serp-row')[i] as HTMLElement | undefined;
    if (!row) return;
    const titleEl = row.querySelector('a.serp-title');
    if (titleEl) titleEl.textContent = result.title;
    const snippetEl = row.querySelector('.serp-snippet');
    if (snippetEl) snippetEl.textContent = result.description;
    row.classList.remove('serp-translating');
  };

  // Translate one window and stream its rows in. Collects any indices that did not
  // translate into `failed` for the sweep. Honors the stale-run guard.
  const runWindow = async (idxs: number[]): Promise<void> => {
    if (idxs.length === 0) return;
    const chunk = idxs.map((i) => raw[i]);
    const translations = await translateChunkWithRetry(chunk, config, SEARCH_MAX_ATTEMPTS);
    if (currentRun !== runToken) return;
    if (!translations) {
      failed.push(...idxs.filter((i) => !translatedIdx.has(i)));
      return;
    }
    const slice = mergeTranslations(chunk, translations);
    idxs.forEach((i, j) => {
      if (translatedIdx.has(i)) return;
      if (slice[j] !== chunk[j]) {
        merged[i] = slice[j];
        translatedIdx.add(i);
        swapRow(i, slice[j]); // stream this row in
      } else {
        failed.push(i); // a key the model dropped → sweep it
      }
    });
  };

  // Pass 1 — CONCURRENT staggered batches. Firing batches in parallel (instead of
  // awaiting each) drops wall-clock from sum-of-batches to ≈ slowest batch; the small
  // start stagger biases earlier (top) rows to land first and is gentle on the
  // provider's rate limit. Each batch swaps its own rows in as soon as it resolves.
  const windows: number[][] = [];
  for (let start = 0; start < raw.length; start += SEARCH_BATCH_SIZE) {
    windows.push(
      Array.from({ length: Math.min(SEARCH_BATCH_SIZE, raw.length - start) }, (_, k) => start + k),
    );
  }
  await Promise.all(
    windows.map(async (idxs, bi) => {
      await sleep(bi * SEARCH_BATCH_STAGGER_MS);
      if (currentRun !== runToken) return;
      await runWindow(idxs);
    }),
  );
  if (currentRun !== runToken) return;

  // Pass 2 — failure sweep: retry stragglers one at a time (smallest payload, fresh
  // backoff) so ALL results end up translated, not just some.
  for (const i of failed) {
    if (currentRun !== runToken) return;
    if (translatedIdx.has(i)) continue;
    await runWindow([i]);
    if (currentRun !== runToken) return;
  }
  if (currentRun !== runToken) return;

  // Settle: drop the wave from any row that ultimately couldn't translate (it keeps
  // its raw text — graceful degradation, XLT-05), so no row is left shimmering.
  for (let i = 0; i < raw.length; i++) {
    if (translatedIdx.has(i)) continue;
    (mount.querySelectorAll('.serp-row')[i] as HTMLElement | undefined)?.classList.remove(
      'serp-translating',
    );
  }

  // Cache only a FULLY-translated overlay so a later toggle re-runs the stragglers
  // instead of caching a partial view (XLT-05).
  if (translatedIdx.size === raw.length) {
    lastTranslated = merged;
  }
}

/**
 * Translate one batch of raw results target→source via the worker, retrying up to
 * `maxAttempts` with exponential backoff. The 8s worker-timeout AbortError surfaces
 * as a 'network' error/comms reject, and the provider's per-minute rate limit (the
 * query translation fires right before) can transiently fail the first call — backoff
 * rides both out. Returns the translations map, or null if every attempt fails.
 */
async function translateChunkWithRetry(
  chunk: SearchResult[],
  config: TranslationConfig,
  maxAttempts: number,
): Promise<Record<string, { t: string; d: string }> | null> {
  const items = buildBatchPayload(chunk);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const reply = (await chrome.runtime.sendMessage({
        type: 'translateBatch',
        payload: { items, config },
      })) as TranslateBatchResponse;
      if (!reply.error && reply.translations) return reply.translations;
    } catch {
      // comm failure — fall through to backoff/retry
    }
    if (attempt < maxAttempts - 1) {
      // Exponential backoff: 350ms, 700ms … to clear a transient rate limit.
      await sleep(SEARCH_BACKOFF_BASE_MS * 2 ** attempt);
    }
  }
  return null;
}
