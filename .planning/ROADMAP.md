# Roadmap: hime

## Milestones

- v1.0 MVP — Phases 1-4 (shipped 2026-05-25)
- v1.1 Inline Predictions — Phases 5-7 (PAUSED 2026-06-02; phase 5 shelved behind flag, phases 6-7 unbuilt)
- v1.2 Translated Search — Phases 8-11 (active)

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

### v1.2 Translated Search (Phases 8-11) — ACTIVE

- [x] **Phase 8: API Integration Scaffold** - searchTranslated message type, BraveSearchClient, Brave key setting + test, source==target guard, 429 handling (completed 2026-06-03)
- [x] **Phase 9: SERP Rendering** - SearchResult type, XSS-safe renderer, skeleton/empty/error states (completed 2026-06-03)
- [ ] **Phase 10: Translation Pipeline** - Keyed-JSON batch translation, count assertion, raw fallback, three-stage progressive render
- [ ] **Phase 11: Page Wiring & Popup Entry** - Full search.ts wired end-to-end, query translation disclosure line, debounce, popup button

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

### Phase 8: API Integration Scaffold

**Goal**: The background service worker can execute a complete Brave Search round-trip — receive the searchTranslated message, fetch results with the user's Brave key, and return raw results — with all error and edge-case paths handled before any UI exists.
**Depends on**: Phase 5 (background message dispatch pattern, chrome.storage, provider abstraction)
**Requirements**: SRCH-04, SRCH-05, SRCH-06, SSET-01, SSET-02, XLT-01
**Success Criteria** (what must be TRUE):

  1. The user can enter and save a Brave API key in the options page; a "Test Connection" action confirms the key is valid against the live Brave endpoint and shows a human-readable error when it is not.
  2. Sending a searchTranslated message from any extension page reaches the background worker, performs a Brave Search fetch using the stored key, and returns a result array — no API key is ever accessible from the search page itself.
  3. When the source language and target language settings are identical, the background handler short-circuits all translation calls and returns a flag indicating the search ran directly in that language.
  4. When Brave returns HTTP 429, the error surfaces as "search quota exceeded" and the request does not auto-retry; other network failures return a distinct error state.
  5. Submit debounce (~1s) is enforced by the message contract such that rapid successive calls do not generate duplicate Brave requests.

**Plans**: 4 plans

- [x] 08-01-PLAN.md — SearchResult type + searchTranslated/testBraveKey message types + braveApiKey setting + search_quota error model (D-01, D-02, D-03, D-07)
- [x] 08-02-PLAN.md — BraveSearchClient (src/brave-search.ts) + manifest host_permissions; web.results→SearchResult mapping, 429/network classification (SRCH-04)
- [x] 08-03-PLAN.md — background searchTranslated + testBraveKey handlers: in-flight dedup, source==target direct flag, key-from-storage (SRCH-05, SRCH-06, XLT-01)
- [x] 08-04-PLAN.md — options page Brave key field + worker-routed Test Brave Key button + live-key checkpoint (SSET-01, SSET-02)

**UI hint**: yes

### Phase 9: SERP Rendering

**Goal**: A static search page renders a well-formed, XSS-safe SERP from a fixed mock result set, covering all display states a user can encounter — populated results, skeleton loading, empty, and each error variant.
**Depends on**: Phase 8 (SearchResult type contract established)
**Requirements**: SERP-01, SERP-02, SERP-03, SERP-04, SERP-05
**Success Criteria** (what must be TRUE):

  1. Each result row renders favicon + hostname, a translated title that is a clickable link, and a translated snippet — all from the SearchResult data.
  2. Every result link's href is the verbatim original URL from Brave; no mutation, encoding change, proxy wrapping, or translation is applied to URLs.
  3. A snippet containing raw HTML (e.g. `<strong>` highlights or `<script>` tags) is rendered as plain text and never executed — verified by injecting a `<script>alert(1)</script>` mock snippet.
  4. While results are loading, skeleton placeholder rows are shown so the page is never blank during the 2-8s async window.
  5. Each distinct error state (empty results, missing/invalid Brave key, network failure, quota exceeded/429) renders a unique, human-readable message rather than a generic error or blank page.

**Plans**: 2 plans

- [x] 09-01-PLAN.md — linkedom devDep + DOM-agnostic renderSerp/SerpState core + shared mock fixtures (7 states + XSS probe) + node:test harness (SERP-01..05)
- [x] 09-02-PLAN.md — search.html shell + light-theme Google-style search.css + search.ts ?state= entry + 7-state visual walkthrough (SERP-01, SERP-04, SERP-05)

**UI hint**: yes

### Phase 10: Translation Pipeline

**Goal**: Result titles and snippets are translated back to the user's language via a single batched LLM call that is robust to model misbehavior — count mismatches fall back to raw text rather than wrong or blank output — and the page renders progressively so a slow or failed translation still leaves usable results.
**Depends on**: Phase 8 (searchTranslated handler, provider layer), Phase 9 (renderer accepts both raw and translated results)
**Requirements**: XLT-02, XLT-03, XLT-04, XLT-05
**Success Criteria** (what must be TRUE):

  1. Result titles and snippets are translated in a single batched LLM call using a keyed JSON object; the provider receives only title and description fields — URLs and hostnames are never present in the translation prompt.
  2. When the LLM returns fewer or more keyed entries than sent, the affected results display their original untranslated text rather than mismatched or blank content.
  3. The page transitions through three visible stages: skeleton rows while Brave fetches, raw untranslated results immediately after the Brave response, then translated results overlaid after the LLM batch completes.
  4. If the background service worker times out or the translation LLM call fails entirely, the user is left with readable raw Brave results rather than a blank or errored page.

**Plans**: 2 plans

- [x] 10-01-PLAN.md — src/translate-batch.ts pure functions (buildBatchPayload, buildBatchTranslatePrompt, parseBatchReply, mergeTranslations) + translateBatch message types + node:test harness (XLT-02, XLT-03, XLT-04, XLT-05)
- [ ] 10-02-PLAN.md — background.ts translateBatch worker case: provider+key guard, Promise.race 8s timeout, worker-side parseBatchReply, { translations } | { error, kind } (XLT-02, XLT-05)

### Phase 11: Page Wiring & Popup Entry

**Goal**: The translated search feature is fully connected end-to-end — a user opens it from the popup, enters a query in their own language, sees what it was translated to, and receives translated SERP results for that query.
**Depends on**: Phase 9 (renderer), Phase 10 (translation pipeline)
**Requirements**: SRCH-01, SRCH-02, SRCH-03
**Success Criteria** (what must be TRUE):

  1. Clicking the search button in the extension popup opens the bundled `search.html` page in a new tab.
  2. After the user submits a query, the translated form of that query appears as a read-only disclosure line (e.g. "Searching in Japanese for: ___") above the results before results load.
  3. The query is translated using explicit source-to-target direction and does not trigger the auto-flip behavior used by the inline translate modes; the language pair shown in the disclosure line matches the user's settings.

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
| 5. Ghost-Text Prediction Engine | v1.1 | 2/2 | Complete (shelved) | 2026-05-31 |
| 6. Alternate Variations & Cycling | v1.1 | 0/0 | Paused | - |
| 7. Prediction Settings | v1.1 | 0/0 | Paused | - |
| 8. API Integration Scaffold | v1.2 | 4/4 | Complete    | 2026-06-03 |
| 9. SERP Rendering | v1.2 | 2/2 | Complete   | 2026-06-03 |
| 10. Translation Pipeline | v1.2 | 1/2 | In Progress|  |
| 11. Page Wiring & Popup Entry | v1.2 | 0/0 | Not started | - |
