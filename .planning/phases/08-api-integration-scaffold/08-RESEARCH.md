# Phase 8: API Integration Scaffold - Research

**Researched:** 2026-06-03
**Domain:** Brave Search API, Chrome MV3 service worker messaging, TypeScript type extension
**Confidence:** HIGH (API endpoint/auth/shape), MEDIUM (rate-limit/pricing current state)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Define the full `SearchResult` type now. Minimum fields per result: `title`, `url` (verbatim, never mutated), `description` (raw Brave HTML snippet), `hostname` (derived for favicon/display). Translated overlays are additive later; Phase 8 returns raw Brave values.
- **D-02:** `searchTranslated` follows the existing `onMessage` switch-dispatch pattern in `background.ts`: new `MessageType` member + typed message interface in `types.ts`, new `case 'searchTranslated'` in the listener. Response shape: `{ results: SearchResult[], direct?: boolean }` on success; `{ error, kind }` on failure.
- **D-03:** Store Brave key as a separate top-level `Settings` field (`braveApiKey: string`), NOT inside the existing `apiKeys` map. Stored in `chrome.storage.local` under `himeSettings`.
- **D-04:** Add a separate "Test Brave Key" button with its own status line in the options page, parallel to the LLM "Test Connection" button. Validation = a minimal live Brave query (`q=test`, 1 result) routed through the background worker (key never read from the page). Surfaces: valid / invalid key / quota / network error / "key required".
- **D-05:** Enforce dedup background-side, keyed on the normalized query string: while a Brave request for a given query is in flight, a duplicate `searchTranslated` for the same query does not issue a second Brave call.
- **D-06:** When source language == target language, skip translation paths, run Brave search directly, return `{ results, direct: true }`.
- **D-07:** Reuse `ClassifiedError` / `ErrorKind`. Map Brave HTTP 429 → a distinct kind reading "search quota exceeded", no auto-retry. Other network failures → distinct error state.

### Claude's Discretion

- Exact Brave endpoint path, query params (`count`, `country`, `safesearch` defaults), and response JSON field mapping are implementation details for research/planning.
- Whether in-flight dedup is a `Map<query, Promise>` or a timestamp guard — planner's call.

### Deferred Ideas (OUT OF SCOPE)

- Auto-detect source language (uses the settings value)
- Non-Brave search providers
- Page-level ~1s input debounce UX (Phase 11)

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SRCH-04 | Translated query sent to Brave Search API; web results retrieved | Brave endpoint, auth header, response schema documented below |
| SRCH-05 | When source == target language, skip translation, search directly, show notice | D-06 establishes `direct: true` flag; handler branch documented |
| SRCH-06 | Submit debounce (~1s) enforced by message contract — no duplicate Brave calls | D-05 in-flight dedup pattern; `Map<string, Promise>` recommended |
| SSET-01 | Options page has Brave Search API key field, stored in `chrome.storage` | D-03 + existing `himeSettings` blob pattern |
| SSET-02 | Options page can test/validate the Brave key; surfaces "key required" when absent | D-04 + `testConnection` clone pattern from `options.ts` |
| XLT-01 | All network calls routed through background service worker; no key on search page | Existing architecture already enforces this; `searchTranslated` extends it |

</phase_requirements>

---

## Summary

Phase 8 is a pure back-end plumbing phase: wire the Brave Search API into the existing background worker message dispatch, lock the `SearchResult` type contract (consumed by Phase 9), add a Brave API key field to the options page, and handle every error and edge-case path before any search UI is built.

The Brave Search API is a simple REST GET endpoint (`https://api.search.brave.com/res/v1/web/search`) authenticated with a single `X-Subscription-Token` header. The response puts web results at `response.web.results[]`, each result carrying `title`, `url`, `description` (raw HTML with `<strong>` highlights when `text_decorations=true`), and `meta_url.hostname` (the pre-parsed hostname for favicon display). No SDK is needed; a direct `fetch()` from the MV3 service worker works once the manifest lists the endpoint under `host_permissions`.

The primary tricky points are: (1) `text_decorations` defaults to `true` and causes `<strong>` tags in `description` — Phase 8 passes them through raw and Phase 9 strips them; (2) the existing `ErrorKind` taxonomy already has `rate_limit` for 429, but the D-07 requirement is that the Brave-specific 429 message reads "search quota exceeded" and suppresses auto-retry, which means a Brave-specific branch in the error classification rather than a new kind; (3) `host_permissions` in `manifest.json` must be extended with `https://api.search.brave.com/*`.

**Primary recommendation:** Implement `BraveSearchClient` as a standalone module (`src/brave-search.ts`) that takes an API key and returns `SearchResult[]`, keeping all Brave-specific logic isolated from `background.ts`. Wire it into the new `case 'searchTranslated'` handler the same way the provider classes are used now.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Brave API key storage | Background / storage | — | `chrome.storage.local` is only accessible from extension pages + service worker; key never touches content scripts |
| Brave fetch execution | Background (service worker) | — | XLT-01: no key on search page; service worker has `host_permissions` bypass |
| In-flight dedup | Background (service worker) | — | Must be enforced at the source of outbound requests, not at the caller |
| source==target short-circuit | Background (service worker) | — | Logic lives where settings are read (`getSettings()`) |
| Options page key field + test | Frontend (options page) | Background (test validation) | UI in options.ts/options.html; actual test request routed through background worker via message |
| SearchResult type contract | Shared types (`types.ts`) | — | Consumed by Phase 9 renderer; locked here |
| 429 / error classification | Shared (`errors.ts`) | — | Centralised taxonomy already exists; extend message string only |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native `fetch()` | MV3 built-in | HTTP requests from service worker | No extra dep; MV3 service worker supports fetch natively [VERIFIED: Chrome docs] |
| `chrome.storage.local` | MV3 built-in | Persist Brave key alongside other settings | Already used for all settings in this codebase [VERIFIED: codebase] |
| Node.js `--test` runner | built-in (Node 18+) | Unit tests | Already the project test framework (`npm test`) [VERIFIED: codebase package.json] |
| TypeScript 5.x | `^5.2.2` (project) | Type safety | Already the project language [VERIFIED: codebase package.json] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| No new npm packages needed | — | — | All required primitives are native or already in the codebase |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `fetch()` | `brave-search` npm package [ASSUMED] | Package adds zero value; a single GET with two headers needs no wrapper |

**Installation:** No new packages required. Extend existing files only.

---

## Package Legitimacy Audit

> No external packages are installed in this phase. All implementation uses native browser APIs and existing project code.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
search page / options page
       |
       | chrome.runtime.sendMessage({ type: 'searchTranslated', payload: { query, source, target } })
       |
       v
background service worker  (background.ts)
       |
       +-- case 'searchTranslated'
       |       |
       |       +-- getSettings() → braveApiKey, sourceLanguage, targetLanguage
       |       |
       |       +-- source == target? ──yes──> BraveSearchClient.search(query)
       |       |                                      |
       |       |                              sendResponse({ results, direct: true })
       |       |
       |       +-- in-flight dedup map ──hit──> await existing Promise → sendResponse
       |       |
       |       +-- BraveSearchClient.search(translatedQuery)  ←── new Promise added to Map
       |               |
       |               | GET https://api.search.brave.com/res/v1/web/search
       |               |     X-Subscription-Token: <key>
       |               |     Accept: application/json
       |               |
       |               +── HTTP 200 → parse web.results[] → SearchResult[]
       |               |       └── sendResponse({ results })
       |               |
       |               +── HTTP 429 → classifyBraveError(429) → kind:'search_quota'
       |               |       └── sendResponse({ error: 'search quota exceeded', kind: 'search_quota' })
       |               |
       |               +── HTTP 401/403 → kind:'auth'
       |               |       └── sendResponse({ error, kind: 'auth' })
       |               |
       |               └── TypeError/AbortError → kind:'network'
       |                       └── sendResponse({ error, kind: 'network' })
       |
       +-- case 'testBraveKey'  (options page → background → Brave → response)
               |
               └── BraveSearchClient.search('test', key, { count: 1 })
                       └── sendResponse({ ok: true }) | sendResponse({ error, kind })
```

### Recommended Project Structure

```
src/
├── brave-search.ts      # NEW: BraveSearchClient class + SearchResult type (also in types.ts)
├── background.ts        # EXTEND: add 'searchTranslated' and 'testBraveKey' cases
├── types.ts             # EXTEND: SearchResult, SearchTranslatedMessage, TestBraveKeyMessage, ErrorKind
├── errors.ts            # EXTEND: add 'search_quota' to ErrorKind; add classifyBraveError()
├── options.ts           # EXTEND: braveApiKey field load/save, testBraveKey button handler
└── options.html         # EXTEND: Brave Search API Key section with input + test button
```

### Pattern 1: BraveSearchClient as Isolated Module

**What:** All Brave-specific fetch logic lives in `src/brave-search.ts`, not inline in `background.ts`. Mirrors the pattern of provider classes (`OpenAIProvider`, etc.) being separate from the main dispatch handler.

**When to use:** Any time a new external service is added. Keeps `background.ts` as a thin dispatcher.

**Example:**
```typescript
// src/brave-search.ts
// Source: pattern derived from src/providers/openai.ts (codebase)
import type { SearchResult } from './types.js';
import { classifyBraveError } from './errors.js';

export const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

export class BraveSearchClient {
  async search(
    query: string,
    apiKey: string,
    opts: { count?: number; searchLang?: string } = {},
  ): Promise<SearchResult[]> {
    const url = new URL(BRAVE_ENDPOINT);
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(opts.count ?? 10));
    url.searchParams.set('result_filter', 'web');
    if (opts.searchLang) url.searchParams.set('search_lang', opts.searchLang);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
        signal: controller.signal,
      });
    } catch (err) {
      const c = classifyBraveError(err);
      const e = new Error(c.message) as any;
      e.kind = c.kind;
      throw e;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const bodyMessage = (body as any)?.message ?? undefined;
      const c = classifyBraveError(null, { status: response.status, bodyMessage });
      const e = new Error(c.message) as any;
      e.kind = c.kind;
      e.status = response.status;
      throw e;
    }

    const data = await response.json();
    const items: BraveWebResult[] = data?.web?.results ?? [];
    return items.map(mapBraveResult);
  }
}

function mapBraveResult(r: BraveWebResult): SearchResult {
  return {
    title: r.title,
    url: r.url,
    description: r.description ?? '',
    hostname: r.meta_url?.hostname ?? new URL(r.url).hostname,
  };
}
```

### Pattern 2: In-Flight Dedup Map

**What:** A `Map<string, Promise<SearchResult[]>>` in `background.ts` module scope. Before issuing a new Brave call, check if a Promise keyed by the normalized query is already in the map. If yes, await it. Remove the entry when the Promise settles.

**When to use:** D-05: Prevents duplicate Brave calls for rapid duplicate submits.

**Example:**
```typescript
// src/background.ts — module scope
const inFlightSearches = new Map<string, Promise<SearchResult[]>>();

// Inside case 'searchTranslated':
const key = query.trim().toLowerCase();
if (inFlightSearches.has(key)) {
  const results = await inFlightSearches.get(key)!;
  sendResponse({ results });
  break;
}
const promise = braveClient.search(query, braveApiKey);
inFlightSearches.set(key, promise);
try {
  const results = await promise;
  inFlightSearches.delete(key);
  sendResponse({ results });
} catch (err) {
  inFlightSearches.delete(key);
  throw err;
}
```

### Pattern 3: Brave 429 Classification

**What:** D-07 requires 429 → "search quota exceeded" (not the generic `rate_limit` message). The cleanest approach is a `classifyBraveError()` function that overrides the 429 branch with a Brave-specific `search_quota` kind and message, while delegating other statuses to the existing `classifyError()`.

**Design decision for planner:** D-07 says "Add a Brave-specific ErrorKind member only if no existing kind fits cleanly." The existing `rate_limit` kind covers LLM rate-limiting with the message "Rate limited by {provider} — wait and retry". Phase 9 (SERP-05) needs to render 429 distinctly as "search quota exceeded". Using a new `'search_quota'` kind is the cleanest discriminator — Phase 9 can switch on `kind === 'search_quota'` without string-matching.

```typescript
// errors.ts — extend ErrorKind
export type ErrorKind = 'auth' | 'rate_limit' | 'credits' | 'network' | 'unknown' | 'search_quota';

// errors.ts — new Brave-specific classifier
export function classifyBraveError(
  err: unknown,
  response?: { status?: number; bodyMessage?: string },
): ClassifiedError {
  // Network errors first (reuse existing logic)
  if (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError') ||
    err instanceof TypeError
  ) {
    return { kind: 'network', message: 'Network error — request timed out or offline' };
  }
  const status = response?.status;
  if (status === 401 || status === 403) {
    return { kind: 'auth', message: 'Invalid or unauthorized Brave API key — check it in options', status };
  }
  if (status === 429) {
    // D-07: "search quota exceeded", no auto-retry
    return { kind: 'search_quota', message: 'Search quota exceeded — check your Brave plan', status };
  }
  return {
    kind: 'unknown',
    message: `Brave Search error ${status ?? 'unknown'}: ${response?.bodyMessage ?? 'unknown'}`,
    status,
  };
}
```

### Pattern 4: Options Page Clone (Test Brave Key)

**What:** Clone the existing `testConnectionBtn` / `testStatusDiv` pattern for a separate "Test Brave Key" button. The test validation sends a `testBraveKey` message to the background worker (which does the actual Brave call) — the options page never holds the key during validation.

**Key difference from LLM test:** The LLM test in `testConnection()` calls the provider directly from the options page (it reads `apiKeyInput.value` and POSTs to OpenAI/Gemini). For the Brave key test, to satisfy XLT-01 ("key never read from the search page"), the options page saves the key first, then sends a `testBraveKey` message to the background worker, which reads the key from storage and executes the test fetch. This is consistent with the principle but note: the options page is NOT the search page, and existing LLM tests do read the key from the page. The planner should clarify — either approach satisfies SSET-02. The strictest XLT-01 interpretation routes through the worker; the simplest approach reads from the field. CONTEXT.md D-04 explicitly says "routed through the background worker (XLT-01: the key is never read from the page)" so the worker-routed approach is locked.

**Example:**
```typescript
// options.ts — testBraveKey handler
async function testBraveKey(): Promise<void> {
  const key = braveApiKeyInput.value;
  if (!key) {
    showStatus('Please enter a Brave API key first', 'error', braveTestStatusDiv);
    return;
  }
  // Save the key first so the background worker can read it
  await saveCurrentBraveKey(key);
  showStatus('Testing Brave key...', 'info', braveTestStatusDiv);
  testBraveKeyBtn.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'testBraveKey' });
    if (response?.ok) {
      showStatus('Brave key valid — connection successful', 'success', braveTestStatusDiv);
    } else {
      showStatus(response?.error ?? 'Brave key test failed', 'error', braveTestStatusDiv);
    }
  } catch (err) {
    showStatus('Could not reach background worker', 'error', braveTestStatusDiv);
  } finally {
    testBraveKeyBtn.disabled = false;
  }
}
```

### Anti-Patterns to Avoid

- **Reading `braveApiKey` from options page during test:** Violates XLT-01 semantics per D-04 — route through background worker.
- **Putting Brave fetch logic inline in the `case 'searchTranslated'` handler:** Hard to test and mixes transport with dispatch. Isolate in `BraveSearchClient`.
- **Passing `text_decorations=false` to suppress `<strong>` tags:** Phase 9 owns stripping; Phase 8 returns raw description. Passing the param would prematurely strip data Phase 9 might want.
- **Retrying on 429:** D-07 + success criterion 4 are explicit: no auto-retry.
- **Storing `braveApiKey` inside the `apiKeys` map:** D-03 prohibits this — `apiKeys` is for LLM providers only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL construction with query params | Manual string concat | `new URL(base); url.searchParams.set(k, v)` | Handles encoding correctly [VERIFIED: MDN / built-in] |
| Abort / timeout | `Promise.race()` with a timer | `AbortController` + `setTimeout` | Existing pattern in OpenAIProvider; already in the codebase [VERIFIED: codebase] |
| JSON response parsing | Custom deserializer | `await response.json()` + optional chaining | Brave returns valid JSON; no schema validation needed at this phase |
| Hostname extraction | Regex on URL string | `new URL(r.url).hostname` as fallback; prefer `r.meta_url.hostname` from Brave response | Brave provides it pre-parsed; only fall back to URL parsing if `meta_url` absent |

**Key insight:** Every primitive needed for this phase is either native browser API or already in the codebase. No new dependencies.

---

## Brave Search API — Verified Facts

### Endpoint

```
GET https://api.search.brave.com/res/v1/web/search
```

[VERIFIED: api-dashboard.search.brave.com/api-reference/web/search/get]

### Required Headers

| Header | Value | Required |
|--------|-------|----------|
| `X-Subscription-Token` | User's API key | Yes |
| `Accept` | `application/json` | Yes (default supported media type) |
| `Accept-Encoding` | `gzip` | Recommended |

[VERIFIED: api-dashboard.search.brave.com/documentation/quickstart]

### Key Query Parameters

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `q` | string | required | Max 400 chars / 50 words |
| `count` | integer | 20 | Range 1–20 |
| `search_lang` | enum | `en` | 2+ char language code for results |
| `country` | enum | `US` | 2-char country code |
| `safesearch` | enum | `moderate` | `off` / `moderate` / `strict` |
| `text_decorations` | boolean | `true` | When true, `description` contains `<strong>` HTML tags around matched terms |
| `result_filter` | string | all | Set to `web` to return only web results, suppressing news/videos/etc. |
| `offset` | integer | 0 | Pagination offset (0–9) |

[VERIFIED: api-dashboard.search.brave.com/api-reference/web/search/get]

### Response JSON Path to Results

```
response.web.results[]
```

Each item in `web.results`:

| Field | Type | Notes |
|-------|------|-------|
| `title` | string | Page title |
| `url` | string | Verbatim page URL — SERP-02: never mutate |
| `description` | string (optional) | Snippet text; contains `<strong>` HTML when `text_decorations=true` (default). Phase 8 passes through raw; Phase 9 strips. |
| `meta_url.hostname` | string | Pre-parsed hostname (e.g. `"wikipedia.org"`) — use for display and favicon derivation |
| `meta_url.favicon` | string (optional) | Brave-proxied favicon URL (e.g. `https://imgs.search.brave.com/...`) |
| `profile.name` | string (optional) | Publisher/site name |
| `profile.img` | string (optional) | Publisher favicon/logo (Brave-proxied) |
| `thumbnail.src` | string (optional) | Page thumbnail image |
| `age` | string (optional) | Human-readable age (e.g. "2 days ago") |
| `language` | string (optional) | Content language code |
| `extra_snippets` | string[] (optional) | Up to 5 additional excerpt strings |

[CITED: api-dashboard.search.brave.com/api-reference/web/search/get, brave-search-skills SKILL.md, WebSearch cross-verification]

**Note on favicon:** Both `meta_url.hostname` and `meta_url.favicon` (or `profile.img`) are available. The safest approach for Phase 8 is to expose `hostname` in `SearchResult` (letting Phase 9 construct a `favicons.google.com` URL or use a CSS approach) plus `faviconUrl` as an optional field carrying Brave's proxied URL if present. This gives Phase 9 flexibility.

### HTTP 429 Semantics

- Brave returns HTTP `429 Too Many Requests` when the rate limit or monthly quota is exceeded.
- Rate limit: **1 request/second** (sliding window).
- Monthly quota: The traditional free tier (2,000–5,000/month) was **eliminated February 2026**. Current model: $5 prepaid credits (~1,000 queries at $0.005/query). The free tier no longer exists; BYOK users are on metered billing. [CITED: implicator.ai/brave-drops-free-search-api-tier]
- Response headers on any response include `X-RateLimit-Remaining` and `X-RateLimit-Reset` (seconds until window reset).
- No documented JSON body shape for 429 — treat it as status-code-only detection.
- **D-07 requirement:** 429 → `kind: 'search_quota'`, message: "Search quota exceeded — check your Brave plan", no auto-retry.

[CITED: api-dashboard.search.brave.com/documentation/guides/rate-limiting]

### Pricing Summary (for dev/docs context)

| Aspect | Value |
|--------|-------|
| Free tier | **None** as of Feb 2026 |
| New user credits | $5/month prepaid |
| Cost per web query | ~$0.005 |
| Approx queries per $5 | ~1,000 |
| Rate limit | 1 req/s |

[CITED: implicator.ai/brave-drops-free-search-api-tier, agentdeals.dev/vendor/brave-search-api]

---

## MV3 Service Worker + CORS

### Host Permissions Required

The MV3 service worker bypasses CORS for origins listed in `host_permissions`. The Brave endpoint is **not** currently listed in `manifest.json`. Phase 8 must add:

```json
"host_permissions": [
  "https://api.openai.com/*",
  "https://generativelanguage.googleapis.com/*",
  "https://openrouter.ai/*",
  "https://api.search.brave.com/*"
]
```

[VERIFIED: developer.chrome.com/docs/extensions/develop/concepts/network-requests — "A script executing in an extension service worker can talk to remote servers outside of its origin, as long as the extension requests host permissions."]

### No CORS Headers Needed on the Request

The service worker fetch is not subject to browser CORS preflight when `host_permissions` is granted. No `Origin`, `CORS-mode`, or other special headers are needed beyond `X-Subscription-Token` and `Accept`.

### Accept-Encoding Gotcha

Service workers may or may not decompress gzip automatically depending on the Chrome version. `Accept-Encoding: gzip` is listed as recommended in Brave's quickstart; the `response.json()` call will handle decompression transparently in modern Chrome. Including it is safe.

---

## Common Pitfalls

### Pitfall 1: Missing host_permissions for Brave endpoint

**What goes wrong:** `fetch('https://api.search.brave.com/...')` from the service worker silently fails with a network error even though `manifest.json` declares no CORS errors from other origins.

**Why it happens:** MV3 service workers require explicit `host_permissions` entries for any cross-origin fetch that should bypass CORS. Without it, the fetch fails.

**How to avoid:** Add `"https://api.search.brave.com/*"` to `host_permissions` in `manifest.json` before writing any fetch code.

**Warning signs:** `TypeError: Failed to fetch` from the service worker despite no apparent network issue.

### Pitfall 2: `text_decorations=true` (default) injects `<strong>` HTML in `description`

**What goes wrong:** If Phase 9 renders `description` with `textContent` assignment, the `<strong>` tags appear as literal text. If it uses `innerHTML`, it's XSS-unsafe.

**Why it happens:** Brave's default is `text_decorations=true`; description fields contain markup like `Best <strong>Greek</strong> restaurants`.

**How to avoid:** Phase 8 must NOT set `text_decorations=false` (would destroy data Phase 9 needs). Phase 8 documents that `description` is raw HTML. Phase 9 strips it (SERP-03).

**Warning signs:** `<strong>` appearing in rendered SERP text.

### Pitfall 3: `braveApiKey` field missing from `migrateSettings()`

**What goes wrong:** Existing `himeSettings` blobs in storage don't have `braveApiKey`. If `migrateSettings()` doesn't add a default, `settings.braveApiKey` is `undefined`, causing the null guard to be bypassed if coded as `if (!settings.braveApiKey)`.

**Why it happens:** `migrateSettings()` spreads `DEFAULT_SETTINGS` over the raw object; if `DEFAULT_SETTINGS` is not updated to include `braveApiKey: ''`, old settings objects will lack the field.

**How to avoid:** Add `braveApiKey: ''` to `DEFAULT_SETTINGS` in `types.ts` alongside the other fields.

**Warning signs:** `settings.braveApiKey` is `undefined` instead of `''` for users who haven't opened the options page yet.

### Pitfall 4: In-flight dedup Map entry not cleaned up on error

**What goes wrong:** If the Brave fetch throws, the Map entry remains forever. Subsequent calls for the same query hit the stale entry and hang indefinitely (awaiting a rejected Promise).

**Why it happens:** Error path skips the `Map.delete()` cleanup.

**How to avoid:** Use `try/finally` to always delete the Map entry on both success and failure.

**Warning signs:** First failure on a query makes all subsequent calls for that query hang.

### Pitfall 5: `testBraveKey` saves the key before testing

**What goes wrong:** D-04 says the test call is "routed through the background worker (key never read from the page)". This means the options page must first `chrome.storage.local.set` the key, then send the test message. If the save fails (e.g. storage quota), the test will validate against a stale key.

**Why it happens:** The options page can't pass the API key in the message payload (would expose it) so it saves first.

**How to avoid:** Save the Brave key first; on save failure, surface the error rather than proceeding to test.

**Warning signs:** Test "passes" but the key stored differs from what the user sees in the field.

### Pitfall 6: `result_filter` omission includes non-web results

**What goes wrong:** Without `result_filter=web`, the response may include `news`, `videos`, `discussions`, etc. at the top level. Code that reads `data.web.results` still works (those other keys are ignored), but including `result_filter=web` is cheaper and cleaner.

**How to avoid:** Always pass `result_filter=web` for Phase 8 web search.

---

## Code Examples

### Verified Request Shape

```typescript
// Source: api-dashboard.search.brave.com/documentation/quickstart (verified)
const url = new URL('https://api.search.brave.com/res/v1/web/search');
url.searchParams.set('q', query);
url.searchParams.set('count', '10');
url.searchParams.set('result_filter', 'web');

const response = await fetch(url.toString(), {
  headers: {
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip',
    'X-Subscription-Token': apiKey,
  },
  signal: abortController.signal,
});
```

### SearchResult Type (to add to types.ts)

```typescript
// types.ts — D-01: full contract consumed by Phase 9
export interface SearchResult {
  /** Page title from Brave */
  title: string;
  /** Verbatim Brave URL — NEVER mutated (SERP-02) */
  url: string;
  /** Raw Brave snippet, may contain <strong> HTML (text_decorations=true default).
   *  Phase 9 strips to plain text (SERP-03). Phase 8 passes through untouched. */
  description: string;
  /** Pre-parsed hostname for display and favicon derivation (e.g. "wikipedia.org") */
  hostname: string;
  /** Optional: Brave-proxied favicon URL from meta_url.favicon or profile.img */
  faviconUrl?: string;
}
```

### searchTranslated Message Types (to add to types.ts)

```typescript
// types.ts — D-02
export interface SearchTranslatedMessage extends Message {
  type: 'searchTranslated';
  payload: {
    query: string;          // Already-translated query string (Phase 11 translates; Phase 8 uses as-is)
    sourceLanguage: string; // For source==target short-circuit (D-06)
    targetLanguage: string;
  };
}

export interface SearchTranslatedResponse {
  results?: SearchResult[];
  direct?: boolean;     // true when source==target (D-06)
  error?: string;
  kind?: ErrorKind;
}

export interface TestBraveKeyMessage extends Message {
  type: 'testBraveKey';
}
```

### Updated MessageType Union

```typescript
// types.ts — add two new members
export type MessageType =
  | 'translate'
  | 'translateResponse'
  | 'setBadge'
  | 'getSettings'
  | 'settingsResponse'
  | 'swapDirection'
  | 'toggleCompose'
  | 'yoloTranslate'
  | 'directionSwapped'
  | 'getUsage'
  | 'resetUsage'
  | 'predict'
  | 'searchTranslated'   // NEW Phase 8
  | 'testBraveKey';      // NEW Phase 8
```

### Updated Settings Interface (to add to types.ts)

```typescript
// types.ts — D-03: braveApiKey is top-level, NOT in apiKeys map
export interface Settings extends TranslationConfig, ProviderConfig {
  predictHotkey: string;
  composeHotkey: string;
  yoloHotkey: string;
  swapHotkey: string;
  braveApiKey: string;   // NEW Phase 8
}

// DEFAULT_SETTINGS: add
braveApiKey: '',         // NEW Phase 8
```

### background.ts case sketch

```typescript
// background.ts — new imports
import { BraveSearchClient } from './brave-search.js';
import type { SearchTranslatedMessage, SearchResult } from './types.js';

const braveClient = new BraveSearchClient();
const inFlightSearches = new Map<string, Promise<SearchResult[]>>();

// Inside the switch:
case 'searchTranslated': {
  const msg = message as SearchTranslatedMessage;
  const { query, sourceLanguage, targetLanguage } = msg.payload;
  const settings = await getSettings();
  const apiKey = settings.braveApiKey;

  if (!apiKey) {
    sendResponse({ error: 'Brave API key not configured — add it in options', kind: 'auth' });
    break;
  }

  // D-06: source==target short-circuit
  const isDirect = sourceLanguage === targetLanguage;

  // D-05: In-flight dedup
  const dedupKey = query.trim().toLowerCase();
  if (inFlightSearches.has(dedupKey)) {
    try {
      const results = await inFlightSearches.get(dedupKey)!;
      sendResponse({ results, direct: isDirect });
    } catch (err) {
      sendResponse({ error: (err as any).message, kind: (err as any).kind ?? 'unknown' });
    }
    break;
  }

  const promise = braveClient.search(query, apiKey, { count: 10 });
  inFlightSearches.set(dedupKey, promise);
  try {
    const results = await promise;
    inFlightSearches.delete(dedupKey);
    sendResponse({ results, direct: isDirect });
  } catch (err) {
    inFlightSearches.delete(dedupKey);
    sendResponse({ error: (err as any).message, kind: (err as any).kind ?? 'unknown' });
  }
  break;
}

case 'testBraveKey': {
  const settings = await getSettings();
  const apiKey = settings.braveApiKey;
  if (!apiKey) {
    sendResponse({ ok: false, error: 'Brave API key is empty — enter it in options', kind: 'auth' });
    break;
  }
  try {
    await braveClient.search('test', apiKey, { count: 1 });
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ ok: false, error: (err as any).message, kind: (err as any).kind ?? 'unknown' });
  }
  break;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Brave free tier (2,000–5,000 queries/mo, no card) | $5 prepaid metered credits, credit card required | Feb 2026 | Users need a paid Brave account; docs should mention $0.005/query cost |
| `X-Subscription-Token` header for auth | Same — unchanged | — | No change required |

**Deprecated/outdated:**

- References to "1,000 free queries/month" in the CONTEXT.md specifics section: the actual current figure is ~$5 of credits (~1,000 at $0.005/query), not a free tier. The constraint still holds for budgeting purposes but should not be described as "free" in user-visible text.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | `npm test` | ✓ | `node --test` built-in | — |
| TypeScript compiler | `npm run build` | ✓ | `^5.2.2` (package.json) | — |
| `https://api.search.brave.com` | BraveSearchClient fetch | ✓ (external) | REST API | No fallback — requires user Brave API key |
| Brave API key | BYOK | user-supplied | — | Options page field required; test button surfaces absence |

**Missing dependencies with no fallback:**
- Brave API key: user must supply via options page; the test action (SSET-02) surfaces absence clearly.

**Missing dependencies with fallback:**
- None

---

## Validation Architecture

> `workflow.nyquist_validation` is absent from config.json — treating as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` |
| Config file | none — `npm test` runs `node --test 'test/**/*.mjs'` |
| Quick run command | `npm test` |
| Full suite command | `npm test` (same — all tests in `test/unit.mjs`) |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SRCH-04 | `BraveSearchClient.search()` maps `web.results[]` to `SearchResult[]` | unit (mock fetch) | `npm test` | ❌ Wave 0 |
| SRCH-04 | Missing key → throws with `kind: 'auth'` | unit | `npm test` | ❌ Wave 0 |
| SRCH-05 | source==target returns `direct: true` in handler response | unit | `npm test` | ❌ Wave 0 |
| SRCH-06 | Duplicate in-flight query reuses same Promise, not two Brave calls | unit (spy on fetch) | `npm test` | ❌ Wave 0 |
| SSET-01 | `migrateSettings()` provides default `braveApiKey: ''` for legacy blobs | unit | `npm test` | ❌ Wave 0 |
| XLT-01 | `searchTranslated` handler reads key from `getSettings()`, not message payload | unit (inspect call args) | `npm test` | ❌ Wave 0 |
| D-07 | HTTP 429 from Brave → `kind: 'search_quota'`, message contains "quota" | unit | `npm test` | ❌ Wave 0 |
| D-07 | Network error → `kind: 'network'` | unit | `npm test` | ❌ Wave 0 |
| D-07 | HTTP 401 → `kind: 'auth'` | unit | `npm test` | ❌ Wave 0 |

All new tests extend `test/unit.mjs`. The project uses Node.js ESM imports from compiled `dist/`; new test cases import from `dist/brave-search.js` and `dist/errors.js`.

### Sampling Rate

- **Per task commit:** `npm test` (full suite — currently ~33 tests, fast)
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `test/unit.mjs` — add `classifyBraveError` tests (extends existing test file)
- [ ] `test/unit.mjs` — add `BraveSearchClient` tests with mocked fetch
- [ ] `test/unit.mjs` — add `migrateSettings` test for `braveApiKey` default
- [ ] `src/brave-search.ts` — new file to create
- [ ] `src/errors.ts` — extend `ErrorKind` with `'search_quota'`; add `classifyBraveError`

*(No new test framework needed — existing infrastructure handles all cases)*

---

## Security Domain

> `security_enforcement` not set in config.json — treating as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | API key stored in `chrome.storage.local`; never in `localStorage` or DOM; never in message payload |
| V3 Session Management | no | Extension has no session concept |
| V4 Access Control | yes | Key only readable from background worker and options page (extension pages); content scripts have no access |
| V5 Input Validation | yes | `query` parameter max 400 chars / 50 words per Brave docs; validate before sending |
| V6 Cryptography | no | BYOK key is stored as plain text in local storage — same as existing LLM keys; no encryption applied |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key exfiltration via message payload | Information disclosure | D-04: key never in `searchTranslated`/`testBraveKey` payload; worker reads from storage |
| Query injection (malformed q param) | Tampering | URL `searchParams.set()` encodes automatically; no manual interpolation |
| XSS via `description` field | Tampering | Phase 8 returns raw HTML in `description`; Phase 9 must use `textContent`, not `innerHTML` (SERP-03). Phase 8 must document this in the type comment. |
| Quota draining via rapid submits | Denial of resource | D-05 in-flight dedup; D-04 test uses `count=1`; no auto-retry on 429 |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `meta_url.favicon` is present in Brave web result items | Standard Stack / Code Examples | `faviconUrl` in SearchResult would always be undefined; fallback to Google favicon service in Phase 9 is unaffected |
| A2 | `text_decorations=true` produces `<strong>` HTML tags (not some other marker) | Common Pitfalls / Architecture | Phase 9 XSS stripping logic may need adjustment if Brave uses a different decoration syntax |
| A3 | Brave 429 has no documented body; detection is status-code-only | Brave Search API section | If Brave returns a meaningful body, the error message could be improved; safe to ignore body |
| A4 | Rate limit is 1 req/s (confirmed via rate-limiting docs) | Brave Search API section | Confidence HIGH based on official docs page; labeled MEDIUM overall because pricing changed Feb 2026 |

---

## Open Questions

1. **`testBraveKey` save-before-test UX race**
   - What we know: D-04 says key validation routes through the background worker; worker reads from storage.
   - What's unclear: Does the user expect "Save Settings" first before testing, or should the "Test Brave Key" button implicitly save the Brave key field only?
   - Recommendation: Implicit partial save of the Brave key field only (not full settings) before sending `testBraveKey` message. This matches UX expectations and avoids requiring a full save first.

2. **`search_lang` from settings**
   - What we know: Brave accepts `search_lang` to bias results to a specific language. Phase 8 receives `targetLanguage` in the message payload (the language the query is written in).
   - What's unclear: Should Phase 8 pass `search_lang` derived from `targetLanguage`? The `search_lang` param uses ISO 639-1 codes (`en`, `ja`, `fr`) but `settings.targetLanguage` is a human-readable name (`"Japanese"`).
   - Recommendation: Map common human-readable language names to ISO codes in `BraveSearchClient`. For Phase 8, a small lookup table for the most common cases is sufficient; unmapped languages fall back to no `search_lang` param.

3. **`faviconUrl` field: Brave-proxied vs. direct**
   - What we know: Brave provides `meta_url.favicon` (and/or `profile.img`) as proxied URLs through `imgs.search.brave.com`. These are valid but point to Brave's CDN.
   - What's unclear: Will Phase 9 use these directly, or prefer `https://www.google.com/s2/favicons?domain=` construction?
   - Recommendation: Include `faviconUrl?: string` in `SearchResult`, populated from `meta_url.favicon ?? profile?.img`. Phase 9 decides which to use — Phase 8 just carries the data.

---

## Sources

### Primary (HIGH confidence)

- [Brave Search API Reference — web/search GET](https://api-dashboard.search.brave.com/api-reference/web/search/get) — endpoint, params, response schema
- [Brave Search API Quickstart](https://api-dashboard.search.brave.com/documentation/quickstart) — minimal fetch example, required headers
- [Brave Search API Rate Limiting Guide](https://api-dashboard.search.brave.com/documentation/guides/rate-limiting) — 429 semantics, `X-RateLimit-*` headers
- [Chrome for Developers — Network Requests in Extensions](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests) — MV3 host_permissions + CORS bypass
- Codebase: `src/background.ts`, `src/types.ts`, `src/errors.ts`, `src/options.ts`, `src/options.html`, `manifest.json`, `test/unit.mjs`, `package.json` — all verified directly

### Secondary (MEDIUM confidence)

- [brave/brave-search-skills SKILL.md](https://github.com/brave/brave-search-skills/blob/main/skills/web-search/SKILL.md) — web.results field list (official Brave repo)
- [implicator.ai — Brave drops free tier](https://www.implicator.ai/brave-drops-free-search-api-tier-puts-all-developers-on-metered-billing/) — Feb 2026 pricing change details
- [agentdeals.dev — Brave Search API free tier 2026](https://agentdeals.dev/vendor/brave-search-api) — current pricing, rate limits

### Tertiary (LOW confidence)

- WebSearch cross-verification for `meta_url.hostname`, `profile.img`, and `<strong>` decoration behavior — confirmed by multiple sources but not from official Brave schema docs

---

## Metadata

**Confidence breakdown:**

- Brave endpoint + auth + response shape: HIGH — verified from official API reference and quickstart
- Rate limits + 429: HIGH — verified from official rate-limiting guide
- Current pricing (Feb 2026 change): MEDIUM — multiple secondary sources agree; official pricing page not directly fetched
- `text_decorations` / `<strong>` behavior: MEDIUM — confirmed via multiple WebSearch sources but official schema not directly read
- MV3 host_permissions requirement: HIGH — verified from official Chrome extension docs

**Research date:** 2026-06-03
**Valid until:** 2026-09-03 (Brave API endpoint/auth is stable; pricing structure changes frequently — re-verify before user docs)
