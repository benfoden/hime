---
phase: 16-in-place-image-overlay-translation
plan: "05"
subsystem: verification
tags: [human-verify, checkpoint, live-uat, overlay, image-translation, OVL-01, OVL-02, OVL-03, OVL-04, OVL-05]

requires:
  - phase: 16-04
    provides: overlayTranslateImages + overlayRenderImage + global/per-image toggles + anchoring

provides:
  - "OVL-01..05 live human-verified on standard sites (page text + image overlays render correctly to the target/reading language)"
  - "Phase 16 shipped via squash-merged PR #6"
---

# 16-05 — Live load-unpacked verification (human checkpoint)

Plan 16-05 was a `checkpoint:human-verify` gate (no code). Verified live via
load-unpacked on `dist/` (per project law — never the service-worker console for tests).

## Outcome: VERIFIED (core) + shipped

Page-text translation and image-overlay translation both work correctly on standard
sites (confirmed on a normal page after the fixes below). Shipped as squash-merged
**PR #6** into `main`.

## Defects found + fixed during verification (all in PR #6)

- Opaque page-translate errors → surface real `kind`/`message` in the toast.
- Provider self-abort: internal 10s `translate` timeout → 60s; page-batch worker 8s → 45s.
- Stale `chrome.storage.session` page-state mirror survived reload → cleared on content boot.
- Read direction: popup `X → Y` is literal (translate TO the right-side target); removed the
  JP-detect auto-flip from page + image translate paths (compose/IME path unchanged).
- **Reliability RCA:** page/image batch paths had no retry; search did. Added retry+backoff
  (mirrors `translateChunkWithRetry`); dropped page+image concurrency to 1 → strict
  top-to-bottom streaming and no free-tier RPM stampede.
- **Cluster RCA:** Google `DOCUMENT_TEXT_DETECTION` returns `normalizedVertices` (0–1), but
  `ocr()` called `collectParagraphBoxes` without `submitted` dims → fallback dead → boxes
  collapsed to a corner cluster. Threaded the dims through; added a realistic test fixture.
- SVG images skipped (vector, not OCR-able); overlay now covers all eligible loaded+visible
  in-viewport images (budget-capped); added a shared `%` progress tab + reveal-fade wave.

## Deferred (post-v1.4 follow-ups)

- One specific site has a one-off image-positioning bug (likely exotic layout — a
  transformed/scaled ancestor or `srcset` mismatch). Not reproduced on other sites.
- Below-fold image overlay on scroll (currently initial-viewport only).
- Per-chunk JP-regex direction was removed; a unified read-vs-compose direction model
  would be cleaner than relying on the popup swap.
