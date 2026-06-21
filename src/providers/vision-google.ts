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

import type { VisionProvider, ImageResult } from '../types.js';
import { languageToIso } from '../types.js';
import { classifyError } from '../errors.js';

// Exported so the test asserts the exact URLs (and the worker can reference them).
export const VISION_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';
export const TRANSLATE_V2_ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';

// Per-call timeout. Two sequential ~12s calls stay under the MV3 30s ceiling (A5).
const CALL_TIMEOUT_MS = 12000;

// Distinct no-text sentinel: a text-free image short-circuits here WITHOUT
// calling Translation v2 and WITHOUT throwing (Pitfall 4). The worker maps a
// null return to the panel's no-text state.
type OcrTranslateResult = ImageResult | null;

// --- Raw Google response shapes (subset we consume; not exported) -----------

interface VisionWord {
  confidence?: number;
  symbols?: { confidence?: number }[];
}
interface VisionParagraph {
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
interface TranslateV2Response {
  data?: {
    translations?: { translatedText?: string; detectedSourceLanguage?: string }[];
  };
}

export class GoogleVisionProvider implements VisionProvider {
  name = 'google';

  async ocrTranslate(
    imageBase64: string,
    _mime: string,
    targetLang: string,
    apiKey: string,
  ): Promise<OcrTranslateResult> {
    // --- Call 1: Vision OCR (DOCUMENT_TEXT_DETECTION) ----------------------
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

    // No-text short-circuit: do NOT call Translation v2, do NOT throw (Pitfall 4).
    if (!annotation || originalText.length === 0) {
      return null;
    }

    const confidence = meanWordConfidence(annotation);
    const visionDetectedLang = annotation.pages?.[0]?.property?.detectedLanguages?.[0]?.languageCode;

    // --- Call 2: Translation v2 -------------------------------------------
    const translateUrl = new URL(TRANSLATE_V2_ENDPOINT);
    translateUrl.searchParams.set('key', apiKey);

    const translateData = await this.postJson<TranslateV2Response>(
      translateUrl,
      {
        q: originalText, // verbatim — newlines preserved (D-02).
        target: languageToIso(targetLang),
        format: 'text', // not 'html' — breaks/punct not HTML-escaped.
        // source OMITTED → auto-detect → response carries detectedSourceLanguage.
      },
    );

    const translation = translateData.data?.translations?.[0];
    const translatedText = translation?.translatedText ?? '';
    // Prefer Translation v2's detectedSourceLanguage (reflects what was actually
    // translated); fall back to Vision's per-page detected language (Open Q1).
    const detectedLang = translation?.detectedSourceLanguage ?? visionDetectedLang ?? '';

    return {
      originalText,
      translatedText,
      detectedLang,
      confidence,
      // Char-count usage so the worker's recordUsage('google-vision', ...) has data.
      usage: { inputTokens: originalText.length, outputTokens: translatedText.length },
    };
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
