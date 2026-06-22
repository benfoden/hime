# Phase 12: Image OCR Pipeline + Right-Click + Side Panel - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning

<domain>
## Phase Boundary

The complete **manual vertical slice** for image translation: a user right-clicks any `<img>` on a page, hime OCRs and translates the text inside it through **Google Cloud (Vision API `images:annotate` DOCUMENT_TEXT_DETECTION for OCR + detected language, then Cloud Translation v2 for the translation — both authed with one BYOK Google Cloud API key)**, and reads the original text plus its translation in a **native Chrome side panel**. This is the shared pipeline both triggers reuse; Phase 13 layers progressive/viewport mode on top, Phase 14 adds the settings key field + copy + quality polish.

Requirements in scope: IMG-01, IMG-02, IMG-03, IMG-04, IMG-05, IMG-07, VIS-01, VIS-03.
NOT this phase: progressive/viewport mode (PROG-*, Phase 13); the settings key field + connection test (VIS-02, Phase 14); copy buttons (IMG-06, Phase 14).
</domain>

<decisions>
## Implementation Decisions

### Panel result model
- **D-01:** The side panel **accumulates a scrollable session list** — each right-click translation **prepends** its result (newest on top). NOT replace-latest-only. Rationale: this is the data model Phase 13 progressive mode needs anyway (many images fill the panel), and it reuses the existing SERP-list render shape. The panel's model is a list of image-result entries for the session.

### Result display layout
- **D-02:** Each entry renders **stacked, with OCR breaks preserved**: a small image thumbnail, then the **translation**, then the **detected original text below it**, each preserving the OCR's line/paragraph breaks (not flattened to one block). Reading-focused, works for long text in a narrow side panel. (Translation above original — the translation is the thing the user wants to read.)

### Target language source
- **D-03:** Image translation **reuses hime's existing global target-language setting** — no new per-panel language picker. Direction is detected-source → global target (the inverse of Compose's English→target; UI copy must show "Detected: X → Y" so the direction is unambiguous, per IMG-03). Swap target via the existing settings/swap mechanism.

### Low-confidence UX (Claude's discretion — defaulted, user did not select to discuss)
- **D-04:** Show the result with an **amber "low confidence" badge** when Google Vision's OCR confidence is below a threshold (threshold TBD by planner/researcher from Vision's confidence scoring — start conservative, e.g. mean word confidence < ~0.6). **Suppress** (render the explicit "no text found" state, IMG-05) only when OCR returns genuinely empty / no text annotations. Never a silent blank. Revisit threshold tuning in Phase 14 quality hardening.

### Claude's Discretion
- Confidence threshold value (D-04) — planner/researcher to pin from Vision API confidence semantics.
- Context-menu surface: target `<img>` elements (IMG-01); the `captureVisibleTab` fallback (IMG-04) is for fetch-blocked/tainted/cross-origin images, an internal resolution detail, not a separate menu item this phase.
- Side-panel session-list persistence scope (in-memory vs `storage.session`) — note: IMG/worker job + dedup state MUST persist to `storage.session` per PITFALLS (worker lifecycle); the panel's display list can mirror that.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope + research
- `.planning/REQUIREMENTS.md` — v1.3 requirements (IMG-*, VIS-*, PROG-*), Future + Out-of-scope, traceability.
- `.planning/ROADMAP.md` §"Phase 12" — goal, success criteria, dependency note (reuses v1.2 worker onMessage switch, in-flight dedup, recordUsage, classifyError, extension-page + textContent render, BYOK plumbing).
- `.planning/research/SUMMARY.md` — synthesized v1.3 research (decisive findings + build order).
- `.planning/research/STACK.md` — provider analysis; NOTE: STACK/SUMMARY recommend a single-call vision LLM (Claude), but the **user overrode this → Google Cloud (Vision + Translation v2)**. Treat the Google path as locked; read STACK only for MV3 wiring details (sidePanel gesture rule, contextMenus in onInstalled, captureVisibleTab fallback, manifest deltas).
- `.planning/research/ARCHITECTURE.md` — integration spec (translateImage worker case ↔ searchTranslated; VisionProvider ↔ TranslationProvider; panel-render ↔ serp-render; sidepanel.ts ↔ search.ts; data flows; build order).
- `.planning/research/PITFALLS.md` — worker-lifecycle persistence, CORS/tainted-canvas, contextMenus duplicate-registration, sidePanel gesture, key-in-worker invariant, size limits.

### Curated external sources
- `.planning/research/SOURCES.md` — vetted primary docs. For Phase 12 the relevant ones: Google Vision DOCUMENT_TEXT_DETECTION fullText annotations + OCR (TEXT_DETECTION vs DOCUMENT_TEXT_DETECTION), Cloud Translation (use **v2**, API-key-authed — NOT v3), Chrome cross-origin requests + captureVisibleTab.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/background.ts` — typed `chrome.runtime.onMessage` switch with per-type cases; **`searchTranslated` (lines ~171) and `translateBatch` (~259) cases are the direct templates for a new `translateImage` case**. Reuse: in-flight dedup map (line ~35, key by content hash for images), `recordUsage` (~69), `classifyError` (errors.ts), `getSettings`.
- `src/types.ts` — `TranslationProvider` interface (line ~44) → model `VisionProvider` as a sibling (image in → `{originalText, translatedText, detectedLang, confidence}`); `Message`/`MessageType` union (~57) → add `translateImage`; `SearchResult`/`SearchTranslatedResponse` (~93/122) → model the image-result + response types.
- `src/serp-render.ts` — **textContent-only XSS-safe renderer** → clone as the panel/list render (`panel-render.ts`); never innerHTML OCR or translation text.
- `src/search.{ts,html,css}` — extension page wiring → clone as `sidepanel.{ts,html,css}`.
- `src/providers/openai.ts` + `gemini.ts` — provider impl shape (AbortController timeout, usage shape, error mapping) → `src/providers/vision-google.ts` (two-step: annotate → translate v2, one key).
- Brave key pattern: `testBraveKey` case (~308) + `braveApiKey` setting → the Phase-14 Google key field + test (note for VIS-02, not built here, but mirror it).

### Established Patterns
- All network + API keys live in the **background service worker**; content script does DOM only (key never on page → IMG-07).
- Settings read via `getSettings` message; BYOK keys in `chrome.storage.local/.session`.
- Worker globals are wiped on MV3 termination → durable job/dedup/result state must persist to `storage.session` (PITFALLS).

### Integration Points
- New `chrome.contextMenus` registration (in `onInstalled`, handler `onClicked` at top level) → sends `translateImage` (srcUrl) to worker.
- New `chrome.sidePanel` (manifest `side_panel.default_path`, `sidePanel` permission); **`sidePanel.open()` must be called synchronously inside the contextMenus.onClicked gesture** — open first, then run the async fetch→vision→render pipeline.
- Manifest deltas: add `contextMenus` + `sidePanel` permissions; broaden `host_permissions` for image fetch (`<all_urls>` or `https://*/*`) + Google endpoints (`https://vision.googleapis.com/*`, `https://translation.googleapis.com/*`); add `side_panel` block. (Host-permission breadth — `<all_urls>` upfront vs `optional_host_permissions` runtime grant — is a product/trust call flagged for the planner.)
</code_context>

<specifics>
## Specific Ideas

- Provider is **Google Cloud, locked by user steer** (overriding the research's Claude recommendation): Vision API OCR + Translation **v2** (both API-key BYOK, one key). Two calls, not single-call — `VisionProvider` hides that.
- "Detected: Japanese → English"-style direction line in each panel entry (IMG-03).
- Reuse the v1.2 progressive-render instinct: render the entry skeleton immediately on click, fill OCR/translation as the worker returns.
</specifics>

<deferred>
## Deferred Ideas

- On-demand re-translate of an existing entry (IMG-F1) — Future.
- Multi-provider vision + provider/model dropdown (VIS-F1) — abstraction built internally now, only Google surfaced.
- Per-site scoping for progressive mode (PROG-F1) — Phase 13 ships a global toggle only.
- Same-page multi-image batching into one call (IMG-F2) — post-validation cost optimization.
- Copy buttons (IMG-06) and the settings key field + test (VIS-02) — scoped to Phase 14, not this phase.

None of the above are scope creep into Phase 12 — discussion stayed within the manual-pipeline boundary.
</deferred>

---

*Phase: 12-image-ocr-pipeline-right-click-side-panel*
*Context gathered: 2026-06-20*
