# hime

## What This Is

A Chrome extension that lets you type in English and get inline Japanese (or any language) output without leaving your text field. Two modes: Compose (toggle in/out of translation mode) and YOLO (one-shot replace the whole field). Keyboard-native, no mouse, no menus. Targets anyone who thinks in English but needs to write in Japanese — conversational speakers, learners, professionals.

## Core Value

Type English, get natural Japanese inline — without breaking your keyboard flow.

## Requirements

### Validated

- ✓ Chrome Extension scaffold (Manifest V3, TypeScript, Vite) — v1.0
- ✓ Provider abstraction layer with OpenAI (GPT-5 mini, GPT-5 nano) and Gemini (2.5 Flash) — v1.0
- ✓ All API calls routed through background service worker (avoids CSP issues) — v1.0
- ✓ Content script reads/replaces text in `<input>`, `<textarea>`, and `contenteditable` elements — v1.0
- ✓ Undo-compatible text replacement via `document.execCommand('insertText')` — v1.0
- ✓ Compose mode: `Ctrl+Shift+T` toggles, blue border + "ON" badge, Escape cancels — v1.0
- ✓ YOLO mode: `Ctrl+Shift+Y` translates entire field in one shot — v1.0
- ✓ Swap language hotkey `Ctrl+Shift+S`, badge shows 2-letter target code, persisted — v1.0
- ✓ Settings page: provider, API key, model, storage mode, source/target language, formality, custom prompt — v1.0
- ✓ Formality control: Auto / Casual / Polite / Formal with language-specific prompt instructions — v1.0
- ✓ BYOK — user provides their own API key, stored in `chrome.storage.local` or `chrome.storage.session` — v1.0
- ✓ Error states: badge turns red ("ERR") on failure, "Test Connection" in settings — v1.0
- ✓ Skips password, readonly, hidden, and disabled fields — v1.0
- ✓ Extension packaged as `hime-v1.0.0.tar.gz`, load-unpacked ready — v1.0

### Active

- [ ] Prompt engineering validation — test Auto formality with diverse inputs (casual slang, business formal, technical); confirm output contains no stray quotes or explanations
- [ ] Cross-site testing — verify compose + YOLO + undo on Google Search, Gmail, GitHub, Google Docs, Notion, Slack web, Discord web, Twitter/X; document any contenteditable edge cases

### Out of Scope

- System-wide (non-browser) IME support — requires native OS integration, separate product
- Offline / local model support — BYOK API model; no local inference in scope
- Streaming / translate-as-you-type — complexity not justified by UX gain for short inputs
- Multiple simultaneous language pairs — one pair, swappable; adding rotation adds cognitive overhead
- Non-Chrome browsers — MV3 APIs differ enough to be a separate port; Firefox/Safari deferred
- Chrome Web Store submission — deferred until v1 is stable; load-unpacked for dev iteration (review takes 1-3 days per submission, requires screenshots + privacy policy)
- Backend / server-side proxy — eliminated in favor of BYOK direct API calls; no hosting needed
- Learning / spaced repetition features — out of scope for v1; different product dimension
- Hotkey rebinding in options page — Chrome commands API handles this at `chrome://extensions/shortcuts`; duplicating it in the options UI adds complexity without value

## Context

- Greenfield build completed to v1.0 in one pass (tasks 1-7 and 10 done)
- Background service worker handles all LLM API calls; content script only manages DOM and UX state
- `document.execCommand('insertText')` is deprecated but remains the only cross-site undo-safe replacement method in Chrome extensions — no better alternative exists
- Chrome commands API limits extensions to 4 registered hotkeys; currently using 3 (`toggle-compose`, `yolo-translate`, `swap-language`)
- The biggest open risk is `contenteditable` behavior on complex editors (Google Docs, Notion) — these intercept keyboard events and have non-standard DOM structures that may break text replacement

## Constraints

- **Tech stack**: TypeScript + Chrome MV3 — all features must work within MV3 service worker lifetime and CSP restrictions
- **No backend**: Direct API calls only — no server to deploy, maintain, or secure
- **API key security**: Keys stored client-side in `chrome.storage.local` or `.session` — warn users in settings UI; no mitigation beyond that
- **Hotkey slots**: Chrome commands API caps at 4 registered hotkeys per extension
- **Undo compatibility**: Text replacement must use `document.execCommand('insertText')` to preserve native undo stack — direct DOM mutation (innerHTML, textContent) breaks Ctrl+Z

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Chrome-only, MV3 | Tight v1 scope; MV3 is the current standard | ✓ Good |
| Compose + YOLO two-mode design | Compose for precision, YOLO for speed — covers both workflows | ✓ Good |
| BYOK, no backend | Eliminates hosting/ops cost; user owns their key and rate limits | ✓ Good |
| API calls in background service worker | Content scripts face CSP restrictions; background worker has none | ✓ Good |
| `document.execCommand('insertText')` for replacement | Only undo-safe cross-site replacement method available in Chrome | — Pending (deprecated API, may break eventually) |
| Auto-formality as default | LLM infers tone from input; best UX for Japanese specifically | — Pending (needs validation testing) |
| Provider abstraction layer | Swappable OpenAI/Gemini without touching content script or background logic | ✓ Good |
| Compose indicator: border + badge | Badge alone is easy to miss; border provides in-field feedback; together they're redundant-by-design | ✓ Good |
| Hotkey rebinding via Chrome's built-in shortcuts | Avoids duplicating rebind UI; `chrome://extensions/shortcuts` already exists | ✓ Good |
| Name: "hime" | Japanese for "princess" / sounds like IME; clean and memorable | ✓ Good |

---
*Last updated: 2026-05-24 after v1.0 build complete (tasks 1-7, 10 done; tasks 8-9 active)*
