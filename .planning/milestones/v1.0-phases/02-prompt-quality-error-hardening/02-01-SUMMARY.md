---
phase: 02-prompt-quality-error-hardening
plan: "01"
subsystem: testing
tags: [typescript, node-test, error-classification, output-sanitization, esm]

requires: []
provides:
  - classifyError helper mapping provider failures to typed ErrorKind (auth/rate_limit/network/unknown)
  - stripWrappers output sanitizer removing fences, meta-lines, and quote pairs
  - ErrorKind+ClassifiedError types available from src/types.ts re-export
  - Automated npm test harness (14 node:test assertions against dist/)
affects:
  - 02-02 (providers will import classifyError at throw sites)
  - 02-03 (background/content will import ErrorKind from types.ts)

tech-stack:
  added: [node:test (built-in), node:assert/strict (built-in)]
  patterns:
    - Chrome-API-free pure helpers (no chrome. imports in errors.ts or output.ts)
    - TDD gate — tsc compiles to dist/, node --test runs against compiled output
    - Single import site pattern — ErrorKind re-exported from types.ts

key-files:
  created:
    - src/errors.ts
    - src/output.ts
    - test/unit.mjs
  modified:
    - src/types.ts
    - package.json

key-decisions:
  - "Test harness runs against dist/ (compiled output), not source — catches tsc errors before runtime"
  - "package.json type:module added to enable ES module parsing without performance warning"
  - "node --test 'test/**/*.mjs' glob used (not test/ directory) for Node 24 compatibility"
  - "ErrorKind re-exported from types.ts so consumers have one import site"

patterns-established:
  - "Pure helpers (no Chrome API): errors.ts and output.ts are dependency-free for unit testability"
  - "npm test = tsc && node --test: compile gate before running tests"

requirements-completed: [ERR-04, ERR-05, FORM-08, LOG-02]

duration: 18min
completed: 2026-05-24
---

# Phase 2 Plan 01: Error Classifier, Output Sanitizer & Test Harness Summary

**classifyError and stripWrappers pure helpers with typed ErrorKind, plus the project's first automated test gate (14 node:test assertions, npm test exits 0)**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-05-24T00:00:00Z
- **Completed:** 2026-05-24T00:18:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- classifyError maps any provider failure to auth/rate_limit/network/unknown with exact user-facing message strings
- stripWrappers sanitizes LLM output by stripping markdown fences, leading meta-commentary, and surrounding quote pairs
- 14 automated assertions verify all behavior cases (7 classifyError + 7 stripWrappers), npm test exits 0
- ErrorKind+ClassifiedError types available via single import from src/types.ts for Plans 02 and 03

## Task Commits

1. **Task 1: Create classifyError helper with typed ErrorKind** - `deef530` (feat)
2. **Task 2: Create stripWrappers output sanitizer** - `1610154` (feat)
3. **Task 3: Add error-kind message types and Node unit test harness** - `89ced8b` (feat)

## Files Created/Modified

- `src/errors.ts` - classifyError, ErrorKind, ClassifiedError — Chrome-API-free
- `src/output.ts` - stripWrappers sanitizer — Chrome-API-free
- `src/types.ts` - re-exports ErrorKind/ClassifiedError; adds optional kind field to TranslationResponse and SetBadgeMessage
- `test/unit.mjs` - 14 node:test assertions running against dist/errors.js and dist/output.js
- `package.json` - adds test script, type:module, installs devDependencies

## Decisions Made

- Used `node --test 'test/**/*.mjs'` glob instead of `test/` directory — Node 24 cannot resolve a bare directory as a test entry point
- Added `"type": "module"` to package.json to eliminate ES module reparsing performance warning
- Re-exported ErrorKind from types.ts to give Plans 02/03 a single canonical import site

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed node --test directory resolution failure**
- **Found during:** Task 3 (npm test script)
- **Issue:** `node --test test/` fails on Node 24 with "Cannot find module '/path/to/test'" — bare directory is not a valid test entry
- **Fix:** Changed test script to use glob `'test/**/*.mjs'` which Node test runner accepts
- **Files modified:** package.json
- **Verification:** npm test exits 0 with 14 pass / 0 fail
- **Committed in:** 89ced8b

**2. [Rule 2 - Missing Critical] Added type:module to package.json**
- **Found during:** Task 3 (first test run)
- **Issue:** Node emitted MODULE_TYPELESS_PACKAGE_JSON warning — dist/*.js parsed as CJS then reparsed as ESM (performance penalty on every test run)
- **Fix:** Added `"type": "module"` to package.json
- **Files modified:** package.json
- **Verification:** Warning absent on subsequent npm test runs
- **Committed in:** 89ced8b

**3. [Rule 3 - Blocking] Ran npm install to populate node_modules**
- **Found during:** Task 3 (npm test)
- **Issue:** node_modules/.bin/tsc did not exist — tsc not found on PATH, test script failed immediately
- **Fix:** Ran `npm install` to install devDependencies (typescript, @types/chrome)
- **Files modified:** package-lock.json (updated)
- **Verification:** node_modules/.bin/tsc present, npm test runs tsc successfully
- **Committed in:** 89ced8b

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 missing critical)
**Impact on plan:** All fixes necessary for the test harness to work. No scope creep.

## Issues Encountered

- Initial `stripWrappers` implementation tested against old `dist/output.js` (pre-recompile) — appeared to fail before tsc was re-run. Running `npx tsc && node --test` resolved it.

## Known Stubs

None — all implemented functionality is wired and tested.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced. classifyError never interpolates the API key (only receives status/bodyMessage), satisfying T-02-01.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 02: providers can now `import { classifyError } from '../errors.js'` at throw sites
- Plan 03: background/content can `import type { ErrorKind } from '../types.js'` for kind-distinct badge messages
- npm test is the automated gate — run after every change to errors.ts or output.ts

---
*Phase: 02-prompt-quality-error-hardening*
*Completed: 2026-05-24*
