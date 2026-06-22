---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: In-Place Page Translation — Phases 15-16 (in progress; started 2026-06-22)
status: executing
last_updated: "2026-06-22T15:34:17.218Z"
last_activity: 2026-06-22 -- Phase 15 execution started
progress:
  total_phases: 10
  completed_phases: 0
  total_plans: 4
  completed_plans: 1
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-21)

**Core value:** Type English, get natural Japanese inline — without breaking your keyboard flow.
**Last shipped:** v1.3 Image Translation (phases 12-14, 2026-06-21)
**Current focus:** Phase 15 — in-place-page-text-translation-triggers

## Current Position

Phase: 15 (in-place-page-text-translation-triggers) — EXECUTING
Plan: 2 of 4
Status: Ready to execute
Last activity: 2026-06-22 -- Completed 15-01-PLAN.md (pure page-walk core); next 15-02

## Accumulated Context

### Decisions

v1.4 scope guardrails (user-locked 2026-06-21):

- REPLACE-in-place page text (not bilingual); a toggle restores the original.
- STATIC snapshot only — no MutationObserver / SPA live-translation this milestone.
- SIMPLE image overlay — no inpainting, no manga-grade typesetting, NO new OSS dependency. Semi-transparent background box for legibility (W3C/WCAG 4.5:1). Text fits its box via shrink-to-fit on `CanvasRenderingContext2D.measureText`.
- Trigger: manual (toolbar/right-click "Translate page") + auto-offer when `<html lang>` ≠ target, reusing the v1.3 `shouldGateByLanguage` (progressive-guard.ts) gate.
- Reuse v1.3 Vision `DOCUMENT_TEXT_DETECTION` per-block `boundingPoly` geometry (currently discarded) and the existing BYOK translate pipeline; image overlay is a per-block translation change from v1.3's single whole-image call.
- Curated research: `.planning/research/SOURCES.md` (Firefox/Bergamot TreeWalker replace + HTML tag-alignment, translate-tools/domtranslator reference impl, W3C captions legibility).

Carried forward (project invariants):

- All network + BYOK keys stay in the background service worker — never on the page.
- `document.execCommand('insertText')` accepted as deprecated but undo-safe for field replacement; page-text in-place replace is a separate (non-field) path — choose a DOM-safe swap that preserves layout.
- `content.ts` is a classic script — pure logic lives in node-testable modules (e.g. `image-observer.ts`, `progressive-guard.ts`); wiring inlined.
- [Phase ?]: 15-01: new translatePageBatch message (plain-string Record) chosen over reusing translateBatch {t,d}

### Pending Todos

None yet.

### Blockers/Concerns

- Carried from v1.3 backlog (now in-scope): masking original text under image overlays (sampled-bg / semi-transparent box), fitting translated text to a fixed box (auto font-shrink), per-block translation pipeline change, vertical/CJK reading order.
- In-place DOM text replace must skip script/style/code/contenteditable subtrees (TreeWalker FILTER_REJECT) and not break page interactivity.
- Cross-origin / tainted-canvas image bytes (carried): resolve in the worker under host_permissions, `captureVisibleTab` crop fallback.

## Operator Next Steps

- Roadmap complete: Phase 15 (PAGE+TRIG, 8 reqs) → Phase 16 (OVL, 5 reqs).
- Next: `/gsd-plan-phase 15` to decompose the in-place page-text + trigger slice.

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 15 P01 | 18 | 3 tasks | 3 files |
