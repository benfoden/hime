---
phase: 14-ux-quality-hardening-vision-settings
plan: "04"
subsystem: sidepanel
tags: [img-06, copy, show-original, side-panel, browser-wiring, live-uat]
dependency_graph:
  requires: [14-03-panel-render]
  provides: [IMG-06-copy-wiring, show-original-toggle, sidebar-top-nav]
  affects: [src/sidepanel.ts, src/sidepanel.html, src/sidepanel.css, src/background.ts]
tech_stack:
  added: []
  patterns: [delegated-click-listener, textContent-only-label-swap, gesture-context-awareness]
key_files:
  modified:
    - src/sidepanel.ts
    - src/sidepanel.html
    - src/sidepanel.css
    - src/background.ts
decisions:
  - "Copy + show-original wired as a single delegated click listener on #results (reads data-copy / data-copy-kind); panel-render.ts stays node-testable with no navigator/event refs"
  - "Live UAT (human-verify, 4 rounds) surfaced 3 adjacent bugs beyond the plan's copy-UX scope; fixed inline as phase-14 hardening"
  - "Toolbar icon must show the action popup, NOT toggle the side panel: openPanelOnActionClick is persistent Chrome state, force-reset to false on every worker load"
  - "Right-click menu flattened: open-panel item excludes the image context so the two hime items never co-occur, preventing Chrome's auto-nest under a parent submenu"
  - "Swap (Ctrl+Shift+S) no longer triggers progressive translate-all: storage.onChanged now acts only on a genuine progressiveEnabled flag transition (old vs new), not any settings write"
  - "Added an in-panel top-nav (Search / Swap / Settings + source->target readout) mirroring the popup so navigation is reachable from the sidebar"
metrics:
  duration: "~1 task + 4 live-UAT fix rounds"
  completed_date: "2026-06-21"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 4
---

# Phase 14 Plan 04: Copy / Show-Original Wiring + Live-UAT Hardening Summary

## What shipped

**Task 1 — delegated copy + show-original wiring (`src/sidepanel.ts`).** A single delegated
`click` listener on the `#results` mount handles:
- `.panel-copy` buttons → `navigator.clipboard.writeText()` of the `data-copy` value, label
  swaps to "Copied" for 1.2s then restores (label by `data-copy-kind`); double-fire guard via
  `dataset.copyPending`; `.catch()` shows "Copy failed" + restores.
- `.panel-show-original` toggle → walks to `[data-entry-id]`, toggles `is-collapsed` on the
  `.panel-original` block, swaps the label show/hide.

All label changes use `textContent` only (IMG-02 law). `panel-render.ts` unchanged.

**Task 2 — human-verify checkpoint (live browser UAT).** Approved after 4 rounds. Copy of
translated + original text, the show-original toggle, the `[hime N]` chip, the per-entry CJK
note, and the distinct failure card all confirmed live in Chrome.

## Live-UAT fixes (adjacent bugs surfaced during verification)

1. **`sidePanel.open()` uncaught gesture error** — the on-image badge relays `openImagePanel`
   content→SW; that message carries no user gesture, so `sidePanel.open()` rejected and the bare
   `void` left it uncaught. Caught it; the panel opens via context-menu items + the popup button
   (true gestures). (`commit dc2716b`)
2. **Right-click menu nested under a "hime" submenu** — Chrome auto-groups ≥2 simultaneously
   visible items. Made the two hime items mutually exclusive by context so each shows top-level.
   (`commit dc2716b`)
3. **Ctrl+Shift+S swap triggered progressive translate-all** — `storage.onChanged` only checked
   `isOn && !wasOn`, so a swap (targetLanguage change) re-opened the D-05 lang-gate and started
   progressive. Now gated on a genuine `progressiveEnabled` flag transition. (`commit dc2716b`)
4. **Toolbar icon toggled the side panel, hiding the popup nav** — `openPanelOnActionClick` is
   persistent Chrome state; force-reset to `false` on every worker load so the icon shows the
   action popup. Added an in-panel top-nav (Search / Swap / Settings + direction). (`commits
   b37f3e1, a95c2bd`)

## Verification

182 tests pass, 0 fail; `tsc` clean (build green) at each round. Live UAT approved by the user
(copy UX + all 4 fix rounds). New feature request (basic page-text auto-translate) parked as
backlog 999.5 — out of phase-14 scope.

## Self-Check: PASSED
