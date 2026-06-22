// Google Cloud Vision + Translation v2 provider for hime (Phase 12 / v1.3).
//
// Implements VisionProvider with a two-call, one-key sequence behind a single
// ocrTranslate() method (mirrors OpenAIProvider's AbortController/timeout/
// classifyError shape; mirrors brave-search.ts's ?key= auth via
// URL.searchParams.set):
//   1. Vision images:annotate (DOCUMENT_TEXT_DETECTION) → OCR text + detected
//      language + per-word confidence.
//   2. Cloud Translation v2 → translation + detectedSourceLanguage.
// Both authenticate with the SAME BYOK Google Cloud key via ?key=. No SDK, no
// runtime deps.
//
// SECURITY (T-12-03 / IMG-07): the apiKey is set via URL.searchParams.set('key',
// apiKey) — auto-encoded, never string-interpolated, never logged. classifyError
// surfaces only a classified message (status + provider), never the raw key.
//
// A5 (T-12-05): each Google call gets its own AbortController/timeout (~12s) so
// the two-call sequence stays under the MV3 30s fetch ceiling and neither call
// can silently hang the worker — a timeout maps to a network-kind error.

import type { VisionProvider, OcrResult } from '../types.js';
import { classifyError } from '../errors.js';
import { collectParagraphBoxes } from '../image-resolve.js';

// Exported so the test asserts the exact URL (and the worker can reference it).
export const VISION_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

// Per-call timeout — keeps a single Vision call well under the MV3 30s ceiling (A5).
const CALL_TIMEOUT_MS = 12000;

// A 1×1 transparent PNG (base64, no data: prefix) used only by testConnection as
// a minimal Vision probe — a valid key returns 200 with an empty annotation, no
// readable text required.
const PROBE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// Distinct no-text sentinel: a text-free image short-circuits here WITHOUT
// throwing (Pitfall 4). The worker maps a null return to the panel's no-text state.
type OcrOnlyResult = OcrResult | null;

// --- Raw Google response shapes (subset we consume; not exported) -----------

interface VisionWord {
  confidence?: number;
  symbols?: {
    text?: string;
    confidence?: number;
    property?: { detectedBreak?: { type?: string } };
  }[];
}
interface VisionParagraph {
  boundingBox?: {
    vertices?: { x?: number; y?: number }[];
    normalizedVertices?: { x?: number; y?: number }[];
  };
  words?: VisionWord[];
}
interface VisionBlock {
  paragraphs?: VisionParagraph[];
}
interface VisionPage {
  confidence?: number;
  property?: { detectedLanguages?: { languageCode?: string }[] };
  blocks?: VisionBlock[];
}
interface VisionFullTextAnnotation {
  text?: string;
  pages?: VisionPage[];
}
interface VisionAnnotateResponse {
  responses?: { fullTextAnnotation?: VisionFullTextAnnotation }[];
}

export class GoogleVisionProvider implements VisionProvider {
  name = 'google';

  /**
   * OCR an image with Vision DOCUMENT_TEXT_DETECTION and return the extracted
   * source text + detection metadata. Does NOT translate — the worker routes
   * originalText through the main LLM TranslationProvider. A text-free image
   * returns the no-text sentinel `null` (no throw, Pitfall 4). The key needs
   * only the Cloud Vision API enabled.
   */
  async ocr(imageBase64: string, _mime: string, apiKey: string): Promise<OcrOnlyResult> {
    const visionUrl = new URL(VISION_ENDPOINT);
    visionUrl.searchParams.set('key', apiKey); // encoded; never interpolated/logged.

    const visionData = await this.postJson<VisionAnnotateResponse>(
      visionUrl,
      {
        requests: [
          {
            // base64 only — NO data: URL prefix.
            image: { content: imageBase64 },
            // languageHints intentionally OMITTED → auto-detect (IMG-03).
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          },
        ],
      },
    );

    const annotation = visionData.responses?.[0]?.fullTextAnnotation;
    const originalText = annotation?.text ?? '';

    // No-text short-circuit: do NOT throw (Pitfall 4).
    if (!annotation || originalText.length === 0) {
      return null;
    }

    const confidence = meanWordConfidence(annotation);
    const detectedLang = annotation.pages?.[0]?.property?.detectedLanguages?.[0]?.languageCode ?? '';

    // Phase 16 OVL-01: extract per-paragraph overlay blocks via the Plan 01
    // pure extractor. annotation is VisionFullTextAnnotation which matches the
    // FullTextAnnotation shape expected by collectParagraphBoxes (same tree:
    // pages → blocks → paragraphs → words → symbols). The result is added to
    // OcrResult.blocks; the v1.3 side-panel path ignores it (D-04).
    const blocks = collectParagraphBoxes(annotation as Parameters<typeof collectParagraphBoxes>[0]);

    return {
      originalText,
      detectedLang,
      confidence,
      // Char-count OCR usage so the worker's recordUsage('google-vision', ...) has data.
      usage: { inputTokens: originalText.length, outputTokens: 0 },
      blocks,
    };
  }

  /**
   * Connection test for the BYOK vision key (VIS-02). Probes the Vision endpoint
   * only — translation no longer runs through this key (the LLM pipeline owns it),
   * so the key needs ONLY the Cloud Vision API enabled. Resolves on success;
   * rejects with a classified Error (.kind / .status, key never in the message)
   * on any failure, mirroring postJson's throw shape so the worker treats it like
   * ocr(). The probe is a 1×1 transparent PNG — a valid key returns 200 with an
   * empty annotation (no readable text needed) but DOES bill against the key.
   */
  async testConnection(apiKey: string): Promise<void> {
    const visionUrl = new URL(VISION_ENDPOINT);
    visionUrl.searchParams.set('key', apiKey); // encoded; never interpolated/logged.
    await this.postJson<unknown>(visionUrl, {
      requests: [
        {
          image: { content: PROBE_PNG_BASE64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        },
      ],
    });
  }

  /**
   * POST a JSON body to a Google endpoint and return the parsed JSON.
   * Wraps the openai.ts AbortController/timeout/try-catch shape: a fetch throw →
   * classifyError('google', err); a !response.ok → classifyError with the
   * extracted body.error.message. The thrown Error carries .kind (and .status);
   * the apiKey is never included in any thrown message (it lives only in the URL
   * searchParams, which is not surfaced).
   */
  private async postJson<T>(url: URL, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);

    try {
      let response: Response;
      try {
        response = await fetch(url.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        const c = classifyError('google', err);
        const e = new Error(c.message);
        (e as Error & { kind?: string }).kind = c.kind;
        throw e;
      }

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const bodyMessage = (errBody as { error?: { message?: string } })?.error?.message;
        const c = classifyError('google', null, { status: response.status, bodyMessage });
        const e = new Error(c.message);
        (e as Error & { kind?: string; status?: number }).kind = c.kind;
        (e as Error & { kind?: string; status?: number }).status = c.status;
        throw e;
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Mean word-level OCR confidence in 0..1 for the D-04 amber badge.
 * Averages word confidences across all pages/blocks/paragraphs; falls back to
 * symbol-level mean, then page-level confidence, then 1 (no signal → not flagged).
 *
 * NOTE: the canonical exported meanWordConfidence lives in image-resolve.ts
 * (Plan 03); this private copy keeps the provider self-contained for its own
 * test. The worker may prefer the Plan 03 version.
 */
function meanWordConfidence(annotation: VisionFullTextAnnotation): number {
  const pages = annotation.pages ?? [];
  const wordConfs: number[] = [];
  const symbolConfs: number[] = [];

  for (const page of pages) {
    for (const block of page.blocks ?? []) {
      for (const para of block.paragraphs ?? []) {
        for (const word of para.words ?? []) {
          if (typeof word.confidence === 'number') wordConfs.push(word.confidence);
          for (const sym of word.symbols ?? []) {
            if (typeof sym.confidence === 'number') symbolConfs.push(sym.confidence);
          }
        }
      }
    }
  }

  if (wordConfs.length > 0) return mean(wordConfs);
  if (symbolConfs.length > 0) return mean(symbolConfs);

  const pageConfs = pages
    .map((p) => p.confidence)
    .filter((c): c is number => typeof c === 'number');
  if (pageConfs.length > 0) return mean(pageConfs);

  return 1;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
