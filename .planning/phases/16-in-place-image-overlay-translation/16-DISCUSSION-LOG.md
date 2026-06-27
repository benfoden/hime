# Phase 16: In-Place Image Overlay Translation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-22
**Phase:** 16-in-place-image-overlay-translation
**Areas discussed:** Trigger & scope, Swap control, Box style, Side-panel relationship

---

## Trigger & scope

| Option | Description | Selected |
|--------|-------------|----------|
| Fold into "Translate page" | Overlays fire with page-text translate; one action does both | ✓ (with opt-in checkbox) |
| Separate explicit action | Distinct "Translate images on page" trigger | |
| Per-image right-click (reuse ph12) | Extend per-image menu to render in-place | |
| Progressive viewport (reuse ph13) | Auto-overlay images on scroll-into-view, guarded | |

**User's choice:** "fold into translate page with an opt-in checkbox to have it on. one click to translate plus a toggle"
**Notes:** Image overlay gated by an opt-in checkbox (default OFF for paid Vision cost), folded into the single "Translate page" click. Global page toggle governs overlays too.

---

## Swap control

| Option | Description | Selected |
|--------|-------------|----------|
| Click overlay to flip | Clicking the box flips that image | |
| Per-image toggle button | Small corner toggle on each overlaid image | ✓ |
| Global pill + click | Phase-15 pill flips all + click for per-image override | |

**User's choice:** Per-image toggle button
**Notes:** Visual kin of phase-15 pill, scoped per-image. Satisfies OVL-03 individual granularity.

---

## Box style

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed legible palette | One consistent style for all overlays | ✓ (black box, white text) |
| Adaptive to image | Sample local region for light/dark per block | |

**User's choice:** "black background, white text please, fixed legible palette"
**Notes:** Predictable ≥4.5:1 contrast (WCAG AA, OVL-02); simplest. No per-image sampling.

---

## Side-panel relationship

| Option | Description | Selected |
|--------|-------------|----------|
| Coexist (both available) | Keep side panel as-is, overlay is additional | |
| In-place becomes primary | Overlay default; side panel for per-image deep-dive/copy | ✓ |
| Let me decide later | Defer to planning | |

**User's choice:** In-place becomes primary
**Notes:** Side panel stays for explicit per-image deep-dive / copy; in-place is the default page path.

---

## Claude's Discretion

- Block vs paragraph `boundingPoly` granularity.
- Shrink-to-fit overflow handling (OVL-05): shrink to floor → clamp/ellipsis.
- CJK / vertical reading order within a box.
- Re-anchoring mechanism (OVL-04): DOM overlays mapping natural-pixel → rendered rect, rAF-debounced on scroll/resize.

## Deferred Ideas

- Adaptive/sampled overlay styling — rejected for v1.4.
- Auto progressive-viewport image overlay — deferred in favor of page-translate-scoped snapshot.
- 999.4 per-image numbering — parked post-v1.4.
- Live SPA mutation tracking for overlays — out of scope (static snapshot).
