---
phase: 08-api-integration-scaffold
plan: 04
subsystem: options-ui
tags: [brave-search, options-page, byok, key-validation, worker-routed, chrome-extension]

# Dependency graph
requires:
  - phase: 08-01
    provides: Settings.braveApiKey field + SearchResult / search message types
  - phase: 08-03
    provides: "case 'testBraveKey' + case 'searchTranslated' in background onMessage (worker reads key from chrome.storage, never the payload)"
provides:
  - "options.html: #braveApiKey input + #testBraveKey button + #braveTestStatus status div (Translated Search section, BYOK/metered help text)"
  - "options.ts: braveApiKey load (populateForm) + save (saveSettings, top-level field) + worker-routed testBraveKey() handler (save-before-test, empty-key guard, payload-less message)"
  - "test/brave-live.mjs: repeatable terminal live-transport harness (real BraveSearchClient → live Brave API), skip-when-keyless"
affects: [phase-11-search-page]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Save-before-test: the Brave key is persisted to chrome.storage.local FIRST, then a payload-less testBraveKey message routes validation through the worker (XLT-01 / D-04); the page never POSTs the key to Brave directly"
    - "Empty-key guard short-circuits to a 'key required' status with no worker call (SSET-02)"
    - "Live transport verified via a terminal node:test harness (NOT the service-worker console — reserved path the user cannot use), gated to skip without BRAVE_API_KEY so the default suite stays green/keyless-CI safe"

key-files:
  created:
    - test/brave-live.mjs
  modified:
    - src/options.html
    - src/options.ts

key-decisions:
  - "test/brave-live.mjs is a node:test that SKIPS when BRAVE_API_KEY is unset rather than hard-failing — required so 'npm test' stays green for keyless contributors/CI while still providing the exact BRAVE_API_KEY=<key> node test/brave-live.mjs live check the user ran"
  - "Task-3 live verification was satisfied via the terminal Node harness against real dist/brave-search.js, NOT the service-worker console (the user cannot use that path; it is reserved permanently)"

patterns-established:
  - "Brave key UI mirrors the LLM key/test block structure but routes through the worker instead of POSTing directly — the page-side handler holds no Brave endpoint reference"

requirements-completed: [SSET-01, SSET-02]

# Metrics
duration: 12 min
completed: 2026-06-03
---

# Phase 8 Plan 4: Brave Search Key Options UI Summary

**Added the Brave Search BYOK key field, a worker-routed "Test Brave Key" button (save-before-test, empty-key guard, payload-less message — XLT-01), and a repeatable terminal live-transport harness (`test/brave-live.mjs`) that validates the real BraveSearchClient against the live Brave API while skipping cleanly when no key is present.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-06-03
- **Tasks:** 3 (2 auto + 1 blocking-human checkpoint)
- **Files created:** 1 · **Files modified:** 2

## Accomplishments
- **options.html:** Added a "Translated Search" sub-section with `#braveApiKey` password input, `#testBraveKey` button, and dedicated `#braveTestStatus` status div, plus BYOK/metered help text (~$0.005/query — explicitly NOT described as "free"). The existing LLM `#apiKey` / `#testConnection` / `#testStatus` markup is untouched.
- **options.ts:** `braveApiKeyInput` / `testBraveKeyBtn` / `braveTestStatusDiv` DOM refs; `braveApiKey` loaded in `populateForm()` and persisted as a top-level `himeSettings.braveApiKey` field in `saveSettings()` (D-03); async `testBraveKey()` that (1) short-circuits to a "Brave API key required" status with no worker call on empty input (SSET-02), (2) otherwise saves the key to storage first, then sends a payload-less `{ type: 'testBraveKey' }` message through the worker (XLT-01 / D-04), surfacing the worker's human-readable result. The page never references `api.search.brave.com`.
- **test/brave-live.mjs (NEW):** Terminal `node:test` harness exercising the real `dist/brave-search.js` `BraveSearchClient` end-to-end against the live Brave API (transport + auth + `web.results`→`SearchResult` mapping). Skips cleanly when `BRAVE_API_KEY` is unset; runs the live PASS/FAIL assertion when present.

## Task Commits

| Task | Name | Commit | Type |
|------|------|--------|------|
| 1 | Brave key field + Test button + status div in options.html | `e8bfcfe` | feat |
| 2 | braveApiKey load/save + worker-routed testBraveKey handler in options.ts | `bb55093` | feat |
| 3 | Live Brave key validation harness (verification artifact) | `6de83c6` | test |

Task 3 was a `checkpoint:human-verify` (gate=blocking-human) — no production code change. The `test/brave-live.mjs` artifact is the repeatable record of that verification.

## Files Created/Modified
- `test/brave-live.mjs` (NEW) — repeatable live Brave transport check (terminal node:test, skip-when-keyless).
- `src/options.html` — Brave key input, Test Brave Key button, brave test status div + BYOK/metered help text.
- `src/options.ts` — braveApiKey load/save + worker-routed `testBraveKey()` handler.

## Decisions Made
- **Live check as a skip-when-keyless `node:test`, not a bare script:** the harness was first written as a standalone `node test/brave-live.mjs` script, which the `test/**/*.mjs` glob in `npm test` pulled into the default suite — causing a hard failure in any context without `BRAVE_API_KEY` (CI, keyless contributors). Converted it to a `node:test` with a `skip` reason when the key is absent so the suite stays green (97 pass / 1 skip), while `BRAVE_API_KEY=<key> node test/brave-live.mjs` still runs the full live assertion.
- **Service-worker console reserved:** Task-3 live verification was completed via the terminal Node harness against real `dist/brave-search.js`, NOT the `chrome://extensions` service-worker console — the user cannot use that path, so it is reserved permanently.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Live test broke the default `npm test` suite**
- **Found during:** Finalization (Task 3 artifact integration)
- **Issue:** `test/brave-live.mjs`, as a bare top-level script, was matched by the `node --test 'test/**/*.mjs'` glob and hard-failed without `BRAVE_API_KEY` set — breaking the green-suite invariant for CI and any keyless contributor.
- **Fix:** Rewrote it as a `node:test` that skips with an explicit reason when `BRAVE_API_KEY` is unset and runs the live transport/auth/mapping assertion when present. Standalone live invocation behavior is preserved.
- **Files modified:** `test/brave-live.mjs`
- **Commit:** `6de83c6`

The plan's `<output>` only required the SUMMARY; the live harness is an added verification artifact requested at finalization. Its skip-guard is a correctness requirement (suite must stay green keyless).

## Issues Encountered
None beyond the auto-fixed suite-breakage above.

## Threat Model Compliance
- **T-08-10 (info disclosure):** `testBraveKey()` saves the key to storage then sends a payload-less message; grep gate confirms `options.ts` has 0 non-comment references to `api.search.brave.com` — the page never POSTs the key. Satisfied (XLT-01 / D-04).
- **T-08-11 (save-before-test race):** the handler persists the Brave field and surfaces a save error without proceeding to test against a stale key (Pitfall 5). Satisfied.
- **T-08-SC (npm installs + live key):** no package installs. Live Brave-key validation ran behind the blocking-human checkpoint (not auto-approved) and is now reproducible via `test/brave-live.mjs`. Satisfied.

## User Setup Required
To re-run the live Brave transport check: `BRAVE_API_KEY=<your-key> node test/brave-live.mjs` (terminal only — metered, single count=3 query). No key needed for `npm test` (the live check skips).

## Next Phase Readiness
- Phase 8 (API Integration Scaffold) is fully implemented and verified end-to-end: foundation types/errors (08-01), Brave transport (08-02), worker message dispatch (08-03), and the options-page key UI + live validation (08-04). The `searchTranslated` / `testBraveKey` contract and the options key field are ready for the Phase 11 search page to consume.

## Acceptance Criteria Verification
- `npm test` — 97 pass / 0 fail / 1 skip (live Brave check skipped, no key) ✓
- `grep -c 'id="braveApiKey"|id="testBraveKey"|id="braveTestStatus"' src/options.html` == 3 ✓
- `grep -c "type: 'testBraveKey'" src/options.ts` == 1 (worker-routed) ✓
- `grep -c "braveApiKey: braveApiKeyInput.value" src/options.ts` == 1 (persisted) ✓
- `grep -c "braveApiKeyInput" src/options.ts` == 6 (≥3: declare + resolve + populate + guard + save) ✓
- non-comment `api.search.brave.com` in options.ts == 0 (routes through worker) ✓
- existing `#testConnection` / `#testStatus` markup intact ✓
- **Live (Task 3):** `BRAVE_API_KEY=<real> node test/brave-live.mjs` → `✓ PASS — transport + auth + mapping all green` (results.length > 0; first result had title/url/description/hostname; real key authenticated, no 422/429) ✓ — checkpoint approved.

## Self-Check: PASSED
- FOUND: test/brave-live.mjs
- FOUND: src/options.html
- FOUND: src/options.ts
- FOUND commit: e8bfcfe (feat — options.html)
- FOUND commit: bb55093 (feat — options.ts)
- FOUND commit: 6de83c6 (test — brave-live.mjs)

---
*Phase: 08-api-integration-scaffold*
*Completed: 2026-06-03*
