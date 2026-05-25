---
phase: 02-prompt-quality-error-hardening
plan: "03"
subsystem: background-content
tags: [error-hardening, logging, badge, snapshot-restore, ux]
dependency_graph:
  requires: [02-01, 02-02]
  provides: [structured-failure-logging, kind-aware-badge, snapshot-restore-on-failure]
  affects: [src/background.ts, src/content.ts]
tech_stack:
  added: []
  patterns:
    - "Snapshot-before-replace / restore-on-failure in content script"
    - "Error kind propagation via chrome.runtime message response"
    - "Kind-aware badge mapping (auth->KEY, rate_limit->RATE, network->NET, unknown->ERR)"
    - "Structured debug/error logging in service worker"
key_files:
  created: []
  modified:
    - src/background.ts
    - src/content.ts
decisions:
  - "Error badge persists until next successful translation (not auto-cleared on timer)"
  - "API key never logged — only provider/model/status/kind/endpoint/message"
  - "snapshot in YOLO = const snapshot = text (field already read before replace)"
  - "convertComposeMode resets composeState in catch so compose mode is fully exited on failure"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-25T03:29:56Z"
  tasks_completed: 2
  tasks_total: 3
  files_modified: 2
---

# Phase 2 Plan 03: Snapshot/Restore + Kind-Aware Badge + Structured Logging Summary

Snapshot-before-replace on field content with restore-on-failure in both compose and YOLO, kind-aware badge distinguishing KEY/RATE/NET/ERR, and structured background logging per LOG-01/02.

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Structured logging + propagate error kind through background | 730a1f3 | Done |
| 2 | Snapshot-before-replace + restore-on-failure + kind-aware badge in content script | 05ad94a | Done |
| 3 | Live validation of failure recovery and distinct error surfaces | — | Checkpoint (pending human verify) |

## What Was Built

### Task 1 — `src/background.ts`

- Added `console.debug('[hime] translate request', { provider, model, length })` at the start of every `case 'translate':` handler (LOG-01). Length only — full text and API key are never logged.
- Wrapped the `translateText` call in its own try/catch inside the translate case. On failure: reads `err.kind` and `err.status` off the thrown error (set by Plan 02 provider changes), constructs the endpoint URL based on provider, and emits `console.error('[hime] translate failed', { provider, model, status, kind, endpoint, message })` (LOG-02).
- Returns `{ error: message, kind }` in the failure sendResponse so the content script receives the error kind.
- Outer catch for other message types is unchanged.

### Task 2 — `src/content.ts`

- Added `badgeForKind(kind?)` helper: maps `'auth'` → `KEY`/red, `'rate_limit'` → `RATE`/orange, `'network'` → `NET`/red, default → `ERR`/red.
- Updated `translateText` helper: on the `response?.error` branch, attaches `(e as any).kind = response.kind ?? 'unknown'` to the rejected Error before rejecting, so callers have access to kind.
- `convertComposeMode`: added `const snapshot = getElementText(element)` immediately before `setElementText(element, newText)`. In the catch block: restores `setElementText(element, snapshot)`, calls `badgeForKind` for the badge, removes compose indicator, resets `composeState`, logs structured error. Removed the `setTimeout(() => setBadge('ON', ...))` — error badge now persists until next success.
- `yoloTranslate`: added `const snapshot = text` (the field content already read into `text` before the try block). In the catch block: restores `setElementText(element, snapshot)`, calls `badgeForKind`, logs structured error. Removed the `setTimeout(() => setBadge(''))` — error badge persists until next success.

## Verification

- `npx tsc --noEmit` exits 0 (TypeScript: No errors found)
- Test suite: 21 pass, 8 fail (pre-existing failures from parallel executor's provider changes; my changes caused 0 regressions — baseline before my changes was 20 pass, 9 fail)
- All acceptance criteria grep checks pass

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced. The failure logging strictly follows the T-02-07 mitigation: only provider/model/status/kind/endpoint/message are logged, API key is never in scope at the logging site.

## Self-Check: PASSED

- `/home/ben/code/hime/src/background.ts` — modified, committed 730a1f3
- `/home/ben/code/hime/src/content.ts` — modified, committed 05ad94a
- Commits verified in git log
