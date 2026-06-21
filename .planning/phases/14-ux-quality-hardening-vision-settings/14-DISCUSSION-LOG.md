# Phase 14 Discussion Log

**Date:** 2026-06-21
**Mode:** discuss (default)

Human-reference record of the discuss-phase session. Not consumed by downstream agents
(researcher/planner/executor read CONTEXT.md).

## Areas selected
All four offered gray areas + one user-added area:
1. Copy affordance (IMG-06)
2. No-text vs failure honesty (SC#3)
3. CJK/vertical + oversized expectations (SC#4)
4. Per-image numbering (999.4)
5. **(user-added)** Page-language gate on progressive

## Decisions

### Copy affordance (IMG-06)
- Options: two icon buttons (translated+original) / **one Copy = translated, original behind toggle** / combined labeled copy.
- Selected: **one Copy = translated only; original behind "show original" toggle** → D-01.

### No-text vs failure honesty (SC#3)
- Options: **visually distinct states** / same style, different text.
- Selected: **visually distinct** — neutral no-text card vs distinct error card naming the reason → D-02.

### CJK/vertical + oversized expectations (SC#4)
- Options: disclaimer + per-result note / **per-result note only** / static disclaimer only.
- Selected: **per-result note only** (no standing disclaimer); oversized still gets a clear graceful-fail message → D-03 / D-03a.

### Per-image numbering (999.4)
- Options: **fold in by dedup key** / fold in by translation order / defer.
- Selected: **fold in, keyed to dedup key**, `[hime N]` in badge + entry (stable across re-scroll) → D-04.

### Page-language gate on progressive (user-added)
- Intent: options were **skip pages in my target language** / only a source language I pick / clarify.
  - Selected: **skip pages already in target language** — progressive fires only when page language ≠ target → D-05.
- Detection: **`<html lang>`, default OFF if unknown** / lang default ON / sample+detect.
  - Selected: **`<html lang>`, default OFF when unknown** → D-05a.
- Manual scope: **progressive only** / apply to both.
  - Selected: **progressive only** — right-click always works → D-05b.

## Deferred / out of scope
- 999.3 in-place overlay (own v1.4 phase).
- 999.1 / 999.2 SERP backlog (unrelated).
- PROG-F1 per-site allowlist (still deferred).

## Notes
- VIS-02 (key field + connection test) already landed in prior phases — phase 14 work on it is verification only (confirm test exercises Vision + Translation through the worker).
