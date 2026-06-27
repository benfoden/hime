# hime

## What This Is

A Chrome extension that lets you type in English and get inline Japanese (or any language) output without leaving your text field. Two modes: Compose (toggle in/out of translation mode) and YOLO (one-shot replace the whole field). Keyboard-native, no mouse, no menus. Targets anyone who thinks in English but needs to write in Japanese — conversational speakers, learners, professionals.

## Core Value

Type English, get natural Japanese inline — without breaking your keyboard flow.

## Shipped Milestone: v1.4 In-Place Page Translation

**Shipped 2026-06-27** (phases 15–16). Audit: tech_debt — 13/13 reqs satisfied, 10/10 integration wired, 2/2 E2E flows; see `milestones/v1.4-MILESTONE-AUDIT.md`. Translate the current page in place: the page's visible text is swapped for its translation (layout-preserving, script/style/code/editable nodes skipped, toggle restores original), and translated text is overlaid directly on images via reused Vision `boundingPoly` geometry (WCAG-AA legibility box, shrink-to-fit text, per-image + global swap, scroll/resize re-anchoring). Triggered manually (toolbar / right-click "Translate page") or via a dismissible auto-offer when `<html lang>` differs from target (reuses the `shouldGateByLanguage` gate — no spend on same-language pages). All translate/Vision calls through the background worker (no key on page).

**Scope held (locked):** REPLACE-in-place (not bilingual); STATIC snapshot (no MutationObserver/SPA live-translate); simple overlay — no inpainting, no manga-grade typesetting, no new OSS dependency; shrink-to-fit via own `measureText` code. Default-ON auto-translate (vs today's offer) carried to backlog 999.5; below-fold overlay, exotic-layout positioning, and a unified read-vs-compose direction model deferred.

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
- ✓ In-place page-text translation — TreeWalker snapshot, batched BYOK translate, layout-preserving replace, toggle to original (PAGE-01..05) — v1.4
- ✓ Page-translate triggers — toolbar + right-click manual, `<html lang>` dismissible auto-offer via `shouldGateByLanguage` (TRIG-01..03) — v1.4
- ✓ In-place image overlay translation — reused Vision `boundingPoly` boxes, WCAG-AA legibility box, shrink-to-fit, swap toggle, scroll/resize re-anchoring (OVL-01..05) — v1.4

### Active

- v1.5 Contextual Hints — next candidate (deferred through v1.3/v1.4)
- Default-ON page-text auto-translate — backlog 999.5 (machinery shipped in v1.4; needs auto-trigger policy + settings)
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

**Shipped:** v1.0 MVP (2026-05-25); v1.2 Translated Search (2026-06-20, phases 8–11); v1.3 Image Translation (2026-06-21, phases 12–14); v1.4 In-Place Page Translation (2026-06-27, phases 15–16)
**Paused:** v1.1 Inline Predictions (phase 5 shelved behind `PREDICT_ENABLED=false`; phases 6–7 unbuilt)
**Current focus:** Planning next milestone (v1.5 Contextual Hints candidate, or 999.5 default-ON page auto-translate)
**Codebase:** TypeScript + Chrome MV3; ~229 tests passing / skips
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
| Page text: nodeValue swap (not execCommand) | execCommand undo-safety matters only for user-editable fields; page text is read-only, so direct nodeValue replace preserves layout with once-only original capture for the toggle | ✓ Good — v1.4 |
| Static snapshot, no MutationObserver | Translate the page as it is at trigger time; SPA/dynamic live-translate is unbounded cost + complexity, descoped to backlog | ✓ Good — v1.4 |
| Image overlay: DOM boxes, no inpainting | Absolutely-positioned DOM overlays on top of `<img>` (translucent box) avoid tainted-canvas + manga-grade typesetting; reuses Vision `boundingPoly` already fetched | ✓ Good — v1.4 |
| Image overlay opt-in default-OFF | Per-block image translation is extra Vision+LLM spend; gate behind an explicit "Include images" checkbox folded into Translate page (D-01) | ✓ Good — v1.4 |
| Page auto-offer (dismissible) vs default-ON auto-translate | Ship the offer first to avoid surprise auto-spend; default-ON trigger policy deferred to backlog 999.5 now that the machinery exists | — Pending — v1.4 |

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
*Last updated: 2026-06-27 — v1.4 In-Place Page Translation shipped (phases 15–16); v1.1 paused; v1.5 Contextual Hints + 999.5 default-ON page auto-translate are next candidates*
