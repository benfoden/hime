---
status: ready-for-handoff
---

# hime — AI-Native IME

## 💡 Idea

A Chrome extension that lets you type in English and get natural Japanese (or any language) output inline, right where you're typing. No menus, no mouse — pure keyboard-driven translation.

## 🎯 Problem

Typing in foreign languages (especially Japanese) sucks if you're not fluent in the writing system. Existing IMEs require you to think in the target language's phonetics. If you speak conversational Japanese but your kanji is weak, you're stuck copying from Google Translate like it's 2009.

There's no tool that lets you just type what you mean in English and output natural-sounding Japanese (or any language) inline, right where you're typing.

## 🔨 Solution

A Chrome extension with two input modes — both keyboard-native, zero mouse interaction required.

### Compose Mode (default)
1. Hit hotkey to enter compose mode
2. Type English naturally
3. Hit same hotkey to convert — English is replaced with Japanese
4. Visual indicator while composing (subtle colored border on the text field + extension badge change)

### YOLO Mode
1. Type English in any input field
2. Hit YOLO hotkey — entire input field content is translated and replaced in one shot

### Swap Language
- Hotkey to toggle language direction (e.g. English↔Japanese)
- Badge on extension icon shows current direction

Cmd+Z / Ctrl+Z undoes any replacement.

### Default Hotkeys (configurable in settings)

- **Compose toggle:** `Ctrl+Shift+T`
- **YOLO translate:** `Ctrl+Shift+Y`
- **Swap language:** `Ctrl+Shift+S`

### Architecture

```
[Chrome Extension] → [LLM Provider API (direct)]
     ↑
   hotkeys
   compose mode
   text replacement
   settings UI
   BYOK key management
```

No backend. Extension calls provider APIs directly. BYOK (Bring Your Own Key).

## ✅ Success Criteria

- [ ] Compose mode: enter → type → convert in under 2 seconds
- [ ] YOLO mode: single hotkey replaces entire field in under 2 seconds
- [ ] Works in any text field in Chrome (`<input>`, `<textarea>`, `contenteditable`)
- [ ] Configurable language pair (default: English → Japanese)
- [ ] Hotkey to swap language direction
- [ ] Cmd+Z / Ctrl+Z undoes replacement
- [ ] Natural-sounding output with auto-detected formality
- [ ] Multi-provider support (OpenAI, Google Gemini)
- [ ] BYOK — user provides their own API key

## 📦 Scope

### In
- Chrome Extension (Manifest V3)
- Compose mode (hotkey toggle)
- YOLO mode (single hotkey, whole field)
- Swap language hotkey
- Visual compose mode indicator (border + badge)
- Direct API calls to LLM providers (no backend)
- BYOK API key management
- Model selector (GPT-5 mini, GPT-5 nano, Gemini 2.5 Flash)
- Formality control (auto / casual / polite / formal)
- Settings page: API key, provider, model, language pair, formality, hotkey config
- Instant inline replacement
- Undo support via Cmd+Z / Ctrl+Z

### Out (for now)
- System-wide (non-browser) support
- Offline mode
- Translate-as-you-type (streaming)
- Multi-pair rotation (one pair, swappable)
- Learning features
- Non-Chrome browsers
- Backend / server-side proxy

## 🛠 Tech Stack

- **Extension:** TypeScript, Chrome Extension Manifest V3
- **APIs (direct, no backend):**
  - OpenAI — GPT-5 mini (default), GPT-5 nano
  - Google Gemini — Gemini 2.5 Flash
- **Key storage:** `chrome.storage.local` (default, persisted) with optional `chrome.storage.session` (memory-only, cleared on browser close)
- **Translation prompt:** System prompt instructs the model to translate to `{target_language}`, output only the translation, use natural native-sounding phrasing, and auto-detect appropriate formality level from the input's tone and style (with manual override if set).

## 📋 Tasks

- [ ] **1. Scaffold Chrome extension (Manifest V3, TypeScript)**
  - Set up project structure: `manifest.json`, background service worker, content script, options page
  - TypeScript + bundler (Vite or webpack recommended for MV3)
  - Minimal manifest with required permissions: `activeTab`, `storage`, `commands`
  - **Acceptance criteria:**
    - Extension loads in Chrome via load-unpacked
    - Background service worker runs
    - Content script injects into pages

- [ ] **2. Direct API integration + provider abstraction**
  - Implement API client abstraction layer with provider interface:
    ```typescript
    interface TranslationProvider {
      name: string;
      translate(text: string, config: TranslationConfig): Promise<string>;
    }
    ```
  - Implement OpenAI provider (GPT-5 mini, GPT-5 nano)
  - Implement Gemini provider (Gemini 2.5 Flash)
  - API calls from background service worker (not content script — avoids CSP issues)
  - Content script sends message to background worker → worker calls API → returns result
  - Handle errors gracefully: invalid key, rate limit, network failure → show brief inline notification or badge error state
  - **Acceptance criteria:**
    - Translate call works with OpenAI key + GPT-5 mini
    - Translate call works with Gemini key + Gemini 2.5 Flash
    - Switching providers in settings changes which API is called
    - Error states shown clearly (badge turns red + tooltip with error)

- [ ] **3. Basic content script: read/replace text in focused input**
  - Content script detects currently focused input element (`<input>`, `<textarea>`, `contenteditable`)
  - Can read text content from the focused element
  - Can replace text content using `document.execCommand('insertText')` for undo-compatible replacement
  - Communication with background worker via `chrome.runtime.sendMessage`
  - **Acceptance criteria:**
    - Content script reads text from any standard input field
    - Text replacement works and Ctrl+Z / Cmd+Z undoes it
    - Works on `<input>`, `<textarea>`, and `contenteditable`

- [ ] **4. Compose mode**
  - First press of `Ctrl+Shift+T`: enter compose mode on the currently focused input field
    - Add CSS class to the field: colored border (e.g. 2px solid `#4A90D9`) to indicate compose mode is active
    - Change extension badge text to "ON" with colored background
    - Start tracking keystrokes in that field (store compose buffer, or just grab field content on convert)
  - Second press of `Ctrl+Shift+T`: trigger translation
    - Grab text typed since compose mode started (or full field content if simpler — see implementation note)
    - Send to translation API
    - Replace the composed text with translation result
    - Remove compose mode indicator (border + badge reset)
    - Exit compose mode
  - Pressing `Escape` while in compose mode: cancel and exit without translating, remove indicators
  - Edge cases:
    - If user clicks into a different field while composing → cancel compose mode on the original field
    - If field loses focus → cancel compose mode
  - **Implementation note:** Simplest approach is to snapshot the field content on first press, then on second press diff against current content to get the composed text. Alternative: just translate the entire field content. Start with entire field content — simpler, and matches YOLO behavior.
  - **Acceptance criteria:**
    - First hotkey press shows visual indicator (border + badge)
    - Second hotkey press translates and replaces text, removes indicator
    - Escape cancels compose mode
    - Works on `<input>`, `<textarea>`, and `contenteditable` elements
    - Ctrl+Z / Cmd+Z undoes the replacement

- [ ] **5. YOLO mode**
  - `Ctrl+Shift+Y` on any focused input field:
    - Grab entire field content
    - Show brief loading state (badge spinner or "..." badge text)
    - Send to translation API
    - Replace entire field content with result
    - Reset badge
  - If field is empty, do nothing
  - **Acceptance criteria:**
    - Single hotkey replaces entire field content with translation
    - Loading indicator shown during API call
    - Empty fields are no-ops
    - Ctrl+Z / Cmd+Z undoes the replacement

- [ ] **6. Swap language hotkey + badge**
  - `Ctrl+Shift+S` toggles the language direction
  - Default pair: English ↔ Japanese
  - Badge shows current target language as 2-letter code (e.g. "JP" or "EN")
  - Persisted in `chrome.storage.local` so it survives browser restart
  - **Acceptance criteria:**
    - Hotkey toggles direction
    - Badge updates immediately
    - Direction persists across sessions
    - Next translation uses the new direction

- [ ] **7. Settings page**
  - Chrome extension options page (accessible via right-click extension icon → Options)
  - Sections:
    - **API Configuration**
      - Provider selector: OpenAI / Google Gemini
      - API key input (password field, show/hide toggle)
      - Model selector (populated based on provider):
        - OpenAI: GPT-5 mini (default), GPT-5 nano
        - Gemini: Gemini 2.5 Flash
      - "Test connection" button — sends a simple translate call to verify key works
      - Storage mode toggle: "Persistent" (chrome.storage.local) / "Session only" (chrome.storage.session, cleared on browser close)
      - Warning text: "Your API key is stored locally in your browser."
    - **Translation**
      - Source language (text input, default: "English")
      - Target language (text input, default: "Japanese")
      - Formality: Auto (default) / Casual / Polite / Formal
      - Auto description: "Matches formality to the tone of your input — casual English becomes casual Japanese, formal becomes formal"
    - **Hotkeys**
      - Compose mode: key combo input (default: Ctrl+Shift+T)
      - YOLO mode: key combo input (default: Ctrl+Shift+Y)
      - Swap language: key combo input (default: Ctrl+Shift+S)
      - Note: use Chrome's commands API for global hotkeys where possible
    - **Advanced**
      - Custom system prompt override (textarea, for power users who want to tweak the translation prompt)
  - All settings saved to `chrome.storage.local` (except API key which respects storage mode toggle)
  - **Acceptance criteria:**
    - All settings persist and take effect immediately
    - Test connection works for both providers
    - Hotkey changes take effect without reload
    - Invalid API key shows clear error

- [ ] **8. Translation prompt engineering**
  - Default system prompt:
    ```
    You are a translation engine. Translate the following text to {target_language}.
    Output ONLY the translated text — no explanations, no quotes, no markdown.
    Use natural, native-sounding phrasing that a native speaker would actually use.
    {formality_instruction}
    ```
  - Formality instructions by setting:
    - **Auto:** "Match the formality level to the tone of the input. Casual, informal input → casual output. Professional, formal input → polite/formal output."
    - **Casual:** "Use casual, informal language (e.g. for Japanese: タメ口、plain form)."
    - **Polite:** "Use polite, standard language (e.g. for Japanese: です/ます form)."
    - **Formal:** "Use formal, respectful language (e.g. for Japanese: 敬語/keigo)."
  - Test with diverse inputs:
    - Casual: "hey what's up" → casual Japanese
    - Polite: "Thank you for your help with this matter" → です/ます
    - Slang: "that's fire bro" → appropriate casual equivalent
    - Technical: "Please review the quarterly financial report" → formal
  - **Acceptance criteria:**
    - Auto mode correctly shifts formality based on input tone
    - Manual overrides produce the expected formality level
    - Output contains ONLY the translation (no extra text, quotes, or explanation)

- [ ] **9. Polish & cross-site testing**
  - Test on:
    - Standard inputs: Google Search, login forms
    - Textareas: Gmail compose, GitHub issues/PRs
    - Rich text / contenteditable: Google Docs, Notion, Slack web, Discord web, Twitter/X compose
    - Edge cases: password fields (skip these), readonly fields (skip), hidden fields (skip)
  - Undo testing: verify Cmd+Z / Ctrl+Z works on each site
  - Performance: translation round-trip should be < 2 seconds on reasonable connections
  - Error handling: test with invalid key, expired key, network offline
  - **Acceptance criteria:**
    - Works reliably on the top 10 most common text input sites
    - Graceful degradation on tricky contenteditable implementations
    - No console errors in normal operation

- [ ] **10. Package & publish**
  - Create GitHub repo
  - Write README: what it does, install (load-unpacked), BYOK setup, hotkeys, supported models
  - Add MIT license
  - Chrome Web Store submission deferred — develop and test via load-unpacked for rapid iteration
  - Web Store only when v1 is stable and ready to share (review takes 1-3 days per submission, requires screenshots + privacy policy)

## 🧠 Decision Log

- **2025-02-08** — Chrome-only scope → Decided to start with Chrome Extension (Manifest V3) only, no system-wide support. Keeps scope tight for v1.
- **2025-02-08** — Two-mode design → Compose mode (toggle on/off) for precision, YOLO mode (one-shot) for speed. Covers both careful and fast workflows.
- **2025-02-08** — Keyboard-only interaction → No menus, no mouse, no selection required. All hotkeys. Cmd+Z for undo. Keeps it native-feeling.
- **2025-02-08** — Backend proxy via Vercel → Next.js API route proxies OpenAI calls. Keeps API key server-side, enables rate limiting.
- **2025-02-08** — gpt-4o-mini as default model → Speed over max quality for inline translation. gpt-4o available as fallback option.
- **2025-02-08** — Name: "hime" → Japanese for "princess" / sounds like IME. Clean, memorable.
- **2026-02-11** — Migrated from split PRD.md + Tasks.md to unified project doc format.
- **2026-02-11** — BYOK model → No backend. User provides their own API key. Stored in `chrome.storage.local` (default) or `chrome.storage.session` (optional, session-only). Eliminates Vercel backend entirely.
- **2026-02-11** — Cut Vercel backend → Extension calls LLM APIs directly from background service worker. Simpler architecture, no deploy/hosting needed.
- **2026-02-11** — Multi-provider support → OpenAI (GPT-5 mini default, GPT-5 nano) and Google Gemini (2.5 Flash). Provider abstraction layer for easy extension.
- **2026-02-11** — Auto-formality as default → LLM auto-detects appropriate formality from input tone. Manual override available: casual / polite / formal. Best UX for Japanese specifically.
- **2026-02-11** — Compose mode indicator → Colored border on active field (2px solid) + extension badge text change ("ON"). Both together — badge alone is easy to miss, border alone doesn't persist across tab switches.
- **2026-02-11** — No rate limiting needed → BYOK means the provider handles rate limits on the user's key. Extension just surfaces rate limit errors gracefully.

## 🤝 Handoff Notes

### Current State
- No code written yet — this is a greenfield build
- Previous tasks 1–4 marked as done were from an earlier plan iteration; treat the task list below as the full build scope

### Build Order
Tasks are numbered in recommended build order (1→10). Each builds on the previous.

### Key Technical Notes
- All API calls must go through the background service worker (not content script) to avoid CSP restrictions
- Use `chrome.runtime.sendMessage` for content script ↔ background worker communication
- `contenteditable` elements (Google Docs, Notion, etc.) need special handling — `document.execCommand('insertText')` for undo-compatible replacement, NOT direct `innerHTML` or `textContent` manipulation
- For `<input>` and `<textarea>`, use `document.execCommand('insertText')` or the Input Events API to preserve undo stack
- Chrome commands API for hotkeys (manifest `commands` field) — but note the 4-command limit. May need to handle some hotkeys via content script keyboard listeners instead.

### Provider API Patterns
```typescript
// OpenAI
POST https://api.openai.com/v1/chat/completions
Headers: Authorization: Bearer {key}
Body: { model: "gpt-5-mini", messages: [{role: "system", content: systemPrompt}, {role: "user", content: inputText}], temperature: 0.3 }

// Gemini
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={key}
Body: { contents: [{parts: [{text: inputText}]}], systemInstruction: {parts: [{text: systemPrompt}]} }
```

## ❓ Open Questions

- [x] ~~Compose mode indicator~~ → Border + badge (decided 2026-02-11)
- [x] ~~Formality setting~~ → Auto-detect default + manual override (decided 2026-02-11)
- [x] ~~Rate limiting~~ → Not needed, BYOK (decided 2026-02-11)
- [x] ~~Existing code~~ → Greenfield, no existing code (confirmed 2026-02-11)
- [x] ~~License~~ → MIT (decided 2026-02-11)
- [x] ~~Chrome Web Store~~ → Deferred. Load-unpacked for dev/testing. Web Store when stable (decided 2026-02-11)
