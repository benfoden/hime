# Curated Sources — image translation (cloud vision OCR + translate)  (via /pre-research, 2026-06-20)

> Researchers: READ THESE FIRST. They are vetted primary/expert sources for hime v1.3
> Image Translation. Use them as the spine of your research; only search beyond them to fill
> genuine gaps. Class: tech (most-recent authoritative version wins).
>
> SCOPE LOCKED THIS ROUND: CLOUD VISION API path for the MV3 Chrome extension. Explicitly OUT
> of scope for v1.3 research (do NOT default into these): on-device/Chrome built-in AI,
> OpenAI/Azure alternate stacks, manga/overlay/inpainting craft. See "Deferred" in the dossier.

## Cloud OCR + translate
1. **Google Vision — DOCUMENT_TEXT_DETECTION fullText annotations** — https://docs.cloud.google.com/vision/docs/fulltext-annotations
   docs · trust 5/5 · dated:2026-06 · Word-level boundingBox geometry (Pages→Blocks→Paragraphs→Words→Symbols) for positioning translated overlay text.
2. **Google Vision — OCR: TEXT_DETECTION vs DOCUMENT_TEXT_DETECTION** — https://docs.cloud.google.com/vision/docs/ocr
   docs · trust 5/5 · evergreen · Photo/screenshot vs dense-document decision, precedence rules, request/response shape.
3. **Google Cloud Translation API v3** — https://docs.cloud.google.com/translate/docs/reference/rpc/google.cloud.translation.v3
   api-reference · trust 4/5 · evergreen · TranslateText request/response shape (GA v3). Guide: https://docs.cloud.google.com/translate/docs/translate-text · Pricing: 500k chars/mo free.
4. **Claude — Vision (image input)** — https://platform.claude.com/docs/en/build-with-claude/vision
   docs · trust 5/5 · evergreen · Single-call OCR+translate; input formats/limits, multi-image, prompting. Tradeoff: no explicit bbox geometry vs Google Vision.

## MV3 extension wiring (pixels → cloud API)
5. **Chrome — Cross-origin network requests (CORS, service worker)** — https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
   docs · trust 4/5 · evergreen · host_permissions + isolated-world content scripts; route image-byte fetches through the service worker.
6. **Chrome — chrome.tabs.captureVisibleTab (screenshot fallback)** — https://developer.chrome.com/docs/extensions/reference/api/tabs
   api-reference · trust 4/5 · evergreen · Capture path when raw image bytes aren't fetchable (cross-origin/tainted canvas); activeTab vs <all_urls>.

## Known gap
- No vendor publishes manga/vertical-CJK-specific OCR guidance. If overlay quality or CJK accuracy
  becomes the bottleneck, the deferred OSS stack (manga-image-translator, comic-translate, manga-ocr,
  comic-text-detector, LaMa inpainting) in the global dossier is the only authority — out of scope for now.
