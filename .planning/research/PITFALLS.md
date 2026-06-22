# Pitfalls Research

**Domain:** Cloud image OCR + translation in an existing Chrome MV3 (BYOK, no-backend) extension — hime v1.3
**Researched:** 2026-06-20
**Confidence:** HIGH (Chrome SW lifecycle, contextMenus, sidePanel, Claude Vision, Google Vision limits all verified against current official docs; cost math computed from published per-image pricing)

> Scope: pitfalls **specific to adding** right-click image OCR+translate + opt-in progressive
> (IntersectionObserver) auto-translate + side-panel output to hime's existing MV3 architecture
> (background SW owns all API calls; content script owns DOM/UX; BYOK key never on the page).
> Phases start at **12**. Phase assignments below are recommendations for the roadmapper.

---

## Critical Pitfalls

### Pitfall 1: Progressive viewport mode = one paid API call per image, per scroll, forever

**What goes wrong:**
Progressive mode wires an `IntersectionObserver` to every `<img>` and fires an OCR+translate call when each enters the viewport. On a media-heavy page (news site, Pinterest, a manga reader, an image search results grid) that is dozens to hundreds of paid calls. Worse: the user scrolls down, images leave the viewport, the observer un-observes/re-observes, the user scrolls back up, and **the same images get re-translated** because there is no completed-job cache. Cost and the user's BYOK rate limit both blow up silently — the user sees no running total and gets a surprise bill / 429 storm.

Concrete cost (verified pricing): Claude Vision on a 1920×1080 image ≈ **$0.0047/image (~$4.68 per 1,000 images)**; Google Vision OCR ≈ **$1.50/1k images** + Translation v3 **$20/M chars**. A single scroll through a 200-image gallery in progressive mode is real money on every provider, and re-scroll multiplies it.

**Why it happens:**
The naive IntersectionObserver pattern treats "entered viewport" as "translate now" with no idempotency layer. Developers reuse the v1.2 search mental model (one user action → one batch) but progressive mode is event-driven and unbounded — the *page*, not the user, decides how many calls fire.

**How to avoid:**
- **Default OFF** (already decided) — progressive is strictly opt-in.
- **Dedup cache keyed by image identity**, not by DOM node. Key = hash of the resolved image bytes (or `src` + natural dimensions as a cheap proxy). A completed/in-flight key is never re-requested — this directly kills re-scroll re-translation. (Mirror the v1.2 SRCH-06 in-flight-dedup decision — it is the same pattern.)
- **Per-page budget**: a hard cap (e.g. N images/page; suggest 20–30) after which progressive stops and shows "limit reached — use right-click to translate more." Reset on navigation.
- **Concurrency cap**: a small worker-side queue (e.g. 2–3 in flight) so a fast scroll can't open 50 parallel fetches+API calls. Queue, don't fan out.
- **Eligibility filter before spending**: skip tiny images (icons/spacers < ~64px), `1x1` trackers, sprites, and already-translated nodes. OCR on a favicon is pure waste.
- **Debounce/settle**: only translate images still intersecting after a short dwell (e.g. 400–600ms) so fast scroll-through doesn't trigger anything.
- **Running cost/count surface**: show images-translated-this-page (and ideally an est. spend) so the user sees the meter moving.

**Warning signs:**
Network tab shows API calls firing continuously while scrolling; the same `src` requested twice; provider returns 429; test page with a 50-image grid produces 50+ calls; no upper bound on calls per page.

**Phase to address:** **Phase 13 (Progressive mode)** owns budget/dedup/concurrency/debounce. The dedup+in-flight map itself should live in the **worker job layer (Phase 12)** so right-click also benefits from idempotency.

---

### Pitfall 2: Cross-origin image bytes can't be fetched / canvas is tainted

**What goes wrong:**
The content script tries to read pixels (`canvas.toDataURL()` / `getImageData()`) from a cross-origin `<img>` that lacks CORS headers → the canvas is **tainted** and throws a `SecurityError`. Or the worker `fetch(img.src)` fails because the host blocks hotlinking / requires cookies / the URL is behind auth. Or the `src` is a `data:` or `blob:` URL that isn't fetchable the same way as `https:`. Result: progressive/right-click silently fails on exactly the cross-origin images that are most common in the wild.

**Why it happens:**
Developers assume "I can see the image, so I can read its bytes." Browser CORS/tainted-canvas rules say otherwise. `blob:` URLs are origin-scoped and `data:` URLs need decoding not fetching. The hotlink case isn't visible until tested on real third-party-hosted images.

**How to avoid:**
- **Route the byte fetch through the service worker**, which (with `host_permissions`) is not bound by page CORS the way a content-script `fetch` or a canvas read is (per Chrome's cross-origin-requests doc — source #5). Send the resolved URL to the worker; the worker fetches the bytes.
- **Multi-strategy resolver** in priority order: (a) worker `fetch(src)` → bytes; (b) for `data:`/`blob:` already-inlined bytes, pass directly (decode `data:`; for `blob:` read in the content script via `fetch(blobUrl).blob()` since blob URLs are page-origin-scoped, then hand bytes to the worker); (c) **fallback to `chrome.tabs.captureVisibleTab` + crop to the image's bounding rect** when bytes are unfetchable/tainted (source #6) — this is the canonical escape hatch for cross-origin/tainted images.
- **Validate before sending**: check MIME (JPEG/PNG/WebP/GIF — intersect what the chosen provider accepts; Google also takes BMP/TIFF/ICO, Claude does not) and size. Reject/branch unsupported MIME with a clear message rather than a provider 400.

**Warning signs:**
`SecurityError: Tainted canvases may not be exported`; worker fetch returns 403/opaque; works on same-origin test images but fails on Imgur/CDN-hosted ones; `data:`/`blob:` images do nothing.

**Phase to address:** **Phase 12 (right-click pipeline)** — the byte-resolver + captureVisibleTab fallback + MIME/size validation is the foundational pipeline both modes share.

---

### Pitfall 3: Image exceeds provider size/dimension limits → 400 or silent downscale of dense text

**What goes wrong:**
A full-res photo (e.g. 6000×4000, 12MB) is sent as base64 and the provider rejects it, or auto-downscales it so aggressively that small/dense text becomes unreadable and OCR returns garbage. Verified limits:
- **Claude API direct:** max **10MB base64**, max **8000×8000px**; but Claude internally downsamples to **≤2576px long edge** (Opus 4.8). Base64 inflates bytes ~33%, so a ~7.5MB image is already at the wall. >20 images/request triggers a *stricter* per-image pixel cap (rejected as "many-image requests").
- **Google Vision:** file **≤20MB**, but **JSON request ≤10MB** (so inline base64 effectively caps lower); **OCR max 75,000,000 px**; recommends **≥1024×768** for OCR.

So both ends bite: too big → rejected/over-JSON-limit; over-downscaled → dense CJK/manga text degrades.

**Why it happens:**
Developers send `img.src` bytes as-is. They don't account for base64's 33% inflation against the JSON/size limit, and they don't realize the provider's internal downscale can destroy the very text they're trying to read.

**How to avoid:**
- **Pre-flight size/dimension check** in the worker before the call; reject or pre-resize.
- **Client-side downscale to the provider's sweet spot** (≈1568–2576px long edge for Claude; keep base64 well under 10MB / Google's 10MB JSON limit). Resizing *before* upload also cuts token cost (Claude bills by 28×28 patches) and latency.
- **Don't over-shrink dense text**: bias toward the higher native res for OCR (Google explicitly wants ≥1024px; manga/CJK needs more, not less). There's tension between "fit the limit" and "keep text legible" — resolve per-image, not with one global scale.
- **Per-request image cap**: keep right-click to 1 image; if a future batch sends many, stay ≤20 to avoid Claude's stricter many-image pixel limit.

**Warning signs:**
`invalid_request_error` mentioning size or "many-image requests"; HTTP 400 from Google for oversized JSON; OCR confidence collapses on high-res photos; small-font text returns empty/wrong.

**Phase to address:** **Phase 12** (resize/validate is part of the shared pipeline). Re-verify legibility for CJK/manga in **Phase 14 (UX/quality hardening)**.

---

### Pitfall 4: MV3 service worker sleeps mid-request → in-flight image jobs are lost

**What goes wrong:**
Image OCR+translate is slower than text translation (image upload + vision inference). The MV3 worker has hard limits (verified): **terminates after 30s idle**, a **single request can't exceed 5 minutes**, and it **terminates if a `fetch()` stalls >30s**. If the worker sleeps while a job is queued (e.g. progressive queued 5 images, only 2 in flight), the queued jobs and any in-memory state **vanish** — globals are wiped on shutdown. The content script's IntersectionObserver may also keep firing messages at a **dead worker**; the first message wakes it but in-flight continuations from the previous life are gone. Symptom: images stick on "translating…" forever; the side panel never updates.

**Why it happens:**
Teams hold the job queue, dedup map, and partial results in **worker global variables** (fine for fast v1.2 text calls, fatal for slow image batches). They assume the worker stays alive for the duration of a multi-image scroll session.

**How to avoid:**
- **Persist job state** (queue, dedup/completed map, partial results) in `chrome.storage.session` / IndexedDB, not globals — so a respawned worker resumes (Chrome's explicit guidance: "design for resilience against unexpected termination").
- **Keep each individual job under the 30s-fetch / 5-min ceilings**; downscale to cut latency; set an explicit per-call timeout shorter than 30s and treat timeout as a retryable failure, not a hang.
- **Make the worker idempotent & message-driven**: each IntersectionObserver hit sends a message that (re)wakes the worker, which reads persisted state and continues — never assume the worker that started a job finishes it.
- **No `setInterval`/long-lived timers** to "keep alive"; drive everything off events + persisted state.
- **Reconcile on wake**: on `onStartup`/first message, re-emit results for any jobs that completed-but-undelivered, and re-queue any `in-flight` left dangling.

**Warning signs:**
Jobs stuck "translating…" with nothing in the network tab; results appear only on the *next* user action (worker was asleep); state lost after ~30s of no scrolling; works in a fast manual test, fails on a slow scroll session.

**Phase to address:** **Phase 12** (durable job/dedup state + per-call timeout in the worker pipeline). Stress-tested under scroll in **Phase 13**.

---

### Pitfall 5: Sending arbitrary page images to a cloud API silently (privacy/security)

**What goes wrong:**
Progressive mode, if it ever defaulted on (or if opt-in is buried), would ship **every image the user scrolls past** — including private/sensitive content (medical records in a patient portal, a bank statement screenshot, photos in a DM, an internal company dashboard) — to a third-party cloud vision API **without the user realizing**. Even right-click is a privacy event: the user's image bytes leave the browser. This is a trust-breaking, potentially compliance-relevant data exfiltration if done silently.

**Why it happens:**
Convenience bias: "auto-translate everything" feels like a great feature. The privacy cost of *which* images get uploaded is invisible at build time and only obvious when a user notices their bank page got OCR'd.

**How to avoid:**
- **Progressive default OFF** (decided) + a **clear opt-in with an explicit warning** when enabling: "This sends images on pages you visit to [provider]'s cloud. Don't enable on pages with sensitive content." First-enable confirmation, not a silent toggle.
- **Per-site scoping**: progressive should be enable-per-site / pause-on-this-site, not a global firehose. Respect an allowlist/denylist; never run on `chrome://`, the extension's own pages, or obvious sensitive hosts.
- **Right-click stays the safe default path** — explicit, one image, user-initiated; no opt-in needed.
- **Visible activity indicator** when progressive is uploading (so it's never truly silent).
- **BYOK key never touches the page**: all provider calls stay in the worker (existing hime invariant — preserve it; do **not** inject the key into content-script context or pass it through `chrome.scripting`). The image bytes flow content→worker; the key + API call stay worker-side.
- **No logging of image bytes / OCR text** to anywhere persistent beyond what the side panel needs.

**Warning signs:**
Progressive toggle has no warning copy; it's a single global switch with no per-site control; key referenced anywhere in content-script or page context; uploads happen with zero UI feedback.

**Phase to address:** **Phase 13 (progressive mode)** owns the opt-in warning + per-site scoping + activity indicator. The **key-stays-in-worker** invariant is enforced in **Phase 12** and must be a review checklist item.

---

## Moderate Pitfalls

### Pitfall 6: contextMenus duplicate-id error on every worker restart

**What goes wrong:**
`chrome.contextMenus.create({ id: 'hime-translate-image' })` called at the top level of the worker (or on each message) throws **"Cannot create item with duplicate id"** after the worker respawns, because the menu already persists from the prior life. The menu entry intermittently disappears or floods `runtime.lastError`.

**Why it happens:**
Developers register the menu in module top-level code, which re-runs every time the SW restarts — but context menus persist across restarts, so the second `create()` collides.

**How to avoid:**
- **Register inside `chrome.runtime.onInstalled`** (runs once per install/update), not at top level. Optionally `chrome.contextMenus.removeAll()` then `create()` inside `onInstalled` for idempotency.
- Keep the **`onClicked` listener** registered at top level (listeners must re-attach on every wake) — but the `create()` call must not.
- Use a stable `id`; route by `info.menuItemId` in the click handler. Scope the menu to `contexts: ['image']` so it only appears on `<img>`.

**Warning signs:** `Unchecked runtime.lastError: Cannot create item with duplicate id`; menu item vanishes after extension sits idle then is reused.

**Phase to address:** **Phase 12** (context-menu entry point).

---

### Pitfall 7: Side panel can't auto-open in progressive mode (user-gesture requirement)

**What goes wrong:**
`chrome.sidePanel.open()` **may only be called in response to a user action** (verified). A right-click → context-menu click **qualifies**, so manual mode can open the panel. But progressive mode is driven by IntersectionObserver — **no user gesture** — so calling `open()` there silently fails. Devs wire progressive to "pop the panel when a translation is ready" and it just doesn't open.

**Why it happens:**
The gesture requirement isn't obvious; it works in manual testing (which always involves a click) and fails only in the gesture-less progressive path.

**How to avoid:**
- **Manual (Phase 12):** call `sidePanel.open()` directly inside the `contextMenus.onClicked` handler — valid gesture.
- **Progressive (Phase 13):** do **not** auto-open. Instead, **buffer results and badge the toolbar action / panel** ("3 translations ready"); the user opens the panel via the action click (a valid gesture). Or require the panel to be opened once before progressive will populate it.
- Use `sidePanel.setOptions({ enabled: true })` to make it available, but gate the actual `open()` behind real gestures. Declare the `"sidePanel"` permission.

**Warning signs:** Panel opens on right-click but never on auto-translate; `open() may only be called in response to a user action` error in progressive path.

**Phase to address:** **Phase 12** (panel + manual open), **Phase 13** (progressive buffering/badge instead of auto-open).

---

### Pitfall 8: No-text / low-confidence / wrong-language-detection produce confident garbage

**What goes wrong:**
- Image has **no text** (a logo, a photo of scenery): OCR returns empty or hallucinated text, which gets "translated" into nonsense.
- **Low-confidence OCR** on noisy/stylized text is passed straight to translation as if correct.
- **Wrong source-language auto-detection** (Vision/Claude guesses EN for a Japanese sign) → mistranslation.
- **Vertical / CJK / manga text degrades** — a *known gap* (SOURCES.md: no vendor publishes vertical-CJK guidance). Reading order for vertical text and speech-bubble layout is frequently scrambled.
- **Partial batch failure**: in a multi-image scroll, image 4 fails but the user can't tell which results are missing.

**Why it happens:**
The pipeline assumes "OCR text exists, is correct, and is in the expected language." Vertical/manga is outside what the cloud vendors optimize for. Confidence scores get ignored.

**How to avoid:**
- **"No text found" is a first-class result**, not an error or a blank — show it explicitly so the user isn't left waiting.
- **Surface confidence** where the provider gives it (Google Vision returns per-symbol confidence); below a threshold, label the result "low confidence — may be inaccurate" rather than presenting it as authoritative.
- **Show the OCR'd source text alongside the translation** (decided: original + translation in panel) — lets the user sanity-check detection/OCR themselves; this is the cheapest mitigation for wrong-language and bad-OCR.
- **Let the user override source language** (use hime's existing source/target setting as a hint to the provider) instead of trusting auto-detect blindly.
- **For CJK/vertical, set expectations + document the gap**: Claude single-call tends to preserve reading order better in prose than Google's word-boxes do for vertical text, but neither is manga-grade. Don't promise manga quality this milestone (the OSS manga stack is explicitly deferred per SOURCES.md).
- **Per-image error isolation**: one failed image shows a per-item error in the panel; the batch continues (mirror v1.2's count-assertion / never-blank philosophy).

**Warning signs:** Translations of text-free images; garbled vertical-text output; confident output from blurry source; a batch where some images silently never appear.

**Phase to address:** **Phase 12** (no-text/low-confidence/per-item error states in the result contract), deeper **CJK/vertical quality + source-override UX in Phase 14**.

---

## Minor Pitfalls

### Pitfall 9: Missing `host_permissions` / wrong permission model for worker image fetch

**What goes wrong:** The worker's `fetch(imageUrl)` to an arbitrary third-party host fails because the extension lacks `host_permissions` for that host; or the team over-asks with `<all_urls>` and triggers a scary install prompt / Web-Store review friction.
**How to avoid:** Decide the permission model deliberately — `host_permissions` broad enough to fetch image bytes anywhere progressive runs, vs `activeTab` + captureVisibleTab for a more privacy-friendly, prompt-light right-click path. Add `"sidePanel"` and `"contextMenus"` to the manifest. Prefer the narrowest set that works; lean on captureVisibleTab to avoid broad host grants where possible.
**Phase to address:** **Phase 12** (manifest/permissions).

### Pitfall 10: Re-translating identical images across pages / no cross-page cache invalidation
**What goes wrong:** The same CDN image appears on many pages and is re-OCR'd each time; or a cache keyed on URL serves a stale translation after the image at that URL changed.
**How to avoid:** Key the cache on content hash (not just URL) for correctness; optionally a short-TTL cross-page cache to cut cost without serving stale content. Scope explicitly per milestone — a per-page cache is the minimum; cross-page is an enhancement.
**Phase to address:** **Phase 13**.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hold job queue/dedup in worker globals | Fast to build, matches v1.2 | Lost on SW sleep → stuck jobs (Pitfall 4) | **Never** for progressive; tolerable only for a single synchronous right-click call that completes in one wake |
| Dedup keyed on DOM node or bare `src` | Trivial | Re-scroll re-translates; URL-collisions serve stale (Pitfalls 1, 10) | MVP right-click only; **must** move to content-hash before progressive ships |
| Send image bytes at native resolution | No resize code | 400s, JSON-limit overflow, token-cost blowup, downscale ruins dense text (Pitfall 3) | Never — resize is cheap and pays for itself |
| Auto-open side panel from progressive | "It just appears" | Silent failure (gesture rule, Pitfall 7) | Never — buffer + badge instead |
| Global progressive toggle, no warning/per-site | One switch, simple | Silent exfiltration of sensitive images (Pitfall 5) | Never — opt-in + warning is a hard requirement |
| `removeAll()`+`create()` on every message | "Always fresh menu" | Wasteful, races; duplicate-id noise | Never — use `onInstalled` |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Claude Vision | Sending >10MB base64 / >20 images at full res | Resize ≤~2576px long edge, base64 well under 10MB, ≤20 images/request, downscale before upload |
| Google Vision | Inline base64 over the **10MB JSON** limit; ignoring `DOCUMENT_TEXT_DETECTION` vs `TEXT_DETECTION` | Keep JSON <10MB (resize or GCS); pick `DOCUMENT_TEXT_DETECTION` for dense text, `TEXT_DETECTION` for signs/photos (source #2); pair with Translation v3 |
| Google Translation v3 | Forgetting the project/location path or char billing | Use GA v3 `TranslateText`; track chars against $20/M (500k/mo free) for the budget meter |
| chrome.contextMenus | `create()` at SW top level → duplicate-id | `create()` in `onInstalled`; `onClicked` at top level; `contexts: ['image']` |
| chrome.sidePanel | `open()` without a user gesture (progressive) | `open()` only in gesture handlers; buffer+badge otherwise |
| chrome.tabs.captureVisibleTab | Forgetting it captures *visible viewport only*, needs crop, and needs `activeTab`/host perm | Use as cross-origin/tainted fallback; crop to the image rect; scroll image into view first |
| Worker `fetch` of image bytes | Doing it in the content script (CORS/tainted) | Fetch in the SW with `host_permissions` (source #5); content script only for `blob:` reads |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Unbounded progressive fan-out | Continuous API calls while scrolling; 429s | Concurrency cap (2–3) + debounce + per-page budget | A page with >~20 images |
| Re-scroll re-translation | Same `src` requested repeatedly | Content-hash dedup / completed-map | Any up-down scroll |
| Native-res uploads | High latency, token-cost spike, JSON-limit 400s | Downscale before upload | High-res photos / 4K images |
| Worker sleep mid-batch | Jobs stuck "translating…" | Persist queue to storage.session/IDB; per-call timeout | Slow scroll / >30s idle |
| Tiny-image OCR | Calls on favicons/spacers | Min-size eligibility filter | Pages full of icons |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Silent upload of all scrolled images | Exfiltration of sensitive/private images to cloud | Default OFF + explicit opt-in warning + per-site scope + activity indicator (Pitfall 5) |
| BYOK key reaching page/content context | Key theft by hostile page JS | Key + provider call stay in worker; only bytes cross content→worker (existing hime invariant) |
| Running progressive on chrome:// / extension / known-sensitive hosts | Capturing internal UI | Host denylist; never on privileged/own pages |
| Logging OCR'd text or image bytes | Persisting user-sensitive content | No persistent logging of image/OCR payloads |
| Over-broad `<all_urls>` host_permissions | Larger attack surface + scary prompt | Narrowest perms; prefer activeTab+captureVisibleTab for manual path |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Text-free image returns blank/garbage | Confusion, no feedback | Explicit "no text found" state |
| No running cost/count in progressive | Surprise bill / 429 | Visible images-translated + est. spend meter |
| Auto-opening panel fails silently | "It's broken" | Buffer + toolbar badge "N ready"; open on click |
| Low-confidence shown as authoritative | User trusts wrong translation | Confidence label + show OCR source text |
| Vertical/CJK reading order scrambled | Manga/sign output is nonsense | Show original alongside; set expectations; defer manga-grade |
| Partial batch failure invisible | User doesn't know what's missing | Per-item error rows; never silently drop |
| No "stop/pause" for progressive | Runaway calls, no control | Per-site pause + stop button |

## "Looks Done But Isn't" Checklist

- [ ] **Progressive dedup:** verify scrolling an image out and back in does **not** re-call the API (content-hash key, not DOM node)
- [ ] **Per-page budget:** verify a 50-image test page stops at the cap, not at 50 calls
- [ ] **Worker resilience:** verify a queued job survives a forced SW termination (kill worker in DevTools mid-batch, confirm resume)
- [ ] **Cross-origin images:** verify a CDN/Imgur-hosted image works (not just same-origin); confirm captureVisibleTab fallback triggers on tainted/unfetchable bytes
- [ ] **`data:`/`blob:` URLs:** verify both resolve to bytes
- [ ] **Oversize image:** verify a 6000×4000 / >10MB image is resized, not 400'd
- [ ] **contextMenus:** verify no duplicate-id error after letting the worker idle-terminate then re-clicking
- [ ] **sidePanel gesture:** verify manual right-click opens the panel; verify progressive does **not** call `open()` (badges instead)
- [ ] **Opt-in warning:** verify enabling progressive shows the sensitivity warning, and a per-site pause exists
- [ ] **Key isolation:** grep that the API key never enters content-script/page context
- [ ] **No-text & low-confidence:** verify both render explicit states, not blanks
- [ ] **Partial failure:** verify one failed image in a batch shows a per-item error and others still appear

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Cost blowup shipped (no budget/dedup) | MEDIUM | Add worker-side budget+concurrency+content-hash dedup; hotfix progressive to OFF until patched |
| Jobs lost on SW sleep | MEDIUM | Move queue/dedup/results to storage.session/IDB; add reconcile-on-wake |
| Silent uploads / no opt-in warning | HIGH (trust) | Force progressive OFF, ship opt-in warning + per-site scope before re-enabling; disclose in changelog |
| Tainted-canvas failures on cross-origin | LOW | Add captureVisibleTab+crop fallback path |
| Oversize 400s | LOW | Add pre-flight resize/validate in worker |
| contextMenus duplicate-id | LOW | Move `create()` into `onInstalled` |
| Panel won't auto-open | LOW | Replace `open()` in progressive with badge+buffer |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Progressive cost/rate blowup | **13** (budget/concurrency/debounce); dedup map seeded in **12** | 50-image test page caps calls; re-scroll = 0 new calls |
| 2. CORS / tainted canvas / data:/blob: | **12** | CDN-hosted + data:/blob: images translate; captureVisibleTab fallback fires |
| 3. Oversize / over-downscale | **12** (resize/validate); CJK legibility recheck **14** | 6000×4000 image resized not 400'd; CJK text still legible |
| 4. SW sleep loses in-flight jobs | **12** (durable state + timeout); scroll stress **13** | Killing worker mid-batch resumes jobs |
| 5. Silent privacy exfiltration | **13** (opt-in/warning/per-site); key invariant **12** | Enable shows warning; per-site pause works; key never in page |
| 6. contextMenus duplicate-id | **12** | No duplicate-id after idle-terminate + re-click |
| 7. sidePanel gesture / auto-open | **12** (manual open), **13** (badge) | Right-click opens; progressive badges, never errors |
| 8. No-text/low-conf/CJK/partial-fail | **12** (result contract), **14** (CJK + source override) | Explicit no-text/low-conf states; per-item errors |
| 9. host_permissions / manifest | **12** | Worker fetch works; minimal prompt |
| 10. Cross-page cache / stale | **13** | Content-hash keying; no stale serve |

## Sources

- Chrome — Service worker lifecycle (idle 30s, 5-min request cap, 30s fetch-stall termination, globals wiped, "design for resilience"): https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle — HIGH
- Chrome — chrome.contextMenus (duplicate-id, runtime.lastError, register in onInstalled pattern): https://developer.chrome.com/docs/extensions/reference/api/contextMenus — HIGH
- Chrome — chrome.sidePanel (`open()` only on user action; valid via contextMenus.onClicked): https://developer.chrome.com/docs/extensions/reference/api/sidePanel — HIGH
- Chrome — Cross-origin network requests (route fetches through SW + host_permissions) — SOURCES.md #5 — HIGH
- Chrome — tabs.captureVisibleTab (screenshot fallback for tainted/cross-origin) — SOURCES.md #6 — HIGH
- Claude — Vision: 10MB base64 / 8000×8000 max, ≤2576px native downscale (Opus 4.8), 28×28 patch token cost (~$0.0047 per 1080p image), ≤20 images before stricter pixel cap, 32MB request limit: https://platform.claude.com/docs/en/build-with-claude/vision — HIGH
- Google Vision — supported files: ≤20MB file, **10MB JSON limit**, 75M-px OCR cap, ≥1024×768 recommended for OCR, formats: https://docs.cloud.google.com/vision/docs/supported-files — HIGH
- Google Vision — TEXT_DETECTION vs DOCUMENT_TEXT_DETECTION — SOURCES.md #2 — HIGH
- Google Translation v3 — TranslateText, $20/M chars, 500k/mo free — SOURCES.md #3 — MEDIUM
- hime v1.2 prior art — SRCH-06 in-flight dedup; count-assertion never-blank; three-stage progressive render — `.planning/PROJECT.md` — HIGH

---
*Pitfalls research for: cloud image OCR+translation in MV3 (hime v1.3)*
*Researched: 2026-06-20*
