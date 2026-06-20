# Roadmap: hime

## Milestones

- ✅ v1.0 MVP — Phases 1-4 (shipped 2026-05-25)
- ⏸ v1.1 Inline Predictions — Phases 5-7 (PAUSED 2026-06-02; phase 5 shelved behind flag, phases 6-7 unbuilt)
- ✅ v1.2 Translated Search — Phases 8-11 (shipped 2026-06-20)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-4) — SHIPPED 2026-05-25</summary>

- [x] **Phase 1: Core Extension Build** - Manifest V3 scaffold, content script, background worker, compose+YOLO modes (completed 2026-05-24)
- [x] **Phase 2: Prompt Quality & Error Hardening** - Auto-formality, classifyError, hardened providers, 33 passing tests (completed 2026-05-25)
- [x] **Phase 02.1: OpenRouter Provider Support** - OpenRouter via OpenAI-compatible API, settings dropdown, model fetch (completed 2026-05-25)
- [x] **Phase 3: Cross-Site Compatibility** - 7-editor verification, shadow DOM traversal, canvas degradation (completed 2026-05-25)
- [x] **Phase 4: Web Store Distribution** - Skipped; dev load-unpacked sufficient (completed 2026-05-25)

</details>

<details>
<summary>v1.1 Inline Predictions (Phases 5-7) — PAUSED 2026-06-02</summary>

Phase 5 ghost-text engine is complete but shelved behind `PREDICT_ENABLED=false` in `content.ts`; Predict hotkey row hidden in `options.html`. Phases 6-7 are unbuilt. Resume by flipping the flag, unhiding `#predictHotkeyRow`, and roadmapping phases 6-7.

- [x] **Phase 5: Ghost-Text Prediction Engine** - Inline completions render at cursor, accept/dismiss/supersede (completed 2026-05-31; shelved)
- [ ] **Phase 6: Alternate Variations & Cycling** - Multiple alternates cycleable in-field (unbuilt)
- [ ] **Phase 7: Prediction Settings** - Options page controls for prediction behavior (unbuilt)

</details>

<details>
<summary>✅ v1.2 Translated Search (Phases 8-11) — SHIPPED 2026-06-20</summary>

Full phase details archived to `milestones/v1.2-ROADMAP.md`. Audit passed (17/18 reqs) — see `milestones/v1.2-MILESTONE-AUDIT.md`.

- [x] **Phase 8: API Integration Scaffold** - searchTranslated message type, BraveSearchClient, Brave key setting + test, source==target guard, 429 handling (completed 2026-06-03)
- [x] **Phase 9: SERP Rendering** - SearchResult type, XSS-safe renderer, skeleton/empty/error states (completed 2026-06-03)
- [x] **Phase 10: Translation Pipeline** - Keyed-JSON batch translation, count assertion, raw fallback, three-stage progressive render (completed 2026-06-10)
- [x] **Phase 11: Page Wiring & Popup Entry** - Full search.ts wired end-to-end, query translation disclosure line, popup button (completed 2026-06-20)

</details>

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
- [x] 05-02-PLAN.md — content-script ghost engine: render, accept/dismiss/supersede, keydown wiring, blur cleanup (PRED-01..06, LANG-01/02)

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

> v1.2 phase details (Phases 8–11) archived to `milestones/v1.2-ROADMAP.md`.

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Core Extension Build | v1.0 | 1/1 | Complete | 2026-05-24 |
| 2. Prompt Quality & Error Hardening | v1.0 | 3/3 | Complete | 2026-05-25 |
| 02.1. OpenRouter Provider Support | v1.0 | 2/2 | Complete | 2026-05-25 |
| 3. Cross-Site Compatibility | v1.0 | 3/3 | Complete | 2026-05-25 |
| 4. Web Store Distribution | v1.0 | 0/0 | Skipped | 2026-05-25 |
| 5. Ghost-Text Prediction Engine | v1.1 | 2/2 | Complete (shelved) | 2026-05-31 |
| 6. Alternate Variations & Cycling | v1.1 | 0/0 | Paused | - |
| 7. Prediction Settings | v1.1 | 0/0 | Paused | - |
| 8. API Integration Scaffold | v1.2 | 4/4 | Complete    | 2026-06-03 |
| 9. SERP Rendering | v1.2 | 2/2 | Complete   | 2026-06-03 |
| 10. Translation Pipeline | v1.2 | 2/2 | Complete    | 2026-06-10 |
| 11. Page Wiring & Popup Entry | v1.2 | 3/3 | Complete    | 2026-06-20 |
