---
phase: 12-image-ocr-pipeline-right-click-side-panel
plan: 01
subsystem: types-and-build-foundation
tags: [types, build, test-scaffold, vision, chrome-types]
requires: []
provides:
  - VisionProvider
  - ImageResult
  - ImageEntry
  - ImageState
  - TranslateImageMessage
  - TranslateImageResponse
  - "MessageType:translateImage"
  - "Settings.googleApiKey"
  - languageToIso
  - "src/panel-mock.ts fixtures"
  - "@types/chrome sidePanel.open()"
affects:
  - src/types.ts
  - src/options.ts
  - package.json
tech-stack:
  added:
    - "@types/chrome ^0.0.304 (dev-only; was ^0.0.246)"
  patterns:
    - "Display-name → ISO-639-1 lookup with graceful fallback (A3)"
    - "Discriminated unions for per-entry + panel-level render state"
    - "Lazy dynamic-import test scaffolds so Wave 0 RED files still run/discover"
key-files:
  created:
    - src/panel-mock.ts
    - test/vision-google.mjs
    - test/image-resolve.mjs
    - test/panel-render.mjs
    - .planning/phases/12-image-ocr-pipeline-right-click-side-panel/12-01-SUMMARY.md
  modified:
    - src/types.ts
    - src/options.ts
    - package.json
    - package-lock.json
decisions:
  - "Bumped @types/chrome to ^0.0.304 (not the planned ^0.0.258) because 0.0.258 still lacks sidePanel.open(); 0.0.304 declares it and tsc accepts chrome.sidePanel.open({ tabId })."
  - "languageToIso uses region-qualified codes for Chinese (zh-CN / zh-TW) since Translation v2 distinguishes Simplified vs Traditional."
  - "Wave 0 test files import subjects lazily (loadProvider/loadResolve/loadRenderer) so each file is discovered and runs RED instead of crashing at top-level import while fixtures still load eagerly."
metrics:
  duration: ~25 min
  completed: 2026-06-21
  tasks: 3
  files_changed: 8
---

# Phase 12 Plan 01: Types and Build Foundation Summary

Established the interface-first contract for the v1.3 image-OCR pipeline: the `VisionProvider`/`ImageResult` types, per-entry and panel-level render-state discriminated unions, the `translateImage` message pair, a `googleApiKey` setting, a display-name→ISO-639 language map, the `@types/chrome` bump that lets `tsc` accept `chrome.sidePanel.open()`, and the three Wave 0 test scaffolds plus their mock fixtures.

## What Shipped

- **Task 1 — `@types/chrome` bump (`af553ae`):** raised the dev dependency to `^0.0.304`. The planned `^0.0.258` floor proved insufficient — 0.0.258 still lacks `open()` in the `sidePanel` namespace. 0.0.304 declares `export function open(...)`; a throwaway `tsc --noEmit` against `chrome.sidePanel.open({ tabId })` exits clean. Dev-only, zero runtime deps added.
- **Task 2 — type contracts + `languageToIso` (`d72a61f`):** added `VisionProvider`, `ImageResult`, `ImageEntry` (loading/populated/no-text/error; low-confidence is a populated flag per D-04), `ImageState` (empty/list), `'translateImage'` on the `MessageType` union, `TranslateImageMessage`/`TranslateImageResponse`, `Settings.googleApiKey` (+ `DEFAULT_SETTINGS` default `''`), and `languageToIso()` over `SUPPORTED_LANGUAGES` with a graceful fallback. Verified: `English→en`, `Japanese→ja`, `Chinese (Simplified)→zh-CN`, every supported language non-empty, unknown→lowercased-trimmed input, blank→`en`, `migrateSettings({}).googleApiKey === ''`.
- **Task 3 — Wave 0 test scaffolds + fixtures (`31690b0`):** `src/panel-mock.ts` exports `VISION_POPULATED`, `VISION_EMPTY`, `VISION_LOW_CONFIDENCE`, `TRANSLATE_V2_SAMPLE`, `XSS_PROBE` (plus a convenience `IMAGE_RESULT_POPULATED`). Three `test/*.mjs` files pin the VIS-01 / VIS-03 / IMG-02-03-05 contracts. All ten tests are discovered and run RED (their subjects ship in Plans 02–04), satisfying the Nyquist rule that no subject ships untested.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `@types/chrome` floor raised past the planned version**
- **Found during:** Task 1
- **Issue:** The plan specified `^0.0.258` (or later) but 0.0.258's `sidePanel` namespace still lacks `open()`. The plan's own verify regex (4000-char window from the namespace) also under-shot the declaration, which sits 4476 chars in.
- **Fix:** Bumped to `^0.0.304`, which declares `sidePanel.open()`. Confirmed via a real `tsc` check on `chrome.sidePanel.open({ tabId })`, not just a substring regex.
- **Files modified:** package.json, package-lock.json
- **Commit:** af553ae

**2. [Rule 3 - Blocking] `options.ts` Settings literal needed `googleApiKey`**
- **Found during:** Task 2 (`npm run build`)
- **Issue:** Adding the required `Settings.googleApiKey` field broke `src/options.ts:217`, which constructs a full `Settings` literal in `saveSettings()`. `tsc` error TS2741.
- **Fix:** Carry the persisted `currentSettings.googleApiKey` through `saveSettings()` (braveApiKey precedent). No options-page input exists yet — that UI lands in a later Phase 12 plan; carrying the value through ensures saving settings never clears it.
- **Files modified:** src/options.ts
- **Commit:** d72a61f (committed with the type contracts)

## Known Stubs

None. The empty-string `googleApiKey` default is the documented zero-state (braveApiKey precedent), not a stub — the options-page input and worker read-site are scheduled for later Phase 12 plans.

## Notes for Downstream Plans

- The three Wave 0 test files are intentionally RED until their subjects exist. `npm test` (the full suite) will show 10 failures from these files until Plans 02–04 land `dist/providers/vision-google.js`, `dist/image-resolve.js`, and `dist/panel-render.js`. Do not "fix" them by deleting assertions — implement the subjects to satisfy the pinned contracts.
- The test scaffolds encode the expected public surfaces: `GoogleVisionProvider` + `VISION_ENDPOINT` + `TRANSLATE_V2_ENDPOINT` (Plan 02); `isSupportedMime`, `targetDimensions`, `deriveEntryState`, `meanConfidence` (Plan 03); `renderPanel(state, doc, mount)` with `.panel-entry` / `.amber`|`.low-confidence` / `.pre-wrap`|`.panel-text` classes (Plan 04). The no-text sentinel shape from Plan 02 is left flexible (null / `noText:true` / empty `originalText`).
- `T-12-01` (key in worker only) and `T-12-02` (XSS) are seeded but enforced later: `googleApiKey` is defined here as a top-level Settings field; `XSS_PROBE` is seeded for Plan 04's renderer test.

## Self-Check: PASSED

- FOUND: src/panel-mock.ts, test/vision-google.mjs, test/image-resolve.mjs, test/panel-render.mjs
- FOUND commits: af553ae, d72a61f, 31690b0
- `npm run build` green; `languageToIso`/`googleApiKey` inline checks pass; three test files discovered and run (10 tests, RED as expected).
