# Project Research Summary

**Project:** hime — v1.3 Image Translation
**Domain:** Chrome MV3 extension — cloud image OCR + translation (BYOK, no backend), side-panel text output
**Researched:** 2026-06-20
**Confidence:** HIGH

## Executive Summary

v1.3 adds image-text translation to hime: OCR the text inside an `<img>` and translate it (detected-source → user's reading language), surfaced as readable text in a native Chrome side panel. Two triggers — a right-click context menu (manual, one-off) and an opt-in **progressive** viewport mode (default OFF) that auto-translates images as they approach the viewport via `IntersectionObserver`. Scope is locked to **side-panel text only**: no in-image overlay, no inpainting, no manga/vertical-CJK craft, no OpenAI/Azure as primary stack. The defining architectural fact is that every v1.3 piece maps onto an existing, shipped hime pattern — there is almost no greenfield invention here.

The decisive provider recommendation is a **vision LLM single call** (Claude Vision as the quality default for OCR robustness; Gemini 2.5 Flash and OpenAI vision as already-wired, lower-marginal-cost alternatives behind a provider-agnostic `VisionProvider` interface) over the Google Cloud Vision + Translation v3 two-API stack. The reasoning is conclusive for this scope: Google's only real advantage is word-level bounding-box geometry, which a text-only side panel never uses; meanwhile Translation v3 does **not** accept API keys (forcing service-account JSON + OAuth2 JWT signing in the service worker, or a second key on v2), which directly breaks hime's no-backend single-bearer-token BYOK invariant. A vision LLM does OCR **and** translation in one bearer-auth POST structurally identical to the OpenAI/Gemini provider files already shipped. Final pick is left to roadmap review, but research leans hard toward single-call.

The dominant risk is **cost and privacy in progressive mode**. An `IntersectionObserver` naively wired to "in viewport → translate" fires one paid API call per image, re-fires on every re-scroll, and silently uploads every image the user passes — potentially including sensitive content — to a third-party cloud. The mitigations (content-hash dedup, result cache, concurrency cap ~2-3, per-page budget, dwell debounce, min-size eligibility filter, default-OFF gate, explicit first-enable privacy warning, badge-instead-of-auto-open) are **hard prerequisites of progressive mode, not enhancements**. A secondary risk is MV3 worker lifecycle: slow image jobs can be killed mid-flight, so job/dedup/result state must persist to `storage.session` with per-call timeouts.

## Key Findings

### Recommended Stack

Reuse hime's existing zero-runtime-dependency posture: native `fetch` + `OffscreenCanvas`/`btoa` in the service worker, plain `tsc` + copy-assets build (the new `sidepanel.html/.ts/.css` is the same move as v1.2's `search.html`). No bundler, no new runtime libs. The single multimodal vision call replaces a two-API/two-key/two-billing-meter stack with one provider file.

**Core technologies:**
- **Vision LLM single-call (Claude Vision default; Gemini/OpenAI alternates)** — OCR + translate fused in one bearer-auth POST; preserves no-backend single-key BYOK; Gemini/OpenAI add zero new host_permission/key.
- **`chrome.sidePanel` (native)** — extension-origin output surface; clones v1.2's `search.html`/`serp-render.ts` extension-page + `textContent`-only renderer; sidesteps host-page CSP/XSS that an injected panel reintroduces.
- **`chrome.contextMenus` (`contexts:['image']`)** — manual entry point; consumes no hotkey slot (3/4 used); `info.srcUrl` arrives directly in the worker.
- **`IntersectionObserver` (web built-in)** — viewport gating for progressive mode; `rootMargin` pre-fetch; pure dedup/queue logic is node-testable.
- **Worker-side image fetch + `captureVisibleTab` fallback** — `fetch(srcUrl)` in the SW (CORS-free under host_permissions); screenshot-crop fallback for tainted/cross-origin/`blob:` images.
- Dev-only: bump `@types/chrome` `^0.0.246` → ~`^0.0.260`+ for `chrome.sidePanel` types.

### Expected Features

**Must have (table stakes):**
- Right-click "Translate image with hime" on any `<img>` — the discovery surface every competitor has.
- Side panel showing **both** detected original text and its translation, per image, stacked.
- Source-language auto-detect, displayed ("Detected: Japanese → English").
- Per-image loading + error states; "no text found" is a first-class non-error result.
- Copy original / copy translation + per-image re-translate (re-translate must bypass cache).
- Reuse existing hime target-language + BYOK settings (direction flips: detected-source → user target).

**Should have (competitive differentiator):**
- Opt-in progressive viewport mode (default OFF) — read image-heavy pages without per-image right-clicks; the headline differentiator, viable only with cost controls.
- Dedup of already-translated images + result cache keyed by image source — ship together with progressive.
- Cost-aware eagerness setting (Conservative/Balanced/Eager) + per-page count/budget indicator.

**Defer (out of this milestone):**
- In-image overlay, inpainting, manga/vertical-CJK special handling, additional vision providers (OpenAI/Azure as primary), freeform region capture, same-page multi-image batched into one call. These are explicit anti-features, not backlog niceties.

### Architecture Approach

Every v1.3 piece bolts onto a shipped pattern: a new `translateImage` worker message case mirrors the v1.2 `searchTranslated` case; a `VisionProvider` interface parallels `TranslationProvider` (image-in, dual-text-out — a sibling, not an overload of `translate()`); `panel-render.ts` clones `serp-render.ts` (`textContent`-only, injectable-Document testable); `sidepanel.ts` clones `search.ts`. All network + keys stay in the worker (existing invariant). One caveat: `content.ts` is a classic script — pure observer logic lives in a node-testable `image-observer.ts`, but the `IntersectionObserver` wiring is inlined into `content.ts` (top-level import/export breaks it).

**Major components:**
1. **`image-fetch.ts` (worker)** — `srcUrl` → base64 + MIME; `captureVisibleTab` crop fallback.
2. **`providers/vision.ts` + concrete provider (worker)** — `ocrTranslate()` reusing `classifyError`/`AbortController`/usage-token shape.
3. **`translateImage` case (background switch)** — single choke point both triggers funnel through; reuses `getSettings`/`recordUsage`/in-flight dedup.
4. **`sidepanel.html`/`.ts` + `panel-render.ts`** — XSS-safe card list; worker→panel via `sendMessage` + `storage.session` hydration buffer.
5. **`image-observer.ts` + inline `content.ts` wiring** — dedup WeakMap, concurrency cap, min-size skip, settings gate.

### Critical Pitfalls

1. **Progressive = one paid call per image, per scroll, forever** — default OFF; content-hash dedup (not DOM-node); per-page budget (~20-30); concurrency cap (2-3); min-size eligibility filter; dwell debounce (400-600ms); visible cost/count meter.
2. **Cross-origin / tainted-canvas image bytes** — fetch in the worker under host_permissions, not the content script; multi-strategy resolver with `captureVisibleTab` + crop fallback; validate MIME/size before send.
3. **MV3 worker sleeps mid-job** — persist queue/dedup/results to `storage.session`, not globals; per-call timeout < 30s; idempotent, message-driven, reconcile-on-wake. (30s idle / 5-min request / 30s fetch-stall limits are hard.)
4. **Silent privacy exfiltration** — explicit first-enable opt-in warning, per-site scope/pause, activity indicator, denylist `chrome://`/own pages; key never leaves the worker.
5. **`sidePanel.open()` user-gesture rule** — context-menu click qualifies, but `open()` must be called **synchronously before any `await`** or the gesture is consumed and it throws; progressive has no gesture → badge "N ready" + buffer, never auto-open. Also: oversize images (resize to ≤1568-2576px long edge before send) and no-text/low-confidence/CJK results need explicit states.

## Implications for Roadmap

Phases start at **12**. Both triggers share one pipeline — build the pipeline once, then add thin trigger wrappers. Natural milestone halves: manual (vertical slice) then automatic (progressive + cost control). Suggested ~4 phases:

### Phase 12: Background OCR+Translate Pipeline + Right-Click + Side Panel
**Rationale:** Everything downstream sends the `translateImage` message and renders to the panel; deliver the headline manual feature end-to-end before adding concurrency. A complete vertical slice that validates fetch→vision→render with zero progressive complexity.
**Delivers:** `types.ts` + manifest additions (`contextMenus`, `sidePanel` perms, host strategy, `side_panel.default_path`); `image-fetch.ts` + `VisionProvider` interface + one concrete provider + registry; `translateImage` worker case; context-menu registration (in `onInstalled`) + `onClicked`; `sidepanel.html/.ts` + `panel-render.ts`; worker→panel via `sendMessage` + `session` hydration buffer.
**Addresses:** Right-click translate, side panel (original + translation), source-language display, per-image loading/error + "no text found", copy/re-translate, BYOK vision key.
**Avoids/Implements:** worker-side fetch + `captureVisibleTab` fallback (Pitfall 2); resize/validate (Pitfall 3); durable job state + per-call timeout (Pitfall 4); `contextMenus.create` in `onInstalled` (Pitfall 6); synchronous `sidePanel.open()` in the gesture handler (Pitfall 5/7); key-stays-in-worker invariant (Pitfall 5); no-text/low-confidence/per-item-error result contract (Pitfall 8).

### Phase 13: Progressive Viewport Mode + Cost Control + Privacy Opt-In
**Rationale:** Depends on Phase 12's worker case and panel already working; layers the cost-control and privacy surface on top. This is where the differentiator lives, and where the project's biggest risks concentrate.
**Delivers:** `image-observer.ts` pure core (node-tested) + inlined `IntersectionObserver`/`MutationObserver` wiring in `content.ts`; content-hash dedup + result cache; concurrency cap; per-page budget; dwell debounce; min-size filter; default-OFF settings gate + first-enable privacy warning + per-site pause + activity/count indicator; badge-instead-of-auto-open delivery.
**Uses:** `IntersectionObserver`, v1.2 in-flight-dedup pattern, `storage.session`.
**Avoids:** Pitfalls 1 (cost blowup) and 5 (silent exfiltration) — both are hard prerequisites here; Pitfall 7 (no auto-open without gesture); Pitfall 10 (cross-page cache staleness via content-hash keying); scroll-stress verification of Pitfall 4.

### Phase 14: UX / Quality Hardening
**Rationale:** Once both triggers work, harden the edges that only surface on real-world content (especially CJK, the known vendor gap).
**Delivers:** no-text/low-confidence labels surfaced clearly; user source-language override (hint to provider instead of trusting auto-detect); CJK/vertical legibility recheck and expectation-setting; partial-batch per-item error isolation; usage surfaced in existing meter.
**Addresses:** Pitfall 8 (confident garbage / wrong-language / CJK reading order) and the legibility tail of Pitfall 3.

### Phase 15 (if needed): Settings / Polish
**Rationale:** Thin glue over finished machinery — vision provider/key fields (mirror `braveApiKey`), progressive toggle + concurrency/threshold knobs, captureVisibleTab edge polish. Foldable into 12/13 if light.

### Phase Ordering Rationale
- **Pipeline first, triggers second:** both context-menu and progressive call the same worker path; building it once removes duplication and lets Phase 12 ship a usable feature alone.
- **Manual before automatic:** progressive's cost/privacy controls are only safe to build atop a proven, cheap manual pipeline; the dedup/in-flight map is seeded in Phase 12 so right-click also benefits from idempotency.
- **Cost + privacy co-located in Phase 13:** dedup, cache, budget, concurrency, and the opt-in warning are not separable from progressive — shipping progressive without them is a billing hazard and a trust violation.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 12:** `--research-phase` recommended — the exact vision provider request/response shape (Claude image block vs Gemini `inline_data` vs OpenAI base64 data-URL) and the final provider pick must be nailed down; `sidePanel.open()` gesture timing and worker→panel delivery need a verified spike.
- **Phase 13:** `--research-phase` recommended — content-hash keying strategy, concurrency/budget/debounce tuning, and `storage.session` resilience under forced SW termination warrant focused validation.

Phases with standard patterns (skip research-phase):
- **Phase 14:** UX states and source-language override are established hime patterns (error states, settings hints) — standard.
- **Phase 15:** settings wiring directly mirrors the v1.2 `braveApiKey` field — standard.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Claude Vision limits, Chrome sidePanel/contextMenus/captureVisibleTab, Google v3 no-API-key constraint all verified against current official docs; existing codebase read directly. |
| Features | HIGH (table stakes/anti-features) / MEDIUM (cost/dedup/cache specifics) | Table stakes corroborated across Lens/Yandex/DeepL/Immersive/OCR Translator; vendors don't publish internals so cost-control specifics are inferred from BYOK economics + IntersectionObserver mechanics. |
| Architecture | HIGH | Every component maps to a read-directly existing hime pattern; Chrome semantics verified against developer.chrome.com. |
| Pitfalls | HIGH | SW lifecycle, contextMenus, sidePanel gesture rule, provider size limits verified; cost math computed from published per-image pricing. |

**Overall confidence:** HIGH

### Gaps to Address
- **Final vision-provider pick (Claude vs Gemini vs OpenAI vs Google):** research leans single-call vision LLM decisively; roadmap review confirms. Handle in Phase 12 planning — build the `VisionProvider` interface + registry first so the choice is swappable.
- **Exact per-provider image request shape:** confirm each provider's field shape (Claude image block, Gemini `inline_data`, OpenAI image_url base64) when implementing Phase 12.
- **CJK / vertical-text quality:** known vendor gap — no manga-grade guidance exists; set expectations, show original alongside translation, defer the OSS stack. Validate in Phase 14, don't promise manga quality.
- **Live Google pricing** (only relevant if Google path is reconsidered): MEDIUM confidence; verify before any pivot.
- **Host-permission breadth (`<all_urls>`/`https://*/*` vs activeTab+capture):** decide deliberately in Phase 12 against Web Store review friction; `optional_host_permissions` is the middle ground.

## Sources

### Primary (HIGH confidence)
- `/websites/platform_claude_en_api` (Context7) + platform.claude.com/docs/.../vision — image block params, base64 source, MIME, 10MB/8000px/1568px limits, ~(w×h)/750 token cost, ≤20-image stricter cap.
- `/websites/developer_chrome_extensions_reference_api` (Context7) + developer.chrome.com — `sidePanel` (`open()` gesture rule, `side_panel.default_path`), `contextMenus` (`contexts:['image']`, `info.srcUrl`, onInstalled registration), `captureVisibleTab`, SW lifecycle (30s idle / 5-min / 30s fetch-stall), cross-origin network requests.
- docs.cloud.google.com/translate/docs/authentication — Translation v3 does NOT support API keys (v2 does) — the decisive BYOK constraint.
- Existing hime codebase (read directly): `background.ts` (onMessage switch, registry, in-flight dedup, recordUsage, classifyError), `serp-render.ts` (textContent-only render), `providers/openai.ts`+`gemini.ts`, `content.ts` (classic-script no-import constraint), `types.ts`, `manifest.json`.
- `.planning/research/SOURCES.md` — vetted spine; `.planning/PROJECT.md` — scope/constraints/v1.2 prior art (SRCH-06 dedup, count-assertion never-blank, progressive render).

### Secondary (MEDIUM confidence)
- Google Lens/Translate, Yandex, DeepL, Immersive Translate, OCR Translator, ImageTrans — competitor feature corroboration (triggers, show-original, copy, overlay/inpaint as out-of-scope craft).
- Chromium tracker issues 40929586 / 355266358 — `sidePanel.open()` gesture-consumed-by-await behavior.
- buildmvpfast / docs.cloud.google.com pricing — Vision $1.50/1k, Translation $20/M chars (verify live before any pivot).
- IntersectionObserver rootMargin/threshold lazy-loading patterns (LogRocket).

### Tertiary (LOW confidence)
- CJK/vertical-CJK OCR quality — no authoritative vendor source exists (documented known gap); validate empirically in Phase 14.

---
*Research completed: 2026-06-20*
*Ready for roadmap: yes*
