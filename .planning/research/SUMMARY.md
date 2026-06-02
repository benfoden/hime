# v1.2 Translated Search — Research Summary

Synthesis of STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md (researched 2026-06-02).
**Overall confidence: HIGH** — decisions derived from the actual codebase + verified Chrome MV3 behavior + Brave API official docs.
(v1.0 MVP research history is preserved in MILESTONES.md and PROJECT.md.)

## Stack Additions

| Addition | Detail |
|---|---|
| **Brave Search REST API** | `GET https://api.search.brave.com/res/v1/web/search`; auth header `X-Subscription-Token` (not query param); returns `title`, `url`, `description`, `meta_url.hostname`, `meta_url.favicon` per result |
| **`src/brave-search.ts`** | New `BraveSearchClient` fetch wrapper; no npm package; zero new runtime deps |
| **manifest `host_permissions`** | Add `"https://api.search.brave.com/*"` — required for service-worker CORS bypass |
| **`settings.braveApiKey`** | New field on existing `Settings` interface; chrome.storage.local; one new password input on options page |
| **5 new source files** | `brave-search.ts`, `search-util.ts`, `search-renderer.ts`, `search.ts`, `search.html`/`search.css` |
| **No build tooling changes** | Plain `tsc` + copy-assets sufficient; no Vite migration |
| **Brave free tier** | ~$5/mo credit (~1,000 queries); effective rate ~1 req/s; handle 429 explicitly |

## Core Architecture Decision

**Route every network call (Brave Search AND LLM translation) through the existing background service worker** via a single new `searchTranslated` message type. The search page (`search.ts`) sends ONE message for the whole pipeline (translate query → Brave fetch → batch-translate results) and receives a ready-to-render `SearchResult[]`. Keeps API-key access centralized in `background.ts` (matching the LLM-call pattern); the SERP page is a thin UI controller + pure renderer.

**Build order:** types → `BraveSearchClient` → settings UI → background handler → search utilities → renderer → search page → popup/omnibox entry point.

Page opened via `chrome.tabs.create({ url: chrome.runtime.getURL('search.html') })`. `chrome_url_overrides` is the WRONG choice (hijacks new-tab page).

## Feature Table Stakes (v1)

- Classic SERP card: favicon + hostname, translated title link, translated snippet. `href` = original `url` **verbatim — never mutated, never translated**.
- Query translation (explicit source→target direction, NOT the auto-flip in current `translateText()`) before the Brave call.
- Single `searchTranslated` round-trip; background owns all three steps.
- Batch result translation as a **keyed JSON object** `{"0": title, "1": snippet, ...}` with count assertion + raw-text fallback. NEVER a plain array.
- Translated-query disclosure line ("Searching in Japanese for: ___"), read-only — critical for trust.
- Skeleton rows during async phases (2–8s total latency makes a blank page unacceptable).
- Source == target no-op short-circuit (compare language codes before first LLM call).
- 429 handling with a distinct "search quota exceeded" message; 1s submit debounce.
- Empty / bad-key / network-failure / worker-termination states.
- XSS-safe snippet rendering (Brave `description` contains raw `<strong>` HTML — strip to plain text, never `innerHTML`).

### Explicit v1 Anti-Features (do NOT build)
Editable translated query · link proxying/click-to-translated-page · pagination/load-more · image/video result tabs · auto-detect source language (use settings value) · translate-as-you-type.

## Watch-Out-For (top pitfalls)

1. **Brave key leakage / CORS** — any Brave `fetch` outside `background.ts` exposes the key in DevTools and fails CORS. Service-worker-only.
2. **Source == target** — without the guard, same-language settings waste quota / paraphrase instead of translate.
3. **Unhandled 429** — free tier exhausts fast under dev testing; surface a specific error, do not retry.
4. **Snippet XSS via `innerHTML`** — Brave `description` has `<strong>` highlight tags; strip to text. Verify with a `<script>alert(1)</script>` mock snippet pre-ship.
5. **URL fields in translation batch** — whitelist only `title` + `description`; never pass `url`/`hostname` to the prompt (translated URLs → 404s).
6. **Batch count mismatch (silent corruption)** — LLMs drop/merge/reorder array items, mapping wrong titles to wrong URLs. Keyed object + `Object.keys(parsed).length === expectedCount` assertion + raw fallback. `json_object` guarantees valid JSON, NOT correct length.
7. **Service-worker termination mid-chain** — 3-stage serial chain can reach 15–25s. Progressive render: skeleton → raw Brave results after step 2 → translated overlay after step 3 (also the graceful-degradation path).
8. **Auto-direction-flip in `translateText()`** — existing helper auto-flips on detecting Japanese; for search, call the provider with explicit source/target or add a `translateTextExplicit()` bypass.

## Suggested Phase Structure (roadmapper finalizes)

| Phase | Name | Key Deliverable |
|---|---|---|
| 8 | API Integration Scaffold | `searchTranslated` message + Brave client + Brave-key setting + source==target guard + 429 handling |
| 9 | SERP Rendering | `SearchResult` type (immutable URL), XSS-safe renderer, skeleton/empty/error states |
| 10 | Translation Integration | Keyed batch translation, count assertion, raw fallback, three-stage progressive UX |
| 11 | Page Wiring + Entry Point | Full `search.ts` wired, debounce, popup/omnibox entry |

(Phase numbers continue from v1.1.)

---
*Research completed: 2026-06-02*
*Ready for roadmap: yes*
