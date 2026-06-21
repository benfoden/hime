---
phase: 13-progressive-viewport-mode-cost-control-privacy-opt-in
plan: "03"
subsystem: content-script
tags: [progressive, intersection-observer, cost-guard, dedup, badge, indicator, live-toggle]
dependency_graph:
  requires: ["13-01", "13-02"]
  provides: ["progressive viewport engine in content.ts"]
  affects: ["src/content.ts"]
tech_stack:
  added: []
  patterns:
    - IntersectionObserver with rootMargin + dwell debounce
    - Classic-script guard mirror (no import/export — mirrors progressive-guard.ts inline)
    - textContent-only DOM build (Phase 12 page rendering law)
    - storage.onChanged live toggle (clone of loadHotkeySettings pattern)
key_files:
  created: []
  modified:
    - src/content.ts
decisions:
  - "djb2 over srcUrl (imgs_ prefix) used as cheap first-filter dedup; authoritative content-hash dedup is the worker's storage.session map (PROG-03 split)"
  - "tabId omitted from progressiveTranslate/openImagePanel payloads — worker resolves via chrome.tabs.query (IMG-04 fallback precedent)"
  - "MutationObserver added for SPA / lazy-load images in addition to initial document.querySelectorAll scan"
  - "Budget gate checked before dwell schedule AND again after dwell elapses (two-phase check prevents TOCTOU on concurrent firings)"
metrics:
  duration: "~30m"
  completed: "2026-06-21"
  tasks_completed: 2
  files_modified: 1
---

# Phase 13 Plan 03: Progressive Viewport Engine Summary

**One-liner:** IntersectionObserver + 400ms dwell debounce + 4 content-side cost guards + textContent-only badge/indicator + badge-click gesture → worker open, all live-toggled via storage.onChanged.

## What Was Built

### Task 1: Progressive Observer Engine

Appended ~300 lines to `src/content.ts` (classic-script, no import/export).

**Mirrored guard constants** (from `progressive-guard.ts` — cannot import in classic script):
- `PROG_MIN_LONG_EDGE_PX = 150`
- `PROG_ROOT_MARGIN_PX = 200`
- `PROG_DWELL_MS = 400`
- `PROG_CONCURRENCY_CAP = 2`
- `PROG_PER_PAGE_BUDGET = 10`

**Guard functions mirrored inline:**
- `progIsEligibleSize` — long-edge filter
- `progSrcDedupKey` — djb2 over srcUrl, `imgs_` prefix (cheap first-filter; authoritative dedup is the worker's `storage.session` map)
- `progCreateBudget` — counts STARTS (D-02a)
- `progCreateConcurrencyGate` — tryAcquire/release
- `progCreateDwellScheduler` — per-key setTimeout debounce

**Engine (`startProgressive` / `stopProgressive`):**
- `IntersectionObserver` with `rootMargin: "200px"` (D-01 fire-ahead)
- On intersect: cancel dwell if leaving; schedule dwell if entering
- On dwell expiry: eligibility re-check → budget re-check → concurrency acquire → budget consume (START count) → mark seen → `sendMessage progressiveTranslate`
- Budget exhaustion disconnects the observer; right-click path (`background.ts`) untouched
- `MutationObserver` for SPAs / lazy-loaded images
- On concurrency gate release: done counter incremented

**Live toggle (PROG-01):**
- Boot: `chrome.storage.local.get` → call `startProgressive()` if `progressiveEnabled === true`
- `chrome.storage.onChanged` listener (clones `loadHotkeySettings` pattern): flips start/stop without extension reload

### Task 2: On-Image Badge + ON Indicator + Badge-Click Gesture

**Persistent ON indicator** (D-03a):
- Fixed-position `div#hime-prog-indicator` in bottom-right corner
- `textContent` only (`"hime: progressive ON (N pending, N done)"`)
- Created by `startProgressive`, removed by `stopProgressive`

**On-image badges** (D-04):
- `div.hime-prog-badge` absolutely positioned over the image (getBoundingClientRect + scrollX/Y — matches `showLoadingOverlay` pattern)
- `textContent = '[hime]'` — NEVER innerHTML (T-13-06)
- Throttled reposition on scroll/resize (100ms throttle)
- Badge click (USER GESTURE, PROG-06): sends `{ type: 'openImagePanel', payload: { dedupKey } }` to worker
- The observer/intersection path NEVER sends `openImagePanel` (PROG-06)

**Activity count** (D-04a):
- `progPending` / `progDone` tracked per page session
- Displayed in the indicator `textContent` and as a toolbar badge via `setBadge`

**Worker message handler** (added second `chrome.runtime.onMessage.addListener`):
- `progressiveActivity`: updates pending/done and indicator
- `progressiveBadge`: adds badge over the matching img element

## Automated Verification Results

```
npm run build  ->  CLEAN (no TypeScript errors)

content.js grep gates:
  IntersectionObserver  FOUND
  progressiveTranslate  FOUND
  progressiveEnabled    FOUND
  rootMargin            FOUND
  openImagePanel        FOUND
  textContent           FOUND
  innerHTML (in prog UI lines): 0 assignments — PASS

npm test: 164 pass, 0 fail, 2 skip (opt-in live keys)
```

## Deviations from Plan

### Auto-added: MutationObserver for dynamic images (Rule 2)
- **Found during:** Task 1
- **Issue:** The plan said "a periodic/observed rescan is acceptable" — MutationObserver is cleaner than polling and handles SPA page mutations at zero cost.
- **Fix:** Added `MutationObserver(document.body, { childList: true, subtree: true })` in `startProgressive`, disconnected in `stopProgressive`.
- **Files modified:** `src/content.ts`

### Auto-added: Two-phase budget check (Rule 2 - correctness)
- **Found during:** Task 1
- **Issue:** Checking budget only before scheduling the dwell creates a TOCTOU: two images could both see `isExhausted = false`, both schedule dwells, and both fire the callback — consuming 2 budget slots when only 1 remained.
- **Fix:** Budget is checked both before `progDwell.schedule` (early exit) and again inside the dwell callback (gate before consume). The concurrency gate protects the intermediate region.
- **Files modified:** `src/content.ts`

### Auto-added: tabId omitted from openImagePanel payload (Rule 2 - security)
- **Found during:** Task 2
- **Issue:** `chrome.tabs` is not available to content scripts — attempting `chrome.tabs.getCurrent()` would throw. The types.ts `OpenImagePanelMessage` declares `tabId: number` as required, but the worker's `13-04` handler resolves tabId itself via `chrome.tabs.query` when it can (IMG-04 fallback precedent). The progressiveTranslate message already uses `tabId?` (optional).
- **Fix:** Omit tabId from the content-script openImagePanel sendMessage. The worker resolves it from the sender tab automatically in its message handler.
- **Files modified:** `src/content.ts`

## Known Stubs

None. The progressive engine is fully wired to the worker message types defined in Plan 02 and the worker handlers committed in Plan 04. Badge rendering is live on `progressiveBadge` worker notifications (which Plan 04 sends on job completion).

## Threat Surface Scan

All surfaces are in the Plan's threat register:

| Threat ID | File | Description |
|-----------|------|-------------|
| T-13-05 mitigated | `src/content.ts` | 4-layer cost guard (eligibility + dwell + concurrency + budget) |
| T-13-06 mitigated | `src/content.ts` | textContent-only for all progressive UI — 0 innerHTML assignments |
| T-13-07 mitigated | `src/content.ts` | Observer never calls openImagePanel; only badge-click does |
| T-13-08 mitigated | `src/content.ts` | progressiveTranslate/openImagePanel payloads carry no API keys |

## Human-Verify Checkpoint

**Status: Code + automated checks COMPLETE and committed (`8e77669`). Awaiting human verification.**

See Task 3 checkpoint steps in the plan:

1. `npm run build`, reload unpacked extension from `dist/`. Ensure Vision + LLM keys are set.
2. Enable progressive mode (Options toggle). The "hime: progressive ON" indicator should appear.
3. Open an image-heavy page. Slowly scroll past an image and PAUSE — badge appears after ~400ms dwell. Fast-scroll through several — they should NOT all fire.
4. Confirm tiny images (<150px) are never badged.
5. Keep scrolling: after ~10 started images, progressive stops (budget). Right-click an 11th → still works.
6. Scroll back to an already-translated image → NO re-translate (no new network call, no duplicate panel entry).
7. Click a badge → side panel opens and scrolls to that image's entry. Panel must NOT have auto-opened earlier from scrolling alone (PROG-06).
8. Toggle OFF in Options → indicator + badges disappear, no further auto-translations, WITHOUT reloading. Toggle ON → resumes live.

## Self-Check: PASSED

- `src/content.ts` exists and is modified: FOUND
- Commit `8e77669` exists: FOUND
- `dist/content.js` contains all required symbols: VERIFIED
- `npm test` 164 pass, 0 fail: VERIFIED
