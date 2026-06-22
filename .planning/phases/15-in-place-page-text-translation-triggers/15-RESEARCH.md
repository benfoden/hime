# Phase 15: In-Place Page-Text Translation + Triggers - Research

**Researched:** 2026-06-22
**Domain:** Chrome MV3 content-script DOM text-node snapshot + batched BYOK translation + in-place layout-preserving replace, with manual + auto-offer triggers
**Confidence:** HIGH (codebase patterns verified by direct read; DOM-walk testability verified by running linkedom; tag-alignment / TreeWalker semantics cross-checked against MDN + Bergamot/domtranslator refs)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 · Control surface & toggle — in-page floating pill (primary), popup + right-click triggers**
  - Manual trigger (TRIG-01): a "Translate page" button in the existing toolbar **popup** (`popup.html`/`popup.ts`, alongside the v1.2 Search entry) **and** a right-click context-menu item "Translate page" (alongside the existing image menu items in `background.ts`).
  - Toggle/re-apply (PAGE-03): while translated, show a **small in-page floating pill** (corner) flipping original ↔ translation in one tap. The popup button **mirrors** the current state ("Show original" / "Show translation"). No reload, no re-open.
  - Rejected: toolbar-badge-click toggle (conflicts with action→popup binding).
- **D-02 · Auto-offer — top banner, session + per-origin dismissal**
  - When `<html lang>` base ≠ target base (via `progShouldGateByLanguage` mirrored in `content.ts:975`), show a **slim, dismissible top banner** offering "Translate this page" (TRIG-02/03).
  - **Dismissal stickiness:** once dismissed, banner stays gone for that **origin for the rest of the browser session** (persist a dismissed-origins set in `chrome.storage.session`). Manual trigger remains available after dismiss.
  - No banner on same-language pages (no spend). Unobtrusive + dismissible (TRIG-03).
- **D-03 · Translatable scope — visible text nodes only**
  - Translate **visible text nodes only.** Attributes (`alt`, `title`, `placeholder`, `aria-label`) stay in source language for v1.4.
- **D-04 · Partial-failure — apply successes + dismissible error toast + red badge + retry-failed-sections**
  - On partial batch failure: **apply all successful translations**, leave failed regions in source text (page stays usable), surface **one dismissible error toast** + the red error badge (`setBadgeText` ERR pattern).
  - Toast offers **"Retry failed sections"** re-batching **only failed nodes**. Requires tracking which snapshot nodes failed.

### Claude's Discretion
The three open questions are explicitly delegated to research/planning:
1. Best TreeWalker filter + chunking strategy (cost vs round-trips; preserve inline-tag boundaries).
2. Original-text restore mechanism for the toggle (WeakMap node→original vs data-attribute).
3. Failed-node tracking structure for D-04 "retry failed sections."

### Deferred Ideas (OUT OF SCOPE)
- Translate visible **attributes** (`alt`/`title`/`placeholder`/`aria-label`).
- Bilingual display mode (milestone-deferred).
- Dynamic / SPA live translation (MutationObserver) — milestone-deferred; **STATIC snapshot only.**
- Per-site opt-out / auto-translate allowlist (banner dismissal is session-only).
- **No new OSS dependency** (own TreeWalker/recursive-walk + batched pipeline; no inpainting/typesetting libs).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PAGE-01 | Translate current page visible text in place, replacing original, layout preserved | §Architecture Pattern 1 (snapshot walk) + Pattern 3 (in-place text-node value swap, no structural DOM change → layout intact) |
| PAGE-02 | Skip script/style/code/`contenteditable`/form inputs; keep interactivity | §Pattern 1 skip-set + §Pitfall 2 (FILTER_REJECT prunes subtree); replacing only `Text.nodeValue` never touches event listeners/links |
| PAGE-03 | Toggle back to original + re-apply, no reload | §Pattern 4 (WeakMap node→{original,translated} + page-state flag) + §Open Q2 resolution |
| PAGE-04 | Batched through existing background BYOK pipeline, minimize calls/cost | §Pattern 2 (reuse `translateBatch` message + `buildBatchPayload`/`parseBatchReply` keyed-JSON) + §Pattern 5 chunking |
| PAGE-05 | Static snapshot at trigger time | §Pattern 1 (walk once → fixed array; no MutationObserver) |
| TRIG-01 | Manual trigger via toolbar action + right-click menu | §Pattern 6 (context menu mirror) + §Pattern 7 (popup button → `chrome.tabs.sendMessage`) |
| TRIG-02 | Auto-offer when `<html lang>` ≠ target, reuse `shouldGateByLanguage`; same-lang no cost | §Pattern 8 (banner gated by `progShouldGateByLanguage`) |
| TRIG-03 | Auto-offer unobtrusive + dismissible; manual always available | §Pattern 8 (slim banner + `chrome.storage.session` per-origin dismissal) |
</phase_requirements>

## Summary

Phase 15 is a **content-script feature** with a thin background addition (one context-menu item, one message route) and a thin popup addition (one button + state mirror). Nearly all logic lives in `content.ts` (classic script, `<all_urls>`, `run_at: document_end`). The work is: (1) walk the page once at trigger time collecting visible, translatable text nodes into a fixed snapshot array; (2) map each node to a stable string key and reuse the **already-shipped `translateBatch` keyed-JSON pipeline** (`translate-batch.ts` + the `translateBatch` case in `background.ts`) to translate in chunks; (3) write translations back into each `Text` node's `nodeValue` in place — which preserves layout/listeners/links entirely because no element structure changes; (4) keep originals in a `WeakMap<Text, {original, translated}>` so a floating pill (and the popup button) flips original↔translation without reload; (5) on partial failure apply successes, toast with "Retry failed sections" re-batching only the tracked failed nodes; (6) auto-offer via a slim dismissible top banner gated by the existing `progShouldGateByLanguage`, with per-origin dismissal in `chrome.storage.session`.

The single most important architectural decision: **extract the pure DOM-walk + key-mapping logic into a standalone testable module** (mirroring the project's proven `serp-render.ts` / `panel-render.ts` / `progressive-guard.ts` doctrine), driven by `linkedom` in node tests. I verified that linkedom faithfully exposes `Text` nodes (`nodeType===3`, `nodeValue`) and that a **manual recursive walk** correctly collects text and skips `<script>`/`<style>` in linkedom, whereas linkedom's `createTreeWalker` with an `acceptNode` filter returns nothing. So: use the browser's native `createTreeWalker` (with `FILTER_REJECT` to prune skip-subtrees) **inside `content.ts`**, but factor the **decision logic** (`isTranslatableElement(tagName, isContentEditable)`, `isVisible`, key assignment, chunking, failed-node tracking, restore) into pure functions that a recursive-walk test harness exercises. This keeps the per-MEMORY.md rule (no service-worker console tests; verify via node harness on `dist/`) satisfiable.

**Primary recommendation:** New pure module `src/page-walk.ts` (skip-set + visibility + chunking + key map + restore helpers, no `chrome.*`/no `document` in the pure parts), mirrored into `content.ts`'s classic-script body for the live walk; reuse the existing `translateBatch` message verbatim (it already accepts an arbitrary keyed `{t,d}` map — pack page chunks into it, or add a leaner `translatePageBatch` message carrying `Record<string,string>`). Toggle state via `WeakMap<Text,{original,translated}>`. No new permissions, no new dependency.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Walk DOM, collect visible text nodes, snapshot | Content script | Pure module (`page-walk.ts`) for testable logic | DOM only exists in the page; classic-script `content.ts` owns live DOM, pure module owns decision logic |
| Map node→key, chunk within budget, track failures | Pure module | Content script (drives it) | Pure, node-testable per project doctrine (serp/panel/guard precedent) |
| In-place text replace + original/translation toggle | Content script | — | Mutating `Text.nodeValue` requires live DOM nodes (can't cross the message boundary) |
| BYOK translation (network + key) | Background worker | — | **Locked:** key never reaches the page; reuse existing `translateBatch` handler |
| Floating pill + error toast + top banner UI | Content script | — | In-page UI; mirror existing `progCreateIndicator`/overlay DOM conventions |
| Context-menu "Translate page" + dispatch to tab | Background worker | Content script (receives) | `chrome.contextMenus` lives in worker; click → `chrome.tabs.sendMessage(tabId, {type:'translatePage'})` |
| Popup "Translate page" button + state mirror | Popup | Content script (state source) | Popup is a gesture surface; queries/triggers the active tab's content script |
| Auto-offer language gate | Content script | `progressive-guard.ts` (canonical `shouldGateByLanguage`) | `<html lang>` is DOM-read in the page; gate logic already mirrored at `content.ts:975` |
| Per-origin banner dismissal persistence | `chrome.storage.session` | Content script | Session-scoped, ephemeral (matches D-02); content script reads/writes |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (none new) | — | — | **Locked: no new OSS dependency.** All capability is browser-native DOM + existing hime modules. |
| `@types/chrome` | ^0.0.304 (already in devDeps) | MV3 typings for `contextMenus`, `tabs`, `storage.session` | Already used project-wide |
| `linkedom` | ^0.18.12 (already in devDeps) | Drive pure DOM-walk module in node tests | Already the project's test-DOM (`test/serp.mjs`, `test/panel-render.mjs`) |
| `typescript` | ^5.2.2 (already) | strict build | Project standard |

### Supporting (browser-native APIs — no install)
| API | Purpose | When to Use |
|-----|---------|-------------|
| `document.createTreeWalker(root, NodeFilter.SHOW_TEXT, filter)` | Live text-node traversal in `content.ts` | The live walk only — NOT in the testable pure module (linkedom emulates it poorly) |
| `WeakMap<Text, {original,translated}>` | Per-node original/translation store for toggle | Restore mechanism (Open Q2 — recommended over data-attributes; Text nodes can't hold attributes anyway) |
| `chrome.storage.session` | Per-origin banner dismissal set | D-02 stickiness (ephemeral, per browser session — exactly the required lifetime) |
| `chrome.contextMenus` | Right-click "Translate page" | TRIG-01 (mirror existing image menu items) |
| `chrome.tabs.sendMessage(tabId, msg)` | Worker→content trigger dispatch | Right-click + popup → content script (precedent at `background.ts:902`) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `createTreeWalker` in `content.ts` | Pure recursive walk everywhere | Recursive walk is more testable but slower on huge pages; **recommended hybrid:** native TreeWalker live, recursive walk in tests, shared decision predicates |
| `WeakMap` restore store | `data-hime-orig` attribute | Attributes live on **elements**, but we mutate **Text nodes** (no attribute slot); WeakMap is the natural fit and auto-GCs when nodes are removed |
| Reuse `translateBatch` `{t,d}` map | New `translatePageBatch` carrying `Record<string,string>` | Reuse = zero background change but wastes a `d` field per item; a leaner message is cleaner. **Recommend new message** (see §Pattern 2) — small, follows the established contract shape |
| Slim top banner | Use the floating pill for the offer too | Banner is the locked decision (D-02); pill is for the post-translate toggle (D-01) |

**Installation:** None. `npm run build` (`tsc && copy-assets`) and `npm run test` (`tsc && node --test`) are unchanged.

## Package Legitimacy Audit

> **N/A — this phase installs no external packages** (locked: no new OSS dependency). All functionality uses browser-native APIs and existing in-repo modules. slopcheck not applicable. No registry verification required.

## Architecture Patterns

### System Architecture Diagram

```
                 ┌────────────────── TRIGGERS ──────────────────┐
                 │                                               │
  Right-click "Translate page"          Popup "Translate page" button
   (background.ts contextMenus)          (popup.ts gesture)
         │                                       │
         │ chrome.tabs.sendMessage(tabId,        │ chrome.tabs.sendMessage(active.id,
         │   {type:'translatePage'})             │   {type:'translatePage'})
         ▼                                       ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  CONTENT SCRIPT (content.ts, classic, <all_urls>)            │
   │                                                              │
   │  Auto-offer path: on document_end →                          │
   │    progShouldGateByLanguage(<html lang>, target) === false   │
   │      && origin not in session-dismissed set                  │
   │        → render slim top BANNER  ──"Translate"──┐            │
   │                                                  ▼            │
   │  [1] SNAPSHOT WALK (once, static)                             │
   │      createTreeWalker(SHOW_TEXT, FILTER_REJECT skip-subtrees) │
   │      → ordered Text[]  +  isVisible filter                    │
   │                                                              │
   │  [2] KEY MAP + CHUNK (pure page-walk.ts logic)               │
   │      Text[i] → key "i"; group into char-budget chunks        │
   │      keep WeakMap<Text,{original,translated}>                 │
   │                                                              │
   │  [3] per chunk: chrome.runtime.sendMessage ────────┐         │
   └────────────────────────────────────────────────────┼────────┘
                                                         ▼
                          ┌────────────────────────────────────────┐
                          │  BACKGROUND WORKER (background.ts)       │
                          │   case 'translatePageBatch':             │
                          │     key from storage (BYOK, never page)  │
                          │     provider.translate(keyed-JSON)       │
                          │     parse → {key: translatedText}        │
                          │     8s timeout race (existing pattern)   │
                          └────────────────────────────────────────┘
                                                         │ {translations} | {error,kind}
   ┌──────────────────────────────────────────────────────┼──────┐
   │  CONTENT SCRIPT (cont.)                                ▼      │
   │  [4] APPLY: for each returned key → Text.nodeValue = translated│
   │      (layout/listeners/links untouched — only nodeValue swaps)│
   │      failed keys → failedNodes set (D-04)                     │
   │                                                              │
   │  [5] post-translate UI:                                       │
   │      floating PILL (corner): "Show original" ↔ "Show transln" │
   │      partial fail → error TOAST + red badge + "Retry failed"  │
   │      "Retry failed" → re-chunk ONLY failedNodes → [3]         │
   └──────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
src/
├── page-walk.ts        # NEW — pure: skip-set predicate, isVisible, key-map,
│                       #   chunking by char budget, failed-node tracking, restore
│                       #   helpers. NO chrome.*; DOM types only where unavoidable.
│                       #   (Mirrors serp-render.ts / progressive-guard.ts doctrine.)
├── content.ts          # EDIT — live createTreeWalker walk (mirrors page-walk logic
│                       #   per classic-script law), pill/banner/toast UI, apply+toggle
├── background.ts       # EDIT — add 'hime-translate-page' context menu item +
│                       #   onClicked dispatch; add 'translatePageBatch' message case
├── popup.ts / .html    # EDIT — "Translate page" button + state mirror
├── types.ts            # EDIT — add 'translatePage','translatePageBatch' to MessageType
│                       #   + TranslatePageBatchMessage/Response interfaces
└── translate-batch.ts  # REUSE — buildBatchTranslatePrompt pattern as a template for
                        #   a page-batch prompt (keyed plain-string variant)
test/
└── page-walk.mjs       # NEW — linkedom-driven: skip-set, visibility, chunk sizes,
                        #   key stability, restore round-trip, failed-node retry set
```

### Pattern 1: Static snapshot walk (PAGE-01, PAGE-02, PAGE-05)
**What:** At trigger time, walk the DOM **once** into a fixed ordered `Text[]`. No MutationObserver — content added later is not translated (PAGE-05, locked).
**When:** On `translatePage` message and on banner-click.
**Browser implementation (in `content.ts`):**
```typescript
// [CITED: MDN createTreeWalker] — FILTER_REJECT prunes the node AND its subtree,
// which is exactly how we cheaply skip an entire <script>/<pre>/contenteditable region.
const SKIP_TAGS = new Set([
  'SCRIPT','STYLE','NOSCRIPT','CODE','PRE','TEXTAREA',
  'TITLE','TEMPLATE','SVG','MATH','HEAD',
]); // [ASSUMED] tag set — confirm with user; mirrors domtranslator default + CONTEXT skip list
function collectTextNodes(root: Node): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node): number {
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      // Reject whole subtree if any ancestor is non-translatable.
      for (let el: HTMLElement | null = parent; el; el = el.parentElement) {
        if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
        if (el.isContentEditable) return NodeFilter.FILTER_REJECT; // PAGE-02
      }
      const text = (node.nodeValue ?? '');
      if (!text.trim()) return NodeFilter.FILTER_REJECT;       // whitespace-only
      if (!isVisible(parent)) return NodeFilter.FILTER_REJECT; // see Pattern 1b
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null;
  while ((n = walker.nextNode())) out.push(n as Text);
  return out;
}
```
> Note: `acceptNode` cannot use `FILTER_REJECT` to prune subtrees of *element* ancestors when the walker is `SHOW_TEXT` only (it only sees text nodes). The ancestor-loop above is the correct equivalent: re-check ancestors per text node. Alternatively walk `SHOW_ELEMENT | SHOW_TEXT` and `FILTER_REJECT` skip elements — slightly faster on deep skip-subtrees. Planner picks; both are valid.

### Pattern 1b: Cheap visibility test (D-03 "visible text nodes only")
**What:** Define "visible" cheaply without forcing reflow per node.
**Recommended:** `element.offsetParent !== null` catches `display:none` and most off-screen-removed content cheaply. It does **not** catch `visibility:hidden`, `position:fixed`, or zero-size; for v1.4 simplicity that is acceptable. A stricter check is `getComputedStyle` (`display:none` / `visibility:hidden`) but it's costly per node.
```typescript
// [ASSUMED] cheap-visibility heuristic — confirm acceptable fidelity with user.
function isVisible(el: HTMLElement): boolean {
  // offsetParent === null → display:none or detached (fast, no forced style calc
  // beyond layout already done). Good enough for D-03 "go-fast" scope.
  if (el.offsetParent === null) {
    // position:fixed elements have null offsetParent but ARE visible — rescue them.
    const pos = getComputedStyle(el).position;
    if (pos !== 'fixed') return false;
  }
  return true;
}
```
**Pitfall:** Reading `offsetParent`/`getComputedStyle` in a tight loop can thrash layout. Mitigate by collecting candidate nodes first, then batch-checking, or accept the one-time cost at trigger (page is static; user pressed a button — a brief synchronous pass is fine).

### Pattern 2: Reuse the keyed-JSON batch pipeline (PAGE-04)
**What:** The shipped `translateBatch` message + `translate-batch.ts` already prove keyed-JSON batch translation with: two-attempt JSON parse, input-key-only iteration (anti key-injection), 8s timeout race, raw fallback, usage recording, `{error,kind}` contract. **Reuse this design.** Two options:
- **(A) Reuse `translateBatch` as-is:** pack each text node into `{t: nodeText, d: ''}`. Zero background change. Wastes the `d` field.
- **(B, recommended) New `translatePageBatch` message** carrying `Record<string,string>` (key→sourceText) and returning `Record<string,string>` (key→translatedText). Add a `buildPageBatchPrompt(config)` mirroring `buildBatchTranslatePrompt` but for a flat `{"0":"text",...}` shape, and a `parsePageBatchReply(raw, inputKeys)` mirroring `parseBatchReply` (iterate **inputKeys only**, require `typeof entry === 'string'`).
```typescript
// New, mirroring translate-batch.ts contract exactly:
export type PageBatch = Record<string, string>;            // key → source text
export function buildPageBatchPrompt(config: TranslationConfig): string { /* JSON-only, like buildBatchTranslatePrompt */ }
export function parsePageBatchReply(raw: string, inputKeys: string[]): PageBatch { /* iterate inputKeys; keep only string entries */ }
```
**Why a new message:** the page payload is plain strings, not `{title,description}`; forcing it through `{t,d}` is a lie the prompt has to work around. The new path is ~40 lines and follows the locked security law (key read from storage in worker, never in payload — see `background.ts:668` `s.apiKeys[s.provider]`).
**Worker handler** clones the `translateBatch` case verbatim (lines 664–711): read settings/key, reject if no key (`{error,kind:'auth'}`), build `userContent = prompt + '\n\n' + JSON.stringify(items)`, `Promise.race` against 8s timeout with synthetic `AbortError`, `recordUsage`, `parsePageBatchReply`, respond `{translations}` or `{error,kind}`.

### Pattern 3: In-place replace = mutate `Text.nodeValue` only (PAGE-01, PAGE-02)
**What:** Write the translation directly into the existing `Text` node's `nodeValue`. **Do not** create elements, set `innerHTML`, or restructure. Because only character data changes, all element layout, CSS, event listeners, links, and form controls are untouched — interactivity is preserved for free (PAGE-02), and the LLM output is never interpreted as HTML (no XSS surface; `nodeValue` is plain text).
```typescript
for (const key of Object.keys(translations)) {
  const node = snapshot[Number(key)];
  const translated = translations[key];
  if (node && document.contains(node)) {
    const rec = store.get(node) ?? { original: node.nodeValue ?? '', translated: '' };
    rec.translated = translated;
    store.set(node, rec);
    node.nodeValue = translated;   // in-place, layout intact
  }
}
```
**Tag-alignment note (Bergamot/domtranslator):** Bergamot/Firefox handle *inline markup inside a translatable segment* (e.g. `<p>hello <b>world</b></p>`) by translating the segment as marked-up HTML and re-aligning tags. **hime's simpler model** treats each `Text` node as an independent unit — `"hello "` and `"world"` translate separately. This is the documented tradeoff: it can split mid-sentence around inline tags, hurting fluency for `<b>`/`<a>`-heavy prose, but it is dramatically simpler and requires no tag-re-alignment engine. **This matches the "no new dependency / go-fast" constraint.** [ASSUMED] per-Text-node granularity is acceptable for v1.4 — flag for user confirmation; the alternative (segment-level with `<b1>`-style placeholders, per Bergamot) is materially more work and should be a deferred idea if fluency complaints arise.

### Pattern 4: Toggle via WeakMap + page state flag (PAGE-03) — Open Q2 resolution
**What:** `WeakMap<Text, {original: string, translated: string}>` is the canonical store. A module-level `pageState: 'original' | 'translated'` flips both the pill label and the popup mirror.
```typescript
const store = new WeakMap<Text, { original: string; translated: string }>();
let pageState: 'original' | 'translated' = 'original';
let translatedNodes: Text[] = []; // strong refs to iterate the toggle (snapshot order)

function applyState(state: 'original' | 'translated'): void {
  for (const node of translatedNodes) {
    const rec = store.get(node);
    if (rec && document.contains(node)) {
      node.nodeValue = state === 'translated' ? rec.translated : rec.original;
    }
  }
  pageState = state;
  updatePill();          // pill label: "Show original" when translated, else "Show translation"
  // popup mirror: write pageState into chrome.storage.session so popup reads it on open
}
```
**Why WeakMap over data-attribute (Open Q2 verdict):**
- `Text` nodes have **no attribute slot** — `data-*` would force wrapping each text node in a `<span>`, which (a) changes DOM structure (risking layout/CSS sibling selectors), (b) is the exact heavyweight approach the project avoids. **WeakMap is strictly better here.** `[VERIFIED: codebase grep]` (no element-wrapping pattern exists; project mutates nodes directly).
- WeakMap survives re-apply (the toggle just rereads the store) and auto-GCs entries when nodes are removed from the DOM (no leak).
- Keep a **strong** `translatedNodes: Text[]` array (the snapshot, filtered to applied nodes) so the toggle can iterate — a WeakMap is not enumerable. The strong array is cleared when the user navigates/closes; fine for a per-page static feature.
**Popup mirror:** popup can't read content-script memory. On each apply/toggle, content writes `{himePageState, himeOrigin}` to `chrome.storage.session`; popup `loadSettings()` reads it to label the button "Translate page" / "Show original" / "Show translation". The button click sends `translatePage` (first time) or `togglePage` (when already translated) to the active tab.

### Pattern 5: Chunking by character budget (Open Q1 resolution)
**What:** Group snapshot nodes into chunks under a char budget to balance cost (fewer round-trips) vs. failure blast-radius and timeout risk.
**Recommended:** pure function `chunkByBudget(texts: string[], maxChars: number): number[][]` returning arrays of node indices. Default `maxChars ≈ 4000` characters per chunk [ASSUMED — tune; a single oversized node always gets its own chunk]. Each chunk → one `translatePageBatch` call. Run chunks with a small concurrency cap (reuse the proven `createConcurrencyGate` from `progressive-guard.ts`, default 2) so a 500-node page doesn't fire 30 simultaneous LLM calls.
```typescript
export function chunkByBudget(texts: string[], maxChars = 4000): number[][] {
  const chunks: number[][] = []; let cur: number[] = []; let size = 0;
  for (let i = 0; i < texts.length; i++) {
    const len = texts[i].length;
    if (cur.length && size + len > maxChars) { chunks.push(cur); cur = []; size = 0; }
    cur.push(i); size += len;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}
```
**Tradeoff:** larger chunks = fewer calls/cheaper but a single chunk failure loses more nodes (mitigated by retry-failed, Pattern 9) and risks the 8s worker timeout on big payloads. Smaller chunks = more resilient, more calls. 4000 chars is a conservative middle ground; the planner should make it a named constant with a tune-comment (project convention — see `progressive-guard.ts` constants block).

### Pattern 6: Right-click context menu (TRIG-01)
**What:** Mirror the existing `ensureContextMenus()` in `background.ts:990`. Add a third item; dispatch on click to the content script.
```typescript
// Inside ensureContextMenus(), after the two existing items:
chrome.contextMenus.create({
  id: 'hime-translate-page',
  title: 'Translate page',
  contexts: ['page', 'selection', 'link'],  // NOT 'image' (avoid auto-nesting per existing FLATTEN comment)
});
// In contextMenus.onClicked (background.ts:1046):
if (info.menuItemId === 'hime-translate-page') {
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'translatePage' });
  return;
}
```
**Pitfall (existing code comment, background.ts:1000):** Chrome auto-nests an extension's items under a submenu when 2+ are visible at once. The existing items are deliberately mutually exclusive (`image` vs everything-else) to keep both top-level. Adding a third item that overlaps contexts will **re-trigger nesting**. Decide: accept a "hime" submenu (simplest), or carefully partition contexts. [ASSUMED] a submenu is acceptable — flag for user; the FLATTEN invariant in the code is load-bearing.

### Pattern 7: Popup button + dispatch (TRIG-01)
**What:** Add `<button id="translatePage">` to `popup.html` (alongside Search). In `popup.ts`, mirror the `openImagePanel` gesture pattern: `chrome.tabs.query({active,currentWindow})` → `chrome.tabs.sendMessage(tab.id, {type:'translatePage'|'togglePage'})`. Label is set from `chrome.storage.session` page-state mirror in `loadSettings()`.
```typescript
async function translatePageAction(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id == null) return;
  const state = (await chrome.storage.session.get('himePage')).himePage; // {origin,state}
  const msgType = state?.state === 'translated' || state?.state === 'original-shown'
    ? 'togglePage' : 'translatePage';
  await chrome.tabs.sendMessage(tab.id, { type: msgType });
  window.close();
}
```
**Pitfall:** `chrome.tabs.sendMessage` to a tab with no content script (e.g. `chrome://`, PDF viewer, web store) rejects with `lastError`. Wrap in try/catch and show nothing (or a toast). The content script only runs on `<all_urls>` http(s) pages.

### Pattern 8: Auto-offer banner (TRIG-02, TRIG-03)
**What:** On `document_end`, if `!progShouldGateByLanguage(document.documentElement.lang, target)` AND the page origin is not in the session-dismissed set, render a slim fixed top banner. Reuse the existing gate (already mirrored at `content.ts:975`) — **same-language pages return gate-ON → no banner → no spend** (TRIG-02 cost guarantee).
```typescript
// boot (mirror content.ts:1419 storage.local.get pattern):
chrome.storage.local.get(['himeSettings'], async (result) => {
  const s = result.himeSettings || {};
  const pageLang = document.documentElement.lang ?? '';
  const target = typeof s.targetLanguage === 'string' ? s.targetLanguage : '';
  if (progShouldGateByLanguage(pageLang, target)) return;   // same/unknown lang → no offer
  const origin = location.origin;
  const dismissed = (await chrome.storage.session.get('himeBannerDismissed'))
    .himeBannerDismissed as string[] | undefined;
  if (dismissed?.includes(origin)) return;                  // D-02 stickiness
  showOfferBanner(origin);  // slim, dismissible; "Translate this page" + ✕
});
```
- Banner styling: mirror `progCreateIndicator` (`position:fixed`, high z-index `2147483646`, `textContent`-only, no `innerHTML`). Place at `top:0` full-width, slim height.
- Dismiss (✕) → append `origin` to `chrome.storage.session.himeBannerDismissed` and remove the element. Manual triggers (popup/right-click) still work after dismiss (TRIG-03).
- "Translate this page" button → same code path as the `translatePage` message.

### Pattern 9: Partial-failure handling + retry-failed (D-04) — Open Q3 resolution
**What:** Track failures at the node level so retry targets only them.
**Structure:** `const failedNodes = new Set<Text>();` populated when a chunk's `translatePageBatch` reply is `{error}` (whole chunk failed) or omits keys (per-key parse miss). On any failure: apply all successful keys (Pattern 3), add the chunk's/missing keys' nodes to `failedNodes`, show **one** dismissible error toast (singleton — re-fire updates text, don't stack) + red error badge (`setBadge('ERR','#FF0000')` / `badgeForKind`). Toast's "Retry failed sections" button → `chunkByBudget([...failedNodes].map(textOf))` and re-run only those chunks; on success remove from `failedNodes`.
```typescript
const failedNodes = new Set<Text>();
function recordChunkFailure(nodes: Text[]): void { for (const n of nodes) failedNodes.add(n); }
function recordChunkSuccess(nodes: Text[], translations: Record<string,string>, baseIndex: ...): void {
  // apply successes; any node whose key is missing → failedNodes.add(node)
}
function retryFailed(): void {
  const nodes = [...failedNodes];
  failedNodes.clear();
  translateNodes(nodes);   // same chunk→batch→apply path, scoped to these nodes
}
```
**Why a `Set<Text>`:** dedups naturally across retries, holds strong refs (needed to re-translate), and is trivially testable in the pure module via the chunk-index mapping. The toast/badge mirror v1.3's `setBadgeText` ERR pattern (D-04 "matches v1.3 error-handling spirit").

### Anti-Patterns to Avoid
- **`innerHTML` for replacement:** turns LLM output into live HTML (XSS) and destroys listeners/structure. Always `Text.nodeValue` (Pattern 3). The codebase already enforces `textContent`-only (see `T-13-06` comments) — follow it.
- **MutationObserver / live re-translate:** explicitly out of scope (PAGE-05, D-02 locked). Static snapshot only.
- **`data-*` attributes on text:** impossible without wrapping nodes in spans; breaks layout. Use WeakMap (Pattern 4).
- **One LLM call per text node:** blows cost/latency. Batch (Pattern 5) — PAGE-04 is explicit.
- **Walking via linkedom's `createTreeWalker` in the pure module:** verified to return nothing under an `acceptNode` filter. Use a recursive walk in the testable module; native TreeWalker only in `content.ts`.
- **Re-triggering context-menu auto-nesting:** the FLATTEN invariant (background.ts:1000) is load-bearing — don't naively add an overlapping-context item without deciding the submenu tradeoff.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Keyed batch translate + JSON parse + key-injection guard + timeout | New parser | `translate-batch.ts` `parseBatchReply` shape (clone to `parsePageBatchReply`) | Already battle-tested (two-attempt parse, input-key-only iteration, raw fallback) |
| Language gate (`<html lang>` vs target, base-subtag normalize) | New comparison | `progShouldGateByLanguage` (already mirrored in `content.ts:975`) | Canonical, conservative-by-default, tested in `test/progressive-guard.mjs` |
| Concurrency cap for N chunk calls | New semaphore | `createConcurrencyGate` (`progressive-guard.ts`) | Proven, tested |
| Context-menu registration (idempotent, SW-reload-safe) | New `onInstalled` logic | Extend `ensureContextMenus()` (background.ts:990) | The top-level-every-load registration is a hard-won regression fix (see comment) |
| Badge error signalling | New badge code | `setBadge` + `badgeForKind` (content.ts:515/527) | Established ERR pattern (D-04) |
| Worker→content dispatch | New channel | `chrome.tabs.sendMessage` (precedent background.ts:902) | Standard |
| In-page fixed UI element | New CSS framework | Mirror `progCreateIndicator` cssText pattern (content.ts:1077) | `textContent`-only, z-index convention, idempotent-by-id |

**Key insight:** Phase 15 is ~80% wiring of already-shipped primitives. The genuinely new code is the DOM-walk/snapshot module, the toggle store, and three small UI surfaces (pill, banner, toast). Resist re-implementing the batch/gate/menu/badge machinery.

## Runtime State Inventory

> This is a feature-addition phase, not a rename/refactor — but it introduces **new ephemeral runtime state** worth tracking.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `chrome.storage.session.himeBannerDismissed` (per-origin dismissed set) + `himePage` (page-state mirror for popup). Both **ephemeral / session-only** by design (D-02). | New keys — document in types.ts as `STORAGE_*` consts (mirror `STORAGE_PROGRESSIVE_ACK` pattern) |
| Live service config | None — no external service config touched. | None |
| OS-registered state | One new `chrome.contextMenus` item (`hime-translate-page`), registered via `ensureContextMenus()` on every SW load. | Add to `ensureContextMenus`; verify FLATTEN/nesting invariant |
| Secrets/env vars | None new. BYOK key continues to live in `storage.local` read by the worker only (locked). | None — never put key in any page-bound message |
| Build artifacts | `dist/` gains a new `page-walk.js` module (if extracted). `tsc` emits it; `copy-assets` unaffected (it's `.js`, bundled by the classic-script include? **NO** — content.ts is classic, can't `import`). | **Decision:** pure logic must be **duplicated** into content.ts (classic-script law, like `progShouldGateByLanguage` at content.ts:975), with the canonical copy in `page-walk.ts` for node tests. Keep them in sync (project's documented doctrine). |

**Nothing found in category Secrets/env, Live service config:** None — verified by reading background.ts message handlers (key always `s.apiKeys[s.provider]`/`s.googleApiKey` from storage) and manifest (no new host/permission needed).

## Common Pitfalls

### Pitfall 1: Classic-script content.ts cannot `import` the pure module
**What goes wrong:** You write `page-walk.ts`, `import` it in `content.ts`, build succeeds locally but the content script fails at runtime (classic scripts have no ES-module loader in this setup).
**Why:** `content_scripts.js: ["content.js"]` loads a classic script; the project's established workaround is **mirroring** (see `progShouldGateByLanguage` duplicated verbatim at content.ts:975 with a "Classic-script law" comment).
**How to avoid:** Canonical pure logic in `page-walk.ts` (node-tested via linkedom); **duplicate** the needed functions into `content.ts` with a "MUST stay in sync" comment, exactly as the codebase already does.
**Warning signs:** `import` statement at top of content.ts; "Cannot use import outside a module" in the page console.

### Pitfall 2: TreeWalker `SHOW_TEXT` filter can't `FILTER_REJECT` an element subtree
**What goes wrong:** You expect returning `FILTER_REJECT` from `acceptNode` to skip a `<script>`'s descendants, but with `SHOW_TEXT`-only the walker never visits the element, so the reject applies to the text node only — you still descend into other branches correctly, but you must re-check ancestors per text node (Pattern 1) OR include `SHOW_ELEMENT` to reject element subtrees.
**Why:** `whatToShow` controls which node types the filter sees; `FILTER_REJECT` prunes the subtree of the *node it's called on*.
**How to avoid:** Use the ancestor-walk in Pattern 1 (simple, correct) or `SHOW_ELEMENT | SHOW_TEXT` and reject skip-elements (faster on deep skip-trees).
**Warning signs:** translated text appearing inside `<style>`/`<pre>`/`contenteditable`.

### Pitfall 3: linkedom `createTreeWalker` ≠ browser
**What goes wrong:** Testing the walk via linkedom's `createTreeWalker` returns no nodes (verified this session).
**Why:** linkedom's TreeWalker filter contract diverges from the browser.
**How to avoid:** The pure module exposes a **recursive walk** (verified working in linkedom) + standalone predicates (`isTranslatableTag`, `chunkByBudget`, restore). Test those. `content.ts` uses native TreeWalker (correct in real Chrome) but calls the same predicate functions.
**Warning signs:** green `tsc` but empty walk results in `test/page-walk.mjs`.

### Pitfall 4: `chrome.tabs.sendMessage` to a content-script-less tab
**What goes wrong:** Right-click/popup "Translate page" on `chrome://`, the web store, or a PDF throws `lastError`.
**Why:** Content script only injects on http(s) `<all_urls>`; restricted pages have none.
**How to avoid:** try/catch the send; ignore `lastError` (or toast "Can't translate this page"). Same pattern as `progSendTranslate`'s `chrome.runtime.lastError` check (content.ts:1193).
**Warning signs:** "Could not establish connection. Receiving end does not exist."

### Pitfall 5: Layout thrash reading visibility per node
**What goes wrong:** Calling `offsetParent`/`getComputedStyle` interleaved with `nodeValue` writes forces repeated synchronous layout, freezing big pages.
**Why:** Read-after-write layout invalidation.
**How to avoid:** Two phases — **read** (collect + visibility-check all nodes), then **write** (apply translations) after each batch returns. Never interleave reads and writes.
**Warning signs:** visible jank / long task on 1000-node pages.

### Pitfall 6: Toggle iterating a WeakMap (not possible)
**What goes wrong:** You try to enumerate the WeakMap to flip all nodes — WeakMaps aren't iterable.
**Why:** WeakMap has no `keys()`/`forEach`.
**How to avoid:** Keep a parallel strong `translatedNodes: Text[]` (the applied snapshot) and iterate that, reading the WeakMap per node (Pattern 4).
**Warning signs:** `store.forEach is not a function`.

### Pitfall 7: Duplicated original captured on re-apply
**What goes wrong:** If you re-run the full translate while already translated, you capture the *translated* text as "original."
**Why:** `rec.original = node.nodeValue` re-reads the already-swapped value.
**How to avoid:** Only set `original` once (`store.has(node)` guard) or always re-show original before re-translating. Pattern 3 uses `store.get(node) ?? {original: nodeValue}` — ensure the first capture wins.
**Warning signs:** "Show original" displays the translation.

## Code Examples

### Mirror the existing `translateBatch` worker handler for pages
```typescript
// Source: pattern of background.ts:664–711 (translateBatch case), adapted for plain-string keys
case 'translatePageBatch': {
  const msg = message as TranslatePageBatchMessage;
  const { items, config } = msg.payload;            // items: Record<string,string>
  const s = await getSettings();
  const apiKey = s.apiKeys[s.provider] || '';        // BYOK from storage — never page
  if (!apiKey) { sendResponse({ error: `API key not configured for ${s.provider}`, kind: 'auth' }); break; }
  const provider = providers[s.provider];
  if (!provider) { sendResponse({ error: `Unknown provider: ${s.provider}`, kind: 'unknown' }); break; }
  const inputKeys = Object.keys(items);
  const userContent = `${buildPageBatchPrompt(config)}\n\n${JSON.stringify(items)}`;
  try {
    const result = await Promise.race([
      provider.translate(userContent, config, apiKey, s.model),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error('Translation timed out'), { name: 'AbortError' })), 8000)),
    ]);
    if (result.usage) await recordUsage(s.model, result.usage);
    sendResponse({ translations: parsePageBatchReply(result.text, inputKeys) });
  } catch (err) {
    const kind = (err as { kind?: string })?.kind ?? classifyError(s.provider, err).kind;
    sendResponse({ error: err instanceof Error ? err.message : 'Unknown error', kind });
  }
  break;
}
```

### Pure recursive walk for the testable module (verified in linkedom this session)
```typescript
// Source: verified working against linkedom 0.18.12 this research session
const SKIP_TAGS = new Set(['SCRIPT','STYLE','NOSCRIPT','CODE','PRE','TEXTAREA','TITLE','TEMPLATE','HEAD']);
export function collectTextNodesRecursive(root: Node, isEditable: (el: Element)=>boolean): Node[] {
  const out: Node[] = [];
  (function walk(node: Node) {
    for (const c of Array.from(node.childNodes)) {
      if (c.nodeType === 3) {                                  // Text
        if ((c.nodeValue ?? '').trim()) out.push(c);
      } else if (c.nodeType === 1) {                           // Element
        const el = c as Element;
        if (SKIP_TAGS.has(el.tagName)) continue;
        if (isEditable(el)) continue;
        walk(c);
      }
    }
  })(root);
  return out;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-node `XMLHttpRequest` translate (early page translators) | Batched keyed-JSON LLM calls | LLM era | hime already batches (PAGE-04); reuse it |
| Bergamot tag-aligned segment translation (Firefox local models) | Same idea, but heavyweight | 2023 (Firefox Translations) | hime deliberately uses **simpler per-Text-node** granularity (no tag-realign engine) — accept fluency tradeoff for the no-dependency constraint |
| Browser `chrome.i18n`/page-action translate | Extension content-script + BYOK LLM | — | hime's model; nothing to change |

**Deprecated/outdated:** None relevant. MV3 `chrome.storage.session` is current and the correct lifetime for per-session banner dismissal.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Per-`Text`-node translation granularity (not Bergamot tag-aligned segments) is acceptable for v1.4 | Pattern 3 | Fluency degradation on inline-markup-heavy prose (`<b>`/`<a>` mid-sentence). Mitigation: deferred idea if complaints arise. |
| A2 | `offsetParent`-based cheap visibility (missing `visibility:hidden`, zero-size) is "good enough" for D-03 | Pattern 1b | Some hidden text gets translated (minor cost) or some visible text skipped (rare). |
| A3 | SKIP_TAGS set (`SCRIPT,STYLE,NOSCRIPT,CODE,PRE,TEXTAREA,TITLE,TEMPLATE,SVG,MATH,HEAD`) matches user intent + form inputs (`<input>`/`<textarea>` have no child text anyway) | Pattern 1 | Translating `<pre>` code or skipping desired content. Confirm exact set with user. |
| A4 | A new `translatePageBatch` message (plain-string keyed) is preferred over reusing `translateBatch` `{t,d}` | Pattern 2 | If rejected, fall back to packing into `{t,d}` — no blocker, just less clean. |
| A5 | 4000-char chunk budget + concurrency cap 2 are sane defaults | Pattern 5 | Too-large → 8s timeout / lost nodes; too-small → more cost. Make it a tunable constant. |
| A6 | A "hime" context-menu **submenu** is acceptable if the third item re-triggers Chrome auto-nesting | Pattern 6 | Violates the existing top-level FLATTEN UX intent. Confirm with user. |
| A7 | Banner dismissal keyed on `location.origin` (not full URL / not eTLD+1) is the right granularity | Pattern 8 | Sub-origin pages re-prompt or over-suppress. Matches D-02 "per-origin" wording. |
| A8 | Pure `page-walk.ts` logic must be **duplicated** into classic-script `content.ts` (can't import) | Pitfall 1 / Runtime State | If content.ts is actually module-capable, duplication is unnecessary. Verified classic-script via manifest + content.ts:975 precedent — low risk. |

## Open Questions

1. **Inline-tag fluency vs. simplicity (A1).**
   - What we know: per-Text-node is far simpler and dependency-free; Bergamot does tag-aligned segments.
   - What's unclear: whether v1.4 users will find split-around-`<b>` translations acceptable.
   - Recommendation: ship per-Text-node; add "segment-level tag alignment" as a deferred idea. Confirm with user in discuss/plan.

2. **Reuse `translateBatch` vs. new `translatePageBatch` (A4).**
   - What we know: both work; new message is cleaner (plain strings).
   - Recommendation: new message (~40 lines, mirrors the established contract). Planner decides.

3. **Context-menu nesting (A6).**
   - What we know: a third overlapping-context item re-triggers Chrome submenu nesting; the code currently fights to keep items top-level.
   - Recommendation: accept a "hime" submenu (simplest, future-proof for more items) OR partition contexts so only one hime item ever shows at once. User/planner call.

## Environment Availability

> Code/config-only Chrome-extension change; no external runtime tools beyond the existing build/test chain.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `tsc` (typescript) | build | ✓ | ^5.2.2 (devDep) | — |
| `node --test` | unit tests | ✓ | system node | — |
| `linkedom` | DOM-walk tests | ✓ | ^0.18.12 (devDep) | recursive-walk pattern works (verified) |
| Chrome (manual verify) | load-unpacked verify | assumed dev machine | — | node harness on `dist/` per MEMORY.md (no SW-console tests) |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

> nyquist_validation: config not inspected for an explicit `false`; treating as enabled. Confirm `.planning/config.json`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node built-in `node:test` + `node:assert` + `linkedom` (project standard) |
| Config file | none — `package.json` `test` script: `tsc && node --test 'test/**/*.mjs'` |
| Quick run command | `node --test test/page-walk.mjs` |
| Full suite command | `npm test` (`tsc && node --test 'test/**/*.mjs'`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PAGE-02 | skip-set excludes script/style/code/pre/textarea/contenteditable | unit | `node --test test/page-walk.mjs` | ❌ Wave 0 |
| PAGE-01/05 | recursive walk returns ordered visible Text nodes (static) | unit | `node --test test/page-walk.mjs` | ❌ Wave 0 |
| PAGE-04 | `chunkByBudget` groups under char budget; oversize node solo | unit | `node --test test/page-walk.mjs` | ❌ Wave 0 |
| PAGE-04 | `parsePageBatchReply` iterates inputKeys only, string-typed, raw fallback | unit | `node --test test/page-walk.mjs` (or extend `test/translation-batch.mjs`) | ❌ Wave 0 |
| PAGE-03 | restore round-trip: original captured once, toggle flips both ways | unit | `node --test test/page-walk.mjs` (WeakMap-free pure helper over a map) | ❌ Wave 0 |
| D-04 | failed-node Set: retry re-chunks only failures, clears on success | unit | `node --test test/page-walk.mjs` | ❌ Wave 0 |
| TRIG-02 | gate reuse: same-lang → no offer (already covered) | unit | `node --test test/progressive-guard.mjs` | ✅ |
| PAGE-01 (e2e) | in-place `nodeValue` swap preserves layout/links | manual | load-unpacked / node harness on `dist/` | manual |
| TRIG-01/03 (e2e) | right-click + popup trigger; banner dismiss sticky | manual | load-unpacked | manual |

### Sampling Rate
- **Per task commit:** `node --test test/page-walk.mjs`
- **Per wave merge:** `npm test`
- **Phase gate:** `npm test` green + manual load-unpacked verify before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/page-walk.mjs` — covers PAGE-01/02/03/04/05 + D-04 pure logic
- [ ] (optional) extend `test/translation-batch.mjs` for `parsePageBatchReply`
- [ ] `src/page-walk.ts` must export pure helpers (no `chrome.*`, recursive-walk variant) for the harness
- Framework install: none (all present)

## Security Domain

> security_enforcement: assumed enabled (no explicit `false` seen). Trust-boundary handling per CLAUDE.md eng-standards: page/content-script input is a trust boundary.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | BYOK key unchanged; never on page (locked) |
| V3 Session Management | no | n/a |
| V4 Access Control | no | n/a |
| V5 Input Validation | **yes** | LLM reply parsed via `parsePageBatchReply` (input-key-only iteration, string-typed, raw fallback — anti key-injection, cloning `parseBatchReply` XLT-03); page text written via `Text.nodeValue` (plain text, never `innerHTML`) |
| V6 Cryptography | no | no crypto introduced |

### Known Threat Patterns for MV3 content-script + LLM

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| LLM reply injected as HTML → XSS | Tampering/EoP | Write only `Text.nodeValue` (Pattern 3); never `innerHTML`. Codebase `textContent`-only law (T-13-06). |
| Malicious key in returned JSON (key injection) | Tampering | Iterate **inputKeys only** in `parsePageBatchReply` (XLT-03 precedent). |
| BYOK key leaking to page | Info disclosure | Key read in worker from `storage.local` only; **never** in any page-bound message (locked; verified in all background handlers). |
| `<html lang>` author-controlled feeding a code path | Tampering | Used only in pure string comparison (`progShouldGateByLanguage`, T-14-04) — no eval, no injection surface. |
| Sending to a restricted tab | DoS (self) | try/catch `lastError` on `chrome.tabs.sendMessage`. |
| Translating untrusted page text (prompt injection of the LLM) | Tampering | Out-of-scope risk inherent to any LLM translator; mitigated only insofar as output is rendered as plain text (no HTML/script execution). Note for user awareness. |

## Sources

### Primary (HIGH confidence)
- Codebase (direct read): `src/translate-batch.ts`, `src/background.ts` (message dispatch L543–760, contextMenus L990–1065), `src/content.ts` (gate L940–980, indicator/badge L1064–1202, onMessage L680–715/L1389–1415, boot L1419–1459), `src/progressive-guard.ts`, `src/popup.ts`, `src/types.ts` (MessageType + interfaces L134–353), `manifest.json`, `package.json`, `test/*.mjs` — patterns stated as fact.
- linkedom 0.18.12 behavior **verified by running this session:** recursive walk collects Text + skips `<script>` ✓; `createTreeWalker` w/ `acceptNode` returns empty ✗ — drives the testability strategy.
- [CITED: developer.mozilla.org/en-US/docs/Web/API/Document/createTreeWalker] — `SHOW_TEXT`, `FILTER_REJECT` (prunes subtree) vs `FILTER_SKIP` semantics.

### Secondary (MEDIUM confidence)
- Firefox Translations writeup (andrenatal.com, 2023-05) + Bergamot Firefox source docs — TreeWalker + tag-alignment model; used to justify hime's simpler per-Text-node tradeoff (A1).
- translate-tools/domtranslator (GitHub) — recursive walk, skip-set (`script/style/noscript/code/textarea`), `translate`/`restore` per-node + `getState().originalText` — corroborates skip-set and restore-store approach (study, not a dependency).

### Tertiary (LOW confidence)
- General TreeWalker tutorials (htmlgoodies, codidact) — background only; superseded by MDN.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; all APIs/modules verified in-repo or via MDN.
- Architecture: HIGH — every pattern maps to an existing, read-verified codebase precedent.
- Pitfalls: HIGH — classic-script-import, linkedom-TreeWalker, and context-menu-nesting pitfalls are all confirmed (run/read this session) rather than assumed.
- Open questions: MEDIUM — A1/A4/A6 are genuine product/design choices for the planner/user.

**Research date:** 2026-06-22
**Valid until:** 2026-07-22 (stable domain; MV3 APIs + in-repo patterns change slowly)
