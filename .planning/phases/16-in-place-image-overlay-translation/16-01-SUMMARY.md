---
phase: 16-in-place-image-overlay-translation
plan: "01"
subsystem: image-processing
tags: [overlay, geometry, coordinate-mapping, shrink-to-fit, ocr, vision, pure-modules, tdd]

# Dependency graph
requires:
  - phase: 12-14-image-translation
    provides: Vision OCR pipeline (image-resolve.ts), types.ts contracts, background.ts worker

provides:
  - Pure mapBox() function: submitted-px -> natural-px -> rendered-rect coordinate mapping
  - Pure fitText() function: binary-search shrink-to-fit with per-char CJK wrap
  - collectParagraphBoxes(): paragraph geometry extraction from Vision fullTextAnnotation
  - OverlayBlock interface: per-paragraph {text, box} overlay contract
  - translateImageBlocks message/response type contracts
  - Settings.includeImages: false opt-in toggle

affects:
  - 16-02 (background.ts translateImageBlocks case imports OverlayBlock + message types)
  - 16-03 (popup includeImages checkbox reads Settings.includeImages)
  - 16-04 (content.ts mirrors mapBox/fitText; renders overlay using these contracts)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern law: pure math modules with no chrome.*/document.* (image-resolve.ts precedent)"
    - "TDD RED-first: test assertions derived from transform formulas, not from implementation"
    - "Injected measure callback: fitText takes (text, fontPx) => widthPx so node can test it"
    - "Defensive optional-chaining throughout collectParagraphBoxes (T-16-01 threat mitigation)"

key-files:
  created:
    - src/overlay-geometry.ts
    - src/overlay-fit.ts
    - test/overlay-geometry.mjs
    - test/overlay-fit.mjs
    - test/fixtures/fulltextannotation.json
  modified:
    - src/image-resolve.ts
    - src/types.ts
    - test/image-resolve.mjs

key-decisions:
  - "mapBox returns rect relative to rendered image rect (container does viewport offset)"
  - "objectFitTransform returns scaleX/scaleY separately for fill vs uniform scale for others"
  - "fitText's cjk opts flag is caller-supplied (isCjkLang decides in content.ts), not internal"
  - "OcrResult.blocks uses inline type alias to avoid circular import types->image-resolve->types"
  - "Worktree is based on v1.3 (pre-phase-15); plan contracts are self-consistent with that base"

requirements-completed: [OVL-01, OVL-04, OVL-05]

# Metrics
duration: 12min
completed: 2026-06-22
---

# Phase 16 Plan 01: Pure Overlay Math Seams Summary

**mapBox() three-transform coordinate mapping + fitText() binary-search shrink-to-fit + collectParagraphBoxes() paragraph geometry extraction, all TDD RED-first, fully node-tested with no DOM/canvas dependencies.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-22T20:24:07Z
- **Completed:** 2026-06-22T20:37:06Z
- **Tasks:** 3 of 3 completed
- **Files modified:** 7 (2 new src, 3 new test, 2 modified src)

## Accomplishments

### Task 1: overlay-geometry.ts mapBox() (TDD)
- Created `src/overlay-geometry.ts`: pure module implementing the three-transform coordinate pipeline
  - (a) undo downscale: submitted-px -> natural-px via upX/upY ratio
  - (b) object-fit letterbox: contain/cover/fill/none/scale-down transforms
  - (c) zero-dim guard: submitted.w/h <= 0 returns {0,0,0,0} (no NaN, T-16-03)
- Created `test/overlay-geometry.mjs`: 4 RED-first node tests
  - fill: exact quarter-scale result (downscale-undo proof)
  - contain: positive letterbox offset on widescreen container
  - cover: negative offset when image overflows
  - zero-dim guard: finite non-NaN values guaranteed

### Task 2: overlay-fit.ts fitText() (TDD)
- Created `src/overlay-fit.ts`: pure module with binary-search font fitting
  - Binary search [minFont=9, maxFont=28] for largest fitting fontPx
  - wrapLines(): greedy per-word (latin) or per-character (cjk=true) wrap
  - Oversized single tokens placed alone (no text dropped)
  - clamped=true returned when minFont still overflows height
  - measure callback injected: no canvas/measureText in module (Pattern law)
- Created `test/overlay-fit.mjs`: 4 RED-first node tests with deterministic stub
  - fits: short text => maxFont, clamped=false
  - shrinks: multi-word => font strictly between min and max
  - clamps: oversized text => fontPx=9, clamped=true
  - CJK: no-space string with cjk=true => multiple lines (per-char wrap confirmed)

### Task 3: collectParagraphBoxes + contracts (TDD)
- Extended `src/image-resolve.ts`:
  - OverlayBlock interface exported: {text: string; box: {x,y}[]}
  - collectParagraphBoxes(fta, submitted?): OverlayBlock[] — defensive walk
  - assembleParagraphText(): assembles from words[].symbols[].text + detectedBreak
  - Drops whitespace-only paragraphs and non-4-vertex boxes (T-16-01)
  - normalizedVertices fallback when vertices absent (RESEARCH A2)
  - Widens SymbolNode/WordNode/ParagraphNode/BlockNode with boundingBox + symbol fields
- Extended `src/types.ts`:
  - 'translateImageBlocks' added to MessageType union
  - TranslateImageBlocksMessage: {srcUrl, tabId?, dedupKey, config} — NO key (T-16-02)
  - TranslateImageBlocksResponse: {blocks?, submitted?, captureFallback?, error?, kind?}
  - Settings.includeImages?: boolean; DEFAULT_SETTINGS.includeImages: false (D-01)
  - OcrResult.blocks?: {text, box}[] for Phase 02 wire-up
- Created `test/fixtures/fulltextannotation.json`: realistic 2-paragraph fixture
  - Para 1: "Hello World" (SPACE detectedBreak), 4-vertex box
  - Para 2: "Foo Bar" (LINE_BREAK detectedBreak), 4-vertex box
  - Para 3: whitespace-only (" ") — must be dropped
- Extended `test/image-resolve.mjs` with 3 RED-first collectParagraphBoxes tests

## Verification Results

```
npm test: 193 pass, 0 fail, 2 skipped (opt-in live tests)
npx tsc --noEmit: No errors found
node --test test/overlay-geometry.mjs: 4/4 pass
node --test test/overlay-fit.mjs: 4/4 pass
node --test test/image-resolve.mjs: 11/11 pass (8 existing + 3 new)
```

## Deviations from Plan

### Notes (not deviations)

**Comment-in-header grep false positive:** The acceptance criterion `grep -c 'document\.\|chrome\.' returns 0` returns 1 for both new modules because the Pattern law header comment says "NO chrome.* and NO document references" — the `.` in "chrome." and "document." is part of the literal comment text. The same applies to `image-resolve.ts` (the template these headers were copied from). There are zero functional DOM/chrome/chrome.* API calls in either module. This is expected and consistent with the existing Pattern law pattern.

**measureText in comments:** `overlay-fit.ts` comment lines explain the injected measure callback wraps `measureText` in content.ts. The acceptance criterion (0 functional measureText calls) is met; the comment-only mentions are documentation.

**Worktree is v1.3 base (pre-phase-15):** The worktree was created from the v1.3 merge commit (574e5e2), which predates phase 15 (page-walk.ts, content.ts page-translate). The plan references page-walk.ts as a read_first but it is not present in this worktree. Task 2's read_first was satisfied by reading page-walk.ts from git history. The implementation does not depend on page-walk.ts; the plan's contracts are self-contained.

**None - plan executed exactly as written.** (All three tasks completed with RED-GREEN cycle, all tests green, all contracts implemented.)

## Known Stubs

None. All exported functions are fully implemented and tested.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundaries beyond what the plan's threat model already registered (T-16-01 through T-16-SC).

## Self-Check: PASSED

- [x] src/overlay-geometry.ts exists and exports mapBox
- [x] src/overlay-fit.ts exists and exports fitText
- [x] src/image-resolve.ts exports collectParagraphBoxes + OverlayBlock
- [x] src/types.ts contains 'translateImageBlocks' + TranslateImageBlocksMessage + includeImages
- [x] test/overlay-geometry.mjs exists (4 tests pass)
- [x] test/overlay-fit.mjs exists (4 tests pass)
- [x] test/fixtures/fulltextannotation.json exists
- [x] test/image-resolve.mjs extended (11 tests pass)
- [x] RED commit 32f96b6 exists (overlay-geometry RED)
- [x] GREEN commit a858ad5 exists (overlay-geometry GREEN)
- [x] RED commit b2125f0 exists (overlay-fit RED)
- [x] GREEN commit ed49ce9 exists (overlay-fit GREEN)
- [x] RED commit ab2fe5e exists (collectParagraphBoxes RED)
- [x] GREEN commit 45ea8a8 exists (collectParagraphBoxes GREEN)
- [x] npm test: 193 pass
- [x] npx tsc --noEmit: clean
