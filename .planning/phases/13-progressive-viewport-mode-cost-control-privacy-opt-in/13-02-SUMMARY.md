---
phase: 13-progressive-viewport-mode-cost-control-privacy-opt-in
plan: "02"
subsystem: settings-ui
tags: [progressive-mode, options-page, privacy-modal, type-contract, PROG-01, PROG-05]
dependency_graph:
  requires: [13-01]
  provides: [progressiveEnabled-setting, Phase13-message-types, progressive-options-ui]
  affects: [src/types.ts, src/options.ts, src/options.html, src/options.css]
tech_stack:
  added: []
  patterns: [blocking-consent-modal, storage-local-ack, live-effect-storage-onchanged]
key_files:
  created: []
  modified:
    - src/types.ts
    - src/options.ts
    - src/options.html
    - src/options.css
decisions:
  - "STORAGE_PROGRESSIVE_ACK imported in options.ts as a named const rather than the bare string to keep the storage key single-sourced in types.ts (plan's automated check verified via types.js, not options.js)"
  - "progressiveStatusDiv declared but not yet wired to any showStatus call — kept for future per-section status messages without adding dead behaviour"
  - "Checkbox input used instead of a custom toggle switch — keeps the UI consistent with the rest of the options page which uses no custom widgets"
metrics:
  duration: "4 min 22 sec"
  completed: "2026-06-21T15:48:18Z"
  tasks_completed: 2
  tasks_total: 3
  files_modified: 4
---

# Phase 13 Plan 02: Settings toggle + Phase-13 type contract Summary

Progressive-mode type contract locked in `types.ts` (settings field + 3 message types + 3 interfaces + ack const); options UI built with a default-OFF checkbox, a blocking first-enable privacy modal naming both upload destinations (Google Cloud Vision + the user's configured LLM), and a remembered acknowledgement via `storage.local['progressiveAck']`.

## Tasks Completed

| Task | Name | Commit | Key files |
|------|------|--------|-----------|
| 1 | Extend type contract in types.ts | e0455d0 | src/types.ts, src/options.ts (stub) |
| 2 | Progressive section: toggle + modal + ack | 47355fc | src/options.ts, src/options.html, src/options.css |

## What Was Built

### Task 1 — types.ts type contract (commit e0455d0)

- Added `progressiveEnabled: boolean` to `Settings` interface (comment cites PROG-01 / D-01).
- Set `DEFAULT_SETTINGS.progressiveEnabled = false` (PROG-01 default-OFF; `migrateSettings` spreads defaults so legacy storage entries silently inherit `false` — no extra migration code needed, confirmed).
- Added three entries to `MessageType` union: `'progressiveTranslate'`, `'openImagePanel'`, `'progressiveActivity'` with inline comments describing direction and purpose.
- Added three message interfaces:
  - `ProgressiveTranslateMessage` — content → worker, payload `{srcUrl, dedupKey, tabId?}` (no API keys, T-12-01).
  - `OpenImagePanelMessage` — content → worker, payload `{tabId, dedupKey}` (gesture-backed open + scroll, D-04 / PROG-06).
  - `ProgressiveActivityMessage` — worker → content, payload `{pending, done}` (activity count, D-04a).
- Exported `STORAGE_PROGRESSIVE_ACK = 'progressiveAck' as const` with comment noting ack lives in `storage.local`, per-page counter in `storage.session`.
- Added stub `progressiveEnabled: currentSettings.progressiveEnabled` in `saveSettings` to unblock the build (Task 2 replaced the stub with the real toggle reference).

### Task 2 — options UI (commit 47355fc)

**options.html:** New "Progressive Image Translation" `<section>` placed between Image Translation and Translation sections, containing:
- `#progressiveEnabled` checkbox with `.toggle-label` and descriptive help text.
- `#progressiveModal` blocking dialog (`role="dialog"`, `aria-modal="true"`, `aria-labelledby="progressiveModalTitle"`) with copy naming **both** destinations:
  - "image bytes are uploaded to **Google Cloud Vision** for OCR (text extraction)"
  - "the detected text is then sent to **your configured translation provider** (your selected LLM) for translation"
- Enable / Cancel buttons inside the dialog.
- `#progressiveStatus` status div for future per-section status messages.

**options.ts:**
- Imported `STORAGE_PROGRESSIVE_ACK` from types.
- Declared five new element variables (`progressiveToggle`, `progressiveStatusDiv`, `progressiveModal`, `progressiveModalEnableBtn`, `progressiveModalCancelBtn`).
- `populateForm`: sets `progressiveToggle.checked = currentSettings.progressiveEnabled`.
- `saveSettings`: persists `progressiveToggle.checked` as `progressiveEnabled`.
- `setupProgressiveToggle()`: implements the full consent flow:
  - Toggle ON → read `storage.local[STORAGE_PROGRESSIVE_ACK]`; if not acked → revert checkbox to OFF, show modal; if acked → call `saveSettings()` immediately.
  - Enable button → set ack in `storage.local`, hide modal, re-check toggle, save (live-effect via `storage.onChanged` in content.ts, PROG-01 no-reload).
  - Cancel button → hide modal, leave toggle OFF (D-03 decline → stays off).
  - Toggle OFF → `saveSettings()` immediately, no modal.
- Wired in `DOMContentLoaded` after hotkey setup.

**options.css:** Added ~65 lines of new styles: `.toggle-label`, `.toggle-checkbox`, `.modal-overlay`, `.modal-dialog`, `.privacy-list`, `.modal-actions`.

## Automated Acceptance Criteria — PASSED

```
AC1: grep progressiveEnabled: false src/types.ts               — PASS
AC2: all three message types in MessageType union               — PASS
AC3: STORAGE_PROGRESSIVE_ACK in types.ts                       — PASS
AC4: no ': any' added                                          — PASS
AC5: no apiKey in Phase-13 payload interfaces (T-12-01)        — PASS
AC-toggle: #progressiveEnabled in dist/options.html            — PASS
AC-modal:  #progressiveModal in dist/options.html              — PASS
AC-gcv:    'Google Cloud Vision' in dist/options.html          — PASS
AC-llm:    translation provider copy in dist/options.html      — PASS
AC-persist: progressiveEnabled in dist/options.js              — PASS
AC-ack:    STORAGE_PROGRESSIVE_ACK in dist/options.js          — PASS
npm run build: clean                                           — PASS
npm test: 164 pass, 0 fail, 2 skipped (live-key)              — PASS
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added progressiveEnabled stub to options.ts saveSettings before Task 2 wired it**
- **Found during:** Task 1 build — TypeScript error TS2741 "Property 'progressiveEnabled' is missing in type"
- **Fix:** Added `progressiveEnabled: currentSettings.progressiveEnabled` as a stub in `saveSettings`. Task 2 replaced it with `progressiveToggle.checked`.
- **Files modified:** src/options.ts
- **Commit:** e0455d0

**2. [Rule 1 - Plan script] Plan's automated check for Task 2 looked for 'progressiveAck' literal in dist/options.js**
- **Found during:** Task 2 verification — the TypeScript compiler emits the imported constant name `STORAGE_PROGRESSIVE_ACK` (not the string `'progressiveAck'`) in options.js; the string value lives in dist/types.js which options.js imports at runtime.
- **Fix:** Ran a broader verification script that checks both dist/options.js (for `STORAGE_PROGRESSIVE_ACK`) and dist/types.js (for the `'progressiveAck'` string value). Code is correct.
- **Files modified:** none (verification script adaptation only)

## Known Stubs

None — all plan-specified symbols are fully wired. `progressiveStatusDiv` is declared and available for future `showStatus(..., progressiveStatusDiv)` calls from this section.

## Threat Flags

No new threat surface introduced beyond the plan's `<threat_model>`. T-13-03 (consent) is mitigated by the blocking modal naming both destinations. T-13-04 (client-side ack) is accepted per plan.

## Pending Human Verification

**Task 3 (checkpoint:human-verify)** — visual and behavioral verification of the options UI in a live Chrome extension load. This cannot be automated. Steps for the human verifier:

1. Run `npm run build`, then load/reload the unpacked extension from `dist/` in Chrome (`chrome://extensions` → reload).
2. Open the extension Options page. Confirm a "Progressive Image Translation" section exists and the toggle is OFF by default.
3. Flip the toggle ON → a blocking modal must appear. Read its copy: it MUST mention BOTH:
   - image bytes going to **Google Cloud Vision**
   - detected text going to **your configured translation/LLM provider**
4. Click Cancel → modal closes, toggle stays OFF.
5. Flip ON again → modal reappears (still unacknowledged). Click Enable → modal closes, toggle is ON, Save shows success status.
6. Reload the Options page, flip the toggle OFF then ON again → modal must NOT reappear (ack remembered in storage.local).

All code tasks and automated checks are complete and committed. This checkpoint is batched with the other Phase-13 human-verify steps.

## Self-Check: PASSED

Files created/modified:
- src/types.ts — exists, contains progressiveEnabled + STORAGE_PROGRESSIVE_ACK + three message types
- src/options.ts — exists, contains STORAGE_PROGRESSIVE_ACK import + setupProgressiveToggle
- src/options.html — exists, contains progressiveEnabled + progressiveModal + 'Google Cloud Vision'
- src/options.css — exists, contains .modal-overlay / .modal-dialog / .privacy-list

Commits exist:
- e0455d0 — feat(13-02): extend type contract
- 47355fc — feat(13-02): add progressive image translation toggle + privacy modal
