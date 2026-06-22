---
phase: 14-ux-quality-hardening-vision-settings
plan: "02"
subsystem: progressive-mode
tags: [chrome-extension, content-script, progressive-guard, language-gate, tdd]

# Dependency graph
requires:
  - phase: 14-ux-quality-hardening-vision-settings
    plan: "01"
    provides: himeNum field on ProgressiveBadgeMessage payload; himeNum on ImageEntry variants
provides:
  - shouldGateByLanguage pure predicate in progressive-guard.ts (D-05)
  - D-05 page-language gate at both progressive start sites in content.ts (boot + live-toggle)
  - D-04 [hime N] badge label in content.ts (progAddBadge uses himeNum from worker)
affects:
  - 14-03 through 14-05 (any plan touching content.ts progressive section or progressive-guard.ts)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Classic-script mirroring: pure guard logic defined in progressive-guard.ts, mirrored verbatim in content.ts (no imports possible in classic scripts). Pattern established by isEligibleSize / progIsEligibleSize."
    - "Conservative-default gate: missing or ambiguous page lang returns true (gate ON / spend nothing). Fail-safe direction is always zero-spend."
    - "TDD RED/GREEN: test file committed before implementation; all 5 new test cases confirmed failing before implementation."

key-files:
  created: []
  modified:
    - src/progressive-guard.ts
    - src/content.ts
    - test/progressive-guard.mjs

key-decisions:
  - "Inline ISO map in progressive-guard.ts (GUARD_LANGUAGE_ISO) rather than importing from types.ts, keeping the module free of any transitive browser/chrome dependency and self-contained for node testing."
  - "Mirror progShouldGateByLanguage + progNormalizeToBase + PROG_LANGUAGE_ISO in content.ts (classic-script law: no ES module imports). Inline comment documents the source-of-truth and sync obligation."
  - "Gate reads document.documentElement.lang at each call site (not cached): the toggle fires rarely and lang changes mid-session are uncommon; re-reading is safer than stale-cache risk."
  - "himeNum fallback to 0 in progressiveBadge handler if payload lacks it — defends against legacy worker messages before 14-01 shipped."

patterns-established:
  - "shouldGateByLanguage return polarity: true=gate/skip, false=allow. Documented in JSDoc so call sites read !progShouldGateByLanguage(...) correctly."
  - "D-05b right-click bypass: gate is progressive-only; translateImage path in background.ts never gated."

requirements-completed: [IMG-06]

# Metrics
duration: 25min
completed: 2026-06-21
---

# Phase 14 Plan 02: D-05 Page-Language Gate + D-04 [hime N] Badge Summary

**Pure `shouldGateByLanguage` BCP-47 predicate (TDD) + page-language gate wired at both progressive start sites + on-image badge updated from `[hime]` to `[hime N]` via worker-assigned himeNum**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-21T18:02:00Z
- **Completed:** 2026-06-21T18:27:31Z
- **Tasks:** 2 (Task 1 TDD: 3 commits RED/GREEN; Task 2: 1 commit)
- **Files modified:** 3

## Accomplishments

- `shouldGateByLanguage(pageLang, targetLang): boolean` added to `progressive-guard.ts` — pure, no chrome/document refs, node-testable. Normalizes BCP-47 page lang and display-name target to ISO base subtags; returns `true` (gate ON) for empty/whitespace lang or when page lang matches target.
- D-05 gate wired in `content.ts` at both progressive entry points: the boot `chrome.storage.local.get` callback and the live-toggle `storage.onChanged` handler. Neither calls `startProgressive()` unless `progressiveEnabled=true` AND the gate returns `false`.
- D-05b confirmed: right-click `translateImage` path (in `background.ts`) is entirely untouched — the explicit gesture always works.
- D-04 badge updated: `progAddBadge` now accepts `himeNum`; `badge.textContent = \`[hime ${himeNum}]\`` (textContent-only, T-13-06); `progressiveBadge` handler extracts `himeNum` from the worker payload and passes it through.
- All 172 tests passing (10 in progressive-guard.mjs including 5 new D-05 cases, 162 in other suites), 2 skipped (opt-in live test + 1 other), 0 failing.

## Task Commits

Each task committed atomically:

1. **Task 1 RED: shouldGateByLanguage tests** - `8edb133` (test)
2. **Task 1 GREEN: shouldGateByLanguage implementation** - `02434ec` (feat)
3. **Task 2: D-05 gate + D-04 badge wired in content.ts** - `93377f9` (feat)

_TDD task: RED commit before GREEN implementation per plan tdd="true"._

## Files Created/Modified

- `src/progressive-guard.ts` — Added `GUARD_LANGUAGE_ISO` map, `normalizeToBase` helper, and `shouldGateByLanguage` exported predicate (D-05)
- `src/content.ts` — Added mirrored `PROG_LANGUAGE_ISO`, `progNormalizeToBase`, `progShouldGateByLanguage`; updated `progAddBadge` signature to accept `himeNum`; changed badge textContent to `[hime ${himeNum}]`; gated both progressive start sites; updated `progressiveBadge` handler to pass `himeNum`
- `test/progressive-guard.mjs` — 5 new D-05 test cases for `shouldGateByLanguage` (same-lang, diff-lang, empty, BCP-47 region subtag, display-name normalization)

## Decisions Made

- Inlined `GUARD_LANGUAGE_ISO` in `progressive-guard.ts` rather than importing from `types.ts` to keep the module free of any transitive chrome/browser dependency and fully node-testable.
- Mirrored guard logic in `content.ts` as `progShouldGateByLanguage` (classic-script law — content.ts cannot use ES module imports). Pattern matches existing `progIsEligibleSize` mirror of `isEligibleSize`.
- `himeNum` fallback to `0` in `progressiveBadge` handler if payload value is not a number, defending against any pre-14-01 worker message format.

## Deviations from Plan

None — plan executed exactly as written. Classic-script mirroring was already documented as the required pattern in 14-PATTERNS.md.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- D-05 gate and D-04 badge are complete; both land atomically with 14-01's `himeNum` data contract.
- Plans 14-03 through 14-05 can proceed with full confidence that the progressive guard surface is settled.
- No blockers or concerns.

---
*Phase: 14-ux-quality-hardening-vision-settings*
*Completed: 2026-06-21*
