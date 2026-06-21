---
phase: 12-image-ocr-pipeline-right-click-side-panel
plan: 04
subsystem: side-panel-renderer
tags: [renderer, dom-agnostic, xss-safe, tdd, image-ocr]
requires:
  - src/types.ts (ImageState, ImageEntry, ImageResult — Plan 01)
  - src/panel-mock.ts (IMAGE_RESULT_POPULATED, XSS_PROBE — Plan 01)
provides:
  - renderPanel(state, doc, mount)
  - prependEntry(entry, doc, mount)
  - ImageEntry.target (optional, for the "Detected: X → Y" line)
affects:
  - src/sidepanel.ts (Plan 06 — imports renderPanel/prependEntry)
  - src/sidepanel.css (Plan 06 — styles .panel-* classes incl. .pre-wrap, .amber)
tech-stack:
  added: []
  patterns:
    - "DOM-agnostic renderer (Document injected, never global) — serp-render.ts clone"
    - "textContent-only XSS guard via el(); thumbnail via img.src; never innerHTML"
    - "exhaustive discriminated-union switch with const _never: never default"
    - "D-01 prepend accumulation (mount.prepend + same-id replaceWith) vs replaceChildren"
key-files:
  created:
    - src/panel-render.ts
  modified:
    - test/panel-render.mjs
    - src/types.ts
decisions:
  - "Class names satisfy the Plan 01 RED scaffold selectors: .panel-entry, .pre-wrap/.panel-text, .amber/.low-confidence. Text nodes carry BOTH a semantic class (.panel-translation/.panel-original) and the .panel-text.pre-wrap pair so the scaffold's OR-selectors and the D-02 break-preservation both hold."
  - "Added optional ImageEntry.target (Rule 2): the 'Detected: X → Y' line (IMG-03) needs the resolved target name, which no existing entry field carried. Optional so legacy/loading/no-text/error entries are unaffected."
  - "prependEntry dedups by data-entry-id: a same-id push (skeleton → result) replaces in place rather than duplicating (Pitfall 5 durable-state swap)."
metrics:
  duration: ~12m
  completed: 2026-06-21
  tasks: 2
  files: 3
  commits: 3
---

# Phase 12 Plan 04: Side-Panel Renderer Summary

TDD-built `src/panel-render.ts` — a DOM-agnostic, textContent-only renderer for the image-OCR side-panel session list: per-entry states (loading / populated / no-text / low-confidence amber / error), thumbnail → "Detected: X → Y" → translation-above-original layout (D-02), OCR breaks preserved via a pre-wrap class, and D-01 newest-first prepend accumulation.

## What Was Built

- **`renderPanel(state, doc, mount)`** — clears then renders an `ImageState`. `empty` → a first-open zero-state notice; `list` → each entry top-to-bottom (entries arrive newest-first, D-01). Exhaustive `switch` with a `const _never: never` default so a missing state is a compile error.
- **`prependEntry(entry, doc, mount)`** — `mount.prepend(node)` for a new result (D-01). If an entry with the same `data-entry-id` already exists (a skeleton being filled), it `replaceWith`s in place — no duplication. This is the per-push worker→panel path and the skeleton→result swap.
- **`entryEl(doc, entry)`** (internal) — one node per `ImageEntry.kind`:
  - `loading` → `.panel-entry.panel-loading` skeleton.
  - `populated` → `.panel-entry` with (in DOM order) thumbnail `<img>` → `.panel-direction` ("Detected: {detectedLang} → {target}") → `.panel-translation.panel-text.pre-wrap` → `.panel-original.panel-text.pre-wrap`, plus a `.panel-badge.low-confidence.amber` when `lowConfidence` (D-04).
  - `no-text` → explicit "No text found in image." message (IMG-05, never blank).
  - `error` → `.panel-error` row carrying the message + `data-error-kind` (IMG-05).
- **`el()` helper** — copied verbatim from `serp-render.ts`: sets `textContent` (never `innerHTML`). This is the actual XSS guard (T-12-09). Thumbnail src via `img.src`, `alt=''` (faviconEl precedent).
- **`ImageEntry.target?`** (types.ts) — added optional field for the resolved direction-line target.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 (RED) | Failing panel-render tests (7 cases) | 37f4d68 | test/panel-render.mjs |
| 2 (GREEN) | Implement panel-render.ts | 67f22fc | src/panel-render.ts, src/types.ts |

The Plan 01 scaffold (`test/panel-render.mjs`) was fleshed out from 4 to 8 tests covering all seven planned cases: populated DOM order (D-02), break preservation (IMG-03), low-confidence badge present/absent (D-04), explicit no-text + per-entry error states (IMG-05), D-01 prepend (newest-first + same-id swap), and the XSS_PROBE inert-text proof (IMG-02).

## Verification

- `npm run build` (tsc + copy-assets): clean, exit 0 — full strict typecheck passes including the `ImageEntry.target` addition.
- `node --test test/panel-render.mjs`: **8 pass / 0 fail.**
- XSS proof (T-12-09): an `XSS_PROBE` translation/original renders as inert text — `mount.querySelector('img[src="x"]')` is null, no `<script>` injected, payload present as textContent.
- Spoofing/silent-failure (T-12-10): every entry kind renders an explicit node; the exhaustive `never` default makes a missing state a compile error — never a silent blank.

## Deviations from Plan

### Auto-added (Rule 2 — missing functionality required for correctness)

**1. [Rule 2] Added optional `ImageEntry.target` field**
- **Found during:** Task 2.
- **Issue:** The "Detected: X → Y" direction line (IMG-03, D-02) needs the resolved target-language name as Y. The `populated` `ImageEntry` carried `result.detectedLang` (the X) but no target. Rendering only X would fail the test's arrow assertion and miss IMG-03.
- **Fix:** Added `target?: string` to the `populated` variant in `src/types.ts` — optional, so loading/no-text/error/legacy entries are unaffected and `migrateSettings`-style spreads stay valid. The panel/worker (Plan 06) supplies it; rendered verbatim via textContent.
- **Files modified:** src/types.ts
- **Commit:** 67f22fc

### Class-name reconciliation (no rule — design note)

The Plan 01 RED scaffold pinned `.panel-entry`, `.pre-wrap`/`.panel-text`, `.amber`/`.low-confidence`; the PLAN prose suggested `.hime-entry*` names. The scaffold is the shipped binding contract, so I used the scaffold's names. Text nodes carry both a semantic class (`.panel-translation`/`.panel-original`) and the scaffold's `.panel-text.pre-wrap`, satisfying both the scaffold selectors and D-02. Plan 06's `sidepanel.css` must style `.panel-*` (notably `.pre-wrap { white-space: pre-wrap }` and `.amber`).

## Out-of-Scope (other plans' subjects — not deferred work for this plan)

The full `npm test` run shows 6 failures from `test/vision-google.mjs` (Plan 02 subject `dist/providers/vision-google.js`) and `test/image-resolve.mjs` (Plan 03 subject `dist/image-resolve.js`). These subjects do not exist in this worktree (parallel-wave isolation) — they are Nyquist-rule RED tests that go GREEN when their own plans merge. Not touched (scope boundary). This plan's 8 tests are all GREEN and the typecheck passes.

## Self-Check: PASSED

- FOUND: src/panel-render.ts
- FOUND: test/panel-render.mjs (modified)
- FOUND: src/types.ts (modified)
- FOUND: dist/panel-render.js (build artifact)
- FOUND commit 37f4d68 (test/RED)
- FOUND commit 67f22fc (feat/GREEN)

## TDD Gate Compliance

- RED gate: `test(12-04): ...` commit `37f4d68` — tests failed (subject absent: ERR_MODULE_NOT_FOUND on dist/panel-render.js).
- GREEN gate: `feat(12-04): ...` commit `67f22fc` — 8/8 pass after implementation.
- REFACTOR: none needed.
