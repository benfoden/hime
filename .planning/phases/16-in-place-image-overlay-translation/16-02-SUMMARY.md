---
phase: 16-in-place-image-overlay-translation
plan: "02"
subsystem: service-worker/ocr-provider
tags: [vision-ocr, image-overlay, keyed-json-batch, overlay-blocks, background-worker]
requires: ["16-01"]
provides: ["16-03", "16-04", "16-05"]
affects: ["src/providers/vision-google.ts", "src/background.ts", "src/types.ts"]
tech-stack:
  added: []
  patterns:
    - "collectParagraphBoxes delegation (OCR block extraction via Plan 01 pure module)"
    - "keyed-JSON batch translate cloned from translatePageBatch with inputKeys-only guard"
    - "captureVisibleTab fallback flag (viaCaptureFallback) — overlay skip signal"
key-files:
  created: []
  modified:
    - src/providers/vision-google.ts
    - src/background.ts
    - test/vision-google.mjs
key-decisions:
  - "Used Parameters<typeof collectParagraphBoxes>[0] cast instead of any to call collectParagraphBoxes from VisionFullTextAnnotation — keeps strict types with no escape hatch"
  - "Extended resolveImageBytes return with viaCaptureFallback rather than adding a separate flag parameter — keeps caller sites clean and the flag lives where the path decision is made"
  - "tabId in translateImageBlocks message is optional (TranslateImageBlocksMessage) — used tabId ?? 0 guard; actual tabId is always present from content script in practice"
requirements-completed: [OVL-01]
duration: "~35 min"
completed: "2026-06-22"
---

# Phase 16 Plan 02: OCR Blocks + Worker translateImageBlocks Case Summary

One-liner: Extended `ocr()` to surface paragraph blocks via `collectParagraphBoxes`, widened `downscaleAndGuard` to return submitted pixel dimensions, and added a `translateImageBlocks` worker case that OCRs an image into per-paragraph boxes and batch-translates them in one keyed-JSON round-trip.

## Duration

- Start: 2026-06-22T20:10:00Z (approx)
- End: 2026-06-22T20:46:39Z
- Duration: ~35 min
- Tasks completed: 3/3
- Files modified: 3

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | vision-google ocr() surfaces paragraph blocks + extend test | RED: 8b489bf, GREEN: 1dfea31 | Complete |
| 2 | downscaleAndGuard returns submitted dims | GREEN: 986bc50 | Complete |
| 3 | translateImageBlocks worker case (OCR + keyed-JSON batch + reply) | GREEN: f88d9f0 | Complete |

## What Was Built

### Task 1: ocr() blocks extraction (src/providers/vision-google.ts)

- Added `import { collectParagraphBoxes } from '../image-resolve.js'`
- Widened `VisionParagraph` interface with `boundingBox?: { vertices?, normalizedVertices? }`
- Widened `VisionWord` interface with `symbols?: { text?, confidence?, property?.detectedBreak? }[]`
- In `ocr()`: after the existing `annotation`/`originalText`/`confidence` lines, calls `collectParagraphBoxes(annotation as ...)` and adds the resulting `blocks` array to the returned `OcrResult`
- The v1.3 side-panel path (`originalText`, `detectedLang`, `confidence`) is unchanged (D-04)
- Test `VIS-01f` added to `test/vision-google.mjs`: 2-paragraph fixture with `boundingBox.vertices` → asserts `result.blocks.length === 2`, each with non-empty text and exactly 4 vertices

### Task 2: downscaleAndGuard submitted dims (src/background.ts)

- Widened return type from `Promise<{base64,mime}>` to `Promise<{base64,mime,width,height}>`
- Fast path (no downscale, no reencode): captures `bitmap.width/height` before `bitmap.close()` to avoid use-after-close, returns them as `width`/`height`
- Downscaled path: returns `target.width/target.height` (the submitted-to-Vision dimensions)
- The existing `runImagePipeline` caller destructures `{base64, mime}` only — extra fields are harmless

### Task 3: translateImageBlocks worker case (src/background.ts)

- Added `TranslateImageBlocksMessage` to the `import type` block
- Extended `resolveImageBytes` return type with `viaCaptureFallback: boolean` flag; paths (a) data: and (b) fetch return `false`; path (c) captureVisibleTab returns `true`
- New `case 'translateImageBlocks'`: cloned from `translatePageBatch` and adapted:
  - Keys read from storage ONLY (`s.googleApiKey`, `s.apiKeys[s.provider]`) — never from message payload (T-16-02)
  - On `viaCaptureFallback`: `sendResponse({ captureFallback: true })` (T-16-06 / Pitfall 2 — screenshot geometry unmappable)
  - OCR via `visionProvider.ocr()` → `ocrResult.blocks` (from Plan 01 + Task 1 above)
  - No-text sentinel (`ocrResult === null`) or empty blocks → `sendResponse({ blocks: [] })`
  - Keyed-JSON batch: `buildPageBatchPrompt(config)` + `provider.translate` (8s timeout race) + `parsePageBatchReply(result.text, inputKeys)` — one round-trip
  - `inputKeys`-only guard (T-16-04): model-invented keys never read
  - Missing key → `translated = block.text` (original fallback, mirrors page-walk.ts:166)
  - Reply: `{ blocks: [{box,original,translated}], submitted: {w,h} }` — submitted dims required by `mapBox()` downscale-undo (RESEARCH Pitfall 1)
  - Error path: `classifyError` → `{ error, kind }` mirroring translatePageBatch
  - `recordUsage` for both OCR + translation

## Verification Results

All acceptance criteria pass:

```
✔ node --test test/vision-google.mjs — 9 pass, 0 fail (VIS-01f new test passes)
✔ grep -q 'collectParagraphBoxes' src/providers/vision-google.ts
✔ grep -q 'boundingBox' src/providers/vision-google.ts
✔ npx tsc --noEmit — no errors
✔ grep -A2 'return { base64' src/background.ts | grep -q 'width'
✔ npm test — 216 tests, 214 pass, 2 skipped (opt-in live tests), 0 fail
✔ grep -q "case 'translateImageBlocks'" src/background.ts
✔ grep -q 'parsePageBatchReply' src/background.ts
```

Manual key-law confirmation: the `translateImageBlocks` case references `apiKey`/`googleKey` ONLY in guard checks and provider call — never inside a `sendResponse` object literal (T-12-01 / T-16-02 upheld).

## Deviations from Plan

None - plan executed exactly as written.

The `Parameters<typeof collectParagraphBoxes>[0]` cast in `vision-google.ts` is the cleanest way to pass the local `VisionFullTextAnnotation` (which has the same structural shape as `image-resolve.ts`'s internal `FullTextAnnotation`) without exposing private types or using `any`. TypeScript verifies this structurally and `tsc --noEmit` passes with no errors.

## Known Stubs

None — all data paths are wired to live Vision API responses and LLM translations.

## Threat Flags

No new threat surface beyond what the plan's `<threat_model>` already covers. The `resolveImageBytes` change adds a `viaCaptureFallback` boolean to the return — this is only read internally in the worker, never sent to any external party.

## Self-Check: PASSED

- `src/providers/vision-google.ts` — exists, contains `collectParagraphBoxes` and `boundingBox`
- `src/background.ts` — exists, contains `case 'translateImageBlocks'` and `viaCaptureFallback`
- `test/vision-google.mjs` — exists, contains `VIS-01f`
- Commits confirmed: 8b489bf, 1dfea31, 986bc50, f88d9f0
- `npm test` — 216 tests, 0 fail
