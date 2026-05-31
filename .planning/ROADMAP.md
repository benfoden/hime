# Roadmap: hime

## Milestones

- v1.0 MVP — Phases 1-4 (shipped 2026-05-25)
- v1.1 Inline Predictions — Phases 5-7 (active)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-4) — SHIPPED 2026-05-25</summary>

- [x] Phase 1: Core Extension Build (1/1 plans) — completed 2026-05-24
- [x] Phase 2: Prompt Quality & Error Hardening (3/3 plans) — completed 2026-05-25
- [x] Phase 02.1: OpenRouter Provider Support (2/2 plans) — completed 2026-05-25
- [x] Phase 3: Cross-Site Compatibility (3/3 plans) — completed 2026-05-25
- [x] Phase 4: Web Store Distribution (skipped — dev-only) — completed 2026-05-25

</details>

### v1.1 Inline Predictions (Phases 5-7)

- [ ] **Phase 5: Ghost-Text Prediction Engine** - Inline 2-3 word completions render at the cursor, accept/dismiss/supersede, across all editable field types
- [ ] **Phase 6: Alternate Variations & Cycling** - Each prediction offers multiple alternates the user can cycle through and accept in-field
- [ ] **Phase 7: Prediction Settings** - Options page controls for enable/disable, debounce, max variations, trigger behavior, and cycle keybinding

## Phase Details

### Phase 5: Ghost-Text Prediction Engine
**Goal**: While typing in any editable field, the user sees a 2-3 word inline completion that they can accept, dismiss, or override by continuing to type — without ever corrupting their committed text.
**Depends on**: Phase 4 (v1.0 field detection, background provider layer, execCommand insertion)
**Requirements**: PRED-01, PRED-02, PRED-03, PRED-04, PRED-05, PRED-06, LANG-01, LANG-02
**Success Criteria** (what must be TRUE):
  1. While typing in an `<input>`, `<textarea>`, or `contenteditable` field, the user sees a 2-3 word completion appear as inline ghost text after a brief debounce.
  2. The user can press Tab (or Enter) to accept the suggestion, and the inserted text joins the native undo stack (Ctrl+Z reverts it cleanly).
  3. The user can press Esc to dismiss the suggestion, leaving committed text unchanged.
  4. Continuing to type immediately clears the stale suggestion and never blocks, duplicates, or corrupts the typed characters; a fresh suggestion appears after the user pauses.
  5. The suggestion is generated from text before the cursor in the field's own language and clears completely on blur/focus-leave; password, readonly, hidden, and disabled fields never trigger predictions.
**Plans**: 2 plans
- [x] 05-01-PLAN.md — predict message contract + prompt + provider predict() + background dispatch + sanitize (PRED-04, LANG-02)
- [ ] 05-02-PLAN.md — content-script ghost engine: render, accept/dismiss/supersede, keydown wiring, blur cleanup (PRED-01..06, LANG-01/02)
**UI hint**: yes

### Phase 6: Alternate Variations & Cycling
**Goal**: A single prediction surfaces multiple alternate completions the user can flip through in-field and accept whichever is currently shown.
**Depends on**: Phase 5
**Requirements**: VAR-01, VAR-02, VAR-03
**Success Criteria** (what must be TRUE):
  1. Each prediction request returns multiple alternate completions (up to the configured maximum) ready to display.
  2. While a suggestion is showing, the user can press the in-field cycle keybinding to swap the displayed ghost text to the next alternate (no Chrome commands hotkey slot consumed).
  3. Pressing accept (Tab/Enter) inserts whichever alternate is currently displayed, not a fixed first option.
  4. Cycling wraps and stays in sync with accept/dismiss — the displayed alternate is always the one that gets inserted or cleared.
**Plans**: TBD
**UI hint**: yes

### Phase 7: Prediction Settings
**Goal**: The user controls all inline-prediction behavior from the options page — turning it on/off and tuning timing, variation count, trigger thresholds, and the cycle key.
**Depends on**: Phase 6
**Requirements**: SET-01, SET-02, SET-03, SET-04, SET-05
**Success Criteria** (what must be TRUE):
  1. The user can enable or disable inline prediction globally from the options page, and the setting takes effect without reloading the extension.
  2. The user can set the debounce delay (ms before a prediction fires) and observe predictions firing on that cadence.
  3. The user can set the maximum number of alternate variations, and prediction requests honor that cap.
  4. The user can configure trigger behavior — minimum characters before predicting, and auto vs. manual trigger.
  5. The user can configure the in-field cycle keybinding, and cycling responds to the newly chosen key.
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Core Extension Build | v1.0 | 1/1 | Complete | 2026-05-24 |
| 2. Prompt Quality & Error Hardening | v1.0 | 3/3 | Complete | 2026-05-25 |
| 02.1. OpenRouter Provider Support | v1.0 | 2/2 | Complete | 2026-05-25 |
| 3. Cross-Site Compatibility | v1.0 | 3/3 | Complete | 2026-05-25 |
| 4. Web Store Distribution | v1.0 | 0/0 | Skipped | 2026-05-25 |
| 5. Ghost-Text Prediction Engine | v1.1 | 1/2 | In Progress|  |
| 6. Alternate Variations & Cycling | v1.1 | 0/0 | Not started | - |
| 7. Prediction Settings | v1.1 | 0/0 | Not started | - |
