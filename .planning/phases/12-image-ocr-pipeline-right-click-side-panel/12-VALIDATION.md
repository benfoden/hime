---
phase: 12
slug: image-ocr-pipeline-right-click-side-panel
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-20
updated: 2026-06-21
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in node test runner, .mjs harness on dist/) + linkedom for DOM |
| **Config file** | none — package.json `test` script (`tsc && node --test 'test/**/*.mjs'`) |
| **Quick run command** | `npm run build && node --test test/<touched>.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** `npm run build && node --test test/<touched>.mjs`
- **After every plan wave:** `npm test`
- **Before `/gsd-verify-work`:** Full suite green + Plan 07 manual checkpoint approved + (optional) live provider smoke with a real key
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-1 @types/chrome bump | 12-01 | 1 | VIS-01 (build gate) | T-12-SC | dev-only first-party bump; no runtime dep | build/grep | `npm run build` + index.d.ts grep | ✅ (this plan) | ⬜ pending |
| 01-2 type contracts + languageToIso | 12-01 | 1 | VIS-01, IMG-02, IMG-03 | T-12-01 | googleApiKey field documented worker-only | unit (inline node) | `npm run build` + languageToIso/default checks | ✅ | ⬜ pending |
| 01-3 Wave 0 scaffolds + mocks | 12-01 | 1 | VIS-01, VIS-03, IMG-02/03/05 | T-12-02 | seeds XSS_PROBE fixture | scaffold | `node --test test/{vision-google,image-resolve,panel-render}.mjs` | ✅ | ⬜ pending |
| 02-1 RED vision tests | 12-02 | 2 | VIS-01, IMG-07 | T-12-03 | asserts key absent from errors | unit (fetch-mock) | `node --test test/vision-google.mjs` | ✅ | ⬜ pending |
| 02-2 GREEN GoogleVisionProvider | 12-02 | 2 | VIS-01, IMG-02/03/05, IMG-07 | T-12-03/04/05 | ?key= auto-encoded, classifyError, no leak | unit (fetch-mock) | `npm test` | ✅ | ⬜ pending |
| 03-1 RED image-resolve tests | 12-03 | 2 | VIS-03, IMG-05 | T-12-06/07 | size cap + state derivation | unit | `node --test test/image-resolve.mjs` | ✅ | ⬜ pending |
| 03-2 GREEN image-resolve | 12-03 | 2 | VIS-03, IMG-05 | T-12-06/07/08 | downscale guard, no-blank derivation | unit | `npm test` | ✅ | ⬜ pending |
| 04-1 RED panel-render tests | 12-04 | 2 | IMG-02/03/05 | T-12-09/10 | XSS probe, explicit states | unit (linkedom) | `node --test test/panel-render.mjs` | ✅ | ⬜ pending |
| 04-2 GREEN panel-render | 12-04 | 2 | IMG-02/03/05 | T-12-09/10 | textContent-only, prepend, exhaustive | unit (linkedom) | `npm test` | ✅ | ⬜ pending |
| 05-1 manifest + contextMenus + gesture | 12-05 | 3 | IMG-01 | T-12-12 | sync-first sidePanel.open; scoped hosts | source/grep | `npm run build` + manifest/background grep | ✅ | ⬜ pending |
| 05-2 translateImage case + ladder + downscale + session | 12-05 | 3 | IMG-04/05/07, VIS-03 | T-12-11..15 | key worker-only; durable state; capture fallback | source/grep + suite | `npm test` + background grep | ✅ | ⬜ pending |
| 06-1 sidepanel.html/css | 12-06 | 4 | IMG-02/03/05 | T-12-16 | pre-wrap + amber styled | build/grep | `npm run build` + html/css grep | ✅ | ⬜ pending |
| 06-2 sidepanel.ts wiring | 12-06 | 4 | IMG-02/03/05 | T-12-16/17/18 | textContent render; rebuild-on-open; no key | source/grep + suite | `npm test` + sidepanel grep | ✅ | ⬜ pending |
| 07-1 live provider smoke (opt-in) | 12-07 | 5 | VIS-01, VIS-03 | T-12-19 | env key, skips offline, no log | live unit (opt-in) | `node --test test/vision-live.mjs` (skips w/o key) | ✅ | ⬜ pending |
| 07-2 in-browser end-to-end | 12-07 | 5 | IMG-01/04/07 | T-12-20/21 | gesture, fallback, no-text, key-in-worker, restart | manual checkpoint | n/a (human-verify) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Sampling continuity:** No 3 consecutive code-producing tasks lack an automated verify — every Wave 1-4 task has an `<automated>` command. Wave 5 mixes one automated (07-1) with the manual gate (07-2).

---

## Wave 0 Requirements

Created in Plan 12-01 Task 3 (the test files exist before their subjects ship; RED on subject-missing assertions is acceptable until Waves 2-4 land):

- [ ] `test/vision-google.mjs` — VIS-01 (fetch-mocked request shapes + response→ImageResult mapping + no-text short-circuit + key-safety) — completed in 12-02
- [ ] `test/image-resolve.mjs` — VIS-03 + result-state derivation (downscale math, MIME guard, prefix strip, mean confidence, no-text/<0.60/error) — completed in 12-03
- [ ] `test/panel-render.mjs` — IMG-02/03/05 render states (linkedom; populated/no-text/low-confidence/error; prepend D-01; breaks D-02; XSS) — completed in 12-04
- [ ] `src/panel-mock.ts` — Vision populated/empty/low-confidence + Translation v2 sample + XSS_PROBE fixtures (mirrors `search-mock.ts`)

Framework install: none — `node:test` + `linkedom` already present. The only dependency change is the dev-only `@types/chrome` bump (12-01 Task 1).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Side panel opens within the click gesture (no "user gesture" error) | IMG-01 | `chrome.sidePanel.open()` gesture timing only reproduces in a real browser; gesture is consumed by any `await` (Pitfall 1) | Plan 07 Task 2 step 1 — right-click an image, confirm immediate panel open |
| Cross-origin / tainted-canvas image resolves via fetch-or-capture fallback | IMG-04 | host_permissions fetch + `captureVisibleTab` crop only run in a real extension context against real CDN/CORS | Plan 07 Task 2 step 2 — right-click a hotlink-protected/CDN image, confirm a result (no SecurityError, no blank) |
| Text-free image → explicit "no text found" | IMG-05 | requires a live Vision response on a real image; the empty-annotation path | Plan 07 Task 2 step 3 — right-click a logo/photo, confirm the no-text state |
| Key read only in the worker; never in a page-context request | IMG-07 | only observable in DevTools across the page vs SW contexts | Plan 07 Task 2 step 4 — inspect the page Network tab; confirm no Google call/key there |
| Worker-restart durability (storage.session rebuild) | IMG-05 (no hang) | MV3 SW termination + rehydration only reproduces in-browser | Plan 07 Task 2 step 5 — terminate the SW, reopen panel, confirm results repopulate; new job completes/errors within ~25s |
| Real image OCRs + translates end-to-end | VIS-01 | needs a live BYOK key + a real image | Plan 07 Task 1 (automated, opt-in, node harness on dist/ with `GOOGLE_API_KEY`) + Task 2 step 1 (in-browser) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or a justified manual checkpoint (07-2) backed by an automated sibling (07-1) and the Wave 0 suites
- [x] Sampling continuity: no 3 consecutive code-producing tasks without automated verify
- [x] Wave 0 covers all MISSING references (vision-google / image-resolve / panel-render + panel-mock)
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready (pending execution)
