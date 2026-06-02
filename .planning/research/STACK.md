# Stack Research

**Domain:** Chrome Extension (MV3) — AI-powered inline translation IME
**Researched:** 2026-05-24 (v1.0) / 2026-06-02 (v1.2 Translated Search additions)
**Confidence:** HIGH (stack already validated in v1.0; findings are observational + gap analysis)

---

## Actual v1.0 Stack (Validated)

### Core Technologies

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| TypeScript | ^5.2.2 | Primary language | Strict mode catches Chrome API misuse at compile time; `.ts` extension + `@types/chrome` gives full autocomplete for `chrome.*` APIs |
| Chrome MV3 | n/a | Extension platform | Current standard; MV2 is deprecated and being sunset by Google; MV3 service worker model enforces the correct security boundary (no persistent background pages) |
| @types/chrome | ^0.0.246 | Chrome API type definitions | Required companion to TypeScript; covers `chrome.storage`, `chrome.action`, `chrome.runtime`, `chrome.tabs`, `chrome.commands` |
| tsc (plain) | bundled with TS | Build / transpile | Compiles to individual `.js` files; no bundling step; assets copied via npm shell scripts |
| ES2020 target | n/a | Output compatibility | Matches Chrome's baseline; covers async/await, optional chaining, nullish coalescing without polyfills |
| Vanilla HTML/CSS/JS | n/a | Popup + options UI | No framework overhead; popup is small enough (~100 lines) that React/Vue would add more complexity than they remove |
| Python 3 | system | Icon generation | One-off script (`build-icons.py`) that generates PNG icons from SVG; not part of the runtime |

### Provider Abstraction

| Component | Purpose | Notes |
|-----------|---------|-------|
| `TranslationProvider` interface | Swappable LLM backend | Defined in `types.ts`; both providers implement `translate(text, config, apiKey, model)` |
| `OpenAIProvider` | Chat Completions API (`gpt-5-mini`, `gpt-5-nano`) | Direct `fetch()` to `api.openai.com` — no SDK; keeps bundle zero-dep |
| `GeminiProvider` | Gemini API (`gemini-2.5-flash`) | Direct `fetch()` to `generativelanguage.googleapis.com` — same pattern |

### Runtime Architecture

| Component | File | Runs In | Responsibility |
|-----------|------|---------|----------------|
| Background service worker | `background.ts` | Service worker context | All LLM API calls; badge management; hotkey dispatch; storage reads |
| Content script | `content.ts` | Page context | DOM: detect focused element, inject border/indicator, replace text |
| Popup | `popup.ts` + `popup.html` | Extension popup | Status display, quick actions |
| Options page | `options.ts` + `options.html` | Extension tab | Settings persistence (`chrome.storage.local`) |

---

## v1.2 Translated Search: Stack Additions

### New External API: Brave Search

#### Endpoint

```
GET https://api.search.brave.com/res/v1/web/search
```

Verified against official Brave Search API documentation (2026-06-02). This is the only endpoint needed for v1.2 — it returns web results with title, URL, and description per result.

#### Authentication

All requests require one header:

```
X-Subscription-Token: <user-api-key>
Accept: application/json
```

No OAuth, no cookies, no query-string key parameter. The header name `X-Subscription-Token` is the current production auth method — an older `apikey` query-param approach is no longer supported.

#### Key Query Parameters

| Parameter | Type | Required | Default | Notes |
|-----------|------|----------|---------|-------|
| `q` | string | YES | — | Search query; supports operators |
| `count` | integer | No | 20 | Max 20 per page |
| `offset` | integer | No | 0 | Zero-based page offset; max 9 (so max 10 pages of 20 = 200 results total) |
| `search_lang` | string | No | — | ISO 639-1 language code; use this to constrain results to the target language (e.g. `ja` for Japanese) |
| `country` | string | No | — | ISO 3166-1 alpha-2; complements `search_lang` for locale targeting |
| `extra_snippets` | boolean | No | false | Returns up to 5 additional excerpt strings per result; useful for richer translation context |

#### Response JSON Schema (web results)

```json
{
  "query": {
    "original": "string",
    "more_results_available": true
  },
  "web": {
    "results": [
      {
        "title": "string",
        "url": "string",
        "description": "string",
        "extra_snippets": ["string"]
      }
    ]
  }
}
```

The `web.results` array is what the SERP page renders. Each result has exactly `title`, `url`, and `description` — this maps directly to classic SERP card layout (title link, URL breadcrumb, snippet). `extra_snippets` is optional and only present when the `extra_snippets=true` parameter is sent.

#### Pricing and Free Tier

| Plan | Cost | Free Credits | Rate Limit |
|------|------|--------------|------------|
| Search | $5 / 1,000 requests | $5/month (~1,000 free requests) | 50 req/s |
| Answers | $4 / 1,000 req + token costs | $5/month | 2 req/s |

Use the **Search plan** only — the Answers plan is an LLM-augmented product, not needed here. The $5/month free credit covers ~1,000 searches per month, sufficient for BYOK personal use.

Confidence: HIGH (verified against `brave.com/search/api/` pricing page, 2026-06-02).

---

### CORS and Call Routing

**Verdict: Brave Search API MUST be called from the background service worker, not from the extension page directly.**

Rationale:

1. **CORS policy unknown, assume restrictive.** Brave's official documentation does not document a permissive `Access-Control-Allow-Origin: *` header for `api.search.brave.com`. Their security guidance explicitly warns against exposing API keys in client-side code, which implies browser-side direct calls are not an intended pattern.

2. **Extension pages are not service workers.** An extension page (e.g. `search.html` opened via `chrome.tabs.create`) has the same fetch-CORS restrictions as a normal webpage, even for declared `host_permissions`. Only the **background service worker** and extension pages running as `chrome-extension://` origins with declared host permissions get the CORS bypass.

3. **Consistency with existing architecture.** All LLM API calls already go through `background.ts` → `chrome.runtime.sendMessage` → response back to the caller. Adding Brave Search as a new message type (`type: 'braveSearch'`) follows the same pattern with zero new surface area.

4. **host_permissions still required.** Even though the call happens in the service worker, Chrome requires the domain to be listed in `host_permissions` for the service worker's fetch to succeed. This is a manifest change regardless.

**Call flow for v1.2:**

```
search.html (extension page)
  → chrome.runtime.sendMessage({ type: 'braveSearch', payload: { q, count, search_lang } })
    → background.ts handles message
      → fetch('https://api.search.brave.com/res/v1/web/search?...', { headers: { 'X-Subscription-Token': key } })
        → returns { web: { results: [...] } }
    → sendResponse({ results: [...] })
  → search.html renders SERP
```

Confidence: HIGH (Chrome extension network request model documented at `developer.chrome.com/docs/extensions/develop/concepts/network-requests`; CORS bypass confirmed for service workers with `host_permissions`).

---

### Manifest Changes Required

Two additions to `manifest.json`:

**1. New host_permission for Brave Search API:**

```json
"host_permissions": [
  "https://api.openai.com/*",
  "https://generativelanguage.googleapis.com/*",
  "https://openrouter.ai/*",
  "https://api.search.brave.com/*"
]
```

**2. New extension page registration (plain bundled page, NOT `chrome_url_overrides`):**

Do NOT use `chrome_url_overrides` — that replaces the new tab page, which is a heavyweight UX change inappropriate for a search feature. Instead, open the page via `chrome.tabs.create({ url: chrome.runtime.getURL('search.html') })` from the popup or a toolbar button.

No manifest entry is required to register a plain bundled HTML page — any HTML file included in the extension package is accessible via `chrome.runtime.getURL('search.html')`. The only manifest consideration is ensuring `search.html` (and its compiled JS) are present in the `dist/` output, which happens automatically with the tsc + copy-assets build.

Optionally, if a keyboard shortcut to open the search page is desired, add a `commands` entry — but this would consume the fourth and final hotkey slot (three are already in use conceptually, though currently handled in-content rather than via `chrome.commands`).

---

### Build Tooling: No Changes Needed

Plain `tsc` + shell copy-assets is sufficient for v1.2. The search page is:

- `src/search.ts` — compiled to `dist/search.js` by tsc (add to `tsconfig.json` includes if not using glob)
- `src/search.html` — copied to `dist/search.html` by the existing copy-assets script (extend it)
- `src/search.css` — copied similarly

No bundler is needed. The search page has no shared module imports that would break the tsc single-file-per-output model. The existing `import` of provider types in `background.ts` already works because tsc resolves those at compile time into the output file.

**If complexity grows** (e.g. a component-heavy SERP UI with shared utilities), consider the Vite + CRXJS migration flagged in the v1.0 section. Not warranted for v1.2.

---

### New Settings Storage Keys

No new storage mechanism needed — `chrome.storage.local` (already used) stores the Brave API key alongside LLM keys. Extend the existing `Settings` type in `types.ts`:

```typescript
// Extend apiKeys record — key is already Record<string, string>
settings.apiKeys['brave'] = '<user-key>';
```

This integrates naturally with the existing settings page and the `getSettings()` helper in `background.ts`.

---

### What NOT to Add for v1.2

| Avoid | Why |
|-------|-----|
| Backend proxy / server | Project constraint: no backend, BYOK only. Background service worker IS the proxy. |
| `chrome_url_overrides` for new tab | Replaces the browser's new tab — aggressive UX, rejected by users, high Chrome Web Store rejection risk |
| React / Vue / Svelte for SERP UI | Vanilla HTML + DOM manipulation is sufficient for a static list of ~10 result cards; a framework adds 40-100KB and a build dependency |
| `brave-search` npm package | No such stable package exists; direct fetch to the REST endpoint is 10 lines and zero dependency |
| Pagination beyond offset 1-2 | The translated SERP is a search assistant, not a full browser replacement; showing 10 results per query is the right MVP scope |
| SerpAPI or other Brave proxies | Adds cost layer and a third-party dependency; direct Brave BYOK is cleaner |
| `search_lang` auto-detection from browser locale | Use the existing `targetLanguage` from hime settings — the user already configured this |

---

## Build Tooling: Current vs. Recommended

### Current: Plain `tsc` + Shell Copy

```bash
# package.json scripts
"build": "tsc && npm run copy-assets",
"copy-assets": "mkdir -p dist/icons && cp src/icons/*.png dist/icons/ ... && cp manifest.json dist/"
```

**Limitation:** No bundling means the content script and background cannot share code via imports at runtime — each file is compiled independently. Tree-shaking and minification are absent.

### Recommended for Future Phases: CRXJS Vite Plugin

> Note: `PROJECT.md` mentions "Vite" in validated requirements but the actual implementation uses plain `tsc`. This is a gap worth closing.

| Tool | Version | Purpose | Why |
|------|---------|---------|-----|
| Vite | ^5.x | Dev server + bundler | HMR during development; production minification; proper ES module bundling |
| `@crxjs/vite-plugin` | ^2.x | Chrome extension + Vite integration | Auto-injects content scripts, handles manifest.json as config entry, handles MV3 service worker lifecycle correctly |

**Migration is low-risk:** no UI framework involved; it's a build-tool swap. The CRXJS plugin reads `manifest.json` directly and wires up Vite's entry points automatically.

---

## Supporting Libraries (Current: None — Intentionally)

No runtime npm dependencies. This is correct for a BYOK extension:

- **No HTTP client** (axios, ky, etc.) — native `fetch()` is sufficient and CSP-safe
- **No state management** — `chrome.storage.local` is the store; no Redux needed
- **No UI framework** — popup + options are simple enough for vanilla DOM
- **No i18n library** — extension UI is English-only; LLM handles target language

v1.2 adds no new runtime dependencies. Brave Search API is called via `fetch()` exactly like LLM providers.

---

## Development Tools (Missing — Recommended Additions)

| Tool | Purpose | Priority |
|------|---------|----------|
| `web-ext` (Mozilla, but works for Chrome) | Live-reload during development; replaces manual load-unpacked cycle | High |
| `vitest` or `jest` | Unit tests for provider logic and prompt-building functions | Medium |
| `eslint` + `@typescript-eslint` | Lint TypeScript; catches async/await misuse in content script vs. service worker | Medium |
| `prettier` | Code formatting consistency | Low |

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Plain `tsc` (current) → Vite + CRXJS | Webpack + `chrome-extension-webpack-boilerplate` | Only if team has existing Webpack expertise; CRXJS is more ergonomic for MV3 |
| Direct `fetch()` | `openai` npm SDK | If adding streaming or fine-grained retry logic; SDK adds ~50KB bundle and would need bundler support |
| Vanilla popup/options | React + Tailwind | If options page grows complex (multi-step config, drag-drop, etc.); premature for current scope |
| `chrome.storage.local` | IndexedDB | Only if storing translation history or large data blobs; not warranted for settings-only storage |
| `@types/chrome` | `chrome-types` | `chrome-types` is autogenerated from Chrome source; `@types/chrome` is community-maintained and more stable for day-to-day use |
| Brave Search (direct BYOK) | SerpAPI / ScaleSerp | If user cannot/will not get a Brave key; adds cost and third-party dependency — not recommended |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Manifest V2 | Google began disabling MV2 extensions in Chrome stable in 2024; no future for new work | MV3 (current) |
| `webextension-polyfill` | Adds a Promise wrapper over Chrome's callback API; MV3 with TypeScript already has native async support via `chrome.*` Promises | Native `chrome.*` APIs (already Promise-based in MV3) |
| Inline `eval()` or `new Function()` | Blocked by MV3 CSP; extension will fail to load | Static imports only |
| `innerHTML` for text replacement | Breaks native undo (Ctrl+Z) stack on all sites | `document.execCommand('insertText')` — deprecated but still the only undo-safe cross-site method |
| Direct DOM mutation (`textContent`, `.value =`) | Same undo issue; React-controlled inputs (Twitter, Notion) ignore direct `.value` writes | `execCommand('insertText')` |
| OpenAI Node.js SDK | Not designed for browser/service-worker fetch; requires Node APIs not available in Chrome service workers | Direct `fetch()` to the REST endpoint |
| `chrome_url_overrides` for search page | Hijacks new tab; too aggressive for a search assistant feature | `chrome.tabs.create({ url: chrome.runtime.getURL('search.html') })` |
| Brave Search API key in extension page JS | CORS unknown; key would be exposed in a non-service-worker context | Route all Brave calls through `background.ts` service worker |

---

## Version Compatibility Notes

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `typescript@^5.2.2` | `@types/chrome@^0.0.246` | Both current; no known conflicts |
| `tsc` ES2020 target | Chrome 85+ | Chrome has been above this floor since 2020; no concern |
| `document.execCommand('insertText')` | Chrome (all versions to date) | Deprecated in spec but Chrome intentionally keeps it working for accessibility reasons; no removal announced |
| Brave Search API `v1` | No versioning concern | REST endpoint; no SDK version to track |

---

## Model Inventory

| Provider | Models | Notes |
|----------|--------|-------|
| OpenAI | `gpt-5-mini`, `gpt-5-nano` | Mini is the quality default; nano for speed/cost; both are instruction-following models suited for translation |
| Gemini | `gemini-2.5-flash` | Google's fast, cost-effective multimodal model; competitive on Japanese translation quality |

**Model naming risk:** `gpt-5-mini` and `gpt-5-nano` are hardcoded strings in `types.ts`. OpenAI has historically renamed models (e.g., `gpt-4o-mini` → `gpt-4o-mini-2024-07-18`). Add a version-pinned alias or settings validation if API errors spike.

---

## Installation (Current)

```bash
# Clone and install (dev only — no runtime deps)
npm install

# Build
npm run build   # tsc + copy-assets → dist/

# Watch mode
npm run watch   # tsc --watch

# Package for distribution
npm run release # generates hime-extension.zip
```

## Installation (If Migrating to Vite + CRXJS)

```bash
npm install -D vite @crxjs/vite-plugin
# Remove: "build": "tsc && npm run copy-assets"
# Add vite.config.ts with crx({ manifest }) plugin
npm run build   # vite build → dist/
```

---

## Sources

- Codebase inspection (`package.json`, `tsconfig.json`, `manifest.json`, `src/`) — HIGH confidence
- Chrome Extension MV3 documentation — service worker model, commands API, CSP constraints — HIGH confidence
- `document.execCommand` deprecation status: MDN Web Docs — "deprecated, but Chrome retains for accessibility" — HIGH confidence
- CRXJS Vite plugin: `github.com/crxjs/chrome-extension-tools` — MEDIUM confidence (actively maintained, community-standard for Vite + MV3)
- OpenAI REST API vs. Node SDK in service worker context: known limitation documented in OpenAI SDK README — HIGH confidence
- Brave Search API endpoint + auth: `api-dashboard.search.brave.com/documentation/quickstart` — HIGH confidence (verified 2026-06-02)
- Brave Search API response schema: `api-dashboard.search.brave.com/app/documentation/web-search/responses` — HIGH confidence (verified 2026-06-02)
- Brave Search API query parameters: `api-dashboard.search.brave.com/app/documentation/web-search/query` — HIGH confidence (verified 2026-06-02)
- Brave Search API pricing: `brave.com/search/api/` — HIGH confidence (verified 2026-06-02)
- Chrome extension network requests + CORS bypass via host_permissions: `developer.chrome.com/docs/extensions/develop/concepts/network-requests` — HIGH confidence

---
*Stack research for: hime Chrome Extension (MV3 + TypeScript)*
*Researched: 2026-05-24 (v1.0) / 2026-06-02 (v1.2 Translated Search)*
