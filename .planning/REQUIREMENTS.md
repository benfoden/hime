# Requirements: hime

**Defined:** 2026-05-24
**Core Value:** Type English, get natural Japanese inline — without breaking your keyboard flow.

## v1 Requirements

### Extension Setup

- [x] **EXT-01**: Extension installs via load-unpacked in Chrome (Manifest V3)
- [x] **EXT-02**: Background service worker handles all LLM API calls
- [x] **EXT-03**: Content script activates on all `http://` and `https://` pages
- [x] **EXT-04**: Extension icon displays in Chrome toolbar
- [ ] **EXT-05**: Extension is packaged and submittable to Chrome Web Store (screenshots, privacy policy, store listing)

### Text Field Detection

- [x] **FIELD-01**: Extension detects and operates on `<input>` elements (text type)
- [x] **FIELD-02**: Extension detects and operates on `<textarea>` elements
- [x] **FIELD-03**: Extension detects and operates on `contenteditable` elements
- [x] **FIELD-04**: Extension skips `<input type="password">` fields
- [x] **FIELD-05**: Extension skips `readonly` fields
- [x] **FIELD-06**: Extension skips `hidden` fields
- [x] **FIELD-07**: Extension skips `disabled` fields
- [ ] **FIELD-08**: Extension operates correctly in Gmail compose window (contenteditable)
- [ ] **FIELD-09**: Extension operates correctly in Google Docs (contenteditable, complex DOM)
- [ ] **FIELD-10**: Extension operates correctly in Notion editor (contenteditable)
- [ ] **FIELD-11**: Extension operates correctly in Slack web composer (contenteditable)
- [ ] **FIELD-12**: Extension operates correctly in Discord web composer (contenteditable)
- [ ] **FIELD-13**: Extension operates correctly in Twitter/X compose box (contenteditable)
- [ ] **FIELD-14**: Extension operates correctly in GitHub issue/PR text areas

### Text Replacement

- [x] **REPL-01**: Text replacement uses `document.execCommand('insertText')` for undo safety
- [x] **REPL-02**: `Ctrl+Z` restores original text after translation
- [ ] **REPL-03**: Replacement preserves cursor position after translation completes

### Compose Mode

- [x] **COMP-01**: `Ctrl+Shift+T` toggles Compose mode on
- [x] **COMP-02**: `Ctrl+Shift+T` toggles Compose mode off
- [x] **COMP-03**: Active Compose mode displays blue border on current field
- [x] **COMP-04**: Active Compose mode displays "ON" badge on extension icon
- [x] **COMP-05**: `Escape` key cancels Compose mode without translating
- [ ] **COMP-06**: Compose mode triggers translation when user presses Enter or a configured submit key
- [ ] **COMP-07**: Compose mode badge and border clear when focus leaves the active field

### YOLO Mode

- [x] **YOLO-01**: `Ctrl+Shift+Y` replaces entire field content with translation in one shot
- [ ] **YOLO-02**: YOLO mode shows loading indicator during API call
- [ ] **YOLO-03**: YOLO mode restores original content if translation fails

### Language Configuration

- [x] **LANG-01**: User can set source language in settings
- [x] **LANG-02**: User can set target language in settings
- [x] **LANG-03**: `Ctrl+Shift+S` swaps source and target languages
- [x] **LANG-04**: Extension badge displays 2-letter target language code
- [x] **LANG-05**: Language swap persists across browser sessions

### Formality Control

- [x] **FORM-01**: User can select Auto formality (LLM infers register from input tone)
- [x] **FORM-02**: User can select Casual formality
- [x] **FORM-03**: User can select Polite formality
- [x] **FORM-04**: User can select Formal formality
- [x] **FORM-05**: Formality selection applies language-specific prompt instructions
- [ ] **FORM-06**: Auto formality correctly infers casual register from casual English input
- [ ] **FORM-07**: Auto formality correctly infers polite/formal register from business English input
- [ ] **FORM-08**: Translation output contains no stray quotes, explanations, or meta-commentary

### Provider Support

- [x] **PROV-01**: User can select OpenAI as provider in settings
- [x] **PROV-02**: User can select Gemini as provider in settings
- [x] **PROV-03**: Extension uses GPT-4o mini (or equivalent small model) when OpenAI is selected
- [x] **PROV-04**: Extension uses Gemini 2.5 Flash when Gemini is selected
- [x] **PROV-05**: Provider abstraction layer allows adding new providers without modifying content script or background logic

### API Key Management (BYOK)

- [x] **KEY-01**: User enters their own API key in settings
- [x] **KEY-02**: API key can be stored in `chrome.storage.local` (persists across sessions)
- [x] **KEY-03**: API key can be stored in `chrome.storage.session` (cleared on browser close)
- [x] **KEY-04**: Settings page warns user that key is stored client-side
- [x] **KEY-05**: "Test Connection" button in settings validates the API key against the selected provider

### Settings Page

- [x] **SET-01**: Settings page is accessible from extension popup or options
- [x] **SET-02**: User can configure provider (OpenAI / Gemini)
- [x] **SET-03**: User can configure model within selected provider
- [x] **SET-04**: User can configure API key
- [x] **SET-05**: User can configure storage mode (local / session)
- [x] **SET-06**: User can configure source language
- [x] **SET-07**: User can configure target language
- [x] **SET-08**: User can configure formality level
- [x] **SET-09**: User can enter a custom system prompt override
- [x] **SET-10**: All settings changes persist immediately without a save button (or explicit save is available and works)

### Error Handling

- [x] **ERR-01**: Extension badge turns red ("ERR") when API call fails
- [x] **ERR-02**: Error state clears when next successful translation completes
- [ ] **ERR-03**: Network timeout surfaces a user-visible error (badge or notification), not a silent hang
- [ ] **ERR-04**: Invalid API key shows specific error message (not generic failure)
- [ ] **ERR-05**: Rate-limit errors surface a user-visible message distinguishing them from other failures

### Logging & Observability

- [ ] **LOG-01**: Background service worker logs translation requests and responses at debug level to the extension's background page console
- [ ] **LOG-02**: Errors are logged with enough context to diagnose the failure (provider, model, error code)

## v2 Requirements

### Additional Providers

- **PROV2-01**: User can select Anthropic Claude as provider
- **PROV2-02**: User can select a local Ollama proxy as provider
- **PROV2-03**: User can select Mistral as provider

### Per-Site Language Memory

- **SITE-01**: Extension remembers last-used language pair per domain
- **SITE-02**: Per-site language memory can be cleared from settings

### Translation Cache

- **CACHE-01**: Identical source strings return cached translations without an API call
- **CACHE-02**: Cache is bounded (LRU, max N entries) and does not grow unbounded
- **CACHE-03**: User can clear translation cache from settings

### Glossary / Term Overrides

- **GLOSS-01**: User can define term pairs (source → target) that override LLM output
- **GLOSS-02**: Glossary is applied after translation before inserting into the field
- **GLOSS-03**: Glossary entries are editable and deletable in settings

### Firefox / Safari Port

- **PORT-01**: Extension runs in Firefox with equivalent functionality (MV3 or MV2 as required)

## Out of Scope

| Feature | Reason |
|---------|--------|
| System-wide (non-browser) IME | Requires native OS binary and OS-level permissions — entirely different product surface |
| Offline / local model inference | Bundling a model (100 MB–7 GB) is impractical under MV3 service worker lifetime; BYOK addresses cost concern |
| Streaming / translate-as-you-type | Thrashes API on every keystroke; cursor chaos during incremental output; explicit trigger is the right UX |
| Multiple simultaneous language pairs | Cognitive overhead; hotkey slots capped at 4; swap UX becomes ambiguous beyond one pair |
| Right-click context menu translation | Mouse-based; breaks keyboard-native identity; YOLO covers the same workflow |
| Auto-popup suggestions while typing | Interferes with existing IME on sites; competes with host-page autocomplete; high jank risk |
| Hotkey rebinding in options UI | Chrome commands API exposes `chrome://extensions/shortcuts`; duplicating it adds maintenance burden |
| Spaced repetition / flashcards | Different product with different retention, scheduling, and progress-tracking needs |
| Backend / server-side proxy | Eliminated in favor of BYOK; no hosting needed |
| Non-Chrome browsers (v1) | MV3 APIs differ enough to be a real port; deferred to v2 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| EXT-01 | Phase 1 | Complete |
| EXT-02 | Phase 1 | Complete |
| EXT-03 | Phase 1 | Complete |
| EXT-04 | Phase 1 | Complete |
| EXT-05 | Phase 4 | Pending |
| FIELD-01 | Phase 1 | Complete |
| FIELD-02 | Phase 1 | Complete |
| FIELD-03 | Phase 1 | Complete |
| FIELD-04 | Phase 1 | Complete |
| FIELD-05 | Phase 1 | Complete |
| FIELD-06 | Phase 1 | Complete |
| FIELD-07 | Phase 1 | Complete |
| FIELD-08 | Phase 3 | Pending |
| FIELD-09 | Phase 3 | Pending |
| FIELD-10 | Phase 3 | Pending |
| FIELD-11 | Phase 3 | Pending |
| FIELD-12 | Phase 3 | Pending |
| FIELD-13 | Phase 3 | Pending |
| FIELD-14 | Phase 3 | Pending |
| REPL-01 | Phase 1 | Complete |
| REPL-02 | Phase 1 | Complete |
| REPL-03 | Phase 3 | Pending |
| COMP-01 | Phase 1 | Complete |
| COMP-02 | Phase 1 | Complete |
| COMP-03 | Phase 1 | Complete |
| COMP-04 | Phase 1 | Complete |
| COMP-05 | Phase 1 | Complete |
| COMP-06 | Phase 3 | Pending |
| COMP-07 | Phase 3 | Pending |
| YOLO-01 | Phase 1 | Complete |
| YOLO-02 | Phase 3 | Pending |
| YOLO-03 | Phase 3 | Pending |
| LANG-01 | Phase 1 | Complete |
| LANG-02 | Phase 1 | Complete |
| LANG-03 | Phase 1 | Complete |
| LANG-04 | Phase 1 | Complete |
| LANG-05 | Phase 1 | Complete |
| FORM-01 | Phase 1 | Complete |
| FORM-02 | Phase 1 | Complete |
| FORM-03 | Phase 1 | Complete |
| FORM-04 | Phase 1 | Complete |
| FORM-05 | Phase 1 | Complete |
| FORM-06 | Phase 2 | Pending |
| FORM-07 | Phase 2 | Pending |
| FORM-08 | Phase 2 | Complete |
| PROV-01 | Phase 1 | Complete |
| PROV-02 | Phase 1 | Complete |
| PROV-03 | Phase 1 | Complete |
| PROV-04 | Phase 1 | Complete |
| PROV-05 | Phase 1 | Complete |
| KEY-01 | Phase 1 | Complete |
| KEY-02 | Phase 1 | Complete |
| KEY-03 | Phase 1 | Complete |
| KEY-04 | Phase 1 | Complete |
| KEY-05 | Phase 1 | Complete |
| SET-01 | Phase 1 | Complete |
| SET-02 | Phase 1 | Complete |
| SET-03 | Phase 1 | Complete |
| SET-04 | Phase 1 | Complete |
| SET-05 | Phase 1 | Complete |
| SET-06 | Phase 1 | Complete |
| SET-07 | Phase 1 | Complete |
| SET-08 | Phase 1 | Complete |
| SET-09 | Phase 1 | Complete |
| SET-10 | Phase 1 | Complete |
| ERR-01 | Phase 1 | Complete |
| ERR-02 | Phase 1 | Complete |
| ERR-03 | Phase 2 | Pending |
| ERR-04 | Phase 2 | Complete |
| ERR-05 | Phase 2 | Complete |
| LOG-01 | Phase 2 | Pending |
| LOG-02 | Phase 2 | Complete |

**Coverage:**
- v1 requirements: 67 total
- Mapped to phases: 67
- Unmapped: 0 ✓

**Phase summary:**
- Phase 1 (scaffold + core features): 46 requirements — all Complete
- Phase 2 (prompt validation + error hardening + logging): 8 requirements — Pending
- Phase 3 (cross-site compatibility): 11 requirements — Pending
- Phase 4 (Web Store submission): 2 requirements — Pending

---
*Requirements defined: 2026-05-24*
*Last updated: 2026-05-24 after initial definition from PROJECT.md and feature research*
