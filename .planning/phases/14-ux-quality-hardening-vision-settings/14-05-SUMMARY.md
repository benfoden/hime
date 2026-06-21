---
phase: 14-ux-quality-hardening-vision-settings
plan: "05"
subsystem: vision
tags: [vis-02, connection-test, wording-reconcile, regression-test]
dependency_graph:
  requires: []
  provides: [VIS-02-verified, testVisionKey-reconciled]
  affects: [src/options.ts, src/background.ts, test/vision-google.mjs]
tech_stack:
  added: []
  patterns: [worker-mediated-key-test, payload-less-message, key-in-storage-only]
key_files:
  modified:
    - src/options.ts
    - src/background.ts
    - test/vision-google.mjs
decisions:
  - "Vision-only probe confirmed: testConnection hits only VISION_ENDPOINT; translation runs through the LLM pipeline, not this key"
  - "Module-level and file-header comments referencing Translation v2 left intact as historical/architectural notes; only the testVisionKey handler path comments (the ones that made a 'test validates Translation' claim) were reconciled"
  - "VIS-02a enhanced with explicit no-translation.googleapis.com assertion; VIS-02b enhanced with key-free assertion for 403 path"
metrics:
  duration: "~18 minutes"
  completed_date: "2026-06-21"
  tasks_completed: 1
  tasks_total: 2
  files_changed: 3
---

# Phase 14 Plan 05: VIS-02 Vision Key Field + Connection Test — Verify & Reconcile Summary

One-liner: Worker-mediated Vision-only connection test confirmed correct; stale Vision+Translation comments reconciled in testVisionKey path; regression tests enhanced with explicit no-translation and key-free assertions.

## What Was Done

This plan is **verify-only**: the VIS-02 Google Cloud key field and connection test path already shipped (commits 0a07344, fb9395e, 269316a). No UI was rebuilt.

### Task 1: Verify + reconcile wording + enhance regression tests

**Verification result: path is correct.** The key-in-storage / payload-less worker message invariant is intact:

- `options.ts testVisionKey` (lines 350-382): saves key to storage first, sends `{ type: 'testVisionKey' }` only — no key in the payload.
- `background.ts testVisionKey case` (lines 721-740): reads `settings.googleApiKey` from storage, calls `visionProvider.testConnection(apiKey)`.
- `vision-google.ts testConnection` (lines 122-133): issues exactly ONE `fetch` to `VISION_ENDPOINT` (`?key=` in URL searchParams, never logged), rejects with classified `.kind`/`.status` error.

**No blocker found.** Only wording needed reconciling.

**Wording reconciled (comments-only, no behavioral change):**
- `src/options.ts` lines 345-350: removed "BOTH Vision + Translation v2" claim; now states "probes the Vision endpoint ONLY (translation now runs through the configured LLM provider, not this key)"
- `src/background.ts` lines 722-724: removed "Probes both Vision + Translation v2 so the test validates the same two-call path"; now states "Probes the Vision endpoint ONLY — translation runs through the configured LLM provider (not this key)"

**Regression test enhancements (`test/vision-google.mjs`):**
- File header updated to drop stale "Translation v2" description; now accurately describes Vision-only OCR + LLM-pipeline translation contract
- VIS-02a: added explicit `assert.ok(!url.includes('translation.googleapis.com'))` to pin the "never a Translation API call" contract
- VIS-02b renamed to "classified key-free auth error on a 403"; added explicit assertion that the API key string does not appear in the 403 rejection message (T-14-12)

**Automated verification:** `npm run build` exits 0; `node --test test/vision-google.mjs` — 8/8 pass.

## Commits

| Hash | Description |
|------|-------------|
| c125993 | fix(14-05): reconcile stale Vision+Translation wording in testVisionKey path |

## Checkpoint (Task 2 — awaiting human verification)

Task 2 is a `checkpoint:human-verify` requiring a live Google Cloud key test against the options page. See checkpoint block below.

## Deviations from Plan

None — plan executed exactly as written. The worker-mediated path was confirmed correct; only comment wording required reconciling. The test enhancements (explicit no-translation URL and key-free assertions) were additions within the scope of the plan's task action.

The module-level `background.ts:48` comment ("Google Vision + Translation provider (Phase 12 / v1.3)") and `vision-google.ts` file header were left intact — they are accurate architectural/historical notes describing the provider class (which still has an `ocr()` method for two-call Vision+Translation usage), not "test exercises Translation" claims in the testVisionKey path.

## Known Stubs

None. This plan does not add data-rendering components or placeholders.

## Threat Flags

No new trust boundaries introduced. This plan modifies only comments/tests.

## Self-Check: PASSED

- `src/options.ts` modified: FOUND
- `src/background.ts` modified: FOUND
- `test/vision-google.mjs` modified: FOUND
- Commit c125993: FOUND (git log --oneline shows it)
- Build: green
- Tests: 8/8 pass
