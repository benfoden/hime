# Roadmap: hime

## Overview

Hime v1.0 is fully built and functional — a keyboard-native Chrome extension that translates inline using OpenAI or Gemini. The remaining arc is hardening and distribution: validate prompt quality, verify cross-site compatibility on complex editors, and ship to the Chrome Web Store. Four phases total; one already complete.

## Phases

- [x] **Phase 1: Core Extension Build** - Full v1.0 scaffold, translate modes, settings, providers, BYOK
- [ ] **Phase 2: Prompt Quality & Error Hardening** - Clean output, formality validation, actionable error surfaces
- [ ] **Phase 3: Cross-Site Compatibility** - Verified operation on 7 major contenteditable editors
- [ ] **Phase 4: Web Store Distribution** - Store listing, screenshots, privacy policy, submission

## Phase Details

### Phase 1: Core Extension Build
**Goal**: Extension is installed and functional for keyboard-native inline translation
**Depends on**: Nothing (first phase)
**Requirements**: EXT-01, EXT-02, EXT-03, EXT-04, FIELD-01, FIELD-02, FIELD-03, FIELD-04, FIELD-05, FIELD-06, FIELD-07, REPL-01, REPL-02, COMP-01, COMP-02, COMP-03, COMP-04, COMP-05, YOLO-01, LANG-01, LANG-02, LANG-03, LANG-04, LANG-05, FORM-01, FORM-02, FORM-03, FORM-04, FORM-05, PROV-01, PROV-02, PROV-03, PROV-04, PROV-05, KEY-01, KEY-02, KEY-03, KEY-04, KEY-05, SET-01, SET-02, SET-03, SET-04, SET-05, SET-06, SET-07, SET-08, SET-09, SET-10, ERR-01, ERR-02
**Success Criteria** (what must be TRUE):
  1. User installs via load-unpacked and translates text in any standard `<input>` or `<textarea>`
  2. Compose mode toggles on/off with blue border on the active field and "ON" badge
  3. YOLO mode replaces the entire field with one hotkey (`Ctrl+Shift+Y`)
  4. User configures provider, API key, model, and language pair in settings
  5. Red "ERR" badge appears on API failure and clears on next success
**Plans**: 1 plan

Plans:
- [x] 01-01: v1.0 full build (tasks 1–7, 10) — scaffold, modes, settings, providers, packaging

### Phase 2: Prompt Quality & Error Hardening
**Goal**: Translations are clean and failures surface actionable feedback
**Depends on**: Phase 1
**Requirements**: FORM-06, FORM-07, FORM-08, ERR-03, ERR-04, ERR-05, LOG-01, LOG-02
**Success Criteria** (what must be TRUE):
  1. Translation output contains no stray wrapper text, quotes, or meta-commentary across 20+ input types
  2. Auto formality infers casual register from casual English (slang, emoji) and formal register from business English
  3. Network timeout surfaces a user-visible error within 15 seconds — no silent hangs
  4. Invalid API key shows a specific error message, not a generic failure
  5. Rate-limit errors are distinguishable from network or auth failures
**Plans**: TBD

### Phase 3: Cross-Site Compatibility
**Goal**: Extension works reliably on the 7 highest-traffic complex editors
**Depends on**: Phase 2
**Requirements**: FIELD-08, FIELD-09, FIELD-10, FIELD-11, FIELD-12, FIELD-13, FIELD-14, REPL-03, COMP-06, COMP-07, YOLO-02, YOLO-03
**Success Criteria** (what must be TRUE):
  1. Compose + YOLO + undo work correctly in Gmail compose (Shadow DOM contenteditable)
  2. Extension operates or degrades gracefully with a clear message in Google Docs
  3. Extension operates correctly in Notion, Slack web, Discord web, Twitter/X, and GitHub
  4. Cursor position is preserved after translation completes
  5. Compose mode border and badge clear when focus leaves the active field
**Plans**: TBD
**UI hint**: yes

### Phase 4: Web Store Distribution
**Goal**: Extension is submitted to the Chrome Web Store
**Depends on**: Phase 3
**Requirements**: EXT-05
**Success Criteria** (what must be TRUE):
  1. Store listing has required screenshots, privacy policy, and store description
  2. Extension package passes Chrome Web Store submission requirements
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core Extension Build | 1/1 | Complete | 2026-05-24 |
| 2. Prompt Quality & Error Hardening | 0/? | Not started | - |
| 3. Cross-Site Compatibility | 0/? | Not started | - |
| 4. Web Store Distribution | 0/? | Not started | - |
