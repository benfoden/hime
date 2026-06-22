---
phase: 16-in-place-image-overlay-translation
plan: "03"
subsystem: ui
tags: [chrome-extension, popup, storage, checkbox, settings]

# Dependency graph
requires:
  - phase: 16-in-place-image-overlay-translation/16-01
    provides: Settings.includeImages field + DEFAULT_SETTINGS in types.ts
provides:
  - "Include images checkbox in popup.html with id=includeImages beneath Translate page button"
  - "popup.ts load/persist wiring: reads settings.includeImages on open, merge-writes on change"
affects:
  - 16-04 (content.ts reads includeImages from himeSettings at translate time to branch into image-overlay pass)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "merge-write-preserving-other-fields: read himeSettings, spread, write back — T-16-07 tamper mitigation"
    - "default-OFF optional boolean: settings.includeImages ?? false (D-01 cost-philosophy for paid Vision)"

key-files:
  created: []
  modified:
    - src/popup.html
    - src/popup.ts

key-decisions:
  - "Checkbox placed directly beneath #translatePage button (not in a separate section) to visually associate with the action it modifies"
  - "Change handler reads current himeSettings before writing to preserve all other fields (T-16-07 merge-write)"
  - "Default OFF via ?? false in loadSettings — aligns with D-01 silent-auto-spend cost philosophy for BYOK Vision"

patterns-established:
  - "merge-write-preserving-other-fields: the pattern for checkbox-to-storage round-trip in popup.ts"

requirements-completed: [OVL-01]

# Metrics
duration: 8min
completed: 2026-06-22
---

# Phase 16 Plan 03: Include Images Checkbox Summary

**Popup opt-in checkbox for in-place image overlay translation wired to himeSettings with merge-write default-OFF (D-01 / OVL-01)**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-22T00:00:00Z
- **Completed:** 2026-06-22T00:08:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Added labeled `#includeImages` checkbox beneath `#translatePage` button in popup.html
- Wired element ref + change listener in popup.ts DOMContentLoaded init block
- `loadSettings` sets `includeImagesCheckbox.checked = settings.includeImages ?? false` (default OFF, D-01)
- Change handler reads-then-merges `himeSettings` via spread (`{ ...current, includeImages: ... }`) so toggling cannot drop API keys or other stored fields (T-16-07 tamper mitigation)

## Task Commits

1. **Task 1: Include images checkbox markup + load/persist wiring** - `b850faa` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/popup.html` - Added `<label class="include-images"><input type="checkbox" id="includeImages"> Include images</label>` beneath #translatePage
- `src/popup.ts` - Declared `includeImagesCheckbox: HTMLInputElement`; wired element ref + change listener in DOMContentLoaded; set `checked = settings.includeImages ?? false` in loadSettings

## Decisions Made
- Checkbox placed directly beneath #translatePage button to visually associate with the action it modifies (no separate section needed for a single checkbox)
- Change handler uses read-then-spread-write pattern (T-16-07: merge-write) to preserve all other himeSettings fields
- `?? false` default in loadSettings ensures unchecked when field absent in persisted settings

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None.

## Threat Flags
None — the checkbox stores a boolean preference in local storage, matching the established himeSettings pattern (T-16-08 accepted, T-16-07 mitigated via merge-write, T-16-SC mitigated: zero new packages).

## Self-Check: PASSED
- `src/popup.html` contains `id="includeImages"` — confirmed
- `src/popup.ts` contains `includeImages`, spread operator, and `?? false` — confirmed
- `b850faa` commit exists on branch — confirmed
- 214/216 tests pass (2 skipped: live API), typecheck clean, build clean

## Next Phase Readiness
- Plan 04 (content.ts overlay render + anchor + per-image toggle) can now read `includeImages` from `himeSettings` in `chrome.storage.local` at translate time to branch into the image-overlay pass
- No blockers

---
*Phase: 16-in-place-image-overlay-translation*
*Completed: 2026-06-22*
