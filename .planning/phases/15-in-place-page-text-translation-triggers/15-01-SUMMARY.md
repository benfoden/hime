---
phase: 15-in-place-page-text-translation-triggers
plan: 01
subsystem: api
tags: [chrome-mv3, content-script, batch-translation, dom-walk, linkedom, key-injection-guard, pure-module]

# Dependency graph
requires:
  - phase: v1.2 (translated search, phases 8-11)
    provides: translate-batch.ts keyed-JSON pipeline (parseBatchReply key-injection guard, buildBatchTranslatePrompt) cloned here
  - phase: 14 (image translation / progressive)
    provides: progressive-guard.ts constants-block + concurrency-cap convention; STORAGE_PROGRESSIVE_ACK storage-key style; output.ts stripWrappers; providers/prompt.ts getFormalityInstruction
provides:
  - "src/page-walk.ts — pure, node-tested core for in-place page translation (skip-set predicate, recursive walk, char-budget chunking, page-batch prompt builder, key-injection-guarded reply parser, once-only restore capture, failed-set retry contract)"
  - "src/types.ts — translatePage/togglePage/translatePageBatch message types + TranslatePageBatchMessage/Response interfaces + STORAGE_BANNER_DISMISSED/STORAGE_PAGE_STATE session-storage key consts"
  - "test/page-walk.mjs — linkedom unit suite covering PAGE-01..05 pure logic + T-15-01 key-injection guard + D-04 failed-set"
affects: [15-02, 15-03, 15-04, content.ts-mirror, background.ts-translatePageBatch-handler, popup-state-mirror]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-module / classic-script mirror doctrine: canonical node-tested logic in page-walk.ts; content.ts will duplicate verbatim (cannot import a classic script)"
    - "Cloned key-injection-guarded parse: parsePageBatchReply iterates inputKeys ONLY, string-typed entries, two-attempt stripWrappers/raw parse, array/non-object → {}"

key-files:
  created:
    - src/page-walk.ts
    - test/page-walk.mjs
  modified:
    - src/types.ts

key-decisions:
  - "New translatePageBatch message carrying Record<string,string> (plain strings) rather than reusing translateBatch {t,d} — page text is a single string with no title/description split (RESEARCH A4 / PATTERNS A4)"
  - "captureOriginal pure helper takes a plain Map<string,{original,translated}>; content.ts will use a WeakMap<Text,...> — both apply the same once-only guard (first capture wins, Pitfall 7)"
  - "selectFailedRetry returns a snapshot of the failed Set and leaves the .clear() to the caller, keeping the set authoritative across overlapping retries (D-04)"

patterns-established:
  - "Pure page-walk module (no chrome.*, no document writes, no innerHTML) — grep-gated for purity (T-15-02)"
  - "Recursive walk for tests + native createTreeWalker for content.ts (linkedom does not drive createTreeWalker under acceptNode — Pitfall 3)"

requirements-completed: [PAGE-01, PAGE-02, PAGE-03, PAGE-04, PAGE-05]

# Metrics
duration: ~18min
completed: 2026-06-22
---

# Phase 15 Plan 01: Pure Page-Walk Core Summary

**Pure, node-tested `page-walk.ts` core for in-place page translation — skip-set walk, char-budget chunking, key-injection-guarded batch-reply parse, once-only restore capture, failed-set retry — plus the translatePage message contracts and session-storage keys.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-22T15:26Z (approx)
- **Completed:** 2026-06-22
- **Tasks:** 3
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- `src/page-walk.ts` exports every PAGE-01..05 decision that does not require a live `document` or `chrome.*`: `SKIP_TAGS`/`isTranslatableTag`, `collectTextNodesRecursive`, `chunkByBudget`, `buildPageBatchPrompt`, `parsePageBatchReply`, `captureOriginal`, `selectFailedRetry`, `PAGE_CHUNK_MAX_CHARS`, `PAGE_CONCURRENCY_CAP`, and the `PageBatch` type.
- `parsePageBatchReply` is a verbatim security-clone of `parseBatchReply` (XLT-03 → T-15-01): two-attempt parse, iterates `inputKeys` only, accepts only `typeof entry === 'string'`, rejects arrays/non-objects.
- `src/types.ts` carries the three new message types, both interfaces (plain-string `items`, no BYOK key), and both `chrome.storage.session` key consts (ephemeral by design, D-02).
- `test/page-walk.mjs` (20 tests) drives the recursive walk via linkedom and covers skip-set, contenteditable skip, walk order, chunk sizing/oversized-node isolation, the key-injection guard (`evil` + `__proto__`), code-fence/raw fallback, once-only restore round-trip, and the failed-set retry contract — all against `dist/` per project law.

## Task Commits

Each task was committed atomically:

1. **Task 1: page-translate message contracts + session-storage keys** — `5c365a8` (feat)
2. **Task 2: pure page-walk.ts helpers** — `9c5c5a5` (feat)
3. **Task 3: test/page-walk.mjs unit suite** — `3aad239` (test)

_Note: this plan's tasks were tdd-flagged. Task 2 (module) and Task 3 (its test suite) form the implementation+test pair; the GREEN gate is Task 3's `node --test` run (20/20 green)._

## Files Created/Modified
- `src/page-walk.ts` (201 lines) — pure walk/chunk/parse/restore/failed-set helpers + page-batch prompt builder; no chrome.*, no document, no innerHTML
- `test/page-walk.mjs` (246 lines) — linkedom-driven unit coverage against dist/page-walk.js
- `src/types.ts` (+38 lines) — MessageType union members, TranslatePageBatchMessage/Response, STORAGE_BANNER_DISMISSED/STORAGE_PAGE_STATE

## Decisions Made
- Chose the leaner `translatePageBatch` message (plain-string `Record<string,string>`) over reusing `translateBatch` `{t,d}` — a page text node has no title/description split, and forcing one is a lie the prompt would have to work around (RESEARCH A4).
- `captureOriginal` operates on a plain `Map` in the pure world; the live `WeakMap<Text,...>` toggle store stays content.ts-only (WeakMap is not enumerable; Pitfall 6 handled there). Both share the once-only guard.
- `selectFailedRetry` returns a snapshot and leaves `.clear()` to the caller, so the failed set stays authoritative across overlapping retries (D-04 contract documented in code).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- The shell's `grep` is proxied (rtk) and silently mangled output for patterns containing parentheses (`for (const key of inputKeys)`) and for multi-file matches. Resolved by re-running acceptance greps with `grep -nF` (fixed-string) directly against the file; all gates confirmed: `chrome.`=0, `innerHTML`=0, key-injection loop present at line 161, both constants present, no `apiKey`/`key` in the page payload interface.

## Threat Surface
All three threat-register mitigations are in place and test-covered:
- **T-15-01 (Tampering, parsePageBatchReply):** iterates `inputKeys` only; `evil` and `__proto__` injection keys dropped (asserted in two tests; prototype pollution check included).
- **T-15-02 (EoP, module purity):** `grep -c 'chrome\.'` = 0, `grep -c innerHTML` = 0.
- **T-15-03 (Info disclosure, payload):** no `apiKey`/`key` field in `TranslatePageBatchMessage.payload` (items carry source text + config only).

No new threat surface beyond the plan's `<threat_model>`.

## User Setup Required
None - no external service configuration required. No new dependency, permission, or env var (locked: no new OSS dependency).

## Next Phase Readiness
- Plan 15-02/03/04 can now: mirror these predicates into `content.ts` (classic-script law), add the `translatePageBatch` worker handler in `background.ts` (clone of the `translateBatch` case using `buildPageBatchPrompt`/`parsePageBatchReply`), and wire the popup/context-menu triggers + banner using `STORAGE_BANNER_DISMISSED`/`STORAGE_PAGE_STATE`.
- Full suite green (202 pass / 0 fail / 2 opt-in skip); `dist/page-walk.js` emitted.

## Self-Check: PASSED
- `src/page-walk.ts` — FOUND; `test/page-walk.mjs` — FOUND; `dist/page-walk.js` — FOUND
- Commits `5c365a8`, `9c5c5a5`, `3aad239` — all FOUND in git log

---
*Phase: 15-in-place-page-text-translation-triggers*
*Completed: 2026-06-22*
