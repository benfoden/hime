# Stack Research

**Domain:** Chrome Extension (MV3) — AI-powered inline translation IME
**Researched:** 2026-05-24
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

---

## Version Compatibility Notes

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `typescript@^5.2.2` | `@types/chrome@^0.0.246` | Both current; no known conflicts |
| `tsc` ES2020 target | Chrome 85+ | Chrome has been above this floor since 2020; no concern |
| `document.execCommand('insertText')` | Chrome (all versions to date) | Deprecated in spec but Chrome intentionally keeps it working for accessibility reasons; no removal announced |

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

---
*Stack research for: hime Chrome Extension (MV3 + TypeScript)*
*Researched: 2026-05-24*
