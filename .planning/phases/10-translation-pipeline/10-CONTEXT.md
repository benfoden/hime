# Phase 10: Translation Pipeline - Context

**Gathered:** 2026-06-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the LLM result-translation pipeline that overlays translated titles and
snippets onto the raw Brave results from Phase 8, rendered through the Phase 9
SERP renderer — robust to model misbehavior and partial failure. A single batched
LLM call translates all results via a keyed-JSON object; a count assertion makes
mismatches fall back to raw per-item (never blank, never mismapped); and the page
renders progressively (skeleton → raw Brave → translated overlay) so a slow or
failed translation still leaves usable untranslated results.

Covers requirements **XLT-02, XLT-03, XLT-04, XLT-05**. Out of scope: the search
page query box / disclosure line / debounce / popup entry (SRCH-01/02/03 — Phase
11), the Brave fetch + `searchTranslated` contract itself (Phase 8, reused as-is),
and the SERP DOM rendering (Phase 9, reused as-is). Phase 10 adds the translation
message + the page-side 3-stage orchestration that drives the existing renderer.

</domain>

<decisions>
## Implementation Decisions

User selected all four gray areas to lock; the two with real forks were chosen
explicitly, the remaining two are locked to their recommended (req-determined)
defaults. Consistent with the Phase 8/9 directive: minimal, fast, robust defaults.

### Data-flow / message contract
- **D-01:** **Two-message flow.** Phase 8's `searchTranslated` stays unchanged —
  it returns **raw** Brave `SearchResult[]`. Phase 10 adds a **new
  `translateBatch` message**: the page sends the raw `title`/`description` pairs
  (keyed), the worker returns keyed translations, and the **page** overlays them
  and re-renders. The page therefore owns the three visible stages (skeleton →
  raw → translated); the worker stays a stateless request/response handler. This
  keeps each message a single request/response (no long-lived port, no SW
  lifecycle complexity) and gives Phase 11 a clean two-call contract to wire.
  *(Rejected: long-lived `chrome.runtime` port streaming raw-then-translated —
  more SW teardown complexity; fold-into-one-response — loses the "raw
  immediately" stage and violates success criterion 3.)*

### Keyed-JSON shape (XLT-02 / XLT-04)
- **D-02:** **Single batched call** with a **nested per-index keyed object**:
  `{"0":{"t":<title>,"d":<description>}, "1":{...}, …}`. Only `title` and
  `description` are ever placed in the prompt — `url`, `hostname`, and
  `faviconUrl` are **never** sent to translation (XLT-04). The LLM is instructed
  to return the **same key set and shape**. Reuse the existing
  `TranslationProvider.translate(text, …)` abstraction by passing the keyed-JSON
  as the `text` payload and parsing the JSON reply — no new provider method
  unless research shows the existing one can't carry a JSON-mode/system
  instruction cleanly (planner's call).

### Count-assertion granularity (XLT-03)
- **D-03:** **Per-item fallback.** After parsing the reply, assert each input key
  has a corresponding well-formed `{t,d}` entry. Missing keys, extra/unexpected
  keys, or malformed entries cause **only the affected items** to display their
  original raw `title`/`description`; valid keys still show their translation.
  A whole-batch parse failure (non-JSON reply) degrades **every** item to raw.
  Never blank, never mismapped (XLT-03).

### Timeout / failure handling (XLT-05)
- **D-04:** **Explicit `AbortController` timeout (~8s)** on the `translateBatch`
  LLM call. On timeout OR any translation error, the worker returns an error and
  the page **keeps the already-rendered raw stage** — no blank, no errored page.
  The raw Brave stage is always rendered first and is never torn down by a
  translation failure (success criterion 4).

### Overlay rendering (no renderer change)
- **D-05:** The translated overlay re-uses the Phase 9 renderer unchanged. The
  page merges the keyed translations into a **new `SearchResult[]`** (translated
  `title`/`description`, raw `url`/`hostname`/`faviconUrl` carried verbatim) and
  re-calls `renderSerp({ kind: 'populated', results }, …)`. The renderer already
  renders whatever `SearchResult` values it is given (Phase 9 D-03) — "accepts
  both raw and translated" needs no new code path.

### Claude's Discretion
- Exact prompt wording / system instruction, whether to request provider JSON
  mode, and how the keyed-JSON is escaped — research/planning detail.
- Whether `translateBatch` lives as a new `MessageType` case mirroring the
  `translate` case, and the precise response interface name — planner's call,
  following the established `{ data | error, kind }` convention.
- Batch size handling if a result set ever exceeds a sane token budget (current
  Brave `count: 10` makes this a non-issue now) — note only.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — XLT-02 (keyed-JSON single batched call), XLT-03
  (count assertion → raw fallback), XLT-04 (only title/description translated),
  XLT-05 (progressive render survives timeout/failure).
- `.planning/ROADMAP.md` §"Phase 10: Translation Pipeline" — goal + 4 success
  criteria; dependency notes (Phase 8 handler/provider, Phase 9 renderer).

### Prior phase context (locked contracts this phase consumes)
- `.planning/phases/08-api-integration-scaffold/08-CONTEXT.md` — `searchTranslated`
  contract, `SearchResult` type, `{error, kind}` response convention, provider
  abstraction, `direct` short-circuit flag.
- `.planning/phases/09-serp-rendering/09-CONTEXT.md` — `SerpState` union,
  `renderSerp` dispatcher, XSS-safe `textContent` rendering, `?state=` harness.

### Existing code (patterns to reuse — see code_context)
- `src/background.ts` — `onMessage` switch dispatch; `translate` case (~138) is
  the closest analog for a new `translateBatch` case; `translateText()` (~78)
  shows provider+settings wiring.
- `src/types.ts` — `MessageType` union, `Message`/`TranslateMessage`,
  `SearchResult`, `SearchTranslatedResponse`, `TranslationProvider.translate`.
- `src/serp-render.ts` — `SerpState`, `renderSerp(state, doc, mount)` (overlay
  path re-renders `populated` with translated results — no change needed).
- `src/search.ts` — page entry that calls `renderSerp`; Phase 11 wires the live
  two-call flow here, but the 3-stage orchestration pattern is established now.
- `src/prompt.ts` + `src/{openai,gemini,openrouter}.ts` — provider `translate()`
  implementations + prompt construction to model the keyed-JSON prompt on.

### External
- Provider API docs (OpenAI/Gemini/OpenRouter) for JSON-mode/structured-output
  options, if the planner chooses to request strict JSON — to be pinned by the
  phase researcher only if D-02's "reuse translate(text)" proves insufficient.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `background.ts` `case 'translate'` (~138) — exact shape to clone for
  `translateBatch`: read settings, call provider, `sendResponse`, classify
  errors into `{ error, kind }`, `return true` to keep the channel open.
- `translateText()` (background.ts ~78) — resolves provider + config + apiKey +
  model from settings and calls `provider.translate(...)`. The batch path wraps
  the same call with a keyed-JSON payload + AbortController.
- `TranslationProvider.translate(text, config, apiKey, model)` (types.ts ~46) —
  single-string contract reused by passing keyed-JSON as `text`.
- `serp-render.ts` `renderSerp` — re-render `populated` with the merged
  translated `SearchResult[]` for the overlay stage; no renderer edits.
- `errors.ts` `ClassifiedError`/`ErrorKind` — reuse for translation-call
  timeout/failure classification (translation failure must NOT blank the page).

### Established Patterns
- Worker → page replies follow `{ data | error, kind }`; success/failure are
  discriminated by presence of `error`.
- Page renders state via the `SerpState` discriminated union; progressive stages
  are successive `renderSerp` calls (loading → populated raw → populated
  translated).
- All Brave-derived text is rendered via `textContent` (never `innerHTML`); the
  translated overlay text inherits the same XSS-safe path (Phase 9 contract).

</code_context>
