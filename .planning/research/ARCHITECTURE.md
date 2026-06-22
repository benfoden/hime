# Architecture Research

**Domain:** Chrome MV3 extension — image OCR + translation (cloud vision, BYOK), surfaced in a side panel
**Researched:** 2026-06-20
**Confidence:** HIGH (existing codebase read directly; Chrome sidePanel/contextMenus/network-request semantics verified against current developer.chrome.com docs)

> Scope: v1.3 **new features only**. The existing v1.0–v1.2 architecture (background-worker-owns-all-network, typed content↔worker message contract, provider abstraction, BYOK in `chrome.storage`, XSS-safe `textContent`-only render) is the foundation we *integrate with* and *reuse* — not re-research. This document specifies how image translation bolts onto it and the dependency-ordered build sequence for phases 12+.

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          CONTENT SCRIPT (content.js)                       │
│                       isolated world — DOM/UX only, NO keys                │
│  ┌────────────────────────┐        ┌──────────────────────────────────┐   │
│  │ existing: compose/yolo │        │ NEW: image-observer wiring        │   │
│  │ predict/swap handlers  │        │  • IntersectionObserver over <img>│   │
│  └────────────────────────┘        │  • per-img WeakMap state (dedup) │   │
│                                     │  • concurrency queue (gate cost) │   │
│                                     │  • settings gate (default OFF)   │   │
│                                     └───────────────┬──────────────────┘   │
└────────────────────────────────────────────────────┼──────────────────────┘
        ▲ contextMenus click (worker-side)            │ runtime.sendMessage
        │ srcUrl arrives in worker, NOT via content   │ { type:'translateImage', payload:{ srcUrl } }
        │                                              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                      BACKGROUND SERVICE WORKER (background.js)              │
│              owns ALL network + keys; single onMessage switch              │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │ contextMenus    │  │ NEW: image-fetch │  │ NEW: vision provider     │  │
│  │ .onClicked      │─▶│  fetch(srcUrl)   │─▶│  VisionProvider abstraction│ │
│  │ (registers menu)│  │  → base64 + mime │  │  ocrTranslate(img,cfg,key)│  │
│  └─────────────────┘  │  (captureVisible │  │  → {detectedText,          │  │
│                       │   Tab fallback)  │  │     translation}          │  │
│                       └──────────────────┘  └────────────┬─────────────┘  │
│  reuse: getSettings(), recordUsage(), classifyError(), in-flight dedup     │
└────────────────────────────────────────────────────────┼──────────────────┘
                                                          │ sidePanel.open() +
                                                          │ runtime.sendMessage / port
                                                          ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    SIDE PANEL PAGE (sidepanel.html / .js)                   │
│   extension-origin page; full chrome.* access; renders result text         │
│  ┌──────────────────────────────────────────────────────────────────┐     │
│  │ NEW: panel-render.ts — original text + translation, per-image      │     │
│  │  card list; XSS-safe textContent-only (reuse serp-render pattern)  │     │
│  └──────────────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | New / Modified | Built like |
|-----------|----------------|----------------|------------|
| `image-observer.ts` (content) | IntersectionObserver over `<img>`, dedup map, concurrency queue, settings gate | **NEW** | self-contained, no top-level import/export (content.js is a classic script — see Anti-Pattern 4) |
| `contextMenus` block (background) | register "Translate image with hime" on `image` context; `onClicked` → resolve `srcUrl` → run pipeline → open panel | **NEW** (in background) | mirror existing `onInstalled`/`onMessage` registration style |
| `image-fetch.ts` (background) | `fetch(srcUrl)` → `ArrayBuffer` → base64 + MIME; `captureVisibleTab` fallback for tainted/cross-origin-blocked | **NEW** | new helper module imported by background |
| `VisionProvider` + `providers/vision-*.ts` | `ocrTranslate(imageB64, mime, config, apiKey, model)` → `{detectedText, translation}` | **NEW**, parallels `TranslationProvider` | clone `OpenAIProvider`/`GeminiProvider` fetch+classifyError+timeout shape |
| `translateImage` case (background switch) | route content/menu request → fetch bytes → vision provider → respond / push to panel | **NEW** case in existing `onMessage` switch | identical shape to `searchTranslated` case |
| `panel-render.ts` + `sidepanel.html/.ts` | render `{original, translation}` cards; loading/error states | **NEW** | clone `serp-render.ts` DOM-agnostic `textContent`-only renderer |
| `background.ts` onMessage switch | host new `translateImage` case | **MODIFIED** | add one `case` |
| `types.ts` | new message/result types, settings fields | **MODIFIED** | extend `MessageType` union, `Settings`, add `VisionProvider` interface |
| `options.ts` / `options.html` | vision provider/key fields + progressive-mode toggle (default OFF) | **MODIFIED** | mirror `braveApiKey` field wiring |
| `manifest.json` | add `sidePanel`, `contextMenus` perms; `side_panel.default_path`; vision host_permissions; image-host permission strategy | **MODIFIED** | additive |

---

## Recommended Project Structure

```
src/
├── content.ts                  # MODIFIED: bootstrap image-observer (inline; classic script)
├── background.ts               # MODIFIED: + contextMenus reg, + translateImage case
├── types.ts                    # MODIFIED: + TranslateImageMessage/Response, VisionProvider, settings
├── image-fetch.ts              # NEW: srcUrl → base64+mime (worker-only), captureVisibleTab fallback
├── image-observer.ts           # NEW: dedup + queue + threshold pure logic (node-testable core)
├── panel-render.ts             # NEW: DOM-agnostic card renderer (clone of serp-render.ts)
├── sidepanel.html              # NEW: side panel entry markup
├── sidepanel.ts                # NEW: browser-only panel entry (clone search.ts shape)
├── sidepanel.css               # NEW
└── providers/
    ├── vision.ts               # NEW: VisionProvider interface + registry helper
    ├── vision-google.ts        # NEW: Vision DOCUMENT_TEXT_DETECTION + Translation v3 (two-call)
    └── vision-claude.ts        # NEW: Claude vision single-call OCR+translate
```

### Structure Rationale

- **`image-observer.ts` split logic vs DOM:** mirror the v1.2 lesson (`serp-render.ts` is DOM-agnostic and node-tested, `search.ts` is browser-only). The queue/dedup/threshold logic is pure and testable. But **content.js is a classic script, not a module** (see content.ts header) — top-level `import`/`export` break it. So the *testable core* (`shouldTranslate`, queue drain) lives in `image-observer.ts` for the node harness, and the thin IntersectionObserver wiring is **inlined into `content.ts`**.
- **`providers/vision-*.ts` parallels `providers/*.ts`:** identical pattern — class implementing an interface, `fetch` + `classifyError` + `AbortController` timeout, returns a typed result with `usage`. Drops straight into a `visionProviders` registry exactly like the existing `providers` record in `background.ts`.
- **`panel-render.ts` clones `serp-render.ts`:** same `el()` helper, same `textContent`-only XSS contract, same injected-`Document` testability. Reuse, don't reinvent.
- **Build note:** the build is plain `tsc` + `copy-assets` (no bundler). Each HTML page references its own compiled `.js`. Adding `sidepanel.html`/`.ts`/`.css` is the exact same move as the v1.2 `search.html`/`.ts` addition — no config change.

---

## Architectural Patterns

### Pattern 1: New worker message case (reuse `searchTranslated` shape)

**What:** Add a `translateImage` case to the existing `chrome.runtime.onMessage` switch. Key read from storage only; bytes fetched in-worker; provider routed through the abstraction; errors classified with `classifyError`. This is the integration point — content script never touches the network or the key.

**When:** Both the progressive observer and the context-menu handler funnel through this one case.

**Trade-offs:** Single choke point makes dedup, usage recording, and timeout uniform (good). Service-worker lifetime means a long OCR call must complete before the worker idles — keep the message channel open (`return true`, already the existing pattern).

```typescript
// types.ts (MODIFIED)
export interface TranslateImageMessage extends Message {
  type: 'translateImage';
  payload: { srcUrl?: string; captureBytes?: string; mime?: string; imageId: string };
}
export interface TranslateImageResponse {
  imageId: string;
  detectedText?: string;
  translation?: string;
  error?: string;
  kind?: import('./errors.js').ErrorKind;
}

// background.ts (MODIFIED) — inside the existing switch
case 'translateImage': {
  const msg = message as TranslateImageMessage;
  const settings = await getSettings();
  const apiKey = settings.apiKeys[settings.visionProvider] || '';   // key from storage ONLY
  if (!apiKey) { sendResponse({ imageId: msg.payload.imageId, error: 'Vision key not configured', kind: 'auth' }); break; }
  try {
    const { b64, mime } = msg.payload.srcUrl
      ? await fetchImageAsBase64(msg.payload.srcUrl)               // worker-side fetch (CORS-free)
      : { b64: msg.payload.captureBytes!, mime: msg.payload.mime! };
    const provider = visionProviders[settings.visionProvider];
    const result = await provider.ocrTranslate(b64, mime, buildVisionConfig(settings), apiKey, settings.visionModel);
    if (result.usage) await recordUsage(settings.visionModel, result.usage);
    sendResponse({ imageId: msg.payload.imageId, detectedText: result.detectedText, translation: result.translation });
  } catch (err) {
    const kind = (err as { kind?: string })?.kind ?? classifyError(settings.visionProvider, err).kind;
    sendResponse({ imageId: msg.payload.imageId, error: err instanceof Error ? err.message : 'Unknown error', kind });
  }
  break;
}
```

### Pattern 2: Image fetch + encode lives in the worker (CORS / host_permissions)

**What:** The service worker `fetch`es `srcUrl`, reads `arrayBuffer()`, base64-encodes, and infers MIME. The content script must NOT do this — content scripts inherit the **page's** origin and are bound by same-origin policy, so a cross-origin image (the common case) is unreadable there. The worker, given host_permissions, is not.

**When:** Primary path for both context-menu and progressive translation.

**Trade-offs / decision:** Fetching arbitrary image URLs needs broad `host_permissions` (`"https://*/*"`), which triggers a "read your data on all websites" install warning. **Recommendation:** declare `https://*/*` host permission (hime already injects on `<all_urls>`, so the trust posture is similar) AND keep a **`chrome.tabs.captureVisibleTab` fallback** for images the worker can't fetch (auth-gated CDNs, already-decoded blob:/data:, tainted). The capture path needs only `activeTab` and returns a PNG data URL of the visible viewport — crop to the image rect before sending if precision matters, or send whole-viewport for v1.3 simplicity.

```typescript
// image-fetch.ts (NEW) — worker context only
export async function fetchImageAsBase64(srcUrl: string): Promise<{ b64: string; mime: string }> {
  if (srcUrl.startsWith('data:')) return parseDataUrl(srcUrl);
  const resp = await fetch(srcUrl);                       // worker origin + host_permissions → no CORS
  if (!resp.ok) { const e = new Error(`image fetch ${resp.status}`); (e as any).kind = 'network'; throw e; }
  const mime = resp.headers.get('content-type') || 'image/png';
  const buf = await resp.arrayBuffer();
  return { b64: arrayBufferToBase64(buf), mime };
}
```

### Pattern 3: Progressive IntersectionObserver with dedup + concurrency gate (content)

**What:** Default-OFF. When enabled, observe every `<img>` (and new ones via `MutationObserver`). When an image approaches the viewport, enqueue a `translateImage` request — but cap concurrent in-flight worker calls to control cost/latency, and dedup so each image is translated at most once.

**When:** Only when `settings.imageProgressive === true` (read once at content-script init, re-read on `chrome.storage.onChanged`).

**Trade-offs:** `rootMargin` pre-fetches before the image is visible (better perceived latency) at the cost of translating images the user may scroll past. A concurrency cap of ~2–3 plus per-image dedup keeps a 50-image gallery from firing 50 simultaneous paid API calls. Skip tiny images (icons/spacers) via a min `naturalWidth/Height` threshold to avoid wasting calls on non-text decorations. This mirrors the v1.2 in-flight-dedup cost discipline.

```typescript
// image-observer.ts (NEW) — pure logic exported for node tests; wiring inlined into content.ts
const translated = new WeakMap<HTMLImageElement, 'pending' | 'done' | 'error'>(); // dedup
const queue: HTMLImageElement[] = [];
let inFlight = 0;
const MAX_CONCURRENT = 3;          // cost/latency gate
const MIN_SIDE_PX = 48;            // skip icons/spacers

const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const img = e.target as HTMLImageElement;
    if (!e.isIntersecting) continue;
    if (translated.has(img)) continue;                              // already handled
    if (img.naturalWidth < MIN_SIDE_PX || img.naturalHeight < MIN_SIDE_PX) continue;
    translated.set(img, 'pending');
    queue.push(img); drain();
  }
}, { rootMargin: '200px', threshold: 0.01 });   // 200px = "approaching viewport"

function drain() {
  while (inFlight < MAX_CONCURRENT && queue.length) {
    const img = queue.shift()!; inFlight++;
    chrome.runtime.sendMessage({ type: 'translateImage', payload: { srcUrl: img.currentSrc || img.src, imageId: idFor(img) } })
      .then((r) => translated.set(img, r?.error ? 'error' : 'done'))
      .finally(() => { inFlight--; drain(); });
  }
}
// gate: if (settings.imageProgressive) document.querySelectorAll('img').forEach(i => io.observe(i));
```

### Pattern 4: Context-menu entry funnels into the same pipeline

**What:** Register one `chrome.contextMenus` item with `contexts: ['image']` in the worker (`onInstalled`). On click, `info.srcUrl` is the image URL — already in the worker, so it bypasses the content script entirely. Run the same fetch→vision pipeline, then `sidePanel.open({ windowId })` (allowed: a context-menu click is a user gesture) and push the result to the panel.

**When:** Manual, one-off translation. Consumes no hotkey slot (the 4-hotkey cap is untouched).

```typescript
// background.ts (MODIFIED)
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'hime-translate-image', title: 'Translate image with hime', contexts: ['image'] });
});
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'hime-translate-image' || !info.srcUrl) return;
  if (tab?.windowId != null) await chrome.sidePanel.open({ windowId: tab.windowId });  // user gesture OK
  const imageId = crypto.randomUUID();
  // run shared fetch→vision pipeline → deliver to panel (see Data Flow)
});
```

---

## Data Flow

### Context-menu flow (manual)

```
right-click <img> → "Translate image with hime"
  → contextMenus.onClicked (worker) has info.srcUrl
      → sidePanel.open({windowId})            (user gesture satisfied)
      → fetchImageAsBase64(srcUrl)            (worker fetch, CORS-free)
      → visionProvider.ocrTranslate()         (BYOK key from storage)
      → recordUsage()
      → deliver {imageId, detectedText, translation} → side panel
  → panel-render.ts appends a card (textContent-only)
```

### Progressive flow (opt-in, default OFF)

```
settings.imageProgressive === true
  → content: IntersectionObserver observes <img> (rootMargin 200px)
  → img approaches viewport → dedup check → enqueue
  → concurrency gate (≤3 in flight) → runtime.sendMessage('translateImage', {srcUrl, imageId})
  → worker: same fetch → vision → respond
  → worker also pushes to side panel (open if behavior allows; else buffer until opened)
  → panel renders card; content marks WeakMap 'done'
```

### Worker → panel delivery (two viable mechanisms)

1. **`chrome.runtime.sendMessage` broadcast** + the panel holds a `chrome.runtime.onMessage` listener. Simplest; matches existing message style. Risk: if the panel isn't open, the message is dropped — so the worker should also stash latest results in `chrome.storage.session` (or an in-memory map keyed by tab) and the panel hydrates from it on load.
2. **`chrome.runtime.connect` long-lived port** from panel → worker on panel load; worker pushes over the port. Cleaner for streaming multiple progressive results, but more lifecycle code.

**Recommendation:** Start with (1) `sendMessage` + a `session`-storage hydration buffer (least new machinery, reuses the message contract). Move to a port only if progressive mode's multi-result streaming feels laggy.

---

## sidePanel vs injected in-page panel — DECISION

**Recommendation: `chrome.sidePanel` (MV3 native side panel).** Confidence HIGH.

| Criterion | `chrome.sidePanel` (native) | Injected in-page panel (content-script DOM) |
|-----------|-----------------------------|---------------------------------------------|
| Origin / CSP | Extension-origin page, full `chrome.*`, no host-page CSP | Subject to host-page CSP; many sites block injected styles/scripts |
| XSS surface | Isolated from page DOM | Shares page DOM; higher risk, must shadow-DOM-isolate |
| Reuse of v1.2 pattern | Direct clone of `search.ts`/`serp-render.ts` (extension page) | New isolation machinery, no prior art in hime |
| Persistence across scroll/nav | Stable, browser-managed | Tears down on SPA nav; must re-inject |
| User gesture to open | `open()` needs a gesture — context-menu click qualifies | Always available |
| Cost | One manifest key + perm | Per-site breakage debugging |

**Rationale:** hime already builds extension-origin pages (`search.html`, `options.html`, `popup.html`) and already has a DOM-agnostic `textContent`-only renderer to clone. The side panel is the same kind of page — `sidepanel.ts` is a near-copy of `search.ts`, `panel-render.ts` a near-copy of `serp-render.ts`. It sidesteps every host-page CSP/XSS headache an injected panel reintroduces. The only constraint — `open()` requires a user gesture — is satisfied by the context-menu click; for progressive mode the panel can be opened via `setPanelBehavior({ openPanelOnActionClick: true })` (toolbar click) or left for the user to open, with results buffered until then.

**Manifest additions:**
```jsonc
"permissions": ["activeTab","storage","scripting","contextMenus","sidePanel"],
"host_permissions": ["https://*/*", /* + existing API hosts */],
"side_panel": { "default_path": "sidepanel.html" }
```

---

## Provider abstraction — reuse, two candidates

Parallel `TranslationProvider` exactly. The roadmap-review decision (Claude single-call vs Google Vision + Translation v3) maps to two interchangeable classes behind one interface — build the interface + registry first so the choice is swappable.

```typescript
export interface VisionProvider {
  name: string;
  ocrTranslate(imageB64: string, mime: string, config: TranslationConfig, apiKey: string, model: string):
    Promise<{ detectedText: string; translation: string; usage?: { inputTokens: number; outputTokens: number } }>;
}
```

| Path | Calls | Bbox geometry | Fit for v1.3 (side-panel text only) |
|------|-------|---------------|-------------------------------------|
| **Claude vision (single-call)** | 1 (OCR+translate in one prompt) | none | **Best fit** — no overlay needed, fewer moving parts, reuses an Anthropic-style fetch |
| Google Vision + Translation v3 | 2 (DOCUMENT_TEXT_DETECTION → TranslateText) | word-level boundingBox | Overkill for text-only panel; keep for a future overlay milestone |

Side-panel output means geometry is unused, which favors the **single-call Claude path** for v1.3. Build the interface so Google can be added later without touching the worker switch. (Final pick is the roadmap-review's call; architecture supports either.)

---

## Build Order (dependency-ordered, maps to phases 12+)

> Each step is independently shippable/testable and reuses an existing pattern. Suggested phase grouping in brackets.

1. **Scaffold: types + provider interface + manifest + worker case + image-fetch** *(Phase 12 — foundation)*
   - `types.ts`: `TranslateImageMessage/Response`, `VisionProvider`, settings fields (`visionProvider`, `visionModel`, `imageProgressive`).
   - `manifest.json`: `contextMenus`, `sidePanel` perms; `host_permissions` strategy; `side_panel.default_path`.
   - `image-fetch.ts` (worker) + `providers/vision.ts` interface + **one** concrete provider (the roadmap pick) + `visionProviders` registry.
   - `translateImage` case in the `onMessage` switch (reuses `getSettings`/`recordUsage`/`classifyError`).
   - **Why first:** everything downstream sends this message / calls this provider. Node-testable in isolation (encode + parse), no UI needed.

2. **Context menu → side panel render** *(Phase 13 — manual MVP, end-to-end vertical slice)*
   - `contextMenus` registration + `onClicked` handler (resolves `srcUrl`, opens panel, runs pipeline).
   - `sidepanel.html` + `sidepanel.ts` + `panel-render.ts` (clone `serp-render.ts`, `textContent`-only).
   - Worker→panel delivery via `sendMessage` + `session`-storage hydration buffer.
   - **Why second:** delivers the headline feature (right-click translate) with zero progressive complexity. Validates the whole pipeline before adding concurrency.

3. **Progressive mode (IntersectionObserver + dedup + concurrency queue)** *(Phase 14)*
   - `image-observer.ts` pure core (shouldTranslate, queue drain) — node-tested.
   - Inline IntersectionObserver + `MutationObserver` wiring into `content.ts` (classic-script constraint).
   - Dedup `WeakMap`, `MAX_CONCURRENT` gate, `MIN_SIDE_PX` skip, `rootMargin` tuning.
   - Gated entirely behind `settings.imageProgressive` (read at init, react to `storage.onChanged`).
   - **Why third:** depends on the worker case (1) and panel (2) already working; adds the cost-control surface on top.

4. **Settings wiring + polish** *(Phase 15, or fold into 13/14)*
   - `options.html`/`options.ts`: vision provider + key fields (mirror `braveApiKey` wiring), **progressive toggle default OFF**, optional concurrency/threshold knobs.
   - Error/loading/empty states in panel (clone SERP states), usage surfaced in existing usage view.
   - `captureVisibleTab` fallback for unfetchable images.
   - **Why last:** the default-OFF gate must exist before progressive ships, but the engine (3) is what it gates; settings are thin glue over finished machinery.

**Dependency graph:** `1 → 2 → 3`; `4` depends on `1` (keys) and `3` (the toggle's target). Phases 13 and 14 are the two natural milestone halves (manual, then automatic).

---

## Anti-Patterns

### Anti-Pattern 1: Fetching image bytes in the content script
**What people do:** `fetch(img.src)` inside the content script to get base64.
**Why it's wrong:** content scripts run with the **host page's** origin and are bound by same-origin policy — cross-origin images (the norm) throw or taint. Keys also don't belong on the page.
**Do this instead:** send only `srcUrl` to the worker; the worker fetches with host_permissions. Fall back to `captureVisibleTab` for the un-fetchable few.

### Anti-Pattern 2: One API call per image with no gate
**What people do:** observer fires `translateImage` for every `<img>` as it scrolls in.
**Why it's wrong:** a long gallery = dozens of simultaneous paid OCR calls; cost + rate-limit + latency blowout.
**Do this instead:** per-image dedup `WeakMap`, `MAX_CONCURRENT` queue, min-size skip, and the default-OFF gate. (Mirrors the v1.2 in-flight dedup discipline.)

### Anti-Pattern 3: Injecting the panel into the host page
**What people do:** build the result UI as injected DOM in the content script.
**Why it's wrong:** host-page CSP breaks styles/scripts; shares the page DOM (XSS surface); tears down on SPA nav.
**Do this instead:** `chrome.sidePanel` extension-origin page — clone the existing `search.html` pattern.

### Anti-Pattern 4: Top-level import/export in content.ts
**What people do:** `import { observeImages } from './image-observer.js'` in `content.ts`.
**Why it's wrong:** content.js is loaded as a **classic script**; any top-level import/export makes tsc emit `export {}` and the whole content script fails to load (documented in content.ts header).
**Do this instead:** keep pure logic in a module the node tests import; inline the thin IntersectionObserver wiring into `content.ts`.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Vision/OCR API (Claude vision OR Google Vision+Translate v3) | `VisionProvider.ocrTranslate`, worker-side `fetch`, BYOK key from storage | Single-call (Claude) favored; geometry unused for text-only panel. New host_permissions per provider. |
| Arbitrary image origins | worker `fetch(srcUrl)` under `https://*/*` | Triggers broad-permission install warning; `captureVisibleTab` fallback for unfetchable |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| content ↔ worker | `runtime.sendMessage` `translateImage` (existing contract, new type) | content sends `srcUrl`+`imageId`; never the key |
| worker ↔ side panel | `sendMessage` broadcast + `session`-storage hydration (or port) | panel may be closed; buffer results |
| contextMenus ↔ worker | `onClicked` (worker-native) | `srcUrl` arrives in worker directly — no content hop |
| settings ↔ all | `chrome.storage.local` + `storage.onChanged` | progressive toggle (default OFF), vision key/provider/model |

## Sources

- Chrome `chrome.sidePanel` — methods, `side_panel` manifest key, `open()` user-gesture rule, context-menu open example — https://developer.chrome.com/docs/extensions/reference/api/sidePanel (HIGH)
- Chrome `chrome.contextMenus` — `contexts:['image']`, `onClicked.info.srcUrl`/`mediaType`, worker-side registration, `contextMenus` permission — https://developer.chrome.com/docs/extensions/reference/api/contextMenus (HIGH)
- Chrome cross-origin network requests — content-script same-origin limitation vs worker + host_permissions — https://developer.chrome.com/docs/extensions/develop/concepts/network-requests (HIGH)
- Chrome `tabs.captureVisibleTab` fallback — `.planning/research/SOURCES.md` #6 (HIGH)
- Google Vision DOCUMENT_TEXT_DETECTION / Translation v3 + Claude vision tradeoff — `.planning/research/SOURCES.md` #1–4 (HIGH)
- Existing codebase (read directly): `src/background.ts` (onMessage switch, provider registry, in-flight dedup, recordUsage, classifyError), `src/types.ts` (Message union, Settings, provider interface), `src/serp-render.ts` (DOM-agnostic textContent-only render), `src/providers/openai.ts`+`gemini.ts` (provider fetch/timeout/classify pattern), `src/content.ts` (classic-script no-import constraint), `package.json` (tsc-only build, per-entry HTML) (HIGH)

---
*Architecture research for: Chrome MV3 image OCR+translation, side-panel output, BYOK*
*Researched: 2026-06-20*
