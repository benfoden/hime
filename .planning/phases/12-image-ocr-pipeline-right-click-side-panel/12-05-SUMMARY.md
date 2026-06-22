---
phase: 12-image-ocr-pipeline-right-click-side-panel
plan: 05
subsystem: image-pipeline-worker-controller
tags: [vision, ocr, worker, context-menu, side-panel, mv3, storage-session, byok]
requires:
  - GoogleVisionProvider
  - "VisionProvider.ocrTranslate no-text sentinel (null)"
  - downscaleTarget
  - needsReencode
  - stripBase64Prefix
  - deriveImageEntry
  - classifyError
  - recordUsage
  - "Settings.googleApiKey"
  - TranslateImageMessage
  - ImageEntry
provides:
  - "case 'translateImage' (background onMessage switch)"
  - "chrome.contextMenus 'hime-translate-image' (onInstalled)"
  - "chrome.contextMenus.onClicked → sidePanel.open-first gesture"
  - "resolveImageBytes byte-resolution ladder (worker)"
  - "downscaleAndGuard OffscreenCanvas MIME-guard + downscale (worker)"
  - "storage.session durable job/dedup/result map (himeImageJobs)"
  - "runImageJob async pipeline + worker→panel push"
  - "visionProvider module-scope instance"
affects:
  - src/background.ts
  - manifest.json
tech-stack:
  added: []
  patterns:
    - "MV3 durable state: job/dedup/result in chrome.storage.session, not a global Map (Pitfall 5)"
    - "sidePanel.open() as the FIRST synchronous statement inside the gesture, before any await (Pitfall 1)"
    - "contextMenus registered in onInstalled via removeAll-then-create (Pitfall 6 duplicate-id)"
    - "Byte-resolution ladder resolves pixels in the worker (fetch / captureVisibleTab), never a tainted page canvas (Pitfall 2 / T-12-13)"
    - "OffscreenCanvas downscale + convertToBlob re-encode are SW-only; the dimension MATH is imported pure from image-resolve (Pattern law)"
    - "Outer ~25s Promise.race ceiling over the provider's own per-call 12s timeouts; AbortError → classifyError network"
key-files:
  created:
    - .planning/phases/12-image-ocr-pipeline-right-click-side-panel/12-05-SUMMARY.md
  modified:
    - src/background.ts
    - manifest.json
decisions:
  - "dedupKey is a djb2 content-key over info.srcUrl (imageDedupKey) — used as BOTH the storage.session map key and the panel entry id (D-01). The right-click context exposes no reliable dimensions, so srcUrl is the identity; same image right-clicked twice replays the cached entry without re-billing."
  - "The onClicked listener owns the dedupKey computation and gesture-first open; the 'translateImage' message case is a secondary replay/(re-)run path so the message contract is complete and Plan 06's panel can query a durable entry by dedupKey."
  - "thumbnailUrl on every entry is set to srcUrl (the original image URL) so the panel can show a thumbnail without a second resolution; for data:/blob: this is the inline/object URL."
  - "Populated entries carry entry.target = settings.targetLanguage (display name) for the panel's 'Detected: X → Y' direction line; detectedLang (source) already comes from the provider's ImageResult."
metrics:
  duration: ~25 min
  completed: 2026-06-21
  tasks: 2
  files_changed: 2
---

# Phase 12 Plan 05: Image Pipeline Worker Controller Summary

Wired the image OCR+translate pipeline into the background service worker and manifest — the manual vertical slice's controller (IMG-01/04/05/07, VIS-03). A right-click on an `<img>` shows "Translate image with hime"; clicking it opens the side panel synchronously inside the gesture, then runs the async pipeline: resolve image bytes in the worker (fetch → data:/blob: passthrough → captureVisibleTab fallback), MIME-guard + downscale via OffscreenCanvas to Vision limits, OCR+translate through the Plan 02 provider behind a ~25s timeout, and persist every job/dedup/result to `chrome.storage.session` so a slept MV3 worker never hangs the panel. The BYOK `googleApiKey` is read from storage in the worker only — never in a message, never logged.

## What Shipped

- **Task 1 — manifest deltas + contextMenus + sidePanel gesture (`cc68652`, `116644f`):**
  - `manifest.json` (`cc68652`): added `contextMenus` + `sidePanel` permissions; added the two Google hosts (`vision.googleapis.com`, `translation.googleapis.com`) + `<all_urls>` to `host_permissions` (the SW image fetch; `content_scripts` already declared `<all_urls>`, so the install prompt is unchanged); added top-level `side_panel.default_path: "sidepanel.html"` (the panel itself ships Plan 06).
  - `src/background.ts` (`116644f`): extended the EXISTING `onInstalled` listener to ALSO register the menu via `chrome.contextMenus.removeAll(() => create({ id:'hime-translate-image', title:'Translate image with hime', contexts:['image'] }))` (kept the badge behavior; not at module top level — Pitfall 6). Added a top-level `chrome.contextMenus.onClicked` listener that calls `chrome.sidePanel.open({ tabId })` as the FIRST synchronous statement (no preceding await — Pitfall 1), computes a `dedupKey`, then `void runImageJob(...)`. Added the `GoogleVisionProvider` import + a module-scope `const visionProvider = new GoogleVisionProvider()` (mirroring `braveClient`), plus the `translateImage`/`ImageEntry`/`ImageResult` type imports and the `image-resolve` math imports.
- **Task 2 — translateImage case + byte ladder + downscale + durable session state (`116644f`):**
  - `resolveImageBytes(srcUrl, tabId)` — the IMG-04 ladder: (a) `data:` → strip prefix + parse inline MIME; (b) `fetch(srcUrl)` under `<all_urls>` → blob → chunked base64 + `blob.type`; (c) on fetch failure OR a `blob:` URL → `chrome.tabs.captureVisibleTab(windowId, { format:'png' })`, strip the data: prefix. Pixels are always resolved in the worker, never via a tainted page canvas (Pitfall 2 / T-12-13).
  - `downscaleAndGuard(base64, mime)` — VIS-03: decodes via `createImageBitmap` from a Blob, uses Plan 03's pure `downscaleTarget` for the cap, draws into an `OffscreenCanvas`, `convertToBlob`s exotic MIME to PNG (else keeps the codec), and re-encodes; fast-passes a supported in-bounds image. Un-decodable formats throw a typed error (`kind:'unknown'`) so the entry shows an explicit error, never a blank (IMG-05).
  - `storage.session` durable map (`himeImageJobs`): `getJobs`/`getJob`/`setJob` over `{ [dedupKey]: ImageEntry }` — survives MV3 termination (Pitfall 5). Dedup: a finished entry is replayed (no re-bill); an in-flight `loading` entry is not restarted.
  - `runImageJob(srcUrl, tabId, dedupKey)`: writes `loading` + pushes it; reads `googleApiKey` from storage (empty → auth error entry, IMG-07); resolves bytes → guards → `Promise.race([ocrTranslate, timeout(25000, AbortError)])`; maps the `null` sentinel → no-text entry (Pitfall 4), success → `recordUsage('google-vision', usage)` + populated entry (with `entry.target` for the direction line), any throw → `classifyError('google', err)` error entry. Always persists + pushes the FINAL entry — never leaves it on `loading`.
  - `case 'translateImage'` in the switch: reads `googleApiKey` from storage only (auth error if empty, never from payload, never logged); replays a finished durable entry by `dedupKey` (no re-bill) or (re-)runs the job for a fresh `{ srcUrl, tabId, dedupKey }`. The case is the secondary replay/(re-)run path; the onClicked gesture is the primary trigger.
  - `imageDedupKey(srcUrl)` — djb2 content-key used as both the map key and the panel entry id.
  - `pushEntry(entry)` — `chrome.runtime.sendMessage({ type:'translateImage', payload:{ entry } })` worker→panel push, catch-guarded (no panel may be listening; storage.session is the source of truth).

## Deviations from Plan

### Auto-fixed Issues

None affecting behavior. One minor task-boundary reattribution (not a code deviation):

- The plan assigns the `onInstalled` menu registration and the `onClicked` gesture to Task 1 and the helper/case set to Task 2, but both live in `src/background.ts` and Task 1's `npm run build` verify cannot compile while referencing `runImageJob`/`imageDedupKey` (defined in Task 2). To keep each commit independently building, `manifest.json` is committed alone as Task 1 (`cc68652`) and the entire `src/background.ts` change — menu + gesture wiring AND the pipeline it calls — is committed as one coherent compile unit as Task 2 (`116644f`). No scope was added or dropped; only the commit boundary for the background.ts wiring shifted.

## Threat Model Coverage

- **T-12-11** (googleApiKey disclosure): read via `settings.googleApiKey` in `runImageJob` and the `translateImage` case ONLY; auth-error entry/response if empty; never accepted from the payload; never logged. ✓
- **T-12-12** (SSRF via SW fetch): only the user-selected `info.srcUrl` is fetched (not arbitrary worker input); bytes are MIME-guarded + size-capped (`downscaleAndGuard`) before send; no attacker-chosen redirect-following added. ✓
- **T-12-13** (tainted-canvas pixel read): pixels resolved via `fetch` or `captureVisibleTab` in the SW — never a tainted content-script canvas. ✓
- **T-12-14** (MV3 sleep mid-job): job/dedup/result in `storage.session`; ~25s `Promise.race` → typed error entry; panel rebuilds from `storage.session` on open. ✓
- **T-12-15** (oversized image): `downscaleAndGuard` enforces the VIS-03 long-edge/MIME limits before send. ✓
- **T-12-SC** (package installs): none this plan (no dep changes). ✓

No new security surface beyond the plan's `<threat_model>`.

## Known Stubs

None. The pipeline is wired end-to-end against the real Plan 02 provider and Plan 03 math. The worker→panel push (`pushEntry`) targets the panel that ships in Plan 06; until then storage.session is the durable source of truth and the push is a no-op-safe notification (catch-guarded). The manifest references `sidepanel.html`, created in Plan 06 — declaring it now is required for the `sidePanel.open()` gesture to resolve and is intentional, not a stub.

## Verification

- `npm run build` — tsc clean (strict, no `any` escape hatches; the few typed-error casts mirror the existing provider/searchTranslated pattern).
- Task 1 manifest assertions: `contextMenus` + `sidePanel` permissions, `<all_urls>` + `vision.googleapis.com` hosts, `side_panel.default_path === 'sidepanel.html'`, `hime-translate-image` + `sidePanel.open` present in `dist/background.js`. PASS.
- Task 2 source assertions: `case 'translateImage'`, `googleApiKey`, `storage.session`, `captureVisibleTab`, `OffscreenCanvas`, `ocrTranslate`, `recordUsage('google-vision')` all present. PASS.
- `npm test` — full suite 155 pass / 1 skip / 0 fail.
- End-to-end browser behavior (real gesture/open/fetch/capture/OffscreenCanvas) is verified in Plan 07's manual checkpoint — not node-testable here (per the plan's `<verification>`).

## Notes for Downstream Plans

- **Plan 06 (panel):** listen for `chrome.runtime.sendMessage({ type:'translateImage', payload:{ entry } })` and swap the matching skeleton by `entry.id` (= `dedupKey`). On panel open, rebuild the list from `chrome.storage.session.get('himeImageJobs')` (a `{ [dedupKey]: ImageEntry }` map) so a worker restart never blanks the panel. Populated entries carry `entry.target` (target display name) and `entry.result.detectedLang` (source) for the "Detected: X → Y" line.
- The `translateImage` message case accepts `{ srcUrl, tabId, dedupKey }` and either replays a finished durable entry (responds `{ entry }`) or (re-)runs (responds `{ accepted: true }`); empty key responds `{ error, kind:'auth' }`. A re-translate button in the panel can re-run by sending a fresh dedupKey.
- Cropping precision for the `captureVisibleTab` fallback is intentionally coarse (visible-tab capture used as-is) — Phase 14 polish (RESEARCH Open Question 3).

## Self-Check: PASSED

- FOUND: src/background.ts (modified)
- FOUND: manifest.json (modified)
- FOUND: .planning/phases/12-image-ocr-pipeline-right-click-side-panel/12-05-SUMMARY.md
- FOUND commit cc68652 (Task 1 — manifest)
- FOUND commit 116644f (Task 2 — background pipeline)
- `npm run build` clean; `npm test` 155 pass / 1 skip / 0 fail; both assertion suites green.
