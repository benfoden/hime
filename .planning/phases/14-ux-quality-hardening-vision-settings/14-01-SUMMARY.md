---
phase: 14-ux-quality-hardening-vision-settings
plan: "01"
subsystem: image-pipeline
tags: [himeNum, cjk-detection, oversized-guard, type-contract, tdd]
dependency_graph:
  requires: []
  provides: [himeNum-field, verticalOrCjk-field, isCjkLang, isOversizedForVision, CJK-fixture]
  affects: [14-02, 14-03]
tech_stack:
  added: []
  patterns: [TDD-RED-GREEN, optional-field-extension, session-storage-counter, pure-math-helper]
key_files:
  created: []
  modified:
    - src/image-resolve.ts
    - src/types.ts
    - src/panel-mock.ts
    - src/background.ts
    - test/image-resolve.mjs
decisions:
  - "isCjkLang uses base-subtag (split on '-') membership test against {'ja','zh','ko','hant','hans'} — covers all Vision-returned CJK codes incl. BCP-47 variants zh-CN/zh-TW"
  - "isOversizedForVision uses base64 character count as the JSON-transmitted size (not decoded bytes) — conservative and directly matching the 10 MiB request body limit"
  - "verticalOrCjk set from isCjkLang(outcome.result.detectedLang) at the runImagePipeline call site — OCR language code is free, already present, no extra API call needed"
  - "himeNum allocated once via allocateHimeNum() in storage.session alongside IMAGE_JOBS_KEY; replays reuse persisted entry's number — never renumber"
  - "VISION_LONG_EDGE stays at 2048 — 2048x2048=4.2M px is far below 75M px cap; even a 2048x2048 JPEG stays well under 10 MiB base64; no change required"
metrics:
  duration: "~25 minutes"
  completed_date: "2026-06-21T18:19:33Z"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 5
requirements: [IMG-06]
---

# Phase 14 Plan 01: Worker Data Contract (himeNum, CJK, Oversized) Summary

Worker-side data contract for Phase 14 UX hardening: stable dedup-keyed per-image numbering (`himeNum`, D-04), CJK/vertical detection flag on populated entries (`verticalOrCjk`, D-03), and graceful "image too large" classification path (D-03a) so oversized images surface the D-02 failure card instead of an opaque throw.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| RED  | Failing tests: isCjkLang, isOversizedForVision, himeNum/verticalOrCjk | de84461 | test/image-resolve.mjs |
| 1    | Pure helpers + DeriveImageEntryInput + ImageEntry types | 991c5a6 | src/image-resolve.ts, src/types.ts |
| 2    | CJK fixture in panel-mock.ts | d5a2ee6 | src/panel-mock.ts |
| 3    | Worker wiring: himeNum counter, verticalOrCjk, oversized error | a584c1c | src/background.ts |

## What Was Built

**`src/image-resolve.ts`:**
- `VISION_MAX_PIXELS = 75_000_000` and `VISION_MAX_REQUEST_BYTES = 10_485_760` — constants from Google's published Vision limits, with inline citation comments
- `isCjkLang(langCode: string): boolean` — BCP-47 base-subtag CJK detection (ja/zh/ko, case-insensitive, strips region subtags)
- `isOversizedForVision(width, height, base64Length): boolean` — returns true when pixel count ≥ 75M or base64 length ≥ 10 MiB
- `DeriveImageEntryInput` extended with optional `himeNum?: number` and `verticalOrCjk?: boolean`
- `deriveImageEntry` threads `himeNum` onto all returned entry kinds, `verticalOrCjk` onto populated only

**`src/types.ts`:**
- `ImageEntry` union: `himeNum?: number` added to all four variants (`loading`, `populated`, `no-text`, `error`)
- `verticalOrCjk?: boolean` on the `populated` variant only
- `ProgressiveBadgeMessage.payload` extended with `himeNum: number`

**`src/panel-mock.ts`:**
- `IMAGE_RESULT_POPULATED_CJK` fixture: populated `ImageResult` with `detectedLang: 'ja'` for renderer tests in plan 14-03

**`src/background.ts`:**
- `HIME_IMAGE_NEXT_NUM_KEY = 'himeImageNextNum'` — session-scoped monotonic counter key
- `allocateHimeNum()` — reads, increments, and writes the counter atomically in `storage.session`
- `runImagePipeline`: allocates `himeNum` on first-create only; threads it through loading, no-text, populated, and error `deriveImageEntry` calls
- Replays reuse the persisted entry (which carries the original `himeNum`) — never renumber
- `verticalOrCjk = isCjkLang(outcome.result.detectedLang)` set on the populated path
- `downscaleAndGuard`: post-downscale `isOversizedForVision` check throws `{ message: 'image too large — …', kind: 'unknown' }` routed to D-02 error card
- `progressiveBadge` relay includes `himeNum: entry.himeNum ?? 0` so `content.ts` can render `[hime N]`

**`test/image-resolve.mjs`:**
- 4 new test cases: `D-03 isCjkLang`, `D-03a isOversizedForVision`, `D-04 deriveImageEntry himeNum/verticalOrCjk passthrough`

## Deviations from Plan

### Types.ts Updated in Task 1 (not Task 2)

**Found during:** Task 1 (GREEN implementation)

**Issue:** `deriveImageEntry` returns `ImageEntry` — without `himeNum?` on `ImageEntry`, TypeScript would reject the new object shapes. To produce a clean build after Task 1, `types.ts` changes (himeNum on all variants, verticalOrCjk on populated, himeNum on ProgressiveBadgeMessage) were applied at the same time as Task 1's image-resolve.ts changes.

**Fix:** All `types.ts` changes committed alongside Task 1. Task 2 verified the changes were complete and added the panel-mock fixture.

**Impact:** Task 2's commit is smaller than planned (fixture only) — no correctness impact.

## Known Stubs

None. All fields are wired from real OCR output. `IMAGE_RESULT_POPULATED_CJK` in panel-mock.ts is a test fixture intentionally mirroring `IMAGE_RESULT_POPULATED` (same content, CJK label) — its consumer is plan 14-03's renderer test.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. The "image too large" error message is worker-derived (no user PII, no API key — satisfies T-14-01). The `detectedLang` → `isCjkLang` path accepts only a boolean flag output — no eval, no URL construction, no HTML reflection (T-14-02 accepted per plan).

## Self-Check: PASSED

- [x] `src/image-resolve.ts` exports `isCjkLang`, `isOversizedForVision`, `VISION_MAX_PIXELS`, `VISION_MAX_REQUEST_BYTES` (4 matches confirmed)
- [x] `DeriveImageEntryInput` has `himeNum?` and `verticalOrCjk?`; threaded through all `deriveImageEntry` kinds
- [x] `node --test test/image-resolve.mjs` passes (8/8 tests)
- [x] `npm test` passes (167/167 tests, 2 opt-in live tests skipped)
- [x] `npm run build` exits 0 — tsc clean
- [x] `src/types.ts`: `himeNum?` on all 4 ImageEntry variants; `verticalOrCjk?` on populated; `himeNum: number` on ProgressiveBadgeMessage
- [x] `src/background.ts`: himeNum allocated once, threaded through all entry paths; verticalOrCjk from isCjkLang; isOversizedForVision raises "image too large"; progressiveBadge carries himeNum
- [x] `src/panel-mock.ts`: `IMAGE_RESULT_POPULATED_CJK` exported with `detectedLang: 'ja'`
- [x] All 4 task commits exist in git log: de84461, 991c5a6, d5a2ee6, a584c1c
