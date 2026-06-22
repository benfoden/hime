# Requirements — v1.4 In-Place Page Translation

**Milestone goal:** Translate the current page in place — swap the page's visible text with its translation (layout-preserving) and overlay translated text directly on images — so a foreign-language page becomes readable without leaving it.

**Scope guardrails (user-locked 2026-06-21):** REPLACE-in-place (not bilingual) · STATIC snapshot only (no MutationObserver/SPA live-translate) · SIMPLE overlay (no inpainting, no manga-grade typesetting, NO new OSS dependency) · reuse v1.3 Vision `boundingPoly` + BYOK translate pipeline · trigger = manual + auto-offer via the existing `<html lang>` gate.

Promoted from backlog: 999.5 (page-text auto-translate) → PAGE+TRIG; 999.3 (in-place image overlay) → OVL.

## v1.4 Requirements

### PAGE — In-place page-text translation

- [x] **PAGE-01**: User can translate the current page's visible text in place, with the translation replacing the original text while preserving page layout.
- [x] **PAGE-02**: Page-text translation skips non-translatable nodes (script, style, code, `contenteditable`, form inputs) and leaves page interactivity intact.
- [x] **PAGE-03**: User can toggle a translated page back to its original text — and re-apply the translation — without reloading.
- [x] **PAGE-04**: Page text is translated through the existing background BYOK LLM pipeline, batched to minimize API calls and cost.
- [x] **PAGE-05**: Translation operates on a static snapshot of the page at trigger time (content added to the DOM afterward is not auto-translated).

### OVL — In-place image overlay translation

- [ ] **OVL-01**: User can overlay translated text directly on images in the current page, each translated block positioned over its source-text region using Vision `DOCUMENT_TEXT_DETECTION` `boundingPoly` geometry.
- [ ] **OVL-02**: Each overlay renders translated text on a simple semi-transparent background box meeting legibility contrast (WCAG AA 4.5:1); no inpainting of the underlying image.
- [ ] **OVL-03**: User can swap any image overlay between the translation and the original text, in place.
- [ ] **OVL-04**: Overlays stay correctly positioned on scroll and window resize (natural-pixel box mapped to the rendered image rect).
- [ ] **OVL-05**: Overlay text auto-fits its box via shrink-to-fit (`CanvasRenderingContext2D.measureText`), with graceful handling when a translation is too long for its region.

### TRIG — Trigger & language gating

- [x] **TRIG-01**: User can manually trigger current-page translation via a toolbar action and a right-click "Translate page" menu item.
- [x] **TRIG-02**: hime auto-offers page translation when the page source language (`<html lang>`) differs from the user's target language, reusing the v1.3 `shouldGateByLanguage` gate; same-language pages incur no cost.
- [x] **TRIG-03**: Auto-offer is unobtrusive and dismissible; the manual trigger is always available regardless of detected language.

## Future Requirements (deferred)

- Bilingual display mode (show original + translation together) — v1.4 is replace-in-place only.
- Dynamic / SPA live translation (MutationObserver) — v1.4 is static-snapshot only.
- Per-image numbering in badge + sidebar (backlog 999.4).
- Per-site opt-out / auto-translate allowlist.
- Manga-grade overlay (inpainting, per-block typesetting, vertical/CJK reading order) — only if simple overlay proves insufficient.

## Out of Scope (v1.4)

- New OSS dependency for translation or overlay — own code only (TreeWalker + canvas measure).
- Contextual writing/translation hints — deferred to a later milestone (was the original v1.4).
- Non-Chrome browsers; backend/proxy — project-wide out of scope.

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PAGE-01 | Phase 15 | Complete |
| PAGE-02 | Phase 15 | Complete |
| PAGE-03 | Phase 15 | Complete |
| PAGE-04 | Phase 15 | Complete |
| PAGE-05 | Phase 15 | Complete |
| TRIG-01 | Phase 15 | Complete |
| TRIG-02 | Phase 15 | Complete |
| TRIG-03 | Phase 15 | Complete |
| OVL-01 | Phase 16 | pending |
| OVL-02 | Phase 16 | pending |
| OVL-03 | Phase 16 | pending |
| OVL-04 | Phase 16 | pending |
| OVL-05 | Phase 16 | pending |

**Coverage:** 13/13 v1.4 requirements mapped — no orphans, no duplicates.

- Phase 15 (8): PAGE-01..05, TRIG-01..03
- Phase 16 (5): OVL-01..05
