# Phase 14: UX / Quality Hardening + Vision Settings - Pattern Map

**Mapped:** 2026-06-21
**Files analyzed:** 9 (all MODIFIED — this phase extends existing surfaces, creates no new modules)
**Analogs found:** 9 / 9 (every touch-point has an in-file analog to extend)

This phase adds NO new files. Every decision lands inside an existing surface and copies a
pattern already living in that same file. The "analog" is therefore usually a sibling
branch/function in the file being edited.

**Governing law (applies to EVERY excerpt below):** IMG-02 textContent-only. Every OCR'd /
translated / user-visible string is assigned via `textContent` through the `el()` helper
(`panel-render.ts:71-81`) — NEVER `innerHTML`. Copy buttons, the `[hime N]` number, the
CJK note, and the failure-reason text are all bound by this. The `el()` helper is the
single sanctioned text-assignment path; new renderers must route through it.

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `src/panel-render.ts` | component (renderer) | transform (state→DOM) | its own `entryEl` `populated`/`no-text`/`error` branches | exact (extend in place) |
| `src/types.ts` | model (types) | n/a | existing `ImageEntry` union + `ImageResult` + `languageToIso` | exact |
| `src/providers/vision-google.ts` | provider/service | request-response | `ocr()` + `postJson()` error path | exact |
| `src/image-resolve.ts` | utility (pure math) | transform | `downscaleTarget` / `VISION_LONG_EDGE` / `SUPPORTED_IMAGE_MIME` | exact |
| `src/background.ts` | service (worker) | request-response | `processImageJob` (~L360) job-map + `deriveImageEntry` calls | exact |
| `src/content.ts` | content-script | event-driven | `progAddBadge` (L1080), `startProgressive` gate (L1382-1395) | exact |
| `src/progressive-guard.ts` | utility (pure guards) | event-driven | `isEligibleSize` / `createBudget` guard factories | role-match |
| `src/sidepanel.ts` | component (page host) | event-driven | `onMessage` listener + `loadEntries` | exact |
| `src/sidepanel.css` | config (styles) | n/a | `.panel-badge.amber` / `.panel-error` / `.panel-no-text` | exact |
| `src/options.ts` | controller (UI) | request-response | `testVisionKey` handler (L350-382) — VERIFY ONLY | exact |

## Pattern Assignments

### `src/panel-render.ts` — D-01 copy + show-original, D-02 failure card, D-03 CJK note, D-04 `[hime N]` (component, transform)

**Analog:** the `entryEl` switch, especially the `populated` branch (lines 107-135) and the
`error` branch (lines 143-150). All four decisions extend `entryEl`.

**Text-assignment law — the ONLY sanctioned path** (lines 71-81). Every new string goes through this:
```typescript
function el(doc: Document, tag: string, opts: { text?: string; className?: string } = {}): HTMLElement {
  const node = doc.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.text !== undefined) node.textContent = opts.text;  // textContent, never innerHTML
  return node;
}
```

**D-01 copy button + show-original** — append to the `populated` branch (after line 133). Use
`navigator.clipboard.writeText(entry.result.translatedText)` on the STORED string (the same
string already rendered via textContent, line 124). The button label/feedback ("Copy" → "Copied")
is itself a textContent swap. The "show original" toggle gates the existing `panel-original` div
(line 126-128) — render it collapsed and reveal on click; its own copy path uses
`entry.result.originalText`. Keep markup minimal (Claude's Discretion). NOTE: `panel-render.ts`
is Document-injected and node-tested — `navigator.clipboard` is browser-only, so the click
HANDLER wiring belongs behind a guard or in `sidepanel.ts`; the button NODE is built here.

**D-02 distinct failure card** — extend the existing `error` branch (lines 143-150). It already
emits a distinct `panel-error` card with `data-error-kind` and a textContent message:
```typescript
case 'error': {
  const row = el(doc, 'div', { className: 'panel-entry panel-error' });
  row.setAttribute('data-entry-id', entry.id);
  row.setAttribute('data-error-kind', entry.errorKind);          // reason is structural
  if (entry.thumbnailUrl) row.appendChild(thumbnailEl(doc, entry.thumbnailUrl));
  row.appendChild(el(doc, 'div', { text: entry.message, className: 'panel-message' }));
  return row;
}
```
D-02 wants this card visually DISTINCT from `no-text` (lines 136-142, neutral/muted). The split
already exists at the type+render level — the work is (a) a reason-naming `message` (sourced from
the worker's classified error, see vision-google + background below) and (b) CSS divergence
(amber/red error vs muted no-text) in sidepanel.css. Do NOT collapse the two branches.

**D-03 per-result CJK note** — a new conditional append inside the `populated` branch, mirroring
the `lowConfidence` badge pattern (lines 130-133):
```typescript
if (entry.lowConfidence) {
  row.appendChild(el(doc, 'span', { text: 'low confidence', className: 'panel-badge low-confidence amber' }));
}
```
Add a sibling `if (entry.<cjkFlag>) row.appendChild(el(doc, 'div', { text: 'vertical/CJK text — OCR may be imperfect', className: 'panel-note' }))`. The flag is a new field on the
populated entry (see types.ts). textContent-only via `el()`.

**D-04 `[hime N]`** — render the number on EVERY entry kind (it correlates the badge to the row).
Best placement: a small `el(doc, 'span', { text: \`[hime ${entry.himeNum}]\`, className: 'panel-num' })`
prepended in `entryEl` regardless of kind. Number is a new entry field carried from the worker
(stable, dedup-keyed — see background.ts). The on-image badge counterpart is `content.ts:1097`.

---

### `src/types.ts` — extend `ImageEntry` / `ImageResult` (model)

**Analog:** the existing `ImageEntry` discriminated union (lines 108-115) and `ImageResult`
(lines 91-102). Pattern: add OPTIONAL fields so legacy/persisted entries never break (see the
`target?` precedent, line 113, and its rationale comment).

New optional fields to add (planner finalizes names):
- `himeNum?: number` on the populated/no-text/error variants (D-04 stable per-image number).
- A CJK/vertical flag on the `populated` variant (D-03) — e.g. `verticalOrCjk?: boolean`, set by
  the worker from the Vision response script/orientation hint (Claude's Discretion on the signal).
- The error variant already carries `errorKind` + `message` (line 115) — D-02 reuses these, no
  new field needed; just richer `message` text from the worker.

**Comparison helper for D-05:** `languageToIso(displayName)` (lines 398-403) is the existing
display-name→ISO normalizer. D-05's `<html lang>` vs stored target comparison should reuse/extend
this — normalize both sides to a base ISO subtag before comparing (planner decides the exact
BCP-47 region/script stripping rule, per Claude's Discretion).

---

### `src/providers/vision-google.ts` — D-02 reason source + D-03a limit surfacing (provider)

**Analog:** `postJson()` error path (lines 163-171) already extracts Google's reason and attaches
`.kind`/`.status` to the thrown Error — this IS the D-02 failure-copy source (the `fb9395e`
Google-reason surfacing the CONTEXT references):
```typescript
if (!response.ok) {
  const errBody = await response.json().catch(() => ({}));
  const bodyMessage = (errBody as { error?: { message?: string } })?.error?.message;
  const c = classifyError('google', null, { status: response.status, bodyMessage });
  const e = new Error(c.message);
  (e as Error & { kind?: string; status?: number }).kind = c.kind;
  (e as Error & { kind?: string; status?: number }).status = c.status;
  throw e;
}
```
D-02 work: ensure the classified message names the reason ("Vision auth failed", "image too
large", etc.). The auth case is also pre-empted in `background.ts:380-389` (no-key → auth error
entry). D-03a "image too large" should surface as this same classified-error → error entry path,
never a raw/opaque throw.

**D-03a downscale tuning** lives in `image-resolve.ts` (see below), not here — this provider just
sends the already-guarded bytes (`background.ts:394` calls `downscaleAndGuard` before `ocr()`).

---

### `src/image-resolve.ts` — D-03a downscale/limit tuning (pure utility)

**Analog:** `VISION_LONG_EDGE = 2048` (line 17), `downscaleTarget` (lines 57-59), and
`SUPPORTED_IMAGE_MIME` (lines 22-29). D-03a = "tune the VIS-03 downscale limits so large images
send reliably." These constants ARE the VIS-03 limits. The header comment already flags
`LOW_CONFIDENCE_THRESHOLD` as "Revisited in Phase 14" (line 11) — the same revisit applies here.
```typescript
export const VISION_LONG_EDGE = 2048;  // keep base64 JSON under Vision's 10MB / 75M-px caps
export function downscaleTarget(width, height) { return targetDimensions(width, height, VISION_LONG_EDGE); }
```
D-03a: derive new caps from Google's PUBLISHED limits (≤10 MB JSON request, ≤75M-px OCR, supported
MIME) and real large-image behavior — NOT guessed values (Claude's Discretion / explicit in
CONTEXT). When still over-limit after downscale, the guard should raise a classified "image too
large" error that flows to the D-02 error entry (via `background.ts` catch, lines 420-433).

---

### `src/background.ts` — D-04 numbering assignment + D-02 error entry (worker service)

**Analog:** the job-map helpers (lines 133-147) and `processImageJob`'s `deriveImageEntry` +
`setJob` + `pushEntry` flow (lines 373-433).

**D-04 number — stable, dedup-keyed.** The `himeImageJobs` storage.session map
(`IMAGE_JOBS_KEY`, line 118) keyed by `dedupKey` is the anchor. Assign `himeNum` when a job is
FIRST created (the `loading` entry, line 373), persist it on the entry, and carry it through every
subsequent `setJob`/`deriveImageEntry` for that key so a re-scroll/replay (lines 366-371) reuses
the SAME number — never renumbers. Counter source (Claude's Discretion): a monotonic counter in
the same storage.session map alongside the jobs, incremented only on first-create. The worker
passes `himeNum` into `deriveImageEntry` (extend `DeriveImageEntryInput` in image-resolve.ts) and
into the `progressiveBadge`/`openImagePanel` relay so `content.ts` can label the on-image badge
identically (`[hime N]`).

**D-02 error entries** already flow correctly here (lines 420-433): provider `.kind` + `.message`
→ `deriveImageEntry({ error })` → `error` ImageEntry. The auth-not-configured pre-empt
(lines 380-389) is the same pattern. D-02 just needs the messages to NAME the reason and the
panel/CSS to render them distinctly from no-text.

**testVisionKey handler** (~line 721) — VERIFY ONLY for SC#1. Confirm the worker probe exercises
Vision (and that the SC#1 wording — Vision + Translation through the worker — matches what the
test actually calls; note `vision-google.ts:115-133` `testConnection` now probes Vision ONLY since
translation moved to the LLM pipeline). Reconcile SC#1 wording vs current behavior; do not re-plan
the UI.

---

### `src/content.ts` — D-04 badge label + D-05 language gate (content-script, event-driven)

**Analog (D-04 badge):** `progAddBadge` (lines 1080-1113). It already builds a textContent-only
on-image badge and wires badge-click → `openImagePanel`:
```typescript
badge.textContent = '[hime]'; // textContent only (T-13-06)   ← becomes `[hime ${n}]`
...
badge.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'openImagePanel', payload: { dedupKey: srcKey } } as Message);
});
```
D-04: change `'[hime]'` to `[hime ${n}]` where `n` is the worker-assigned, dedup-keyed number
delivered via the `progressiveBadge` message (extend its payload, types.ts:305-310). Keep
textContent-only.

**Analog (D-05 gate):** the `startProgressive` invocation points (lines 1382-1395) and the pure
guard factories in `progressive-guard.ts`. D-05 is a SIBLING guard evaluated BEFORE progressive
fires — i.e. before `startProgressive()` runs (or as an early return inside it):
```typescript
chrome.storage.local.get(['himeSettings'], (result) => {
  const s = (result.himeSettings || {}) as Record<string, unknown>;
  if (s.progressiveEnabled === true) startProgressive();   // ← add page-language gate here
});
```
D-05a detection = `document.documentElement.lang` (free, no API call). Compare against the stored
`targetLanguage` (normalize via `languageToIso`, types.ts). If page lang === target, or lang is
missing/ambiguous → DEFAULT OFF (do not call `startProgressive`). D-05b: this gate is progressive-
ONLY; the right-click `translateImage` path (background.ts:360, separate entry) is untouched and
always works.

---

### `src/progressive-guard.ts` — D-05 pure comparison (pure utility)

**Analog:** `isEligibleSize` (lines 49-51) and the guard-factory doctrine (header lines 1-7: pure,
no chrome.*/document, proven once, imported by both content + worker). D-05's language comparison
should live here as a pure function (e.g. `shouldGateByLanguage(pageLang, targetLang): boolean`)
mirroring `isEligibleSize`'s pure-predicate shape, so it is node-testable and reused identically
on both sides of the boundary. The `<html lang>` read itself stays in `content.ts` (it touches
`document`); only the COMPARISON math lives here.

---

### `src/sidepanel.ts` — D-01 copy handler wiring (component host)

**Analog:** the `onMessage` listener (lines 96-129), which already wires browser-only behavior
(scrollIntoView for `openImagePanel`) on top of the DOM-agnostic renderer. The copy-button CLICK
handler (browser-only `navigator.clipboard`) belongs here or via a delegated listener on `mount`,
since `panel-render.ts` must stay node-testable (no `navigator`). Pattern: build the button node
in `panel-render.ts`; attach/delegate the clipboard click in this browser-only host.

---

### `src/sidepanel.css` — D-02 distinct failure card, D-03 note, D-04 number (config)

**Analog:** `.panel-badge.amber` (lines 135-141), `.panel-error .panel-message` (lines 183-190),
and `.panel-no-text .panel-message` (lines 177-179). The error vs no-text visual split already
exists (red `#c5221f`/`#fce8e6` error box vs muted italic no-text). D-02 = make sure the failure
card reads as clearly-broken (amber/red) and is unmistakable next to the muted no-text card.
New classes to add following these tokens: `.panel-note` (D-03 CJK caveat — small, muted, like
`.panel-direction` line 93-97), `.panel-num` (D-04 `[hime N]` — small monospace chip, mirror the
content-script badge style content.ts:1084-1096), and a copy-button style (minimal).

---

### `src/options.ts` — VIS-02 verification only (controller)

**Analog / target:** `testVisionKey` (lines 350-382). Per CONTEXT, VIS-02 is ALREADY landed
(`0a07344`, `fb9395e`, `269316a`) — Phase 14 is VERIFY-ONLY. Confirm the worker-mediated test
(payload-less, key read from storage, T-12-01) satisfies SC#1's "Vision + Translation through the
background worker" wording, OR reconcile the SC#1 wording with the current Vision-only probe
(translation now runs through the LLM pipeline, not the Google key). Do NOT re-plan the key UI.

## Shared Patterns

### textContent-only rendering (IMG-02 law)
**Source:** `src/panel-render.ts:71-81` (`el()` helper).
**Apply to:** D-01 copy button/feedback, D-02 reason text, D-03 CJK note, D-04 `[hime N]` (both
panel and on-image badge). Every user-visible string assigned via `textContent`/`el()`, never
`innerHTML`. On-image badge precedent: `content.ts:1097` (`badge.textContent = '[hime]'`).

### Worker-mediated boundary (T-12-01)
**Source:** `src/options.ts:350-382` (testVisionKey) + `src/background.ts:373-433` (processImageJob).
**Apply to:** All OCR/translate/test calls. Keys read from `storage` in the worker, NEVER in a
message payload, never logged. D-05's language read stays content-side (free `<html lang>`), no
worker round-trip needed.

### Dedup-keyed durable state (Pitfall 5)
**Source:** `src/background.ts:118-147` (`IMAGE_JOBS_KEY` storage.session map keyed by `dedupKey`).
**Apply to:** D-04 stable numbering — the number lives in/alongside this map keyed by dedupKey so a
replay (lines 366-371) reuses it. Panel rebuild reads the same map (`sidepanel.ts:40-45`).

### Optional-field type extension (never break legacy entries)
**Source:** `src/types.ts:113` (`target?` on populated entry + its rationale comment).
**Apply to:** D-04 `himeNum?`, D-03 CJK flag — add as OPTIONAL fields so persisted storage.session
entries from prior sessions still render.

### Classified-error → distinct entry (IMG-05 / D-02)
**Source:** `src/providers/vision-google.ts:163-171` → `src/background.ts:420-433` →
`src/image-resolve.ts:208-226` (`deriveImageEntry`) → `src/panel-render.ts:143-150`.
**Apply to:** D-02 failure honesty and D-03a oversized-image failure. Never a silent/opaque blank.

### Pure-guard factory doctrine
**Source:** `src/progressive-guard.ts:1-7` header + `isEligibleSize` (49-51).
**Apply to:** D-05 language comparison — pure, node-testable, no chrome.*/document, shared by
content + worker. The `<html lang>` DOM read stays in content.ts; the comparison is pure.

## No Analog Found

None. Every Phase 14 decision extends an existing in-file pattern; no greenfield module is created.

## Metadata

**Analog search scope:** `src/` (panel-render, types, providers/vision-google, image-resolve,
background, content, progressive-guard, sidepanel.ts/.css, options) + 14-CONTEXT.md.
**Files scanned:** 11
**Pattern extraction date:** 2026-06-21
