---
phase: 13-progressive-viewport-mode-cost-control-privacy-opt-in
plan: "04"
subsystem: progressive-worker
tags: [progressive, background, sidepanel, dedup, gesture, ocr, content-hash]
dependency_graph:
  requires: ["13-01", "13-02"]
  provides: ["progressiveTranslate-handler", "openImagePanel-handler", "progressiveActivity-push", "scroll-to-entry"]
  affects: ["src/background.ts", "src/sidepanel.ts"]
tech_stack:
  added: []
  patterns:
    - "runImagePipeline: factored OCR+translate body shared by right-click and progressive triggers (PROG-02 one-funnel law)"
    - "contentDedupKey over resolved bytes for authoritative content-hash dedup (PROG-03)"
    - "gesture-first sidePanel.open as first synchronous statement before any await (Pitfall 1)"
    - "best-effort sendMessage catch pattern (pushEntry precedent) for activity + scroll pushes"
key_files:
  modified:
    - src/background.ts
    - src/sidepanel.ts
decisions:
  - "Factor runImageJob body into runImagePipeline(srcUrl, tabId, dedupKey, preResolved?) so progressive jobs supply pre-resolved bytes and avoid double-fetch while right-click keeps its existing public API unchanged"
  - "progressiveTranslate resolves bytes BEFORE checking the job map so contentDedupKey (over bytes) is the authoritative dedup key — covering both re-scroll and same-image-different-URL cases (PROG-03)"
  - "openImagePanel sends scroll-to-entry push best-effort after sidePanel.open; panel handles missing row gracefully (entry may still be in-flight)"
  - "progressivePending/Done counters live at module scope in the service worker; pushProgressiveActivity() emits after every state change"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-21T15:54:04Z"
  tasks_completed: 2
  tasks_total: 3
  files_modified: 2
---

# Phase 13 Plan 04: Progressive Worker + Panel Scroll Summary

**One-liner:** Content-hash dedup over resolved bytes funnels progressive jobs through the existing Phase 12 OCR+translate pipeline, with gesture-first panel open and scroll-to-entry in the side panel.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | progressiveTranslate handler — content-hash dedup over bytes, funnel to runImageJob | 0ae0283 | src/background.ts |
| 2 | openImagePanel gesture handler + scroll-to-entry (sidepanel.ts) + progressiveActivity push | 0ae0283 | src/background.ts, src/sidepanel.ts |

## What Was Built

### background.ts changes

**runImagePipeline (factored shared body):** The body previously inlined in `runImageJob` was extracted into `runImagePipeline(srcUrl, tabId, dedupKey, preResolved?)`. The optional `preResolved` parameter lets the progressive path supply bytes it already resolved (avoiding a double-fetch), while right-click delegates via `runImageJob` which calls `runImagePipeline` with `preResolved=undefined` — no behavior change for the existing path.

**progressiveTranslate case (PROG-02/03):**
- Reads `googleApiKey` from storage only; returns auth error if absent (T-13-11, mirrors translateImage)
- Calls `resolveImageBytes` → converts base64 → `Uint8Array` → `contentDedupKey(bytes)` from `progressive-guard.ts` (the djb2 content-hash over bytes, prefix `imgc_`)
- Checks `getJob(contentKey)`: finished entry → `pushEntry` replay, no API call; loading entry → already in-flight, skipped; new → bump `progressivePending`, fire `runImagePipeline` with pre-resolved bytes, reply `{ accepted: true }` immediately
- `.finally()` on the pipeline promise: decrement pending, increment done, call `pushProgressiveActivity()`
- Never calls `sidePanel.open` (PROG-06)

**openImagePanel case (D-04/PROG-06):**
- `chrome.sidePanel.open({ tabId })` is the FIRST synchronous statement, before any await — Pitfall 1 gesture-first rule identical to `contextMenus.onClicked`
- After opening, sends a best-effort `{ type: 'openImagePanel', payload: { dedupKey } }` to the panel so it can scroll; catch swallows "no receiver" (panel not yet listening)

**progressiveActivity push:** `pushProgressiveActivity()` emits `{ type: 'progressiveActivity', payload: { pending, done } }` best-effort. Fired on progressive job start and on finish.

### sidepanel.ts changes

The `onMessage` listener was extended to dispatch on message type:
- `'translateImage'` → existing prepend/swap behavior (unchanged)
- `'openImagePanel'` → escapes `payload.dedupKey` using the same `replace(/["\\]/g, '\\$&')` pattern as `panel-render.ts cssEscape`, queries `[data-entry-id="<escaped>"]` within `mount`, calls `scrollIntoView({ block: 'center' })`. Missing row → no-op (entry may still be loading).

## Verification

- `npm run build` clean (TypeScript strict, no `any`)
- `dist/background.js` contains `progressiveTranslate`, `contentDedupKey`, `runImageJob`, `openImagePanel`, `sidePanel.open`, `progressiveActivity` — verified
- `dist/sidepanel.js` contains `scrollIntoView` — verified
- `node --test test/image-resolve.mjs test/vision-google.mjs` — 13/13 pass
- `node --test test/panel-render.mjs` — 8/8 pass
- `npm test` — **164 pass, 0 fail, 2 skipped** (live-key smoke tests, same as baseline)

## Deviations from Plan

None — plan executed exactly as written. The factoring choice (extract `runImagePipeline` rather than threading an optional param directly into `runImageJob`) was the stated preferred approach in the task action.

## Known Stubs

None. No placeholder data flows to UI rendering.

## Threat Flags

No new network endpoints, auth paths, or trust boundaries beyond the plan's threat model. The `progressiveTranslate` handler fetches `srcUrl` under existing `host_permissions` (same bounded SSRF surface accepted as T-13-12 / T-12-12). The `openImagePanel` handler opens the side panel only via a relayed human gesture (PROG-06 enforced).

## Human-Verify Checkpoint (pending)

**Task 3 — live flow verification** (gate: blocking)

All code and automated checks are COMPLETE and committed (commit `0ae0283`). The following human steps are required to close out this plan:

### What to verify

1. `npm run build`, reload the unpacked extension from `dist/`. Vision + LLM keys configured; progressive mode enabled (requires Plan 02 toggle + Plan 03 content engine).
2. On an image-heavy page, dwell near a text image so it auto-translates (Plan 03 IntersectionObserver trigger). Open the side panel via a badge click → the panel should open AND scroll to that image's entry (not just open at the top).
3. Confirm the side panel did NOT open on its own from scrolling (no gesture) — only the badge click opens it (PROG-06).
4. Find the SAME image served at two different URLs if possible (or reload the page so srcUrls churn) → the second occurrence must replay the cached translation, producing NO new network call and NO duplicate billing (PROG-03 content-hash dedup).
5. Right-click an image AND let the same image auto-translate progressively → only one job/entry should exist for identical bytes (shared `storage.session` map, content-hash key `imgc_*`).
6. Confirm the activity count (pending + done) tracks roughly with jobs running/finished.

### Resume signal

Type "approved" or describe which dedup/open/scroll/activity behavior misbehaved.

## Self-Check: PASSED

- `src/background.ts` exists and contains all new symbols
- `src/sidepanel.ts` exists and contains `scrollIntoView`
- Commit `0ae0283` verified in git log
- npm test: 164 pass, 0 fail
