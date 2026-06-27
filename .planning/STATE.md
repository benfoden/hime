---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: In-Place Page Translation — Phases 15-16 (shipped 2026-06-27)
status: Awaiting next milestone
last_updated: "2026-06-27T02:46:01.685Z"
last_activity: 2026-06-27 — Milestone v1.4 completed and archived
progress:
  total_phases: 10
  completed_phases: 2
  total_plans: 9
  completed_plans: 9
  percent: 20
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-27)

**Core value:** Type English, get natural Japanese inline — without breaking your keyboard flow.
**Last shipped:** v1.4 In-Place Page Translation (phases 15-16, 2026-06-27)
**Current focus:** Planning next milestone (v1.5 Contextual Hints candidate, or 999.5 default-ON page auto-translate)

## Deferred Items

Items acknowledged and deferred at v1.4 milestone close on 2026-06-27:

| Category | Item | Status |
|----------|------|--------|
| context | Phase 15 15-CONTEXT.md open questions (TreeWalker filter/chunking, restore mechanism, failed-node tracking) | resolved in implementation; markers stale |
| deferred | Below-fold image overlay on scroll (initial-viewport only) | backlog |
| deferred | Exotic-layout image positioning (transformed/scaled ancestor or srcset) | investigate if recurs |
| deferred | Unified read-vs-compose direction model (replaces popup-swap reliance) | backlog |
| backlog | 999.5 default-ON page-text auto-translate (machinery shipped; needs trigger policy) | backlog |
| backlog | 999.4 per-image numbering in badge + sidebar | backlog |

## Current Position

Phase: Milestone v1.4 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-06-27 — Milestone v1.4 completed and archived

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
- 15-03: cursor-driven promise pool over the SYNCHRONOUS concurrency gate — dispatch loop owns scheduling, re-entered only from a reply's .finally; a false tryAcquire parks (never drops) a chunk, no busy-spin
- 15-03: in-place replace is nodeValue-only (zero innerHTML writes); once-only original capture in a WeakMap, toggle iterates a strong pageTranslatedNodes array (WeakMap not enumerable)
- 15-03: content.ts mirrors TranslationConfig as a local PageTranslationConfig type (classic-script no-imports law), same field shape as types.ts
- 15-04: auto-offer banner is a SEPARATE document_end boot block reusing progShouldGateByLanguage — gates BEFORE any banner creation so same-language/unknown pages incur no spend (TRIG-02); independent of progressiveEnabled (manual page-text offer regardless of progressive-image mode)
- 15-04: per-origin banner dismissal stored in chrome.storage.session (sticky for the session, A7 origin granularity); STORAGE_BANNER_DISMISSED mirrored as a local const (classic-script no-imports law)
- 15-04: partial-failure shows ONE singleton-by-id toast + red badge AFTER the batch barrier settles (not per-chunk); retry re-batches ONLY [...pageFailedNodes] (consumed from Plan 03's shared Set, cleared on retry) — never the whole page (T-15-14)
- [Phase ?]: merge-write-preserving-other-fields: popup change handler reads-then-spreads himeSettings (T-16-07)
- [Phase ?]: teardown on reset not on toggle

### Pending Todos

None yet.

### Blockers/Concerns

- Carried from v1.3 backlog (now in-scope): masking original text under image overlays (sampled-bg / semi-transparent box), fitting translated text to a fixed box (auto font-shrink), per-block translation pipeline change, vertical/CJK reading order.
- In-place DOM text replace must skip script/style/code/contenteditable subtrees (TreeWalker FILTER_REJECT) and not break page interactivity.
- Cross-origin / tainted-canvas image bytes (carried): resolve in the worker under host_permissions, `captureVisibleTab` crop fallback.

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 15 P01 | 18 | 3 tasks | 3 files |
| Phase 15 P03 | ~20min | 2 code tasks (Task 3 checkpoint deferred) | 1 file (src/content.ts) |
| Phase 15 P04 | ~2min | 2 code tasks (Task 3 checkpoint deferred) | 1 file (src/content.ts) |
| Phase 15 P02 | ~15min | 3 code + 1 checkpoint tasks | 3 files |
| Phase 16-in-place-image-overlay-translation P02 | 35 min | 3 tasks | 3 files |
| Phase 16 P03 | 8min | 1 tasks | 2 files |
| Phase 16-in-place-image-overlay-translation P04 | 25 | 3 tasks | 1 files |
