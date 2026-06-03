# Requirements: hime — Milestone v1.2 Translated Search

**Milestone goal:** An extension page where the user searches in their own language, the query runs against Brave Search in the target language, and results render as a classic Google-style SERP translated back into the user's language, each linking to the original page.

**Status:** Roadmap complete — ready to plan Phase 8

---

## v1.2 Requirements

### Search & Query (SRCH)

- [ ] **SRCH-01**: From the toolbar popup, the user can open a bundled Translated Search page (`search.html`) via `chrome.tabs.create(getURL(...))`.
- [ ] **SRCH-02**: The user enters a query in their own (source) language; on submit it is translated to the configured target language using an explicit source→target direction (NOT the auto-flip used by in-field translate).
- [ ] **SRCH-03**: The translated query is shown to the user as a read-only disclosure line (e.g. "Searching in Japanese for: …") above the results — not editable.
- [x] **SRCH-04**: The translated query is sent to the Brave Search API and web results are retrieved.
- [x] **SRCH-05**: When source language == target language, all translation is skipped (no-op short-circuit) and the search runs directly, with a notice that it searched directly in that language.
- [x] **SRCH-06**: Submit is debounced (~1s) to avoid duplicate Brave calls / rate-limit waste.

### Results SERP (SERP)

- [ ] **SERP-01**: Results render as a classic Google-style SERP: each row shows favicon + hostname, a translated title that links to the result, and a translated snippet.
- [ ] **SERP-02**: Each result link's `href` is the original Brave-provided URL verbatim — never translated, never mutated, never proxied.
- [ ] **SERP-03**: Result snippet/title text is rendered XSS-safely — Brave `description` HTML (e.g. `<strong>` highlights) is stripped to plain text; content is never assigned to `innerHTML`.
- [ ] **SERP-04**: While the async pipeline runs, skeleton rows are shown (no blank screen during the 2–8s latency).
- [ ] **SERP-05**: Empty results, invalid/missing API key, network failure, and quota-exceeded (HTTP 429) each show a distinct, human-readable state — 429 reads as "search quota exceeded" and does not auto-retry.

### Result Translation Pipeline (XLT)

- [x] **XLT-01**: All network calls (Brave Search and LLM translation) are routed through the background service worker via a single `searchTranslated` message type; no API key is ever read or fetched from the search page itself.
- [ ] **XLT-02**: Result titles and snippets are translated in one batched LLM call using a keyed JSON object (`{"0": …, "1": …}`), reusing the existing OpenAI/Gemini/OpenRouter provider abstraction.
- [ ] **XLT-03**: After the batch translation returns, the result count is asserted against the input count; on mismatch the affected items fall back to raw untranslated text (never blank, never mismapped).
- [ ] **XLT-04**: Only `title` and `description` fields are sent to the translation prompt — URLs/hostnames are never passed to translation.
- [ ] **XLT-05**: The pipeline renders progressively (skeleton → raw Brave results → translated overlay) so a service-worker timeout or translation failure still leaves usable untranslated results.

### Settings (SSET)

- [x] **SSET-01**: The options page has a Brave Search API key field (BYOK), stored in `chrome.storage` alongside the existing LLM keys.
- [x] **SSET-02**: The options page can test/validate the Brave key (consistent with the existing "Test Connection" pattern), or surfaces a clear "key required" message when absent.

---

## Future Requirements (deferred, not this milestone)

- Pagination / "load more" results
- Image / video / news result tabs
- Editable translated query (re-run on edit)
- Per-result "show original" hover/toggle
- Auto-detect source language (v1.2 uses the settings value)
- Caching of recent searches/translations

---

## Out of Scope (v1.2)

- **Backend / hosted web app** — search page is a bundled extension page; BYOK, no server, no proxy.
- **Link proxying / click-to-translated-page** — links always go to the original untranslated source.
- **Non-Brave search providers** — Brave only for v1.2; abstraction can come later if needed.
- **Translate-as-you-type query translation** — query translates on submit, not per keystroke.

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SRCH-01 | Phase 11 | Pending |
| SRCH-02 | Phase 11 | Pending |
| SRCH-03 | Phase 11 | Pending |
| SRCH-04 | Phase 8 | Complete |
| SRCH-05 | Phase 8 | Complete |
| SRCH-06 | Phase 8 | Complete |
| SERP-01 | Phase 9 | Pending |
| SERP-02 | Phase 9 | Pending |
| SERP-03 | Phase 9 | Pending |
| SERP-04 | Phase 9 | Pending |
| SERP-05 | Phase 9 | Pending |
| XLT-01 | Phase 8 | Complete |
| XLT-02 | Phase 10 | Pending |
| XLT-03 | Phase 10 | Pending |
| XLT-04 | Phase 10 | Pending |
| XLT-05 | Phase 10 | Pending |
| SSET-01 | Phase 8 | Complete |
| SSET-02 | Phase 8 | Complete |

**Coverage:** 18/18 requirements mapped.

---

## Paused — v1.1 Inline Predictions (NOT this milestone)

v1.1 is paused, not archived. Phase 5 shipped (PRED-*/LANG-* complete) but is shelved behind `PREDICT_ENABLED=false` in `content.ts` with the Predict hotkey row hidden in `options.html`. Phases 6 (VAR-*) and 7 (SET-*) are unbuilt. Resume by flipping the flag, unhiding `#predictHotkeyRow`, and roadmapping the VAR/SET requirements below.

- PRED-01..06 — ghost-text engine (complete, shelved)
- LANG-01..02 — language-agnostic field support (complete, shelved)
- VAR-01..03 — alternate variations & cycling (unbuilt)
- SET-01..05 — prediction settings (unbuilt; note SET-03 configurable trigger partially landed early in Phase 5)
