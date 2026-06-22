# Phase 16: In-Place Image Overlay Translation - Pattern Map

**Mapped:** 2026-06-22
**Files analyzed:** 11 (5 new, 6 modified)
**Analogs found:** 11 / 11 (all have strong in-repo analogs — this phase is ~80% recombination)

All analogs below were verified against the live code at the cited file:line. The RESEARCH.md
citations were confirmed accurate.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/overlay-geometry.ts` (NEW) | utility (pure) | transform | `src/image-resolve.ts` (pure-math module, no chrome/document) | exact (role+law) |
| `src/overlay-fit.ts` (NEW) | utility (pure) | transform | `src/page-walk.ts` (pure module w/ injected callback seam) | exact (role+law) |
| `src/image-resolve.ts` (MODIFY) | utility (pure) | transform | self — extend `meanWordConfidence` pages→blocks→paragraphs walk | exact |
| `src/providers/vision-google.ts` (MODIFY) | service (provider) | request-response | self — extend `ocr()` + raw-response interfaces | exact |
| `src/background.ts` (MODIFY: `downscaleAndGuard` + new case) | service (worker) | request-response / CRUD | self — `translatePageBatch` case (bg.ts:715-764) | exact |
| `src/content.ts` (MODIFY: overlay render/anchor/toggle) | controller (content script) | event-driven | self — `progPositionBadge`/`progRepositionAllBadges` + `pageCreatePill`/`pageApplyState` | exact |
| `src/popup.ts` (MODIFY: checkbox) | controller (popup) | CRUD (storage) | self — `loadSettings` himeSettings read (popup.ts:22-27) | exact |
| `src/popup.html` (MODIFY: checkbox markup) | config (markup) | — | self — existing "Translate page" control | exact |
| `src/types.ts` (MODIFY: contracts) | model | — | self — `TranslatePageBatchMessage`, `Settings`, `DEFAULT_SETTINGS` | exact |
| `test/overlay-geometry.mjs` (NEW) | test | — | `test/image-resolve.mjs` (node:test against dist/) | exact |
| `test/overlay-fit.mjs` (NEW) | test | — | `test/image-resolve.mjs` (node:test, stubbed callback) | exact |

## Pattern Assignments

### `src/overlay-geometry.ts` (NEW — pure utility, transform)

**Analog:** `src/image-resolve.ts` (the canonical "Pattern law" pure module — NO `chrome.*`, NO
`document.*`, importable by both the SW and the node test harness).

**Module-header law to copy verbatim** (`src/image-resolve.ts:1-6`):
```typescript
// Pure image pre-flight + result-state logic for the Phase 12 OCR pipeline.
// NO chrome.* and NO document references: this module is imported by both the
// service worker ... and the node test harness ...
// The browser-only canvas/encode calls stay in the SW; only the MATH lives here (Pattern law).
```
→ `overlay-geometry.ts` MUST carry an analogous header. `mapBox()` takes plain-number inputs
(`submitted`, `natural`, `rendered`, `objectFit` string) — never a live DOM node — so the
content script reads `getBoundingClientRect()`/`naturalWidth` and passes numbers in. See
RESEARCH Pattern 3 for the three-transform body (downscale-undo → object-fit letterbox →
container does the viewport offset).

**Nesting-walk analog** for any helper that traverses geometry: mirror the
`pages → blocks → paragraphs` loop shape in `meanWordConfidence` (`src/image-resolve.ts:189-204`).

---

### `src/overlay-fit.ts` (NEW — pure utility, transform)

**Analog:** `src/page-walk.ts` — a pure module whose security/parse logic is testable in node.
The injectable-`measure` seam mirrors how the repo isolates browser-only calls behind plain
callbacks (the same split image-resolve uses for canvas encode).

**Pattern:** `fitText(text, boxW, boxH, measure, opts)` where `measure: (text, fontPx) => widthPx`
is injected so node tests stub it (no canvas in node — Pitfall 4). Binary-search font size, greedy
wrap, min-font floor → clamp. CJK per-character wrap via `isCjkLang` (already exported,
`src/image-resolve.ts:96`). Body in RESEARCH Pattern 6.

---

### `src/image-resolve.ts` (MODIFY — add `collectParagraphBoxes`)

**Analog:** self — extend the existing `meanWordConfidence` walk (`src/image-resolve.ts:183-215`),
which ALREADY traverses `pages → blocks → paragraphs → words → symbols`:

```typescript
// src/image-resolve.ts:189-204 — the exact nesting to extend
for (const page of pages) {
  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const word of paragraph.words ?? []) {
        ...
        for (const symbol of word.symbols ?? []) { ... }
```
New `collectParagraphBoxes(fta)` reuses this nesting but emits `{ text, box }` per paragraph
(assemble text from `words[].symbols[].text` + `detectedBreak` spacing — Pitfall 3; there is no
`paragraph.text`). Read `boundingBox.vertices`, fall back to `normalizedVertices × submitted dims`
(A2). Keep optional-chaining-everywhere defensiveness as in the analog.

---

### `src/providers/vision-google.ts` (MODIFY — `ocr()` returns blocks)

**Analog:** self — the raw-response interfaces currently OMIT geometry. Confirmed at
`src/providers/vision-google.ts:42-63`:

```typescript
interface VisionWord     { confidence?: number; symbols?: { confidence?: number }[]; }
interface VisionParagraph { words?: VisionWord[]; }              // ← no boundingBox
interface VisionBlock     { paragraphs?: VisionParagraph[]; }    // ← no boundingBox
```
Add `boundingBox?: { vertices?: {x?:number;y?:number}[]; normalizedVertices?: ... }` to
`VisionParagraph` (and optionally `VisionBlock`), then have `ocr()` return
`blocks: OverlayBlock[]` alongside the existing `originalText` (extend `OcrOnlyResult` in
`types.ts`). Keep the existing flattened return for the v1.3 side-panel path (D-04 — coexists).

---

### `src/background.ts` (MODIFY — `downscaleAndGuard` returns dims + new `translateImageBlocks` case)

**Analog A — `downscaleAndGuard`:** self. CONFIRMED it currently DISCARDS the submitted dims
(`src/background.ts:236-296`): `target = downscaleTarget(...)` at line 260, but the return type is
only `Promise<{ base64: string; mime: string }>` (line 239) and both return sites (lines 265, 295)
omit `target.width/height`. **Pattern 4 mandatory change:** widen the return to
`{ base64, mime, width, height }` — the worker is the ONLY place that knows the submitted
(post-downscale) dimensions `mapBox` needs. On the fast-path return (line 265) the submitted dims
equal the source bitmap dims (`bitmap.width/height`); on the downscaled path (line 295) they are
`target.width/height`.

**Analog B — new `translateImageBlocks` case:** mirror `translatePageBatch`
(`src/background.ts:715-764`) verbatim-adapted:

```typescript
// src/background.ts:722-755 — the key-law + keyed-batch shape to clone
const apiKey = s.apiKeys[s.provider] || '';        // key read from storage ONLY (T-15-04 / T-12-01)
if (!apiKey) { sendResponse({ error: ..., kind: 'auth' }); break; }
const inputKeys = Object.keys(items);              // items = {"0":blk0.text, ...}
const userContent = `${buildPageBatchPrompt(config)}\n\n${JSON.stringify(items)}`;
const result = await provider.translate(userContent, config, apiKey, s.model);
const translations = parsePageBatchReply(result.text, inputKeys);   // inputKeys-only guard
```
New case adds, before the batch: `ocr → collectParagraphBoxes`, and after: zip translations onto
blocks by index (missing key → `b.text` original fallback, page-walk.ts:166). Reply carries
`{ blocks: [{box,original,translated}], submitted: {w,h} }`. **Skip overlay / flag the
capture-fallback path** (Pitfall 2): if `resolveImageBytes` fell back to `captureVisibleTab`
(bg.ts:226-229), geometry is unmappable — signal that in the reply so content skips overlay.

---

### `src/content.ts` (MODIFY — overlay render + anchor + per-image toggle)

**Analog A — anchoring** (`src/content.ts:1103-1170`), confirmed:
```typescript
function progPositionBadge(badge: HTMLElement, img: HTMLImageElement): void {
  const rect = img.getBoundingClientRect();
  badge.style.top  = `${rect.top  + window.scrollY + 4}px`;   // generalize: drop the +4
  badge.style.left = `${rect.left + window.scrollX + 4}px`;
}
// throttled reposition (100ms) on scroll/resize:
function progRepositionAllBadges(): void {
  if (progRepositionHandle !== null) return;
  progRepositionHandle = setTimeout(() => { /* reposition each */ }, 100);
}
```
Generalize from a corner badge to a per-image absolute **container** appended to `document.body`
(NOT a wrapper around `<img>` — Anti-Pattern). Position the container to the rendered rect; inner
boxes are positioned RELATIVE to the container so only the container moves on reposition.
Add `new ResizeObserver(reposition).observe(img)` on top of the window scroll/resize listeners
(window events miss layout-driven resizes).

**Analog B — per-image toggle** (`src/content.ts:1708-1745`), confirmed `pageCreatePill` /
`pageUpdatePill` / `pageApplyState`:
```typescript
el.textContent = 'Show original';                 // textContent ONLY — never innerHTML
el.addEventListener('click', () => { pageApplyState(...flip...); });
// label flip:
el.textContent = pageState === 'translated' ? 'Show original' : 'Show translation';
```
Per-image corner `<button>` toggles `container.style.display` and flips its own label — scoped to
ONE image (D-02). The global page pill (existing) flips ALL containers (D-01).

**Analog C — classic-script mirror law:** `content.ts` cannot import, so it MIRRORS `mapBox`/
`fitText` verbatim with a "MUST stay in sync with src/overlay-geometry.ts — classic-script law"
comment, exactly as existing `prog*`/`page*` mirrors do (Pitfall 5).

---

### `src/popup.ts` + `src/popup.html` (MODIFY — "Include images" checkbox)

**Analog:** `loadSettings` (`src/popup.ts:22-27`):
```typescript
const result = await chrome.storage.local.get(['himeSettings']);
const settings: Settings = result.himeSettings || { sourceLanguage: ..., targetLanguage: ... };
```
Read `settings.includeImages ?? false` (default OFF — D-01), set `checkbox.checked`, and on change
write back into `himeSettings` preserving other fields. Markup sits with the existing "Translate
page" control in `popup.html`.

---

### `src/types.ts` (MODIFY — contracts)

**Analog:** self — `TranslatePageBatchMessage` (consumed at bg.ts:719), `Settings`,
`DEFAULT_SETTINGS`, `OcrOnlyResult`. Add: `OverlayBlock`, `TranslateImageBlocksMessage` +
response, `includeImages` field on `Settings`/`DEFAULT_SETTINGS` (migrate-safe — `migrateSettings`
spreads over defaults, so a missing field defaults to `false`, no migration needed).

---

### `test/overlay-geometry.mjs` + `test/overlay-fit.mjs` (NEW)

**Analog:** `test/image-resolve.mjs` (confirmed `node:test` + `node:assert/strict`, imports from
`../dist/`, "verify against dist/, NEVER the service-worker console"):
```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mod = await import(path.join(__dirname, '../dist/overlay-geometry.js'));
```
- `overlay-geometry.mjs`: `mapBox` under downscale ratio + object-fit contain/cover/fill + scroll.
- `overlay-fit.mjs`: `fitText` fits / shrinks-to-floor / clamps / CJK per-char wrap via stubbed
  `measure` callback.
- EXTEND `test/vision-google.mjs` + `test/image-resolve.mjs` to assert `boundingBox` extraction
  against a fixture `fullTextAnnotation` (add to `test/fixtures/`).

## Shared Patterns

### BYOK key handling (T-12-01 / T-15-04)
**Source:** `src/background.ts:722-728`
**Apply to:** the new `translateImageBlocks` worker case ONLY (keys never enter content/popup).
Key read from `s.apiKeys[s.provider]` in the worker; messages carry only
`{srcUrl, dedupKey, tabId}` + geometry — never a key.

### Keyed-JSON batch parse with key-injection guard (XLT-03 / T-15-01/05)
**Source:** `src/page-walk.ts:137-170` (`parsePageBatchReply`) + `:112-123` (`buildPageBatchPrompt`)
**Apply to:** the per-block image translate. Iterate `inputKeys` ONLY; missing/non-string key →
caller falls back to original text (`:166`).

### textContent-only / never innerHTML (XSS law)
**Source:** `src/content.ts:1132`, `:1733`
**Apply to:** every overlay box, toggle button, and label.

### Pure-math-in-module / wiring-in-script (Pattern law + classic-script mirror)
**Source:** `src/image-resolve.ts:1-6` (law) + existing `prog*`/`page*` mirror comments in content.ts
**Apply to:** `overlay-geometry.ts`/`overlay-fit.ts` (pure) vs `content.ts` (DOM/canvas wiring + verbatim mirror).

### Absolute-over-`<img>` anchoring (body-appended, throttled reposition)
**Source:** `src/content.ts:1103-1170`
**Apply to:** the per-image overlay container + reposition loop (+ `ResizeObserver`).

### Fixed overlay palette (D-03, WCAG-AA)
**Source:** D-03 / RESEARCH Code Examples — `background:rgba(0,0,0,0.78)`, `color:#fff`.
**Apply to:** every overlay box (no per-image sampling).

## No Analog Found

None. Every file has a strong in-repo analog (verified). The only genuinely new logic is the body
of two small pure functions (`mapBox`, `fitText`) and the `boundingBox` field plumbing — and even
those mirror established module shape and the existing pages→blocks→paragraphs walk.

## Metadata

**Analog search scope:** `src/` (content.ts, background.ts, page-walk.ts, image-resolve.ts,
providers/vision-google.ts, popup.ts, types.ts), `test/`.
**Files scanned (read/verified):** 7 source + 1 test.
**Key live-code confirmation:** `downscaleAndGuard` return type (`src/background.ts:239`) currently
discards `target.width/height` — confirms Pattern 4's mandatory dims-return change.
**Pattern extraction date:** 2026-06-22
