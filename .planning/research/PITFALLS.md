# Pitfalls Research

**Domain:** Chrome Extension (MV3) — Translated Search (v1.2 milestone)
**Researched:** 2026-06-02
**Confidence:** HIGH — MV3 lifetime behavior and CORS are documented platform facts; Brave API limits confirmed from official rate-limit docs; batch-translation failure mode confirmed from real-world Weblate issue tracker; snippet HTML confirmed from live API example

---

## Critical Pitfalls

### Pitfall 1: Brave Search API Called from Content Script (Key Leakage + CORS Failure)

**What goes wrong:**
If the SERP page (an extension page or injected content script) makes the Brave Search `fetch()` directly, two things break: (1) the API key is visible in the request from DevTools and accessible to any code running in that page context, and (2) content scripts are not granted host permissions and will hit a CORS block. Extension content scripts initiate requests on behalf of the *web origin they are injected into*, not the extension origin, so CORS is not bypassed even when `host_permissions` is declared.

**Why it happens:**
Developers see that the SERP page is "their" code and make the call inline for convenience, forgetting that the page's fetch origin is either the web page or `chrome-extension://`, and that only background service workers receive the CORS exemption from declared `host_permissions`.

**How to avoid:**
Route all Brave Search API calls through the background service worker via `chrome.runtime.sendMessage`, exactly as existing LLM calls are handled. Declare `"https://api.search.brave.com/"` in `host_permissions` in the manifest. The service worker's fetch is exempted from CORS by the declared host permission. The API key never leaves the service worker.

**Warning signs:**
DevTools Network tab shows the Brave API key in the `X-Subscription-Token` header from a non-background context. Fetch fails with CORS error in an extension page.

**Phase to address:** Phase 1 (API integration scaffold) — establish the message-passing contract for `braveSearch` messages before any UI is built, mirroring the existing `translate` message pattern in `background.ts`.

---

### Pitfall 2: Brave Search API Snippet Fields Contain Raw HTML Markup

**What goes wrong:**
The Brave Search API returns `description` (and `extra_snippets`) fields with embedded HTML tags — specifically `<strong>` wrapping matched keywords (e.g., `"Best <strong>Greek</strong> <strong>Restaurants</strong>..."`). If these strings are inserted into the SERP page via `innerHTML`, a malicious search result could inject arbitrary HTML/JS. If they are inserted via `textContent`, the literal `<strong>` tags appear as visible text. Neither naive approach is correct.

**Why it happens:**
Developers see "snippets" and assume they are plain text. The field name gives no indication it contains markup. Google Custom Search has the same pattern, so it's a widespread gotcha.

**How to avoid:**
Parse the HTML snippet with `DOMParser` or a safe strip function before rendering; extract the text content (which preserves the human-readable words) and optionally re-wrap matched terms in your own `<mark>` spans for styling. Never pass raw Brave snippet strings to `innerHTML`. Use `element.textContent = strippedText` for safe insertion. If you want to preserve keyword highlighting, strip all tags except `<strong>` using an allowlist parser.

**Warning signs:**
Any code path that assigns a Brave API result field directly to `.innerHTML`. Snippets appearing with literal angle brackets in the rendered page. A crafted search query that returns a snippet containing `<script>` or `<img onerror=...>` tags.

**Phase to address:** Phase 2 (SERP rendering) — establish the HTML-to-safe-text normalization helper at the very start of building the results list component, before any result rendering is attempted.

---

### Pitfall 3: Batch Translation Miscount — Model Merges or Drops Results

**What goes wrong:**
Sending all N result titles+snippets in a single JSON array for translation is cost-efficient, but LLMs frequently corrupt the array: they merge two adjacent short items into one, skip items they consider "generic" or identical, re-order items, or truncate the array when it is long. The result is a translated array of length M ≠ N. Attempting to zip the translated array back onto the original results produces wrong titles on wrong URLs — a silent data corruption that is hard to detect.

**Why it happens:**
LLMs are trained to be helpful. If item 5 is a very short generic phrase (e.g., "Home" or a URL-like fragment), the model may decide it needs no translation and silently omit it. When arrays exceed ~10 items, attention drift causes merging. The structured output guarantee only covers the *shape* of JSON, not the count of array elements.

**How to avoid:**
Translate in a keyed object, not a plain array: `{ "0": "title text", "1": "snippet text", ... }`. A keyed object makes an absent key immediately detectable vs. a shifted array. After parsing the response, assert `Object.keys(result).length === expectedCount`; if the count mismatches, fall back to individual item translation (or display the original untranslated text for the dropped items). Do not use `response_format: { type: "json_object" }` alone — also validate counts. Keep batch size to ≤ 10 items per call to reduce drift risk.

**Warning signs:**
Translated results with titles that don't match the source language page they link to. Array length after translation differs from the input. Results rendered with off-by-one index misalignment (result 3's title on result 4's URL).

**Phase to address:** Phase 3 (translation integration) — build the keyed-object translation contract and count-assertion logic before wiring the batch call. Write a unit test that feeds a 10-item array with one "generic" item and asserts all 10 positions are returned.

---

### Pitfall 4: Service Worker Terminates Mid-Search (Multi-Await Chain)

**What goes wrong:**
A full translated search involves at minimum 3 serial async operations: (1) translate query, (2) Brave Search API call, (3) batch-translate results. Each await point resets the 30-second idle timer, but if any step is slow (LLM call takes 8–12 seconds, Brave search takes 3 seconds, batch translation takes 10+ seconds), the total wall-clock time can exceed 5 minutes for the worker's maximum single-request runtime. More practically, if Chrome is under memory pressure, the worker can be terminated between any two awaits with no error surfaced to the caller.

**Why it happens:**
Developers test on fast networks with short inputs. The 30-second per-event reset makes it seem like long chains are fine. But each await is a yield point — if the runtime terminates the worker between the Brave call and the translation call, the pending `sendMessage` port closes silently.

**How to avoid:**
Send progress events back to the SERP page (`chrome.tabs.sendMessage` or a persistent port via `chrome.runtime.connect`) after each stage completes, so the page can render partial results and the user has feedback. This also means the SERP page can display translated-query + raw results even if the final translation step fails. Keep each individual API call under 15 seconds (set fetch timeouts). For the translation step, if batch translation fails, degrade to displaying raw (untranslated) snippets rather than a blank page.

**Warning signs:**
The SERP page spins indefinitely on slow connections. DevTools shows the message port closed unexpectedly. Search succeeds on WiFi, hangs on mobile hotspot.

**Phase to address:** Phase 3 (translation integration) — implement the three-stage progress model (query-translated → results-raw → results-translated) as the fundamental UX contract, not a later enhancement.

---

### Pitfall 5: URL Fields Included in Translation Batch (Link Corruption)

**What goes wrong:**
If the URL field from a Brave result is accidentally included in the batch sent to the LLM for translation, the model will "translate" it — changing `https://ja.wikipedia.org/wiki/東京` to a garbled or language-shifted string. The rendered result's link then 404s or navigates to a wrong page.

**Why it happens:**
Developers build the translation payload by iterating result objects and including all text-like fields, or they include the URL as context to help the model "understand" the snippet. URLs look like text to the model.

**How to avoid:**
Explicitly whitelist which fields are sent for translation: only `title` and `description` (and optionally `extra_snippets`). Never include `url`, `profile.url`, `meta_url`, `favicon_url`, or any other URL field. In the SERP renderer, always use the *original* `url` field from the Brave API response for `<a href>`, never the translated version.

**Warning signs:**
Rendered result links contain translated fragments (e.g., `https://en-japanese.wikipedia.org/...`). Clicking results leads to 404 pages. URLs with internationalized path segments get mangled.

**Phase to address:** Phase 2 (SERP rendering) — establish the data model that separates `displayTitle`, `displaySnippet` (translated) from `originalUrl` (immutable) before the translation layer is wired.

---

### Pitfall 6: Source == Target Language — Silent No-Op or Wasted API Call

**What goes wrong:**
If the user has source=English and target=English (or swapped to the same language), the query translation is a no-op but still costs an LLM API call. The Brave results come back in English. The result translation is another wasted call. The user sees no difference from a regular search but has burned quota. Worse: if they have source=Japanese and target=Japanese, the LLM may attempt to "translate Japanese to Japanese" and produce paraphrased (incorrectly modified) results.

**Why it happens:**
The SERP page inherits the global settings from `chrome.storage`. The user may have set source == target during some earlier session. No guard exists in the current `translateText()` flow because for inline editing the same-language case is caught by the Japanese-character auto-detect heuristic — which does not generalize to arbitrary languages.

**How to avoid:**
At the start of a search, compare `settings.sourceLanguage` to `settings.targetLanguage`. If they are equal, skip both translation steps entirely and call Brave Search directly with the raw query, displaying results as-is. Show a subtle "Searching in [language]" indicator so the user understands why no translation occurred. This also removes a full round-trip of latency.

**Warning signs:**
Settings page shows source and target set to the same language. Console logs show translation calls with identical `source` and `target` config fields.

**Phase to address:** Phase 1 (API integration scaffold) — add the guard in the search orchestration function before the first translation call.

---

### Pitfall 7: Brave Search Free Tier / Credit Exhaustion — Unhandled 429

**What goes wrong:**
Brave Search API returns HTTP 429 when rate limits are hit. The free tier (legacy: 2,000 queries/month at 1 req/sec; new accounts: ~$5 credit/month) depletes quickly if the user searches frequently. A 429 with no specific UX handling will surface as a generic "search failed" error or, if not caught at all, a silent blank SERP.

Additionally, the rate-limit is 1 query/second on the free tier — rapid-fire searches (pressing Enter repeatedly) will hit this immediately.

**How to avoid:**
Handle 429 specifically in the background service worker's Brave fetch call: surface a distinct "Search quota exceeded — check your Brave API key plan" message to the SERP page. Do not retry on 429 (that makes it worse). Add a 1-second debounce on the search input so repeat Enter presses do not fire multiple requests. Check `X-RateLimit-Remaining` headers in the response and optionally surface a low-quota warning in the SERP header.

**Warning signs:**
Rapid test searches (5+ per minute) produce 429 errors. The first search of a new month works; subsequent searches during testing fail.

**Phase to address:** Phase 1 (API integration scaffold) — include 429 detection and user-facing messaging in the initial Brave fetch wrapper, not as a later hardening pass.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| N individual LLM calls for N results | Simpler code, no index-count validation needed | N × latency, N × cost, hits per-minute rate limits on GPT-4o class models at N>5 | Never for production — batch with keyed object from day one |
| `innerHTML` for snippet rendering | Preserves Brave's `<strong>` highlights with zero effort | XSS vector; one malicious snippet can run arbitrary JS in extension page | Never — strip HTML first, then optionally re-add safe highlights |
| Including URL fields in translation payload | "More context" for model | URL corruption, broken links | Never — whitelist only title and description |
| No same-language guard | One less conditional | Wasted API quota + potential result paraphrasing | Never — the check is 3 lines |
| `sendMessage` for the full search flow (single response) | Simpler than persistent ports | No progress feedback; worker termination mid-chain drops entire result | Acceptable for Phase 1 MVP; migrate to persistent port (`chrome.runtime.connect`) in Phase 3 |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Brave Search API | Calling from content script or extension page directly | Route through background service worker; declare `"https://api.search.brave.com/"` in `host_permissions` |
| Brave Search API | Treating `description` as plain text | Strip HTML tags before rendering; never assign to `innerHTML` |
| Brave Search API | Assuming free tier is unlimited | 2,000 queries/month legacy; new accounts get ~$5 credit (~1,000 queries); handle 429 explicitly |
| Brave Search API | Requesting >20 results per page | Hard cap is 20 per request; offset max is 9 (pages 0–9); no cursor-based pagination |
| LLM batch translation | Plain array `[item1, item2, ...]` | Use keyed object `{ "0": item1, "1": item2 }` and assert key count after parse |
| LLM batch translation | Relying on `json_object` response format alone for correctness | Validate element count post-parse; fall back to individual calls or untranslated display on count mismatch |
| OpenAI structured outputs | Assuming `response_format: json_object` prevents dropped items | It guarantees valid JSON, not correct array length — count assertions are still required |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Serial query→search→translate chain with no progress feedback | User waits 15–25 seconds with blank screen | Send progress events after each stage; render raw results before translation completes | On any LLM model slower than GPT-5 mini |
| N individual translation calls for N results | 10 results = 10 LLM round-trips; 30–60 seconds total | Batch in single keyed-object call; fall back per-item only on count mismatch | Immediately — N=10 at 3s/call = 30s |
| No debounce on search submit | Rapid Enter presses fire multiple parallel searches | 800ms debounce on search input; disable submit button while in-flight | On any keyboard-heavy user; also hits Brave 1 req/sec rate limit |
| Fetching `extra_snippets: true` always | 5 extra snippets per result multiplies translation payload | Fetch extra_snippets only when displaying a detail view; use only `description` for the list SERP | When translating 20 results with 5 snippets each = 120 strings per batch call |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Brave API key passed to SERP page | Key visible in extension page JS memory and DevTools; exfiltrable via page JS | Key stays in service worker; SERP page sends query text, receives results — never the key |
| `innerHTML` assignment of raw Brave snippet fields | XSS in extension page (`chrome-extension://` origin); `<script>` in snippet executes with extension CSP | Use `textContent` for text, `DOMParser` + allowlist for styled snippets |
| Raw Brave API error objects passed to SERP page | May include request headers (Authorization, X-Subscription-Token) in error.config | Serialize only `{ error: string }` — never the raw Response or Error object |
| URL field included in translation batch | Translated URLs corrupt navigation; user's origin URL is mutated | Whitelist only `title` and `description` for translation; `url` is immutable in the data model |
| No CSP on SERP extension page | Inline event handlers in rendered results could execute | SERP page must have `default-src 'self'` CSP; no `unsafe-inline`; all dynamic content via textContent |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Blank page until all translation finishes | 15–25 second white screen; user assumes extension broke | Render raw (untranslated) results immediately after Brave response; overlay translated versions when ready |
| No indication search is in progress | User double-submits, causing parallel requests and quota waste | Disable submit, show spinner, display "Translating query..." / "Searching..." / "Translating results..." stages |
| Source == target produces no feedback | User sees results but doesn't know why they are untranslated | Show "Searching directly in [language] — source and target are the same" notice |
| Partial translation failure (some results translate, some don't) | Silently mixed translated/untranslated results confuse user | On per-item failure, show original text with a "(not translated)" label, not a blank snippet |
| No empty-results state | Blank result list looks like a loading state or bug | Detect `web.results` array of length 0 and display "No results found for [translated query]" |
| Translated query not shown to user | User doesn't know what was actually searched | Display "Searched for: [translated query]" subtitle under the search box — critical for trust and debugging |

---

## "Looks Done But Isn't" Checklist

- [ ] **Snippet XSS:** Verify that a result with `<script>alert(1)</script>` in its description field does NOT execute — only renders as text.
- [ ] **URL immutability:** Click every result link after translation — confirm all links navigate to the actual source page, not a translated/corrupted URL.
- [ ] **Batch count assertion:** Feed a translation batch where one item is an empty string — verify the returned keyed object still contains all keys, and the UI handles an empty translation gracefully.
- [ ] **Same-language guard:** Set source=Japanese, target=Japanese in settings, run a search — verify no LLM calls are made and results are displayed directly.
- [ ] **429 handling:** Mock a 429 from the Brave API — verify a clear "quota exceeded" message appears, not a generic error or blank page.
- [ ] **Service worker termination:** Using DevTools → Service Workers → Stop, terminate the worker mid-search — verify the SERP page shows an error state, not a permanent spinner.
- [ ] **Key stays in worker:** Run a search, open DevTools on the SERP page, inspect all `chrome.runtime.sendMessage` payloads — confirm no payload contains `X-Subscription-Token` or the Brave API key string.
- [ ] **Raw results fallback:** If the result translation step fails (mock LLM 500), verify raw untranslated results are displayed instead of a blank SERP.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Key leakage via SERP page direct call | LOW (code fix) / HIGH (if key already leaked) | Move fetch to service worker immediately; user rotates Brave API key |
| XSS via snippet innerHTML | LOW | Replace innerHTML with textContent + safe HTML parser; 1–2 hours |
| Batch translation count mismatch | MEDIUM | Retrofit keyed-object format; add count assertion + per-item fallback; 4–6 hours |
| Worker termination drops search | MEDIUM | Migrate to persistent port + three-stage progress model; 4–8 hours |
| URL corruption in links | LOW | Remove URL from translation whitelist; audit data model; 1 hour |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Brave API key leakage / direct page call | Phase 1 — API integration scaffold | DevTools confirms no key in SERP page network requests or message payloads |
| Snippet HTML / XSS | Phase 2 — SERP rendering | Inject `<script>alert(1)</script>` as mock snippet; assert no execution |
| URL fields in translation batch | Phase 2 — SERP rendering | All result links navigate correctly after translation round-trip |
| Batch translation count mismatch | Phase 3 — translation integration | Unit test: 10-item keyed batch with one empty string asserts 10 keys returned |
| Worker termination mid-chain | Phase 3 — translation integration | DevTools stop-worker mid-search; error state shown within 15s |
| Source == target no-op guard | Phase 1 — API integration scaffold | same-source-target setting produces 0 LLM calls in console |
| 429 rate limit handling | Phase 1 — API integration scaffold | Mock 429; distinct quota-exceeded message displayed |
| No progress / blank screen | Phase 3 — translation integration | Raw results visible before translation finishes on throttled network |
| Partial translation failure | Phase 3 — translation integration | Mock LLM 500 mid-batch; untranslated fallback displayed with label |

---

## Sources

- Brave Search API rate limits: https://api-dashboard.search.brave.com/documentation/guides/rate-limiting
- Brave Search API snippet HTML: confirmed via live API example showing `<strong>` tags in `description` field
- Brave Search pagination limits (count max 20, offset max 9): https://api-dashboard.search.brave.com/app/documentation/web-search/query
- Chrome MV3 host_permissions bypass CORS: https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
- Chrome MV3 extended service worker lifetimes (Chrome 110+): https://developer.chrome.com/blog/longer-esw-lifetimes
- LLM batch translation item-drop failure: https://github.com/WeblateOrg/weblate/issues/17825
- Brave kills free tier, moves to metered billing: https://www.implicator.ai/brave-drops-free-search-api-tier-puts-all-developers-on-metered-billing/

---

*Pitfalls research for: hime v1.2 Translated Search — Chrome MV3 extension*
*Researched: 2026-06-02*
