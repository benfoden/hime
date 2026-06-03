---
phase: 08-api-integration-scaffold
plan: 02
subsystem: api
tags: [brave-search, fetch, transport, abortcontroller, typescript, mv3, host-permissions]

# Dependency graph
requires:
  - phase: 08-api-integration-scaffold (Plan 01)
    provides: SearchResult type, classifyBraveError classifier, search_quota ErrorKind, Settings.braveApiKey
provides:
  - BraveSearchClient class (src/brave-search.ts) with async search(query, apiKey, opts?) → SearchResult[]
  - BRAVE_ENDPOINT constant = https://api.search.brave.com/res/v1/web/search
  - Brave web.results[] → SearchResult mapping (verbatim url SERP-02, hostname + description fallbacks)
  - manifest.json host_permissions entry https://api.search.brave.com/* (MV3 CORS bypass)
affects: [08-message-handlers, 08-options-ui, 09-serp-renderer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Provider-class isolation: all Brave fetch logic lives in src/brave-search.ts, keeping background.ts a thin dispatcher (mirrors src/providers/openai.ts)"
    - "AbortController + setTimeout(15s) cleared in finally for bounded requests (analog: OpenAIProvider)"
    - "URL.searchParams.set for all query params — auto-encodes user input, no manual interpolation (T-08-04)"
    - "Verbatim url carry-through in mapBraveResult — never reassign/re-encode (SERP-02)"

key-files:
  created:
    - src/brave-search.ts
  modified:
    - manifest.json
    - test/unit.mjs

key-decisions:
  - "result_filter=web always set to suppress news/videos/etc. (RESEARCH Pitfall 6)"
  - "text_decorations deliberately NOT set — Phase 8 returns raw description, Phase 9 strips (Pitfall 2)"
  - "No auto-retry on 429 — classify to search_quota and throw (D-07)"
  - "hostname falls back to new URL(url).hostname when meta_url.hostname absent; description falls back to '' (never undefined)"

patterns-established:
  - "BraveSearchClient is the single Brave transport consumed by the Plan 03 searchTranslated/testBraveKey handlers"
  - "Failure paths attach .kind (and .status on HTTP errors) to the thrown Error for downstream discrimination"

requirements-completed: [SRCH-04]

# Metrics
duration: 5 min
completed: 2026-06-03
---

# Phase 8 Plan 02: Brave Search Transport Summary

**Isolated BraveSearchClient that performs a single authenticated GET against the Brave web-search endpoint, maps web.results[] to SearchResult[] with verbatim URLs (SERP-02), classifies 429→search_quota / 401→auth / network failures via classifyBraveError, and the manifest host_permissions entry that lets the MV3 worker reach the endpoint.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-03T17:30:00Z (approx)
- **Completed:** 2026-06-03T17:35:00Z (approx)
- **Tasks:** 2 (Task 2 TDD)
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- `src/brave-search.ts` created: `BraveSearchClient.search(query, apiKey, opts?)` builds the request via `new URL` + `searchParams.set` (q, count, result_filter=web, optional search_lang), uses a 15s AbortController, and sends `X-Subscription-Token` + `Accept: application/json` headers. Never sets `text_decorations`; never logs the key.
- `web.results[]` → `SearchResult[]` mapping: `url` carried byte-for-byte (SERP-02), `hostname` falls back to `new URL(url).hostname`, `description` falls back to `''`, optional `faviconUrl` from `meta_url.favicon ?? profile.img`. Empty/absent results → `[]`.
- Failure classification via the Plan-01 `classifyBraveError`: fetch throw (TypeError/AbortError) → `network`; `!response.ok` with 429 → `search_quota`, 401/403 → `auth`, other → `unknown` — `.kind` (and `.status`) attached to the thrown Error. No 429 auto-retry (D-07).
- `manifest.json` host_permissions extended with `https://api.search.brave.com/*` so the MV3 service worker fetch bypasses CORS (RESEARCH Pitfall 1).
- 10 new mocked-fetch tests covering mapping, verbatim url, hostname/description fallbacks, empty results, header/param assertions, and 429/401/network rejections.

## Task Commits

1. **Task 1: Add Brave host_permissions to manifest.json** — `47ec88e` (feat)
2. **Task 2: Implement BraveSearchClient (TDD)**
   - `03e5a9c` (test, RED) — failing BraveSearchClient mocked-fetch tests
   - `d944e5c` (feat, GREEN) — BraveSearchClient + BRAVE_ENDPOINT + mapping

**Plan metadata:** committed with this SUMMARY.

_No refactor commit — the GREEN implementation was minimal and clean._

## Files Created/Modified
- `src/brave-search.ts` — NEW: `BRAVE_ENDPOINT` constant + `BraveSearchClient` class + internal `BraveWebResult` type + `mapBraveResult`. The isolated Brave transport.
- `manifest.json` — added `https://api.search.brave.com/*` to `host_permissions` (the three existing LLM entries untouched).
- `test/unit.mjs` — 10 BraveSearchClient assertions reusing the existing `withFetch` mock helper.

## Decisions Made
- Followed plan decisions D-07 (no 429 retry) and Pitfalls 2 (no text_decorations) / 6 (result_filter=web) as specified. No new decisions introduced.
- Minor wording tweak to a code comment so the literal `result_filter` token appears exactly once in `src/brave-search.ts` (satisfies the acceptance-criterion grep gate `== 1` cleanly without changing behavior).

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0.
**Impact on plan:** None. All acceptance criteria and plan verification passed on first implementation.

## Threat Mitigations Applied
- **T-08-03 (apiKey in logs):** zero `console.log` in `src/brave-search.ts` (grep gate confirms 0); the key, header object, and tokenized URL are never logged.
- **T-08-04 (q tampering):** URL built only via `url.searchParams.set()` — auto-encodes; no manual string interpolation of user input.
- **T-08-05 (429 DoR):** no auto-retry on 429; single 15s AbortController bounds hung requests.

## Issues Encountered
None — TDD RED (module-not-found for all 10 tests) → GREEN (all pass) proceeded as expected.

## Known Stubs
None. `faviconUrl` is optional and populated when Brave provides it; absence is the intended contract, not a stub.

## TDD Gate Compliance
Task 2 recorded a `test(...)` commit (`03e5a9c`, RED) followed by a `feat(...)` commit (`d944e5c`, GREEN) in git history. Gate sequence satisfied.

## User Setup Required
None — no external service configuration required in this plan. (Brave API key acquisition is surfaced in a later plan's user setup; the options UI and live key-test handler are Plan 03/04 concerns.)

## Next Phase Readiness
- `BraveSearchClient` + `BRAVE_ENDPOINT` are exported and ready for the Plan 03 `searchTranslated` / `testBraveKey` background handlers (in-flight dedup, source==target short-circuit, message wiring).
- `tsc --noEmit` clean; full suite 92/92 green; manifest valid with the Brave endpoint listed.
- No blockers.

## Self-Check: PASSED
- Files exist: `src/brave-search.ts` (FOUND), `manifest.json` (FOUND), `test/unit.mjs` (FOUND)
- Commits exist: `47ec88e`, `03e5a9c`, `d944e5c` (all in git log)
- `npx tsc --noEmit`: No errors
- Full suite: 92 tests, 92 pass, 0 fail
- manifest.json: valid JSON, `https://api.search.brave.com/*` present in host_permissions

---
*Phase: 08-api-integration-scaffold*
*Completed: 2026-06-03*
