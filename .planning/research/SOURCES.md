# Curated Sources — in-place page text translation (hime v1.4)  (via /pre-research, 2026-06-21)

> Researchers: READ THESE FIRST. Vetted primary/expert sources — use as the spine of research;
> search beyond only to fill genuine gaps. Class: tech.
>
> v1.4 scope: translate CURRENT PAGE visible text and REPLACE in place (layout-preserving) +
> overlay translated text on page images (semi-transparent box). Trigger: manual + auto-offer
> (<html lang>). Dynamic: STATIC snapshot only. BYOK LLM via the existing v1.3 pipeline.
> CONSTRAINT: simple overlay, NO new OSS dependency, no inpainting/manga typesetting.

## DOM page-text translation (replace-in-place)
1. **Firefox Translations, how we did it** — https://andrenatal.com/2023/05/firefox-translations-how-we-did-it/
   engineering-blog · trust 5/5 · dated:2023-05 · TreeWalker DOM traversal, segment batching, in-place replace with HTML-tag re-alignment (Bergamot lead's writeup).
2. **translate-tools/domtranslator** — https://github.com/translate-tools/domtranslator
   repo · trust 5/5 · dated:2025-07 · production TS impl: text-node walking, NodeFilter ignore (script/style/code/editable), structure-preserving replace. Study, do NOT add as dep.
3. **The Bergamot Translator — Firefox Source Docs** — https://firefox-source-docs.mozilla.org/toolkit/components/translations/resources/03_bergamot.html
   docs · trust 4/5 · evergreen · HTML alignment: translate inline-markup segments + reinsert without breaking tags. Overview: .../01_overview.html. (MDN createTreeWalker for SHOW_TEXT/FILTER_REJECT.)

## Image overlay legibility (simple, own code)
4. **Captions/Subtitles — W3C WAI** — https://www.w3.org/WAI/media/av/captions/
   docs(standards) · trust 4/5 · evergreen · WCAG AA 4.5:1 + semi-opaque dark box behind light text = the legibility model for text over arbitrary imagery.

## Reused by reference (v1.3 dossier ~/.claude/research-sources/image-translation.md)
- Google Vision DOCUMENT_TEXT_DETECTION fullTextAnnotation boundingBox geometry (overlay placement)
- Google Cloud Translation API v3; chrome.tabs.captureVisibleTab; MV3 cross-origin image-byte fetch
- Text-fit into box = binary-search on CanvasRenderingContext2D.measureText (own code, no lib)
