---
phase: 12-image-ocr-pipeline-right-click-side-panel
plan: 02
subsystem: vision-provider
tags: [vision, ocr, translation-v2, provider, byok, tdd]
requires:
  - VisionProvider
  - ImageResult
  - languageToIso
  - classifyError
  - "src/panel-mock.ts fixtures"
provides:
  - GoogleVisionProvider
  - VISION_ENDPOINT
  - TRANSLATE_V2_ENDPOINT
  - "VisionProvider.ocrTranslate no-text sentinel (null)"
affects:
  - src/providers/vision-google.ts
  - src/types.ts
  - test/vision-google.mjs
tech-stack:
  added: []
  patterns:
    - "Two-call, one-key cloud provider behind a single ocrTranslate() method"
    - "?key= auth via URL.searchParams.set (encoded, never logged) — brave-search.ts doctrine"
    - "Per-call AbortController/timeout (~12s each) to stay under the MV3 30s ceiling (A5)"
    - "Distinct no-text sentinel (null) short-circuits before translation, never throws (Pitfall 4)"
key-files:
  created:
    - src/providers/vision-google.ts
    - .planning/phases/12-image-ocr-pipeline-right-click-side-panel/12-02-SUMMARY.md
  modified:
    - test/vision-google.mjs
    - src/types.ts
decisions:
  - "VisionProvider.ocrTranslate return widened to ImageResult | null (Plan 01 had ImageResult). The no-text sentinel is null; the worker maps it to TranslateImageResponse { noText: true }. Returning null (vs throwing) keeps the no-text path off the error channel per Pitfall 4."
  - "Detected language prefers Translation v2's detectedSourceLanguage (reflects what was actually translated), falling back to Vision pages[0].property.detectedLanguages[0].languageCode (RESEARCH Open Question 1)."
  - "Mean word-level confidence is a private helper in the provider (self-contained for its own test); the canonical exported meanWordConfidence lands in image-resolve.ts (Plan 03) and the worker may prefer it."
  - "usage populated as char counts (originalText.length / translatedText.length) so the worker's recordUsage('google-vision', ...) has data; Google REST returns no token usage."
metrics:
  duration: ~15 min
  completed: 2026-06-21
  tasks: 2
  files_changed: 3
---

# Phase 12 Plan 02: Google Vision Provider Summary

Implemented `GoogleVisionProvider` — the two-call, one-key Google Cloud provider that OCRs an image via Vision `images:annotate` (DOCUMENT_TEXT_DETECTION) then translates the extracted text via Cloud Translation v2, both authenticated with the same BYOK key via `?key=`, hidden behind a single `VisionProvider.ocrTranslate`. Built TDD: the Plan 01 test scaffold was completed to pin the full contract (RED), then the provider was written to pass it (GREEN).

## What Shipped

- **Task 1 — RED tests (`95638f3`):** fleshed out `test/vision-google.mjs` to five fetch-mocked cases pinning the full contract. Happy path asserts call 1 targets `VISION_ENDPOINT` with `?key=` and a `DOCUMENT_TEXT_DETECTION` body whose `image.content` is the raw base64 with NO `data:` prefix; call 2 targets `TRANSLATE_V2_ENDPOINT` with `?key=`, `q` (verbatim OCR text, newline kept), `target: 'en'` (from display name `'English'`), `format: 'text'`, and NO `source`; the mapped `ImageResult` carries `originalText` (newline preserved), `translatedText`, `detectedLang: 'ja'` (from `detectedSourceLanguage`), high confidence, and `usage`. Plus: no-text short-circuit (exactly one fetch call, no-text sentinel, no throw); low-confidence reports `< 0.60`; a 403 rejects with `.kind === 'auth'` via `classifyError('google')`; and the key never appears in a thrown error's message/stack (IMG-07). Confirmed RED — all five failed with `ERR_MODULE_NOT_FOUND` before the subject existed.
- **Task 2 — GREEN implementation (`7db4206`):** wrote `src/providers/vision-google.ts`. Exports `VISION_ENDPOINT`, `TRANSLATE_V2_ENDPOINT`, and `class GoogleVisionProvider implements VisionProvider` (`name = 'google'`). `ocrTranslate` builds each URL with `new URL(...)` + `searchParams.set('key', apiKey)` (auto-encoded, never interpolated/logged), POSTs the Vision body, short-circuits to `null` when `fullTextAnnotation` is absent/empty (no Translation v2 call, no throw), otherwise computes mean word-level confidence, POSTs the Translation v2 body (`format: 'text'`, source omitted), and returns the normalized `ImageResult`. A private `postJson` helper wraps the openai.ts AbortController/timeout/try-catch shape: fetch throw → `classifyError('google', err)`; `!response.ok` → extract `body.error.message` → `classifyError('google', null, { status, bodyMessage })`, attaching `.kind`/`.status` to the thrown Error. Each call gets its own ~12s AbortController/timeout (A5) so the sequence stays under the MV3 30s ceiling.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Widened `VisionProvider.ocrTranslate` return to `ImageResult | null`**
- **Found during:** Task 2 (`npm run build`)
- **Issue:** Plan 01 declared `ocrTranslate(...): Promise<ImageResult>`, but the plan's own contract (and Task 1 case 2) requires a distinct no-text sentinel returned WITHOUT throwing (Pitfall 4). Returning `null` triggered `tsc` TS2416 — `null` not assignable to `ImageResult`.
- **Fix:** Widened the interface return to `Promise<ImageResult | null>` in `src/types.ts` and documented `null` as the no-text sentinel the worker maps to `TranslateImageResponse { noText: true }` (which already models no-text via its optional `noText` field). This is the minimal change that keeps no-text off the error channel; full suite re-run confirmed no other consumer broke.
- **Files modified:** src/types.ts
- **Commit:** 7db4206 (committed with the GREEN implementation)

## TDD Gate Compliance

- RED gate: `test(12-02): ...` at `95638f3` — five cases failed with `ERR_MODULE_NOT_FOUND` (subject absent), confirming the tests exercise the contract before implementation.
- GREEN gate: `feat(12-02): ...` at `7db4206` — all five pass.
- REFACTOR gate: not needed; the implementation shipped clean (private helpers already factored).

## Known Stubs

None. The provider is fully wired end-to-end. The private `meanWordConfidence` helper is intentional duplication that Plan 03's exported canonical version supersedes at the worker (documented in the plan and in a code comment), not a stub.

## Threat Flags

None. No new security surface beyond the plan's `<threat_model>`. T-12-03 (key in searchParams, never logged), T-12-04 (`!response.ok` → classifyError, raw body not surfaced), and T-12-05 (per-call timeout) are all implemented as specified; Task 1 case 5 asserts T-12-03 directly.

## Notes for Downstream Plans

- The no-text sentinel is `null` (return value), not a thrown error and not an empty-`originalText` object. Plan 05's worker should map a `null` return from `ocrTranslate` to `TranslateImageResponse { noText: true }`.
- `detectedLang` already prefers Translation v2's `detectedSourceLanguage` with a Vision fallback — the panel's "Detected: X → Y" line can use it directly.
- `usage` is char counts (input = OCR text length, output = translation length); the worker's `recordUsage('google-vision', ...)` consumes it. Google REST returns no token usage, so this is the available proxy.
- `mime` is currently unused by the provider (`_mime`) — Vision accepts raw base64 content regardless of MIME. Kept in the signature for interface conformance and future use (e.g., format-specific handling).
- The two unbuilt Wave 0 subjects (`dist/image-resolve.js` Plan 03, `dist/panel-render.js` Plan 04) remain RED in `npm test`; that is expected and unchanged by this plan. All other 142 tests pass (1 skip).

## Self-Check: PASSED

- FOUND: src/providers/vision-google.ts
- FOUND: test/vision-google.mjs (modified)
- FOUND: src/types.ts (modified)
- FOUND commits: 95638f3 (RED), 7db4206 (GREEN)
- `npm run build` green (tsc clean); `node --test test/vision-google.mjs` → 5/5 pass; full suite 142 pass / 1 skip / 0 fail excluding the two not-yet-built Wave 0 subjects.
