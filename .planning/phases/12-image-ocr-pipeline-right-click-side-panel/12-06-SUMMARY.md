---
phase: 12-image-ocr-pipeline-right-click-side-panel
plan: 06
subsystem: image-ocr-side-panel-page
tags: [side-panel, browser-only, mv3, storage-session, push-driven, image-ocr, xss-safe]
requires:
  - renderPanel(state, doc, mount)        # Plan 04
  - prependEntry(entry, doc, mount)       # Plan 04
  - ImageEntry / ImageState               # Plan 01
  - "ImageEntry.target (populated)"       # Plan 04
  - "storage.session himeImageJobs map"   # Plan 05
  - "worker push { type:'translateImage', payload:{ entry } }"  # Plan 05
  - "getSettings → { settings }"          # background.ts
provides:
  - src/sidepanel.html
  - src/sidepanel.css
  - src/sidepanel.ts
  - "side-panel page: rebuild-on-open + live prepend listener (IMG-02/03/05)"
affects:
  - "manifest side_panel.default_path → sidepanel.html (declared Plan 05) now resolves"
  - "Plan 07 manual checkpoint (real open/render/push verification)"
tech-stack:
  added: []
  patterns:
    - "Browser-only page entry (chrome.*/document) — clone of search.ts, NOT node-tested"
    - "Rebuild durable list from storage.session on open (Pitfall 5) — never blank a restarted worker"
    - "Push-driven divergence: runtime.onMessage → prependEntry skeleton→result swap (D-01)"
    - "Explicit error entry on storage/listener failure — no silent blank (IMG-05 / T-12-17)"
    - "textContent-only rendering delegated entirely to panel-render.ts (no innerHTML in the page)"
key-files:
  created:
    - src/sidepanel.html
    - src/sidepanel.css
    - src/sidepanel.ts
  modified: []
decisions:
  - "storage.session rebuild order: the worker keys himeImageJobs by dedupKey (an object, no insertion-order guarantee for true recency), so loadEntries() renders Object.values(map).reverse() as a best-effort newest-first. Live pushes thereafter prepend precisely via prependEntry (D-01), so ongoing recency is exact; only the cold-open ordering of pre-existing entries is heuristic."
  - "getSettings is read independently for the global target language (D-03) and applied as a defensive fallback (withTarget) only when a populated entry lacks its own entry.target — the worker already stamps entry.target on fresh jobs (Plan 05), so the panel never renders a blank '→ ' direction side."
  - "The onMessage handler is synchronous and returns nothing (no `return true`) — the panel only consumes pushes, it never replies, so it must not hold the message channel open."
metrics:
  duration: ~8m
  completed: 2026-06-21
  tasks: 2
  files: 3
  commits: 2
---

# Phase 12 Plan 06: Image-OCR Side Panel Page Summary

Built the user-facing side-panel surface for the image-OCR pipeline — `sidepanel.{ts,html,css}`, a near-clone of `search.{ts,html,css}` with the v1.2 page-wiring pattern. On open it reads the global target language via `getSettings` (D-03), rebuilds the session list from `chrome.storage.session` so a slept/restarted MV3 worker never blanks the panel (Pitfall 5 / IMG-05), and registers a `chrome.runtime.onMessage` listener that PREPENDs each worker push or swaps a loading skeleton for its filled result (D-01). All rendering is delegated to Plan 04's `panel-render.ts` (textContent-only), so the page itself contains no `innerHTML`. The CSS preserves OCR breaks via `white-space: pre-wrap` and styles the amber low-confidence badge.

## What Was Built

- **`src/sidepanel.html`** — clone of `search.html` minus the search-form / query input / direction toggle (the panel has no query). Keeps the doctype/head/viewport, `<link rel="stylesheet" href="sidepanel.css">`, the `<div id="results">` mount, a `role="status" aria-live="polite"` `#panel-status` line, the settings link, and `<script type="module" src="sidepanel.js">`.
- **`src/sidepanel.css`** — clone of `search.css` container/header/settings-link tokens, narrowed for the side-panel surface, plus the full `panel-render.ts` class set: `.panel-entry`, `.panel-thumb`, `.panel-direction`, `.panel-translation`/`.panel-original` (both on `.panel-text.pre-wrap`), the `.panel-skeleton` shimmer, `.panel-message`/`.panel-no-text`, `.panel-error`, and `.panel-empty`. **D-02:** `.pre-wrap { white-space: pre-wrap }` so textContent newlines survive. **D-04:** `.panel-badge.low-confidence.amber` amber chip. `prefers-reduced-motion` honoured on the skeleton shimmer.
- **`src/sidepanel.ts`** — browser-only page entry (clone of `search.ts` header doctrine; references `chrome.*`/`document`, intentionally NOT node-tested):
  - `DOMContentLoaded` → resolve `#results`, bail gracefully if absent (clone of search.ts:106-120).
  - Read `getSettings` once for the global `targetLanguage` (D-03), default-safe on worker unavailability.
  - `loadEntries()` reads `chrome.storage.session` `himeImageJobs` (the `{ [dedupKey]: ImageEntry }` map written by Plan 05's worker), maps it newest-first, and calls `renderPanel` with `{kind:'list', entries}` (or `{kind:'empty'}` when none). A read failure renders an explicit error entry — never a blank (IMG-05 / T-12-17).
  - `chrome.runtime.onMessage` listener: on `{ type:'translateImage', payload:{ entry } }`, `prependEntry(entry, document, mount)` adds a new skeleton/result at the top OR swaps the matching `data-entry-id`'s loading skeleton for its populated/no-text/error result (D-01). Wrapped in try/catch — a malformed push surfaces an error entry, not a silent blank.
  - `withTarget()` stamps the global target language onto a `populated` entry that lacks its own `entry.target` (D-03 defensive fallback).
  - Settings link → `chrome.runtime.openOptionsPage()` (clone of search.ts:178-185).

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | sidepanel.html + sidepanel.css (clone of search.html/css) | 50cd456 | src/sidepanel.html, src/sidepanel.css |
| 2 | sidepanel.ts page wiring (clone of search.ts) | 8d38e2c | src/sidepanel.ts |

## Verification

- **Task 1** — `npm run build` (tsc + copy-assets) clean; `dist/sidepanel.html` has `#results`, the module script, the css link, and `aria-live`; `dist/sidepanel.css` has `white-space: pre-wrap` and an amber badge. PASS.
- **Task 2** — `npm test` 155 pass / 1 skip / 0 fail (sidepanel.ts compiles under strict tsc but is browser-only, so it is not node-tested per the plan's `<verification>`). `dist/sidepanel.js` source assertions: `DOMContentLoaded`, `getSettings`, `storage.session`, `onMessage`, `prependEntry`, `openOptionsPage` all present. PASS.
- Real open / render / push / pre-wrap / amber-badge behavior is verified in **Plan 07's manual checkpoint** (not node-testable here, per the plan).

## Deviations from Plan

None affecting scope. The plan executed as written. Two implementation notes (not scope changes):

- **storage.session rebuild ordering** is best-effort newest-first (`Object.values(map).reverse()`): the worker's `himeImageJobs` is keyed by `dedupKey` with no insertion-order guarantee for cold-open recency. Live pushes thereafter prepend exactly via `prependEntry` (D-01), so ongoing recency is precise; only the ordering of pre-existing entries on a cold open is heuristic. Documented as a decision, not a deferred item.
- **getSettings fallback** (`withTarget`): the worker already stamps `entry.target` on fresh populated entries (Plan 05), so the panel's `getSettings` read of the global target language is applied only as a defensive fallback for entries missing their own target — guaranteeing the "Detected: X → Y" line never renders a blank Y (D-03).

## Threat Model Coverage

- **T-12-16** (Tampering / XSS on pushed/stored entries): the page sets no `innerHTML` — all rendering goes through `panel-render.ts` `el()` (textContent-only, proven in Plan 04). The page only reads typed `ImageEntry` fields and forwards them to `renderPanel`/`prependEntry`. ✓
- **T-12-17** (Spoofing / silent failure): every failure path — getSettings unavailable, storage.session read error, malformed/listener push — is caught and either degrades to defaults or renders an explicit error entry; rebuild-from-storage.session on open means a worker restart shows persisted results, never a blank. ✓
- **T-12-18** (Information disclosure / key handling): the panel reads `getSettings` only for the target-language display name and renders entries; it never reads or transmits `googleApiKey`. ✓

No new security surface beyond the plan's `<threat_model>`.

## Known Stubs

None. The page is wired end-to-end against the real Plan 04 renderer and the Plan 05 worker push / storage.session contract. Source scan of `sidepanel.{ts,html,css}` found no `innerHTML`, no `TODO`/`FIXME`/`placeholder`/`coming soon`, no hardcoded empty-data sinks.

## Self-Check: PASSED

- FOUND: src/sidepanel.html
- FOUND: src/sidepanel.css
- FOUND: src/sidepanel.ts
- FOUND: dist/sidepanel.html, dist/sidepanel.css, dist/sidepanel.js (build artifacts)
- FOUND commit 50cd456 (Task 1 — html/css)
- FOUND commit 8d38e2c (Task 2 — sidepanel.ts)
- `npm run build` clean; `npm test` 155 pass / 1 skip / 0 fail; both assertion suites green.
