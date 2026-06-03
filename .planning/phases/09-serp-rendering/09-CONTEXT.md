# Phase 9: SERP Rendering - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a static, bundled `search.html` page that renders a classic Google-style,
XSS-safe SERP from a **fixed mock `SearchResult[]`** — no live data, no message wiring,
no translation. The page must cover every display state a user can hit: populated
results, skeleton loading, empty results, and four distinct error variants
(missing/invalid Brave key, network failure, quota-exceeded/429, generic).

Covers requirements **SERP-01..05**. Out of scope: live `searchTranslated` wiring,
the query box / disclosure line / popup entry (SRCH-01/02/03 — Phase 11), and the LLM
result-translation pipeline (XLT-* — Phase 10). Phase 9 renders raw mock values; the
translated-text overlay arrives in Phase 10. Build stays plain `tsc` + copy-assets —
adding `search.ts`/`search.html`/`search.css` requires no bundler/config change.

</domain>

<decisions>
## Implementation Decisions

User directive: **accept all recommended defaults, keep it minimal, go fast.** The five
SERP requirements + ROADMAP success criteria are tight; the four gray areas below are
locked to their recommended (privacy-first, framework-free, minimal) options.

### Favicon source (privacy-first)
- **D-01:** **No external favicon service.** A translation tool must not leak every result
  hostname to a third party (Google s2, DuckDuckGo icons all do). Render
  `SearchResult.faviconUrl` only if Brave already provided one in the mock; otherwise show a
  **generic CSS letter-tile fallback** (first letter of `hostname` on a colored chip). No
  network request per row, no new host permission. Keeps SERP-01 (favicon + hostname) satisfied
  without a privacy regression.

### State-exercise harness
- **D-02:** Make all 7 states viewable via a **`?state=` URL query param** on `search.html`
  (`populated` default, plus `skeleton|empty|key|network|quota|generic`) that selects a fixed
  mock from a small mock module. Default (no param) = populated. The mock set MUST include a
  row whose `description` contains `<script>alert(1)</script>` and `<strong>` markup so SERP-03
  XSS-safety is directly exercisable. This is dev/verification-only — Phase 11 replaces the
  param-driven mock with the live `searchTranslated` round-trip.

### Render architecture (vanilla, XSS-safe)
- **D-03:** Single **`render(state)` dispatcher** driven by a discriminated-union `SerpState`
  type (`loading | populated | empty | error{kind}`). Build DOM with `createElement` +
  `textContent` helpers — **never `innerHTML`** for any Brave-derived field (title, snippet,
  hostname). `href` is set from `SearchResult.url` **verbatim** (SERP-02 — no mutation/encode/
  proxy). One render path swaps page content per state; sets the pattern Phase 11 wires the
  live response into.

### Design fidelity & styling
- **D-04:** Google-style **layout** (favicon + hostname line, clickable translated title,
  snippet block) but **hime's own aesthetic**, not a pixel-clone of Google. Dedicated
  `search.css` reusing existing `options.css` design tokens (colors/spacing/font) for
  consistency; light theme to match current surfaces. This is a **seed** — a
  `shipyard:mockup-gallery` pass runs before `plan-phase` to settle the exact visual direction,
  and the locked gallery briefing supersedes the look-and-feel specifics here.

### Claude's Discretion
- Exact mock-data location (inline export in `search.ts` vs a separate `search-mock.ts`
  module) — planner's call; lean toward a separate module so the node test harness can import
  the same mocks.
- Skeleton-row count and shimmer styling, error-message exact wording (must stay
  human-readable and distinct per SERP-05; 429 reads "search quota exceeded").
- Whether `search.html` is registered as a `web_accessible_resource` now or deferred to
  Phase 11 (it is only opened via `chrome.tabs.create` in Phase 11).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §"Results SERP (SERP)" — SERP-01..05 verbatim (favicon+hostname,
  verbatim href, XSS-safe text, skeleton, distinct error states).
- `.planning/ROADMAP.md` §"Phase 9: SERP Rendering" — goal + 5 success criteria.

### Locked type contract (Phase 8)
- `src/types.ts` — `SearchResult` interface (lines ~92-104): `title`, `url` (verbatim, never
  mutated), `description` (raw Brave HTML — strip to plain text via `textContent`, SERP-03),
  `hostname`, `faviconUrl?`. `SearchTranslatedResponse` shape for Phase 11 wiring.
- `.planning/phases/08-api-integration-scaffold/08-CONTEXT.md` — D-01 SearchResult rationale,
  D-07 error model (`ClassifiedError`/`ErrorKind`, 429→"search quota exceeded").

### Existing code (patterns to reuse — see code_context)
- `src/options.html` + `src/options.css` — page scaffold + design tokens to reuse for `search.css`.
- `src/errors.ts` — `ErrorKind` taxonomy; map each kind → a distinct SERP-05 error state.
- `package.json` `copy-assets` — html/css are copied to `dist/` as-is; `search.*` just needs adding.

### Verification
- Per project memory: verify via the node harness against `dist/`, **never the service-worker
  console**. The `?state=`/mock module must be importable so a node test can assert XSS-safe
  `textContent` rendering and verbatim hrefs.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/options.html`/`options.css`: page structure (`.container`, `.form-group`), color/spacing
  tokens, button/status styling — clone tokens into `search.css`.
- `src/types.ts` `SearchResult`: the exact render input; mock must conform to it.
- `src/errors.ts` `ErrorKind`: enumerates the failure modes that map to SERP-05 error states.

### Established Patterns
- No framework / no bundler: each page = `*.html` + a compiled `*.js` from `src/*.ts`, copied to
  `dist/` by `copy-assets`. `search.ts` compiles automatically under `tsc`.
- XSS discipline already in repo (Phase 5/8 sanitize Brave/LLM output) — extend with
  textContent-only rendering here.

### Integration Points
- Phase 11 swaps the `?state=` mock driver for the live `searchTranslated` worker response,
  reusing the same `render(state)` dispatcher and `SerpState` union.

</code_context>

<specifics>
## Specific Ideas

- Mock set MUST contain a `<script>alert(1)</script>` + `<strong>` snippet row to make SERP-03
  XSS-safety directly testable (success criterion 3).
- 429 error state copy reads "search quota exceeded" and offers no auto-retry (matches Phase 8
  error model).

</specifics>

<deferred>
## Deferred Ideas

- Live query box, source→target query translation, read-only disclosure line, popup entry —
  Phase 11 (SRCH-01/02/03).
- Result title/snippet translation overlay — Phase 10 (XLT-*).
- Dark theme / theme toggle — not in v1.2 scope; revisit post-milestone if desired.

</deferred>

---

*Phase: 9-SERP Rendering*
*Context gathered: 2026-06-03*
