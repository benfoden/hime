# Phase 13 Discussion Log

**Date:** 2026-06-21
**Mode:** discuss (default), batched

Human reference only — not consumed by downstream agents.

## Areas discussed (all 4 selected)

### Trigger aggressiveness
- Options: Balanced (200px / 400ms) · Eager (0px / 150ms) · Lazy (in-view / 800ms)
- **Chosen:** Balanced — rootMargin ~200px, 400ms dwell → D-01

### Cost-guard defaults
- Options: Conservative (2/20/150px) · Tight (1/10/200px) · Generous (4/50/100px)
- **Chosen:** 2 concurrent / **10** per-page / 150px (user lowered budget 20→10) → D-02

### Privacy warning + opt-in
- Options: one-time modal + persistent ON indicator · modal only · every-session banner
- **Chosen:** one-time modal (names Vision + LLM provider) + persistent ON indicator → D-03
- Driven by Phase 12 OCR/LLM steer: warning must disclose the LLM provider too.

### Badge + activity UI
- Options: on-image badge + activity count · badge only · panel-only
- **Chosen:** on-image badge **clickable to open the panel at that image** + activity count → D-04
- Insight: a badge click is a user gesture, so it may call `sidePanel.open()` (PROG-06 only
  forbids *auto*-open from the observer).

## Carried forward (not re-asked)
- Phase 12 D-01 prepend list panel model, D-03 global target language, OCR→LLM split, session-only privacy.

## Deferred
- PROG-F1 per-site scoping; IMG-F1 on-demand re-translate.
