# Requirements: hime v1.3 Image Translation

> Milestone v1.3 — OCR + translate text inside web-page images via a cloud vision LLM (BYOK),
> surfaced as readable text in a side panel. Phases 12–14. Continues from v1.2 (phases 8–11).

## Milestone v1.3 Requirements

### Image OCR Pipeline (IMG)

- [x] **IMG-01**: User can right-click any `<img>` on a page and choose "Translate image with hime" to OCR and translate the text inside it.
- [x] **IMG-02**: The side panel shows both the detected original text and its translation for the image.
- [x] **IMG-03**: The detected source language is displayed, and the image text is translated detected-source → the user's configured target language.
- [x] **IMG-04**: Image bytes are resolved in the background worker (fetch under host_permissions), with a `captureVisibleTab` fallback for cross-origin / tainted-canvas / CSS-background images that can't be fetched directly.
- [x] **IMG-05**: Each image translation surfaces an explicit per-image state — loading, no-text-found, low-confidence, or error — and never renders a silent blank.
- [x] **IMG-06**: User can copy the translated text (and the detected original text) from the side panel.
- [x] **IMG-07**: All vision API calls are routed through the background service worker; the BYOK key is never exposed to the page.

### Vision Provider (VIS)

- [x] **VIS-01** *(shipped with deviation D-V01, see below)*: A provider-agnostic `VisionProvider` interface performs **OCR + language detection** (image in → `{originalText, detectedLang, confidence}` out), implemented for **Google Cloud** via Vision API `images:annotate` (DOCUMENT_TEXT_DETECTION). The **translation** half is routed through the user's existing configured **LLM translation provider** (not Cloud Translation v2). The Google Cloud key (BYOK) authenticates the Vision call only, routed through the worker.
- [x] **VIS-02** *(shipped with deviation D-V01)*: User can enter a Google Cloud API key in settings (stored client-side like existing keys), with a connection test that exercises the **Vision endpoint** (translation no longer uses this key, so it is not part of the test).
- [x] **VIS-03**: Images are validated and downscaled to Google's limits before send (≤10 MB JSON request, ≤75M-px OCR cap, supported MIME), so oversized or unsupported images fail gracefully rather than erroring opaquely.

### Progressive Mode (PROG) — opt-in, default OFF

- [x] **PROG-01**: A settings toggle enables progressive image translation; it is **OFF by default** and takes effect without reloading the extension.
- [x] **PROG-02**: With progressive mode on, images are auto-translated as they enter or approach the viewport (IntersectionObserver with a viewport margin), results delivered to the side panel.
- [x] **PROG-03**: Already-translated images are deduped by content hash and their results cached, so re-scrolling past an image never re-bills the same translation.
- [x] **PROG-04**: Progressive mode applies cost guards — a concurrency cap, a per-page budget, a dwell debounce before firing, and a minimum-size eligibility filter — so scrolling a media-heavy page cannot fan out unbounded paid API calls.
- [x] **PROG-05**: The first time progressive mode is enabled, the user sees an explicit privacy warning that page images will be sent to a cloud vision API, and an activity indicator shows while progressive translation is running.
- [x] **PROG-06**: Progressive results badge the image and populate the side panel when it is open, but never auto-open the side panel (IntersectionObserver is not a user gesture, so `sidePanel.open()` cannot fire from it).

### Accepted Deviations

- **D-V01 — translate via existing LLM provider, not Cloud Translation v2** (user steer, commit `269316a`): During phase 12 the image pipeline was deliberately split — Google Cloud Vision does OCR + language detection only, and the OCR'd text is translated by the user's already-configured LLM translation provider rather than Cloud Translation v2. Benefit: the Google key needs only the Cloud Vision scope, and translation reuses the existing (already-paid-for) provider and target-language config. This re-words VIS-01/VIS-02's literal "OCR+translate single provider" / "Vision + Translation endpoints" text; behavior is intact and fully wired (audited 2026-06-22). `VIS-F1` (multi-provider single-call vision) remains the future path if a true OCR+translate provider is wanted.

## Future Requirements (deferred)

- **IMG-F1** (was IMG-07): On-demand re-translate of an already-translated image from the panel — deferred; v1.3 shows the first result only.
- **VIS-F1**: Multi-provider vision support (Claude / Gemini / OpenAI single-call vision) + provider/model dropdown — deferred; the `VisionProvider` abstraction is built internally in v1.3 but only Google Cloud (Vision + Translation v2) is wired and surfaced.
- **PROG-F1**: Per-site scoping / allowlist for progressive mode — deferred; v1.3 ships a single global toggle + first-enable warning.
- **IMG-F2**: Same-page multi-image batching into one vision call (cost optimization) — deferred pending real-usage validation.

## Out of Scope (explicit exclusions)

- **In-image overlay / inpainting** — translated text rendered over the original image with background restoration. Side-panel text output is the v1.3 scope; overlay is a separate, much harder problem (no vendor guidance; OSS-only). Reasoning: geometry/inpaint craft is out of proportion to the read-the-text goal.
- **Manga / vertical-CJK special handling** — dedicated detectors/recognizers for stylized or vertical comic text. No authoritative cloud-vendor guidance exists; deferred to a possible future spike if CJK quality becomes the bottleneck.
- **Cloud Translation v3** — rejected for v1.3: v3 accepts no API key (requires service-account OAuth, breaking BYOK/no-backend). v1.3 uses Translation **v2**, which is API-key-authed. (Vision API `images:annotate` is also API-key-authed.)
- **Single-call vision LLMs (Claude / OpenAI / Azure) as the v1.3 provider** — deferred: v1.3 uses Google Cloud (Vision + Translation v2). The `VisionProvider` abstraction leaves the door open to add single-call providers later (VIS-F1).
- **Progressive-mode ON by default / eager whole-page translation** — cost and privacy risk; opt-in only.
- **Freeform region screenshot capture** (drag-select arbitrary screen region) — `<img>` + viewport triggers cover the milestone; region capture deferred.

## Traceability

Every v1.3 requirement maps to exactly one phase (12–14). Coverage: 16/16.

| Requirement | Phase |
|-------------|-------|
| IMG-01 | Phase 12 |
| IMG-02 | Phase 12 |
| IMG-03 | Phase 12 |
| IMG-04 | Phase 12 |
| IMG-05 | Phase 12 |
| IMG-06 | Phase 14 |
| IMG-07 | Phase 12 |
| VIS-01 | Phase 12 |
| VIS-02 | Phase 14 |
| VIS-03 | Phase 12 |
| PROG-01 | Phase 13 |
| PROG-02 | Phase 13 |
| PROG-03 | Phase 13 |
| PROG-04 | Phase 13 |
| PROG-05 | Phase 13 |
| PROG-06 | Phase 13 |
