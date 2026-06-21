// Pure image pre-flight + result-state logic for the Phase 12 OCR pipeline.
// NO chrome.* and NO document references: this module is imported by both the
// service worker (its OffscreenCanvas wiring consumes the dimension math, Plan
// 05) and the node test harness (test/image-resolve.mjs). The browser-only
// canvas/encode calls stay in the SW; only the MATH lives here (Pattern law).

import type { ImageEntry, ImageResult } from './types.js';
import type { ErrorKind } from './errors.js';

// D-04 / A1: mean word confidence below this flags a *populated* entry as
// low-confidence (amber badge) — never a blank. Revisited in Phase 14.
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

// A2: long-edge cap in px. Downscaling so the longest edge is <= this keeps the
// re-encoded base64 JSON payload comfortably under Vision's 10 MB / 75M-px
// limits (VIS-03 / Pitfall 3).
export const VISION_LONG_EDGE = 2048;

// Vision-supported still-image MIME types (per the Cloud Vision supported-files
// list). svg+xml and avif are intentionally excluded → the SW re-encodes them
// to PNG before send (T-12-08).
export const SUPPORTED_IMAGE_MIME = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
]);

export interface TargetDimensions {
  width: number;
  height: number;
  scaled: boolean;
}

/**
 * Long-edge downscale math against an explicit cap. If the longest edge already
 * fits, the input dims are returned unchanged (never upscale). Otherwise both
 * dims are scaled by `maxEdge / max(width, height)` (rounded), preserving aspect.
 * This is the dimension math the SW's OffscreenCanvas (Plan 05) consumes.
 */
export function targetDimensions(width: number, height: number, maxEdge: number): TargetDimensions {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) {
    return { width, height, scaled: false };
  }
  const ratio = maxEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
    scaled: true,
  };
}

/** `targetDimensions` defaulted to VISION_LONG_EDGE — the SW's call site. */
export function downscaleTarget(width: number, height: number): TargetDimensions {
  return targetDimensions(width, height, VISION_LONG_EDGE);
}

/** Membership in SUPPORTED_IMAGE_MIME, case-insensitive. */
export function isSupportedMime(mime: string): boolean {
  return SUPPORTED_IMAGE_MIME.has(mime.toLowerCase());
}

/** True for any unsupported MIME — the SW re-encodes those to PNG (T-12-08). */
export function needsReencode(mime: string): boolean {
  return !isSupportedMime(mime);
}

/**
 * Strip a `data:<type>;base64,` (or `data:<type>;charset=...;base64,`) prefix,
 * returning Vision's bare-base64 content form. A bare base64 string passes
 * through unchanged.
 */
export function stripBase64Prefix(dataUrlOrB64: string): string {
  const match = /^data:[^,]*;base64,/i.exec(dataUrlOrB64);
  if (match) {
    return dataUrlOrB64.slice(match[0].length);
  }
  return dataUrlOrB64;
}

// ----------------------------------------------------------------------------
// Confidence + state derivation.
//
// A Vision `fullTextAnnotation` nests pages → blocks → paragraphs → words →
// symbols, each carrying an optional `confidence`. We average word-level
// confidence; if there are no word confidences we fall back to symbol-level,
// then page-level, then 0.
// ----------------------------------------------------------------------------

interface ConfHolder {
  confidence?: number;
}
interface WordNode extends ConfHolder {
  symbols?: ConfHolder[];
}
interface ParagraphNode {
  words?: WordNode[];
}
interface BlockNode {
  paragraphs?: ParagraphNode[];
}
interface PageNode extends ConfHolder {
  blocks?: BlockNode[];
}
interface FullTextAnnotation {
  text?: string;
  pages?: PageNode[];
}
interface VisionResponse {
  responses?: Array<{ fullTextAnnotation?: FullTextAnnotation }>;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Mean word-level confidence over a Vision fullTextAnnotation. Fallback ladder:
 * word.confidence → symbol.confidence → page.confidence → 0. Never throws on a
 * sparse/partial annotation.
 */
export function meanWordConfidence(fullTextAnnotation: FullTextAnnotation | undefined | null): number {
  if (!fullTextAnnotation) return 0;
  const pages = fullTextAnnotation.pages ?? [];

  const wordConfidences: number[] = [];
  const symbolConfidences: number[] = [];
  for (const page of pages) {
    for (const block of page.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const word of paragraph.words ?? []) {
          if (typeof word.confidence === 'number') {
            wordConfidences.push(word.confidence);
          }
          for (const symbol of word.symbols ?? []) {
            if (typeof symbol.confidence === 'number') {
              symbolConfidences.push(symbol.confidence);
            }
          }
        }
      }
    }
  }

  if (wordConfidences.length > 0) return mean(wordConfidences);
  if (symbolConfidences.length > 0) return mean(symbolConfidences);

  const pageConfidences = pages
    .map((p) => p.confidence)
    .filter((c): c is number => typeof c === 'number');
  if (pageConfidences.length > 0) return mean(pageConfidences);

  return 0;
}

/** Mean confidence taken from a full Vision response envelope (responses[0]). */
export function meanConfidence(visionResponse: VisionResponse | undefined | null): number {
  const fta = visionResponse?.responses?.[0]?.fullTextAnnotation;
  return meanWordConfidence(fta);
}

export type EntryState = 'no-text' | 'populated' | 'low-confidence';

/**
 * Derive the coarse per-entry state from a raw Vision response:
 *   - no fullTextAnnotation (or empty text) → 'no-text'
 *   - mean confidence < threshold           → 'low-confidence'
 *   - otherwise                             → 'populated'
 * Never returns a silent blank (IMG-05 / D-04).
 */
export function deriveEntryState(visionResponse: VisionResponse | undefined | null): EntryState {
  const fta = visionResponse?.responses?.[0]?.fullTextAnnotation;
  const text = fta?.text?.trim() ?? '';
  if (!fta || text.length === 0) return 'no-text';
  return meanWordConfidence(fta) < LOW_CONFIDENCE_THRESHOLD ? 'low-confidence' : 'populated';
}

// ----------------------------------------------------------------------------
// ImageEntry derivation — the normalized, render-ready union the panel consumes.
// ----------------------------------------------------------------------------

export interface DeriveImageEntryInput {
  id: string;
  thumbnailUrl?: string;
  // A populated/empty OCR result. `{ noText: true }` is the explicit no-text
  // sentinel; an ImageResult is the populated path.
  ocr?: ImageResult | { noText: true };
  // Present iff the job failed.
  error?: { kind: ErrorKind; message: string };
}

function isNoText(ocr: DeriveImageEntryInput['ocr']): ocr is { noText: true } {
  return !!ocr && 'noText' in ocr && ocr.noText === true;
}

/**
 * Map a per-image job outcome to the ImageEntry union (IMG-05 / D-04):
 *   - error present       → { kind: 'error', errorKind, message }
 *   - no-text sentinel /
 *     missing ocr         → { kind: 'no-text' }
 *   - populated ImageResult → { kind: 'populated', result, lowConfidence }
 * Low confidence is a *populated* entry flagged, never a blank entry.
 */
export function deriveImageEntry(input: DeriveImageEntryInput): ImageEntry {
  const { id, thumbnailUrl, ocr, error } = input;

  if (error) {
    return { kind: 'error', id, thumbnailUrl, errorKind: error.kind, message: error.message };
  }

  if (!ocr || isNoText(ocr)) {
    return { kind: 'no-text', id, thumbnailUrl };
  }

  return {
    kind: 'populated',
    id,
    thumbnailUrl,
    result: ocr,
    lowConfidence: ocr.confidence < LOW_CONFIDENCE_THRESHOLD,
  };
}
