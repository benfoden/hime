# hime

## What This Is

A Chrome extension that lets you type in English and get inline Japanese (or any language) output without leaving your text field. Two modes: Compose (toggle in/out of translation mode) and YOLO (one-shot replace the whole field). Keyboard-native, no mouse, no menus. Targets anyone who thinks in English but needs to write in Japanese — conversational speakers, learners, professionals.

## Core Value

Type English, get natural Japanese inline — without breaking your keyboard flow.

## Current Milestone: v1.4 In-Place Page Translation

**Goal:** Translate the current page in place — swap the page's visible text with its translation (layout-preserving) and overlay translated text directly on images — so a foreign-language page becomes readable without leaving it. Phases 15+.

**Target features:**
- **In-place page-text translation** (replace-in-place): walk the page's text nodes, translate via the existing BYOK LLM pipeline (batched), swap each in place preserving layout; skip script/style/code/editable nodes. A toggle restores the original. *(from backlog 999.5)*
- **In-place image overlay translation**: reuse Vision `DOCUMENT_TEXT_DETECTION` per-block `boundingPoly` boxes (currently discarded) to render absolutely-positioned DOM overlays on top of each `<img>`, with a simple semi-transparent background box and a swap toggle (original ↔ translation). *(from backlog 999.3)*
- **Trigger:** manual (toolbar/right-click "Translate page") + auto-offer when the page source language (`<html lang>`) differs from target — reusing the D-05 `shouldGateByLanguage` gate from v1.3 progressive mode (no spend on same-language pages).

**Key context:**
- **Scope guardrails (locked):** REPLACE-in-place (not bilingual); **STATIC snapshot** only (no MutationObserver / SPA live-translate); **simple overlay** — no inpainting, no manga-grade typesetting, **no new OSS dependency**. Translated text fits its box via shrink-to-fit on `CanvasRenderingContext2D.measureText` (own code).
- Curated research at `.planning/research/SOURCES.md` (Firefox/Bergamot TreeWalker replace + tag-alignment, translate-tools/domtranslator reference impl, W3C contrast for the legibility box). Reuses v1.3 Vision bbox geometry + Translation pipeline.
- Image-overlay is a per-block translation pipeline change from v1.3's single whole-image call.
- After v1.4: contextual-hints (deferred). v1.1 inline-predictions stays PAUSED behind `PREDICT_ENABLED`.

## Shipped Milestone: v1.3 Image Translation

**Shipped 2026-06-21** (phases 12–14). Audit passed 16/16 — see `milestones/v1.3-MILESTONE-AUDIT.md`.
Read text inside images on any page — OCR'd via Google Cloud Vision and translated through the main BYOK LLM pipeline — surfaced as text in a side panel. Right-click context menu + opt-in progressive (viewport) mode with a `<html lang>` page-language gate; vision-key settings UI + connection test. All vision/translate routed through the background service worker (no key on page).

## Shipped Milestone: v1.2 Translated Search

**Shipped 2026-06-20** (phases 8–11, 11 plans). Audit passed 17/18 — see `milestones/v1.2-MILESTONE-AUDIT.md`.
An in-extension search page: query translated user→target language, run against Brave Search (BYOK), results rendered as a classic Google-style SERP back-translated target→user, each linking to the verbatim original page. Three-stage progressive render (skeleton → raw → translated overlay), XSS-safe, all network through the background worker.

## Paused Milestone: v1.1 Inline Predictions

**Status:** PAUSED 2026-06-02 (not archived). Phase 5 ghost-text engine built but shelved behind `PREDICT_ENABLED=false` (content.ts) with the Predict hotkey row hidden in options. Phases 6 (alternate variations/cycling) and 7 (prediction settings) unbuilt. Resume by flipping the flag, unhiding `#predictHotkeyRow`, and roadmapping phases 6–7.

**Goal:** Live 2-3 word inline completions in any text field, any language, with cycleable alternate variations.

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
- ✓ Cross-site compatibility on 7 editors (Gmail, GitHub, Twitter/X, Notion, Slack, Discord + Google Docs graceful degradation) — Phase 3
- ✓ Shadow DOM traversal for Gmail compose input detection — Phase 3
- ✓ Canvas-editor graceful degradation for Google Docs — Phase 3
- ✓ Loading overlay with guaranteed cleanup on failure — Phase 3
- ✓ Cursor-end positioning after translation — Phase 3
- ✓ Focus-leave compose cleanup via focusout handler — Phase 3
- ✓ In-extension Translated Search page: query translation (source→target) + Brave Search BYOK + classic SERP — v1.2
- ✓ Batched keyed-JSON result translation (target→source) with count-assertion raw fallback — v1.2
- ✓ Three-stage progressive render (skeleton → raw Brave → translated overlay) — v1.2
- ✓ XSS-safe SERP rendering (textContent-only, verbatim original hrefs) — v1.2
- ✓ All search/translation network routed through background worker (no key on page) — v1.2

### Active

- v1.4 In-Place Page Translation — CURRENT milestone (phases 15+); requirements scoped this cycle
- v1.5 Contextual Hints — deferred (was v1.4; pushed back for in-place page translation)
- v1.1 Inline Predictions — PAUSED (phase 5 shelved behind PREDICT_ENABLED flag; phases 6–7 unbuilt)

### Out of Scope (v1.0)

- System-wide (non-browser) IME support — requires native OS integration, separate product
- Offline / local model support — BYOK API model; no local inference in scope
- Streaming / translate-as-you-type — complexity not justified by UX gain for short inputs
- Multiple simultaneous language pairs — one pair, swappable; adding rotation adds cognitive overhead
- Non-Chrome browsers — MV3 APIs differ enough to be a separate port; Firefox/Safari deferred
- Chrome Web Store submission — deferred; dev load-unpacked sufficient for v1.0
- Backend / server-side proxy — eliminated in favor of BYOK direct API calls; no hosting needed
- Learning / spaced repetition features — different product dimension
- Hotkey rebinding in options page — Chrome commands API handles this at `chrome://extensions/shortcuts`

## Current State

**Shipped:** v1.0 MVP (2026-05-25); v1.2 Translated Search (2026-06-20, phases 8–11); v1.3 Image Translation (2026-06-21, phases 12–14)
**Paused:** v1.1 Inline Predictions (phase 5 shelved behind `PREDICT_ENABLED=false`; phases 6–7 unbuilt)
**Codebase:** TypeScript + Chrome MV3; ~159 tests passing / skips
**Providers:** OpenAI, Gemini, OpenRouter (LLM); Brave Search (search, BYOK); Google Cloud Vision (image OCR, BYOK)
**Compatibility:** Verified on Gmail, GitHub, Twitter/X, Notion, Slack, Discord; Google Docs graceful degradation

## Context

- Background service worker handles all LLM API calls; content script only manages DOM and UX state
- `document.execCommand('insertText')` is deprecated but remains the only cross-site undo-safe replacement method — no better alternative exists
- Chrome commands API limits extensions to 4 registered hotkeys; currently using 3 (`toggle-compose`, `yolo-translate`, `swap-language`)
- Google Docs uses canvas-based rendering; hime detects this and gracefully declines
- Shadow DOM traversal confirmed working on Gmail compose; one-level open root check sufficient
- `Ctrl+Shift+T` conflicts with Chrome's reopen-closed-tab — known issue, not yet resolved

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
| Canvas-editor detection via DOM, not URL | URL matching is brittle; walking 5 ancestor levels for large canvas siblings is site-agnostic | ✓ Good — Phase 3 |
| One-level Shadow DOM traversal | Closed roots are inaccessible per spec; multi-level traversal is over-engineering | ✓ Good — Phase 3 |
| OpenRouter via OpenAI-compatible API | Single integration pattern, dynamic model fetching, minimal code | ✓ Good — Phase 02.1 |
| Skip Web Store for v1.0 | Dev load-unpacked sufficient; store submission deferred to future milestone | ✓ Good — Phase 4 |
| Brave Search as the v1.2 search backend (BYOK) | Single-provider focus; abstraction deferred until a second provider is needed | ✓ Good — v1.2 |
| Keyed-JSON batch translation with count-assertion fallback | One LLM call for all results; on count mismatch fall back to raw text — never blank/mismapped | ✓ Good — v1.2 |
| Three-stage progressive render (skeleton → raw → translated overlay) | A worker timeout or translation failure still leaves usable untranslated results | ✓ Good — v1.2 |
| XSS-safe SERP via textContent-only + verbatim hrefs | Brave description HTML stripped to text; URLs never mutated/translated (SERP-02/03) | ✓ Good — v1.2 |
| SRCH-06: in-flight dedup instead of literal ~1s submit debounce | Worker dedup map covers duplicate-call intent; a literal debounce would delay deliberate submits | ✓ Good — v1.2 audit |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-21 — v1.4 In-Place Page Translation milestone started (phases 15+); v1.3 shipped; v1.1 paused; contextual-hints deferred*
