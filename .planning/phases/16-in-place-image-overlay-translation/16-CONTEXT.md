# Phase 16: In-Place Image Overlay Translation - Context

**Gathered:** 2026-06-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Render translated text as **DOM overlay boxes** positioned directly over each image's
source-text region on the current page — reusing the Vision `DOCUMENT_TEXT_DETECTION`
`boundingPoly` geometry that the v1.3 pipeline currently extracts but **discards** — without
ever editing image pixels (no inpainting). Each overlaid image can be swapped back to its
original in place; overlays stay anchored to their source regions as the page scrolls/resizes;
overlay text shrink-to-fits its box.

Delivers OVL-01..05. This is the **final phase of milestone v1.4** (In-Place Page Translation).

**In scope:** per-block overlay rendering from reused `boundingPoly`, per-block BYOK
translation, fixed legible overlay box, per-image swap, scroll/resize re-anchoring, shrink-to-fit.

**Out of scope (locked by OVL-02):** inpainting / pixel editing / background masking — the box
is semi-transparent over untouched pixels. Live SPA mutation tracking (static snapshot at
trigger, mirroring phase-15 PAGE scope). New Vision provider/key work (reuses v1.3 Phase 14).
</domain>

<decisions>
## Implementation Decisions

### D-01 · Trigger & scope — fold into "Translate page", opt-in image checkbox, default OFF
- Image overlay is **folded into the existing phase-15 "Translate page" action** (popup button
  + right-click "Translate page"): one click translates page text **and** overlays images —
  **only when an opt-in checkbox is enabled**.
- The checkbox ("Include images" / overlay images on translate) sits with the **popup**
  "Translate page" control (`popup.html`/`popup.ts`), persisted in `chrome.storage`. **Default
  OFF** — consistent with phase-13's default-off cost philosophy for paid BYOK Vision.
- When enabled, the in-view page images are OCR'd + overlaid as part of the page-translate run.
  Reuse phase-13's existing cost-control guards where they apply (content-hash dedup, budget/
  concurrency, min-size) so the image pass is bounded.
- The **global page toggle governs overlays too** (one click on/off for the whole page);
  per-image swap is D-02.
- Rejected: separate standalone "translate images" action; auto progressive-viewport overlay
  (kept as the page-translate-scoped snapshot instead, simpler + predictable spend).

### D-02 · Per-image swap — small per-image toggle button (OVL-03)
- Each overlaid image carries a **small corner toggle button** to flip THAT image between
  translation and original in place — the per-image granularity OVL-03 requires.
- Visual kin of the phase-15 in-page floating pill, but scoped per-image (anchored to the
  image, not the page corner). The page-level global toggle (D-01) flips all at once; the
  per-image button is the individual override.

### D-03 · Overlay box style — fixed legible palette: black box, white text (OVL-02)
- **Fixed** palette for every overlay (no per-image sampling): **black semi-transparent
  background box, white text**, subtle radius. Predictable, guaranteed ≥4.5:1 contrast (WCAG
  AA, OVL-02), simplest to implement.
- Rejected: adaptive/sampled per-block light-vs-dark styling — unnecessary complexity for v1.4.

### D-04 · Side-panel relationship — in-place overlay becomes primary
- In-place overlay is the **primary** rendering for page-context image translation.
- The existing v1.3 **side-panel list stays** for the explicit per-image deep-dive / copy use
  case (right-click "Translate image" → side panel). Not removed — coexists, but in-place is
  the default path when translating the page with images enabled.

### Claude's Discretion (technical — researcher/planner resolve)
- **Block granularity:** block-level vs paragraph-level `boundingPoly` for overlay boxes
  (`fullTextAnnotation.pages → blocks → paragraphs`). Pick for best fit-vs-count tradeoff.
- **Shrink-to-fit overflow (OVL-05):** `measureText`-driven font shrink down to a sensible
  floor, then clamp/ellipsis rather than overflow or break layout. Default: shrink → clamp.
- **CJK / vertical reading order** within a box (flagged in the 999.3 seed) — research item.
- **Re-anchoring mechanism (OVL-04):** absolutely-positioned DOM overlays mapping natural-pixel
  boxes to the image's current rendered rect (`getBoundingClientRect` / `naturalWidth`),
  repositioned on scroll/resize (rAF-debounced). Implementation detail.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 16: In-Place Image Overlay Translation" — goal, depends-on,
  5 success criteria.
- `.planning/REQUIREMENTS.md` — OVL-01..05 (the locked requirements for this phase).
- `.planning/ROADMAP.md` §"Phase 999.3" — the backlog seed that spawned this phase; carries the
  architecture note (DOM overlays on `<img>`, boundingPoly reuse, natural→rendered rect mapping)
  and names the hard parts (font-fit, per-block translate, CJK order).

### Upstream pipeline this phase reuses/extends
- `src/providers/vision-google.ts` — `ocr()` runs `DOCUMENT_TEXT_DETECTION` and currently
  returns only flattened `originalText`; phase 16 must extend it to surface per-block text +
  `boundingPoly` geometry (presently discarded).
- `src/image-resolve.ts` — `fullTextAnnotation` parsing (pages→blocks→paragraphs→words),
  `meanWordConfidence`, pixel cap / downscale; the geometry source to extract from.
- `src/background.ts` — worker image-byte fetch + `captureVisibleTab` fallback, context menus,
  per-image state contract, BYOK translate routing (Phase 12/14).
- `src/content.ts` — phase-15 page-translate snapshot/dispatch + in-page floating pill toggle +
  per-origin session state; the host the overlay layer plugs into.
- `src/popup.html` / `src/popup.ts` — phase-15 "Translate page" control; home of the new
  D-01 "Include images" opt-in checkbox.
- `src/sidepanel.ts` / `src/panel-render.ts` — existing v1.3 side-panel image-translation list
  (D-04: stays for per-image deep-dive).
- `src/types.ts` — `VisionProvider`, `OcrOnlyResult`, `ImageState`, message contracts to extend.
- `src/progressive-guard.ts` — phase-13 cost-control guards (dedup/budget/concurrency/min-size)
  to reuse for the bounded image pass.

### Phase-15 carry-forward (patterns, not re-decided)
- `.planning/phases/15-in-place-page-text-translation-triggers/15-CONTEXT.md` — D-01 floating
  pill + popup/right-click triggers; D-04 partial-failure (apply successes + error toast + red
  badge + retry-failed) — the failure-handling pattern the image pass should mirror.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Vision OCR pipeline** (`vision-google.ts` + `image-resolve.ts`): OCR, confidence, pixel cap,
  `fullTextAnnotation` walk — extend (don't rebuild) to carry `boundingPoly` per block.
- **BYOK translate routing** (`background.ts`): per-image image-byte fetch + `captureVisibleTab`
  fallback + LLM translate — feed per-block OCR text through it.
- **Phase-15 page-translate orchestration** (`content.ts`): static snapshot at trigger, chunked
  dispatch, in-page pill toggle, per-origin session mirror — the overlay run hangs off this.
- **Phase-13 cost guards** (`progressive-guard.ts`): content-hash dedup, budget/concurrency,
  min-size — bound the image pass.
- **Phase-15 partial-failure UX**: error toast + red badge + retry-failed — mirror for images.

### Established Patterns
- **No inpainting** — overlays are DOM siblings over untouched pixels (no tainted-canvas risk).
- **Default-OFF for paid Vision** (phase 13) → D-01 checkbox default OFF.
- **Static snapshot at trigger** (phase 15) — overlays computed at translate time, not live.
- **In-page pill toggle** (phase 15) → per-image toggle is its scoped sibling (D-02).

### Integration Points
- `vision-google.ts ocr()` return shape → new per-block `{text, boundingPoly}[]` field.
- `popup.ts` → new "Include images" checkbox wired to `chrome.storage` + the translate dispatch.
- `content.ts` → new overlay render/anchor/toggle layer keyed per image, off the page-translate run.
- `background.ts` → page-translate path branches to OCR+translate images when the checkbox is on.
</code_context>

<specifics>
## Specific Ideas

- "Black background, white text" — explicit user call for the overlay box palette (D-03).
- "One click to translate plus a toggle" — the page-translate action does it all in one click
  when images are opted in; toggles (global + per-image) flip without re-running (D-01/D-02).
- Reference feel: Google Lens / manga-translation overlays (from the 999.3 seed) — text sitting
  legibly over its source region, swappable.
</specifics>

<deferred>
## Deferred Ideas

- **Adaptive/sampled overlay styling** (light-vs-dark per block) — rejected for v1.4; fixed
  palette ships. Revisit only if legibility complaints arise.
- **Auto progressive-viewport image overlay** (overlay images as they scroll into view) —
  considered for the trigger; deferred in favor of the page-translate-scoped snapshot. Could be
  a future enhancement.
- **999.4 per-image numbering** (`[hime N]` style numbering for image overlays) — parked
  post-v1.4 (open thread carried in helm state).
- Live SPA mutation tracking for overlays — out of scope (static snapshot, mirrors PAGE scope).

</deferred>

---

*Phase: 16-in-place-image-overlay-translation*
*Context gathered: 2026-06-22*
