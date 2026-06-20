---
status: complete
phase: 11-page-wiring-popup-entry
source: [11-01-SUMMARY.md, 11-02-SUMMARY.md, 11-03-SUMMARY.md]
started: 2026-06-20T16:45:00Z
updated: 2026-06-20T17:35:00Z
method: live human verification (unpacked extension, real worker round-trip)
---

## Current Test

number: 6
name: settings swap (⇄) button
expected: |
  Swap button on the settings page exchanges source/target languages.
awaiting: none — all tests complete

## Tests

### 1. Popup Search button opens search.html (SRCH-01)
expected: Clicking the popup "Search" button opens the bundled search.html in a new tab.
result: pass
reported: "approved: popup Search entry works"

### 2. Translated query disclosure line (SRCH-03, D-04/D-05)
expected: After submitting a query, a read-only disclosure line ("Searching in <language> for: <query>") appears above the results before they load; language pair matches settings.
result: pass
reported: "approved: live translated search confirmed"

### 3. Explicit source→target direction, no auto-flip (SRCH-02, D-02/D-10)
expected: Query translated using explicit source→target direction (no inline auto-flip); translated SERP results returned; raw-query fallback on LLM failure.
result: pass
reported: "live translated search confirmed (direction correct)"

### 4. Search loading state + ms timer (scope-add)
expected: Search page shows a loading state with a millisecond timer while results resolve.
result: pass
reported: "approved (decision_answer: approved)"

### 5. Settings language dropdowns (scope-add)
expected: Settings page exposes source/target language dropdowns.
result: pass
reported: "approved (decision_answer: approved)"

### 6. Settings swap (⇄) button (scope-add)
expected: Swap button exchanges source/target languages in settings.
result: pass
reported: "approved (decision_answer: approved)"

## Summary

All 3 phase success criteria verified live by the user (popup entry, disclosure
line, explicit-direction translated results). Three user-steered scope-adds
(loading timer, settings language dropdowns, swap button) also verified live and
approved. Build green: tsc clean, 137 pass / 1 skip, build OK.

Result: 6/6 pass, 0 issues. Phase 11 verification complete.
