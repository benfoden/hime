# Roadmap: hime

## Milestones

- ✅ v1.0 MVP — Phases 1-4 (shipped 2026-05-25)
- ⏸ v1.1 Inline Predictions — Phases 5-7 (PAUSED 2026-06-02; phase 5 shelved behind flag, phases 6-7 unbuilt)
- ✅ v1.2 Translated Search — Phases 8-11 (shipped 2026-06-20)
- ✅ v1.3 Image Translation — Phases 12-14 (shipped 2026-06-22)
- 🚧 v1.4 In-Place Page Translation — Phases 15-16 (in progress; started 2026-06-22)

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

<details>
<summary>✅ v1.3 Image Translation (Phases 12-14) — SHIPPED 2026-06-22</summary>

Full phase details archived to `milestones/v1.3-ROADMAP.md`. Audit passed (16/16 reqs; all 4 E2E flows wired) — see `milestones/v1.3-MILESTONE-AUDIT.md`. Deviation D-V01: OCR via Google Cloud Vision, translation via the user's existing LLM provider (not Cloud Translation v2).

- [x] **Phase 12: Image OCR Pipeline + Right-Click + Side Panel** - VisionProvider (Google Cloud Vision OCR + LLM translate), worker byte resolver + captureVisibleTab fallback, validate/downscale, context menu, side panel, per-image state contract (completed 2026-06-21)
- [x] **Phase 13: Progressive Viewport Mode + Cost Control + Privacy Opt-In** - Default-OFF toggle, IntersectionObserver, content-hash dedup + cache, concurrency/budget/debounce/min-size guards, first-enable privacy warning + activity indicator, badge-not-auto-open (completed 2026-06-21)
- [x] **Phase 14: UX / Quality Hardening + Vision Settings** - Google Cloud key field + Vision connection test, copy original+translation, source-language + no-text/low-confidence polish, `[hime N]` badges, CJK note (completed 2026-06-21)

</details>

<details open>
<summary>🚧 v1.4 In-Place Page Translation (Phases 15-16) — IN PROGRESS (started 2026-06-22)</summary>

- [ ] **Phase 15: In-Place Page-Text Translation + Triggers** - TreeWalker text-node snapshot, batched BYOK translate, layout-preserving in-place replace, original↔translation toggle, toolbar + right-click trigger, `<html lang>` auto-offer (PAGE-01..05, TRIG-01..03)
- [ ] **Phase 16: In-Place Image Overlay Translation** - Per-block overlay using reused Vision `boundingPoly` geometry, WCAG-AA legibility box, shrink-to-fit text, swap toggle, scroll/resize re-anchoring (OVL-01..05)

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

> v1.3 phase details (Phases 12–14) archived to `milestones/v1.3-ROADMAP.md`.

### Phase 15: In-Place Page-Text Translation + Triggers

**Goal**: A user on a foreign-language page can translate its visible text in place — the page's own text is swapped for the translation with layout intact — triggered manually or auto-offered when the page language differs from their target, and toggled back to the original at will.
**Depends on**: Phase 14 (v1.3 background BYOK translate pipeline, batched keyed-JSON translation, `shouldGateByLanguage` page-language gate in `progressive-guard.ts`, `content.ts` classic-script wiring conventions)
**Requirements**: PAGE-01, PAGE-02, PAGE-03, PAGE-04, PAGE-05, TRIG-01, TRIG-02, TRIG-03
**Success Criteria** (what must be TRUE):

  1. On a foreign-language page, the user invokes "Translate page" (toolbar action or right-click menu item) and the page's visible text is replaced in place by its translation, with the page's layout and styling preserved.
  2. Script, style, code, `contenteditable`, and form-input text are left untranslated, and links/buttons/forms remain clickable and functional after translation.
  3. The user can toggle the translated page back to its exact original text and re-apply the translation, both without reloading the page.
  4. Translation runs through the existing background BYOK LLM pipeline as batched requests (not one call per text node), and the API key never reaches the page.
  5. Translation captures a static snapshot of the page text at trigger time — content added to the DOM afterward is not auto-translated — and when `<html lang>` differs from the target language hime shows an unobtrusive, dismissible auto-offer, while same-language pages incur no API spend and the manual trigger stays available regardless of detected language.

**Plans**: 4 plans

- [x] 15-01-PLAN.md — pure page-walk.ts core (skip-set + recursive walk + chunkByBudget + buildPageBatchPrompt + key-injection-guarded parsePageBatchReply + once-only restore + failed-set) + types.ts message contracts + test/page-walk.mjs (PAGE-01..05) [Wave 1]
- [x] 15-02-PLAN.md — worker translatePageBatch case (BYOK batched) + right-click "Translate page" item + onClicked dispatch + popup button with state mirror (PAGE-04, TRIG-01) [Wave 2]
- [x] 15-03-PLAN.md — content.ts live createTreeWalker snapshot + chunked dispatch + in-place nodeValue replace + WeakMap toggle pill + translatePage/togglePage routing + session state mirror (PAGE-01/02/03/05) [Wave 3] (code complete; live checkpoint batched to phase-end gate)
- [x] 15-04-PLAN.md — content.ts auto-offer banner gated by progShouldGateByLanguage + per-origin session dismissal + partial-failure toast/red-badge/retry-failed (TRIG-02/03, PAGE-04) [Wave 4] (code complete; live checkpoint batched to phase-end gate)

**UI hint**: yes

### Phase 16: In-Place Image Overlay Translation

**Goal**: A user can overlay translated text directly on the images of the current page — each translated block sitting over its source-text region in a simple legible box — and swap any overlay back to the original, with overlays staying anchored as the page scrolls and resizes.
**Depends on**: Phase 15 (page-translate trigger + snapshot orchestration), Phase 14 (v1.3 Vision `DOCUMENT_TEXT_DETECTION` pipeline + worker image-byte fetch/`captureVisibleTab` fallback; `boundingPoly` geometry currently discarded is now extracted and reused)
**Requirements**: OVL-01, OVL-02, OVL-03, OVL-04, OVL-05
**Success Criteria** (what must be TRUE):

  1. For images on the page, the user sees each translated text block rendered as a DOM overlay positioned over its source-text region, placed using the Vision `boundingPoly` geometry returned per block (no longer discarded), translated per block through the BYOK pipeline.
  2. Each overlay draws its translated text on a simple semi-transparent background box meeting WCAG AA 4.5:1 contrast for legibility, and the underlying image pixels are never edited (no inpainting).
  3. The user can swap any individual image overlay between the translation and the original text in place.
  4. Overlays stay correctly aligned to their source-text regions as the user scrolls and resizes the window, mapping each natural-pixel box to the image's current rendered rect.
  5. Overlay text auto-fits its box via shrink-to-fit using `CanvasRenderingContext2D.measureText`, and a translation too long for its region is handled gracefully (shrunk/clamped) rather than overflowing or breaking the layout.

**Plans**: 5 plans

- [x] 16-01-PLAN.md — pure seams + contracts: overlay-geometry.ts (mapBox), overlay-fit.ts (fitText), collectParagraphBoxes + OverlayBlock/translateImageBlocks/includeImages types + RED node tests (OVL-01/04/05) [Wave 1]
- [x] 16-02-PLAN.md — worker + provider: ocr() surfaces paragraph blocks, downscaleAndGuard returns submitted dims, translateImageBlocks keyed-JSON batch case + capture-fallback flag (OVL-01) [Wave 2]
- [ ] 16-03-PLAN.md — popup "Include images" opt-in checkbox (default OFF) persisted to himeSettings, folded into Translate page (OVL-01 / D-01) [Wave 2]
- [ ] 16-04-PLAN.md — content.ts overlay layer: mirrored mapBox/fitText, gated collect+dispatch, render/anchor (ResizeObserver) black/white boxes, per-image + global toggle (OVL-01..05 / D-01/02/03) [Wave 3]
- [ ] 16-05-PLAN.md — build + full suite green + batched live load-unpacked human-verify of all 5 OVL behaviors (OVL-01..05) [Wave 4]

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
| 13. Progressive Viewport Mode + Cost Control + Privacy Opt-In | v1.3 | 4/4 | Complete | 2026-06-21 |
| 14. UX / Quality Hardening + Vision Settings | v1.3 | 5/5 | Complete   | 2026-06-21 |
| 15. In-Place Page-Text Translation + Triggers | v1.4 | 4/4 | Complete   | 2026-06-22 |
| 16. In-Place Image Overlay Translation | v1.4 | 2/5 | In Progress|  |

## Backlog

### Phase 999.1: Two-pass SERP translation (headings first, then descriptions) (BACKLOG)

**Goal:** [Captured for future planning] Translate all search-result headings in a first pass, then descriptions in a second pass, so the user gets the most useful information (titles) fastest — progressive SERP rendering instead of waiting for the full batch.
**Requirements:** TBD
**Plans:** 2/5 plans executed

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.2: Auto-translate destination page on search-result clickthrough (BACKLOG)

**Goal:** [Captured for future planning] When the user clicks a hime SERP result, auto-translate the destination page after navigation — carry the translate intent through the clickthrough so the landing page is translated without a second manual action.
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.3: In-place image overlay translation (text-on-image, swap) (BACKLOG)

**Goal:** [Captured for future planning] Overlay the translated text directly ON the image, positioned over each source-text region, with a swap toggle (show original ↔ translation in place) — like Google Lens / manga-translation overlays. Architecture note: Vision DOCUMENT_TEXT_DETECTION already returns per-block `boundingPoly` boxes (currently discarded); render absolutely-positioned DOM overlays on top of the `<img>` (no canvas edits → no tainted-canvas issue), mapping natural-pixel boxes to the rendered rect (badge-positioning math) and repositioning on scroll/resize. Hard parts: masking the original text (sampled bg / blur box), fitting translated text to the box (auto font-shrink), translating PER block (pipeline change from the single whole-image call), and vertical/CJK reading order. Medium effort; likely its own v1.4 phase.
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.5: Basic page-text auto-translate (default-on, page-language gated) (BACKLOG)

**Goal:** [Captured for future planning] A basic whole-page TEXT translation feature (distinct from image OCR), ON by default, that auto-translates a page's visible text when the page is in a foreign source language relative to the user's reading/target language. Mirror the D-05 page-language gate already built for progressive image mode (`shouldGateByLanguage` in progressive-guard.ts: compare `<html lang>` vs target, gate-ON when same/missing) so it spends nothing on pages already in the target language. Open questions: in-place DOM text replacement vs side-panel output; per-block vs whole-page translation call (cost); handling dynamic/SPA content (MutationObserver); show-original toggle; opt-out per-site. User report (phase 14 verify): "we need a basic page text translate feature thats on by default when visiting a page in the target language." Likely its own v1.4+ phase. Medium-large effort.
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.4: Per-image numbering in badge + sidebar (BACKLOG)

**Goal:** [Captured for future planning] Give each progressively/right-click translated image a stable sequential number shown in BOTH the on-image badge (e.g. `[hime 3]`) and its side-panel entry, so the user can correlate a badge with its panel entry at a glance. Badge-click → open panel scrolled to that entry is ALREADY shipped (phase 13 `openImagePanel`); this adds the visible numbering tied to the dedup key/translation order. Small UX enhancement — natural candidate to fold into Phase 14 (UX hardening) rather than a standalone phase.
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)
