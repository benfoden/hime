---
phase: 13-progressive-viewport-mode-cost-control-privacy-opt-in
plan: 01
subsystem: progressive-guard
tags: [tdd, cost-control, dedup, progressive-mode]
dependency_graph:
  requires: []
  provides: [progressive-guard-core]
  affects: [plan-13-03-content-script, plan-13-04-worker]
tech_stack:
  added: []
  patterns: [pure-module-tested-against-dist, djb2-content-hash, per-key-dwell-debounce]
key_files:
  created:
    - src/progressive-guard.ts
    - src/progressive-mock.ts
    - test/progressive-guard.mjs
  modified: []
decisions:
  - "contentDedupKey uses imgc_ prefix to avoid colliding with background.ts URL-based img_ namespace"
  - "djb2 over byte array mirrors background.ts imageDedupKey algorithm (same collision profile, accepted per T-13-01)"
  - "Dwell scheduler uses per-key timer Map; injected ms parameter enables fast tests without mocking timers"
metrics:
  duration_minutes: 25
  completed: "2026-06-21T15:41:41Z"
  tasks_completed: 2
  files_created: 3
  files_modified: 0
---

# Phase 13 Plan 01: Progressive Guard Core Summary

Pure cost-guard + dedup core in TDD: RED-first test suite, then GREEN implementation of all five guard behaviors (eligibility, budget-counts-starts, concurrency cap, content-hash dedup, dwell debounce).

## What Was Built

`src/progressive-guard.ts` — a pure module (no chrome.*, no document, no DOM) exporting:

| Symbol | Value | Purpose |
|--------|-------|---------|
| `MIN_LONG_EDGE_PX` | 150 | Skip icons/sprites below this px |
| `PER_PAGE_BUDGET` | 10 | Max auto-translated images per page |
| `CONCURRENCY_CAP` | 2 | Max simultaneous in-flight jobs |
| `DWELL_MS` | 400 | Dwell-debounce window (ms) |
| `ROOT_MARGIN_PX` | 200 | IntersectionObserver fire-ahead margin |
| `isEligibleSize(w,h)` | fn | long-edge filter |
| `createBudget(limit?)` | factory | STARTED-job counter |
| `createConcurrencyGate(cap?)` | factory | in-flight slot gate |
| `contentDedupKey(bytes)` | fn | djb2 content-hash, `imgc_` prefix |
| `createDwellScheduler(ms?)` | factory | per-key setTimeout debounce |

`src/progressive-mock.ts` — typed fixtures: eligible/ineligible size pairs, distinct byte buffers (BYTES_A, BYTES_B), and a copy-allocation (BYTES_A_COPY) proving content-hash identity.

`test/progressive-guard.mjs` — 5 node:test cases, one per guard behavior. Uses injected `SMALL_MS=50` (not DWELL_MS=400) for dwell tests.

## TDD Gate Compliance

- RED commit `ad0536c`: `test(13-01): add failing tests for progressive guard + mock fixtures` — suite discovered, 5/5 fail with `Cannot find module dist/progressive-guard.js`.
- GREEN commit `6209022`: `feat(13-01): implement progressive guard` — 5/5 pass.
- No REFACTOR pass needed (implementation was clean).

## Verification

- `node --test test/progressive-guard.mjs`: 5 pass, 0 fail.
- `npm test` (full suite): 164 pass, 0 fail, 2 skipped (opt-in live key tests).
- No regressions introduced.
- `grep -E "import .*chrome|document\.|window\." src/progressive-guard.ts`: no matches (pure module).
- `grep -c ": any" src/progressive-guard.ts`: 0 (strict types).
- All 10 required exports verified present in `dist/progressive-guard.js`.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Flags

None — this plan IS the DoS/cost mitigation surface (T-13-02 `mitigate` disposition). Budget and concurrency behaviors are pinned by tests; a regression that disables a gate fails CI.

## Known Stubs

None.

## Self-Check: PASSED

- `src/progressive-guard.ts` — FOUND
- `src/progressive-mock.ts` — FOUND
- `test/progressive-guard.mjs` — FOUND
- `dist/progressive-guard.js` — FOUND
- Commits `ad0536c` (RED) and `6209022` (GREEN) — FOUND
