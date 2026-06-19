---
phase: 11-page-wiring-popup-entry
plan: "01"
subsystem: api
tags: [typescript, chrome-extension, background-worker, translation, brave-search, query-translation]

requires:
  - phase: 10-translation-pipeline
    provides: provider.translate pattern, recordUsage, TranslationConfig, 8s timeout/race pattern from translateBatch
  - phase: 08-api-integration-scaffold
    provides: BraveSearchClient, searchTranslated handler skeleton, SearchTranslatedResponse, inFlightSearches dedup map

provides:
  - buildQueryTranslateConfig pure helper (explicit-direction, no auto-flip, D-02)
  - SearchTranslatedResponse extended with translatedQuery + translationFailed fields
  - searchTranslated handler translates query worker-side before Brave search; returns translatedQuery

affects:
  - 11-03 (page consumes translatedQuery + translationFailed for disclosure line)
  - any plan reading SearchTranslatedResponse type

tech-stack:
  added: []
  patterns:
    - "Explicit-direction query translation: buildQueryTranslateConfig takes sourceLanguage/targetLanguage verbatim — never auto-flip via jpPattern"
    - "LLM failure degrades silently: translationFailed=true + raw Brave search fallback, no error response to page (D-10)"
    - "Pure worker-side module pattern: query-translate.ts has no chrome.* imports (mirrors translate-batch.ts)"
    - "8s Promise.race timeout for LLM calls in searchTranslated (reused from translateBatch)"

key-files:
  created:
    - src/query-translate.ts
    - test/query-translate.mjs
  modified:
    - src/types.ts
    - src/background.ts

key-decisions:
  - "buildQueryTranslateConfig does NOT carry customPrompt — query search uses neutral translation, mirroring the batch-path omission"
  - "LLM key absence (no llmApiKey/provider) treated same as LLM failure: translationFailed=true, raw query used — user still gets results"
  - "Dedup key uses searchQuery (translated) not raw query — ensures in-flight reuse matches what is actually searched"

patterns-established:
  - "D-02: explicit-direction config helper keeps source/target verbatim — never infer from text content"
  - "D-10: LLM failure path never sends an error response; degraded results are always returned"

requirements-completed: [SRCH-02]

duration: 18min
completed: 2026-06-19
---

# Phase 11 Plan 01: Query Translation Worker Extension Summary

**Worker-side query translation wired into searchTranslated: explicit source→target LLM call before Brave search, translatedQuery and translationFailed returned to page, with raw-query fallback on LLM failure**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-19T21:00:00Z
- **Completed:** 2026-06-19T21:18:00Z
- **Tasks:** 2 (Task 1 TDD: RED + GREEN; Task 2 implementation)
- **Files modified:** 4

## Accomplishments

- Created `src/query-translate.ts`: pure, Chrome-API-free module exporting `buildQueryTranslateConfig(sourceLanguage, targetLanguage, formality)` with explicit-direction contract (no jpPattern flip, D-02)
- Extended `SearchTranslatedResponse` in `src/types.ts` with `translatedQuery?: string` (D-04) and `translationFailed?: boolean` (D-10)
- Updated `case 'searchTranslated'` in `src/background.ts` to translate query via LLM before Brave fetch when source != target, with 8s timeout, usage recording, and silent fallback on failure
- 7 new query-translate tests; full suite 128 pass / 1 skip (Brave live test)

## Task Commits

1. **Task 1 RED — test/query-translate.mjs** - `126868b` (test)
2. **Task 1 GREEN — src/query-translate.ts + src/types.ts** - `26abe46` (feat)
3. **Task 2 — src/background.ts** - `14556d1` (feat)

## Files Created/Modified

- `src/query-translate.ts` — Pure explicit-direction TranslationConfig builder; exported `buildQueryTranslateConfig`
- `src/types.ts` — `SearchTranslatedResponse` extended with `translatedQuery?` and `translationFailed?`
- `src/background.ts` — `case 'searchTranslated'` now translates query worker-side; both success sendResponse calls return `{ results, direct, translatedQuery, translationFailed }`
- `test/query-translate.mjs` — 7 tests covering D-02 explicit-direction contract, no-flip guarantee, formality passthrough, and no-customPrompt invariant

## Decisions Made

- `buildQueryTranslateConfig` omits `customPrompt` to match batch-path omission — neutral translation for query search
- Missing LLM key/provider treated identically to LLM throw: `translationFailed=true`, raw query used (no double-code-path)
- `dedupKey` computed from `searchQuery` (post-translation) so in-flight dedup keying matches the actual Brave request

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — TypeScript compiled cleanly on first attempt; all tests passed on first run.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `translatedQuery` and `translationFailed` fields are now returned by the worker on every `searchTranslated` response
- Plan 03 can immediately consume these fields to render the disclosure line (D-04/D-05)
- No blockers

---
*Phase: 11-page-wiring-popup-entry*
*Completed: 2026-06-19*
