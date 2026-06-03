---
phase: 08-api-integration-scaffold
plan: 01
subsystem: api
tags: [brave-search, error-model, types, settings, message-passing, typescript]

# Dependency graph
requires:
  - phase: 05-ghost-text-prediction-engine
    provides: ErrorKind/ClassifiedError model and migrateSettings/DEFAULT_SETTINGS conventions this plan extends
provides:
  - SearchResult interface (title/url/description/hostname + optional faviconUrl) with SERP-02/SERP-03 contract comments
  - searchTranslated + testBraveKey MessageType members and their message/response interfaces
  - SearchTranslatedResponse discriminated by ErrorKind (success → results, failure → error+kind)
  - Settings.braveApiKey top-level field + DEFAULT_SETTINGS default ''
  - search_quota ErrorKind member + classifyBraveError() classifier (429 → search_quota, distinct from LLM rate_limit)
affects: [08-02-brave-search-client, 08-message-handlers, 09-serp-renderer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Brave error classifier mirrors classifyError branch order but maps 429 to a dedicated search_quota kind (D-07 discriminator)"
    - "Type-comment-as-contract: SearchResult.url/description carry the SERP-02/SERP-03 XSS + no-mutation contracts for Phase 9"
    - "No-payload message (TestBraveKeyMessage) keeps the API key out of message passing (worker reads from storage)"

key-files:
  created: []
  modified:
    - src/errors.ts
    - src/types.ts
    - test/unit.mjs
    - src/options.ts

key-decisions:
  - "Brave 429 maps to a new 'search_quota' ErrorKind, NOT the LLM 'rate_limit' kind (D-07) — Phase 9 switches on it"
  - "Settings.braveApiKey is top-level, not inside the apiKeys map (D-03 — apiKeys is keyed by LLM provider only)"
  - "TestBraveKeyMessage carries no payload — the key is read from storage in the worker (D-04 / XLT-01 / T-08-01)"
  - "braveApiKey default supplied via the existing DEFAULT_SETTINGS spread in migrateSettings; no special-casing (Pitfall 3)"

patterns-established:
  - "classifyBraveError(err, response?) — Brave-specific classifier separate from the generic classifyError"
  - "SearchResult is the canonical SERP result shape consumed by Phase 8 client and Phase 9 renderer"

requirements-completed: [SSET-01, XLT-01]

# Metrics
duration: 6 min
completed: 2026-06-03
---

# Phase 8 Plan 01: API Integration Scaffold — Foundation Types & Error Model Summary

**Shared type contract for Translated Search: SearchResult interface, searchTranslated/testBraveKey message types, top-level Settings.braveApiKey, and a Brave-specific classifyBraveError() that maps HTTP 429 to a dedicated search_quota kind distinct from LLM rate-limiting.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-03T17:21:00Z (approx)
- **Completed:** 2026-06-03T17:27:15Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 4

## Accomplishments
- `classifyBraveError()` added with the full Brave error taxonomy: 429 → `search_quota` ("Search quota exceeded — check your Brave plan"), 401/403 → `auth`, network/AbortError → `network`, other → `unknown`. The existing LLM `classifyError` (and its `rate_limit` 429 path) is untouched (D-07).
- `SearchResult` interface established with the SERP-02 (url never mutated) and SERP-03 (Phase 9 strips HTML / renders via textContent) contracts encoded as type comments — the only place Phase 8 documents the downstream XSS contract.
- `searchTranslated` + `testBraveKey` MessageType members and their `SearchTranslatedMessage` / `SearchTranslatedResponse` / `TestBraveKeyMessage` interfaces added. `TestBraveKeyMessage` intentionally has no payload (T-08-01).
- `Settings.braveApiKey` (top-level, D-03) + `DEFAULT_SETTINGS.braveApiKey: ''`; `migrateSettings({}).braveApiKey === ''` confirmed for legacy blobs via the existing spread (Pitfall 3).

## Task Commits

Each task executed TDD (RED → GREEN):

1. **Task 1: Error model — search_quota + classifyBraveError**
   - `5e15c76` (test, RED) — failing classifyBraveError tests
   - `9f3de79` (feat, GREEN) — classifyBraveError + search_quota ErrorKind
2. **Task 2: SearchResult, search message types, braveApiKey setting**
   - `5a53dd6` (test, RED) — failing migrateSettings braveApiKey tests
   - `c317cf0` (feat, GREEN) — types + options.ts blocking fix

_No refactor commits — implementations were minimal and clean._

## Files Created/Modified
- `src/errors.ts` — added `'search_quota'` to `ErrorKind`; new exported `classifyBraveError(err, response?)`. `classifyError` unchanged.
- `src/types.ts` — `SearchResult`, `SearchTranslatedMessage`, `SearchTranslatedResponse`, `TestBraveKeyMessage`; `searchTranslated`/`testBraveKey` MessageType members; `Settings.braveApiKey` + `DEFAULT_SETTINGS` default.
- `test/unit.mjs` — 7 classifyBraveError assertions + 3 migrateSettings braveApiKey assertions.
- `src/options.ts` — `saveSettings()` now preserves `currentSettings.braveApiKey` (blocking compile fix from the new required field).

## Decisions Made
- Followed plan decisions D-02/D-03/D-04/D-07 as specified. No new decisions introduced.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] options.ts saveSettings missing braveApiKey**
- **Found during:** Task 2 (adding `braveApiKey` to the `Settings` interface)
- **Issue:** `Settings.braveApiKey` is required, so the explicit `Settings` object literal in `saveSettings()` (src/options.ts:195) failed to compile with TS2741. This blocked `tsc`, which `npm test` runs first.
- **Fix:** Added `braveApiKey: currentSettings.braveApiKey` to preserve the stored value. The options UI for editing the Brave key is a later plan; this only preserves round-trip integrity.
- **Files modified:** src/options.ts
- **Verification:** `npx tsc --noEmit` → No errors; full suite 82/82 green.
- **Committed in:** c317cf0 (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** The fix was required for the new required field to compile; no behavior change beyond preserving an already-stored key. No scope creep.

## Issues Encountered
None — TDD RED/GREEN proceeded as expected (RED showed the 7 + 2 expected failures; the "existing braveApiKey value preserved" test passed at RED because the raw spread already carried it, which is correct behavior).

## Known Stubs
None. The `braveApiKey` default of `''` is the intended initial value (no key configured); the options UI to populate it is a deliberate later-plan concern, not a stub blocking this plan's goal.

## TDD Gate Compliance
Both tasks recorded a `test(...)` commit (RED) followed by a `feat(...)` commit (GREEN) in git history. Gate sequence satisfied for both.

## User Setup Required
None — no external service configuration required in this plan. (Brave API key acquisition is surfaced in a later plan's user setup.)

## Next Phase Readiness
- The full shared type contract and error model are locked. BraveSearchClient (Plan 02) can now import `SearchResult`, `classifyBraveError`, `search_quota`, and `Settings.braveApiKey`.
- Phase 9's hard dependency (D-01, SearchResult contract) is satisfied.
- No blockers.

## Self-Check: PASSED
- Files exist: src/errors.ts, src/types.ts, test/unit.mjs (all FOUND)
- Commits exist: 5e15c76, 9f3de79, 5a53dd6, c317cf0 (all in git log)
- Full suite: 82 tests, 82 pass, 0 fail
- `npx tsc --noEmit`: No errors found

---
*Phase: 08-api-integration-scaffold*
*Completed: 2026-06-03*
