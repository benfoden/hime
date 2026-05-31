---
phase: 05-ghost-text-prediction-engine
plan: "02"
subsystem: content-script-prediction-engine
tags: [prediction, ghost-text, content-script, keydown, overlay, execCommand, race-guard]
dependency_graph:
  requires: [predict-message-contract, sanitizeSuggestion, provider-predict-methods, background-predict-case]
  provides: [ghost-text-engine, predictionState, ghost-render-remove, accept-dismiss, keydown-wiring, blur-cleanup]
  affects: [src/content.ts, test/unit.mjs]
tech_stack:
  added: []
  patterns: [mirror-div-caret-measurement, overlay-positioning, abort-controller-race-guard, debounce-manual-auto, execCommand-insert-at-caret]
key_files:
  created: []
  modified:
    - src/content.ts
    - test/unit.mjs
decisions:
  - "PREDICT_TRIGGER_MODE changed from const to let — TypeScript narrows const literals to their assigned type, making the PREDICT_TRIGGER_MODE === 'auto' comparison a compile-time error (TS2367). Changed to let so Phase 7 can update it from storage without a code change."
  - "renderGhost stub (forward declaration) replaced by real implementation in Task 2 — TypeScript requires all called functions to be declared at compile time even in a classic script; added stub in Task 1 then replaced in Task 2 to avoid a separate declaration-only commit."
  - "Esc ghost-dismiss wired in the non-capture keydown listener (line 730) alongside compose-Esc, not in the capture-phase listener — this gives ghost dismissal same listener priority as compose, cleanly separating Esc handling by mode per D-09."
metrics:
  duration: "5m 26s"
  completed_date: "2026-05-31"
  tasks_completed: 3
  tasks_pending: 1
  tasks_pending_reason: "Task 4 is checkpoint:human-verify — browser-only behaviors (overlay alignment, undo-stack on accept, live supersede) require manual testing per 05-VALIDATION.md Manual-Only table"
  files_modified: 2
  tests_added: 16
  tests_total: 72
---

# Phase 05 Plan 02: Ghost-Text Prediction Engine — Content Script Summary

**One-liner:** Content-script ghost-text engine: Ctrl+Space trigger, dim overlay/span after caret, Tab/Enter undo-safe accept, Esc dismiss, supersede-on-type, blur cleanup — all wired into existing listeners, no new keydown handler.

## What Was Built

The full user-facing Phase 5 engine layered on top of the Plan 01 predict message contract. Pressing Ctrl+Space in a valid field sends a prediction request and renders dim grey ghost text after the caret. Tab/Enter accepts undo-safely; Esc dismisses; continued typing supersedes; blur clears + aborts the in-flight request.

**Status:** Tasks 1–3 complete and committed. Task 4 (browser-only human verification) is pending.

### Artifacts Delivered

| Artifact | Path | Purpose |
|----------|------|---------|
| predictionState block | src/content.ts | Holds suggestion, element, requestSeq, abortController, debounceTimer |
| isCaretAtEnd() | src/content.ts | D-04: only trigger/render when caret is at field end |
| getTextBeforeCursor() | src/content.ts | Reads text before cursor, clips to 500 chars (T-05-01) |
| sanitizeGhost() | src/content.ts | Local defense-in-depth sanitizer (no import — classic script constraint) |
| sendPredictMessage() | src/content.ts | Promise wrapper for chrome.runtime.sendMessage predict |
| requestPrediction() | src/content.ts | Race-guarded async request: seq+element guard, suppression checks |
| getTextEndX() | src/content.ts | Mirror-div caret pixel measurement (Pitfall 6: lineHeight 'normal' handled) |
| renderGhostOverlay() | src/content.ts | Absolutely-positioned ghost div for input/textarea (textContent only) |
| renderGhostSpan() | src/content.ts | [contenteditable=false] span for contenteditable |
| renderGhost() | src/content.ts | Dispatches to overlay or span by element type |
| removeGhost() | src/content.ts | Removes overlay + spans, clears predictionState.suggestion |
| acceptGhost() | src/content.ts | Undo-safe execCommand('insertText') at caret (PRED-02, D-06) |
| dismissGhost() | src/content.ts | Clears ghost without altering committed text (PRED-03, D-09) |
| schedulePrediction() | src/content.ts | Manual (immediate) or auto (debounced) dispatch (D-01/D-02) |
| Keydown wiring | src/content.ts | Ghost accept/dismiss/supersede + Ctrl+Space in existing capture listener |
| Esc ghost-first | src/content.ts | Non-capture Esc listener: ghost dismiss before compose cancel (D-09) |
| focusout cleanup | src/content.ts | removeGhost + abort + clear state on blur (PRED-06) |

### Key Links (verified)

- `content.ts Ctrl+Space handler` → `schedulePrediction(element, 'manual')` → `requestPrediction(element)`
- `content.ts requestPrediction` → `sendPredictMessage` → `chrome.runtime.sendMessage({ type: 'predict', ... })`
- `content.ts acceptGhost` → `document.execCommand('insertText', false, suggestion)` at caret
- `content.ts focusout` → `predictionState.abortController?.abort()` (prevents stale render)

## Decisions Made

1. **PREDICT_TRIGGER_MODE as `let`** — The plan shows `const PREDICT_TRIGGER_MODE: 'manual' | 'auto'` but TypeScript `strict` mode narrows const literal types, causing TS2367 when comparing `=== 'auto'`. Changed to `let` so Phase 7 can assign from storage at runtime without a code change. Deviation Rule 1 (bug in plan spec).

2. **renderGhost stub in Task 1** — TypeScript requires all called functions to be declared at compile time. `requestPrediction` calls `renderGhost` which is defined in Task 2. Added a one-line stub in Task 1's commit, then replaced it with the full implementation in Task 2's commit. This kept each task independently compilable.

3. **Esc wired in non-capture listener, not capture-phase** — The capture-phase listener is ctrl-gated (`if (!ctrl || event.altKey) return`). Esc for ghost dismiss is not ctrl-gated. Rather than restructuring the capture-phase listener, ghost Esc is handled in the existing non-capture Esc listener alongside compose-Esc, maintaining clear separation (D-09: ghost dismiss → else compose cancel).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] PREDICT_TRIGGER_MODE changed to `let`**
- **Found during:** Task 3 TypeScript compilation
- **Issue:** `const PREDICT_TRIGGER_MODE: 'manual' | 'auto' = 'manual'` → TypeScript TS2367: comparing `'manual'` (const-narrowed) to `'auto'` is always false
- **Fix:** Changed to `let PREDICT_TRIGGER_MODE: 'manual' | 'auto' = 'manual'`
- **Files modified:** src/content.ts
- **Commit:** c6e068a

None of the other deviations were needed — implementation matched the plan precisely.

## Known Stubs

None. All ghost-text functions are fully implemented. `PREDICT_TRIGGER_MODE` is `'manual'` (D-01 default) — the auto code path is wired and tested; it just isn't activated until Phase 7 sets the value from storage.

## Threat Flags

None. All threat mitigations in the plan's threat model are implemented:
- T-05-05: overlay/span is `pointer-events: none`, removed on blur ✓
- T-05-06: `isValidInputElement` reused — skips password/readonly/hidden/disabled/canvas ✓
- T-05-07: ghost rendered via `textContent` only (never innerHTML); `sanitizeGhost` strips control chars before DOM write ✓
- T-05-08: ghost is overlay/non-editable-span only — never assigns `element.value`/`innerText`; accept uses `execCommand('insertText')` ✓
- T-05-09: seq + element guard + AbortController abort on supersession and on blur ✓

## Pending: Task 4 (Human Verification)

Task 4 is a `checkpoint:human-verify` gate. The following browser-only behaviors require manual testing and cannot be unit-tested:

1. Overlay pixel alignment — ghost text visually aligned on the same line as typed text
2. Undo-stack on accept — Ctrl+Z after Tab accept cleanly reverts the inserted suggestion only
3. Live keystroke supersede — ghost clears instantly with no duplicated/corrupted characters
4. Blur cleanup — ghost disappears when clicking away
5. Suppression during compose mode and on ineligible fields

See 05-VALIDATION.md Manual-Only table for the full test checklist.

## Self-Check: PASSED

- src/content.ts — FOUND
- test/unit.mjs — FOUND
- 05-02-SUMMARY.md — FOUND
- c848c0b (Task 1 feat) — FOUND
- cbd8816 (Task 2 feat) — FOUND
- c6e068a (Task 3 feat) — FOUND
