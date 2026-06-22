# Feature Research

**Domain:** Browser extension — inline keyboard-driven translation/composition tool + translated search + image-text translation
**Researched:** 2026-05-24 (v1.0) / 2026-06-02 (v1.2 Translated Search) / 2026-06-20 (v1.3 Image Translation addendum)
**Confidence:** HIGH (v1.0 shipped; v1.2 HIGH for SERP/API shape; v1.3 HIGH for table-stakes/anti-features, MEDIUM for cost/dedup/cache control specifics)

---

## v1.3 Image Translation — Feature Landscape

> NEW for v1.3: OCR + translate text inside **images**, surfaced as text in a **side panel**. Two triggers: right-click context menu on `<img>` (manual), and opt-in **progressive** viewport auto-translate (default OFF). Cloud vision via BYOK, routed through the background worker.
>
> **Scope locked:** side-panel TEXT output only. No in-image overlay, no inpainting, no manga/vertical-CJK craft, no OpenAI/Azure providers — those are anti-features / out-of-scope below, not deferred niceties.
>
> Confidence: HIGH for table-stakes/anti-features (corroborated across Google Lens, Yandex, DeepL, Immersive Translate, OCR Translator). MEDIUM for cost/dedup/cache control specifics (vendors don't publish internals; inferred from BYOK economics + IntersectionObserver mechanics).

### Table Stakes — Image Translation (Users Expect These)

Every mainstream image translator (Google Lens, Yandex, DeepL, Immersive Translate, OCR Translator) does these. Missing any one makes hime's image mode feel broken rather than minimal.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Right-click context menu on `<img>`: "Translate image with hime" | THE discovery surface for per-image translation across every competitor (Yandex, ImageTrans, OCR Translator, DeepL). Users right-click an image and expect a translate entry. | LOW | `chrome.contextMenus.create({contexts:['image']})`; click handler gets `info.srcUrl`. Consumes NO hotkey slot (3/4 used per PROJECT). **Depends on:** background-worker image-byte fetch (host_permissions / CORS, SOURCES #5). |
| Side panel showing **both** original detected text and its translation | Google Lens "Show original" and Yandex's Original/Translation toggle confirm users want to verify against source. OCR is lossy — a wrong OCR is only visible against the original. | MEDIUM | `chrome.sidePanel` (MV3). Paired text blocks. textContent-only (reuse v1.2 XSS discipline — no innerHTML of model output). |
| Per-image loading state | Each image = one paid API round-trip (OCR+translate), latency in seconds not ms. Silence reads as "broken." | LOW | Spinner/skeleton row per image; reuse v1.2 progressive-render mindset. |
| Per-image error state with reason | Network fail, no key, unreadable image, no text found, rate-limit are all common. Red "ERR" badge pattern already exists (v1.0). | LOW | Distinguish "no text detected" (not an error) from "request failed" (retryable). **Per-image, not global** — one bad image must not blank the panel. |
| Copy translation (and copy original) | Universal: Lens "Copy text", Yandex copy icon. The point is to *use* the extracted text. | LOW | Copy buttons per result block. |
| Re-translate / retry a single image | Transient failures + OCR variance make one-shot retry expected. | LOW | Re-runs the pipeline for that image; **must bypass cache** (see Differentiators). |
| Target language reuses the existing hime setting | hime already has source/target language + swap hotkey. A second config would surprise users. | LOW | Read existing target-language setting. **Direction = detected-source → user target** — the inverse of compose mode's English→target. This asymmetry must be explicit in UI copy. |
| BYOK vision provider + key (no new key paradigm) | hime is BYOK end-to-end; a separate vision key store would surprise users. | MEDIUM | Vision key in existing settings store (`chrome.storage.local`/`.session`). Same key (Claude Vision single-call) or a distinct Google Cloud key — provider decision pending at roadmap review (PROJECT). |
| Source language auto-detect, displayed | Users translating images often don't know the source language; Lens/Yandex auto-detect. Showing detected language builds trust and explains odd output. | LOW–MEDIUM | Claude Vision infers in-prompt; Google Translate v3 returns `detectedLanguageCode`. Display "Detected: Japanese → English". |

### Differentiators — Image Translation (Competitive Advantage)

Where hime's architecture (BYOK, background worker, already-built settings) does something the mass-market tools don't, or does it more cleanly.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Opt-in progressive (viewport) auto-translate, default OFF** | Read an image-heavy page (a Japanese forum, a screenshot thread) without right-clicking each image. Default-OFF respects the per-image cost — the headline differentiator vs one-at-a-time tools. | HIGH | `IntersectionObserver` fires as images approach viewport; `rootMargin` pre-loads slightly before visible (standard pattern). Each intersect → queue an OCR+translate job. The cost/latency controls below are what make this safe rather than a money pit. |
| **Dedup of already-translated images** | On scroll the same `<img>` re-enters the viewport repeatedly; sites reuse icons/sprites. Without dedup, progressive mode bills the user N times for one image. | MEDIUM | Mark the element once observed+translated; key cache by image URL (or content hash for `data:` URIs). In-flight dedup map (reuse v1.2 SRCH-06 pattern) prevents duplicate concurrent calls for the same src. |
| **Result cache keyed by image source** | Re-seeing an image (re-enter viewport, manual re-trigger, panel reopen) should be free and instant. BYOK economics make every avoided call real money saved. | MEDIUM | Cache `{srcKey → {detectedLang, original, translation}}` in memory and/or `chrome.storage.session`. Re-translate button explicitly bypasses cache. Bound cache size to avoid unbounded growth on long sessions. |
| **Single-call OCR+translate pipeline (Claude Vision)** | One round-trip vs OCR-then-translate (Google Vision + Translation v3 = two calls, two billings, two failure points). Half the latency, half the cost surface, simpler errors. | MEDIUM | Side-panel output needs NO bbox geometry (PROJECT) — removes Google Vision's main advantage and favors the single call. FEATURES recommends single-call given side-panel-only scope; decision pending roadmap review. |
| **Multi-image batch in one panel** | A page with several images shows all results stacked — scannable, comparable, copyable in one place; differentiates from per-image popups that lose history on the next translate. | MEDIUM | Panel holds a growing list of result cards (DOM order or newest-first). Claude Vision supports multi-image input (SOURCES #4) for same-page batching later. |
| **Cost-aware progressive controls (eagerness / viewport threshold)** | Lets the user dial how aggressively progressive mode spends: "only on full visibility" vs "pre-load 200px early." Directly addresses surprise cost. | MEDIUM | Surface `IntersectionObserver` `threshold` + `rootMargin` as a simple "eagerness" setting (Conservative / Balanced / Eager). Optionally a per-session image-count cap with a "translated N images" indicator. |

### Anti-Features — Image Translation (Explicitly OUT for v1.3)

| Feature | Why Requested | Why Problematic | What to Do Instead |
|---------|---------------|-----------------|--------------------|
| **In-image overlay** (translated text on top of the image) | Lens/Yandex/Immersive do it; looks magical. | Needs bbox geometry, font/size/color matching, layout reflow, and a tainted-canvas / cross-origin pixel pipeline. Massively expands scope; explicitly out per PROJECT. Side-panel text already delivers the read-the-text value. | Side-panel paired original+translation — geometry-free, robust, XSS-safe. |
| **Inpainting** (erase original, repaint background, place translation) | The "natural overlay" wow factor from Immersive/manga tools. | SOTA is a heavy OSS stack (LaMa, comic-text-detector), not a cloud-API single call. Wrong product dimension. | None needed; out of scope. |
| **Manga / vertical-CJK special handling** | hime targets Japanese; manga seems an obvious fit. | No vendor publishes vertical-CJK OCR guidance (SOURCES "Known gap"); reliable handling needs the deferred OSS stack. High effort, niche payoff. | General OCR via cloud vision; accept reduced vertical-text quality. Revisit only if it becomes the measured bottleneck. |
| **OpenAI / Azure vision providers** | Parity with hime's existing LLM abstraction (OpenAI/Gemini/OpenRouter). | Scoped to Claude Vision and/or Google Vision+Translate this round (PROJECT/SOURCES). More providers multiply the OCR-prompt + response-shape surface before the core flow is proven. | Ship one vision provider (or the two named candidates); add abstraction later on demand. |
| **Progressive mode ON by default** | "Just works" convenience. | Every viewport image becomes a silent paid API call — surprise bills, latency, and rate-limits on the user's own key. Erodes BYOK trust instantly. | **Default OFF** (PROJECT mandate). Opt-in toggle + eagerness + dedup + cache so even when ON it's economical. |
| **Eager translate of EVERY image on the page (no viewport gating)** | Maximal coverage. | Translating off-screen / never-viewed images burns money for zero value; hammers the API on image-dense pages. | Viewport-gated (IntersectionObserver), deduped, and only when progressive mode is explicitly enabled. |
| **Freeform screen-region / drag-to-select capture** | Power-user "translate any pixels" (OCR Translator does this). | `captureVisibleTab` is a fallback for tainted/cross-origin images (SOURCES #6), not a headline feature; drag-select UI is its own sub-project. | Keep `captureVisibleTab` strictly as the byte-fetch fallback for un-fetchable `<img>`; no region UI this milestone. |

### Feature Dependencies — v1.3 Image Translation

```
[Right-click context-menu translate]  (table stakes, manual entry point)
    └──requires──> [Background-worker image-byte fetch + cloud vision call]
                       └──requires──> [BYOK vision provider + key in settings]
                       └──fallback──> [chrome.tabs.captureVisibleTab for tainted/cross-origin imgs]

[Side-panel output (original + translation)]
    └──requires──> [chrome.sidePanel wiring]
    └──requires──> [Source-language auto-detect display]
    └──requires──> [existing hime target-language setting]   (direction = detected → target)

[Progressive viewport auto-translate]  (differentiator, default OFF)
    └──requires──> [Right-click pipeline]   (same OCR+translate path, different trigger)
    └──requires──> [IntersectionObserver gating + eagerness/threshold setting]
    └──requires──> [Dedup of already-translated images]   ← without this, progressive = repeat billing
    └──requires──> [Result cache keyed by image source]
    └──requires──> [In-flight dedup map]   (reuse v1.2 SRCH-06 pattern)

[Re-translate single image] ──conflicts──> [Result cache]   (must explicitly bypass cache)
[Single-call Claude Vision] ──resolves──> [bbox-geometry need]   (side-panel needs no geometry)
```

**Dependency notes:**
- **Both triggers share one pipeline.** Context-menu (manual) and progressive (viewport) must call the *same* background OCR+translate path. Build the pipeline once; triggers are thin wrappers. Natural phase boundary: pipeline → manual trigger → progressive mode.
- **Progressive mode requires dedup + cache as hard prerequisites, not enhancements.** Progressive without dedup is a billing hazard (same image re-translated every scroll). They belong in the same phase.
- **Re-translate conflicts with cache:** the cache must be bypassable on explicit retry, else "re-translate" returns the same stale/wrong result.
- **Direction asymmetry:** compose/YOLO go English→target; image translation goes detected-source→user's reading language. The target-language setting is reused but its *meaning flips* — UI copy must make this unambiguous.
- **Geometry decision unblocks provider choice:** side-panel output needs no bounding boxes, so single-call Claude Vision loses no required capability — favoring it (decision pending roadmap review).

### MVP Definition — v1.3 Image Translation

**Launch with (v1.3 core — P1):**
- [ ] Background-worker OCR+translate pipeline (image bytes → detected text + translation) — the spine.
- [ ] Right-click context-menu "Translate image with hime" on `<img>` — primary manual entry; zero hotkey cost.
- [ ] Side panel: **original detected text + translation**, per image, stacked for multiple images.
- [ ] Source-language auto-detect, displayed ("Detected: X → Y").
- [ ] Per-image loading + error states (distinguish "no text found" from "request failed").
- [ ] Copy original / copy translation + per-image re-translate.
- [ ] BYOK vision provider + key in existing settings store; target language reused from existing setting.

**Add after validation (still v1.3, behind the toggle — P2):**
- [ ] Progressive viewport auto-translate (default OFF) — add once the manual pipeline is proven reliable and cheap.
- [ ] Dedup of already-translated images + result cache keyed by source — ship together with progressive mode.
- [ ] Eagerness / viewport-threshold setting (Conservative/Balanced/Eager) + optional per-session image-count indicator/cap.

**Future / out of this milestone (P3):**
- [ ] In-image overlay — only if side-panel text proves insufficient; needs geometry pipeline.
- [ ] Inpainting / natural overlay — wrong product dimension; defer indefinitely.
- [ ] Manga / vertical-CJK handling — only if it becomes the measured bottleneck; needs OSS stack.
- [ ] Additional vision providers (OpenAI/Azure) — only on real demand after one provider proven.
- [ ] Same-page multi-image batched into a single Claude Vision call (cost optimization) — after per-image flow is stable.

### Feature Prioritization Matrix — v1.3

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Background OCR+translate pipeline | HIGH | MEDIUM | P1 |
| Right-click context-menu translate | HIGH | LOW | P1 |
| Side panel: original + translation | HIGH | MEDIUM | P1 |
| Per-image loading/error states | HIGH | LOW | P1 |
| Copy + re-translate | MEDIUM | LOW | P1 |
| Source-language auto-detect display | MEDIUM | LOW | P1 |
| Reuse target-language + BYOK settings | HIGH | LOW | P1 |
| Progressive viewport mode (default OFF) | HIGH | HIGH | P2 |
| Dedup already-translated images | HIGH (for P2) | MEDIUM | P2 |
| Result cache keyed by source | MEDIUM | MEDIUM | P2 |
| Eagerness / viewport-threshold setting | MEDIUM | MEDIUM | P2 |
| In-image overlay | MEDIUM | HIGH | P3 (out of scope) |
| Inpainting | LOW | HIGH | P3 (out of scope) |
| Manga/vertical-CJK | LOW–MEDIUM | HIGH | P3 (out of scope) |
| Extra vision providers | LOW | MEDIUM | P3 (out of scope) |

### Competitor Feature Analysis — v1.3 Image Translation

| Feature | Google Lens / Translate | Yandex | Immersive Translate | hime v1.3 approach |
|---------|------------------------|--------|---------------------|--------------------|
| Trigger | In-app / right-click | Long-press / context menu | Right-click + upload | Right-click context menu + opt-in viewport |
| Output | In-image overlay, "Show original" toggle | Overlay, Original/Translation toggle | Overlay + inpaint | **Side panel, paired original+translation** (no overlay) |
| Auto-detect source | Yes | Yes | Yes | Yes, displayed |
| Copy text | Yes | Yes | Yes | Yes (original + translation) |
| Auto-translate on scroll | No (manual) | No (manual) | Web-image one-click, batch | **Opt-in viewport progressive, default OFF, deduped+cached** |
| Cost model | Free (Google-hosted) | Free (Yandex-hosted) | Freemium / subscription | **BYOK direct** — user pays per call, so cost controls are first-class |
| Provider | Proprietary | Proprietary | Multiple | Claude Vision (single-call) or Google Vision+Translate (pending) |
| Overlay/inpaint polish | Strong | Strong | Strong | **Deliberately none** (anti-feature) |

**Strategic takeaway:** hime can't out-polish Lens/Immersive on overlay craft and shouldn't try. Its edge is **BYOK + cost-disciplined progressive reading** — geometry-free side-panel output that's cheap, private (no key on page, all via background worker), and reuses the user's existing hime settings. Progressive mode's dedup/cache/eagerness controls are the differentiator precisely *because* the user pays per image.

### Sources — v1.3 Image Translation (2026-06-20)

- [Google Translate / Lens image translation (Show original, Copy text)](https://support.google.com/translate/answer/6142483) — HIGH
- [Google Lens replacing Translate camera, overlay behavior](https://www.androidcentral.com/apps-software/google-lens-will-replace-google-translate-camera-mode) — MEDIUM
- [Yandex image translate (context menu, Original/Translation toggle, copy)](https://yandex.com/support/translate-desktop/en/phototranslate-desktop) — HIGH
- [DeepL browser-extension image translation](https://support.deepl.com/hc/en-us/articles/21351571574044-Translate-images-with-DeepL-s-browser-extensions) — MEDIUM
- [Immersive Translate image translation (OCR + inpaint overlay, web-image one-click, batch)](https://immersivetranslate.com/docs/features/image/) — MEDIUM
- [OCR Translator (Chrome) — right-click, sidebar output, region capture](https://chromewebstore.google.com/detail/ocr-translator/cdpbhdkhlngcgpojobhaellkoidndddk) — MEDIUM
- [ImageTrans Chrome extension — translate/copy images on websites](https://github.com/xulihang/ImageTrans_chrome_extension) — MEDIUM
- [IntersectionObserver rootMargin/threshold for viewport-gated loading](https://blog.logrocket.com/lazy-loading-using-the-intersection-observer-api/) — HIGH
- Internal: `.planning/research/SOURCES.md` (Google Vision OCR, Translation v3, Claude Vision, MV3 network requests, captureVisibleTab) — HIGH
- Internal: `.planning/PROJECT.md` (scope, constraints, v1.2 patterns reused) — HIGH

---

## v1.2 Translated Search — Feature Landscape

This section covers the new extension page feature added in v1.2. The existing v1.0 inline-translation features are preserved below unchanged.

### Table Stakes — Translated Search (Users Expect These)

Features users assume exist for any search experience. Missing these = page feels broken or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Classic SERP result row: title + URL + snippet | Every search UI users have ever seen uses this 3-element format | LOW | Brave API returns `title`, `url`, `description` per result; all three must render |
| Clickable title links to the ORIGINAL (untranslated) page | User wants the source; translated title is a label, not a proxy URL | LOW | Link href = `result.url` verbatim, never a translate-proxy URL |
| Domain/hostname attribution line | "Where is this from?" is table stakes; breadcrumb URL replaced by favicon + hostname in modern SERPs | LOW | `meta_url.hostname` + `meta_url.favicon` available from Brave API; hostname as green/grey text below title |
| Visible loading state during the two async phases | Search is a two-phase pipeline: (1) query translation → (2) Brave fetch + result translation; users must see progress, not a blank page | MEDIUM | Skeleton rows during fetch; progressive fill as translations arrive per-result |
| Empty state / no-results message | If Brave returns zero results or the API key is bad, the page must say so explicitly | LOW | Simple message + suggestion to try different query or check API key |
| Query box pre-filled with user's input | Users expect to see what they typed and be able to refine it | LOW | Input persists after submit; standard search box behavior |
| Search on Enter key | Enter submits the query; a button is secondary | LOW | Standard form UX |
| Translated snippet text | The point of the feature — user should read results in their own language | MEDIUM | Translate `title` + `description` fields via existing provider layer; leave `url` and `meta_url` untouched |

### Differentiators — Translated Search

Features that make the translated search page valuable beyond a plain Brave Search iframe.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Translated query disclosure ("Searching in Japanese for: [query]") | Transparency builds trust; user knows what query ran; lets them spot bad auto-translations | LOW | Display translated query string above results in a subdued style; no edit required for v1 |
| Per-result translation with original on hover/toggle | Advanced users may want to verify; hovered original title/snippet avoids cognitive noise for casual users | MEDIUM | Store both original and translated strings; show translated by default; tooltip or toggle reveals original |
| Favicon per result | Makes result rows scannable; "domain branding" helps user recognise trusted sources at a glance | LOW | `meta_url.favicon` from Brave API; fall back to a generic globe icon if absent |
| Formality-aware result translation | Use existing formality setting from hime settings (the one already set for inline translation) — results land in the same register the user is accustomed to | LOW | Pass formality to the same prompt construction as inline translation; no new UI needed |
| Source == target short-circuit (no-op fast path) | If user's source language == target language, skip translation entirely and display raw Brave results instantly | LOW | Compare normalised language codes before queuing translation; dramatically reduces latency for accidental same-language queries |

### Anti-Features — Translated Search

Features that seem logical but should be explicitly excluded from v1.

| Feature | Why Requested | Why Problematic | What to Do Instead |
|---------|---------------|-----------------|-------------------|
| Editable translated query ("search in" field the user can modify) | Power users want to tune the translation | Doubles the input surface; most users do not want to see or touch a Japanese query box; adds confusion about which query is "live"; query edit without re-running search is a broken state | Show the translated query as read-only disclosure text; if it's wrong, the user refines their English query and re-searches |
| Click-to-open translated version of the page | "Translate the whole target page too" feels consistent | Creates a translate-proxy dependency (Google Translate proxy URL), adds network hops, and hime has no backend; also the linked page may be untranslatable or paywalled | Chrome has built-in page translation; user can invoke it after clicking through to the original |
| Pagination / load more results | "10 results isn't enough" | Each page requires another Brave API call + another LLM translation round; 10 results with translation latency is already 3–8 seconds; pagination dramatically increases cost and perceived wait | 10 results is the right v1 scope; address pagination only after validating the core loop |
| Spelling correction / "did you mean" | Expected from major search engines | Requires a spell-check or suggestion API; Brave Search does not return correction suggestions in the standard web API response | Omit; Brave Search handles fuzzy matching on its end |
| Image or video result rows | Rich SERPs feel complete | Image/video results require a different Brave API endpoint, different UI components, and different translation handling; multiplicative scope | Web results only in v1; image/video as future phases |
| Search history / saved searches | Feels natural | Adds chrome.storage schema, a history UI panel, and privacy considerations (search history is sensitive); no corresponding demand signal yet | Defer; the search box clears on close unless query is in the URL hash |
| Real-time query translation as-you-type | Feels slick | Thrashes the LLM API on every keystroke; 50–200ms LLM calls during typing creates visible lag and wasted tokens; the user hasn't committed to the query yet | Translate on submit only |
| Auto-detect source language | "Don't make me set my language" | Language detection requires an additional API call or heuristic; the existing hime settings already store source language; consistency is better than magic | Use the source language from hime settings |

---

## Feature Dependencies — v1.2 Translated Search

```
[Brave Search BYOK (API key in settings)]
    └──required by──> [Search results fetch]

[Query translation]
    └──required by──> [Search results fetch] (must translate before calling Brave)
    └──uses──> [Provider abstraction layer] (existing; same as inline translation)
    └──uses──> [Source + target language from settings] (existing settings keys)

[Search results fetch (Brave API)]
    └──required by──> [SERP result rendering]
    └──required by──> [Result translation]

[Result translation]
    └──uses──> [Provider abstraction layer] (existing)
    └──uses──> [Formality setting from settings] (existing)
    └──produces──> [Translated title + snippet per result]

[SERP result rendering]
    └──requires──> [Translated title + snippet]
    └──requires──> [Original url from Brave result] (link target)
    └──uses──> [meta_url.hostname + meta_url.favicon] (domain attribution row)

[Source == target short-circuit]
    └──bypasses──> [Query translation]
    └──bypasses──> [Result translation]
    └──feeds directly into──> [SERP result rendering]
```

### Dependency Notes

- **Query translation is blocking:** the Brave Search call cannot begin until the translated query string is ready. This is the primary latency driver. LLM call for ~5 word query should be <1s on GPT-4o-mini/Gemini Flash.
- **Result translation is parallelisable:** once Brave returns N results, all N title+snippet pairs can be sent in a single batched LLM call (one prompt with all strings) rather than N serial calls. Batch translation is the right architecture.
- **Provider abstraction layer requires zero changes:** both query translation and result translation are standard "translate X from A to B" prompts; they slot directly into the existing `callProvider()` / background service worker message-passing pattern.
- **Brave API key is a new secret:** it lives alongside the LLM key in `chrome.storage.local`, stored and retrieved via the same pattern as LLM keys. Settings page needs one new input field.

---

## MVP Definition — v1.2 Translated Search

### Launch With (v1.2)

Minimum to validate the translated-search concept end-to-end.

- [ ] Extension page (bundled HTML, opened via extension action or dedicated route) with a search input
- [ ] Query translation: source language → target language via provider layer before Brave call
- [ ] Brave Search API call using the translated query, BYOK key from settings
- [ ] Result translation: batch translate all returned `title` + `description` strings in one LLM call
- [ ] SERP result rows: translated title (link to original url) + domain attribution line (favicon + hostname) + translated snippet
- [ ] Translated query disclosure line above results ("Searching Japanese for: ___")
- [ ] Skeleton loading state during fetch + translation phases
- [ ] Empty / error states for zero results, bad API key, network failure
- [ ] Source == target short-circuit (skip translation, display raw results)
- [ ] Brave Search API key field in existing settings page

### Add After Validation (v1.2.x)

Add once the core loop is working and tested.

- [ ] Original title/snippet on hover (tooltip showing untranslated text) — triggered by user confusion signal
- [ ] Result count indicator ("About N results")
- [ ] Keyboard navigation through results (↑/↓ arrows, Enter to open)

### Future Consideration (v2+)

Defer until there's demand signal.

- [ ] Pagination / "load more" — only if users hit the 10-result ceiling repeatedly
- [ ] Image/video result type tabs
- [ ] Search history panel
- [ ] Editable translated query field

---

## Feature Prioritization Matrix — v1.2

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| SERP result row (title + domain + snippet) | HIGH | LOW | P1 — core output surface |
| Query translation via provider layer | HIGH | LOW | P1 — prerequisite for everything |
| Brave Search API call + BYOK key in settings | HIGH | LOW | P1 — prerequisite for everything |
| Batch result translation | HIGH | MEDIUM | P1 — correct architecture (vs N serial calls) |
| Translated query disclosure line | HIGH | LOW | P1 — trust/transparency; trivial to add |
| Skeleton loading state | MEDIUM | LOW | P1 — two-phase latency is 2–8s; blank page is unacceptable |
| Source == target short-circuit | MEDIUM | LOW | P1 — correctness; trivially added with a language code check |
| Error / empty states | MEDIUM | LOW | P1 — required for non-happy paths |
| Favicon per result | MEDIUM | LOW | P2 — already in Brave API response; cosmetic but credibility-building |
| Original text on hover | LOW | MEDIUM | P2 — power user feature; post-validation |
| Keyboard navigation in results | LOW | MEDIUM | P2 — nice-to-have; browser default tab focus works for v1 |
| Pagination | LOW | HIGH | P3 — anti-feature for v1 |
| Image/video results | LOW | HIGH | P3 — out of v1 scope |

**Priority key:**
- P1: Required for a credible v1.2 launch
- P2: Add after validation; low risk
- P3: Future consideration; do not build in v1.2

---

## SERP Anatomy Reference

Based on current Google SERP design (post-Sept 2024 breadcrumb removal) and Brave API field availability:

**Minimum credible result row (3 elements):**
1. **Row 1 — Attribution:** `[favicon 16x16] [hostname]` — domain identity
2. **Row 2 — Title link:** Clickable blue text; href = original `result.url`; text = translated `result.title`
3. **Row 3 — Snippet:** Translated `result.description`; 2 lines max; grey text

**Available from Brave API per result:**
- `title` — result heading (translate this)
- `url` — page URL (use as link href verbatim; do not translate)
- `description` — snippet text (translate this)
- `meta_url.hostname` — domain for attribution line
- `meta_url.favicon` — proxied favicon URL (16×16 via Brave CDN; reliable)
- `meta_url.path` — breadcrumb path (optional; omit in v1 for simplicity)
- `extra_snippets` — array of alternate excerpt strings (omit in v1)

**What NOT to translate:** `url`, `meta_url.hostname`, `meta_url.path` — these are identifiers, not human-readable text in the translation sense. Translating them would break links and destroy domain recognition.

---

## Cross-Lingual UX Nuances

### Showing the translated query

Show a single low-prominence line above results: "Searching in Japanese for: [translated-query-text]"

This is the right balance between transparency and noise. Rationale:
- Users who typed "best ramen shops in Tokyo" need to know their query became "東京のおすすめラーメン店" — they may spot a bad translation and want to rephrase
- Showing it prominently (as a header) vs subtly (as a caption) is a UX call; subdued caption under the search box is the standard pattern (comparable to Google's "Did you mean: X")
- Do NOT make it editable in v1; the user's path to a better query is to edit their English input and re-search

### Translated-only vs show-both

Default to translated-only (user's language) for all visible text in result rows. Show original text on hover as a tooltip (v1.2.x, post-validation). Rationale:
- The whole point of the feature is reading results in your own language — showing untranslated Japanese alongside translated text doubles visual noise
- Google's "translated results" mode shows translated-only in the SERP; original is accessed by clicking through to the translated page
- For hime, the original-on-hover pattern is a discoverable power feature, not a core interaction

### Source == target handling

If source language == target language (e.g. user has EN→EN set, or accidentally has same lang on both sides), skip all translation API calls and render raw Brave results directly. Show the query disclosure line as "Searching in English for: [original-query]" with no translation note. This is both a latency win and a correctness requirement.

### Translation latency expectations

Two-phase pipeline latency breakdown:
1. Query translation: ~0.5–1.5s (single short string, fastest LLM tier)
2. Brave Search fetch: ~0.3–1.0s (network call)
3. Batch result translation (10 title+snippet pairs): ~1.5–5s (larger prompt; parallelised per-result would be 10× worse)

Total: ~2–8s from submit to populated results. This is within user tolerance for search (Google averages ~0.5s but users accept up to 3–5s for specialised search). Skeleton rows during phases 2–3 are essential.

---

---

## v1.0 Inline Translation — Feature Landscape (Unchanged)

*Original research from 2026-05-24. v1.0 is shipped and stable.*

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Works in `<input>` and `<textarea>` | These are 95% of form fields on the web | LOW | Done — content script handles both |
| Works in `contenteditable` elements | Gmail, Slack, Notion, Docs all use this | HIGH | Done structurally; cross-site edge cases remain the open risk |
| Keyboard trigger (no mouse required) | Extension targets keyboard-native users | LOW | Done — `Ctrl+Shift+T` and `Ctrl+Shift+Y` |
| Undo support | Breaking Ctrl+Z is a dealbreaker for writers | HIGH | Done via `document.execCommand('insertText')` |
| Settings/configuration page | API key + provider must be configurable | LOW | Done — full settings page |
| Clear on/off feedback | User must know when translation mode is active | LOW | Done — blue border + badge |
| Error visibility | Silent failures are worse than noisy ones | LOW | Done — red "ERR" badge |
| Skips sensitive fields | Translating passwords is a security bug | LOW | Done — skips password/readonly/hidden/disabled |
| Works on major sites | Gmail, GitHub, Twitter/X, Slack, Google Docs | HIGH | In progress — cross-site testing task active |

### Differentiators (Competitive Advantage)

Features that set hime apart from the "select text → popup" translation pattern every competitor uses.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Compose mode (inline toggle) | Write in English, output lands directly in the field — no copy-paste, no popups | MEDIUM | Core differentiator; done |
| YOLO mode (one-shot replace) | Fastest path for short messages — one hotkey, done | LOW | Done; pairs naturally with Compose |
| Auto-formality inference | LLM reads your English tone and picks appropriate Japanese register — no manual dial-tweaking | MEDIUM | Done; needs validation testing to confirm quality |
| Formality control (Auto/Casual/Polite/Formal) | Japanese register is non-optional — output that ignores it reads as robotic or rude | LOW | Done; language-specific prompt instructions per level |
| Language swap hotkey | Flip direction mid-session without touching settings | LOW | Done — `Ctrl+Shift+S` + badge shows 2-letter code |
| Custom prompt override | Power users can tune the system prompt for domain-specific vocabulary (legal, medical, gaming) | LOW | Done — settings field |
| Multi-provider support | Users choose between OpenAI and Gemini; not locked to one vendor or one cost structure | MEDIUM | Done — provider abstraction layer |
| Session-only key storage | Privacy-forward: key lives only in memory, gone when browser closes | LOW | Done — `chrome.storage.session` option |
| BYOK | User owns their rate limits and billing; no hosted service to trust or pay separately | LOW | Core architectural decision; done |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Streaming / translate-as-you-type | Feels "live" | Thrashes the API on every keystroke; output mutates mid-composition causing cursor chaos; adds no value for inputs under 200 chars | Explicit trigger hotkey — user controls when translation fires |
| Multiple simultaneous language pairs | Power users want Japanese + Korean + etc. | Cognitive overhead multiplies; hotkey slots are capped at 4; swap UX becomes ambiguous | One pair, swappable — covers 95% of sessions cleanly |
| System-wide IME support | "Always on" feels convenient | Requires OS native integration (separate binary, installer, OS permissions); entirely different product surface | Chrome extension scope is the right boundary for v1 |
| Offline / local model support | Privacy and cost concerns | Local inference requires bundling a model (100MB–7GB); service worker lifetime makes this impractical in MV3 | BYOK addresses cost; session storage addresses key privacy |
| Spaced repetition / flashcard learning | Learning mode sounds synergistic | Different product with different retention, progress tracking, and scheduling needs — sharing UI creates confusion | Separate app; hime stays focused on composition |
| Right-click context menu translation | Familiar pattern (every competitor does it) | Mouse-based; breaks keyboard-native identity; adds a mode the existing hotkeys already cover | YOLO mode covers one-shot replacement; Compose covers iterative |
| Auto-popup suggestions while typing | Grammarly-style inline hints | Interfers with IME input on sites that already handle Japanese; competes with the host page's own autocomplete; high jank risk | Explicit trigger is the right UX for a translation step |
| Hotkey rebinding in options UI | Discoverability | Chrome commands API already exposes `chrome://extensions/shortcuts`; duplicating it adds maintenance burden with no UX gain | Document the native shortcut; link to it from settings |

---

## Feature Dependencies — v1.0 Inline Translation

```
[Text field detection]
    └──required by──> [Compose mode]
    └──required by──> [YOLO mode]

[Provider abstraction]
    └──required by──> [OpenAI support]
    └──required by──> [Gemini support]
    └──required by──> [Formality control] (prompts are provider-routed)

[Settings persistence (chrome.storage)]
    └──required by──> [Language swap persistence]
    └──required by──> [API key storage]
    └──required by──> [Custom prompt override]

[Background service worker]
    └──required by──> [All API calls] (CSP restriction on content scripts)

[Compose mode]
    └──enhances──> [Formality control] (compose sessions tend to be multi-sentence; formality matters more)
    └──conflicts──> [Auto-popup suggestions] (they fight over the same input event stream)

[YOLO mode]
    └──conflicts──> [Streaming output] (YOLO is atomic; streaming implies incremental reveal)
```

### Dependency Notes

- **Text field detection is the foundation:** both modes and the undo mechanism all depend on correctly identifying the active element type (input vs textarea vs contenteditable). Cross-site edge cases here propagate to every other feature.
- **Provider abstraction enables formality:** formality levels are implemented as system prompt instructions routed through the provider layer — adding a new provider means formality works automatically.
- **Background service worker is non-negotiable:** content scripts cannot make direct API calls due to CSP on most sites; the service worker handles this. Any new AI feature must go through the message-passing channel, not direct fetch from content script.

---

## MVP Definition — v1.0 Inline Translation

### v1.0 — Shipped

The concept is validated and the product is usable end-to-end.

- [x] Compose mode with toggle hotkey, visual indicator, Escape cancel
- [x] YOLO mode with one-shot hotkey
- [x] Text field detection (input, textarea, contenteditable)
- [x] Undo-safe replacement via `document.execCommand('insertText')`
- [x] OpenAI + Gemini provider support with abstraction layer
- [x] BYOK with local/session storage options
- [x] Settings page (provider, model, key, language pair, formality, custom prompt)
- [x] Formality control (Auto/Casual/Polite/Formal)
- [x] Language swap hotkey + badge persistence
- [x] Error badge + "Test Connection"
- [x] Skips unsafe fields (password, readonly, hidden, disabled)

### v1.x — Active / Immediate Next

These don't add features; they validate and harden what's shipped.

- [ ] **Prompt engineering validation** — test Auto formality on slang, business formal, and technical inputs; confirm no stray quotes or explanations in output
- [ ] **Cross-site compatibility** — verify compose + YOLO + undo on Google Search, Gmail, GitHub, Google Docs, Notion, Slack web, Discord web, Twitter/X; document contenteditable edge cases and fix blocking ones
- [ ] **Chrome Web Store submission** — screenshots, privacy policy, store listing (deferred until cross-site testing is clean)

### v2+ — Future Consideration

Add only after v1.x is solid and there's user signal.

- [ ] **Firefox/Safari port** — MV3 APIs differ; this is a real porting effort, not a toggle
- [ ] **Additional LLM providers** — Anthropic Claude, Mistral, local Ollama via proxy (provider abstraction makes this low-effort once there's demand)
- [ ] **Per-site language memory** — remember that you use Formal on LinkedIn but Casual on Discord
- [ ] **Translation history / cache** — avoid re-translating identical strings; also useful for review
- [ ] **Glossary / term overrides** — force specific translations for proper nouns or domain terms without editing the system prompt each time

---

## Competitor Feature Analysis

No direct competitor does inline keyboard-driven composition translation. The nearest analogies are all popup/selection-based.

| Feature | Google Translate Extension | DeepL Extension | Yomitan | hime |
|---------|---------------------------|-----------------|---------|------|
| Trigger model | Select text → popup | Select text → popup | Hover → popup | Keyboard hotkey → inline replacement |
| Composition support | No — translation only, no input | No — read-only output | No — reading aid only | Yes — Compose mode |
| Undo support | N/A (no input) | N/A (no input) | N/A | Yes — `execCommand` |
| Formality control | No | No (DeepL handles internally) | N/A | Yes — 4 levels + Auto |
| BYOK | No — Google account | No — DeepL account | N/A | Yes |
| Keyboard native | No | No | Partially (hotkey to enable) | Yes — core identity |
| Works in contenteditable | Reads but doesn't write | Reads but doesn't write | Reads only | Writes (with edge cases) |
| Language pair | ~100 languages | ~31 languages | JP only (reading) | Any pair via LLM |
| Provider choice | Fixed (Google NMT) | Fixed (DeepL NMT) | Fixed (dictionary) | OpenAI / Gemini; extensible |
| Custom prompt | No | No | No | Yes |

**Key insight:** The "compose in source language, output in target language" workflow is genuinely unoccupied. Every competitor treats translation as a reading tool (select → read translation). Hime treats it as a writing tool (type → replace with translation). This is the moat.

---

## Sources

**v1.2 Translated Search (2026-06-02):**
- Brave Search API documentation — `meta_url.favicon`, `meta_url.hostname`, `title`, `url`, `description` field shape confirmed (HIGH confidence)
- Google Search Central — Translated Results documentation — Google pattern: translated title/snippet, link to original page, user option to view original (HIGH confidence)
- Nielsen Norman Group — Anatomy of a Search Results Page — 3-element minimum (title, URL, snippet) for credible SERP (HIGH confidence)
- Google Search Central — Visual Elements Gallery + SERP anatomy post-Sept 2024 — favicon + site name replaced breadcrumb in current design (HIGH confidence)
- translated.com Multilingual Search Guide — "Translated from X" / toggle pattern recommendation (MEDIUM confidence — industry guide, not primary research)
- NN/G — Skeleton Screens 101 — skeleton screens perceived as faster than spinners (HIGH confidence)
- AWS re:Post — Multilingual Search UX patterns (MEDIUM confidence)

**v1.0 Inline Translation (2026-05-24):**
- `/home/ben/code/hime/.planning/PROJECT.md` — authoritative requirements and decisions
- Codebase state (tasks 1-7, 10 complete) — features validated against actual implementation
- Google Translate Chrome Extension (published, well-known behavior) — HIGH confidence
- DeepL Chrome Extension (published, well-known behavior) — HIGH confidence
- Yomitan (open source, GitHub) — HIGH confidence
- Chrome Commands API documentation — 4-hotkey cap is documented constraint
- `document.execCommand` deprecation status — confirmed deprecated but functional in Chrome

---
*Feature research for: hime — browser inline translation extension + translated search + image translation*
*Researched: 2026-05-24 (v1.0) / 2026-06-02 (v1.2 addendum) / 2026-06-20 (v1.3 addendum)*
