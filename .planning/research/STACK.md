# Stack Research

**Domain:** Chrome Extension (MV3) — AI-powered inline translation IME
**Researched:** 2026-05-24 (v1.0) / 2026-06-02 (v1.2 Translated Search additions) / 2026-06-20 (v1.3 Image Translation additions)
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

## v1.3 Image Translation: Stack Additions

> **Scope reminder:** v1.3 adds **side-panel text-only** image OCR+translation. NO in-image
> overlay / inpaint / bounding-box geometry. That single fact drives the entire recommendation
> below. Out-of-scope (do NOT add): on-device/Chrome built-in AI, manga/overlay OSS stack,
> Azure. (Per `.planning/research/SOURCES.md`.)

### Headline Recommendation

**Add image OCR+translate as a single multimodal call, reusing hime's existing provider abstraction. Default to a vision-capable LLM (Claude Vision recommended as best-OCR default; Gemini 2.5 Flash / OpenAI as already-wired alternatives). Do NOT adopt the Google Cloud Vision + Cloud Translation v3 two-API stack.**

One line of why: for text-only side-panel output, Google's bounding-box geometry is the only thing its two-call stack buys you — and you don't use it. Meanwhile that path costs two API calls, two billing meters, and — fatally for BYOK — either **two API keys** or a **service-account-JSON OAuth2 signer** (because Translation **v3 does not accept API keys**), which breaks hime's no-backend / single-bearer-token pattern. A vision LLM does OCR **and** translation in one bearer-auth POST structurally identical to the OpenAI/Gemini provider files already shipped.

### (1) Provider Comparison — Vision LLM (single call) vs Google Vision + Translation v3

| Criterion | **Vision LLM single call (Claude / Gemini / OpenAI)** ✅ | Google Cloud Vision + Translation v3 |
|-----------|----------------------------------------------------------|--------------------------------------|
| **API calls / image** | **1** (OCR + translate fused in one prompt) | **2** (`images:annotate` → `translateText`) |
| **BYOK key surface** | **1 bearer key** (`x-api-key` / `Authorization`) — same shape as existing providers | Vision takes an API key (`?key=`), but **Translation v3 does NOT support API keys** → service-account JSON + OAuth2 JWT signing, OR drop to Translation **v2** (key-based) = **2 keys**. Both worse. |
| **Fits no-backend SW bearer pattern** | **Yes** — copy a provider file, swap endpoint/body | **No** — OAuth2 JWT signing in the service worker, or a 2nd key + 2nd host_permission + 2nd billing project |
| **Bounding-box geometry** | None | Word/paragraph bbox — **unused** by a text-only side panel = pure cost |
| **Latency** | One round-trip (~1–4 s typical page image) | Two sequential round-trips → additively slower |
| **Accuracy: photos/screenshots/messy CJK** | Strong; tolerant of rotation/low-contrast; context-aware so translation reads coherently | Vision OCR extracts glyphs well, but you then translate **detached** fragments (layout/context lost) → can read worse on vertical/fragmented CJK |
| **Accuracy: dense documents** | Good; very large blobs can hit token/dimension scaling | `DOCUMENT_TEXT_DETECTION` is purpose-built for dense pages — its one genuine edge |
| **Cost** | Per-token: image ≈ `(w×h)/750` tokens + output. Resize long edge → 1568 px cuts cost 40–70% with no OCR loss | Vision: 1k units/mo free then **$1.50/1k images**; Translation v3: 500k chars/mo free then **$20/1M chars** — two meters |
| **Integration cost in hime** | **Low** — one new `vision.ts` file | **High** — two endpoints, two auth schemes, two host_permissions, OAuth signing |

**Decision: vision LLM, single call.** The lone case Google wins (dense-document OCR + reusable bbox) is explicitly out of scope (no overlay). Everything that matters here — one key, one call, no backend, no OAuth signing, contextual translation — favors the LLM path.

**Re-evaluate Google only if** a future milestone adds real in-image overlay/inpaint (needs word bboxes) OR users report mis-OCR on dense/vertical-CJK documents. Then Google Vision `DOCUMENT_TEXT_DETECTION` is the authority. Track as deferred, not a v1.3 task.

### Provider sub-recommendation (which LLM)

Since hime **already ships** OpenAI + Gemini providers with host_permissions and BYOK keys, make the vision path **provider-agnostic** and let users translate with the key they already hold:

- **Claude Vision** — recommended quality default for OCR robustness (rotation/low-contrast/messy photos). NEW host_permission + NEW key.
- **Gemini 2.5 Flash vision** — **lowest marginal cost to add**: provider, host_permission, and key already exist; multimodal single-call. Strong runner-up; lead with this if minimizing new surface.
- **OpenAI GPT-5 vision** — also already wired; offer for users holding only an OpenAI key.

Implement a provider-agnostic `VisionProvider`; Claude is the recommended **default model**, not the only one.

### (2) Getting Image Bytes to the API from MV3 — fallback ladder (all in the SW)

All encode/POST happens **in the service worker** (key stays off the page — hime's "all network in background" invariant holds; content script does DOM only).

| Path | When | How | Gotchas |
|------|------|-----|---------|
| **1. SW `fetch(srcUrl)`** (primary) | Normal `<img>` with a fetchable URL | `contextMenus.onClicked` → `info.srcUrl`; SW `fetch(srcUrl)` → `blob()` → base64 | Works cross-origin **from the SW** via `host_permissions`. **Add `"<all_urls>"`** so arbitrary image hosts are reachable — the existing API-only host list is insufficient. |
| **2. `srcUrl` data/blob passthrough** | `src` already `data:`/`blob:` | Use `info.srcUrl` directly; for `data:` strip the `base64,` prefix | Zero network. `blob:` URLs are page-scoped — fetch in the **content script** and hand bytes to the SW, or fall to path 3. |
| **3. `chrome.tabs.captureVisibleTab`** (fallback) | Cross-origin **canvas-tainted** imgs, CSS `background-image`, or any fetch that CORS/403-fails | SW captures visible tab → `data:image/...;base64,…`; optionally crop to the `<img>` rect (content script reports `getBoundingClientRect()` + `devicePixelRatio`) | Needs `activeTab` (already held) or `<all_urls>`. Captures **visible** pixels only — fine since manual/progressive triggers act on visible images. Request `format:'jpeg', quality:N` to shrink. |

### (3) Chrome `contextMenus` + `sidePanel` — manifest + permissions

```jsonc
{
  "permissions": [
    "activeTab",      // existing — also powers captureVisibleTab fallback
    "storage",        // existing
    "scripting",      // existing
    "contextMenus",   // NEW — right-click "Translate image with hime"
    "sidePanel"       // NEW — side-panel output surface
  ],
  "host_permissions": [
    "https://api.openai.com/*",
    "https://generativelanguage.googleapis.com/*",
    "https://openrouter.ai/*",
    "https://api.search.brave.com/*",
    "https://api.anthropic.com/*",   // NEW — Claude vision endpoint (only if Claude added)
    "<all_urls>"                     // NEW — fetch arbitrary <img> bytes in the SW
  ],
  "side_panel": { "default_path": "sidepanel.html" }   // NEW
}
```

- Create the menu from the SW in `chrome.runtime.onInstalled` (the existing `onInstalled` listener in `background.ts`): `chrome.contextMenus.create({ id:"hime-translate-image", title:"Translate image with hime", contexts:["image"] })`.
- `chrome.contextMenus.onClicked` receives `info.srcUrl` + the originating `tab` — free image URL, and the click is a user gesture.
- `<all_urls>` host permission is what lets the SW `fetch()` third-party image bytes. Privacy-lighter alternative: rely on `captureVisibleTab` under `activeTab` only (skip path 1) — but path 1 is more reliable; recommend `<all_urls>` and document it for store review. `optional_host_permissions` + runtime grant is the middle ground if review pushes back.

#### ⚠️ Critical gotcha — `sidePanel.open()` user-gesture rule

`chrome.sidePanel.open()` (Chrome ≥116) **must be called synchronously inside the user-gesture stack.** In `contextMenus.onClicked` you HAVE a gesture — but **if you `await chrome.tabs.sendMessage(...)` (or any async hop) BEFORE calling `open()`, the gesture is consumed and `open()` throws** "may only be called in response to a user gesture" (known Chromium behavior, tracker issues 40929586 / 355266358).

**Pattern:** in `onClicked`, call `chrome.sidePanel.open({ tabId })` **first, synchronously**, THEN start the async fetch→vision→render pipeline and push results into the panel via messaging. Never await before `open()`.

### (4) Image encoding & size limits (Claude Vision — verified; LLM-agnostic guidance)

| Constraint | Claude value | hime action |
|------------|--------------|-------------|
| Supported MIME | `image/jpeg`, `image/png`, `image/gif`, `image/webp` | Map blob MIME; re-encode exotic (`svg+xml`, `avif`) via `OffscreenCanvas.convertToBlob({type:'image/png'})` in the SW |
| Max file size (base64) | **10 MB** (direct Claude API; 5 MB on Bedrock/Vertex — N/A) | Guard before send; downscale if over |
| Max dimensions | **8000×8000 px** (rejected above); stricter **2000×2000** if >20 images/request | Single-image requests are safe; never batch >20 |
| Recommended long edge | **1568 px** (larger auto-downscaled server-side) | Pre-downscale to ≤1568 px long edge via `OffscreenCanvas` in the SW → **40–70% cheaper, no OCR-accuracy loss** |
| Token cost estimate | `tokens ≈ (width × height) / 750` | Feed the existing token-usage meter |
| Min useful size | avoid <200 px (hallucination risk) | Skip/flag tiny icons in progressive mode |
| Max images/request | 100 (200k-context models) | Translate one image per request in v1.3; no batching |
| Source format | base64 `{type:"base64", media_type, data}` **or** `{type:"url"}` | **Prefer base64** so fetch/CORS stays SW-controlled and capture-fallback (always a data URL) uses one code path |

`captureVisibleTab` returns `data:image/jpeg|png;base64,…` — strip the `data:…;base64,` prefix and pass straight through as the base64 `data`.

> Gemini/OpenAI multimodal accept similar base64-inline image parts; the same downscale-to-1568px + MIME-guard logic applies. Confirm each provider's exact field shape when implementing (`inline_data` for Gemini, `image_url`/base64 data-URL for OpenAI).

### v1.3 Architecture Fit (mirror existing patterns)

- **New provider** `src/providers/vision.ts` mirroring `openai.ts`: e.g. `ocrTranslate(imageBase64, mime, config, apiKey, model) → { originalText, translatedText }`. Reuse `classifyError`, the `AbortController` timeout, and the usage-token shape.
- **Abstraction:** vision is a different shape (image in, dual-text out) than `TranslationProvider` — add a sibling `VisionProvider` interface in `types.ts` rather than overloading `translate()`. New key under `apiKeys` (e.g. `'anthropic'`), top-level like the Brave precedent — never smuggle keys through messages.
- **Background worker:** add a `translateImage` message type; SW owns fetch→encode→vision→respond (same as the Brave/translate flow). Reuse the v1.2 **in-flight dedup map** for progressive concurrency control.
- **Side panel:** new `sidepanel.html` + `sidepanel.ts` added to `copy-assets`; render **XSS-safe** (`textContent` only) exactly like the v1.2 SERP renderer.
- **Progressive mode:** content-script `IntersectionObserver` (web built-in, zero-dep), default OFF behind a settings flag (the `PREDICT_ENABLED` precedent), debounced, with `rootMargin` to pre-fetch slightly before visible; sends visible-image requests to the SW.

### v1.3 Supporting Libraries

| Library | Version | Purpose | When |
|---------|---------|---------|------|
| _(none new at runtime)_ | — | fetch→base64→POST is native `fetch` + `OffscreenCanvas`/`FileReader`/`btoa` in the SW | Keeps the zero-runtime-dep posture |
| `@types/chrome` | bump `^0.0.246` → ~`^0.0.260`+ (dev only) | Types for `chrome.sidePanel.*` (the current pin predates stable sidePanel types) | So `chrome.sidePanel.*` typechecks |

### v1.3 What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Google Cloud Translation **v3** (BYOK) | No API-key support → service-account JSON + OAuth2 JWT signing in the SW; breaks no-backend single-bearer BYOK | Vision LLM single-call (or, if forced onto Google, Vision key + Translation **v2** key = 2 keys) |
| Google Vision `DOCUMENT_TEXT_DETECTION` bbox stack | Value is geometry for overlay — out of scope (text-only side panel) | Vision LLM; revisit Google only when overlay/inpaint lands |
| `tesseract.js` / local WASM OCR | On-device OCR explicitly deferred; weak on photos & CJK; bloats SW; no translate step | Cloud vision LLM (BYOK) |
| manga-image-translator / comic-text-detector / LaMa | Overlay/inpaint craft — deferred; huge dep surface; no vendor CJK-overlay guidance | Nothing this milestone (text-only) |
| Reading image bytes / calling vision API **from the content script** | Exposes the key on the page; CSP/CORS friction; violates "all network in the SW" | fetch + encode + POST in the **service worker** |
| `chrome.action.default_popup` for output | Closes on blur, too small for original+translation pairs | `chrome.sidePanel` (persists, resizable) |
| Sending the API key inside a runtime message | Key-leak surface; contradicts v1.2 Brave-key precedent | SW reads key from `chrome.storage` directly |
| `await`-ing before `chrome.sidePanel.open()` | Consumes the user gesture → `open()` throws | Call `open({tabId})` synchronously first, then run async pipeline |

### v1.3 Alternatives Considered

| Recommended | Alternative | When to use alternative |
|-------------|-------------|-------------------------|
| Claude Vision (default) | **Gemini 2.5 Flash vision** | Lowest marginal add — provider/host/key already exist. Lead with this to add ZERO new host_permission/key; reuse the user's existing Gemini key. |
| Claude Vision | **OpenAI GPT-5 vision** | Same single-call shape, already wired; use if user only holds an OpenAI key |
| base64 image source | Claude `{type:"url"}` source | If you want Claude to fetch the image itself — but loses SW-controlled fetch/CORS and breaks the single capture-fallback path; not recommended |
| `<all_urls>` host_permission | `optional_host_permissions` + runtime grant | If store review objects to broad host access; per-origin grant on first image translate (more UX friction) |
| Side panel | Action popup | Never for paired original+translation output (popup too small, closes on blur) |

### v1.3 Version Compatibility

| Package / API | Compatible With | Notes |
|---------------|-----------------|-------|
| `chrome.sidePanel` | Chrome ≥114 (API), ≥116 (`open()`) | Fine for MV3 target; `open()` is the gesture-sensitive method (see gotcha) |
| `chrome.sidePanel` types | `@types/chrome` ≥ ~`0.0.260` | Current `0.0.246` pin likely lacks sidePanel types → bump dev dep |
| Claude Messages vision | `anthropic-version: 2023-06-01`; models `claude-haiku-4-5` / `claude-sonnet-4-5` | base64 source is GA (not beta); `{type:"url"}` also GA |
| `captureVisibleTab` | `activeTab` OR `<all_urls>` | Works with `activeTab` hime already declares |
| `host_permissions: <all_urls>` | existing API host entries | Additive; no effect on existing providers |

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

### v1.3 Sources (2026-06-20)

- `/websites/platform_claude_en_api` (Context7) — image block params, base64 source, supported MIME (jpeg/png/gif/webp) — HIGH
- https://platform.claude.com/docs/en/build-with-claude/vision (official) — size limits (10 MB, 8000×8000, 1568 px long edge, ~(w×h)/750 tokens), max images/request, base64 vs URL source — HIGH
- `/websites/developer_chrome_extensions_reference_api` (Context7) — `sidePanel` permission + `setOptions`, `contextMenus` permission, `captureVisibleTab` (activeTab/<all_urls>, returns base64 data URL) — HIGH
- https://developer.chrome.com/docs/extensions/reference/api/sidePanel — sidePanel API surface, manifest `side_panel.default_path` — HIGH
- Chromium extensions groups + tracker issues 40929586 / 355266358 — `sidePanel.open()` user-gesture-consumed-by-async-await gotcha — MEDIUM (community + tracker, consistent)
- https://docs.cloud.google.com/translate/docs/authentication — Translation **v3 does not support API keys** (service account/OAuth required); v2 supports API keys — HIGH
- https://docs.cloud.google.com/vision/docs/request + buildmvpfast pricing — Vision REST `images:annotate`, API-key OR OAuth; Vision $1.50/1k after 1k free, Translation $20/1M chars after 500k free — MEDIUM (verify live pricing)
- `.planning/research/SOURCES.md` — vetted spine (Google Vision/Translation/Claude vision/Chrome network+capture) — authoritative
- Existing codebase: `src/providers/openai.ts`, `src/types.ts`, `manifest.json`, `src/background.ts` — provider/abstraction/worker patterns to mirror — HIGH

---
*Stack research for: hime Chrome Extension (MV3 + TypeScript)*
*Researched: 2026-05-24 (v1.0) / 2026-06-02 (v1.2 Translated Search) / 2026-06-20 (v1.3 Image Translation)*
