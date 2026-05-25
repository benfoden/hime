---
phase: 02-prompt-quality-error-hardening
plan: 02
subsystem: api
tags: [translation, openai, gemini, abort-controller, error-classification, prompt-engineering]

# Dependency graph
requires:
  - phase: 02-01
    provides: classifyError/ErrorKind/ClassifiedError from src/errors.ts; stripWrappers from src/output.ts

provides:
  - Shared buildSystemPrompt with tuned Auto-formality multi-cue register instruction
  - OpenAI provider hardened with 10s AbortController timeout, classifyError, stripWrappers
  - Gemini provider hardened with 10s AbortController timeout, classifyError, stripWrappers
  - Duplicate prompt builder eliminated — single source of truth in src/providers/prompt.ts

affects: [02-03, plan-03-badge-routing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - AbortController + setTimeout(10000) wrapping fetch for timeout
    - classifyError called in catch blocks to produce kind-tagged Error objects
    - stripWrappers applied to raw LLM content before return
    - Shared module pattern for provider utilities (prompt.ts)
    - TDD RED/GREEN/REFACTOR cycle per task

key-files:
  created:
    - src/providers/prompt.ts
  modified:
    - src/providers/openai.ts
    - src/providers/gemini.ts
    - test/unit.mjs

key-decisions:
  - "Single shared prompt module (prompt.ts) prevents Auto instruction from drifting between providers"
  - "Error rethrow pattern: caught errors with .kind already set are rethrown as-is; new errors get .kind tagged for Plan 03 badge routing"
  - "stripWrappers replaces .trim()-only on success path — handles quoted/fenced LLM output"

patterns-established:
  - "Provider fetch pattern: AbortController(10s) -> fetch(..., signal) -> try/catch inner (network) + if(!ok) (HTTP error) -> finally clearTimeout"
  - "Error kind tagging: const c = classifyError(...); const e = new Error(c.message); e.kind = c.kind; throw e"

requirements-completed: [FORM-06, FORM-07, FORM-08, ERR-03, ERR-04, ERR-05, LOG-02]

# Metrics
duration: 25min
completed: 2026-05-24
---

# Phase 2 Plan 02: Shared Prompt Builder + Provider Hardening Summary

**Shared Auto-formality prompt with multi-cue register detection wired into hardened OpenAI and Gemini providers (10s abort, classifyError, stripWrappers)**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-24T00:00:00Z
- **Completed:** 2026-05-24T00:25:00Z
- **Tasks:** 2 auto (Task 3 is checkpoint:human-verify, pending)
- **Files modified:** 4

## Accomplishments
- Created src/providers/prompt.ts with buildSystemPrompt exporting a single shared, tuned Auto-formality instruction with inline casual/neutral/business register cues and illustrative examples
- Hardened both providers with AbortController 10s timeout — hung requests no longer hang indefinitely
- Replaced generic error throws with classifyError-based kind-tagged Error objects — 401/403 -> auth, 429 -> rate_limit, TypeError/AbortError -> network
- Applied stripWrappers to all provider success paths — quoted/fenced LLM output cleaned before return
- Removed duplicate private buildSystemPrompt/getFormalityInstruction from both provider classes
- 29 unit tests all passing (21 carried from Plan 01 + 8 new provider behavior tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: RED test - buildSystemPrompt tests** - `654962e` (test)
2. **Task 1: GREEN impl - buildSystemPrompt shared module** - `65b630a` (feat)
3. **Task 2: RED test - provider hardening tests** - `9b901b2` (test)
4. **Task 2: GREEN impl - harden openai.ts + gemini.ts** - `8362328` (feat)

_Note: TDD tasks have RED (test) + GREEN (impl) commits per task_

## Files Created/Modified
- `src/providers/prompt.ts` - Shared buildSystemPrompt with tuned Auto multi-cue register instruction
- `src/providers/openai.ts` - AbortController timeout, classifyError, stripWrappers, shared prompt import; private builder removed
- `src/providers/gemini.ts` - AbortController timeout, classifyError, stripWrappers, shared prompt import; private builder removed
- `test/unit.mjs` - Added 15 new tests: 7 for buildSystemPrompt, 8 for provider error/success behavior

## Decisions Made
- Instruction-only Auto prompt tuning (no few-shot) keeps token cost low per CONTEXT.md deferred note; escalate to few-shot only if FORM-06/07 human checkpoint fails
- Error kind tagged directly on the thrown Error object (.kind, .status) so Plan 03 can inspect without changing the interface
- Inner try/catch pattern (separate from outer try/finally) cleanly separates network errors (from fetch throw) from HTTP errors (from !response.ok) while keeping clearTimeout in a single finally block

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Task 3 (FORM-06/07 live register checkpoint) is pending human verification
- Once approved, providers are fully hardened and ready for Plan 03 badge/notification routing that consumes .kind on thrown errors
- The .kind tag pattern on thrown errors is established and documented for Plan 03 to consume

## Self-Check: PASSED

- FOUND: src/providers/prompt.ts
- FOUND: src/providers/openai.ts
- FOUND: src/providers/gemini.ts
- FOUND: test/unit.mjs
- FOUND commit: 8362328 (Task 2 GREEN)
- FOUND commit: 9b901b2 (Task 2 RED)
- FOUND commit: 65b930c (Task 1 GREEN)
- FOUND commit: 654962e (Task 1 RED)

## Checkpoint: human-verify APPROVED (2026-05-25)

Task 3 (FORM-06/07 register inference + FORM-08 clean output) verified live on unpacked extension:
- Casual input `hey what's up` → casual/plain-form JP ✅
- Business input `Thank you for your help with this matter` → polite/formal JP ✅
- Both outputs clean: no quotes, no preamble, no fences ✅
User approved ("A1-3 all good").

---
*Phase: 02-prompt-quality-error-hardening*
*Completed: 2026-05-24*
