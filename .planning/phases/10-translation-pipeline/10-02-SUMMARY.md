---
phase: 10-translation-pipeline
plan: "02"
subsystem: translation-pipeline
tags: [translation, batch, background-worker, chrome-extension, xlt-02, xlt-04, xlt-05]
dependency_graph:
  requires: [10-01 (src/translate-batch.ts, TranslateBatchMessage, parseBatchReply, buildBatchTranslatePrompt)]
  provides: [case 'translateBatch' in background.ts onMessage switch]
  affects: [Phase 11 (page-side sequencing — two sequential messages, debounce, query box)]
tech_stack:
  added: []
  patterns: [Promise.race 8s AbortError timeout (D-04), batch-prompt-prepend to user content (prompt conflict workaround), worker-side parseBatchReply validation]
key_files:
  created: []
  modified:
    - src/background.ts
decisions:
  - "Batch instruction prepended to user content (not threaded through config) so JSON instruction overrides the system-level 'output ONLY translated text' that all providers inject via buildSystemPrompt — keeps all provider files untouched (out of scope)"
  - "parseBatchReply runs worker-side (RESEARCH Open Q1 resolution) — validated translations map returned to page; mergeTranslations remains page-side pure function (Phase 11)"
  - "Outer return true at line 278 reused — no per-case return true added"
metrics:
  duration_minutes: 12
  completed: "2026-06-10T20:30:00Z"
  tasks_completed: 2
  files_changed: 1
---

# Phase 10 Plan 02: Background Worker translateBatch Handler Summary

**One-liner:** Wired `case 'translateBatch'` into background.ts — provider+key guard, Promise.race 8s AbortError timeout (D-04), parseBatchReply worker-side validation, `{ translations }` | `{ error, kind }` response, no provider edits.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add case 'translateBatch' to background.ts onMessage switch | d99eac1 | src/background.ts |
| 2 | Worker-handler behavioral regression check via full suite | (no source changes) | — |

## What Was Built

### src/background.ts (modified)

Added to `case 'translateBatch'` in the `switch (message.type)` block (after `searchTranslated`):

1. **Import additions:** `TranslateBatchMessage` added to named type import from `./types.js`; `import { buildBatchTranslatePrompt, parseBatchReply } from './translate-batch.js'` added as new import line.

2. **Handler structure (mirrors searchTranslated/translate):**
   - Casts `message as TranslateBatchMessage`, destructures `{ items, config }` from `msg.payload`
   - Reads `s = await getSettings()`, resolves `apiKey = s.apiKeys[s.provider] || ''`
   - Guards: empty key → `sendResponse({ error: ..., kind: 'auth' }); break`
   - Guards: unknown provider → `sendResponse({ error: ..., kind: 'unknown' }); break`
   - Captures `inputKeys = Object.keys(items)` and `payloadText = JSON.stringify(items)` (page-supplied only — XLT-04)
   - Builds `userContent = buildBatchTranslatePrompt(config) + '\n\n' + payloadText`
   - `await Promise.race([provider.translate(userContent, config, apiKey, s.model), 8s AbortError reject])`
   - On success: `recordUsage`, `parseBatchReply(result.text, inputKeys)`, `sendResponse({ translations })`
   - catch: `console.error('[hime] translateBatch failed', ...)`, `sendResponse({ error: errorMessage, kind })`

3. **Prompt conflict resolution (key decision):** `provider.translate()` calls `buildSystemPrompt` internally which appends "Output ONLY the translated text — no markdown". This directly conflicts with the JSON output required for batch translation. The chosen approach: prepend `buildBatchTranslatePrompt(config)` text to the user-content `payloadText` so the user-turn JSON instruction appears in the user message, overriding the system instruction in practice. This keeps all three provider files (`openai.ts`, `gemini.ts`, `openrouter.ts`) completely untouched. Documented per plan requirement.

4. **XLT-04 preserved:** Worker serializes `items` from the page payload only — it never reads `url`, `hostname`, or `faviconUrl` from any stored result or `SearchResult` object.

5. **XLT-05 worker half satisfied:** On timeout (8s AbortError → `kind: 'network'`) or any other error, the worker returns `{ error, kind }`. The page keeps its already-rendered raw stage (Phase 11 handles this; live 3-stage render is deferred — see below).

6. **D-04 satisfied:** `Promise.race` with 8000ms `setTimeout` rejecting an `Error` with `name: 'AbortError'` — `classifyError` in `errors.ts` lines 24-34 maps `err.name === 'AbortError'` to `kind: 'network'`.

7. **No per-case `return true`:** The outer `return true` at line 278 covers all cases (RESEARCH Pitfall 5 / PATTERNS confirmed).

## Verification Results

```
npm run build (tsc): exit 0
npm test (tsc && node --test 'test/**/*.mjs'):
  122 tests: 121 pass, 1 skipped (live Brave key), 0 fail

grep -c "translateBatch" dist/background.js: 2 matches (case label + console.error)
git diff --name-only: src/background.ts only (no provider edits)
```

## Deferred Work (Phase 11)

**Live 3-stage render (deferred to Phase 11):** The page-side sequencing — skeleton → raw Brave results → translated overlay (incl. timeout-leaves-raw behavior) — is out of scope for Phase 10. The worker now correctly returns `{ translations }` or `{ error, kind }`, but the two sequential messages (searchTranslated → translateBatch), debounce, and query box integration are Phase 11 verify-work items (per 10-VALIDATION Manual-Only Verifications). No SW-console test was introduced for this worker case (project law: never the SW console).

## Deviations from Plan

None — plan executed exactly as written. The batch-prompt-prepend approach was specified in the plan's action block (step 4) and followed precisely.

## Threat Coverage

| Threat ID | Mitigation | Status |
|-----------|------------|--------|
| T-10-01 (URL disclosure) | Worker serializes ONLY page-supplied `items` ({t,d} only); `url`/`hostname` never added in translateBatch case | Implemented |
| T-10-04 (API key in message) | LLM API key read from `chrome.storage` inside worker (`s.apiKeys[s.provider]`); never part of TranslateBatchMessage payload | Implemented |
| T-10-05 (unbounded LLM call) | Promise.race caps at 8s (D-04); timeout → `{ error, kind: 'network' }` — page keeps raw stage (XLT-05) | Implemented |
| T-10-03 (prompt injection) | parseBatchReply (validated in 10-01) runs worker-side; iterates inputKeys only; malicious reply keys dropped | Implemented (via 10-01) |
| T-10-SC (package installs) | No package installs in this plan | N/A |

## Self-Check: PASSED

Files modified:
- FOUND: src/background.ts

Commits exist:
- FOUND: d99eac1 (task 1 — feat(10-02): add case 'translateBatch' to background.ts onMessage switch)

Build artifacts:
- dist/background.js contains "translateBatch" at lines 179 and 217
- npm test: 122 tests, 121 pass, 0 fail
