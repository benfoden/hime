# Phase 8: API Integration Scaffold - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a complete Brave Search round-trip inside the background service worker, before
any search UI exists. The worker receives a `searchTranslated` message, fetches web results
with the user's stored Brave key (BYOK), and returns a raw result array — with every error
and edge path handled: HTTP 429 quota, other network failures, missing/invalid key,
source==target short-circuit, and submit debounce/dedup. Also: the options page gains a
Brave key field + a "Test Brave Key" action.

Covers requirements **SRCH-04, SRCH-05, SRCH-06, SSET-01, SSET-02, XLT-01**. The search page
UI (SRCH-01/02/03, Phase 11), SERP rendering (SERP-*, Phase 9), and the LLM translation
pipeline (XLT-02..05, Phase 10) are out of scope — Phase 8 only establishes the message
contract and the live Brave fetch behind it. No translation of results happens here.

</domain>

<decisions>
## Implementation Decisions

Discussion was skipped — requirements + success criteria in ROADMAP/REQUIREMENTS are tight.
These four decisions are the recommended defaults the user approved for context capture.

### Message contract scope
- **D-01:** Define the **full `SearchResult` type now**, not a thin raw-Brave passthrough.
  Phase 9 (SERP rendering) declares a hard dependency on "the SearchResult type contract
  established" by Phase 8, so the shape must be locked here. Minimum fields per result:
  `title`, `url` (verbatim Brave URL, never mutated — SERP-02), `description` (raw Brave HTML
  snippet), `hostname` (derived for favicon/display). Translated overlays (Phase 10) are
  additive later; Phase 8 returns raw Brave values in these fields.
- **D-02:** `searchTranslated` follows the existing `onMessage` switch-dispatch pattern in
  `background.ts`: a new `MessageType` member + a typed message interface in `types.ts`, a new
  `case 'searchTranslated'` in the listener. Response shape mirrors the established
  `{ data | error, kind }` convention (success returns `{ results: SearchResult[], direct?:
  boolean }`; failure returns `{ error, kind }`).

### Brave key storage
- **D-03:** Store the Brave key as a **separate top-level `Settings` field**
  (`braveApiKey: string`), NOT inside the existing `apiKeys` map. `apiKeys` is keyed by LLM
  *provider* (openai/gemini/openrouter) and feeds the provider abstraction; Brave is a search
  provider, not in that union. Keeping it separate avoids polluting the provider type and the
  provider-selection UI. Stored in `chrome.storage.local` under `himeSettings` like the rest.

### Brave Test Connection
- **D-04:** Add a **separate "Test Brave Key" button** with its own status line in the options
  page, parallel to (not folded into) the existing LLM "Test Connection" button — they
  validate different services. Validation = a **minimal live Brave query** (e.g. `q=test`,
  1 result) routed through the background worker (XLT-01: the key is never read from the page).
  Surfaces the same human-readable outcomes: valid / invalid key / quota / network error, and
  a "key required" message when the field is empty (SSET-02).

### Debounce / dedup (SRCH-06)
- **D-05:** Enforce dedup **background-side, keyed on the normalized query string**: while a
  Brave request for a given query is in flight, a duplicate `searchTranslated` for the same
  query does not issue a second Brave call (returns/awaits the in-flight result). This is the
  "enforced by the message contract" guarantee in the success criteria. The page-level ~1s
  input debounce (SRCH-06 UX) lives in Phase 11's search page; Phase 8 owns only the
  contract-level duplicate-suppression so rapid calls can't burn the ~1 req/s Brave free tier.

### source==target short-circuit (SRCH-05)
- **D-06:** When the configured source language == target language, the handler skips all
  translation paths and runs the Brave search directly, returning a flag in the response
  (`direct: true`) so downstream phases can show the "searched directly in {language}" notice.
  In Phase 8 there is no translation yet, but the flag and the short-circuit branch are
  established now since SRCH-05 is a Phase 8 requirement.

### Error model
- **D-07:** Reuse the existing `errors.ts` `ClassifiedError` / `ErrorKind` taxonomy. Map Brave
  **HTTP 429 → a distinct kind that reads "search quota exceeded"** and does **not auto-retry**
  (success criterion 4). Other network failures return a separate, distinct error state. Add a
  Brave-specific `ErrorKind` member only if no existing kind fits cleanly.

### Claude's Discretion
- Exact Brave endpoint path, query params (count, country, safesearch defaults), and response
  JSON field mapping are implementation details for research/planning.
- Whether in-flight dedup is a `Map<query, Promise>` or a timestamp guard — planner's call.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — v1.2 SRCH/SERP/XLT/SSET requirements; §"Out of Scope (v1.2)"
  (Brave only, no other providers); §SRCH-04/05/06, SSET-01/02, XLT-01 are Phase 8's scope.
- `.planning/ROADMAP.md` §"Phase 8: API Integration Scaffold" — goal, success criteria,
  dependency note that Phase 9 needs the SearchResult contract from here.

### Existing code (patterns to reuse — see code_context)
- `src/background.ts` — `onMessage` switch dispatch, `getSettings()`, `{error, kind}` responses.
- `src/types.ts` — `Message` / `MessageType` union, `Settings` interface, provider types.
- `src/options.ts` + `src/options.html` — Test Connection button + status-div pattern, key storage.
- `src/errors.ts` — `ClassifiedError` / `ErrorKind` taxonomy for the error model.

### External (Brave Search API)
- Brave Search API docs — endpoint, `X-Subscription-Token` header auth (BYOK), 429 semantics,
  free tier limits (~1 req/s, ~1k/mo). To be pinned by the phase researcher.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `background.ts` `onMessage` listener (line ~121): switch-on-`message.type` with an async
  IIFE and `return true` to keep the channel open — `searchTranslated` adds one more `case`.
- `getSettings()` (background.ts ~34): reads `himeSettings` from `chrome.storage.local`; the
  Brave key lives in the same settings blob.
- `options.ts`: `testConnectionBtn` + `testStatusDiv` + load/save against `himeSettings` —
  clone this pattern for the Brave key field and Test Brave button.
- `errors.ts`: `ClassifiedError` / `ErrorKind` — extend for 429/quota classification.

### Established Patterns
- All network calls go through the background worker (already true for translate/predict); the
  page never holds API keys — XLT-01 is consistent with this existing architecture.
- Response convention: `{ <data> }` on success, `{ error, kind }` on failure.
- Settings persisted as one `himeSettings` object in `chrome.storage.local`.

### Integration Points
- New `MessageType` + message interface in `types.ts`; new `case` in `background.ts`.
- New `SearchResult` type in `types.ts` (consumed by Phase 9 renderer).
- New `braveApiKey` field on `Settings`; new options-page field + Test Brave button.

</code_context>

<specifics>
## Specific Ideas

- 429 must read literally as "search quota exceeded" and must NOT auto-retry (success criterion 4).
- Brave free tier is ~1 req/s / ~1k per month — the in-flight dedup exists specifically to not
  waste that budget on duplicate submits.
- `<strong>` highlight stripping / XSS handling of Brave snippets is Phase 9, not here — Phase 8
  returns raw `description` HTML untouched.

</specifics>

<deferred>
## Deferred Ideas

- Auto-detect source language — explicitly out of scope for v1.2 (uses the settings value).
- Non-Brave search providers — Brave only for v1.2; a provider abstraction can come later.
- Page-level ~1s input debounce UX — Phase 11 (search page), not Phase 8.

</deferred>

---

*Phase: 8-API Integration Scaffold*
*Context gathered: 2026-06-03*
