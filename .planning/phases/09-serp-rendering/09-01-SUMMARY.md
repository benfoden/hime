---
phase: 09-serp-rendering
plan: "01"
subsystem: serp-rendering
tags: [serp, rendering, xss-safety, dom-agnostic, node-test, linkedom]
dependency_graph:
  requires: [08-04]
  provides: [serp-render-core, mock-fixtures, serp-test-harness]
  affects: [09-02, phase-11]
tech_stack:
  added: [linkedom@^0.18.12 (devDependency)]
  patterns: [discriminated-union-renderer, textContent-only-xss-guard, injectable-document, letter-tile-favicon, tdd-node-test]
key_files:
  created:
    - src/serp-render.ts
    - src/search-mock.ts
    - test/serp.mjs
  modified: []
decisions:
  - "stripToText uses regex tag-removal (Option B) before textContent assignment — cosmetic clarity; XSS guarantee remains in textContent"
  - "SerpStateKey exported from search-mock.ts as re-export from serp-render.ts — importers need only one module"
  - "quota mock message uses lowercase 'search quota exceeded' to satisfy both literal grep and test assertion"
  - "skeletonList emits 5 skeleton rows inside .serp-skeleton-list container"
  - "errorNotice sets data-error-kind attribute for per-kind CSS/test discrimination without a timer"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-03T22:49:01Z"
  tasks_completed: 2
  files_created: 3
---

# Phase 9 Plan 01: SERP Renderer Core + Mock Fixtures + Test Harness Summary

Built the XSS-safe, DOM-agnostic SERP rendering core: `SerpState` discriminated union + `renderSerp(state, doc, mount)` dispatcher in `src/serp-render.ts`, shared mock fixtures for all 7 display states plus the XSS probe in `src/search-mock.ts`, and a `node:test` harness in `test/serp.mjs` that drives the renderer against a linkedom document and asserts SERP-01..05.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 2 | SerpState union + DOM-agnostic renderSerp + helpers | 55c0e55 | src/serp-render.ts |
| 3 | MOCKS + XSS probe + node:test harness | d24dbb5 | src/search-mock.ts, test/serp.mjs |

(Task 1 — linkedom install checkpoint — was completed prior to this execution.)

## Verification Results

```
node --test test/serp.mjs
  ✔ SERP-01a: populated mock renders one .serp-row per result with favicon/host/title/snippet
  ✔ SERP-01b: no-faviconUrl row renders .serp-tile span (not img), first letter uppercased
  ✔ SERP-02: anchor getAttribute("href") equals mock url verbatim (SERP-02)
  ✔ SERP-03a: no <script> node after XSS probe render; payload present as inert text
  ✔ SERP-03b: snippet .children.length === 0 for description with <strong>/<script> tags
  ✔ SERP-04: skeleton state renders ≥1 .serp-skeleton rows, zero .serp-row
  ✔ SERP-05a: empty state renders .serp-empty notice, zero .serp-row
  ✔ SERP-05b: error states render distinct copy; quota matches /quota/i and "search quota exceeded"
  tests 8, pass 8, fail 0

npm test (full suite)
  tests 106, pass 105, skip 1 (live Brave key — no API key set), fail 0
  Phase 8 transport/error tests: all green
```

## What Was Built

### src/serp-render.ts
DOM-agnostic renderer (no global `document`/`window`/`location`). Exports:
- `SerpState` — discriminated union: `loading | populated | empty | error{errorKind, message}`
- `SerpStateKey` — 7 keys for the mock record
- `renderSerp(state, doc, mount)` — calls `mount.replaceChildren()` then switches on `state.kind`

Internal helpers:
- `el(doc, tag, opts)` — creates element, sets className + textContent (never innerHTML)
- `resultRow(doc, r)` — `.serp-row` with head (favicon + hostname), `a.serp-title` (href verbatim), `.serp-snippet` via `stripToText`
- `stripToText(html)` — regex tag-removal for cosmetics; XSS safety is textContent downstream
- `faviconEl(doc, r)` — `img.serp-favicon` if `r.faviconUrl`, else `.serp-favicon.serp-tile` span with `tileColor()` hash-to-HSL (D-01)
- `tileColor(hostname)` — deterministic `hsl(h%360 55% 45%)`, no randomness
- `skeletonList(doc)` — 5 `.serp-skeleton` rows with `.bar` placeholders (SERP-04)
- `emptyNotice(doc)` — `.serp-empty` with "No results found." (SERP-05)
- `errorNotice(doc, state)` — `.serp-error` with `state.message` as textContent + `data-error-kind` attribute; no setTimeout/setInterval (SERP-05)

### src/search-mock.ts
Exports:
- `XSS_PROBE: SearchResult` — `description` contains `<strong>bold</strong> <script>alert(1)</script>`, no `faviconUrl`
- `MOCKS: Record<SerpStateKey, SerpState>` — 7 keys: `populated` (3 results incl. XSS_PROBE + one with faviconUrl + one plain), `skeleton`, `empty`, `auth`, `network`, `quota`, `unknown`
- `DEFAULT_STATE` — alias for `MOCKS.populated`
- `SerpStateKey` — re-exported type

### test/serp.mjs
8 `node:test` assertions, one per SERP validation row. Uses `linkedom.parseHTML` as the Document provider. Imports from `dist/` only. Uses `getAttribute('href')` (not `.href`) for verbatim URL assertion.

## Deviations from Plan

None — plan executed exactly as written. The quota message was written with lowercase "search quota exceeded" to satisfy both the literal grep acceptance criterion and the test's `.toLowerCase().includes()` check.

## Known Stubs

None. All 7 mock states are fully populated with real-looking data. The mock module is intentionally a fixed fixture — Phase 11 replaces the mock driver with the live worker response behind the same `renderSerp` seam.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundary crossings beyond those in the plan's threat model. `src/serp-render.ts` is DOM-agnostic and has no side effects. `src/search-mock.ts` is a static data module. `test/serp.mjs` is test-only, never shipped.

## Self-Check: PASSED

- src/serp-render.ts: FOUND
- src/search-mock.ts: FOUND
- test/serp.mjs: FOUND
- dist/serp-render.js: FOUND (after build)
- dist/search-mock.js: FOUND (after build)
- Commit 55c0e55: FOUND
- Commit d24dbb5: FOUND
