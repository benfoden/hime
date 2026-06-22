---
phase: 16-in-place-image-overlay-translation
plan: "04"
subsystem: ui
tags: [content-script, overlay, dom, canvas, measureText, ResizeObserver, chrome-extension, image-translation]

requires:
  - phase: 16-01
    provides: overlay-geometry.ts mapBox + overlay-fit.ts fitText pure modules; TranslateImageBlocks types; Settings.includeImages
  - phase: 16-02
    provides: background.ts translateImageBlocks worker case returning blocks+submitted dims; captureFallback flag
  - phase: 16-03
    provides: popup Include images checkbox persisting includeImages to himeSettings

provides:
  - "overlayTranslateImages(): gated image collection + translateImageBlocks dispatch + render call"
  - "overlayRenderImage(): per-image absolutely-positioned overlay container with mapBox-placed fitText-sized boxes"
  - "overlayApplyGlobal(): global toggle wired into pageApplyState (D-01 lockstep)"
  - "Per-image corner toggle button (D-02): swaps single container shown/hidden"
  - "OVL-04 anchoring: scroll/resize listeners + ResizeObserver + 100ms throttle"
  - "overlayRemoveAll(): teardown wired to translatePage re-run"
  - "mapBox + fitText mirrored verbatim in content.ts (classic-script law)"

affects: [phase-16-verify, phase-17, content-script]

tech-stack:
  added: []
  patterns:
    - "Classic-script mirror law: mapBox/fitText mirrored verbatim under MUST-stay-in-sync comments"
    - "Body-appended absolute container (NOT img wrapper) for cross-site safe overlay positioning"
    - "Container-relative inner boxes: only container moves on reposition, not N individual boxes"
    - "Throwaway canvas for measureText with no image drawn (T-16-10 taint prevention)"
    - "Single lazy scroll/resize listener pair shared across all overlays"

key-files:
  created: []
  modified:
    - src/content.ts

key-decisions:
  - "All overlay text via textContent ONLY — never innerHTML (T-16-09/XSS law, enforced throughout)"
  - "overlayRemoveAll called on translatePage re-run (overlay teardown on reset, not on toggle)"
  - "overlayApplyGlobal wired into pageApplyState so page pill drives overlay visibility in lockstep (D-01)"
  - "Per-image toggle scoped to container children only (box divs hidden/shown; toggle button stays)"
  - "Window scroll/resize listeners registered lazily once on first overlay creation"

requirements-completed: [OVL-01, OVL-02, OVL-03, OVL-04, OVL-05]

duration: 25min
completed: 2026-06-22
---

# Phase 16 Plan 04: In-Place Image Overlay Layer Summary

**Lens-style translated-text overlays on page images: body-appended absolute containers with mapBox-placed, fitText-sized black/white boxes, per-image corner toggle, global pill integration, and scroll/resize/ResizeObserver re-anchoring wired into content.ts**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-22T00:00:00Z
- **Completed:** 2026-06-22T00:25:00Z
- **Tasks:** 3 (all merged into one atomic commit)
- **Files modified:** 1

## Accomplishments

- Mirrored `mapBox` (as `overlayMapBox`) and `fitText` (as `overlayFitText`) verbatim from Plan 01 pure modules under the canonical "MUST stay in sync with src/overlay-geometry.ts" comment style — satisfying the classic-script law that governs all content.ts mirrors
- Implemented `overlayTranslateImages()`: reads `includeImages` gate, snapshots in-view eligible images, dispatches `translateImageBlocks` per image under reused phase-13 `progCreateBudget` + `progCreateConcurrencyGate` cost gates, skips `captureFallback` images (T-16-06/Pitfall 2), accumulates errors into a single partial-failure toast
- Implemented `overlayRenderImage()`: creates one `document.body`-appended absolutely-positioned container per image (NOT a wrapper — Anti-Pattern avoided), places N box `<div>`s using `overlayMapBox` for geometry and `overlayFitText` for font sizing, all text via `textContent` (XSS law), throwaway canvas for `measureText` with no image drawn (T-16-10)
- Per-image corner toggle (D-02): a corner `<button>` inside the container toggles its own image's boxes hidden/shown and flips its own label via `textContent`
- Global page pill integration (D-01): `overlayApplyGlobal()` added to `pageApplyState` so the phase-15 pill drives overlay visibility in lockstep with the text toggle
- OVL-04 anchoring: window scroll/resize listeners (lazy, shared) + `ResizeObserver` per image + 100ms-throttled `overlayRepositionAll` reposition loop — only the container moves, inner boxes stay container-relative
- `overlayRemoveAll()` wired to `translatePage` message handler so a fresh translation run clears stale overlays

## Task Commits

All three tasks implemented in a single atomic commit (interdependent: Task 2 references mirrors from Task 1; Task 3 modifies Task 2's render output):

1. **Tasks 1+2+3: overlay mirrors + collect/dispatch + render + toggle + teardown** - `9158c7b` (feat)

**Plan metadata:** (see state update commit)

## Files Created/Modified

- `/home/ben/code/hime/src/content.ts` - Added ~340 lines: overlay math mirrors, `overlayTranslateImages`, `overlayRenderImage`, `overlayApplyGlobal`, `overlayRemoveAll`, `overlayShowErrorToast`, per-image toggle button, scroll/resize/ResizeObserver anchoring, `pageApplyState` D-01 integration, `translatePage` handler update

## Decisions Made

- **Overlay teardown on re-run, not on toggle**: `overlayRemoveAll` is called when `translatePage` is invoked again (fresh run), not when the user toggles back to original. The page-level toggle hides/shows overlays (D-01); overlays persist across toggles but are cleared before a fresh translation.
- **Single lazy listener pair**: scroll/resize window listeners are registered once (lazily) when the first overlay is created. Simpler and cheaper than per-image listeners.
- **Container pointer-events:none + toggle button pointer-events:auto**: The container itself passes clicks through to the page; only the toggle button is interactive (cleaner UX, avoids blocking page interaction).
- **Three-transform mirror is byte-identical in logic to overlay-geometry.ts**: Verified manually — upX/upY ratio, axis-aligned bbox, objectFit branching, offX/offY centering all match.

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria met without additional auto-fixes needed.

## Mirror Diff Confirmation

`overlayMapBox` vs `mapBox` (overlay-geometry.ts):
- Guard: `submitted.w <= 0 || submitted.h <= 0` → same
- upX/upY: `natural.w / submitted.w`, `natural.h / submitted.h` → same
- xs/ys: `box.map(v => v.x * upX)` → same
- nLeft/nTop/nW/nH: `Math.min/max` axis-aligned bbox → same
- objectFitTransform call → same (renamed `overlayObjectFitTransform`)
- Return shape: `{ left, top, width, height }` → same

`overlayFitText` vs `fitText` (overlay-fit.ts):
- Default opts: maxFont:28, minFont:9, lineHeight:1.2, pad:4, cjk:false → same
- budgetW/H: `boxW - 2*pad`, `boxH - 2*pad` → same
- tryFont: `wrapLines` + `lines.length * fontPx * lineHeight <= budgetH` → same
- Binary search: `low=minFont, high=maxFont`, halving, best tracking → same
- Clamped fallback: `tryFont(minFont)` → same

**No drift detected.**

## Security Review (Threat Surface Scan)

No new network endpoints, auth paths, file access patterns, or schema changes introduced. All new code is content-script DOM manipulation only. Threat mitigations applied per PLAN.md threat register:

| Threat ID | Status | Implementation |
|-----------|--------|---------------|
| T-16-09 | Mitigated | All text via `textContent` — grep confirms zero `innerHTML` in overlay functions |
| T-16-02 | Mitigated | `translateImageBlocks` payload carries `{srcUrl, dedupKey, config}` only; no apiKey field |
| T-16-10 | Mitigated | Throwaway canvas created via `document.createElement('canvas')`; no image drawn, only `measureText` called |
| T-16-06 | Mitigated | `reply.captureFallback === true` → `return` (no overlay rendered) |
| T-16-11 | Mitigated | `progCreateBudget(PROG_PER_PAGE_BUDGET)` + `progCreateConcurrencyGate(PROG_CONCURRENCY_CAP)` reused |
| T-16-SC | Mitigated | Zero new OSS dependencies added |

## Known Stubs

None — the overlay layer is fully wired. The `overlayTranslateImages()` function dispatches real `translateImageBlocks` messages to the worker (Plan 02) and renders real replies. The per-image toggle works. The global pill integration is live.

## Self-Check

Files exist:
- `src/content.ts` — FOUND (modified, ~2420 lines)

Commits exist:
- `9158c7b` — FOUND: `feat(16-04): add in-place image overlay layer to content.ts`

Tests: 214 pass / 2 skipped (baseline unchanged)

## Self-Check: PASSED

## Issues Encountered

None — single-shot implementation; build, typecheck, and tests all green on first attempt.

## Next Phase Readiness

Phase 16 Plan 04 is the final implementation plan. The overlay layer is complete. The next step is the Phase 16 verification (`/gsd-verify-work`): load-unpacked the built extension on a page with images, enable "Include images", click "Translate page", and verify Lens-style overlays appear over in-view images, stay anchored on scroll/resize, and respond to per-image + global toggles.

---
*Phase: 16-in-place-image-overlay-translation*
*Completed: 2026-06-22*
