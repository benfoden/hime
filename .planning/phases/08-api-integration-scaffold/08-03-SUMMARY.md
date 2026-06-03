---
phase: 08-api-integration-scaffold
plan: 03
subsystem: api
tags: [brave-search, service-worker, message-dispatch, dedup, chrome-extension]

# Dependency graph
requires:
  - phase: 08-01
    provides: SearchTranslatedMessage / TestBraveKeyMessage / SearchResult types + classifyBraveError taxonomy
  - phase: 08-02
    provides: BraveSearchClient.search() transport (authenticated GET, web.results mapping, error classification)
provides:
  - "case 'searchTranslated' in background.ts onMessage — { results, direct? } | { error, kind }"
  - "case 'testBraveKey' in background.ts onMessage — { ok } | { ok: false, error, kind }"
  - "module-scope inFlightSearches dedup Map (D-05) collapsing same-query submits to one Brave fetch"
  - "module-scope braveClient = new BraveSearchClient() instance"
  - "source==target short-circuit flag (direct: true, D-06)"
affects: [phase-09-serp-render, phase-11-search-page, 08-04-options-test-button]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "In-flight dedup Map keyed on normalized query with try/finally cleanup on success AND failure (Pitfall 4)"
    - "Worker reads Brave key from getSettings() (chrome.storage.local) only — never from the message payload (XLT-01)"
    - "Background handler logic tested as extractable pure algorithm inline (no chrome import), mirroring the predict-handler precedent"

key-files:
  created: []
  modified:
    - src/background.ts
    - test/unit.mjs

key-decisions:
  - "Used try/finally (not duplicated try/catch deletes from the RESEARCH sketch) so the dedup Map entry is removed exactly once regardless of success/failure — satisfies the Pitfall-4 cleanup gate and avoids double-delete"
  - "Shared-promise rejection in the dedup-hit branch surfaces the same { error, kind } to the second caller via a wrapping try/catch"

patterns-established:
  - "Dedup: dedupKey = query.trim().toLowerCase(); first caller registers braveClient.search promise, subsequent same-key callers await it"
  - "testBraveKey uses count:1 to minimize quota cost (D-04); no 429 auto-retry anywhere (D-07)"

requirements-completed: [SRCH-05, SRCH-06, XLT-01]

# Metrics
duration: 8 min
completed: 2026-06-03
---

# Phase 8 Plan 3: Background Message Dispatch for Translated Search Summary

**Wired `searchTranslated` and `testBraveKey` into the background onMessage switch with a module-scope in-flight dedup Map, source==target `direct` flag, storage-only Brave key read (XLT-01), and try/finally dedup cleanup — never logging or accepting the key from the page.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-03T17:32:17Z
- **Completed:** 2026-06-03
- **Tasks:** 1 (TDD: test → feat)
- **Files modified:** 2

## Accomplishments
- `case 'searchTranslated'`: reads `settings.braveApiKey` from `getSettings()` only, empty-key auth short-circuit (no fetch), `isDirect = sourceLanguage === targetLanguage` (D-06), in-flight dedup collapsing same-query submits to one Brave fetch (D-05), try/finally cleanup on success AND failure (Pitfall 4), no 429 auto-retry (D-07), `{ results, direct? } | { error, kind }` responses.
- `case 'testBraveKey'`: `count:1` validation probe (D-04), `{ ok } | { ok: false, error, kind }`, empty-key guard returns auth without a fetch.
- Module-scope `braveClient` (BraveSearchClient) and `inFlightSearches: Map<string, Promise<SearchResult[]>>`.
- Five handler-logic tests (dedup-key normalization, one-fetch dedup harness, failure cleanup, isDirect logic, empty-key guard) — green, mirroring the chrome-free predict-handler test precedent.

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): handler-logic tests** - `9bcf13f` (test)
2. **Task 1 (GREEN): searchTranslated + testBraveKey handlers** - `9005875` (feat)

No REFACTOR commit — implementation followed the existing case structure cleanly.

_TDD task: test → feat._

## Files Created/Modified
- `src/background.ts` - Added BraveSearchClient import + SearchTranslatedMessage/SearchResult type imports; module-scope braveClient instance and inFlightSearches dedup Map; `case 'searchTranslated'` and `case 'testBraveKey'` in the onMessage switch.
- `test/unit.mjs` - Added 5 handler-logic tests for dedup normalization, one-fetch dedup, failure cleanup, isDirect, and empty-key guard.

## Decisions Made
- **try/finally over the RESEARCH sketch's twin try/catch deletes:** the sketch deleted the Map entry in both the success and catch branches; I consolidated to a single `finally` so the entry is removed exactly once on every path. This satisfies the Pitfall-4 cleanup gate (`grep finally` within the searchTranslated region) and removes the double-delete risk.
- **Dedup-hit rejection surfacing:** when a shared in-flight promise rejects, the second (dedup-hit) caller wraps the await in try/catch and returns the same `{ error, kind }`, so both callers observe identical failure semantics.

## Deviations from Plan

None - plan executed exactly as written. (The try/finally consolidation is the plan's own `<action>` instruction, which explicitly mandates try/finally over the sketch's twin deletes; not a deviation.)

## Issues Encountered
None.

## Threat Model Compliance
- **T-08-07 (info disclosure):** key read via `settings.braveApiKey` from `getSettings()` inside the worker; grep gate confirms 0 non-comment reads of any payload key. Satisfied.
- **T-08-08 (denial of resource):** in-flight dedup Map collapses same-query submits to one fetch; testBraveKey uses count:1; no 429 retry. Satisfied.
- **T-08-09 (self-DoS / Map leak):** try/finally deletes the entry on success and failure. Satisfied.

## User Setup Required
None - no external service configuration required (live Brave key verification deferred to phase-end per 08-VALIDATION.md).

## Next Phase Readiness
- The `searchTranslated` / `testBraveKey` message contract is the foundation Plan 08-04 (options test button) and Phase 11 (search page) consume. No UI re-implements dedup/short-circuit/error surfacing — it all lives in the worker now.
- Live-key manual smoke test (load unpacked, send searchTranslated from a page console, confirm result array + key not exposed) is deferred to phase-end validation.

## Acceptance Criteria Verification
- `npm test` — 97 pass / 0 fail (tsc compile + node:test) ✓
- `grep -c "case 'searchTranslated'"` == 1 ✓
- `grep -c "case 'testBraveKey'"` == 1 ✓
- `grep -c "inFlightSearches"` == 5 (≥3) ✓
- `grep -c "settings.braveApiKey"` == 2 (≥1, XLT-01) ✓
- non-comment payload-key reads == 0 ✓
- `finally` inside searchTranslated region (line 209) ✓
- `tsc --noEmit` clean ✓
- dedup test asserts one underlying fetch for two same-key calls ✓
- isDirect test asserts true for equal / false for unequal source/target ✓

## Self-Check: PASSED
- FOUND: src/background.ts
- FOUND: test/unit.mjs
- FOUND commit: 9bcf13f (test)
- FOUND commit: 9005875 (feat)

---
*Phase: 08-api-integration-scaffold*
*Completed: 2026-06-03*
