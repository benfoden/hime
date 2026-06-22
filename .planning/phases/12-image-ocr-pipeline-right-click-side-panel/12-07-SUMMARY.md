---
phase: 12-image-ocr-pipeline-right-click-side-panel
plan: 07
subsystem: vision-verification
tags: [vision, ocr, live-test, byok, checkpoint, phase-gate]
status: paused-at-checkpoint
requires:
  - GoogleVisionProvider
  - "dist/providers/vision-google.js"
provides:
  - "test/vision-live.mjs (opt-in live VIS-01 smoke)"
  - "test/fixtures/ocr-sample.png"
affects:
  - test/vision-live.mjs
  - test/fixtures/ocr-sample.png
tech-stack:
  added: []
  patterns:
    - "Opt-in live provider smoke: skips without GOOGLE_API_KEY so the default suite stays green; runs the real two-call provider against dist/ when the key is present (test law — node harness on dist/, env key, never the SW console)"
    - "Key read from process.env only, never interpolated into output or committed (T-12-19)"
key-files:
  created:
    - test/vision-live.mjs
    - test/fixtures/ocr-sample.png
    - .planning/phases/12-image-ocr-pipeline-right-click-side-panel/12-07-SUMMARY.md
  modified: []
decisions:
  - "Bundled the OCR fixture as test/fixtures/ocr-sample.png (legible Japanese こんにちは / 世界, 9KB) generated with PIL using the system Noto CJK font — gives the live OCR real CJK to detect, matching the phase's primary use case. The base64 is read from the file at run time, not embedded in the test, keeping the test readable."
  - "Used node:test's native { skip: <reason> } option keyed on GOOGLE_API_KEY presence rather than an early return, so the default `npm test` reports the live case as an explicit skip (visible, intentional) instead of a silent no-op."
  - "On a live call throw, the test asserts.fail with ONLY the provider's classified message (never the key); a 403 there typically means one of the two Google APIs is not enabled on the key's project (Open Question 2), surfaced as an explicit auth-kind failure."
metrics:
  duration: ~12 min
  completed: 2026-06-21
  tasks: 1 of 2 (Task 2 is a blocking human-verify checkpoint — not executed)
  files_changed: 2
---

# Phase 12 Plan 07: Live Provider Smoke + In-Browser Checkpoint Summary

Closed the automated half of the phase gate and reached the blocking human-verify
checkpoint. Task 1 (the opt-in LIVE provider smoke test) is built, green, and
committed. Task 2 is a `checkpoint:human-verify` with `gate="blocking"` — the six
in-browser behaviors that cannot be node-tested — and is **paused awaiting human
verification**. This plan is NOT complete; the phase is NOT done.

## What Shipped

- **Task 1 — Live provider smoke (`618424f`):** added `test/vision-live.mjs`, an
  opt-in node harness that imports the BUILT `dist/providers/vision-google.js`
  (per the test law) and, when `GOOGLE_API_KEY` is set, base64-encodes a bundled
  text-bearing fixture and calls
  `provider.ocrTranslate(base64, 'image/png', 'English', key)` against the real
  Vision + Translation v2 endpoints, asserting a non-empty `originalText`, a
  non-empty `translatedText`, and a plausible `detectedLang` code (VIS-01). With
  no key set it SKIPS cleanly via node:test's `{ skip }` option, so the default
  `npm test` stays green offline and never touches the network or a key. Added
  `test/fixtures/ocr-sample.png` (legible Japanese こんにちは / 世界, ~9KB). The
  key is read from `process.env` only, is never interpolated into output, and is
  never committed (T-12-19).

## Task 2 — Status: PAUSED at blocking checkpoint (NOT executed)

Task 2 is `type="checkpoint:human-verify" gate="blocking"` — the in-browser
end-to-end smoke (load-unpacked). It covers the behaviors that mocked unit tests
in Plans 02-06 and Task 1's live smoke cannot prove:

1. Same-origin/fetchable image → sidePanel opens synchronously inside the gesture; result fills (SC#1, SC#2).
2. Cross-origin/CDN image → resolves via the fetch→captureVisibleTab ladder, no tainted-canvas error, prepends above prior (SC#3, IMG-04, D-01).
3. Text-free image → explicit "No text found" state, never a silent blank (SC#3, IMG-05).
4. Key-in-worker invariant → DevTools page Network shows NO google call/key from the page context; calls appear only under the service worker (SC#4, IMG-07).
5. Worker-restart durability → terminate the SW, reopen the panel; results repopulate from storage.session; a fresh job still completes or errors within ~25s (SC#5).
6. Error path → broken key yields an explicit per-entry auth-kind error row, never a blank.

These require a real browser and a human observer. The executor does NOT perform
the in-browser steps and does NOT mark the phase complete. See the
`## EXECUTION CHECKPOINT` block returned to the orchestrator for the operator
verification instructions and resume signal.

## Deviations from Plan

None for Task 1 — executed exactly as written. Task 2 intentionally not executed
(blocking human-verify checkpoint, per plan and orchestrator objective).

## Verification

- `npm run build` → green (tsc clean).
- `node --test test/vision-live.mjs` (no key) → 1 test, 0 fail, 1 skipped ("set GOOGLE_API_KEY to run the live provider smoke").
- `npm test` (full suite, no key) → 157 tests, 155 pass, 0 fail, 2 skipped (the live case + one pre-existing skip). The new file keeps the default suite green offline.
- Live path (with a valid key whose project has BOTH Vision + Translation enabled): not run here — exercised by the operator via the documented oneliner `GOOGLE_API_KEY=... node --test test/vision-live.mjs`.

## Known Stubs

None. `test/vision-live.mjs` is fully wired to the shipped provider; its skip
path is an intentional default-green guard, not a stub.

## Threat Flags

None. No new security surface beyond the plan's `<threat_model>`. T-12-19 (key
from env only, never logged/committed) is implemented as specified; T-12-20 /
T-12-21 are the human-verify checkpoint's responsibility (Task 2, pending).

## Self-Check: PASSED

- FOUND: test/vision-live.mjs
- FOUND: test/fixtures/ocr-sample.png
- FOUND commit: 618424f (test(12-07): add opt-in live Google Vision provider smoke)
- Build green; live test skips cleanly without the key; full suite 155 pass / 2 skip / 0 fail.
- Task 2 (blocking human-verify) intentionally NOT executed — plan paused at checkpoint.
