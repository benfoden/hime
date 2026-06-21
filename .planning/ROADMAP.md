# Roadmap: hime

## Milestones

- ✅ v1.0 MVP — Phases 1-4 (shipped 2026-05-25)
- ⏸ v1.1 Inline Predictions — Phases 5-7 (PAUSED 2026-06-02; phase 5 shelved behind flag, phases 6-7 unbuilt)
- ✅ v1.2 Translated Search — Phases 8-11 (shipped 2026-06-20)
- 🚧 v1.3 Image Translation — Phases 12-14 (in progress; started 2026-06-20)

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

<details open>
<summary>🚧 v1.3 Image Translation (Phases 12-14) — IN PROGRESS</summary>

OCR + translate text inside web-page images via a cloud vision LLM (BYOK), surfaced as readable text in a native Chrome side panel. Two triggers — right-click context menu (manual) and opt-in progressive viewport mode (default OFF). Side-panel text only; no in-image overlay/inpaint. Provider: Google Cloud (Vision API OCR + Translation v2, single BYOK API key) behind a provider-agnostic `VisionProvider` interface. All network + keys stay in the background worker.

- [ ] **Phase 12: Image OCR Pipeline + Right-Click + Side Panel** - Manual vertical slice: VisionProvider + Google Cloud (Vision OCR + Translation v2), translateImage worker case, worker-side byte resolver + captureVisibleTab fallback, validate/downscale, context menu, side panel, per-image state contract (IMG-01..05, IMG-07, VIS-01, VIS-03)
- [ ] **Phase 13: Progressive Viewport Mode + Cost Control + Privacy Opt-In** - Default-OFF toggle, IntersectionObserver, content-hash dedup + cache, concurrency/budget/debounce/min-size guards, first-enable privacy warning + activity indicator, badge-not-auto-open (PROG-01..06)
- [ ] **Phase 14: UX / Quality Hardening + Vision Settings** - Google Cloud API key field + connection test, copy original+translation, source-language + no-text/low-confidence polish, CJK legibility recheck, downscale tuning (VIS-02, IMG-06)

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

### Phase 12: Image OCR Pipeline + Right-Click + Side Panel

**Goal**: A user can right-click any image on a page, OCR the text inside it via Google Cloud Vision (BYOK, Vision API only), translate that text through the user's configured LLM translation model (the main translation pipeline — NOT Google Translation v2; steer 2026-06-21), and read the original text plus its translation in a native side panel — the complete manual vertical slice that both triggers later reuse.
**Depends on**: Phase 11 (v1.2 worker onMessage switch, in-flight dedup, recordUsage, classifyError, extension-page + textContent-only render pattern, BYOK key plumbing)
**Requirements**: IMG-01, IMG-02, IMG-03, IMG-04, IMG-05, IMG-07, VIS-01, VIS-03
**Success Criteria** (what must be TRUE):

  1. The user can right-click any `<img>` on a page and pick "Translate image with hime"; the side panel opens (synchronously, within the click gesture) and shows that image's result.
  2. For an image containing readable text, the panel shows the detected original text, its translation into the user's configured target language, and the detected source language ("Detected: Japanese → English").
  3. Every image translation resolves to exactly one visible state — loading, then one of: text+translation, "no text found", low-confidence, or error — and never renders a silent blank, even for cross-origin, tainted-canvas, or oversized images.
  4. Image bytes are resolved inside the background worker (fetch under host_permissions, with a `captureVisibleTab` crop fallback) and validated/downscaled to the provider's MIME, size, and long-edge limits before send; the BYOK vision key is read only in the worker and never reaches the page.
  5. A slow image job completes or surfaces an explicit error (per-call timeout, so the panel never hangs). Job/result state is **session-scoped only** (`storage.session`) and is intentionally cleared when the browser session ends — image results MUST NOT persist beyond the session (privacy steer 2026-06-21). Survival across a *manual* worker restart is explicitly NOT required (was relaxed from the original durability wording).

**Deviations (2026-06-21, human-verify):** (a) translation moved off Google Translation v2 → the main LLM pipeline, so the Google key needs only Cloud Vision enabled; (b) criterion #5 reframed to session-only privacy (clearing is desired); (c) VIS-02 vision-key settings UI + connection test forward-pulled from Phase 14 into this slice. Human-verified all 6 in-browser behaviors PASS.

**Plans**: 7 plans

Plans:

- [x] 12-01-PLAN.md — type contracts (VisionProvider/ImageResult/ImageState/messages) + languageToIso map + @types/chrome bump + Wave 0 test scaffolds
- [x] 12-02-PLAN.md — GoogleVisionProvider (Vision DOCUMENT_TEXT_DETECTION + Translation v2, one BYOK key; TDD)
- [x] 12-03-PLAN.md — image-resolve pure utils (downscale math, MIME guard, base64 strip, mean confidence, result-state derivation; TDD)
- [x] 12-04-PLAN.md — panel-render renderer (clone of serp-render; prepend, breaks, amber/no-text/error states; TDD)
- [x] 12-05-PLAN.md — translateImage worker case + contextMenus + sidePanel gesture + byte ladder + OffscreenCanvas downscale + storage.session + manifest deltas
- [x] 12-06-PLAN.md — side panel page (sidepanel.ts/html/css, clone of search.*) — getSettings, rebuild-on-open, prepend listener
- [ ] 12-07-PLAN.md — live provider smoke (opt-in, dist/) + in-browser end-to-end human-verify checkpoint

**UI hint**: yes

### Phase 13: Progressive Viewport Mode + Cost Control + Privacy Opt-In

**Goal**: With an explicit opt-in, a user reading an image-heavy page sees images auto-translated into the side panel as they approach the viewport — without runaway API cost, duplicate billing, or silent uploads of every image they scroll past.
**Depends on**: Phase 12 (translateImage worker case, side panel, per-image state contract, durable job/dedup state)
**Requirements**: PROG-01, PROG-02, PROG-03, PROG-04, PROG-05, PROG-06
**Success Criteria** (what must be TRUE):

  1. Progressive image translation is OFF by default; the user can turn it on from settings and it takes effect immediately without reloading the extension.
  2. With progressive mode on, images auto-translate as they enter or approach the viewport (IntersectionObserver with a viewport margin), and re-scrolling past an already-translated image reuses the cached result (content-hash dedup) instead of re-billing.
  3. Scrolling a media-heavy page cannot fan out unbounded paid calls: a concurrency cap, a per-page budget, a dwell debounce before firing, and a minimum-size eligibility filter are all enforced.
  4. The first time progressive mode is enabled, the user sees an explicit warning that page images will be sent to a cloud vision API, and an activity indicator shows while progressive translation is running.
  5. Progressive results badge the translated image and populate the side panel when it is open, but never auto-open the side panel (no user gesture is available to call `sidePanel.open()`).

**Plans**: 4 plans

Plans:
- [ ] 13-01-PLAN.md — pure cost-guard + dedup core (eligibility, budget, concurrency, content-hash key, dwell) — TDD
- [ ] 13-02-PLAN.md — progressiveEnabled setting + message contract + options toggle/first-enable privacy modal/ack
- [ ] 13-03-PLAN.md — content-script viewport engine: IntersectionObserver + dwell, guards, dedup, on-image badge + ON indicator, badge-click gesture
- [ ] 13-04-PLAN.md — worker progressiveTranslate (content-hash dedup, single funnel) + openImagePanel gesture open/scroll + activity push

**UI hint**: yes

### Phase 14: UX / Quality Hardening + Vision Settings

**Goal**: The image-translation feature is settings-complete and trustworthy on real-world content — the user can configure and test their vision key, copy results, and the panel sets honest expectations for messy, low-confidence, and CJK/vertical text.
**Depends on**: Phase 13 (full manual + progressive pipeline shipped)
**Requirements**: VIS-02, IMG-06
**Success Criteria** (what must be TRUE):

  1. The user can enter a Google Cloud API key in settings (stored client-side like existing keys) and run a connection test that exercises the Vision + Translation endpoints through the background worker before relying on it.
  2. From the side panel, the user can copy the translated text and, separately, the detected original text for any image result.
  3. The detected source language and no-text / low-confidence outcomes are presented clearly enough that the user can tell a genuine "no text" from a failure, with no silent or misleading blanks.
  4. CJK and vertical-text results are rechecked for legibility, downscale limits are tuned so large images send reliably rather than erroring opaquely, and the panel sets honest expectations where vendor OCR quality is known to be weak.

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
| 10. Translation Pipeline | v1.2 | 2/2 | Complete    | 2026-06-10 |
| 11. Page Wiring & Popup Entry | v1.2 | 3/3 | Complete    | 2026-06-20 |
| 12. Image OCR Pipeline + Right-Click + Side Panel | v1.3 | 7/7 | Complete | 2026-06-21 |
| 13. Progressive Viewport Mode + Cost Control + Privacy Opt-In | v1.3 | 0/4 | Planned | - |
| 14. UX / Quality Hardening + Vision Settings | v1.3 | 0/0 | Not started | - |

## Backlog

### Phase 999.1: Two-pass SERP translation (headings first, then descriptions) (BACKLOG)

**Goal:** [Captured for future planning] Translate all search-result headings in a first pass, then descriptions in a second pass, so the user gets the most useful information (titles) fastest — progressive SERP rendering instead of waiting for the full batch.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.2: Auto-translate destination page on search-result clickthrough (BACKLOG)

**Goal:** [Captured for future planning] When the user clicks a hime SERP result, auto-translate the destination page after navigation — carry the translate intent through the clickthrough so the landing page is translated without a second manual action.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)
