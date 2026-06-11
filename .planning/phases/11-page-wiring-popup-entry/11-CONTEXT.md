# Phase 11: Page Wiring & Popup Entry - Context

**Gathered:** 2026-06-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Connect the v1.2 Translated Search feature end-to-end. Today the pieces exist but are not wired: `search.html`/`search.ts` only renders mock SERP states from a `?state=` param; `searchTranslated` Brave-searches the query **untranslated**; the popup has no entry to the search page; `translateBatch` (p10) is built but unused on the page. This phase delivers the live flow: popup → `search.html` → on-page query → explicit source→target query translation → Brave search → 3-stage progressive render (skeleton → raw → translated) reusing the `renderSerp` seam.

**In scope:** popup "Search" button; on-page search input + submit; worker-side query translation in `searchTranslated`; read-only disclosure line; page-side orchestration of the 3-stage render (XLT-05 page half); wiring `translateBatch` into the page.

**Out of scope:** new SERP visual states (p9), translation prompt/parse internals (p10), options/settings UI (p8), inline-prediction modes (v1.1, paused). Satisfies SRCH-01, SRCH-02, SRCH-03.

</domain>

<decisions>
## Implementation Decisions

### Query Translation Path
- **D-01:** Query is translated **worker-side, inside the existing `searchTranslated` handler** — translate the query first (explicit source→target), then Brave-search the translated string. The page sends one message and gets back `{ results, translatedQuery, direct }`. Keeps the LLM call + API key in the worker, consistent with p8/p10.
- **D-02:** Translation uses an **explicit source→target direction** taken from the search request's `sourceLanguage`/`targetLanguage` — NOT the auto-flip/swap-toggle used by in-field translate (SRCH-02). The swap-direction setting must not influence query-search direction.
- **D-03:** When `sourceLanguage === targetLanguage`, **skip the LLM call** and search the query verbatim, reusing the existing `direct` short-circuit flag already returned by `searchTranslated`.
- **D-04:** `searchTranslated` must return the translated query string (e.g. `translatedQuery`) to the page so the disclosure line can render it. (Today it returns only `results`/`direct` — extend the response contract.)

### Disclosure Line (SRCH-03)
- **D-05:** Read-only disclosure line above results shows **translated query + original** in parens, e.g. `Searching in Japanese for: 検索 (English: search)`. Language names come from settings (source/target).
- **D-06:** When `direct` (source==target, no translation occurred), show **plain `Searching for: ___`** — drop the "in {language}" framing so it never implies a translation happened.
- **D-07:** The line is **read-only** (not an editable field). Re-searching happens via the search box (D-09), not by editing the disclosure line.

### On-Page Search Input UX
- **D-08:** Popup gets a **"Search" button that opens `search.html` in a new tab via `chrome.tabs.create(chrome.runtime.getURL('search.html'))`** with an empty search box. Popup stays a launcher — it does NOT carry its own query input or pre-fill (SRCH-01 literal; avoids a second entry point).
- **D-09:** `search.html` gets a **top search bar** (Google-style, pinned above disclosure + results), submitting on **Enter or a button click**. Re-submitting a new query re-runs the full pipeline in place (same tab).

### Failure & Staging Behavior
- **D-10:** If query translation (LLM) fails or times out, **fall back to Brave-searching the raw untranslated query** and note it subtly in the disclosure line (e.g. `translation unavailable — searched as typed`). Graceful degradation, consistent with XLT-05 / p10's raw-results fallback. Never leave the user empty-handed on a transient LLM hiccup.
- **D-11:** Stage order: **submit → translate query → show disclosure line + skeleton → raw Brave results → translated overlay.** The disclosure line appears as soon as the translated query is known (above the skeleton), before results load.

### Claude's Discretion
- Exact response-field naming (`translatedQuery` vs other) and message-type extension shape — planner/researcher decides, as long as D-04's contract holds.
- Page-side state machine implementation for the 3-stage render (how skeleton/raw/translated transitions are sequenced) — reuse the `renderSerp` seam; no renderer change needed per the search.ts comment.
- CSS/markup for the search bar and disclosure line within the existing `search.css` light Google-style theme.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` — SRCH-01, SRCH-02, SRCH-03 (this phase); XLT-05 (page-side 3-stage render, worker half done p10).
- `.planning/ROADMAP.md` §"Phase 11" — goal + success criteria.

### Prior phase context (decisions this phase builds on)
- `.planning/phases/10-translation-pipeline/10-CONTEXT.md` — `translateBatch` contract, 8s timeout (D-04), raw-fallback behavior, progressive-render intent.
- `.planning/phases/09-serp-rendering/09-CONTEXT.md` — `renderSerp` / `SerpState` seam, XSS-safe rendering, 7 display states.
- `.planning/phases/08-api-integration-scaffold/08-CONTEXT.md` — `searchTranslated` handler, `direct` short-circuit (D-06), in-flight dedup, key-from-storage rule (XLT-01).

### Source files to wire (existing)
- `src/search.ts` — page entry; replace `?state=` mock driver with live round-trip (see in-file Phase 11 comment).
- `src/search.html` / `src/search.css` — add top search bar + disclosure line.
- `src/background.ts` §`case 'searchTranslated'` (~L170) — add query-translate step + return `translatedQuery`; §`case 'translateBatch'` (~L219) — page consumes this for the overlay.
- `src/popup.ts` / `src/popup.html` — add "Search" button + `chrome.tabs.create` handler.
- `src/serp-render.ts` — renderer seam (no change expected); `src/types.ts` — extend `SearchTranslatedResponse` for `translatedQuery`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `renderSerp(state, document, mount)` (serp-render.ts): DOM-agnostic, XSS-safe renderer already handles populated/skeleton/empty/error states — drive it directly from live data, no change needed.
- `searchTranslated` worker case (background.ts): already does key-from-storage, in-flight dedup, `direct` flag, error classification — extend rather than replace.
- `translateBatch` worker case (background.ts) + `translate-batch.ts` pure fns: built and tested in p10; page just needs to call it for the overlay stage.
- `chrome.runtime.openOptionsPage()` pattern in popup.ts: mirror it for the new Search button (`chrome.tabs.create`).

### Established Patterns
- All LLM/API calls routed through the background service worker (CSP) — query translation must follow this; never call the provider from the page.
- API keys read from `chrome.storage` only, never passed in message payloads (XLT-01 / T-08-07).
- search.ts is intentionally excluded from the node test harness (browser globals); unit-testable logic lives in DOM-agnostic modules (serp-render.ts, translate-batch.ts) — keep new orchestration logic testable where possible.

### Integration Points
- Popup → `search.html` via `chrome.tabs.create(getURL(...))`.
- Page → worker: `searchTranslated` (now returns `translatedQuery`), then `translateBatch` for the overlay.
- Disclosure line reads source/target language names from settings (`getSettings`/`chrome.storage`).

</code_context>

<specifics>
## Specific Ideas

- Disclosure example phrasing: `Searching in Japanese for: 検索 (English: search)`; same-language: `Searching for: ___`; degraded: `translation unavailable — searched as typed`.
- Search box is Google-style top bar (not a centered hero) within the existing light `search.css` theme.

</specifics>

<deferred>
## Deferred Ideas

- Popup-side query input / pre-filled `?q=` deep-link entry — considered and rejected for this phase (D-08); could be a later UX enhancement if a second entry point is ever wanted.
- Centered-hero → top-bar search layout animation — nice-to-have, deferred to keep layout state simple (D-09 picked the always-top bar).

None blocking — discussion stayed within phase scope.

</deferred>

---

*Phase: 11-page-wiring-popup-entry*
*Context gathered: 2026-06-11*
