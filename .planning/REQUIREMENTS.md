# Requirements: hime — Milestone v1.1 Inline Predictions

**Milestone goal:** Live 2-3 word inline completions in any text field, any language, with cycleable alternate variations.

**Status:** Defining → Roadmap pending

---

## v1.1 Requirements

### Prediction Engine (PRED)

- [ ] **PRED-01**: While typing in an editable field, user sees a 2-3 word completion rendered as inline ghost text after a configurable debounce.
- [ ] **PRED-02**: User can accept the current suggestion with Tab (or Enter), inserting it undo-safely via `document.execCommand('insertText')`.
- [ ] **PRED-03**: User can dismiss the current suggestion with Esc without altering field content.
- [ ] **PRED-04**: Predictions are generated from surrounding field context (text before the cursor) via the existing background service-worker provider layer.
- [ ] **PRED-05**: Continuing to type supersedes the showing suggestion (ghost text never blocks or corrupts normal typing); a new prediction refreshes after debounce.
- [ ] **PRED-06**: Ghost text renders inline at the cursor without shifting or mutating the user's committed text, and clears cleanly on blur/focus-leave.

### Variations (VAR)

- [ ] **VAR-01**: Each prediction request yields multiple alternate completions, up to a configurable maximum.
- [ ] **VAR-02**: User can cycle through alternates with an in-field keybinding while a suggestion is showing (content-script handler — does not consume a Chrome commands hotkey slot).
- [ ] **VAR-03**: Accepting inserts whichever alternate is currently displayed.

### Settings (SET)

- [ ] **SET-01**: User can enable/disable inline prediction globally in the options page.
- [ ] **SET-02**: User can configure the debounce delay (ms before a prediction fires).
- [ ] **SET-03**: User can configure the maximum number of alternate variations.
- [ ] **SET-04**: User can configure trigger behavior (minimum characters before predicting; auto vs. manual trigger).
- [ ] **SET-05**: User can configure the in-field cycle keybinding.

### Language-Agnostic (LANG)

- [ ] **LANG-01**: Inline prediction works in `<input>`, `<textarea>`, and `contenteditable` elements, reusing v1.0 field detection (skips password, readonly, hidden, disabled fields).
- [ ] **LANG-02**: Predictions complete in the field's own language/context and are independent of the translate target-language setting (no forced translation of the completion).

---

## Future Requirements (deferred, not this milestone)

- Streaming token-by-token ghost text (current scope: single debounced 2-3 word block)
- Per-site enable/disable allowlist for prediction
- Acceptance telemetry / suggestion quality tuning
- Multi-line / paragraph-level completion

---

## Out of Scope (v1.1)

- **Local/offline prediction model** — BYOK API model only; no on-device inference (consistent with v1.0).
- **Prediction in canvas editors (Google Docs)** — same canvas limitation as v1.0; graceful decline.
- **Rebinding accept/dismiss keys (Tab/Enter/Esc)** — these are fixed editor-idiomatic keys; only the cycle key is configurable.
- **Predicting from text after the cursor** — context window is text-before-cursor only for v1.1.

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| _(filled by roadmap)_ | | |
