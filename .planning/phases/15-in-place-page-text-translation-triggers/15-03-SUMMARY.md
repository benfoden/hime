---
phase: 15-in-place-page-text-translation-triggers
plan: 03
subsystem: content-script
tags: [chrome-mv3, content-script, in-place-translation, dom-walk, createTreeWalker, concurrency-gate, toggle-pill, classic-script-mirror]

# Dependency graph
requires:
  - plan: 15-01
    provides: "page-walk.ts canonical predicates (SKIP_TAGS, isTranslatableTag, chunkByBudget, PAGE_CHUNK_MAX_CHARS, PAGE_CONCURRENCY_CAP) mirrored verbatim here; STORAGE_PAGE_STATE key; TranslatePageBatchMessage/Response contracts"
  - plan: 15-02
    provides: "background.ts translatePageBatch worker case (BYOK, key from storage); translatePage/togglePage triggers (right-click + popup) that this content script consumes"
provides:
  - "src/content.ts — in-place page-text translate: static createTreeWalker snapshot, cursor-driven chunked translatePageBatch dispatch under a synchronous concurrency gate (every chunk exactly once, no drop/no busy-spin), nodeValue-only in-place apply with once-only original capture, pageFailedNodes failed-set surface, WeakMap+strong-array toggle store, clickable floating corner pill, translatePage/togglePage onMessage routing, chrome.storage.session page-state mirror"
affects: [15-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Classic-script mirror doctrine extended: page-walk.ts predicates + STORAGE_PAGE_STATE + TranslationConfig shape duplicated verbatim into content.ts (cannot import a classic script), each carrying a 'MUST stay in sync' comment"
    - "Cursor-driven promise pool over a SYNCHRONOUS concurrency gate (progCreateConcurrencyGate): the dispatch loop owns scheduling, re-entered only from a reply's .finally — a false tryAcquire never drops a chunk, no polling/busy-spin"
    - "nodeValue-only in-place replace (never innerHTML); once-only original capture (Pitfall 7); strong-array iteration for the WeakMap-backed toggle (Pitfall 6)"

key-files:
  created: []
  modified:
    - src/content.ts

key-decisions:
  - "Mirrored TranslationConfig as a local PageTranslationConfig type in content.ts (classic-script law — no imports) rather than importing types.ts; same { sourceLanguage, targetLanguage, formality } shape the worker expects"
  - "Whole-chunk request failure (reject) populates pageFailedNodes with every node in that chunk (the {error} path D-04 references); per-chunk missing-key nodes (key absent from a successful reply) populate it from pageApplyChunk's returned list. Both surfaces wired now; the toast/badge UI is Plan 04"
  - "pageState set to 'translated' in pageTranslate's terminal .then; pill creation + mirror write happen there so a single successful pass arms the toggle"

requirements-completed: [PAGE-01, PAGE-02, PAGE-03, PAGE-05]

# Metrics
duration: ~20min
completed: 2026-06-22
---

# Phase 15 Plan 03: In-Place Page Translate + Toggle Summary

**The core in-page translate→apply→toggle flow in `content.ts`: a single static `createTreeWalker` snapshot of visible translatable Text nodes, cursor-driven chunked `translatePageBatch` dispatch under a synchronous concurrency cap (every chunk exactly once), nodeValue-only in-place replacement with once-only original capture, a clickable floating corner pill + `togglePage` that flips original↔translation with no reload, and a `chrome.storage.session` state mirror for the popup label.**

## Performance
- **Duration:** ~20 min
- **Completed:** 2026-06-22
- **Tasks:** 2 code tasks complete; Task 3 is a deferred/batched human-verify checkpoint
- **Files modified:** 1 (src/content.ts, +370 lines)

## Accomplishments
- **Mirrored page-walk predicates** (`PAGE_SKIP_TAGS`, `pageIsTranslatableTag`, `pageChunkByBudget`, `PAGE_CHUNK_MAX_CHARS`, `PAGE_CONCURRENCY_CAP`) verbatim from page-walk.ts, each carrying a "MUST stay in sync with page-walk.ts" comment per the classic-script mirror doctrine. Also mirrored `STORAGE_PAGE_STATE` ('himePage') and the `TranslationConfig` shape (as `PageTranslationConfig`) since content.ts cannot import.
- **`pageCollectTextNodes()`** — native `document.createTreeWalker(document.body, SHOW_TEXT, {acceptNode})` static snapshot. acceptNode walks the ancestor chain rejecting any PAGE_SKIP_TAGS element or `isContentEditable` (Pitfall 2: SHOW_TEXT can't FILTER_REJECT element subtrees, so re-check ancestors per text node), rejects whitespace-only nodes, and rejects nodes whose parent fails `pageIsVisible` (offsetParent check + position:fixed rescue, Pattern 1b).
- **`pageReadConfig()`** — builds the config from `chrome.storage.local.get(['himeSettings'])` mirroring search.ts:359-363's three-field shape; the BYOK key is never read or sent (T-15-08).
- **`pageTranslate(nodes?)`** — cursor-driven promise pool. `snapshot = nodes ?? pageCollectTextNodes()`; `texts`; `chunks = pageChunkByBudget(texts)`. A `launch()` loop starts chunks while the cursor has work AND `gate.tryAcquire()` is true; each launched chunk keys its items by the GLOBAL snapshot index, sends `translatePageBatch`, and on settle releases the slot and **re-enters `launch()` from inside `.finally`** — the only re-entry trigger. A `false` from `tryAcquire` never drops a chunk (it waits on the cursor); there is no polling/busy-spin. Resolves only when the cursor is exhausted and zero chunks are in flight, then sets `pageState='translated'`, creates the pill, and writes the mirror.
- **`pageApplyChunk(snapshot, chunk, translations)`** — nodeValue-only write (never innerHTML, Pattern 3 / T-15-07), once-only original capture into the WeakMap (Pitfall 7), records each translated node in the strong `pageTranslatedNodes` array, and returns the per-chunk missing-key nodes which `pageTranslate` accumulates into `pageFailedNodes`.
- **`pageApplyState(state)`** — flips every node in the strong `pageTranslatedNodes` array (WeakMap is not enumerable, Pitfall 6) between original and translated nodeValue, updates the pill, and writes the session mirror.
- **Floating pill** (`pageCreatePill`/`pageUpdatePill`/`pageRemovePill`) — clickable fixed-corner control mirroring progCreateIndicator (textContent-only, idempotent-by-id, z-index 2147483646) but with `cursor:pointer`/`pointer-events:auto`; click toggles state. Label is "Show original" when translated, "Show translation" when showing original (D-01).
- **`pageWriteStateMirror(state)`** — `chrome.storage.session.set({ himePage: { origin, state } })` with state ∈ 'translated'|'original-shown' for the origin-checked popup label.
- **onMessage routing** — added `translatePage` (→ `pageTranslate()`) and `togglePage` (→ `pageApplyState` flip) branches to the existing listener.

## Task Commits
1. **Task 1: page-walk mirror + snapshot walk + chunked dispatch + in-place apply + pageFailedNodes** — `577b7eb` (feat)
2. **Task 2: floating toggle pill + togglePage routing + popup state mirror** — `07ce0f9` (feat)

## Scheduling-Contract Self-Check (code inspection)
The dispatch in `pageTranslate` satisfies the plan's scheduling contract by inspection:
- A `cursor` index advances exactly once per launched chunk (`cursor++` immediately after taking `chunks[cursor]`), so no chunk is taken twice.
- `launch()` only starts a chunk when `gate.tryAcquire()` returns true; when it returns false the loop exits, leaving the remaining chunks parked on the cursor.
- The sole re-entry into `launch()` is from a launched chunk's `.finally` (after `gate.release()`), so a freed slot immediately picks up the next cursor chunk — a `false` tryAcquire never skips/drops a chunk.
- There is NO polling loop on `tryAcquire` (no busy-spin). The outer promise resolves only when `cursor >= chunks.length && inFlight.size === 0` (the `settle()` barrier), guaranteeing every chunk was dispatched exactly once and settled.

## Deviations from Plan
None functionally — plan executed as written, with two type/naming adaptations forced by the classic-script-no-imports law:
- **`PageTranslationConfig` local type** instead of importing `TranslationConfig` from types.ts (content.ts is a classic script with zero imports — same constraint that already forces the page-walk predicate mirror). Same field shape; documented with a "MUST stay in sync with types.ts TranslationConfig" comment.
- The plan's `pageApplyChunk(snapshot, translations)` signature was implemented as `pageApplyChunk(snapshot, chunk, translations)` — the chunk's GLOBAL index list is needed to know which snapshot indices this reply covers (so a missing key is detected only for indices that were actually sent). Functionally identical to the plan's intent.

## Known Stubs
None. `pageRemovePill()` is declared but not yet called — it is an artifact the plan explicitly lists for Plan 04 (banner/reset path) to consume; this is intentional, not a stub blocking this plan's goal.

## Threat Surface
- **T-15-07 (Tampering/XSS, in-place replace):** mitigated. Replacement is `Text.nodeValue` only; `grep -nF ".innerHTML =" src/content.ts` → ZERO actual innerHTML writes. (The raw `innerHTML` string count rose 7→11 only from "...never innerHTML" doc comments in the new code; no write site exists.)
- **T-15-08 (Info disclosure, payload):** mitigated. No `apiKey`/`key` in the translatePageBatch payload (`grep -nF apiKey src/content.ts` → none); config carries source-language fields only; the worker reads the key from storage.
- **T-15-10 (DoS/self, layout thrash):** mitigated. Read-then-write two-phase (snapshot + visibility collected up-front; nodeValue writes only after each chunk reply). Cursor-driven dispatch caps in-flight chunks at PAGE_CONCURRENCY_CAP with no busy-spin.
No new threat surface beyond the plan's `<threat_model>`.

## User Setup Required
None — no new dependency, permission, or env var. `chrome.storage.session` is covered by the existing `storage` permission.

## Verification (automated portion)
- `npm run build` exits 0.
- `npm test` → 202 pass / 0 fail / 2 opt-in skip (no regression).
- Greps (via `grep -nF` to avoid the rtk-proxy paren mangling noted in 15-01): `createTreeWalker`, `translatePageBatch`, `message.type === 'translatePage'`, `message.type === 'togglePage'`, `pageApplyState`, `pageCreatePill`, `pageWriteStateMirror`, `pageFailedNodes`, `chrome.storage.session.set`, `PAGE_STORAGE_PAGE_STATE`, `MUST stay in sync`, `config: PageTranslationConfig` all present; `.innerHTML =` count = 0; no `apiKey` in payload; pill iterates the strong `pageTranslatedNodes` array.

## Remaining: Live Browser Checkpoint (Task 3 — DEFERRED/BATCHED)
Task 3 is a `checkpoint:human-verify` (blocking gate). Per the orchestrator, all phase-15 live-verify checkpoints are batched into one human gate at the end of the phase. Code is complete and committed; the human must verify in a live browser per the plan's how-to-verify steps (in-place replace preserves layout/links, pill + popup toggle round-trips to the EXACT original, post-trigger content stays untranslated, every chunk on a long page translates with no drops, no key leaks to the page).

## Self-Check: PASSED
- `src/content.ts` — FOUND; functions pageCollectTextNodes / pageTranslate / pageApplyChunk / pageApplyState / pageCreatePill / pageWriteStateMirror — all FOUND.
- Commits `577b7eb`, `07ce0f9` — both FOUND in git log.

---
*Phase: 15-in-place-page-text-translation-triggers*
*Completed (code): 2026-06-22 — live checkpoint deferred to batched phase-end human gate*
