---
phase: 05-ghost-text-prediction-engine
plan: "01"
subsystem: prediction-engine
tags: [prediction, provider, background, types, tdd]
dependency_graph:
  requires: []
  provides: [predict-message-contract, sanitizeSuggestion, buildPredictionPrompt, provider-predict-methods, background-predict-case]
  affects: [src/types.ts, src/predict-util.ts, src/providers/prompt.ts, src/providers/openai.ts, src/providers/gemini.ts, src/providers/openrouter.ts, src/background.ts]
tech_stack:
  added: []
  patterns: [tdd-red-green, provider-method-mirror, abort-controller-timeout, silent-error-boundary]
key_files:
  created:
    - src/predict-util.ts
  modified:
    - src/types.ts
    - src/providers/prompt.ts
    - src/providers/openai.ts
    - src/providers/gemini.ts
    - src/providers/openrouter.ts
    - src/background.ts
    - test/unit.mjs
decisions:
  - "Provider predict() implemented alongside interface (not separately) — TypeScript requires all interface members to be implemented before compilation succeeds; adding predict() to TranslationProvider interface immediately caused compile errors in all three providers, so implementations were added in Task 1's GREEN phase rather than Task 2's separate cycle"
  - "sanitizeSuggestion uses /[\\x00-\\x1F\\x7F-\\x9F]/g regex instead of the plan's garbled /[ --]/g — the plan's regex was a rendering artifact; correct C0/C1 range used per the surrounding comment"
  - "max_tokens: 8 chosen per research recommendation for 2-3 word CJK completion (vs max_tokens: 10 shown in some research examples)"
metrics:
  duration: "4m 15s"
  completed_date: "2026-05-31"
  tasks_completed: 3
  files_modified: 7
  tests_added: 15
  tests_total: 56
---

# Phase 05 Plan 01: Prediction Data Layer Summary

**One-liner:** Background predict message contract with sanitizeSuggestion + buildPredictionPrompt + provider predict() methods on OpenAI/Gemini/OpenRouter, language-agnostic (LANG-02), errors silenced (D-10).

## What Was Built

A complete prediction plumbing layer that Plan 02 (the content-script ghost engine) will consume via `chrome.runtime.sendMessage({ type: 'predict', ... })`.

### Artifacts Delivered

| Artifact | Path | Purpose |
|----------|------|---------|
| PredictMessage interface | src/types.ts | Type-safe predict message contract |
| 'predict' MessageType | src/types.ts | Extends union for switch dispatch |
| predict() on TranslationProvider | src/types.ts | Interface contract for all providers |
| sanitizeSuggestion() | src/predict-util.ts | Strips control chars, truncates at newline (T-05-02) |
| buildPredictionPrompt() | src/providers/prompt.ts | Language-agnostic prompt, no target-language (LANG-02) |
| OpenAIProvider.predict() | src/providers/openai.ts | max_tokens:8, stop sequences, 10s timeout |
| GeminiProvider.predict() | src/providers/gemini.ts | generationConfig maxOutputTokens:8, stopSequences |
| OpenRouterProvider.predict() | src/providers/openrouter.ts | Attribution headers, max_tokens:8, stop sequences |
| predictText() | src/background.ts | 500-char input clip (T-05-01), no recordUsage (D-10) |
| case 'predict' | src/background.ts | Routes to predictText, sanitizes, errors → { suggestion: '' } |

### Key Links (verified)

- `background.ts predictText` → `providers[settings.provider].predict` (line 117)
- `background.ts predict case` → `sanitizeSuggestion` (line 146)

## Decisions Made

1. **predict() implemented in Task 1 GREEN phase** — TypeScript requires interface completeness before compilation. Adding `predict()` to `TranslationProvider` caused tsc errors on all three provider files immediately. Implementations were added as Rule 3 (blocking issue) during Task 1 rather than deferring to Task 2's separate TDD cycle. Task 2 then added the provider predict tests as its deliverable.

2. **Corrected sanitizeSuggestion regex** — The plan's `replace(/[ --]/g, '')` was a rendering artifact (garbled character class). Correct C0/C1 range `/[\x00-\x1F\x7F-\x9F]/g` used per the surrounding comment's description.

3. **max_tokens: 8** — Used per research recommendation (vs 10 in some research notes). Research explicitly states "use 8 as starting point" for CJK token density.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Provider predict() implementations added during Task 1**
- **Found during:** Task 1 GREEN phase (tsc compilation)
- **Issue:** Adding `predict()` to `TranslationProvider` interface caused immediate TypeScript errors in background.ts (3 errors) and all three provider files (3 errors). Task 1 could not reach GREEN without implementing the method in all providers.
- **Fix:** Implemented full `predict()` methods in all three providers during Task 1's GREEN phase, mirroring `translate()` structure with prediction-specific parameters.
- **Files modified:** src/providers/openai.ts, src/providers/gemini.ts, src/providers/openrouter.ts
- **Impact on Task 2:** Task 2 became tests-only (no new implementation needed); its TDD cycle was RED (tests initially added to already-green code) → GREEN (immediate pass). Documented per TDD fail-fast rule.
- **Commits:** a3d33ff (Task 1 feat), a2c04f9 (Task 2 tests)

**2. [Rule 1 - Bug] sanitizeSuggestion regex corrected**
- **Found during:** Task 1 implementation
- **Issue:** Plan's regex `/[ --]/g` is an invalid/garbled character class that would match the wrong characters
- **Fix:** Used `/[\x00-\x1F\x7F-\x9F]/g` — the correct C0/C1 Unicode control character ranges per the comment
- **Files modified:** src/predict-util.ts

## TDD Gate Compliance

- Task 1 (sanitizeSuggestion + buildPredictionPrompt): RED gate confirmed (ERR_MODULE_NOT_FOUND before implementation), GREEN confirmed (8 new tests pass after implementation)
- Task 2 (provider predict tests): GREEN-only cycle — implementation already existed from Task 1's blocking fix. Documented above.
- Task 3: No TDD (`tdd="false"`) — direct implementation with supporting logic tests

## Known Stubs

None. All prediction methods return real provider responses; sanitizeSuggestion applies to all output.

## Threat Flags

None. All threat mitigations in the plan's threat model are implemented:
- T-05-01: input clip to 500 chars in predictText() ✓
- T-05-02: sanitizeSuggestion strips control chars before relay to page ✓
- T-05-04: errors resolve to { suggestion: '' }, no provider detail leaked ✓

## Self-Check

Verified file existence and commit hashes below.
