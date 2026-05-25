# Feature Research

**Domain:** Browser extension — inline keyboard-driven translation/composition tool
**Researched:** 2026-05-24
**Confidence:** HIGH (v1.0 is shipped; feature landscape derived from code, PROJECT.md, and competitive analysis)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Works in `<input>` and `<textarea>` | These are 95% of form fields on the web | LOW | Done — content script handles both |
| Works in `contenteditable` elements | Gmail, Slack, Notion, Docs all use this | HIGH | Done structurally; cross-site edge cases remain the open risk |
| Keyboard trigger (no mouse required) | Extension targets keyboard-native users | LOW | Done — `Ctrl+Shift+T` and `Ctrl+Shift+Y` |
| Undo support | Breaking Ctrl+Z is a dealbreaker for writers | HIGH | Done via `document.execCommand('insertText')` |
| Settings/configuration page | API key + provider must be configurable | LOW | Done — full settings page |
| Clear on/off feedback | User must know when translation mode is active | LOW | Done — blue border + badge |
| Error visibility | Silent failures are worse than noisy ones | LOW | Done — red "ERR" badge |
| Skips sensitive fields | Translating passwords is a security bug | LOW | Done — skips password/readonly/hidden/disabled |
| Works on major sites | Gmail, GitHub, Twitter/X, Slack, Google Docs | HIGH | In progress — cross-site testing task active |

### Differentiators (Competitive Advantage)

Features that set hime apart from the "select text → popup" translation pattern every competitor uses.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Compose mode (inline toggle) | Write in English, output lands directly in the field — no copy-paste, no popups | MEDIUM | Core differentiator; done |
| YOLO mode (one-shot replace) | Fastest path for short messages — one hotkey, done | LOW | Done; pairs naturally with Compose |
| Auto-formality inference | LLM reads your English tone and picks appropriate Japanese register — no manual dial-tweaking | MEDIUM | Done; needs validation testing to confirm quality |
| Formality control (Auto/Casual/Polite/Formal) | Japanese register is non-optional — output that ignores it reads as robotic or rude | LOW | Done; language-specific prompt instructions per level |
| Language swap hotkey | Flip direction mid-session without touching settings | LOW | Done — `Ctrl+Shift+S` + badge shows 2-letter code |
| Custom prompt override | Power users can tune the system prompt for domain-specific vocabulary (legal, medical, gaming) | LOW | Done — settings field |
| Multi-provider support | Users choose between OpenAI and Gemini; not locked to one vendor or one cost structure | MEDIUM | Done — provider abstraction layer |
| Session-only key storage | Privacy-forward: key lives only in memory, gone when browser closes | LOW | Done — `chrome.storage.session` option |
| BYOK | User owns their rate limits and billing; no hosted service to trust or pay separately | LOW | Core architectural decision; done |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Streaming / translate-as-you-type | Feels "live" | Thrashes the API on every keystroke; output mutates mid-composition causing cursor chaos; adds no value for inputs under 200 chars | Explicit trigger hotkey — user controls when translation fires |
| Multiple simultaneous language pairs | Power users want Japanese + Korean + etc. | Cognitive overhead multiplies; hotkey slots are capped at 4; swap UX becomes ambiguous | One pair, swappable — covers 95% of sessions cleanly |
| System-wide IME support | "Always on" feels convenient | Requires OS native integration (separate binary, installer, OS permissions); entirely different product surface | Chrome extension scope is the right boundary for v1 |
| Offline / local model support | Privacy and cost concerns | Local inference requires bundling a model (100MB–7GB); service worker lifetime makes this impractical in MV3 | BYOK addresses cost; session storage addresses key privacy |
| Spaced repetition / flashcard learning | Learning mode sounds synergistic | Different product with different retention, progress tracking, and scheduling needs — sharing UI creates confusion | Separate app; hime stays focused on composition |
| Right-click context menu translation | Familiar pattern (every competitor does it) | Mouse-based; breaks keyboard-native identity; adds a mode the existing hotkeys already cover | YOLO mode covers one-shot replacement; Compose covers iterative |
| Auto-popup suggestions while typing | Grammarly-style inline hints | Interfers with IME input on sites that already handle Japanese; competes with the host page's own autocomplete; high jank risk | Explicit trigger is the right UX for a translation step |
| Hotkey rebinding in options UI | Discoverability | Chrome commands API already exposes `chrome://extensions/shortcuts`; duplicating it adds maintenance burden with no UX gain | Document the native shortcut; link to it from settings |

---

## Feature Dependencies

```
[Text field detection]
    └──required by──> [Compose mode]
    └──required by──> [YOLO mode]

[Provider abstraction]
    └──required by──> [OpenAI support]
    └──required by──> [Gemini support]
    └──required by──> [Formality control] (prompts are provider-routed)

[Settings persistence (chrome.storage)]
    └──required by──> [Language swap persistence]
    └──required by──> [API key storage]
    └──required by──> [Custom prompt override]

[Background service worker]
    └──required by──> [All API calls] (CSP restriction on content scripts)

[Compose mode]
    └──enhances──> [Formality control] (compose sessions tend to be multi-sentence; formality matters more)
    └──conflicts──> [Auto-popup suggestions] (they fight over the same input event stream)

[YOLO mode]
    └──conflicts──> [Streaming output] (YOLO is atomic; streaming implies incremental reveal)
```

### Dependency Notes

- **Text field detection is the foundation:** both modes and the undo mechanism all depend on correctly identifying the active element type (input vs textarea vs contenteditable). Cross-site edge cases here propagate to every other feature.
- **Provider abstraction enables formality:** formality levels are implemented as system prompt instructions routed through the provider layer — adding a new provider means formality works automatically.
- **Background service worker is non-negotiable:** content scripts cannot make direct API calls due to CSP on most sites; the service worker handles this. Any new AI feature must go through the message-passing channel, not direct fetch from content script.

---

## MVP Definition

### v1.0 — Shipped

The concept is validated and the product is usable end-to-end.

- [x] Compose mode with toggle hotkey, visual indicator, Escape cancel
- [x] YOLO mode with one-shot hotkey
- [x] Text field detection (input, textarea, contenteditable)
- [x] Undo-safe replacement via `document.execCommand('insertText')`
- [x] OpenAI + Gemini provider support with abstraction layer
- [x] BYOK with local/session storage options
- [x] Settings page (provider, model, key, language pair, formality, custom prompt)
- [x] Formality control (Auto/Casual/Polite/Formal)
- [x] Language swap hotkey + badge persistence
- [x] Error badge + "Test Connection"
- [x] Skips unsafe fields (password, readonly, hidden, disabled)

### v1.x — Active / Immediate Next

These don't add features; they validate and harden what's shipped.

- [ ] **Prompt engineering validation** — test Auto formality on slang, business formal, and technical inputs; confirm no stray quotes or explanations in output
- [ ] **Cross-site compatibility** — verify compose + YOLO + undo on Google Search, Gmail, GitHub, Google Docs, Notion, Slack web, Discord web, Twitter/X; document contenteditable edge cases and fix blocking ones
- [ ] **Chrome Web Store submission** — screenshots, privacy policy, store listing (deferred until cross-site testing is clean)

### v2+ — Future Consideration

Add only after v1.x is solid and there's user signal.

- [ ] **Firefox/Safari port** — MV3 APIs differ; this is a real porting effort, not a toggle
- [ ] **Additional LLM providers** — Anthropic Claude, Mistral, local Ollama via proxy (provider abstraction makes this low-effort once there's demand)
- [ ] **Per-site language memory** — remember that you use Formal on LinkedIn but Casual on Discord
- [ ] **Translation history / cache** — avoid re-translating identical strings; also useful for review
- [ ] **Glossary / term overrides** — force specific translations for proper nouns or domain terms without editing the system prompt each time

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Cross-site contenteditable fixes | HIGH | MEDIUM | P1 — blocking Web Store submission |
| Prompt engineering validation (Auto formality) | HIGH | LOW | P1 — quality gate for core feature |
| Chrome Web Store submission | HIGH | LOW | P1 — distribution; no code changes |
| Additional LLM providers (Claude, Mistral) | MEDIUM | LOW | P2 — provider abstraction makes this easy |
| Per-site language memory | MEDIUM | MEDIUM | P2 — high UX value for bilingual professionals |
| Translation history / cache | LOW | MEDIUM | P3 — nice for power users; not essential |
| Firefox port | MEDIUM | HIGH | P3 — real porting work; defer until Chrome is stable |
| Glossary / term overrides | LOW | MEDIUM | P3 — power feature; small user segment |
| Streaming output | LOW | HIGH | — Anti-feature; do not build |

**Priority key:**
- P1: Required to complete v1 and ship to Web Store
- P2: Add when v1 is stable; high ROI on small effort
- P3: Future consideration pending user signal

---

## Competitor Feature Analysis

No direct competitor does inline keyboard-driven composition translation. The nearest analogies are all popup/selection-based.

| Feature | Google Translate Extension | DeepL Extension | Yomitan | hime |
|---------|---------------------------|-----------------|---------|------|
| Trigger model | Select text → popup | Select text → popup | Hover → popup | Keyboard hotkey → inline replacement |
| Composition support | No — translation only, no input | No — read-only output | No — reading aid only | Yes — Compose mode |
| Undo support | N/A (no input) | N/A (no input) | N/A | Yes — `execCommand` |
| Formality control | No | No (DeepL handles internally) | N/A | Yes — 4 levels + Auto |
| BYOK | No — Google account | No — DeepL account | N/A | Yes |
| Keyboard native | No | No | Partially (hotkey to enable) | Yes — core identity |
| Works in contenteditable | Reads but doesn't write | Reads but doesn't write | Reads only | Writes (with edge cases) |
| Language pair | ~100 languages | ~31 languages | JP only (reading) | Any pair via LLM |
| Provider choice | Fixed (Google NMT) | Fixed (DeepL NMT) | Fixed (dictionary) | OpenAI / Gemini; extensible |
| Custom prompt | No | No | No | Yes |

**Key insight:** The "compose in source language, output in target language" workflow is genuinely unoccupied. Every competitor treats translation as a reading tool (select → read translation). Hime treats it as a writing tool (type → replace with translation). This is the moat.

---

## Sources

- `/home/ben/code/hime/.planning/PROJECT.md` — authoritative requirements and decisions
- Codebase state (tasks 1-7, 10 complete) — features validated against actual implementation
- Google Translate Chrome Extension (published, well-known behavior) — HIGH confidence
- DeepL Chrome Extension (published, well-known behavior) — HIGH confidence
- Yomitan (open source, GitHub) — HIGH confidence
- Chrome Commands API documentation — 4-hotkey cap is documented constraint
- `document.execCommand` deprecation status — confirmed deprecated but functional in Chrome

---
*Feature research for: hime — browser inline translation extension*
*Researched: 2026-05-24*
