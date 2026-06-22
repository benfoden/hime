# Phase 12: Image OCR Pipeline + Right-Click + Side Panel - Pattern Map

**Mapped:** 2026-06-20
**Files analyzed:** 8 (3 new TS modules, 1 new page entry, 2 new page assets, 2 edited core files, 1 edited manifest)
**Analogs found:** 8 / 8 (all have strong in-repo analogs — this is an extend-not-reinvent phase)

All excerpts below are verified against current `src/` (not from RESEARCH.md prose). Line numbers are real.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/providers/vision-google.ts` | service (provider) | request-response (2 sequential REST calls) | `src/providers/openai.ts` + `src/brave-search.ts` | role-match (new 2-call shape) |
| `src/image-resolve.ts` | utility (pure, node-testable) | transform | `src/predict-util.ts` / `src/translate-batch.ts` (DOM-agnostic pure modules) | role-match |
| `src/panel-render.ts` | component (renderer) | transform (state → DOM) | `src/serp-render.ts` | exact |
| `src/sidepanel.ts` | page entry (browser-only) | event-driven (message round-trip) | `src/search.ts` | exact |
| `src/sidepanel.html` | config/markup | — | `src/search.html` | exact |
| `src/sidepanel.css` | config/style | — | `src/search.css` | exact |
| `src/background.ts` (EDIT) | controller (worker onMessage switch) | request-response + event-driven (contextMenus) | existing `searchTranslated` / `translateBatch` cases | exact (same file) |
| `src/types.ts` (EDIT) | model (type decls) | — | existing `TranslationProvider` / `SearchResult` / `MessageType` | exact (same file) |
| `manifest.json` (EDIT) | config | — | existing manifest | exact (same file) |
| `test/vision-google.mjs`, `test/image-resolve.mjs`, `test/panel-render.mjs` (NEW) | test | — | `test/serp.mjs` | exact |

## Pattern Assignments

### `src/providers/vision-google.ts` (service, request-response)

**Analogs:** `src/providers/openai.ts` (provider class shape, AbortController timeout, `!response.ok` → classifyError, usage); `src/brave-search.ts` (`new URL()` + `?key=` query-param auth, no SDK).

**Imports pattern** — mirror openai.ts:1-4 and brave-search.ts:13-14:
```typescript
// openai.ts L1-4
import type { TranslationConfig, TranslationProvider, TranslationResult } from '../types.js';
import { classifyError } from '../errors.js';
```
For vision: `import type { VisionProvider, ImageResult } from '../types.js';` + `import { classifyError } from '../errors.js';`. **No SDK import** (zero-runtime-dep law).

**Timeout + fetch + error-mapping pattern** — copy openai.ts:67-105 structure (do this PER Google call; A5 recommends timing each call separately, ~12s each so the sequence stays under the 30s SW ceiling):
```typescript
// openai.ts L67-105 — the canonical provider call shape to clone
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10000);
try {
  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', headers: {...}, body: JSON.stringify({...}), signal: controller.signal });
  } catch (err) {
    const c = classifyError('openai', err);     // → use 'google'
    const e = new Error(c.message); (e as any).kind = c.kind; throw e;
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const bodyMessage = (body as any)?.error?.message;   // Google error shape IS { error: { message } } — matches
    const c = classifyError('openai', null, { status: response.status, bodyMessage });   // → 'google'
    const e = new Error(c.message); (e as any).kind = c.kind; (e as any).status = c.status; throw e;
  }
  const data = await response.json();
  // ... map data ...
} finally {
  clearTimeout(timeout);
}
```

**`?key=` query-param auth (no header)** — clone the `new URL()` + `searchParams` precedent from brave-search.ts:33-38 (NEVER interpolate the key into a string; NEVER log it — brave-search.ts header comment L9-11):
```typescript
// brave-search.ts L33-38
const url = new URL(BRAVE_ENDPOINT);
url.searchParams.set('q', query);
url.searchParams.set('count', String(opts.count ?? 10));
```
For Google: `const url = new URL('https://vision.googleapis.com/v1/images:annotate'); url.searchParams.set('key', apiKey);` (and the translation endpoint identically). `searchParams.set` encodes automatically.

**Module-level endpoint const** — mirror brave-search.ts:16 (`export const BRAVE_ENDPOINT = ...`): export `VISION_ENDPOINT` and `TRANSLATE_V2_ENDPOINT` so the test can assert request URLs.

**Usage shape** — mirror openai.ts:54-57 (`{ inputTokens, outputTokens }`). For Google, units are chars/vision-units; populate `result.usage` so the worker calls `recordUsage`.

**Two-call body specifics** (from RESEARCH Code Examples — verified shapes): Vision `{ requests: [{ image: { content: b64NoPrefix }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }] }] }`; if `responses[0].fullTextAnnotation` absent/empty → distinct no-text path (do NOT call translate, do NOT throw an error — return a sentinel the worker maps to the no-text state, Pitfall 4). Translation v2 `{ q, target, format: 'text' }`, source omitted → response `data.translations[0].{translatedText, detectedSourceLanguage}`.

---

### `src/image-resolve.ts` (utility, transform — pure, node-testable)

**Analog:** `src/predict-util.ts` / `src/translate-batch.ts` — DOM-agnostic pure modules with NO `chrome.*`/`document` references, imported by both the worker and the node harness. (Imported in background.ts:20-21: `import { sanitizeSuggestion } from './predict-util.js'`.)

**Pattern law (RESEARCH "Pattern law", carried from v1.2):** pure logic (downscale math, MIME guard, base64 prefix strip, mean-confidence computation, result-state derivation: empty→no-text / <0.60→low-conf / error→error) lives here and is node-tested. `OffscreenCanvas` calls themselves are browser-only and stay in `background.ts` (the SW context) — keep the *math* (target dimensions for a long-edge cap) pure and exported.

---

### `src/panel-render.ts` (component, transform) — EXACT clone of `serp-render.ts`

**Analog:** `src/serp-render.ts` (read in full).

**Module contract** — copy the header doctrine verbatim (serp-render.ts:1-11): references NO global `document`/`window`; the `Document` is injected as a parameter; XSS guarantee is `textContent` only, NEVER `innerHTML`, no sanitizer lib.

**Discriminated state union** — clone serp-render.ts:17-21:
```typescript
export type SerpState =
  | { kind: 'loading' }
  | { kind: 'populated'; results: SearchResult[] }
  | { kind: 'empty' }
  | { kind: 'error'; errorKind: ErrorKind; message: string };
```
For the panel — model `ImageState` (per-entry states from IMG-05 / D-04):
`loading | populated(entries: ImageResult[]) | error`, with per-entry sub-states `no-text` and `low-confidence` (amber badge). Note D-04 distinction: low-confidence is a *populated* entry with a badge, no-text is its own entry state.

**Public render fn + exhaustiveness check** — clone serp-render.ts:37-58 (`renderPanel(state, doc, mount)`; switch on `state.kind`; `const _never: never = state` default).

**`el()` helper** — copy serp-render.ts:64-74 verbatim (the textContent-only element builder — the actual XSS guard):
```typescript
function el(doc, tag, opts = {}) {
  const node = doc.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.text !== undefined) node.textContent = opts.text;   // textContent, never innerHTML
  return node;
}
```

**Anchor/href verbatim precedent** — for the thumbnail `<img>`, follow faviconEl serp-render.ts:91-108 (set `img.src` directly, `alt=''`).

**D-01 PREPEND (the one divergence from serp-render):** serp-render uses `mount.replaceChildren()` then `forEach(append)` (L38, L44). The panel ACCUMULATES — `mount.prepend(entryNode)` for a new result, and on full re-render (panel reopen, rebuild from `storage.session`) iterate newest-first. Do NOT `replaceChildren` on a new result.

**D-02 OCR breaks preserved:** the translation and original text each preserve line/paragraph breaks. Plain `textContent` collapses visual newlines unless CSS `white-space: pre-wrap` is set — set that class in `sidepanel.css` (this is the reason a per-entry `class` matters; mirror the `el(doc,'p',{text, className})` snippet pattern serp-render.ts:129). Entry order top-to-bottom: thumbnail → "Detected: X → Y" line → translation → original.

---

### `src/sidepanel.ts` (page entry, event-driven) — EXACT clone of `search.ts`

**Analog:** `src/search.ts` (read in full).

**Browser-only header doctrine** — copy search.ts:1-6 (references `chrome.*`/`document`/`window`; intentionally NOT imported by the node harness; testable logic lives in `panel-render.ts`/`image-resolve.ts`).

**DOMContentLoaded + element resolution + graceful bail** — clone search.ts:106-120:
```typescript
document.addEventListener('DOMContentLoaded', async () => {
  const mount = document.getElementById('results') as HTMLElement | null;
  if (!mount) return;   // DOM incomplete — bail
  ...
});
```

**Read settings once via getSettings** — clone search.ts:131-144 (used here for the global target language, D-03):
```typescript
const settingsReply = await chrome.runtime.sendMessage({ type: 'getSettings' }) as { settings: {...} } | null;
if (settingsReply?.settings) { ... }
```

**Worker round-trip + render-state mapping** — clone the runSearch staging in search.ts:227-296: `await chrome.runtime.sendMessage(...)` in try/catch → on comms failure render `{kind:'error', errorKind:'network', ...}` (search.ts:233-242); on `reply.error` render error state with `reply.kind ?? 'unknown'` (search.ts:274-286); on empty render the no-text/empty state (search.ts:289-293).

**Panel-specific divergence:** the panel is push-driven (worker `chrome.runtime.sendMessage` → panel) as well as pull. Add a `chrome.runtime.onMessage` listener that PREPENDs incoming results (D-01) and updates the matching skeleton entry (the immediate skeleton-on-click instinct, CONTEXT specifics). On panel open, rebuild the list from `storage.session` (Pitfall 5) before/alongside the live listener.

**Settings link** — clone search.ts:178-185 (`chrome.runtime.openOptionsPage()`).

---

### `src/sidepanel.html` — clone of `search.html`

**Analog:** `src/search.html` (read in full). Clone the doctype/head/viewport/`<link rel=stylesheet>` and the `<div id="results">` mount + `<script type="module" src="sidepanel.js">` (search.html:1-31). Drop the search-form/toggle controls (no query input in the panel). Keep `role="status" aria-live="polite"` on any status line. `copy-assets` already globs `src/*.html`/`src/*.css` → no build-script change needed (RESEARCH Runtime State Inventory).

### `src/sidepanel.css` — clone of `search.css`

Clone container/header/row styling. ADD `white-space: pre-wrap` on the translation+original text classes (D-02 break preservation) and an `.amber`/low-confidence badge style (D-04).

---

### `src/background.ts` (EDIT) — add `translateImage` case + contextMenus + sidePanel

**Analog (worker case):** existing `searchTranslated` case (background.ts:171-257) and `translateBatch` case (259-306).

**Key-from-storage-only invariant (IMG-07)** — clone searchTranslated.ts:176-181:
```typescript
// background.ts L176-181
const apiKey = settings.braveApiKey;     // read from storage ONLY — never from payload
if (!apiKey) { sendResponse({ error: '... not configured', kind: 'auth' }); break; }
```
For images: read `settings.googleApiKey` (new top-level Settings field, braveApiKey precedent). Never accept the key in the message; never log it.

**Provider call + timeout race + recordUsage + classifyError** — clone translateBatch.ts:282-304:
```typescript
// background.ts L285-304
const result = await Promise.race([
  provider.translate(userContent, config, apiKey, s.model),
  new Promise<never>((_, reject) => setTimeout(() => reject(Object.assign(new Error('Translation timed out'), { name: 'AbortError' })), 8000)),
]);
if (result.usage) await recordUsage(s.model, result.usage);
...
} catch (err) {
  const kind = (err as { kind?: string })?.kind ?? classifyError(s.provider, err).kind;
  sendResponse({ error: ..., kind });
}
```
For images: race the two-call `visionProvider.ocrTranslate(...)` against a longer timeout (~25s, RESEARCH Pattern 1 L201-204; the 8s here is too short for OCR+translate). Synthetic timeout uses `name:'AbortError'` so classifyError → `network`. Call `recordUsage('google-vision', result.usage)`.

**recordUsage helper** — exists at background.ts:69-79. **getSettings helper** — background.ts:50-53 (`migrateSettings(result.himeSettings || {})`). **classifyError import** — background.ts:23. **Provider registry** — background.ts:26-30 (add a `visionProvider` module-scope instance like `braveClient` at L33).

**In-flight dedup** — searchTranslated uses an in-memory `Map` (background.ts:40, `inFlightSearches`) with try/finally cleanup (L227-255). **DIVERGENCE (Pitfall 5):** image jobs are slow → the dedup/job/result state MUST persist to `chrome.storage.session`, not a global Map, so a worker restart never blanks the panel. Keep the *try/finally cleanup discipline* (L252-254) but back it with `storage.session`.

**contextMenus registration** — extend the EXISTING `onInstalled` listener (background.ts:387-391; it currently only sets the badge). Per Pitfall 6 / RESEARCH Pattern 3, `removeAll()` then `create({ id:'hime-translate-image', title:'Translate image with hime', contexts:['image'] })` inside `onInstalled` — NOT at module top level.

**sidePanel.open gesture** — add a top-level `chrome.contextMenus.onClicked` listener (NOT inside onInstalled). Per Pitfall 1 / RESEARCH Pattern 2: call `chrome.sidePanel.open({ tabId })` as the FIRST synchronous statement (no `await` before it), THEN `void runImageJob(info.srcUrl!, tab.id)`.

**onMessage scaffold** — the new case slots into the existing switch (background.ts:141-364); the listener already returns `true` to keep the channel open (L370) and has the outer try/catch (L365-367). Add `'translateImage'` import types like the existing message-type imports (background.ts:5-18).

---

### `src/types.ts` (EDIT)

**Analogs (same file):** `TranslationProvider` interface (types.ts:44-48), `SearchResult` (92-105), `SearchTranslatedResponse` (122-129), `MessageType` union (57-72), `SearchTranslatedMessage` (107-114), `Settings` (18-26), `DEFAULT_SETTINGS` (189-203).

- **VisionProvider** — sibling of `TranslationProvider` (44-48): `{ name: string; ocrTranslate(imageBase64, mime, targetLang, apiKey): Promise<ImageResult> }`.
- **ImageResult** — model on `SearchResult` (92-105) + RESEARCH shape: `{ originalText, translatedText, detectedLang, confidence, usage? }`.
- **MessageType** — add `'translateImage'` to the union (57-72).
- **TranslateImageMessage / ...Response** — clone `SearchTranslatedMessage`/`SearchTranslatedResponse` (107-129) shape; response success `{ ...ImageResult }`, failure `{ error, kind }` (the established D-02 reply contract).
- **Settings** — add `googleApiKey: string` top-level (braveApiKey precedent, types.ts:23-25) + `DEFAULT_SETTINGS.googleApiKey: ''` (L202). `migrateSettings` (206-213) spreads DEFAULT so the new field auto-defaults — no migration code needed.
- **Name↔ISO map (A3)** — Translation v2 `target` needs an ISO code; hime stores display names ("English"). Add a small lookup over `SUPPORTED_LANGUAGES` (types.ts:166-186). NEW — no existing analog; planner must add.

---

### `manifest.json` (EDIT)

Current state: `permissions` = activeTab/storage/scripting (L6-9); `host_permissions` = the 4 API hosts (L11-16); no side_panel, no contextMenus. Deltas (RESEARCH Code Examples, verified against current file):
- `permissions`: add `"contextMenus"`, `"sidePanel"`.
- `host_permissions`: add `"https://vision.googleapis.com/*"`, `"https://translation.googleapis.com/*"`, `"<all_urls>"` (SW image fetch — note content_scripts already declares `<all_urls>` at L23, so the install prompt is unchanged).
- Add top-level `"side_panel": { "default_path": "sidepanel.html" }`.

---

### `test/{vision-google,image-resolve,panel-render}.mjs` (NEW)

**Analog:** `test/serp.mjs` (read L1-60). Clone: import from `dist/` (serp.mjs:19, "verify against dist/, NEVER the SW console" — MEMORY law), `parseHTML` from linkedom for render tests (serp.mjs:15,23), `node:test` + `node:assert/strict` (serp.mjs:11-12), fresh-mount-per-test helper (serp.mjs:26-30). Add a `src/panel-mock.ts` mirroring `search-mock.ts` (serp.mjs:20 imports `MOCKS`/`XSS_PROBE` from `dist/search-mock.js`) with Vision populated/empty/low-confidence + Translation v2 sample fixtures. `vision-google.mjs` mocks `fetch` to assert request bodies/URLs and response→ImageResult mapping.

## Shared Patterns

### API-key invariant (IMG-07 / V4 access control)
**Source:** background.ts:176-181 (`searchTranslated` reads `settings.braveApiKey` from storage; auth-error if empty) + brave-search.ts:9-11 (never log key/URL/header).
**Apply to:** the `translateImage` worker case and `vision-google.ts`. Key read from `chrome.storage` in the SW only; never in a message, never on the page, never logged.

### Error classification
**Source:** `src/errors.ts` `classifyError(provider, err, { status, bodyMessage })` (errors.ts:19-73) — maps AbortError/TypeError→network, 401/403→auth, 402→credits, 429→rate_limit, other→unknown.
**Apply to:** `vision-google.ts` (both Google calls, on `!response.ok` and on fetch throw) and the `translateImage` catch block. Use provider string `'google'`. Reuse as-is — do NOT add a new taxonomy.

### XSS-safe rendering (textContent only)
**Source:** `serp-render.ts` `el()` (L64-74) + header contract (L1-11). Brave href-verbatim/favicon precedent L91-129.
**Apply to:** `panel-render.ts` — every OCR'd/translated string via `textContent`; thumbnail via `img.src`. Never `innerHTML`.

### DOM-agnostic + node-test law
**Source:** serp-render.ts header (L1-11) + search.ts header (L1-6) + test/serp.mjs (import from `dist/`, drive with linkedom).
**Apply to:** `panel-render.ts` + `image-resolve.ts` (pure, tested); `sidepanel.ts` (browser-only, untested). Test against `dist/`, never the SW console (MEMORY law).

### Worker durable state (MV3 lifecycle)
**Source:** searchTranslated in-flight Map + try/finally cleanup (background.ts:40, 227-255) — but the image path MUST upgrade the backing store to `chrome.storage.session` (Pitfall 5), keeping the cleanup discipline.
**Apply to:** image job/dedup/result state; panel rebuilds list from `storage.session` on open.

### Provider call shape
**Source:** openai.ts:64-116 (AbortController timeout, try/catch fetch → classifyError, `!response.ok` body-message extraction, usage mapping, `finally clearTimeout`).
**Apply to:** both Google calls in `vision-google.ts`.

### `?key=` query-param auth (no SDK)
**Source:** brave-search.ts:16, 33-38 (module-const endpoint, `new URL` + `searchParams.set`, auto-encoding, never log).
**Apply to:** `vision-google.ts` both endpoints.

## No Analog Found

| File/Concern | Role | Reason | Planner action |
|------|------|--------|-------|
| Display-name → ISO-639 language map (A3) | utility | hime stores display names; Translation v2 needs ISO codes. No existing lookup. | Add small map over `SUPPORTED_LANGUAGES` (types.ts:166-186). |
| `OffscreenCanvas` downscale + MIME re-encode (VIS-03) | utility (SW-only effect) | No image processing exists in the codebase. | Native `OffscreenCanvas`/`convertToBlob` in `background.ts`; keep the target-dimension MATH pure in `image-resolve.ts` for node testing. |
| `captureVisibleTab` + crop fallback (IMG-04) | worker logic | No tab-capture precedent. | Native `chrome.tabs.captureVisibleTab` in SW; content script reports `getBoundingClientRect()×dPR`. RESEARCH Open Question 3. |
| `chrome.sidePanel` / `chrome.contextMenus` APIs | worker logic | First use in repo. | RESEARCH Patterns 2 & 3; bump `@types/chrome` ≥0.0.258 for `sidePanel.open()` (Pitfall 7). |

## Metadata

**Analog search scope:** `src/` (background.ts, types.ts, errors.ts, providers/openai.ts, brave-search.ts, serp-render.ts, search.ts, search.html), `test/serp.mjs`, `manifest.json` — all read directly.
**Pattern extraction date:** 2026-06-20
**Note:** `/home/ben/code/eng-standards/eng-standards.md` (referenced by `.claude/CLAUDE.md`) does not exist; codebase conventions above are the operative standard (RESEARCH flagged this).
