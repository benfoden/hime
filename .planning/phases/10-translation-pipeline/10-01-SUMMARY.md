---
phase: 10-translation-pipeline
plan: "01"
subsystem: translation-pipeline
tags: [translation, batch, pure-functions, unit-tests, xlt-02, xlt-03, xlt-04, xlt-05]
dependency_graph:
  requires: []
  provides: [src/translate-batch.ts, TranslateBatchMessage, TranslateBatchResponse, getFormalityInstruction exported]
  affects: [src/background.ts (plan 10-02 imports translate-batch), Phase 11 (mergeTranslations)]
tech_stack:
  added: []
  patterns: [keyed-JSON batch payload, two-attempt JSON parse with stripWrappers, inputKey-only iteration for injection resistance]
key_files:
  created:
    - src/translate-batch.ts
    - test/translation-batch.mjs
  modified:
    - src/types.ts
    - src/providers/prompt.ts
decisions:
  - "Batch prompt omits customPrompt — can break JSON output (RESEARCH Open Q3)"
  - "parseBatchReply iterates inputKeys only, never parsed object keys — injection resistance (XLT-03 / T-10-03)"
  - "Two-attempt parse: stripWrappers first, raw.trim() fallback — handles code-fenced LLM replies"
metrics:
  duration_minutes: 15
  completed: "2026-06-10T20:04:57Z"
  tasks_completed: 3
  files_changed: 4
---

# Phase 10 Plan 01: Batch Translation Pure Functions Summary

**One-liner:** Keyed-JSON batch translation core — buildBatchPayload/parseBatchReply/mergeTranslations with 16 node:test cases covering XLT-02/03/04/05 fallback matrix and URL-never-sent invariant.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add translateBatch message types + export getFormalityInstruction | 72013b2 | src/types.ts, src/providers/prompt.ts |
| 2 | Implement src/translate-batch.ts pure functions | 589e0ff | src/translate-batch.ts |
| 3 | Write test/translation-batch.mjs node harness | 39fa863 | test/translation-batch.mjs |

## What Was Built

### src/translate-batch.ts (new, 108 lines)

Pure module with four exported functions — no Chrome API imports:

- **`buildBatchPayload(results)`** — builds `{"0":{t,d},...}` from SearchResult[]; constructs from title/description ONLY, never url/hostname/faviconUrl (XLT-04 / T-10-01)
- **`buildBatchTranslatePrompt(config)`** — array-join system prompt instructing strict JSON output; reuses `getFormalityInstruction`; omits customPrompt (RESEARCH Open Q3)
- **`parseBatchReply(raw, inputKeys)`** — two-attempt parse (stripWrappers → raw.trim()); validates non-null object shape, per-key `{t:string, d:string}`; iterates inputKeys only (injection resistance); returns `{}` on non-JSON or array (XLT-03)
- **`mergeTranslations(raw, translations)`** — non-mutating `raw.map()` overlay; url/hostname/faviconUrl carried verbatim via spread (XLT-05)

### src/types.ts (modified)

- Added `| 'translateBatch'` to `MessageType` union
- Added `TranslateBatchMessage` (extends Message, payload: items + config)
- Added `TranslateBatchResponse` (translations? / error? / kind? discriminant pattern)

### src/providers/prompt.ts (modified)

- `getFormalityInstruction` changed from module-private to `export function` — reused by translate-batch.ts without duplication (RESEARCH A5)

### test/translation-batch.mjs (new, 262 lines)

16 node:test cases (all passing) covering:
- XLT-02: keyed-JSON shape, prompt structure
- XLT-04: url/hostname/faviconUrl absent from payload values and serialized JSON
- XLT-03: full reply, missing key, malformed entry (missing d), non-string t/d, extra/renamed keys, non-JSON, JSON array, code-fenced reply
- XLT-05: full overlay with verbatim url/hostname, partial translations, empty map + new-array assertion, XSS passthrough as opaque data

## Verification Results

```
node --test test/translation-batch.mjs
  16 tests: 16 pass, 0 fail

npm test (full suite)
  122 tests: 121 pass, 1 skipped (live Brave key), 0 fail
```

## Deviations from Plan

None — plan executed exactly as written.

## Threat Coverage

| Threat ID | Mitigation | Status |
|-----------|------------|--------|
| T-10-01 (URL disclosure) | buildBatchPayload constructs {t,d} only; XLT-04 tests assert no url/hostname in serialized payload | Implemented + tested |
| T-10-02 (XSS in translated strings) | mergeTranslations stores as opaque data; XLT-05 XSS test asserts exact string survival; renderer contract (textContent) unchanged | Implemented + tested |
| T-10-03 (prompt injection via renamed keys) | parseBatchReply iterates inputKeys only; XLT-03 "ignores extra/renamed reply keys" test asserts this | Implemented + tested |
| T-10-SC (package installs) | No packages installed | N/A |

## Self-Check: PASSED

Files exist:
- FOUND: src/translate-batch.ts
- FOUND: test/translation-batch.mjs
- FOUND: src/types.ts (modified)
- FOUND: src/providers/prompt.ts (modified)

Commits exist:
- FOUND: 72013b2 (task 1)
- FOUND: 589e0ff (task 2)
- FOUND: 39fa863 (task 3)
