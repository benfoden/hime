# Phase 9: SERP Rendering - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03
**Phase:** 9-SERP Rendering
**Areas discussed:** Favicon source, State-exercise harness, Render architecture, Design fidelity & styling

> User answered the gray-area selection with: *"accept all recommendations and proceed. go fast, keep it minimal."* All four areas locked to their recommended (minimal, privacy-first, framework-free) options.

---

## Favicon source

| Option | Description | Selected |
|--------|-------------|----------|
| External favicon service | Google s2 / DuckDuckGo icons — one external request per result, leaks every hostname to a 3rd party | |
| Brave-provided + letter-tile fallback | Use `faviconUrl` if present, else generic colored letter chip; no external request, no privacy leak | ✓ |

**User's choice:** Recommended default (D-01).
**Notes:** Privacy-first chosen automatically — a translation tool shouldn't leak browsing hostnames.

---

## State-exercise harness

| Option | Description | Selected |
|--------|-------------|----------|
| `?state=` URL param + mock module | Param selects a fixed mock; default populated; mock includes XSS payload row | ✓ |
| Static gallery page | One page showing all states stacked | |

**User's choice:** Recommended default (D-02).
**Notes:** Param-driven mock is importable by the node test harness; replaced by live wiring in Phase 11.

---

## Render architecture

| Option | Description | Selected |
|--------|-------------|----------|
| `render(state)` dispatcher + discriminated union, createElement/textContent | Single render path, XSS-safe, verbatim href | ✓ |
| `<template>` clone | Template cloning + textContent fills | |

**User's choice:** Recommended default (D-03).
**Notes:** Vanilla TS, no framework; never innerHTML for Brave-derived fields.

---

## Design fidelity & styling

| Option | Description | Selected |
|--------|-------------|----------|
| Google-layout + hime aesthetic, dedicated search.css reusing options.css tokens | Classic SERP structure, own look, light theme | ✓ |
| Pixel-clone of Google | Literal Google styling | |

**User's choice:** Recommended default (D-04).
**Notes:** Seed only — mockup-gallery pass before plan-phase settles exact visual direction.

## Claude's Discretion

- Mock-data location (inline vs separate `search-mock.ts` module — lean separate for test reuse).
- Skeleton-row count / shimmer, error-message exact wording (distinct per SERP-05).
- `web_accessible_resource` registration timing (now vs Phase 11).

## Deferred Ideas

- Live query box / query translation / disclosure line / popup entry — Phase 11.
- Result title/snippet translation overlay — Phase 10.
- Dark theme / theme toggle — out of v1.2 scope.
