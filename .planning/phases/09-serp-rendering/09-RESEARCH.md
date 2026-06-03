# Phase 9: SERP Rendering - Research

**Researched:** 2026-06-03
**Domain:** Vanilla-TS XSS-safe DOM rendering for a bundled MV3 extension page; node-test DOM harness
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 — Favicon (privacy-first):** NO external favicon service (no Google s2 / DuckDuckGo icons). Render `SearchResult.faviconUrl` only if Brave already provided one in the mock; otherwise show a generic CSS letter-tile fallback (first letter of `hostname` on a colored chip). No network request per row, no new host permission.
- **D-02 — State-exercise harness:** All 7 states viewable via a `?state=` URL query param on `search.html` (`populated` default, plus `skeleton|empty|key|network|quota|generic`) selecting a fixed mock from a small mock module. Default (no param) = populated. The mock set MUST include a row whose `description` contains `<script>alert(1)</script>` and `<strong>` markup so SERP-03 XSS-safety is directly exercisable. Dev/verification-only — Phase 11 replaces the param-driven mock with the live `searchTranslated` round-trip.
- **D-03 — Render architecture (vanilla, XSS-safe):** Single `render(state)` dispatcher driven by a discriminated-union `SerpState` type (`loading | populated | empty | error{kind}`). Build DOM with `createElement` + `textContent` helpers — NEVER `innerHTML` for any Brave-derived field (title, snippet, hostname). `href` is set from `SearchResult.url` verbatim (SERP-02 — no mutation/encode/proxy). One render path swaps page content per state.
- **D-04 — Design fidelity & styling:** Google-style layout (favicon + hostname line, clickable translated title, snippet block) but hime's own aesthetic. Dedicated `search.css` reusing existing `options.css` design tokens; light theme. This is a seed — a `shipyard:mockup-gallery` pass runs before plan-phase to settle exact visual direction; the locked gallery briefing supersedes look-and-feel specifics here.

### Claude's Discretion
- Exact mock-data location (inline export in `search.ts` vs separate `search-mock.ts` module) — lean toward a separate module so the node test harness can import the same mocks.
- Skeleton-row count and shimmer styling, error-message exact wording (must stay human-readable and distinct per SERP-05; 429 reads "search quota exceeded").
- Whether `search.html` is registered as a `web_accessible_resource` now or deferred to Phase 11 (it is only opened via `chrome.tabs.create` in Phase 11).

### Deferred Ideas (OUT OF SCOPE)
- Live query box, source→target query translation, read-only disclosure line, popup entry — Phase 11 (SRCH-01/02/03).
- Result title/snippet translation overlay — Phase 10 (XLT-*).
- Dark theme / theme toggle — not in v1.2 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SERP-01 | Each row shows favicon + hostname, a translated title that links to the result, and a translated snippet | Row-component pattern (§Architecture Pattern 2); favicon letter-tile fallback (§Pattern 4); D-01 |
| SERP-02 | Each result link `href` is the original Brave URL verbatim — never translated/mutated/proxied | `anchor.href = result.url` direct assignment, no `encodeURI`/`new URL()` round-trip (§Pitfall 3); node test asserts `getAttribute('href') === mock.url` |
| SERP-03 | Snippet/title rendered XSS-safely — Brave `description` HTML stripped to plain text; never `innerHTML` | textContent-only rendering (§Pattern 1); HTML-strip via `textContent` round-trip, NOT regex/DOMParser-into-DOM (§Pattern 3); node test injects `<script>` mock and asserts no `<script>` node + literal text (§Validation Architecture) |
| SERP-04 | Skeleton rows shown during async pipeline (no blank screen) | CSS-only shimmer skeleton (§Pattern 5); `loading` state in `SerpState` union |
| SERP-05 | Empty / invalid-or-missing key / network failure / quota-429 each show a distinct human-readable state; 429 = "search quota exceeded", no auto-retry | `error{kind}` branch keyed on `ErrorKind` from `src/errors.ts` (§Architecture); maps `auth→key`, `network→network`, `search_quota→quota`, `unknown→generic`, plus `empty` |
</phase_requirements>

## Summary

Phase 9 is a self-contained, framework-free rendering phase: build `search.html` + `search.ts` + `search.css`, compiled by the existing `tsc` + copy-assets pipeline with **zero config change** (verified: `tsconfig` already includes `lib: ["DOM"]` and `src/**/*`; `copy-assets` already globs `src/*.html src/*.css`). The only genuinely non-obvious engineering question is **how to node-test a DOM renderer in a repo with no DOM in node** — and the answer is to write the renderer DOM-environment-agnostic (it calls `createElement`/`textContent` on an injectable `document`) and have the node test provide a `document` via **linkedom**, the only new dependency this phase needs.

The XSS contract (SERP-03) is satisfied structurally, not by a sanitizer library: render every Brave-derived string with `textContent`/`createTextNode` and never touch `innerHTML`. To convert Brave's `<strong>`-laced `description` into plain text, use the **`textContent` round-trip** (assign raw HTML into a detached element's `textContent`, never `innerHTML`) — or simpler, since we only need to strip tags for display, set the snippet element's `textContent` directly to the raw description string (the browser renders `<strong>` as literal text, which is the correct, safe behavior; tags are escaped). Do NOT use `DOMParser`/`innerHTML` to "parse then extract text" — that re-introduces the parse step we are trying to avoid.

**Primary recommendation:** A separate `search-mock.ts` (exports `MOCKS: Record<SerpStateKey, SerpState>`), a DOM-agnostic `renderSerp(state, document)` in `search.ts` (or a `serp-render.ts` it imports), and a `test/serp.mjs` that imports both from `dist/` and runs them against a `linkedom` document — asserting (1) no `<script>` element exists anywhere in the rendered tree, (2) the malicious string appears verbatim as text, (3) every anchor `href` equals the mock URL byte-for-byte. Add `linkedom` as the single devDependency.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| State selection (`?state=`) | Browser / page entry (`search.ts`) | — | Pure client-side URL parsing; dev-only harness, replaced by message wiring in Phase 11 |
| Mock data | Static module (`search-mock.ts`) | — | Fixed fixtures; importable by both page and node test |
| DOM construction / `render(state)` | Browser / page (`serp-render.ts`) | node test (via injected `document`) | Renderer is the unit under test; must be DOM-agnostic so node can drive it |
| XSS-safe text handling | Renderer (`textContent` only) | — | Structural guarantee in render code, not a downstream sanitizer |
| Styling tokens | Static CSS (`search.css`) | reuse `options.css` tokens | No JS involvement; copy-assets ships it as-is |
| Error→state mapping | Renderer consumes `ErrorKind` from `src/errors.ts` | worker (Phase 11) | Phase 9 maps the *existing* taxonomy to UI copy; worker produces the kind in Phase 11 |

**Note:** This phase has NO API/backend, NO message-passing, and NO network tier. Everything is browser-page + a node test that drives the same code. Phase 11 later adds the worker round-trip behind the same `render(state)` seam.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ^5.2.2 (already present) | Compile `search.ts` → `dist/search.js` | Existing build; no change |
| (no runtime framework) | — | Vanilla DOM | D-03 mandates createElement/textContent; matches every other page in this repo (options, popup, content) |

### Supporting (test-only)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `linkedom` [ASSUMED — discovered via web search, registry-confirmed but not via official docs index] | 0.18.12 | Provide a `document`/`window` to the renderer under `node --test`, so XSS-safety and verbatim hrefs can be asserted without a browser | Only in `test/serp.mjs`; never shipped to `dist/` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| linkedom | jsdom (29.1.1) | Heavier (23 deps, full spec, executes scripts when configured). Overkill for tree-inspection; slower install. For a no-bundler repo, linkedom's 5 pure-JS deps and zero native bindings are a better fit. |
| linkedom | happy-dom (20.9.0) | Faster than jsdom, but larger surface than needed; primarily aimed at running app code, not SSR-style tree inspection. |
| linkedom | hand-rolled DOM shim | A minimal `createElement`/`textContent` stub cannot faithfully reproduce HTML-parsing/escaping semantics, so it would not actually prove XSS-safety. Reject — defeats the purpose of the test. |
| linkedom in test | Inject `document` param into renderer | Both are needed together: the renderer takes an injectable `document` AND the test supplies linkedom's. This is the architecture, not an alternative. |

**Installation:**
```bash
npm install --save-dev linkedom
```
→ adds the only new dependency this phase requires; test-only, never bundled.

**Version verification (2026-06-03):**
- `linkedom` 0.18.12 — last published 2025-08-21, ~2.7M downloads/week, repo `github.com/WebReflection/linkedom`, 5 pure-JS deps, no native bindings. `[VERIFIED: npm registry]` for existence/version; package *choice* is `[ASSUMED]` per provenance rule (discovered via web search, not an authoritative docs index).
- `jsdom` 29.1.1 (2026-04-30), ~74M/wk — verified, listed only as alternative.
- `happy-dom` 20.9.0 (2026-04-13), ~9.2M/wk — verified, listed only as alternative.

## Package Legitimacy Audit

> slopcheck was **not installable** in this environment. Per the legitimacy protocol's graceful-degradation rule, the new package is tagged `[ASSUMED]` and the planner SHOULD gate its install behind a `checkpoint:human-verify` task (or accept it as a well-known, manually-verified package — see download/age evidence below).

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| linkedom | npm | published 2015→; v0.18.12 from 2025-08-21 | ~2.72M/wk | github.com/WebReflection/linkedom | unavailable | Approved (manual evidence) — tag `[ASSUMED]`, planner may add checkpoint |
| jsdom | npm | mature | ~74M/wk | github.com/jsdom/jsdom | unavailable | Alternative only (not installed) |
| happy-dom | npm | mature | ~9.25M/wk | github.com/capricorn86/happy-dom | unavailable | Alternative only (not installed) |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
**Postinstall check:** linkedom has no postinstall script (pure-JS package, no native build step). Low supply-chain risk; widely used by WebReflection (author of many established libs).

## Architecture Patterns

### System Architecture Diagram

```
                    search.html  (static, ships as-is via copy-assets)
                        │  <script type="module" src="search.js">
                        ▼
   ┌─────────────────────────────────────────────────────────┐
   │  search.ts  (page entry — DOM-COUPLED, browser only)      │
   │   1. read ?state= from location.search                    │
   │   2. look up MOCKS[stateKey]  (default → 'populated')     │
   │   3. renderSerp(state, document, mountEl)                 │
   └───────────────┬───────────────────────────┬──────────────┘
                   │ imports                    │ imports
                   ▼                            ▼
   ┌───────────────────────────┐   ┌──────────────────────────────────┐
   │ search-mock.ts             │   │ serp-render.ts                    │
   │  MOCKS: Record<key,        │   │  renderSerp(state, doc, mount)    │  ◄── UNIT UNDER TEST
   │    SerpState>              │   │  (DOM-AGNOSTIC: uses passed `doc`)│
   │  - populated (incl. XSS    │   │  switch(state.kind):              │
   │    + <strong> row)         │   │    loading  → skeleton rows       │
   │  - empty / 4 error kinds   │   │    populated→ result rows          │
   └───────────────────────────┘   │    empty    → empty notice        │
                   ▲                │    error    → kind-keyed message  │
                   │                │  ALL text via textContent only    │
                   │ imports        │  href = result.url verbatim       │
   ┌───────────────┴────────────────┴──────────────────────────────────┐
   │  test/serp.mjs   (node --test, runs against dist/)                  │
   │   import { renderSerp } from dist/serp-render.js                    │
   │   import { MOCKS }      from dist/search-mock.js                    │
   │   const { document } = parseHTML('<!doctype html><body>')  ← linkedom
   │   renderSerp(MOCKS.populated, document, document.body)              │
   │   assert: no <script> node; malicious string is text; href verbatim │
   └────────────────────────────────────────────────────────────────────┘

   (Phase 11 later) background worker → searchTranslated → SerpState
                    replaces step 1-2 of search.ts; renderSerp unchanged.
```

The renderer is decoupled from how the state arrives. In Phase 9 the state comes from a `?state=` lookup; in Phase 11 it comes from a worker message. The `renderSerp` seam is identical in both — that is the whole point of D-03's single dispatcher.

### Recommended Project Structure
```
src/
├── search.html         # new — page shell + <div id="results"> mount, <script src="search.js">
├── search.css          # new — light theme, reuses options.css token *values*
├── search.ts           # new — page entry: parse ?state=, pick mock, call renderSerp
├── serp-render.ts      # new — DOM-agnostic renderSerp(state, doc, mount) + SerpState union
└── search-mock.ts      # new — MOCKS fixtures (Discretion: separate so test can import)
test/
└── serp.mjs            # new — node --test harness using linkedom
```
Splitting `serp-render.ts` from `search.ts` is recommended: `search.ts` necessarily references `location`/`window` (browser-only globals), while `serp-render.ts` stays pure (only touches the `document` it is handed). Importing `search.ts` in node would touch `location`; importing `serp-render.ts` does not. Keep the unit-under-test free of browser globals.

### Pattern 1: textContent-only element factory (XSS-safe by construction)
**What:** A tiny helper that builds an element and sets text via `textContent`, never `innerHTML`.
**When to use:** Every Brave-derived string (title, snippet, hostname).
```typescript
// serp-render.ts
function el(
  doc: Document,
  tag: string,
  opts: { text?: string; className?: string } = {},
): HTMLElement {
  const node = doc.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.text !== undefined) node.textContent = opts.text; // NEVER innerHTML
  return node;
}
```
Because `textContent` assigns a literal string, any `<script>` / `<strong>` in the value becomes visible text — the browser does not parse it. This is the entire SERP-03 guarantee.

### Pattern 2: Result row (SERP-01 / SERP-02)
```typescript
function resultRow(doc: Document, r: SearchResult): HTMLElement {
  const row = el(doc, 'div', { className: 'serp-row' });

  const head = el(doc, 'div', { className: 'serp-head' });
  head.appendChild(faviconEl(doc, r));                 // Pattern 4
  head.appendChild(el(doc, 'span', { text: r.hostname, className: 'serp-host' }));
  row.appendChild(head);

  const a = doc.createElement('a');
  a.href = r.url;                       // VERBATIM — no encodeURI, no new URL() (SERP-02)
  a.textContent = r.title;              // text, not innerHTML
  a.className = 'serp-title';
  a.rel = 'noopener noreferrer';        // safe external link hygiene
  row.appendChild(a);

  row.appendChild(el(doc, 'p', { text: stripToText(r.description), className: 'serp-snippet' }));
  return row;
}
```

### Pattern 3: Strip Brave HTML to plain text — the SAFE way
**What:** Brave `description` may contain `<strong>` (and could contain anything). We need display text with tags removed/neutralized.
**The chosen safe approach:** assign the raw string straight to `textContent`. This neutralizes tags (they render as literal characters) with zero parsing. If product wants tags *removed* rather than *shown as literal text*, decode via a `textContent` round-trip — but NEVER via `innerHTML`/`DOMParser`-into-live-DOM.
```typescript
// Option A (simplest, fully safe): show tags as literal text.
snippet.textContent = r.description; // <strong>x</strong> shows as "<strong>x</strong>"

// Option B (strip tags for cleaner display, still safe — no innerHTML):
// Use the worker/Phase-8 layer or a regex ONLY for tag *removal*, then textContent.
function stripToText(html: string): string {
  // Remove tags textually, then render as text. Never parse into live DOM.
  return html.replace(/<[^>]*>/g, '');
}
```
> **Recommendation:** Use **Option B's regex tag-strip *followed by* `textContent`** for clean display (Google shows bolded query terms inline, but plain text is acceptable and safest for v1.2). The regex only *removes* substrings; the security guarantee still comes from the final `textContent` assignment, not the regex. Crucially this means a malicious `<script>alert(1)</script>` either (a) is shown as literal text (Option A) or (b) has its tags textually removed leaving `alert(1)` as text (Option B) — in NEITHER case is a `<script>` node ever created. The node test must assert that explicitly. Do NOT rely on the regex for safety — it is for cosmetics only.

**Anti-pattern (REJECTED):**
```typescript
// ❌ NEVER — re-introduces a live parse and an injection surface:
const tmp = doc.createElement('div');
tmp.innerHTML = r.description;        // parses <script>, sets up injection
snippet.textContent = tmp.textContent; // "extract text" — but the parse already happened
```
Even though `.textContent` of a parsed tree looks safe, assigning attacker HTML to `innerHTML` is the exact operation SERP-03 forbids, and inline event handlers / `<img onerror>` can fire during parse in a real browser. Never do this.

### Pattern 4: Favicon letter-tile fallback (D-01)
```typescript
function faviconEl(doc: Document, r: SearchResult): HTMLElement {
  if (r.faviconUrl) {
    const img = doc.createElement('img');
    img.src = r.faviconUrl;            // only if Brave already provided it; no s2/network lookup
    img.className = 'serp-favicon';
    img.width = 16; img.height = 16;
    img.alt = '';
    return img;
  }
  // Deterministic letter-tile fallback — no network request (D-01).
  const tile = el(doc, 'span', {
    text: (r.hostname[0] ?? '?').toUpperCase(),
    className: 'serp-favicon serp-tile',
  });
  tile.style.backgroundColor = tileColor(r.hostname);
  return tile;
}

// Deterministic hue from hostname — stable color per site, no randomness.
function tileColor(hostname: string): string {
  let h = 0;
  for (let i = 0; i < hostname.length; i++) h = (h * 31 + hostname.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 55% 45%)`;
}
```
Same deterministic-hash-to-HSL technique used by GitHub/Slack-style identicons. Stable, fast, no dependency, no network.

### Pattern 5: CSS-only skeleton shimmer (SERP-04)
```css
/* search.css */
.serp-skeleton .bar { background: #eee; border-radius: 4px; overflow: hidden; position: relative; }
.serp-skeleton .bar::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.6), transparent);
  transform: translateX(-100%);
  animation: serp-shimmer 1.2s infinite;
}
@keyframes serp-shimmer { to { transform: translateX(100%); } }
@media (prefers-reduced-motion: reduce) { .serp-skeleton .bar::after { animation: none; } }
```
Render N skeleton rows (Discretion: ~5) in the `loading` branch. Pure CSS — no JS timer needed for the shimmer.

### Anti-Patterns to Avoid
- **`innerHTML = braveDescription`** — the canonical SERP-03 violation. Forbidden everywhere.
- **`DOMParser`/`innerHTML` "parse then read textContent"** — still parses attacker HTML; see Pattern 3 reject block.
- **`a.href = new URL(r.url).href` or `encodeURI(r.url)`** — mutates the verbatim URL; SERP-02 violation (§Pitfall 3). Assign the raw string.
- **Importing `search.ts` (not `serp-render.ts`) in the node test** — pulls in `location`/`window` references that don't exist in node. Test the pure renderer module.
- **External favicon fetch (`google.com/s2/favicons`)** — D-01 privacy violation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DOM in node for testing | A `createElement`/`textContent` stub | `linkedom` | A stub can't reproduce HTML parsing/escaping semantics, so it can't *prove* XSS-safety. The point of the test is fidelity. |
| HTML sanitization | DOMPurify or a custom allowlist sanitizer | `textContent` assignment | We don't render any Brave HTML at all (D-03). textContent makes a sanitizer unnecessary — adding one would imply we *do* inject HTML, contradicting the architecture. |
| Deterministic tile color | A color-name lookup table | hash-to-HSL (Pattern 4) | One-liner, stable, dependency-free. |

**Key insight:** The safest XSS posture is to never construct an HTML-parsing path for untrusted input. textContent + createElement means there is no parser to attack. A sanitizer is only needed when you *must* render HTML — Phase 9 deliberately renders none.

## Common Pitfalls

### Pitfall 1: Renderer coupled to global `document` → untestable in node
**What goes wrong:** `serp-render.ts` calls `document.createElement` referencing the global; node has no `document`, so `import` of `dist/serp-render.js` throws or the function can't run.
**Why it happens:** Reflexively using the implicit global.
**How to avoid:** Pass `document` (and the mount element) as parameters: `renderSerp(state, doc, mount)`. The page entry passes `window.document`; the test passes linkedom's. Module top-level must reference no browser global.
**Warning signs:** Any bare `document.` / `window.` / `location.` at module scope or inside `serp-render.ts`.

### Pitfall 2: linkedom not executing scripts read as "test proves nothing"
**What goes wrong:** Someone expects the XSS test to "try to run the script and see if it fires."
**Why it happens:** Mental model of jsdom script execution.
**How to avoid:** The correct assertion is **structural**, not behavioral: assert (a) `mount.querySelectorAll('script').length === 0` (no script node was ever created from the description), and (b) the malicious substring appears as `textContent` of the snippet element. linkedom not executing scripts is *fine* — we are proving the renderer never builds a script node in the first place, which is a stronger guarantee than "it didn't fire in one engine." `[VERIFIED: linkedom does not execute script tags — github.com/WebReflection/linkedom README]`
**Warning signs:** Test trying to spy on `window.alert`.

### Pitfall 3: URL "normalization" silently mutating href (SERP-02)
**What goes wrong:** `new URL(r.url).href` adds a trailing slash, lowercases host, re-encodes query; `encodeURI` double-encodes. The link no longer matches Brave's verbatim URL.
**Why it happens:** Habit of "cleaning" URLs.
**How to avoid:** `anchor.href = r.url;` — direct string assignment, nothing else. Node test asserts `anchor.getAttribute('href') === mock.url` byte-for-byte (use `getAttribute`, not `.href`, since `.href` may resolve relative URLs against a base).
**Warning signs:** `new URL(`, `encodeURI(`, `.replace(` near href assignment.

### Pitfall 4: `.href` vs `getAttribute('href')` in the test
**What goes wrong:** Reading `anchor.href` in linkedom/jsdom may resolve against the document base URL and normalize, failing a verbatim-equality assertion even when the code is correct.
**How to avoid:** Assert on `anchor.getAttribute('href')` for the raw stored value.
**Warning signs:** Verbatim-URL test fails with a path-resolved/absolute value.

### Pitfall 5: copy-assets misses `search.html`/`search.css` if placed outside `src/`
**What goes wrong:** Files created in repo root or a subfolder are not copied to `dist/`.
**How to avoid:** Create `search.html`/`search.css` directly in `src/` — `copy-assets` globs `src/*.html src/*.css` (verified in package.json). `search.ts` compiles automatically (`include: ["src/**/*"]`). No build change needed. `[VERIFIED: package.json + tsconfig.json — read this session]`
**Warning signs:** `dist/search.html` absent after `npm run build`.

### Pitfall 6: Forgetting `web_accessible_resources` (Phase 11 concern, not Phase 9)
**What goes wrong:** In Phase 11, `chrome.tabs.create(getURL('search.html'))` opens an extension page — extension pages opened by the extension itself do NOT require `web_accessible_resources` (that list is for pages/resources accessed by *web content*). So this is likely a non-issue even in Phase 11.
**How to avoid:** Discretion item — Phase 9 may leave the manifest untouched. If a future need arises (e.g., embedding in a web page), revisit. Document the decision; don't add it speculatively.
**Confidence:** MEDIUM `[ASSUMED — based on MV3 web_accessible_resources semantics; verify in Phase 11 if tabs.create misbehaves]`

## Runtime State Inventory

> This is a greenfield rendering phase (new files only, no rename/migration). Inventory included for completeness; nothing to migrate.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 9 reads a static mock, writes nothing to storage. | None |
| Live service config | None — no external service touched (D-01 forbids favicon fetch). | None |
| OS-registered state | None. | None |
| Secrets/env vars | None — no API key read on the search page (XLT-01 keeps keys in the worker; Phase 9 has no worker call at all). | None |
| Build artifacts | New `dist/search.{html,js,css}` produced by existing pipeline; no stale artifacts since these are net-new files. | `npm run build` after adding files |

**Nothing found in any category requiring migration** — verified by reading CONTEXT (no live data/wiring), package.json (build is copy-only), and the phase boundary (fixed mock).

## Code Examples

### SerpState discriminated union (D-03)
```typescript
// serp-render.ts
import type { SearchResult, ErrorKind } from './types.js';

export type SerpState =
  | { kind: 'loading' }
  | { kind: 'populated'; results: SearchResult[] }
  | { kind: 'empty' }
  | { kind: 'error'; errorKind: ErrorKind; message: string };

export function renderSerp(state: SerpState, doc: Document, mount: HTMLElement): void {
  mount.replaceChildren(); // clear previous render
  switch (state.kind) {
    case 'loading':   mount.appendChild(skeletonList(doc)); break;
    case 'populated': state.results.forEach(r => mount.appendChild(resultRow(doc, r))); break;
    case 'empty':     mount.appendChild(emptyNotice(doc)); break;
    case 'error':     mount.appendChild(errorNotice(doc, state)); break;
  }
}
```
`ErrorKind` (`'auth' | 'rate_limit' | 'credits' | 'network' | 'search_quota' | 'unknown'`) is imported from `src/errors.ts`. SERP-05 maps: `auth → "Brave key invalid/missing"`, `network → "Network failure"`, `search_quota → "Search quota exceeded"` (no auto-retry), `unknown → generic`. `?state=` keys (`key|network|quota|generic`) map to these kinds in `search-mock.ts`.

### `?state=` entry (search.ts — browser only, NOT imported by test)
```typescript
import { MOCKS, DEFAULT_STATE } from './search-mock.js';
import { renderSerp } from './serp-render.js';

const key = new URLSearchParams(location.search).get('state') ?? 'populated';
const state = MOCKS[key] ?? DEFAULT_STATE;
const mount = document.getElementById('results')!;
renderSerp(state, document, mount);
```

### XSS mock row (search-mock.ts — required by D-02)
```typescript
export const XSS_PROBE: SearchResult = {
  title: 'Totally normal result',
  url: 'https://example.com/path?q=1',                 // asserted verbatim
  description: 'safe text <strong>bold</strong> <script>alert(1)</script> trailing',
  hostname: 'example.com',
  // no faviconUrl → exercises letter-tile fallback too
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| jsdom for all node DOM tests | linkedom for SSR/tree-inspection tests | ~2021+ | Lighter, no native deps; ideal where you only inspect a built tree |
| `element.innerHTML = userHtml` then sanitize | Never build an HTML-parse path; textContent only | long-standing OWASP guidance | Removes the injection surface entirely |
| `prefers-reduced-motion` ignored | Gate shimmer animation behind it | now standard | Accessibility; avoids motion sickness |

**Deprecated/outdated:**
- DOMPurify-for-everything reflex: unnecessary here because no HTML is rendered. Only reach for a sanitizer when you must inject markup.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `linkedom` is the right test DOM (vs jsdom/happy-dom) | Standard Stack | Low — all three work; linkedom is lightest. If it lacks an API we need (`replaceChildren`, `getAttribute`), swap to jsdom; tests would just fail loudly. |
| A2 | `linkedom` package legitimacy (slopcheck unavailable) | Package Audit | Low — 2.7M downloads/wk, 10-yr history, known author. Planner may still add a verify checkpoint. |
| A3 | `search.html` opened by the extension needs NO `web_accessible_resources` | Pitfall 6 | Low/deferred — a Phase 11 concern; if `tabs.create` fails there, add the entry then. |
| A4 | Showing `<strong>` as literal text (vs reconstructing bold) is acceptable for v1.2 | Pattern 3 | Cosmetic only — mockup-gallery pass (D-04) can refine; safety unaffected. |

## Open Questions

1. **Tag-strip cosmetics (Pattern 3 Option A vs B)**
   - What we know: Both are XSS-safe; difference is whether `<strong>` shows as literal text or is removed.
   - What's unclear: Product preference for snippet appearance.
   - Recommendation: Option B (regex tag-strip → textContent) for clean snippets; settle precise look in the `shipyard:mockup-gallery` pass before planning, per D-04.

2. **Skeleton row count & error copy wording**
   - Claude's-discretion items; recommend ~5 skeleton rows; error copy must keep 429 = "search quota exceeded" and stay distinct per kind (SERP-05).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | test harness + tsc | ✓ | v24.11.1 | — |
| TypeScript | build | ✓ | ^5.2.2 (devDep) | — |
| `node --test` | test runner | ✓ | built into Node 24 | — |
| `linkedom` | `test/serp.mjs` DOM | ✗ (not yet installed) | target 0.18.12 | jsdom/happy-dom (already-verified alternatives); or skip DOM test (NOT acceptable — SERP-03 needs it) |

**Missing dependencies with no fallback:** none blocking — `linkedom` is the one install this phase adds.
**Missing dependencies with fallback:** `linkedom` (fallback: jsdom). First task should `npm install --save-dev linkedom`.

## Validation Architecture

> Nyquist validation is enabled (config.json has no `nyquist_validation: false`). This section derives `09-VALIDATION.md`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in, Node 24) + `node:assert/strict` |
| Config file | none — convention only; `npm test` = `tsc && node --test 'test/**/*.mjs'` |
| DOM provider | `linkedom` (`parseHTML`) — Wave 0 install |
| Quick run command | `npm run build && node --test test/serp.mjs` |
| Full suite command | `npm test` |

**Established repo conventions (verified by reading `test/unit.mjs`, `test/brave-live.mjs`):**
- Tests are `.mjs`, import the **compiled** module from `../dist/*.js` (NOT from `src/`).
- Use `node:test` `test()` + `node:assert/strict`.
- Resolve dist paths via `path.join(__dirname, '../dist/<mod>.js')` with `createRequire`/`fileURLToPath` boilerplate (copy from `unit.mjs` head).
- Live/metered checks `skip` cleanly when a key is absent (brave-live pattern) — N/A here since Phase 9 has no network.
- **Project memory law:** verify against `dist/`, NEVER the service-worker console. The renderer + mocks MUST be importable so the node test can assert XSS-safety and verbatim hrefs without a browser. (This is exactly why `serp-render.ts` is DOM-agnostic.)

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SERP-01 | populated mock renders one row per result with favicon node + hostname text + title anchor + snippet | unit | `node --test test/serp.mjs` (`renders favicon/host/title/snippet per row`) | ❌ Wave 0 |
| SERP-01 | row with no `faviconUrl` renders a letter-tile span (not an img), first letter uppercased | unit | same (`falls back to letter tile`) | ❌ Wave 0 |
| SERP-02 | every anchor's `getAttribute('href')` equals the mock `url` byte-for-byte | unit | same (`href is verbatim`) | ❌ Wave 0 |
| SERP-03 | after rendering the XSS mock, `mount.querySelectorAll('script').length === 0` AND the malicious string is present as element `textContent` | unit | same (`no script node; payload is inert text`) | ❌ Wave 0 |
| SERP-03 | renderer never assigns `innerHTML` (guard: assert snippet `.children.length === 0` for a `<strong>`-containing description → tags neutralized, not parsed) | unit | same (`description not parsed into child elements`) | ❌ Wave 0 |
| SERP-04 | `loading` state renders ≥1 `.serp-skeleton` row and zero `.serp-row` | unit | same (`skeleton state shows shimmer rows`) | ❌ Wave 0 |
| SERP-05 | `empty` state renders a distinct empty notice (no rows) | unit | same (`empty state`) | ❌ Wave 0 |
| SERP-05 | each error kind (`auth`/`network`/`search_quota`/`unknown`) renders distinct copy; quota text matches /quota/i and contains "search quota exceeded"; no auto-retry/timer scheduled | unit | same (`error states are distinct; quota copy`) | ❌ Wave 0 |
| Build | `dist/search.html`, `dist/search.css`, `dist/search.js` exist after build | smoke | `npm run build && ls dist/search.html dist/search.css dist/search.js` | ❌ Wave 0 |
| Visual | light-theme Google-style layout matches mockup-gallery direction | manual-only | open `dist/search.html?state=populated` in browser; cycle all 7 `?state=` values | manual (D-04 fidelity) |

### Sampling Rate
- **Per task commit:** `npm run build && node --test test/serp.mjs`
- **Per wave merge:** `npm test` (full suite — keeps Phase 8 error/transport tests green too)
- **Phase gate:** Full suite green + manual `?state=` walkthrough of all 7 states before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `npm install --save-dev linkedom` — DOM provider for the renderer test
- [ ] `test/serp.mjs` — covers SERP-01..05 (imports `dist/serp-render.js` + `dist/search-mock.js`, drives a linkedom document)
- [ ] `src/search-mock.ts` must export the XSS probe + all 7 states so the test imports the *same* fixtures the page uses
- [ ] `src/serp-render.ts` must be DOM-agnostic (`document` injected) or the test cannot import it under node

## Security Domain

> `security_enforcement` not set to false → included.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth on a static render page; Brave key never touches this page (XLT-01) |
| V3 Session Management | no | Stateless render |
| V4 Access Control | no | — |
| V5 Input Validation / Output Encoding | **yes** | Output encoding via `textContent`/`createElement` only; never `innerHTML` for Brave-derived data (SERP-03). This is the core security control of the phase. |
| V6 Cryptography | no | No secrets handled on this page |

### Known Threat Patterns for {vanilla-TS MV3 render page}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stored/reflected XSS via Brave `description` (`<script>`, `<img onerror>`) | Tampering / Elevation | textContent-only rendering; no `innerHTML`/`DOMParser`-into-DOM (Pattern 1 & 3); node test asserts no `<script>` node |
| URL tampering / open-redirect dressing via mutated href | Tampering | `href = url` verbatim (SERP-02); `rel="noopener noreferrer"` on external anchors |
| Favicon-driven host leak to a third party | Information Disclosure | D-01: no external favicon service; letter-tile fallback, no per-row network |
| MV3 CSP (extension pages forbid inline script/eval) | — | External `<script type="module" src="search.js">` only; no inline handlers — already the repo convention |

## Sources

### Primary (HIGH confidence)
- `src/types.ts`, `src/errors.ts`, `src/options.html`, `src/options.css`, `src/output.ts`, `src/brave-search.ts`, `package.json`, `tsconfig.json`, `manifest.json`, `test/unit.mjs`, `test/brave-live.mjs` — read this session (codebase ground truth)
- `.planning/phases/09-serp-rendering/09-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/config.json` — read this session
- github.com/WebReflection/linkedom (README via WebFetch) — `parseHTML`/`DOMParser` API; confirmed linkedom does NOT execute script tags

### Secondary (MEDIUM confidence)
- npm registry (`npm view`, downloads API) — linkedom 0.18.12 / jsdom 29.1.1 / happy-dom 20.9.0 versions, dates, download counts, repos, deps

### Tertiary (LOW confidence)
- MV3 `web_accessible_resources` semantics for extension-opened pages (Pitfall 6 / A3) — based on training knowledge; verify in Phase 11 if needed

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — single new dep, registry-verified; alternatives benchmarked
- Architecture: HIGH — derived from explicit D-03 decision + verified build/test conventions
- Testability (DOM-in-node): HIGH — linkedom API + non-execution confirmed via README; matches existing dist-import test pattern
- Pitfalls: HIGH — grounded in repo code and OWASP-standard output-encoding guidance
- web_accessible_resources (Pitfall 6): MEDIUM — deferred to Phase 11

**Research date:** 2026-06-03
**Valid until:** 2026-07-03 (stable — vanilla DOM + a mature test lib; low churn)
