# Project Research Summary

**Project:** hime — Chrome Extension (MV3) AI-powered inline translation IME
**Domain:** Browser extension, keyboard-native composition/translation tool
**Researched:** 2026-05-24
**Confidence:** HIGH

## Executive Summary

Hime is a keyboard-native inline translation extension for Chrome, built on MV3 with TypeScript and no runtime dependencies. Unlike every competitor in the space (Google Translate, DeepL, Yomitan), hime treats translation as a *writing* tool — the user types in their source language and the translated text lands directly in the active field — rather than a reading aid. This "compose in English, output in Japanese" workflow is genuinely unoccupied in the market and constitutes the product's primary moat. The v1.0 implementation is complete and functional, with the stack and architecture both well-validated.

The recommended approach for v1.x is hardening over expansion: validate prompt quality across adversarial inputs, verify cross-site compatibility on the highest-traffic complex editors (Google Docs, Gmail, Notion, Slack), and resolve the handful of known pitfalls before submitting to the Chrome Web Store. The architecture is already correct — background-as-API-gateway, provider abstraction, compose state owned by the content script — and does not need structural changes to ship.

The primary risks are all implementation-level, not architectural: LLM output containing wrapper text instead of a clean translation, `contenteditable` editors (particularly Google Docs) ignoring `document.execCommand('insertText')`, and the deprecated-but-still-working `execCommand` being the only undo-safe text replacement API available. These are known, addressable, and mapped to specific work items.

## Key Findings

### Recommended Stack

The existing v1.0 stack is appropriate and intentional: TypeScript 5.2+, Chrome MV3, `@types/chrome`, plain `tsc` build, and zero runtime npm dependencies. The no-dependency stance is correct for a BYOK extension — native `fetch()` covers all API calls, `chrome.storage` handles persistence, and vanilla DOM handles the simple popup/options UI. The only meaningful build tooling gap is the absence of Vite + CRXJS, which would provide HMR during development and proper bundling; migration is low-risk and worth addressing before significant additional feature work.

**Core technologies:**
- **TypeScript 5.2.2 + @types/chrome 0.0.246:** Strict mode catches Chrome API misuse at compile time; essential for cross-context code (service worker vs content script have different available APIs)
- **Chrome MV3 service worker:** Platform standard; mandates the background-as-gateway pattern that correctly handles CSP constraints
- **Direct `fetch()` (no SDK):** CSP-safe, zero bundle overhead; OpenAI and Gemini REST APIs are simple enough that the Node SDKs add complexity without benefit
- **Vite + @crxjs/vite-plugin (recommended addition):** HMR + correct MV3 bundling; low-risk migration from plain tsc

**Missing dev tooling (recommended additions):** `web-ext` for live reload, `vitest` for unit tests on provider/prompt logic, `eslint` + `@typescript-eslint` for lint.

### Expected Features

V1.0 is fully shipped. The immediate work is validation and distribution, not new features.

**Must have (table stakes — all done):**
- Works in `<input>`, `<textarea>`, and `contenteditable` elements
- Keyboard trigger (no mouse required) — `Ctrl+Shift+T`, `Ctrl+Shift+Y`
- Undo support via `document.execCommand('insertText')`
- Settings/configuration page with API key and provider selection
- Clear on/off visual feedback (blue border + badge)
- Error visibility (red "ERR" badge)
- Skips sensitive fields (password, readonly, hidden, disabled)

**Should have (differentiators — all done):**
- Compose mode: write in source language, output replaces text in-place
- YOLO mode: one-shot hotkey for fast short translations
- Auto-formality inference (LLM reads tone, picks register)
- 4-level formality control (Auto/Casual/Polite/Formal)
- Language swap hotkey + badge persistence
- Custom prompt override for domain-specific vocabulary
- Multi-provider support (OpenAI + Gemini) via abstraction layer
- BYOK with session-only key storage option

**Defer (v2+):**
- Firefox/Safari port — real porting effort, not a toggle
- Additional LLM providers (Claude, Mistral, Ollama) — provider abstraction makes this easy when there's demand
- Per-site language memory — high UX value; defer until v1 is stable
- Translation history/cache — nice for power users; not essential
- Glossary/term overrides — power feature, small segment

**Anti-features (do not build):** streaming/translate-as-you-type, system-wide IME, multiple simultaneous language pairs, offline/local model support, right-click context menu, auto-popup suggestions.

### Architecture Approach

The architecture is MV3-compliant and correct. Three strict layers: background service worker (all API calls, badge control, hotkey routing), content script (DOM state machine, compose/YOLO mode, text replacement), and UI pages (popup + options via `chrome.storage`). The background-as-API-gateway pattern is not a design choice — it is required by MV3's CSP model. The provider interface + registry cleanly isolates LLM-specific logic so adding a provider means adding one file with no other changes. Compose state is correctly owned by the content script (persistent for the page lifetime), not the service worker (which is ephemeral and can be terminated after 30 seconds of inactivity).

**Major components:**
1. **`background.ts` (service worker)** — LLM API calls, badge control, hotkey-to-content-script dispatch, settings reads; the only layer that can call `fetch()` to external domains
2. **`content.ts` (content script)** — compose mode state machine, YOLO handler, DOM element detection, undo-safe text replacement via `execCommand`
3. **`providers/` (openai.ts, gemini.ts)** — `TranslationProvider` interface implementations; swappable with zero background.ts changes
4. **`options.ts` / `popup.ts`** — settings persistence and status display; communicate via `chrome.storage.local`, not direct messages

### Critical Pitfalls

1. **Service worker termination drops in-flight API calls** — use `chrome.runtime.connect()` persistent ports (not `sendMessage`) for the content-script ↔ service-worker translate exchange; add 15s client-side timeout for user-visible failure
2. **`contenteditable` editors ignore `execCommand`** — Google Docs, Notion, complex Slack/Discord boxes use virtual DOM layers; `execCommand` mutates the real DOM, desynchronizing their state; needs site-specific testing and possibly fallback `InputEvent` dispatching
3. **LLM output contains wrapper text** — model returns `"Here is the translation: ..."` instead of clean text; tighten system prompt with explicit no-wrapper constraint + add post-processing strip in background worker; test adversarial inputs
4. **Shadow DOM inputs invisible to content scripts** — Gmail compose uses shadow DOM; `document.querySelectorAll` doesn't pierce shadow boundaries; need recursive `shadowRoot.activeElement` traversal
5. **API key leakage via message bus** — never pass raw API error objects to content script (they contain `Authorization` headers); serialize only `{ error: error.message }`; audit all `sendMessage` response payloads before public distribution

## Implications for Roadmap

Based on combined research, the product is functionally complete but not yet distribution-ready. The roadmap is a hardening arc, not a feature-addition arc.

### Phase 1: Prompt Quality Validation
**Rationale:** The core value proposition (auto-formality, clean output) is only as good as the prompt. This is low-effort, high-risk-if-skipped, and gates everything else — bad output discovered post-launch damages trust.
**Delivers:** Verified prompt quality across 20+ input types; zero wrapper text in output; auto-formality correct for slang, business, technical, and emoji-heavy inputs
**Addresses:** Compose mode, YOLO mode, formality control (FEATURES.md — all table stakes)
**Avoids:** LLM wrapper text pitfall (PITFALLS.md Pitfall 3); prompt injection via page content

### Phase 2: Cross-Site Compatibility
**Rationale:** The extension targets keyboard-native users who work in Gmail, Slack, Notion, GitHub, Twitter/X — all of these have contenteditable complexity, Shadow DOM, or CSP quirks. Compatibility is the second gate before Web Store submission.
**Delivers:** Verified compose + YOLO + undo on 8+ major sites; documented unsupported editors; Shadow DOM traversal fix for Gmail; hotkey conflict verification
**Addresses:** contenteditable table stakes (FEATURES.md); service worker termination, Shadow DOM, hotkey conflict pitfalls (PITFALLS.md Pitfalls 1, 4, 6)
**Avoids:** Compose mode state machine pitfalls; hotkey conflicts with Chrome's own `Ctrl+Shift+T`

### Phase 3: Security & Distribution Hardening
**Rationale:** These are not visible features but are required for public distribution — the Web Store review team and privacy-conscious users will check. Rate limiting and key audit prevent embarrassing/costly incidents post-launch.
**Delivers:** API key audit (no leakage in message bus), 500ms debounce on hotkey, prompt injection delimiter wrapping, Web Store assets (screenshots, privacy policy, store listing)
**Uses:** Existing provider abstraction + message protocol (ARCHITECTURE.md)
**Avoids:** API key leakage pitfall (PITFALLS.md Pitfall 5); unbounded text/cost pitfall

### Phase 4: Provider Expansion
**Rationale:** The provider abstraction (ARCHITECTURE.md) makes this genuinely low-effort. Additional providers expand the BYOK appeal and reduce vendor lock-in concerns. Defer until v1 is stable and there's user signal.
**Delivers:** Additional LLM providers (Claude, Mistral); model name validation/alias endpoints to handle OpenAI model rename risk
**Uses:** `TranslationProvider` interface — one new file per provider, no other changes
**Implements:** Provider registry extension (ARCHITECTURE.md)

### Phase 5: Power User Features
**Rationale:** These address the highest-value v2 features identified in FEATURES.md. Add only after Web Store launch and user feedback confirms demand.
**Delivers:** Per-site language memory; translation history/cache; glossary/term overrides
**Uses:** `chrome.storage.local` (already the settings store; extend schema)

### Phase Ordering Rationale

- **Prompt first, sites second:** A prompt bug discovered during cross-site testing requires re-running site validation. Fixing prompt first makes site testing the final gate.
- **Security before distribution:** Phase 3 is a prerequisite for Web Store submission, not an optional add-on.
- **Provider expansion before power features:** Adding providers is low-effort (one file) and expands the potential user base before investing in retention features.
- **All phases avoid the `execCommand` deprecation risk** by treating it as an accepted known risk to monitor each Chrome major release — no alternative exists.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Cross-site):** Google Docs contenteditable behavior is complex; may need to research `InputEvent` dispatching as a fallback or confirm graceful "unsupported" messaging is the right call
- **Phase 3 (Web Store submission):** Chrome Web Store review requirements and privacy policy specifics need current documentation check

Phases with well-documented patterns (can proceed without additional research):
- **Phase 1 (Prompt validation):** Standard LLM output testing; patterns well-established
- **Phase 4 (Provider expansion):** Pattern already proven twice (OpenAI + Gemini); third provider is a template exercise

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Derived from actual v1.0 codebase; stack is validated, not speculative |
| Features | HIGH | v1.0 shipped; feature landscape confirmed against implementation + competitor analysis |
| Architecture | HIGH | Derived from actual source files; MV3 constraints are authoritative and well-documented |
| Pitfalls | HIGH | Chrome platform behavior pitfalls are well-documented; LLM output pitfalls are established domain knowledge |

**Overall confidence:** HIGH

### Gaps to Address

- **`execCommand` replacement:** No undo-safe replacement API exists as of 2026-05-24. Monitor Chrome release notes each major version. This is accepted technical debt, not an oversight.
- **Google Docs contenteditable fallback:** Research didn't resolve whether `InputEvent` dispatching works in Google Docs or whether the correct answer is graceful unsupported messaging. Phase 2 testing will determine this.
- **Model name stability:** `gpt-5-mini`, `gpt-5-nano` are hardcoded strings with known rename risk. Phase 4 should address with model alias endpoints or a version check.
- **Hotkey default conflict:** `Ctrl+Shift+T` reopens closed tabs in Chrome. Phase 2 testing in a fresh profile will confirm whether Chrome intercepts this before the extension, and if so, default hotkeys should change before Web Store submission.

## Sources

### Primary (HIGH confidence)
- Codebase inspection (`src/background.ts`, `src/content.ts`, `src/types.ts`, `src/providers/`, `manifest.json`, `package.json`, `tsconfig.json`) — stack, architecture, features
- Chrome Extension MV3 documentation — service worker lifecycle, CSP constraints, commands API limits (4-command cap), `host_permissions` model
- `.planning/PROJECT.md` — authoritative requirements and decisions

### Secondary (MEDIUM confidence)
- CRXJS Vite plugin (`github.com/crxjs/chrome-extension-tools`) — community-standard for Vite + MV3; actively maintained
- MDN Web Docs — `document.execCommand` deprecation status ("deprecated, Chrome retains for accessibility")

### Tertiary (reference)
- Google Translate Chrome Extension (published behavior) — competitor feature analysis
- DeepL Chrome Extension (published behavior) — competitor feature analysis
- Yomitan (open source, GitHub) — competitor feature analysis
- OWASP LLM Top 10 (LLM01: Prompt Injection) — security pitfall framing
- Gemini API reference — `systemInstruction` field requirement for system prompts

---
*Research completed: 2026-05-24*
*Ready for roadmap: yes*
