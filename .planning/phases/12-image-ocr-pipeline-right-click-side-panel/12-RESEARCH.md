# Phase 12: Image OCR Pipeline + Right-Click + Side Panel - Research

**Researched:** 2026-06-20
**Domain:** Chrome MV3 extension — image OCR + translation via Google Cloud (Vision + Translation v2, BYOK), context menu, native side panel
**Confidence:** HIGH (Google Vision/Translation v2 REST shapes verified against official docs; Chrome sidePanel/contextMenus/captureVisibleTab verified against official docs + installed `@types/chrome`; existing hime worker/provider patterns read directly from source)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Provider is Google Cloud, locked by user steer** (overriding the prior research's single-call-Claude recommendation): Vision API `images:annotate` **DOCUMENT_TEXT_DETECTION** for OCR + detected language, then Cloud Translation **v2** for translation. Both API-key BYOK, **one key**. Two calls, hidden behind a `VisionProvider`. Translation **v3 is rejected** (no API key → needs OAuth/service-account, breaks BYOK).
- **D-01 — Panel result model:** the side panel **accumulates a scrollable session list**; each right-click **prepends** a result (newest on top). NOT replace-latest-only. This is the data model Phase 13 needs and reuses the SERP-list render shape.
- **D-02 — Result display layout:** each entry renders **stacked, OCR breaks preserved**: small thumbnail → **translation** → **detected original text below**, each preserving the OCR's line/paragraph breaks (not flattened). Translation above original.
- **D-03 — Target language source:** reuses hime's existing **global target-language setting** — no new per-panel picker. Direction is detected-source → global target. UI must show "Detected: X → Y" (IMG-03).
- **D-04 — Low-confidence UX:** show the result with an **amber "low confidence" badge** when Vision OCR confidence is below threshold (start conservative, ~mean word confidence < 0.6 — pinned below). **Suppress** to the "no text found" state (IMG-05) only when OCR returns genuinely empty. **Never a silent blank.**
- Worker/IMG job + dedup state **MUST persist to `storage.session`** (worker lifecycle).
- `chrome.sidePanel.open()` **must fire synchronously inside the `contextMenus.onClicked` gesture** — open first, then run the async pipeline.
- All network + the BYOK key stay in the **background service worker**; content script does DOM only (key never on page → IMG-07).

### Claude's Discretion

- **Confidence threshold value (D-04)** — pinned in this research: see §"Common Pitfalls / Pitfall 4". Recommend **mean word-level confidence < 0.60 → amber badge**; revisit in Phase 14.
- **Context-menu surface:** target `<img>` elements (IMG-01). `captureVisibleTab` fallback (IMG-04) is an internal resolution detail, not a separate menu item.
- **Side-panel session-list persistence scope** (in-memory vs `storage.session`) — recommend: job/dedup/result state in `storage.session`; the panel's display list mirrors it (rebuilds from `storage.session` on panel open so a worker restart never blanks the panel).
- **Host-permission breadth** — `<all_urls>` upfront vs `optional_host_permissions` runtime grant. Recommendation below: ship `<all_urls>` (content_scripts already declares `<all_urls>` matches, so the install prompt is unchanged in practice).

### Deferred Ideas (OUT OF SCOPE)

- On-demand re-translate of an existing entry (IMG-F1) — Future.
- Multi-provider vision + provider/model dropdown (VIS-F1) — abstraction built internally now, only Google surfaced.
- Per-site scoping for progressive mode (PROG-F1) — Phase 13.
- Same-page multi-image batching into one call (IMG-F2) — Future.
- Copy buttons (IMG-06) and settings key field + test (VIS-02) — Phase 14, **not this phase**.
- Progressive/viewport mode (PROG-*) — Phase 13.
- In-image overlay/inpaint, manga/vertical-CJK special handling, Translation v3, single-call vision LLMs — out of scope for v1.3.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IMG-01 | Right-click any `<img>` → "Translate image with hime" → OCR + translate | §contextMenus pattern (register in `onInstalled`, `contexts:['image']`, `onClicked` top-level); §sidePanel gesture |
| IMG-02 | Panel shows both detected original text and its translation | §VisionProvider shape (`{originalText, translatedText, detectedLang, confidence}`); §panel-render (clone of serp-render) |
| IMG-03 | Detected source language displayed; translate detected-source → configured target | §Vision `detectedLanguages` / Translation v2 `detectedSourceLanguage`; §D-03 direction line |
| IMG-04 | Image bytes resolved in worker (fetch under host_permissions) + `captureVisibleTab` fallback | §Image byte resolution ladder |
| IMG-05 | Explicit per-image state (loading / no-text / low-confidence / error); never silent blank | §Per-image result state contract; §Pitfall 4 |
| IMG-07 | All vision calls in worker; BYOK key never on page | §existing worker invariant (key read from storage in worker only); §Architectural Responsibility Map |
| VIS-01 | `VisionProvider` interface; Google Cloud impl (Vision DOCUMENT_TEXT_DETECTION + Translation v2, one key) | §Standard Stack; §Google Cloud request shapes; §Code Examples |
| VIS-03 | Validate + downscale to Google limits before send (≤10 MB JSON, ≤75M-px, supported MIME) | §VIS-03 size/MIME limits table; §OffscreenCanvas downscale |
</phase_requirements>

## Summary

Phase 12 is a **vertical slice that extends, not reinvents, the shipped v1.2 worker/provider architecture.** The new `translateImage` worker case is structurally a sibling of the existing `searchTranslated` and `translateBatch` cases in `src/background.ts`: it reads settings + the BYOK key from `chrome.storage` in the worker, dedups in-flight work by a content key, calls a provider, records usage, classifies errors via `classifyError`, and `sendResponse`s a typed `{...}|{error,kind}` shape. The new `VisionProvider` (`src/providers/vision-google.ts`) mirrors `OpenAIProvider`'s structure (`AbortController` timeout, `fetch`, `!response.ok` → `classifyError`, usage shape) but performs **two sequential calls under one Google Cloud API key**: Vision `images:annotate` (DOCUMENT_TEXT_DETECTION) for OCR + detected language, then Translation v2 for the translation.

Both Google REST endpoints are **API-key-authed via `?key=`** (verified): Vision `POST https://vision.googleapis.com/v1/images:annotate?key=KEY` with base64 image content inline, and Translation `POST https://translation.googleapis.com/language/translate/v2?key=KEY` (or query params). This is the whole reason v2 (not v3) is locked — v3 has no API-key path. The side panel is a near-clone of the `search.{ts,html,css}` + `serp-render.ts` pattern: a new `sidepanel.html` declared via manifest `side_panel.default_path`, rendered XSS-safe with `textContent` only, accumulating a prepended session list (D-01).

The two flagged gray areas resolve cleanly: (1) the Google request/response shapes are confirmed below with exact bodies; (2) `chrome.sidePanel.open()` **does** count `contextMenus.onClicked` as a valid user gesture — but the gesture is consumed by any `await` before `open()`, so the pattern is **`open({tabId})` first, synchronously, then run the async fetch→vision→render pipeline.** Two concrete gotchas the planner must handle: the pinned `@types/chrome@0.0.246` has `chrome.sidePanel` but is **missing `open()`** (bump to ≥`0.0.258`), and `host_permissions` must be broadened to `<all_urls>` (for worker image fetch) plus the two Google hosts.

**Primary recommendation:** Add `src/providers/vision-google.ts` (two-call, one-key) + a `translateImage` worker case mirroring `searchTranslated` + durable `storage.session` job/result state + `sidepanel.{ts,html,css}` (clone of `search.*`) + `panel-render.ts` (clone of `serp-render.ts`) + `contextMenus` registration in the existing `onInstalled` + manifest deltas (`contextMenus`/`sidePanel` permissions, `<all_urls>` + 2 Google hosts, `side_panel` block). Bump `@types/chrome` to a version with `sidePanel.open()`. No new runtime npm dependencies.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Right-click menu registration + click handling | Background SW | — | `contextMenus` API is SW-only; `onClicked` gives `info.srcUrl` + `tab` + a user gesture |
| Open the side panel | Background SW (`onClicked`) | — | `sidePanel.open()` needs a user gesture; `contextMenus.onClicked` is one. Must be synchronous-first. |
| Resolve image bytes (fetch / data: / blob: / capture) | Background SW (fetch + capture) | Content script (blob: read, bounding-rect for crop) | SW fetch bypasses page CORS via host_permissions; `blob:` is page-origin-scoped so must be read in the content script; capture crop needs `getBoundingClientRect()` from the page |
| Downscale / re-encode / MIME guard | Background SW | — | `OffscreenCanvas` works in the SW; keeps bytes + key worker-side |
| Vision OCR call + Translation v2 call | Background SW | — | BYOK key invariant — all network + key in the worker (IMG-07) |
| In-flight dedup + durable job/result state | Background SW (`storage.session`) | — | Worker globals are wiped on MV3 termination; `storage.session` survives within a browser session |
| Render result list (thumbnail, translation, original, badges, states) | Side panel page (`sidepanel.ts` + `panel-render.ts`) | — | DOM rendering; XSS-safe `textContent`; the page is a `chrome-extension://` context, not the content script |
| Read settings / global target language | Background SW (authoritative) | Side panel (display via `getSettings`) | Settings live in `chrome.storage.local`; worker owns reads for the pipeline |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ^5.2.2 (existing) | Language | Already the project standard; strict mode catches Chrome API misuse `[VERIFIED: package.json]` |
| `@types/chrome` | bump `^0.0.246` → **≥`0.0.258`** (dev only) | Chrome API types | **Pinned `0.0.246` has `chrome.sidePanel` but NO `open()`** (verified by reading installed `index.d.ts` — only `getOptions`/`getPanelBehavior`/`setOptions`/`setPanelBehavior`). `open()` was added later. `captureVisibleTab` IS present. `[VERIFIED: node_modules/@types/chrome/index.d.ts]` |
| Chrome MV3 platform | n/a | Runtime | Existing platform `[VERIFIED: manifest.json]` |
| Native `fetch` + `OffscreenCanvas` + `btoa`/`FileReader` | built-in | Image fetch, downscale, base64 | Zero-dep, CSP-safe; works in the SW context `[CITED: developer.chrome.com service-worker]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `linkedom` | ^0.18.12 (existing, dev) | node-test DOM | For testing `panel-render.ts` exactly as `serp-render.ts` is tested `[VERIFIED: package.json + test/serp.mjs]` |

**No new runtime npm dependencies.** Image fetch, base64 encode, downscale, and both Google POSTs are native `fetch` + `OffscreenCanvas` in the worker — same zero-runtime-dep posture as every prior phase.

### Google Cloud REST endpoints (no SDK — direct fetch, mirroring brave-search.ts / openai.ts)

| Endpoint | URL | Auth | Purpose |
|----------|-----|------|---------|
| Vision annotate | `POST https://vision.googleapis.com/v1/images:annotate?key=KEY` | `?key=` query param | OCR + detected language (DOCUMENT_TEXT_DETECTION) `[CITED: docs.cloud.google.com/vision/docs/ocr]` |
| Translation v2 | `POST https://translation.googleapis.com/language/translate/v2?key=KEY` | `?key=` query param | Translate OCR'd text detected→target `[CITED: docs.cloud.google.com/translate/docs/reference/rest/v2/translate]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Translation **v2** | Translation v3 | v3 has **no API-key auth** (needs OAuth/service-account JWT signing) → breaks BYOK/no-backend. **Rejected (locked).** |
| Two-call Google | single-call vision LLM (Claude/Gemini) | Prior research preferred this, but **user overrode → Google locked.** Treat single-call as deferred (VIS-F1). |
| `DOCUMENT_TEXT_DETECTION` | `TEXT_DETECTION` | DOCUMENT_TEXT_DETECTION is purpose-built for dense text/paragraphs and returns the same `fullTextAnnotation` block/paragraph structure needed to preserve OCR breaks (D-02). **Locked to DOCUMENT_TEXT_DETECTION.** `[CITED: docs.cloud.google.com/vision/docs/ocr]` |

**Installation:**
```bash
npm install -D @types/chrome@^0.0.258
```
(Dev-only type bump for `sidePanel.open()`. No runtime installs.)

**Version verification:**
```bash
npm view @types/chrome version    # latest observed: 0.2.0 (2026-06-20)
```
`[VERIFIED: npm registry]` latest `@types/chrome` is `0.2.0`. Any version ≥ the one that introduced `sidePanel.open()` works; pin conservatively to avoid unrelated breaking type changes — recommend `^0.0.258`+ and run `tsc` to confirm `open()` typechecks. The installed `0.0.246` is confirmed to lack `open()`.

## Package Legitimacy Audit

> No new **runtime** packages. The only change is a dev-dependency version bump of an already-present, first-party DefinitelyTyped package.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@types/chrome` (bump) | npm | years (DefinitelyTyped) | ~millions/wk | github.com/DefinitelyTyped/DefinitelyTyped | not run (no new pkg) | Approved — already a project dependency |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*slopcheck was not run because no new packages are introduced — only a version bump of the existing `@types/chrome`. No `checkpoint:human-verify` gate needed for package install.*

## Architecture Patterns

### System Architecture Diagram

```
  PAGE (content script — DOM only, NO key, NO network)
    │  user right-clicks <img>
    ▼
  chrome.contextMenus.onClicked  (BACKGROUND SW — USER GESTURE)
    │  ① chrome.sidePanel.open({ tabId })   ← SYNCHRONOUS, FIRST, NO await before it
    │  ② info.srcUrl + tab.id captured
    ▼ (now async pipeline begins)
  translateImage job (BACKGROUND SW)
    │  read settings + Google key from chrome.storage.local (key stays here)
    │  compute dedup key (content hash / srcUrl+dims); check storage.session
    │  ┌─────────────── image byte resolution ladder ───────────────┐
    │  │ 1. fetch(srcUrl) → blob → base64        (host_permissions)  │
    │  │ 2. data:/blob: passthrough              (already bytes)     │
    │  │ 3. captureVisibleTab + crop to rect     (CORS/tainted fail) │
    │  └────────────────────────────────────────────────────────────┘
    │  validate MIME + size; OffscreenCanvas downscale ≤ limits (VIS-03)
    ▼
  VisionProvider.ocrTranslate(base64, mime, target)   (BACKGROUND SW)
    │  ① POST vision.googleapis.com/v1/images:annotate?key=KEY
    │       → fullTextAnnotation.text + detectedLanguages + confidences
    │  ② POST translation.googleapis.com/language/translate/v2?key=KEY
    │       → translations[0].translatedText (+ detectedSourceLanguage)
    │  recordUsage(); classifyError() on any !ok
    ▼
  persist result to storage.session  +  chrome.runtime.sendMessage → panel
    ▼
  sidepanel.ts → panel-render.ts (PREPEND entry; textContent only)
    states: loading | populated(thumb + translation + original) | no-text | low-confidence(amber) | error
```

### Recommended Project Structure (new/changed files)
```
src/
├── providers/
│   └── vision-google.ts   # NEW — VisionProvider impl: annotate → translate v2 (one key)
├── image-resolve.ts       # NEW — DOM-agnostic helpers: MIME guard, base64 strip, downscale math (node-testable)
├── panel-render.ts        # NEW — clone of serp-render.ts: renders ImageResult list states (textContent only)
├── sidepanel.ts           # NEW — browser-only page entry (clone of search.ts wiring); NOT node-tested
├── sidepanel.html         # NEW — clone of search.html
├── sidepanel.css          # NEW — clone of search.css
├── background.ts          # EDIT — add translateImage case; contextMenus.create in onInstalled + onClicked listener; sidePanel.open
├── types.ts               # EDIT — VisionProvider interface; ImageResult/ImageState types; 'translateImage' MessageType
└── manifest.json          # EDIT — permissions + host_permissions + side_panel block
```
**Pattern law (carried from v1.2):** browser-only files (`sidepanel.ts`) reference `chrome.*`/`document` and are **not** imported by the node harness. Pure logic (downscale math, MIME guard, result-state derivation, base64 prefix strip) lives in node-testable modules (`image-resolve.ts`, `panel-render.ts`) and is driven by `linkedom` exactly like `serp-render.ts`.

### Pattern 1: `translateImage` worker case — sibling of `searchTranslated`
**What:** A new `case 'translateImage'` in the `onMessage` switch that reads key from storage, dedups, resolves bytes, calls the provider, persists + responds.
**When to use:** Every right-click translation (and, in Phase 13, every progressive trigger) funnels through this single case.
**Example:**
```typescript
// Source: mirrors src/background.ts case 'searchTranslated' (lines 171-257)
case 'translateImage': {
  const { srcUrl, tabId, dedupKey } = (message as TranslateImageMessage).payload;
  const settings = await getSettings();
  const apiKey = settings.googleApiKey;            // read from storage ONLY (IMG-07)
  if (!apiKey) { sendResponse({ error: 'Google Cloud API key not configured', kind: 'auth' }); break; }

  // Dedup against storage.session (durable across worker restarts), not a global Map.
  // (searchTranslated uses an in-memory Map because the call completes in one wake;
  //  image jobs are slower → persist. See Pitfall: SW lifecycle.)
  // ... resolve bytes (ladder) → validate/downscale → provider.ocrTranslate ...
  try {
    const result = await Promise.race([
      visionProvider.ocrTranslate(base64, mime, settings.targetLanguage, apiKey),
      timeout(25000),   // < 30s SW fetch-stall ceiling; treat as retryable failure, not a hang
    ]);
    if (result.usage) await recordUsage('google-vision', result.usage);
    await persistResult(dedupKey, result);          // storage.session
    sendResponse(result);                           // { originalText, translatedText, detectedLang, confidence }
  } catch (err) {
    const kind = (err as { kind?: string })?.kind ?? classifyError('google', err).kind;
    sendResponse({ error: err instanceof Error ? err.message : 'Unknown', kind });
  }
  break;
}
```

### Pattern 2: sidePanel open — synchronous-first inside the gesture
**What:** Open the panel before any `await`; only then start async work.
**Example:**
```typescript
// Source: developer.chrome.com sidePanel (open() valid in contextMenus.onClicked)
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'hime-translate-image' || !tab?.id) return;
  // ① synchronous — DO NOT await anything before this line
  chrome.sidePanel.open({ tabId: tab.id });
  // ② now the async pipeline (fetch → vision → render); push results via messaging
  void runImageJob(info.srcUrl!, tab.id);
});
```

### Pattern 3: contextMenus registration in `onInstalled` (not top-level)
**What:** `create()` in the existing `onInstalled` listener; `onClicked` at top level.
**Example:**
```typescript
// Source: developer.chrome.com contextMenus; avoids duplicate-id on SW restart
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'hime-translate-image',
      title: 'Translate image with hime',
      contexts: ['image'],
    });
  });
});
```

### Anti-Patterns to Avoid
- **`contextMenus.create()` at module top level** → "Cannot create item with duplicate id" on every SW respawn. Use `onInstalled`.
- **`await` before `sidePanel.open()`** → "may only be called in response to a user gesture". Open first.
- **Holding job/result state in worker globals** → lost on SW termination; panel hangs on "translating…". Persist to `storage.session`.
- **Reading image pixels via tainted canvas in the content script** → `SecurityError`. Fetch in the SW; capture+crop as fallback.
- **`innerHTML` for OCR/translation text** → XSS. `textContent` only (the serp-render law).
- **Passing the API key in a message** → key-leak surface. Worker reads it from `chrome.storage` directly (the `braveApiKey` precedent).
- **Sending native-resolution bytes** → base64 inflates ~33% → blows Vision's 10 MB JSON limit → opaque 400. Downscale first.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OCR + language detection | Custom glyph detection / tesseract.js WASM | Google Vision `DOCUMENT_TEXT_DETECTION` | Vendor OCR + `detectedLanguages`; tesseract is weak on photos/CJK and bloats the SW (locked out of scope) |
| Translation | Custom prompt-to-LLM for image text | Google Translation v2 | Locked provider; one key, deterministic, `detectedSourceLanguage` returned |
| Error classification | New error mapping | existing `classifyError(provider, err, {status, bodyMessage})` | Already maps 401/403→auth, 402→credits, 429→rate_limit, AbortError/TypeError→network `[VERIFIED: src/errors.ts]` |
| In-flight dedup | New dedup logic | mirror `inFlightSearches` map pattern, but persist key set to `storage.session` | The pattern exists (background.ts:40); only the storage backing changes for durability |
| Usage metering | New counter | existing `recordUsage(model, usage)` | Writes `himeUsage` in storage.local `[VERIFIED: src/background.ts:69]` |
| XSS-safe rendering | sanitizer lib / innerHTML escaping | clone `serp-render.ts` `el()` + `textContent` | Structural XSS guarantee already proven + node-tested `[VERIFIED: src/serp-render.ts]` |
| Image downscale | manual pixel loops | `OffscreenCanvas` + `drawImage` + `convertToBlob` in the SW | Native, GPU-backed, runs in worker context |
| Base64 of fetched blob | manual chunking | `FileReader.readAsDataURL` or `btoa`(String.fromCharCode of Uint8Array) | Standard; strip the `data:...;base64,` prefix for Vision `content` |

**Key insight:** Phase 12 adds **one new provider file and one new worker case**; everything else (dedup, usage, error taxonomy, XSS-safe render, page wiring, settings read) is a clone or reuse of shipped v1.2 code. Treat divergence from those patterns as a smell.

## Runtime State Inventory

> Not a rename/refactor phase — this is greenfield feature work. Section included only to record **new** durable state this phase introduces (relevant because MV3 SW termination is a hard constraint).

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | NEW: `storage.session` job/dedup/result map for image jobs (key = content hash or srcUrl+dims). NEW: panel session list (mirrors session storage). | code: write/read `storage.session`; rebuild panel list on open |
| Live service config | None — no external service config stored outside git for this phase. | None |
| OS-registered state | `chrome.contextMenus` entry `hime-translate-image` persists across SW restarts (register in `onInstalled`, not top-level). | code: `onInstalled` + `removeAll()` then `create()` |
| Secrets/env vars | NEW: `googleApiKey` setting in `chrome.storage.local` (BYOK). Field UI is **Phase 14 (VIS-02)** — Phase 12 reads it but does not add the settings input. For dev testing, seed via a node harness env var or storage write. | code: add `googleApiKey` to `Settings` type + `DEFAULT_SETTINGS: ''`; reader in worker |
| Build artifacts | NEW `dist/` outputs: `vision-google.js`, `image-resolve.js`, `panel-render.js`, `sidepanel.{js,html,css}`. `copy-assets` already globs `src/*.html`/`src/*.css` → sidepanel assets copied automatically; `.ts` compiled by tsc include glob. | verify `npm run build` emits all; no script change needed |

## Common Pitfalls

### Pitfall 1: `sidePanel.open()` gesture consumed by `await`
**What goes wrong:** Panel opens in manual testing sometimes, then throws "may only be called in response to a user gesture" once any `await` (e.g. `await getSettings()`, `await fetch`) runs before `open()`.
**Why it happens:** `contextMenus.onClicked` provides a gesture, but the gesture token is spent by the first `await`.
**How to avoid:** Call `chrome.sidePanel.open({ tabId })` as the **first synchronous statement** in the listener; start the async pipeline after. `[CITED: developer.chrome.com/docs/extensions/reference/api/sidePanel]`
**Warning signs:** Works on a warm worker, fails on a cold one; intermittent open failures.

### Pitfall 2: Cross-origin / tainted-canvas / `blob:` image bytes
**What goes wrong:** Worker `fetch(srcUrl)` returns 403 (hotlink block) or the image is a page-scoped `blob:`/`data:` URL or a CSS background. Naive same-origin testing passes; real CDN images fail.
**How to avoid:** Multi-strategy resolver, in order: (1) SW `fetch(srcUrl)` → blob → base64 (SW bypasses page CORS via host_permissions); (2) `data:` decode / `blob:` read **in the content script** (blob URLs are page-origin-scoped) then hand bytes to the SW; (3) **`chrome.tabs.captureVisibleTab` + crop** to the image's `getBoundingClientRect()` (× `devicePixelRatio`) as the escape hatch. `captureVisibleTab` returns a `data:image/...;base64,…` data URL; strip the prefix. `[CITED: developer.chrome.com/docs/extensions/reference/api/tabs]`
**Warning signs:** `SecurityError: Tainted canvases may not be exported`; 403/opaque worker fetch; `blob:`/`data:` images do nothing.

### Pitfall 3: Image exceeds Google limits → opaque 400 (VIS-03)
**What goes wrong:** Native-res base64 (33% inflated) exceeds Vision's **10 MB JSON request** limit → HTTP 400; or huge images exceed the **75M-px** OCR cap.
**How to avoid:** Pre-flight in the worker: check MIME against the supported set, then `OffscreenCanvas`-downscale so the base64 payload stays comfortably under 10 MB and pixels under 75M (a long-edge cap around ~2048px is a safe default for legible OCR; do not over-shrink dense CJK — Vision recommends ≥1024px). Re-encode exotic MIME (`svg+xml`, `avif`) to PNG via `OffscreenCanvas.convertToBlob`. `[CITED: docs.cloud.google.com/vision/docs/supported-files]`
**Warning signs:** HTTP 400 mentioning request size; OCR confidence collapses on high-res photos.

### Pitfall 4: No-text / low-confidence / wrong-language → confident garbage (IMG-05, D-04)
**What goes wrong:** A text-free image returns empty/garbled OCR that gets "translated" into nonsense, or low-confidence OCR is presented as authoritative.
**How to avoid — pinned result-state contract:**
- **Empty / no `fullTextAnnotation` (or empty `.text`)** → render the explicit **"no text found"** state (IMG-05). Do **not** call Translation v2 (saves a call + avoids translating nothing).
- **Has text but low confidence** → translate, but render with the **amber low-confidence badge** (D-04). **Threshold (pinned recommendation): mean word-level confidence < 0.60.** Vision's `fullTextAnnotation` exposes `confidence` at page/block/paragraph/word/symbol levels (0–1 range); compute mean over `word` confidences (fall back to symbol-level mean, then page-level, if words absent). Conservative start; revisit in Phase 14. `[CITED: docs.cloud.google.com/vision/docs/handwriting]` `[ASSUMED]` for the 0.60 cutoff value (no vendor-published threshold — chosen conservatively).
- **Detected language** comes from Vision `fullTextAnnotation` pages' `property.detectedLanguages[0].languageCode` **and/or** Translation v2's `detectedSourceLanguage` (returned only when `source` is omitted). Show "Detected: X → Y" (IMG-03). Prefer Translation v2's `detectedSourceLanguage` as the display source if both present (it reflects what was actually translated).
- **Error** (auth/network/quota/400) → per-entry error row with `classifyError` kind; never a blank.
**Warning signs:** Translations of logos/photos; blurry-source output shown as authoritative; blank entries.

### Pitfall 5: MV3 worker sleeps mid-job → panel hangs (durable state)
**What goes wrong:** Image jobs are slower than text; if the SW terminates (30s idle, 30s fetch-stall, 5-min request ceiling) mid-job, in-memory state vanishes and the entry sticks on "translating…".
**How to avoid:** Persist job/dedup/result state to `chrome.storage.session` (not globals). Set an explicit per-call timeout **< 30s** (recommend 25s) via `Promise.race` (the `searchTranslated`/`translateBatch` 8s-timeout pattern, lengthened for image latency) and treat timeout as a typed error, not a hang. On panel open, rebuild the session list from `storage.session` so a restart never blanks the panel. `[CITED: developer.chrome.com service-worker lifecycle]`
**Warning signs:** Entry stuck "translating…" with nothing in the network tab; results only appear on the next user action.

### Pitfall 6: contextMenus duplicate-id on SW restart
**What goes wrong:** `create()` at top level throws "Cannot create item with duplicate id" after respawn.
**How to avoid:** `create()` inside `onInstalled` (optionally after `removeAll()`); keep `onClicked` at top level. `[CITED: developer.chrome.com/docs/extensions/reference/api/contextMenus]`

### Pitfall 7: `@types/chrome@0.0.246` lacks `sidePanel.open()`
**What goes wrong:** `chrome.sidePanel.open` doesn't typecheck → `tsc` build fails (the build runs `tsc` as a gate in `npm test`/`npm run build`).
**How to avoid:** Bump `@types/chrome` (dev) to a version that includes `open()` (≥`0.0.258`; latest `0.2.0`). Verified the pinned `0.0.246` `sidePanel` namespace has only `getOptions`/`getPanelBehavior`/`setOptions`/`setPanelBehavior`. `[VERIFIED: node_modules/@types/chrome/index.d.ts]`

## Code Examples

### Vision `images:annotate` (DOCUMENT_TEXT_DETECTION) request + response
```typescript
// Source: docs.cloud.google.com/vision/docs/ocr (verified 2026-06-20)
// POST https://vision.googleapis.com/v1/images:annotate?key=${apiKey}
const visionBody = {
  requests: [
    {
      image: { content: base64WithoutPrefix },        // strip "data:image/...;base64,"
      features: [{ type: 'DOCUMENT_TEXT_DETECTION' }], // dense-text OCR + structure
      // imageContext.languageHints intentionally OMITTED — Google: "an empty value
      // usually yields the best results" (we want auto-detect for IMG-03).
    },
  ],
};
// Response shape:
// {
//   responses: [{
//     fullTextAnnotation: {
//       text: "全文…\nwith\nbreaks",            // full text WITH line/paragraph breaks (D-02)
//       pages: [{ confidence: 0.97,
//                 property: { detectedLanguages: [{ languageCode: "ja", confidence: 0.99 }] },
//                 blocks: [{ confidence, paragraphs: [{ words: [{ confidence, symbols: [...] }] }] }]
//       }]
//     },
//     textAnnotations: [ /* TEXT_DETECTION-style flat list; [0].description = whole text, [0].locale */ ],
//     error?: { code, message }                  // per-request error (batch can partial-fail)
//   }]
// }
// Empty image → responses[0] has NO fullTextAnnotation (and no textAnnotations) → "no text found".
```

### Translation v2 request + response
```typescript
// Source: docs.cloud.google.com/translate/docs/reference/rest/v2/translate (verified 2026-06-20)
// POST https://translation.googleapis.com/language/translate/v2?key=${apiKey}
const translateBody = {
  q: fullTextAnnotation.text,        // the OCR'd text (q may be a string or array of strings)
  target: targetLangCode,            // e.g. "en" — map hime's display name ("English") → ISO code
  format: 'text',                    // default is 'html'; use 'text' so breaks/punct aren't HTML-escaped
  // source: OMITTED → auto-detect → response includes detectedSourceLanguage (IMG-03)
};
// Response:
// { data: { translations: [{ translatedText: "...", detectedSourceLanguage: "ja" }] } }
// On error: HTTP 4xx with { error: { code, message, status } } → classifyError(status,...)
```

### VisionProvider interface + two-call impl skeleton
```typescript
// Source: mirrors src/types.ts TranslationProvider + src/providers/openai.ts structure
// types.ts
export interface ImageResult {
  originalText: string;
  translatedText: string;
  detectedLang: string;            // ISO code or display name for "Detected: X → Y"
  confidence: number;              // mean word confidence 0..1 (for D-04 amber badge)
  usage?: { inputTokens: number; outputTokens: number }; // chars for translation, units for vision
}
export interface VisionProvider {
  name: string;
  ocrTranslate(imageBase64: string, mime: string, targetLang: string, apiKey: string): Promise<ImageResult>;
}

// providers/vision-google.ts — AbortController timeout + classifyError, like openai.ts
export class GoogleVisionProvider implements VisionProvider {
  name = 'google';
  async ocrTranslate(b64: string, _mime: string, targetLang: string, apiKey: string): Promise<ImageResult> {
    // 1) Vision annotate (?key=) → fullTextAnnotation; if empty → throw a typed 'no-text' OR
    //    return a sentinel the worker maps to the no-text state (recommend: distinct path, not error).
    // 2) Translation v2 (?key=) with q = fullText, format:'text', target = ISO(targetLang).
    // Both: !response.ok → classifyError('google', null, { status, bodyMessage }) (errors.ts).
    // Compute mean word confidence from fullTextAnnotation for the badge.
  }
}
```

### Side panel manifest + render (clone pattern)
```jsonc
// manifest.json deltas
{
  "permissions": ["activeTab", "storage", "scripting", "contextMenus", "sidePanel"],
  "host_permissions": [
    "https://api.openai.com/*",
    "https://generativelanguage.googleapis.com/*",
    "https://openrouter.ai/*",
    "https://api.search.brave.com/*",
    "https://vision.googleapis.com/*",       // NEW
    "https://translation.googleapis.com/*",  // NEW
    "<all_urls>"                             // NEW — SW fetch of arbitrary <img> bytes
  ],
  "side_panel": { "default_path": "sidepanel.html" }   // NEW
}
```
`panel-render.ts` is a structural clone of `serp-render.ts`: a `renderPanel(state, doc, mount)` over a discriminated `ImageState` union (`loading | populated(entries) | error`), each entry built with the `el(doc, tag, {text, className})` helper using `textContent` only. D-01 prepend: `mount.prepend(entryNode)` (don't `replaceChildren`).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Prior research recommended single-call Claude Vision | Google Cloud (Vision + Translation v2) two-call, one key | User steer, 2026-06-20 | Locked; STACK.md's Claude recommendation is superseded for v1.3 |
| `cloud.google.com/...` doc URLs | redirect → `docs.cloud.google.com/...` | 2026 (301) | Use `docs.cloud.google.com` host for Google Cloud docs |
| `@types/chrome@0.0.x` without `sidePanel.open()` | `open()` added in a later `0.0.x` | post-0.0.246 | Must bump dev dep for typecheck |

**Deprecated/outdated:**
- Translation **v3** for this milestone — rejected (no API-key auth). Do not use.
- `cloud.google.com` (non-`docs`) host — now redirects.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Low-confidence threshold = mean word confidence < 0.60 | D-04 / Pitfall 4 | Too high → over-flags; too low → misses bad OCR. Tunable; revisited Phase 14. No vendor-published value. |
| A2 | Long-edge downscale ~2048px is a safe default that keeps OCR legible while staying under Vision's 10 MB JSON / 75M-px limits | VIS-03 / Pitfall 3 | Too aggressive → dense CJK degrades; too gentle → 400 on huge images. Vision recommends ≥1024px; tune per-image, recheck Phase 14. |
| A3 | hime's target-language **display names** ("English", "Japanese") must be mapped to ISO codes for Translation v2 `target` and for "Detected: X → Y" display | D-03 / Code Examples | Wrong/missing mapping → Translation v2 400 (invalid target). Planner must add a name↔ISO map (small lookup over `SUPPORTED_LANGUAGES`). |
| A4 | `@types/chrome ≥ 0.0.258` includes `sidePanel.open()` | Standard Stack / Pitfall 7 | If the exact version is wrong, `tsc` still flags it — planner runs `tsc` to confirm; bump further if needed. Latest `0.2.0` definitely has it. |
| A5 | Per-call timeout of 25s is safely under the 30s SW fetch-stall ceiling for a two-call (annotate+translate) sequence | Pitfall 5 | If the *sequence* (not a single fetch) approaches 30s idle, may need per-fetch timeouts instead of one wrapping race. Recommend timing each Google call separately. |

## Open Questions

1. **Detected-language source of truth (Vision vs Translation v2).**
   - What we know: both return it — Vision `detectedLanguages[].languageCode` (per page/block), Translation v2 `detectedSourceLanguage` (when `source` omitted).
   - What's unclear: which to display when they disagree.
   - Recommendation: display Translation v2's `detectedSourceLanguage` (it reflects what was actually translated); use Vision's as a fallback if v2 omits it.

2. **One key vs separate Vision/Translation enablement.** A single Google Cloud API key works for both endpoints **only if both APIs are enabled on the key's project** and the key isn't API-restricted.
   - Recommendation: surface a clear auth error (the connection test in Phase 14 / VIS-02 will exercise both endpoints) and document "enable Cloud Vision API + Cloud Translation API on your project" for the user. For Phase 12 dev, the tester's key must have both enabled.

3. **captureVisibleTab crop coordinates.** Cropping to the image rect needs the content script to report `getBoundingClientRect()` × `devicePixelRatio`, and the image must be scrolled into view.
   - Recommendation: for Phase 12's manual right-click path, the right-clicked image is by definition visible; have the content script report the rect on demand. Treat sub-pixel/scroll edge cases as a Phase 14 polish item.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js test harness (`node --test`) | Unit testing panel-render/image-resolve | ✓ | existing | — |
| `linkedom` | DOM in node tests | ✓ | ^0.18.12 | — |
| `tsc` | Build gate | ✓ | ^5.2.2 | — |
| `@types/chrome` with `sidePanel.open()` | Typecheck of `open()` | ✗ (0.0.246 lacks it) | needs ≥0.0.258 | none — must bump dev dep |
| Google Cloud API key (Vision + Translation enabled) | Live OCR/translate testing | ✗ (BYOK; user-provided) | — | node harness against `dist/providers/vision-google.js` with key from env (per project test law — never the SW console) |

**Missing dependencies with no fallback:** `@types/chrome` bump (blocks `tsc` if `open()` is used) — trivial install.
**Missing dependencies with fallback:** Google API key — supply via env to a node harness importing `dist/`; do not test via the service-worker console (MEMORY law).

## Validation Architecture

> `nyquist_validation` key is absent from `.planning/config.json` → treated as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in) + `linkedom` for DOM |
| Config file | none — driven by `package.json` `test` script |
| Quick run command | `npm run build && node --test test/panel-render.mjs` |
| Full suite command | `npm test` (`tsc && node --test 'test/**/*.mjs'`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VIS-01 | VisionProvider builds correct Vision + Translation v2 request bodies; maps response → ImageResult | unit (fetch-mocked) | `node --test test/vision-google.mjs` | ❌ Wave 0 |
| VIS-03 | MIME guard + downscale math produce within-limit payload; exotic MIME → PNG | unit | `node --test test/image-resolve.mjs` | ❌ Wave 0 |
| IMG-02/03/05 | panel-render renders populated (thumb/translation/original), no-text, low-confidence (amber), error states; prepend order (D-01); breaks preserved (D-02) | unit (linkedom) | `node --test test/panel-render.mjs` | ❌ Wave 0 |
| IMG-05 (low-conf) | result-state derivation: empty→no-text, <0.60→low-conf, error→error | unit | `node --test test/image-resolve.mjs` | ❌ Wave 0 (or panel-render) |
| IMG-01/04/07, sidePanel gesture, dedup-durability | end-to-end worker behavior | manual / in-page UI check | load-unpacked + right-click a real image; observe panel | n/a (manual) |

### Sampling Rate
- **Per task commit:** `npm run build && node --test test/<touched>.mjs`
- **Per wave merge:** `npm test`
- **Phase gate:** full suite green + a manual right-click smoke on (a) a same-origin image, (b) a CDN/cross-origin image (capture fallback), (c) a text-free image (no-text state), before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `test/vision-google.mjs` — covers VIS-01 (request shapes + response mapping, fetch mocked)
- [ ] `test/image-resolve.mjs` — covers VIS-03 + result-state derivation (pure functions)
- [ ] `test/panel-render.mjs` — covers IMG-02/03/05 render states (linkedom, mirrors `test/serp.mjs`)
- [ ] Mock fixtures: Vision annotate sample responses (populated, empty, low-confidence) + Translation v2 sample — add to a `src/panel-mock.ts` (mirror `search-mock.ts`)
- Framework install: none — `node:test` + `linkedom` already present.

## Security Domain

> `security_enforcement` absent from config → treated as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No user auth in extension; BYOK API key only |
| V3 Session Management | no | No sessions |
| V4 Access Control | yes | BYOK key read **only** in the SW; never sent in a message or exposed to content script/page (IMG-07). `host_permissions` scoped to needed hosts + `<all_urls>` for image fetch (documented breadth). |
| V5 Input Validation | yes | OCR text + translation rendered via `textContent` only (no innerHTML); MIME/size validated before send; `URL`/query params encoded by the API SDK-less fetch (use `?key=` via `URL.searchParams` or template — never log the key) |
| V6 Cryptography | no | No custom crypto; TLS to Google endpoints handled by `fetch` |

### Known Threat Patterns for {MV3 extension + cloud OCR}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via OCR'd text or translation injected as HTML | Tampering | `textContent`-only render (panel-render clone of serp-render) |
| API key exfiltration to a hostile page | Information disclosure | Key stays in SW; never in content script, never in a message, never logged (mirror brave-search.ts T-08-03) |
| Silent upload of sensitive images | Information disclosure | Right-click is explicit/user-initiated (safe path); progressive privacy warning is Phase 13. Do not log image bytes/OCR text persistently. |
| Over-broad host permissions | Elevation of privilege / trust | `<all_urls>` is already in `content_scripts.matches`, so the install prompt is unchanged; document the SW-fetch rationale. `optional_host_permissions` is the fallback if store review objects. |
| Tainted-canvas bypass attempts | — | Use SW fetch + captureVisibleTab fallback; never read cross-origin pixels in the page |

## Project Constraints (from CLAUDE.md)

- `/home/ben/code/hime/.claude/CLAUDE.md` `@`-includes `/home/ben/code/eng-standards/eng-standards.md`, **which does not exist** (`/home/ben/code/eng-standards/` is absent). `[VERIFIED: filesystem]` The shared eng-standards could not be read; the planner should treat documented project conventions (below, derived from the codebase) as the operative standards and flag the broken include to the user.
- **Test law (MEMORY):** never verify hime via the service-worker console — use a node harness against compiled `dist/*.js` driven by an env key, with a short oneliner. Reserve manual steps for in-page UI clicks.
- **Codebase conventions (observed, treat as binding):**
  - All network + API keys live in the **background service worker**; key never in a message or on the page.
  - BYOK keys in `chrome.storage` (`braveApiKey` precedent for non-`apiKeys` keys → add `googleApiKey` top-level on `Settings`).
  - XSS-safe rendering = `textContent` only; renderers are DOM-agnostic (Document injected) and node-tested via `linkedom`.
  - Zero runtime npm dependencies; direct `fetch`, no SDKs.
  - Provider files follow the `openai.ts` shape: `AbortController` timeout, `!response.ok` → `classifyError`, usage shape.
  - Build is plain `tsc` + `copy-assets`; `tsc` is a gate in `npm test`.

## Sources

### Primary (HIGH confidence)
- `docs.cloud.google.com/vision/docs/ocr` — `images:annotate` endpoint, request body (image.content base64, features type, imageContext.languageHints), `?key=` auth, response `fullTextAnnotation` vs `textAnnotations`, `locale`/`detectedLanguages` — verified 2026-06-20
- `docs.cloud.google.com/vision/docs/handwriting` — fullTextAnnotation Page→Block→Paragraph→Word→Symbol hierarchy, `confidence` at all levels, `property.detectedLanguages[].languageCode` — verified 2026-06-20
- `docs.cloud.google.com/translate/docs/reference/rest/v2/translate` — v2 endpoint, `q`/`target`/`source`/`format` params, `?key=` auth confirmed, response `data.translations[].translatedText`/`detectedSourceLanguage` — verified 2026-06-20
- `developer.chrome.com/docs/extensions/reference/api/sidePanel` — `open(OpenOptions)` user-gesture rule, contextMenus.onClicked valid, `side_panel.default_path`, `setOptions`, `setPanelBehavior` — verified 2026-06-20
- `developer.chrome.com/docs/extensions/reference/api/tabs` — `captureVisibleTab(windowId, ImageDetails)`, permissions (activeTab/<all_urls>/host), returns data URL, visible-viewport-only — verified 2026-06-20
- Codebase: `src/background.ts`, `src/types.ts`, `src/errors.ts`, `src/providers/openai.ts`, `src/serp-render.ts`, `src/brave-search.ts`, `src/search.ts`, `package.json`, `tsconfig.json`, `manifest.json`, `node_modules/@types/chrome/index.d.ts`, `test/serp.mjs` — read directly
- `.planning/research/PITFALLS.md`, `STACK.md` — prior v1.3 research (Chrome lifecycle/limits verified there)

### Secondary (MEDIUM confidence)
- `docs.cloud.google.com/vision/docs/supported-files` (via prior PITFALLS research) — ≤10 MB JSON, 75M-px OCR cap, ≥1024×768 recommended
- npm registry — `@types/chrome` latest `0.2.0`

### Tertiary (LOW confidence)
- Confidence threshold 0.60 (A1) and downscale long-edge 2048px (A2) — chosen conservatively, no vendor-published values; tune in Phase 14

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Google REST shapes + Chrome APIs verified against official docs; `@types/chrome` gap verified in installed source
- Architecture: HIGH — directly mirrors shipped v1.2 worker/provider/render patterns read from source
- Pitfalls: HIGH — Chrome lifecycle/gesture/contextMenus + Google limits verified; thresholds (A1/A2) are explicit assumptions

**Research date:** 2026-06-20
**Valid until:** ~2026-07-20 (Google Cloud REST v2 + Chrome MV3 APIs are stable; re-confirm `@types/chrome` version and Vision pricing if used for budgeting)
