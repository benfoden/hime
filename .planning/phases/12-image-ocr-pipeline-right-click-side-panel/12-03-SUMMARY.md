---
phase: 12-image-ocr-pipeline-right-click-side-panel
plan: 03
subsystem: image-resolve-pure-module
tags: [vision, ocr, downscale, mime-guard, confidence, state-machine, tdd, pure-module]
requires:
  - ImageEntry
  - ImageResult
  - ErrorKind
  - "src/panel-mock.ts fixtures"
provides:
  - downscaleTarget
  - targetDimensions
  - isSupportedMime
  - needsReencode
  - stripBase64Prefix
  - meanWordConfidence
  - meanConfidence
  - deriveEntryState
  - deriveImageEntry
  - LOW_CONFIDENCE_THRESHOLD
  - VISION_LONG_EDGE
  - SUPPORTED_IMAGE_MIME
affects:
  - src/image-resolve.ts
  - test/image-resolve.mjs
tech-stack:
  added: []
  patterns:
    - "Pattern law: pure node-testable math module (no chrome.*/document); browser OffscreenCanvas calls stay in the SW (Plan 05)"
    - "Confidence fallback ladder word→symbol→page→0 over a Vision fullTextAnnotation"
    - "Result-state derivation forces explicit no-text / low-confidence / error — never a silent blank (IMG-05 / D-04)"
    - "Dual API surface: scaffold names (targetDimensions/deriveEntryState/meanConfidence over a raw response) plus contract names (downscaleTarget/deriveImageEntry/meanWordConfidence) for the SW call site"
key-files:
  created:
    - src/image-resolve.ts
    - .planning/phases/12-image-ocr-pipeline-right-click-side-panel/12-03-SUMMARY.md
  modified:
    - test/image-resolve.mjs
decisions:
  - "Implemented BOTH API surfaces the contract demanded: the Plan 01 scaffold's committed RED names (targetDimensions / deriveEntryState / meanConfidence — operate on a raw Vision response) AND the Plan 03 must_haves exports (downscaleTarget / deriveImageEntry / meanWordConfidence / needsReencode / stripBase64Prefix). downscaleTarget defaults targetDimensions to VISION_LONG_EDGE; meanConfidence delegates to meanWordConfidence over responses[0].fullTextAnnotation."
  - "VISION_LONG_EDGE = 2048 (A2): keeps the re-encoded base64 JSON under Vision's 10 MB / 75M-px limits with aspect preserved and no upscaling."
  - "SUPPORTED_IMAGE_MIME = {png,jpeg,webp,gif,bmp,tiff}; svg+xml and avif excluded → needsReencode true so the SW (Plan 05) re-encodes to PNG (T-12-08)."
  - "stripBase64Prefix matches ^data:[^,]*;base64, so a charset segment (data:...;charset=...;base64,) still strips at the correct comma; a bare base64 string passes through unchanged."
metrics:
  duration: ~15 min
  completed: 2026-06-21
  tasks: 2
  files_changed: 2
---

# Phase 12 Plan 03: image-resolve Pure Module Summary

DOM-agnostic, node-testable image pre-flight + result-state logic — long-edge downscale math (VIS-03), MIME guard + re-encode flagging, base64 prefix stripping, mean word-confidence, and the IMG-05/D-04 per-entry state derivation — all pure with no `chrome.*`/`document`, shipped GREEN against `dist/`.

## What Was Built

`src/image-resolve.ts` (pure, imported by both the SW's OffscreenCanvas wiring in Plan 05 and the node harness):

- **Constants:** `LOW_CONFIDENCE_THRESHOLD = 0.6` (D-04/A1), `VISION_LONG_EDGE = 2048` (A2), `SUPPORTED_IMAGE_MIME` (png/jpeg/webp/gif/bmp/tiff).
- **Downscale math:** `targetDimensions(w, h, maxEdge)` and `downscaleTarget(w, h)` — long-edge cap, aspect preserved, no upscaling, `scaled` flag. Keeps payloads under Vision's 10 MB / 75M-px limits (T-12-06).
- **MIME guard:** `isSupportedMime(mime)` (case-insensitive) and `needsReencode(mime)` — flags svg+xml/avif/unsupported for PNG re-encode in the SW (T-12-08).
- **Prefix strip:** `stripBase64Prefix(s)` → Vision's bare-base64 content form.
- **Confidence:** `meanWordConfidence(fullTextAnnotation)` with a word→symbol→page→0 fallback ladder; `meanConfidence(visionResponse)` over `responses[0].fullTextAnnotation`.
- **State derivation:** `deriveEntryState(visionResponse)` → `'no-text' | 'populated' | 'low-confidence'`; `deriveImageEntry({ id, thumbnailUrl?, ocr?, error? })` → the `ImageEntry` union. Low confidence is a *populated* entry flagged `lowConfidence: true`, never a blank (IMG-05 / D-04 / T-12-07).

`test/image-resolve.mjs` fleshed out from the Plan 01 scaffold: five groups (MIME guard + re-encode, downscale long-edge math, base64 strip, confidence word/symbol/page, and the deriveImageEntry no-text/populated/low-confidence/error union).

## TDD Cycle

- **RED** (`24fd24c`): completed the scaffold with all five VIS-03 / IMG-05 groups; verified failing with `ERR_MODULE_NOT_FOUND` (subject absent) — matches the verify grep `fail [1-9]|tests [1-9]`.
- **GREEN** (`ce5786f`): implemented `src/image-resolve.ts`; all 5 image-resolve tests pass.
- **REFACTOR:** none needed — module was clean on first GREEN.

## Verification

- `npm run build && node --test test/image-resolve.mjs` → tests 5, pass 5, fail 0.
- Module imports cleanly under node (no chrome/document references), proving the Pattern law.
- `key_links` pattern `downscaleTarget|deriveImageEntry` present in `src/image-resolve.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reconciled the committed scaffold API with the PLAN's required exports**
- **Found during:** Task 1 (reading the Plan 01 scaffold).
- **Issue:** The committed `test/image-resolve.mjs` scaffold pins a RED contract using `targetDimensions(w, h, maxEdge)`, `deriveEntryState(visionResponse) → string`, and `meanConfidence(visionResponse)` (operating on a raw Vision response). The PLAN's `must_haves.artifacts` and `<artifacts_this_phase_produces>` instead require `downscaleTarget(w, h)`, `deriveImageEntry({...}) → ImageEntry`, and `meanWordConfidence(fullTextAnnotation)`, plus `needsReencode` and `stripBase64Prefix`. A subject satisfying only one surface would leave the other's tests RED.
- **Fix:** Implemented BOTH surfaces in `src/image-resolve.ts` — the scaffold names as the raw-response wrappers and the PLAN names as the contract API. `downscaleTarget` defaults `targetDimensions` to `VISION_LONG_EDGE`; `meanConfidence` delegates to `meanWordConfidence` over `responses[0].fullTextAnnotation`. The fleshed-out test asserts both. This satisfies the committed RED scaffold, the PLAN's required exports, and the `key_links` pattern simultaneously.
- **Files modified:** `src/image-resolve.ts`, `test/image-resolve.mjs`.
- **Commits:** `24fd24c` (test), `ce5786f` (impl).

## Out of Scope (not touched)

Running the full `npm test` shows 7 failures in sibling Wave-0 RED scaffolds — `test/vision-google.mjs` (VIS-01, subject lands Plan 02) and `test/panel-render.mjs` (IMG-02/03/05, subject lands Plan 04). These are the expected lazy-import RED scaffolds documented in STATE (Nyquist rule); their `dist/` subjects do not exist yet and are owned by other plans. Not caused by this plan and intentionally not fixed.

## Threat Model Coverage

- **T-12-06** (oversized image DoS): `downscaleTarget` long-edge cap keeps the payload under Vision limits before send. ✓
- **T-12-07** (confident garbage): `deriveEntryState` / `deriveImageEntry` force explicit no-text / low-confidence / error states. ✓
- **T-12-08** (exotic MIME): `needsReencode` routes svg+xml/avif/unsupported to PNG re-encode in the SW. ✓

No new threat surface introduced (pure math module, no I/O).

## Known Stubs

None. All exported functions are fully implemented and tested; no placeholder/empty-value stubs.

## Self-Check: PASSED

- Files: `src/image-resolve.ts`, `test/image-resolve.mjs`, `12-03-SUMMARY.md` all present.
- Commits: `24fd24c` (RED test), `ce5786f` (GREEN impl) both in git history.
