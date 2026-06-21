# Phase 12: Image OCR Pipeline + Right-Click + Side Panel - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-20
**Phase:** 12-image-ocr-pipeline-right-click-side-panel
**Areas discussed:** Panel result model, Result display layout, Target language source (Low-confidence UX deferred to Claude's discretion)

---

## Panel result model

| Option | Description | Selected |
|--------|-------------|----------|
| Accumulate a list | Each translated image prepends to a scrollable session list (newest on top); matches Phase 13 progressive; reuses SERP-list render | ✓ |
| Replace — latest only | Panel shows just the most recent result; simpler but P13 changes it anyway | |
| Replace, with back nav | Show latest + small pageable history; more UI | |

**User's choice:** Accumulate a list (newest prepended).
**Notes:** Chosen because progressive mode (Phase 13) needs a multi-image list anyway, and it reuses the existing SERP list-render shape.

---

## Result display layout

| Option | Description | Selected |
|--------|-------------|----------|
| Stacked, breaks preserved | Thumbnail → translation → original below; preserve OCR line/paragraph breaks | ✓ |
| Stacked, flattened | Same stack but collapse OCR to one paragraph each | |
| Side-by-side columns | Original \| translation two columns; cramped in side panel | |

**User's choice:** Stacked, OCR breaks preserved.
**Notes:** Reading-focused; translation above original; works for long multi-line text in a narrow panel.

---

## Target language source

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse global setting | Translate into hime's existing target-language setting; zero new UI | ✓ |
| Own target picker in panel | Independent language dropdown in the panel; more flexible, more UI/state | |

**User's choice:** Reuse the global target-language setting.
**Notes:** Direction is detected-source → global target (inverse of Compose); panel must show "Detected: X → Y" to disambiguate.

---

## Claude's Discretion

- **Low-confidence UX** (user did not select to discuss): defaulted to show result + amber "low confidence" badge below a Vision-confidence threshold; suppress to the explicit "no text found" state only on genuinely empty OCR. Threshold value left to planner/researcher; revisit in Phase 14.
- Context-menu surface limited to `<img>`; `captureVisibleTab` is an internal fetch fallback, not a separate menu item.
- Host-permission breadth (`<all_urls>` upfront vs `optional_host_permissions` runtime grant) flagged for the planner.

## Deferred Ideas

- Re-translate existing entry (IMG-F1), multi-provider dropdown (VIS-F1), per-site scoping (PROG-F1), multi-image batching (IMG-F2) — all Future.
- Copy buttons (IMG-06) and settings key field + test (VIS-02) — Phase 14.
