# Phase 16: In-Place Image Overlay Translation - Research

**Researched:** 2026-06-22
**Domain:** Chrome MV3 content-script DOM overlays + Google Cloud Vision `boundingPoly` geometry + per-block BYOK translation + canvas `measureText` shrink-to-fit
**Confidence:** HIGH (all claims grounded in the live codebase at file:line; the one external claim — Vision `boundingBox.vertices` are pixel coordinates in the submitted-image space — is CITED from official docs)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 · Trigger & scope** — Image overlay folds into the existing phase-15 "Translate page" action (popup button + right-click "Translate page"). One click translates page text **and** overlays images, but ONLY when an opt-in **"Include images" checkbox** is enabled. The checkbox lives with the popup "Translate page" control (`popup.html`/`popup.ts`), persisted in `chrome.storage`, **default OFF** (phase-13 default-off cost philosophy for paid BYOK Vision). When enabled, in-view page images are OCR'd + overlaid as part of the page-translate run, reusing phase-13 cost guards (content-hash dedup, budget/concurrency, min-size). The **global page toggle governs overlays too**; per-image swap is D-02. Rejected: separate standalone "translate images" action; auto progressive-viewport overlay.
- **D-02 · Per-image swap** — Each overlaid image carries a **small corner toggle button** flipping THAT image between translation and original in place (OVL-03). Visual kin of the phase-15 in-page pill, but scoped per-image (anchored to the image). The page-level global toggle flips all at once; the per-image button is the individual override.
- **D-03 · Overlay box style** — **Fixed** palette for every overlay (no per-image sampling): **black semi-transparent background box, white text**, subtle radius. Guaranteed ≥4.5:1 contrast (WCAG AA, OVL-02). Rejected: adaptive/sampled per-block styling.
- **D-04 · Side-panel relationship** — In-place overlay is the **primary** rendering for page-context image translation. The existing v1.3 **side-panel list stays** for the explicit per-image deep-dive (right-click "Translate image" → side panel). Coexists; in-place is the default path when translating the page with images enabled.

### Claude's Discretion (researcher/planner resolve)
- **Block granularity:** block-level vs paragraph-level `boundingPoly` for overlay boxes. → **Researcher recommends paragraph-level** (see Architecture Patterns / Pattern 1). Pick for best fit-vs-count tradeoff.
- **Shrink-to-fit overflow (OVL-05):** `measureText`-driven font shrink to a sensible floor, then clamp/ellipsis. Default: shrink → clamp.
- **CJK / vertical reading order** within a box — research item (see Open Questions).
- **Re-anchoring mechanism (OVL-04):** absolutely-positioned DOM overlays mapping natural-pixel boxes to the image's current rendered rect (`getBoundingClientRect`/`naturalWidth`), repositioned on scroll/resize (rAF-debounced). Implementation detail.

### Deferred Ideas (OUT OF SCOPE)
- **Adaptive/sampled overlay styling** (light-vs-dark per block) — rejected for v1.4.
- **Auto progressive-viewport image overlay** (overlay as images scroll into view) — deferred; use the page-translate-scoped snapshot.
- **999.4 per-image numbering** (`[hime N]` for image overlays) — parked post-v1.4.
- **Live SPA mutation tracking** for overlays — out of scope (static snapshot, mirrors PAGE scope).
- **No new OSS dependency** — own code only (`measureText` + DOM). Milestone scope guardrail.
- **No inpainting / pixel editing / background masking** — box is semi-transparent over untouched pixels.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OVL-01 | Overlay translated text on images, each block positioned over its source-text region using Vision `boundingPoly`. | Pattern 1 (extract `boundingBox` per paragraph in `vision-google.ts ocr()`), Pattern 5 (per-block keyed-JSON translate reusing `page-walk.ts`/`translate-batch.ts`), Pattern 4 (worker carries blocks to content). |
| OVL-02 | Semi-transparent box meeting WCAG AA 4.5:1; no inpainting. | WCAG AA Box section — black `rgba(0,0,0,≥0.72)` + `#fff` text passes; opaque-enough alpha analysis. |
| OVL-03 | Swap any image overlay between translation and original, in place. | Pattern 2 (per-image overlay container + corner toggle), mirrors phase-15 pill (content.ts:1713). |
| OVL-04 | Overlays stay positioned on scroll + window resize (natural-pixel box → rendered rect). | Pattern 3 (coordinate mapping fn) + Pattern 2 (anchoring: ResizeObserver + rAF reposition, reusing `progRepositionAllBadges` pattern content.ts:1156). **#1 risk: coordinate-space mismatch — see Pitfall 1.** |
| OVL-05 | Shrink-to-fit via `measureText`; graceful overflow handling. | Pattern 6 (pure `fitText` binary-search fn) — node-testable seam. |
</phase_requirements>

## Summary

This phase is **mostly an extension + recombination of code that already exists**, not new technology. Four existing systems carry it: (1) the Vision OCR call in `vision-google.ts ocr()` already runs `DOCUMENT_TEXT_DETECTION` and walks `fullTextAnnotation.pages → blocks → paragraphs` — it just **discards the geometry**; phase 16 surfaces `boundingBox.vertices` per paragraph. (2) The keyed-JSON batch translate pattern (`page-walk.ts` `buildPageBatchPrompt`/`parsePageBatchReply`, already wired through the worker's `translatePageBatch` case) translates N strings in one round-trip with a key-injection guard — phase 16 feeds per-block text through the SAME pattern. (3) The phase-13 badge anchoring math (`progPositionBadge`/`progRepositionAllBadges`, content.ts:1105-1170) already maps an absolutely-positioned DOM element over an `<img>` via `getBoundingClientRect()+scrollX/Y` and re-anchors on scroll/resize — phase 16 generalizes it from a corner badge to N per-region boxes. (4) The phase-15 pill (content.ts:1713) is the per-image toggle's visual+behavioral template.

The **single dominant risk is coordinate-space mismatch** (Pitfall 1). Vision's `boundingBox.vertices` are pixel coordinates **in the image actually submitted to Vision** — and `downscaleAndGuard` (background.ts:236) downscales any image whose long edge exceeds 2048px **before** sending. So a box at vertex x=1500 in a 2048-wide submitted image must be mapped through THREE transforms to land on screen: (a) submitted-pixel → natural-pixel (undo the downscale ratio), (b) natural-pixel → rendered-rect (the `<img>`'s `getBoundingClientRect` size, accounting for `object-fit` letterboxing), (c) rendered-rect → viewport (`+scrollX/Y`). Getting (a) wrong shifts every box by the downscale factor; getting object-fit wrong shifts boxes on any `object-fit: contain/cover` image. **The fix: the worker must return the submitted-image dimensions alongside the boxes** so the content script can compute the ratio — the natural dimensions alone are insufficient.

**Primary recommendation:** Extract paragraph-level `boundingBox` in `ocr()`; have the worker also return the submitted-image `{width,height}` (post-downscale) per image; translate blocks via the existing keyed-JSON batch pattern; render an absolutely-positioned per-image overlay container in `content.ts` using a **pure `mapBox()` coordinate fn** and a **pure `fitText()` shrink fn** (both node-testable seams); re-anchor with the existing `progRepositionAllBadges` rAF/throttle pattern + a `ResizeObserver`; style with fixed `rgba(0,0,0,0.78)`/`#fff`; gate the whole pass behind the popup "Include images" checkbox.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Image-byte fetch + downscale + Vision OCR | Service worker (background.ts) | — | Network + BYOK keys NEVER leave the worker (project invariant, T-12-01). `OffscreenCanvas` downscale is SW-only. |
| `boundingPoly` extraction from Vision response | Service worker → pure module (`vision-google.ts`/`image-resolve.ts`) | — | Pure parse of the JSON response; lives where the response is received. Math is node-testable. |
| Per-block translation (keyed-JSON batch) | Service worker (`translateImageBlocks` case) | pure `*-batch` module | Reuses the existing BYOK LLM round-trip; key read from storage in worker only. |
| Coordinate mapping (submitted-px → rendered rect) | Content script → pure `mapBox()` fn | — | Needs live `getBoundingClientRect`/`naturalWidth` (DOM-only). The MATH is a pure fn extracted for tests (Pattern law, image-resolve.ts:4). |
| Overlay DOM render + anchor + toggle | Content script (content.ts) | — | DOM construction, scroll/resize listeners, per-image toggle button. Classic-script law: pure logic in node-testable modules, wiring inlined. |
| Shrink-to-fit text measurement | Content script (`measureText`) → pure `fitText()` fn | — | `measureText` needs a 2D canvas context (available in content script). The search loop is a pure fn, testable by stubbing a measure callback. |
| "Include images" checkbox + persistence | Popup (popup.ts/html) + `chrome.storage` | — | Lives with the existing "Translate page" control (D-01). |

## Standard Stack

**No new dependencies.** Milestone guardrail (REQUIREMENTS.md:5, :43): "NO new OSS dependency — own code only (TreeWalker + canvas measure)." Everything below is browser-native or already in the repo. `[VERIFIED: package.json]` shows only `@types/chrome`, `linkedom` (dev/test), `typescript` — no runtime deps, and none are to be added.

### Core (all browser-native, zero install)
| API | Purpose | Why Standard |
|-----|---------|--------------|
| `CanvasRenderingContext2D.measureText` | Shrink-to-fit (OVL-05) | Named explicitly by the requirement (OVL-05) and milestone guardrail. `[VERIFIED: REQUIREMENTS.md:25]` |
| `Element.getBoundingClientRect()` + `window.scrollX/Y` | Map natural-px box → viewport (OVL-04) | Already the badge-anchoring pattern in repo (content.ts:1105). `[VERIFIED: src/content.ts:1105-1109]` |
| `HTMLImageElement.naturalWidth/naturalHeight` | Natural-pixel reference frame | Already used for progressive eligibility (content.ts:1208). `[VERIFIED: src/content.ts:1208-1215]` |
| `ResizeObserver` | Detect `<img>` rendered-size changes (responsive layouts) | Standard for element-size reactivity; `scroll`/`resize` window listeners miss layout-driven resizes. `[CITED: MDN ResizeObserver]` |
| `requestAnimationFrame` (or the existing 100ms throttle) | Debounce reposition without layout thrash | Repo already throttles badge reposition at 100ms (content.ts:1156-1169); rAF is the lower-latency alternative. `[VERIFIED: src/content.ts:1156]` |
| `chrome.storage.local` | "Include images" checkbox persistence | Existing settings store pattern. `[VERIFIED: src/popup.ts:23]` |

### Supporting (existing repo modules — reuse, don't rebuild)
| Module | Purpose | Reuse As |
|--------|---------|----------|
| `src/page-walk.ts` `buildPageBatchPrompt`/`parsePageBatchReply` | Keyed-JSON batch translate of N plain strings, key-injection-guarded | Template for per-block translate (or directly reusable — block text is plain strings, identical shape). `[VERIFIED: src/page-walk.ts:112-170]` |
| `src/translate-batch.ts` `parseBatchReply` | The two-attempt JSON parse + `inputKeys`-only iteration | Same security contract; clone-or-reuse. `[VERIFIED: src/translate-batch.ts:48-92]` |
| `src/image-resolve.ts` | `fullTextAnnotation` walk, downscale math (`targetDimensions`/`downscaleTarget`), `meanWordConfidence` | Extend the walk to also collect `boundingBox`; the downscale ratio is computable from `targetDimensions`. `[VERIFIED: src/image-resolve.ts:60-76, 183-215]` |
| `src/background.ts` `resolveImageBytes` + `downscaleAndGuard` | Cross-origin byte fetch + captureVisibleTab fallback + 2048 long-edge downscale | Unchanged — but `downscaleAndGuard` must now RETURN the submitted dims so the content script can compute the box ratio. `[VERIFIED: src/background.ts:198-296]` |
| `content.ts` `progPositionBadge`/`progRepositionAllBadges` | Absolute-position a DOM element over an `<img>`; rAF-throttled reposition on scroll/resize | Generalize from 1 corner badge → N region boxes. `[VERIFIED: src/content.ts:1105-1170]` |
| `content.ts` `pageCreatePill`/`pageApplyState` | Floating toggle pill (D-01 page toggle) | Template for the per-image corner toggle (D-02). `[VERIFIED: src/content.ts:1683-1745]` |
| `content.ts` `progCreateConcurrencyGate`/`progCreateBudget` | Cost-control gates (phase-13) | Bound the image pass per D-01. `[VERIFIED: src/content.ts:999-1023]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| DOM overlay boxes | Canvas `fillText` onto a copy of the image | Canvas read of a cross-origin image **taints the canvas** (security). DOM overlay over untouched pixels avoids this entirely (CONTEXT.md `<code_context>`: "no tainted-canvas risk"). DOM is correct and locked. |
| `ResizeObserver` only | `window.scroll`/`resize` listeners only | Window listeners miss layout-driven `<img>` resizes (flex reflow, font load, container resize) that don't fire scroll/resize. Use BOTH: window scroll for position, ResizeObserver for size. |
| Paragraph-level boxes | Block-level / word-level boxes | Block = fewer, larger boxes (may merge unrelated lines → worse fit). Word = too many tiny boxes, font-fit per word looks broken. Paragraph is the sweet spot (recommendation, see Pattern 1). |
| Per-block translate calls | One whole-image blob translate (v1.3 today) | Whole-blob loses the block→box mapping. Per-block keyed-JSON is required for OVL-01 AND stays one round-trip. |

**Installation:** None. (No `npm install`.)

## Package Legitimacy Audit

**Not applicable — this phase installs ZERO external packages.** Milestone guardrail forbids new OSS dependencies (REQUIREMENTS.md:5, :43). All capabilities use browser-native APIs (`measureText`, `getBoundingClientRect`, `ResizeObserver`, `naturalWidth`) and existing in-repo modules. No registry lookups, no slopcheck, no install steps. If a future planner is tempted to add a manga-typesetting or text-fitting library, that violates the locked milestone scope and must be rejected.

## Architecture Patterns

### System Architecture Diagram

```
USER clicks "Translate page" (popup / right-click), "Include images" checkbox ON
        │
        ▼
content.ts  pageTranslate()  ── existing phase-15 text path (unchanged) ──▶ in-place text swap
        │
        │  (NEW: if includeImages flag set in storage)
        ▼
content.ts  collectOverlayImages()  ── static snapshot of in-view <img> ──┐
        │   reuse progIsEligible (min-size) + concurrency/budget gates     │
        │   per image: { srcUrl, dedupKey (djb2 srcUrl) }                  │
        ▼                                                                   │
chrome.runtime.sendMessage  { type:'translateImageBlocks', {srcUrl,tabId,dedupKey} }
        │   (NO keys in payload — T-12-01)                                  │
        ▼                                                                   │
background.ts  worker                                                       │
        │   resolveImageBytes(srcUrl,tabId)  ─ data:/fetch/captureVisibleTab fallback
        │   downscaleAndGuard(...)  ─▶ submitted {base64, mime, W_submitted, H_submitted}  ★NEW: return dims
        │   visionProvider.ocr(...)  ─▶ fullTextAnnotation
        │        └─ NEW: extract paragraphs → [{ text, box:[{x,y}×4] }]  (submitted-px space)
        │   buildPageBatchPrompt + provider.translate + parsePageBatchReply
        │        └─ one keyed-JSON round-trip: {"0":txt,...} → {"0":translated,...}
        │   reply: { blocks:[{ box, original, translated }], submitted:{W,H}, naturalHint? }
        ▼                                                                   │
content.ts  onMessage ◀──────────────────────────────────────────────────┘
        │   per block: mapBox(box, submittedW/H, img.naturalW/H, img.getBoundingClientRect(), object-fit)
        │        └─ PURE fn (testable)  → {left,top,width,height} in viewport coords
        │   fitText(translated, boxW, boxH, ctx.measureText)  PURE fn (testable) → fontPx (+clamp)
        │   render: per-image <div container> (abs) > N <div box> (black rgba, #fff text) + corner toggle
        ▼
DOM: overlay boxes anchored over each <img>; ResizeObserver(img)+scroll/resize → reposition (rAF)
        │
        ├─ corner toggle (D-02): hide/show THIS image's overlay container (swap to original)
        └─ global page pill (D-01): hide/show ALL overlay containers
```

### Recommended Project Structure
```
src/
├── overlay-geometry.ts   # NEW pure module: mapBox(), object-fit letterbox math, downscale-ratio.
│                         #   No chrome.*, no document.* — node-testable (image-resolve.ts precedent).
├── overlay-fit.ts        # NEW pure module: fitText(text, boxW, boxH, measure) binary-search + clamp.
│                         #   measure is an injected callback so tests stub it (no canvas in node).
├── image-resolve.ts      # EXTEND: collectParagraphBoxes(fullTextAnnotation) → [{text, box}].
├── providers/vision-google.ts  # EXTEND: ocr() returns blocks[] alongside originalText.
├── background.ts         # EXTEND: downscaleAndGuard returns submitted dims; new translateImageBlocks case.
├── content.ts            # EXTEND: overlay render/anchor/toggle layer; mirror mapBox/fitText (classic-script law).
├── popup.ts / popup.html # EXTEND: "Include images" checkbox.
└── types.ts              # EXTEND: OverlayBlock, TranslateImageBlocks message + response contracts.

test/
├── overlay-geometry.mjs  # NEW: mapBox cases (downscale, object-fit contain/cover, scroll offset).
├── overlay-fit.mjs       # NEW: fitText cases (fits, shrinks to floor, clamps, CJK width via stub).
└── vision-google.mjs     # EXTEND: assert ocr() surfaces paragraph boxes from a fixture response.
```
Rationale: the **pure math lives in node-testable modules** with NO `chrome.*`/`document.*` (the explicit "Pattern law" already governing `image-resolve.ts`, see its header comment src/image-resolve.ts:1-6). `content.ts` MIRRORS these functions verbatim because it is a classic script that cannot import (the law enforced throughout content.ts, e.g. lines 925-930, 1390-1392). Keep the mirror in sync — a comment must point reviewers at the source of truth, exactly as the existing mirrors do.

### Pattern 1: Extract paragraph-level boundingBox in `ocr()` (OVL-01)
**What:** Extend `GoogleVisionProvider.ocr()` to walk `fullTextAnnotation.pages → blocks → paragraphs` and emit `{ text, box }` per paragraph, where `box` is the paragraph's `boundingBox.vertices`. Today the raw-response interfaces in `vision-google.ts` (lines 42-63) **omit `boundingBox` entirely** — they only model `confidence`. Add `boundingBox` to `VisionBlock`/`VisionParagraph` and reconstruct paragraph text from its words/symbols (`fullTextAnnotation.text` is a flat blob — there is no per-paragraph `.text` field; assemble it from `paragraph.words[].symbols[].text` joined with `detectedBreak` spacing, or use the simpler word-level `.text` if present).

**Why paragraph-level (Claude's Discretion resolution):** A Vision `paragraph` is a contiguous run of same-orientation text — the natural unit for one overlay box. Block-level can merge a heading + body into one oversized box (bad fit). Word-level produces dozens of tiny boxes that each shrink-fit independently and read as confetti. **Recommendation: paragraph-level.** `[VERIFIED: src/image-resolve.ts:155-168 nesting; src/providers/vision-google.ts:42-63 current omission]`

**Coordinate space (CRITICAL):** `boundingBox.vertices` are `{x,y}` in **pixel coordinates of the image submitted to Vision** — top-left, top-right, bottom-right, bottom-left order. `[CITED: docs.cloud.google.com/vision/docs/reference/rest/v1/AnnotateImageResponse]` Because `downscaleAndGuard` (background.ts:236-296) downscales any image with a long edge > 2048px BEFORE the Vision call (`downscaleTarget`, image-resolve.ts:74), these vertices are in the **downscaled** space, NOT natural-image space. **This is Pitfall 1.**

```typescript
// src/image-resolve.ts (NEW, pure) — extend the existing pages→blocks→paragraphs walk.
// Source: nesting already walked in meanWordConfidence (src/image-resolve.ts:189-204)
export interface OverlayBlock { text: string; box: { x: number; y: number }[]; } // 4 vertices, submitted-px space
export function collectParagraphBoxes(fta: FullTextAnnotation | undefined | null): OverlayBlock[] {
  const out: OverlayBlock[] = [];
  for (const page of fta?.pages ?? []) {
    for (const block of page.blocks ?? []) {
      for (const para of block.paragraphs ?? []) {
        const text = assembleParagraphText(para);     // join words/symbols w/ break spacing
        const box = para.boundingBox?.vertices ?? [];   // submitted-px vertices
        if (text.trim() && box.length === 4) out.push({ text, box });
      }
    }
  }
  return out;
}
```

### Pattern 2: Per-image overlay container + anchoring (OVL-03, OVL-04)
**What:** For each translated image, create ONE absolutely-positioned container `<div>` appended to `document.body` (NOT a wrapper around the `<img>` — wrapping mutates page layout and breaks sites). The container holds N box `<div>`s and one corner toggle button. Anchor exactly like the existing badge (`getBoundingClientRect()+scrollX/Y`), re-anchor on scroll/resize/ResizeObserver.

**Why body-appended absolute, not a wrapper:** The repo already proves this pattern works cross-site — `progAddBadge` appends to `document.body` with `position:absolute` + `getBoundingClientRect`+`scrollX/Y` and repositions on scroll/resize (content.ts:1115-1170). Wrapping the `<img>` in a new element risks breaking flex/grid layouts, `:nth-child` selectors, and site JS that queries the `<img>`'s parent. `[VERIFIED: src/content.ts:1105-1170]`

```typescript
// Reuse the EXACT badge-anchor primitive (src/content.ts:1105-1109):
function positionContainer(container: HTMLElement, img: HTMLImageElement): void {
  const rect = img.getBoundingClientRect();
  container.style.top  = `${rect.top  + window.scrollY}px`;
  container.style.left = `${rect.left + window.scrollX}px`;
  container.style.width  = `${rect.width}px`;
  container.style.height = `${rect.height}px`;
}
// Box positions are then computed RELATIVE to the container (container is the rendered-rect frame),
// so on reposition only the container moves — the inner boxes stay put. Cheaper than N reflows.
```

**Anchoring trigger set (OVL-04):** (a) `window.addEventListener('scroll', reposition, {passive:true})` + `'resize'` — already the badge pattern (content.ts:1343-1344). (b) `new ResizeObserver(reposition).observe(img)` for layout-driven size changes the window events miss. (c) rAF/100ms-throttle the reposition to avoid layout thrash — the repo throttles at 100ms (content.ts:1156-1169); rAF is acceptable too. **Handle scroll containers / transformed ancestors:** `getBoundingClientRect()` already returns the FINAL on-screen rect including ancestor transforms and nested-scroll offsets, so the badge math is correct for those cases without special handling. The one gap: an image inside an `overflow:scroll` div that scrolls independently of `window` won't fire `window.scroll` — acceptable for v1.4 (static snapshot scope), but note it (Open Question).

**Per-image toggle (D-02):** A corner `<button>` in the container, styled like the phase-15 pill (content.ts:1713-1737), toggles `container.style.display` and swaps its own label. Mirror `pageApplyState`'s label-flip (content.ts:1683-1692).

### Pattern 3: Coordinate mapping — the three transforms (OVL-04, the #1 risk)
**What:** A PURE `mapBox()` that converts a submitted-pixel vertex box into a `{left,top,width,height}` rect **relative to the rendered image rect** (the container frame from Pattern 2). Three composable steps:

```typescript
// src/overlay-geometry.ts (NEW, pure — no DOM, node-testable)
// Source: downscale ratio from src/image-resolve.ts:60-71 targetDimensions; object-fit math standard.
export function mapBox(
  box: { x: number; y: number }[],            // 4 vertices in SUBMITTED-pixel space
  submitted: { w: number; h: number },        // dims of image actually sent to Vision (post-downscale)
  natural:  { w: number; h: number },          // img.naturalWidth/Height
  rendered: { w: number; h: number },          // img.getBoundingClientRect() w/h
  objectFit: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down',
): { left: number; top: number; width: number; height: number } {
  // (a) submitted-px → natural-px : undo the worker's downscale.
  const upX = natural.w / submitted.w, upY = natural.h / submitted.h;
  const xs = box.map(v => v.x * upX), ys = box.map(v => v.y * upY);
  let nLeft = Math.min(...xs), nTop = Math.min(...ys);
  let nW = Math.max(...xs) - nLeft, nH = Math.max(...ys) - nTop;   // axis-aligned bbox (ignore skew)

  // (b) natural-px → rendered rect, honoring object-fit letterboxing.
  const { scale, offX, offY } = objectFitTransform(natural, rendered, objectFit);
  return { left: nLeft*scale + offX, top: nTop*scale + offY, width: nW*scale, height: nH*scale };
  // (c) rendered → viewport is done by the CONTAINER (Pattern 2), not here.
}
```

**`object-fit` letterbox math** (the part everyone gets wrong): for `contain`, `scale = min(rW/nW, rH/nH)` and the image is centered, so `offX = (rW - nW*scale)/2`, `offY = (rH - nH*scale)/2`. For `cover`, `scale = max(...)` and offsets are negative (image overflows, clipped). For `fill` (default `<img>` when CSS sets width+height), x and y scale independently: `scaleX = rW/nW`, `scaleY = rH/nH`, no offset. For `none`, scale=1 centered. **The vast majority of `<img>` have no `object-fit` set → behave as `fill`** unless the site applies CSS; read `getComputedStyle(img).objectFit` to branch. `[CITED: MDN object-fit]`

**`devicePixelRatio`:** NOT needed. `getBoundingClientRect()` and `scrollX/Y` are in CSS pixels, and the overlay is positioned in CSS pixels — DPR cancels out. (DPR only matters if you were drawing to a backing-store canvas, which we are not.) `[ASSUMED — A1]` — verify during implementation that no `transform: scale()` on a zoom-controlled ancestor breaks this; `getBoundingClientRect` already accounts for transforms so it should hold.

### Pattern 4: Worker carries blocks + submitted dims to content (OVL-01, the data the mapping needs)
**What:** A new message `translateImageBlocks` (content→worker) and reply carrying `{ blocks: [{box, original, translated}], submitted: {w,h} }`. **The submitted dims are mandatory** — without them `mapBox` step (a) is impossible (the content script knows `naturalWidth` but NOT what the worker downscaled to). Today `downscaleAndGuard` (background.ts:236-296) computes `target` dims internally via `downscaleTarget` and discards them; it must RETURN them.

```typescript
// background.ts: downscaleAndGuard already computes `target` (line 260) — return it.
// Then the new worker case mirrors translatePageBatch (background.ts:715-764):
//   ocr → collectParagraphBoxes → buildPageBatchPrompt(blocks.map(b=>b.text)) →
//   provider.translate → parsePageBatchReply → zip back onto blocks by key index.
// Key read from storage ONLY (T-12-01). One LLM round-trip for ALL blocks of one image.
```

### Pattern 5: Per-block translation via the existing keyed-JSON batch (OVL-01)
**What:** Reuse `buildPageBatchPrompt`/`parsePageBatchReply` (page-walk.ts:112-170) — block text is plain strings, the EXACT shape that path already handles (`Record<string,string>`). Build `{"0": block0.text, "1": block1.text, ...}`, one `provider.translate` call, parse back with `inputKeys`-only iteration (key-injection guard, already implemented), zip translations onto blocks by index. This keeps it **one API round-trip per image** (the v1.3 whole-image call becomes one keyed-batch call — same cost order, now with the block mapping preserved). `[VERIFIED: src/page-walk.ts:112-170, src/background.ts:715-764 translatePageBatch precedent]`

**Missing-key fallback:** `parsePageBatchReply` omits keys the model dropped — for those blocks, fall back to showing the **original** text in the box (so a partial LLM failure still renders something legible), mirroring the page-text "keep source on missing key" contract (page-walk.ts:166-167).

### Pattern 6: Shrink-to-fit via measureText (OVL-05)
**What:** A PURE `fitText()` doing a binary search over font-size to find the largest size where the text fits the box (width via `measureText`, height via line count × lineHeight), with a min-font floor; below the floor, clamp (line-clamp + ellipsis). `measureText` is injected as a callback so the search is node-testable without a canvas.

```typescript
// src/overlay-fit.ts (NEW, pure). measure: (text, fontPx) => widthPx  (content.ts supplies a canvas ctx)
export function fitText(
  text: string, boxW: number, boxH: number,
  measure: (text: string, fontPx: number) => number,
  opts = { maxFont: 28, minFont: 9, lineHeight: 1.2, pad: 4 },
): { fontPx: number; clamped: boolean; lines: string[] } {
  // binary search fontPx in [minFont, maxFont]; for each candidate, greedily wrap by measure()
  // into lines that fit (boxW - 2*pad), check totalLines*fontPx*lineHeight <= (boxH - 2*pad).
  // Largest fitting font wins. If even minFont overflows → use minFont, clamped=true (CSS line-clamp).
}
```
**CJK width:** CJK glyphs are ~full-width (≈1em) and don't break on spaces — wrap per-character, not per-word, when the text contains CJK (reuse `isCjkLang`, image-resolve.ts:96, on the detected lang). `measureText` already returns correct CJK widths, so the search is correct; only the wrap-granularity differs. `[CITED: MDN measureText]` `[VERIFIED: src/image-resolve.ts:96 isCjkLang available]`

### Anti-Patterns to Avoid
- **Wrapping the `<img>` in a new element** — breaks site layout/selectors. Use a body-appended absolute container (Pattern 2).
- **Reading the image into a canvas to draw text** — taints cross-origin canvases. DOM overlay only (locked, no-inpainting).
- **Using `naturalWidth` as the box reference frame** — boxes are in SUBMITTED (downscaled) px, not natural px. Always undo the downscale first (Pitfall 1).
- **Translating each block in its own LLM call** — N calls per image = cost + latency blowup. One keyed-JSON batch (Pattern 5).
- **Repositioning every inner box on scroll** — move only the CONTAINER; boxes are positioned relative to it (Pattern 2).
- **`innerHTML` for box text** — XSS. `textContent` only, the repo's universal law (e.g. content.ts:1095, 1733).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Element position over a scrolling page | New anchoring engine | `progPositionBadge`/`progRepositionAllBadges` pattern (content.ts:1105-1170) | Already cross-site-proven; handles transforms/scroll via `getBoundingClientRect`. |
| Keyed batch translate + JSON parse + key-injection guard | New prompt/parser | `buildPageBatchPrompt`/`parsePageBatchReply` (page-walk.ts) | Security-reviewed `inputKeys`-only iteration; one round-trip. |
| Cross-origin image bytes | New fetch/CORS logic | `resolveImageBytes` (background.ts:198-230) | data:/fetch/captureVisibleTab ladder already handles tainted + blob + 403. |
| Cost control (dedup/budget/concurrency/min-size) | New guards | `progCreateBudget`/`progCreateConcurrencyGate`/`progIsEligible` (content.ts:999-1023, 1217) | D-01 mandates reusing phase-13 guards. |
| Per-image toggle UI | New widget | Mirror `pageCreatePill`/`pageApplyState` (content.ts:1683-1745) | Same fixed-position, textContent-only, label-flip pattern. |
| Downscale ratio | Re-deriving from EXIF/headers | `targetDimensions`/`downscaleTarget` (image-resolve.ts:60-76) + worker returns submitted dims | The worker already knows exactly what it sent — return it, don't reverse-engineer. |

**Key insight:** ~80% of this phase is wiring existing, tested primitives together. The genuinely new code is two small pure functions (`mapBox`, `fitText`) and the `boundingBox` extraction. Everything else is a recombination.

## Common Pitfalls

### Pitfall 1: Coordinate-space mismatch (submitted-px vs natural-px vs rendered) — THE dominant risk
**What goes wrong:** Overlay boxes are offset, scaled wrong, or systematically shifted — worst on large images (downscaled) and `object-fit` images.
**Why it happens:** Three reference frames are conflated. Vision returns vertices in **submitted-image pixels** (post-downscale, because `downscaleAndGuard` shrinks long-edge>2048 before the call, background.ts:236-296). The `<img>` reports `naturalWidth` (full original) and `getBoundingClientRect` (CSS-rendered). Mapping submitted→rendered requires undoing the downscale (`natural/submitted` ratio) THEN applying the natural→rendered scale THEN object-fit offsets.
**How to avoid:** (1) Worker MUST return the submitted dims (Pattern 4). (2) `mapBox` composes all three transforms (Pattern 3) and is unit-tested with a downscaled + `object-fit:contain` fixture. (3) Note: if `resolveImageBytes` fell back to `captureVisibleTab` (background.ts:227-229), the "submitted image" is a **viewport screenshot**, not the image — its dims and crop are entirely different and `boundingBox` cannot be mapped to the `<img>`. **Detect the capture-fallback case and skip overlay for those images** (show nothing rather than mis-placed boxes). This is a real correctness boundary, not an edge case.
**Warning signs:** Boxes correct on small images but drift on large ones (= downscale not undone); boxes correct on `object-fit:fill` but shifted on `contain`/`cover` (= letterbox offset missing); boxes wildly wrong on a few images (= captureVisibleTab fallback path).

### Pitfall 2: captureVisibleTab fallback produces unmappable geometry
**What goes wrong:** For blob:/tainted/403 images, `resolveImageBytes` screenshots the viewport (background.ts:226-229). OCR boxes are then in screenshot space, not image space.
**Why it happens:** The fallback is byte-resolution-only; it was fine for v1.3 (side-panel just shows text) but breaks overlay placement.
**How to avoid:** The worker reply should flag which resolution path was used; content skips overlay (or falls back to a side-panel entry per D-04) when bytes came from capture. Document this as a known limitation.
**Warning signs:** A specific subset of images (CDN blobs, canvas-derived) shows boxes in the wrong place.

### Pitfall 3: `fullTextAnnotation` has no per-paragraph `.text`
**What goes wrong:** You reach for `paragraph.text` and it's `undefined`; only the top-level `fullTextAnnotation.text` (whole-image blob) exists.
**Why it happens:** Vision exposes text per-`symbol` (with `detectedBreak` for spacing/newlines); paragraph/word text must be assembled.
**How to avoid:** Assemble paragraph text from `paragraph.words[].symbols[].text`, inserting spaces/newlines per `symbol.property.detectedBreak.type` (SPACE/EOL_SURE_SPACE/LINE_BREAK). Unit-test against a fixture. `[CITED: Vision TextAnnotation docs]`
**Warning signs:** Empty or run-together block text.

### Pitfall 4: linkedom can't drive native createTreeWalker / canvas — but these are content-side anyway
**What goes wrong:** Trying to node-test the DOM render/anchor directly fails.
**Why it happens:** The repo already hit this for page-walk (test/page-walk.mjs uses a recursive walk because "linkedom's createTreeWalker returns nothing under acceptNode", page-walk.ts:40-50). `measureText` and `ResizeObserver` don't exist in node.
**How to avoid:** Keep DOM/canvas in `content.ts` (wiring), put the MATH in pure modules (`overlay-geometry.ts`, `overlay-fit.ts`) tested with stubbed `measure` callbacks and plain-number inputs. This is the established split.
**Warning signs:** A test importing `content.ts` or calling real `measureText` — wrong layer.

### Pitfall 5: classic-script mirror drift
**What goes wrong:** `content.ts` mirrors `mapBox`/`fitText` (it cannot import — classic script), then the pure module changes and the mirror doesn't.
**Why it happens:** The whole codebase carries this hazard (every `prog*`/`page*` fn in content.ts mirrors a module).
**How to avoid:** Add the "MUST stay in sync with X — classic-script law" comment exactly as existing mirrors do (e.g. content.ts:1390-1392, 1416). Keep the mirrored fns tiny so drift is obvious.
**Warning signs:** Overlay math correct in tests but wrong in the browser.

## Runtime State Inventory

> Greenfield-additive overlay feature — minimal persistent state. Included for completeness since the phase touches storage + session dedup.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | "Include images" checkbox value in `chrome.storage.local` (`himeSettings`). No migration — new optional field; `migrateSettings` (types.ts:473) spreads over `DEFAULT_SETTINGS` so a missing field defaults safely. | Code: add field to `Settings`/`DEFAULT_SETTINGS`. None to migrate. |
| Live service config | None — no external service stores any phase-16 string. | None — verified: no n8n/Datadog/OS registrations in this repo (browser extension). |
| OS-registered state | None — browser extension; no Task Scheduler/launchd/systemd. | None — verified by project type. |
| Secrets/env vars | None new. Reuses existing `googleApiKey` + `apiKeys[provider]` read in the worker (background.ts:411, 321). No new key. | None. |
| Build artifacts | New `overlay-geometry.ts`/`overlay-fit.ts` compile to `dist/` via `tsc`; new `test/*.mjs` run against `dist/`. `npm run build` copies html/css. | Code: ensure new modules are emitted; tests import from `dist/`. |
| Session dedup state | Overlay image jobs reuse the `storage.session` `himeImageJobs` map + djb2 dedup keys (background.ts:122-165). Per-session, auto-cleared. | None — reuse as-is. |

## Code Examples

### Reading the new "Include images" flag (popup → storage)
```typescript
// popup.ts — mirror the existing himeSettings read (src/popup.ts:23-27)
// Source: src/popup.ts loadSettings + src/options pattern
const result = await chrome.storage.local.get(['himeSettings']);
const includeImages = (result.himeSettings as Settings | undefined)?.includeImages ?? false; // default OFF (D-01)
// checkbox.checked = includeImages;  on change → write back into himeSettings (preserve other fields).
```

### Worker block-translate case (mirrors translatePageBatch)
```typescript
// background.ts — new 'translateImageBlocks' case. Source: src/background.ts:715-764 translatePageBatch
const ocr = await visionProvider.ocr(guarded.base64, guarded.mime, googleKey); // EXTENDED to also return blocks
const blocks = ocr?.blocks ?? [];                                  // [{ text, box }]  (submitted-px)
const items: Record<string,string> = {};
blocks.forEach((b, i) => { items[String(i)] = b.text; });
const userContent = `${buildPageBatchPrompt(config)}\n\n${JSON.stringify(items)}`;
const reply = await provider.translate(userContent, config, apiKey, s.model);    // ONE round-trip
const translations = parsePageBatchReply(reply.text, Object.keys(items));         // key-injection-guarded
const out = blocks.map((b, i) => ({
  box: b.box,
  original: b.text,
  translated: translations[String(i)] ?? b.text,   // missing-key → fall back to original (page-walk.ts:166)
}));
sendResponse({ blocks: out, submitted: { w: guarded.width, h: guarded.height } }); // ★ submitted dims (Pattern 4)
```

### Content-side render + anchor (wiring; math from pure modules)
```typescript
// content.ts — per translated image. Source: anchor from src/content.ts:1105-1170; pill from :1713-1745
const ctx = document.createElement('canvas').getContext('2d')!;       // for measureText
const cs = getComputedStyle(img);
const objectFit = cs.objectFit as 'fill'|'contain'|'cover'|'none'|'scale-down';
for (const blk of blocks) {
  const r = mapBox(blk.box, submitted, {w: img.naturalWidth, h: img.naturalHeight},
                   {w: img.getBoundingClientRect().width, h: img.getBoundingClientRect().height}, objectFit);
  const { fontPx, clamped } = fitText(blk.translated, r.width, r.height,
                                      (t, f) => { ctx.font = `${f}px sans-serif`; return ctx.measureText(t).width; });
  const box = document.createElement('div');
  box.textContent = blk.translated;                                   // textContent ONLY (XSS law)
  box.style.cssText = [
    'position:absolute', `left:${r.left}px`, `top:${r.top}px`,
    `width:${r.width}px`, `height:${r.height}px`,
    'background:rgba(0,0,0,0.78)', 'color:#fff',                       // D-03 fixed palette, WCAG-AA
    `font:${fontPx}px/1.2 sans-serif`, 'border-radius:3px', 'box-sizing:border-box', 'padding:2px 4px',
    'overflow:hidden', 'display:flex', 'align-items:center', 'pointer-events:none',
    ...(clamped ? ['text-overflow:ellipsis'] : []),
  ].join(';');
  container.appendChild(box);
}
```

## State of the Art

| Old Approach (v1.3) | Current Approach (phase 16) | When Changed | Impact |
|--------------------|------------------------------|--------------|--------|
| Vision `boundingPoly` extracted then DISCARDED (only `originalText` kept) | Paragraph `boundingBox` surfaced per block | This phase | Enables positioned overlays (OVL-01). |
| Whole-image OCR text translated as one blob | Per-block keyed-JSON batch (one round-trip, mapping preserved) | This phase | Each block → its own box (OVL-01); same cost order. |
| Image translation shown only in side panel | In-place DOM overlay primary; side panel stays for deep-dive | This phase (D-04) | Lens-style reading on the page. |

**Deprecated/outdated:** Nothing. v1.3 side-panel path is retained (D-04), not replaced.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `devicePixelRatio` does not need explicit handling because `getBoundingClientRect`/`scrollX/Y`/CSS-px overlay all share the CSS-pixel coordinate system and DPR cancels. | Pattern 3 | LOW — if a zoom/transform ancestor breaks it, `getBoundingClientRect` already accounts for transforms; verify with a `transform:scale` fixture during impl. |
| A2 | `boundingBox.vertices` (not `normalizedVertices`) are present for DOCUMENT_TEXT_DETECTION block/paragraph boxes when the request sends base64 `image.content` (not a GCS URI). | Pattern 1 | MEDIUM — official ref didn't enumerate the field name explicitly for blocks. Mitigation: extraction code should read `boundingBox.vertices` AND fall back to `boundingBox.normalizedVertices` (× submitted dims) if vertices absent. Confirm against a real fixture in `test/vision-google.mjs`. |
| A3 | Reusing `buildPageBatchPrompt`/`parsePageBatchReply` verbatim is acceptable for block text (vs cloning into an image-specific prompt). | Pattern 5 | LOW — block text is plain strings, identical shape; if image-block prompts need different instructions (e.g. "preserve UI labels"), clone the prompt like translate-batch→page-walk did. |

## Open Questions

1. **CJK / vertical reading order inside a box (Claude's Discretion + 999.3 hard part)**
   - What we know: `isCjkLang` is available (image-resolve.ts:96); `measureText` handles CJK width; v1.3 already flags `verticalOrCjk` on entries (image-resolve.ts:256, background.ts:450).
   - What's unclear: whether to render vertical CJK text (`writing-mode: vertical-rl`) or just horizontal-wrap CJK. Vision returns horizontal `boundingBox` regardless.
   - Recommendation: v1.4 ships **horizontal** overlay text for all languages (simplest, legible). Wrap CJK per-character (Pattern 6). Defer true vertical typesetting to the manga-grade backlog item (REQUIREMENTS.md:39). Surface to discuss-phase if the user wants vertical.

2. **Images in independently-scrolling containers (`overflow:scroll` divs)**
   - What we know: `window.scroll`/`resize` + `ResizeObserver(img)` cover window scroll + size changes; `getBoundingClientRect` is always correct on read.
   - What's unclear: an image that scrolls inside a nested scroller without a window scroll event won't reposition until the next window scroll/resize.
   - Recommendation: acceptable for v1.4 static-snapshot scope; optionally add a `scroll` listener with `{capture:true}` on `document` to catch nested scrolls (cheap, throttled). Flag if perfectionism is required.

3. **captureVisibleTab-resolved images (Pitfall 2 boundary)**
   - What we know: blob:/tainted/403 images resolve to a viewport screenshot (background.ts:226-229), whose geometry can't map to the `<img>`.
   - Recommendation: worker flags the resolution path; content **skips overlay** for capture-fallback images (no boxes is better than wrong boxes). Confirm this is the desired UX (vs falling back to a side-panel entry per D-04).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Google Cloud Vision API (BYOK) | OCR + boundingBox | ✓ (user-configured, v1.3) | v1 `images:annotate` | None — feature requires it; default-OFF checkbox means no spend until opted in. |
| BYOK LLM provider (openai/gemini/openrouter) | Per-block translate | ✓ (user-configured) | existing | Missing key → auth error entry, same as v1.3 (background.ts:413-423). |
| `CanvasRenderingContext2D.measureText` | Shrink-to-fit | ✓ (all Chrome) | native | None needed (universal). |
| `ResizeObserver` | Anchor on resize | ✓ (Chrome 64+) | native | `window.resize` only (degraded but functional). |
| `tsc` + `node --test` | Build + pure-fn tests | ✓ | TS ^5.2.2 | None. `[VERIFIED: package.json]` |

**Missing dependencies with no fallback:** None — all required tooling/APIs are present.
**Missing dependencies with fallback:** `ResizeObserver` (degrade to window-resize) — but it's universally available in target Chrome.

## Validation Architecture

> nyquist_validation: included (not disabled in config — STATE shows the project runs `npm test` = `tsc && node --test`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in) + `node:assert/strict`; `linkedom` for DOM fixtures `[VERIFIED: package.json, test/page-walk.mjs]` |
| Config file | none — `package.json` `"test": "tsc && node --test 'test/**/*.mjs'"` |
| Quick run command | `npm run build && node --test test/overlay-geometry.mjs test/overlay-fit.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OVL-01 | `ocr()` surfaces paragraph `{text, box}` from a fixture Vision response | unit | `node --test test/vision-google.mjs` | ⚠️ EXTEND (test/vision-google.mjs exists) |
| OVL-01 | `collectParagraphBoxes` assembles paragraph text + 4-vertex box | unit | `node --test test/image-resolve.mjs` | ⚠️ EXTEND (test/image-resolve.mjs exists) |
| OVL-04 | `mapBox` correct under downscale + object-fit contain/cover/fill + scroll | unit | `node --test test/overlay-geometry.mjs` | ❌ Wave 0 |
| OVL-05 | `fitText` fits / shrinks to floor / clamps; CJK per-char wrap | unit | `node --test test/overlay-fit.mjs` | ❌ Wave 0 |
| OVL-01 | per-block keyed-JSON round-trips + missing-key→original fallback | unit | `node --test test/translation-batch.mjs` (or new) | ⚠️ reuse page-walk/translate-batch test pattern |
| OVL-02 | (legibility) box palette is fixed black/white — assert constants | unit | small const assertion in overlay test | ❌ Wave 0 (trivial) |
| OVL-03 | per-image toggle hides/shows container — manual (DOM/Chrome) | manual | live load-unpacked check | manual-only (DOM wiring; node can't drive content.ts) |

### Sampling Rate
- **Per task commit:** `npm run build && node --test test/overlay-geometry.mjs test/overlay-fit.mjs`
- **Per wave merge:** `npm test`
- **Phase gate:** full `npm test` green + live load-unpacked verification on a CJK image page (manga/menu screenshot) before `/gsd-verify-work`. **Project law: verify the built extension via load-unpacked + a node harness on `dist/`, NEVER the service-worker console** (MEMORY.md: no-service-worker-console-tests).

### Wave 0 Gaps
- [ ] `test/overlay-geometry.mjs` — covers OVL-04 (`mapBox`: downscale ratio, object-fit contain/cover/fill, scroll offset)
- [ ] `test/overlay-fit.mjs` — covers OVL-05 (`fitText`: fits, shrinks-to-floor, clamps, CJK per-char wrap via stubbed measure)
- [ ] Extend `test/vision-google.mjs` + `test/image-resolve.mjs` — assert `boundingBox` extraction (OVL-01) against a fixture with `pages→blocks→paragraphs→words→symbols` + `boundingBox.vertices`
- [ ] Fixture: a realistic `fullTextAnnotation` JSON with multi-paragraph geometry (add to `test/fixtures/`)

## Security Domain

> security_enforcement: enabled (absent in config = enabled). Browser-extension threat surface.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth in extension; BYOK keys are user secrets. |
| V3 Session Management | no | n/a |
| V4 Access Control | yes | `host_permissions` already `<all_urls>` + specific API hosts (manifest.json). No new permission needed — overlay uses existing content-script + worker fetch. Do NOT widen permissions. |
| V5 Input Validation | yes | LLM reply parsed with `inputKeys`-only iteration (`parsePageBatchReply`, page-walk.ts:160) — blocks key injection / `__proto__`. Vision response is provider JSON, parsed defensively (optional chaining throughout). |
| V6 Cryptography | no | No crypto; djb2 dedup keys are non-security identity only (background.ts:141). |

### Known Threat Patterns for {MV3 content-script overlay + BYOK}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| BYOK key leaking into a message/page | Information Disclosure | Keys read from `storage` in worker ONLY, never in payload (T-12-01) — overlay messages carry `{srcUrl, dedupKey, tabId}` + geometry only. `[VERIFIED: src/background.ts:411, types.ts:263-265]` |
| XSS via translated/OCR text injected as HTML | Tampering/Elevation | `textContent` only for all box/toggle text — never `innerHTML` (repo-wide law, content.ts:1095, 1733). |
| LLM key-injection in keyed-JSON reply | Tampering | `parsePageBatchReply` iterates `inputKeys`, ignores model-invented keys (page-walk.ts:160-167). |
| SSRF via worker fetching arbitrary URLs | Tampering | Only user-page `<img>.src` is fetched (bounded surface, T-12-12, background.ts:211-213). Overlay snapshot sends only in-page image srcUrls. |
| Tainted-canvas read of cross-origin image | Information Disclosure | Avoided by design — DOM overlay, never canvas read of the image (no-inpainting lock). `measureText` uses a throwaway canvas with NO image drawn. |

## Sources

### Primary (HIGH confidence)
- Codebase (file:line cited throughout): `src/providers/vision-google.ts`, `src/image-resolve.ts`, `src/background.ts`, `src/content.ts`, `src/page-walk.ts`, `src/translate-batch.ts`, `src/popup.ts`, `src/types.ts`, `package.json`, `manifest.json`, `test/*.mjs` — the authoritative ground truth.
- `.planning/phases/16-.../16-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` §Phase 16/999.3, `.planning/STATE.md`.

### Secondary (MEDIUM confidence)
- `docs.cloud.google.com/vision/docs/reference/rest/v1/AnnotateImageResponse` — `boundingBox` per block/paragraph, vertices order top-left→bottom-left, coordinates in submitted-image scale. (Field-name `vertices` vs `normalizedVertices` not enumerated for blocks → A2.)
- MDN: `object-fit`, `measureText`, `ResizeObserver`, `getBoundingClientRect` — standard browser-API behavior (training + widely consistent).

### Tertiary (LOW confidence)
- None relied upon — no unverified WebSearch claims in this research.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new deps; every API/module verified in-repo or in official MDN/Vision docs.
- Architecture: HIGH — all four reused systems read directly from source at file:line; the new pieces (`mapBox`/`fitText`) are small, well-bounded pure fns.
- Pitfalls: HIGH — Pitfall 1 (coordinate space) and Pitfall 2 (captureVisibleTab) are derived directly from the actual downscale path (background.ts:236-296) and fallback (background.ts:226-229), not speculation.
- One MEDIUM item (A2: vertices vs normalizedVertices field name) — mitigated by reading both with fallback.

**Research date:** 2026-06-22
**Valid until:** 2026-07-22 (stable — browser APIs + an internal codebase; revisit if Vision API response schema or the v1.3 downscale path changes).
