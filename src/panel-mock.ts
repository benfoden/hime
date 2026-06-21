// Shared mock fixtures for the Phase 12 image-OCR pipeline tests.
// Imported by both the side-panel page entry (sidepanel.ts, later plan) and the
// node test harness (test/vision-google.mjs, test/image-resolve.mjs,
// test/panel-render.mjs) so both exercise the same fixtures.
//
// Shapes mirror the real Google Cloud responses (Phase 12 RESEARCH Code
// Examples): Vision `images:annotate` (DOCUMENT_TEXT_DETECTION) and Translation
// v2 (`{ data: { translations: [...] } }`).

import type { ImageResult } from './types.js';

// ----------------------------------------------------------------------------
// XSS probe (T-12-02) — an OCR/translation string carrying an injection payload.
// Seeded now so Plan 04's renderer test proves textContent-only rendering: the
// renderer must show this as inert text, never inject an <img>/<script> element.
// ----------------------------------------------------------------------------

export const XSS_PROBE = 'safe text <img src=x onerror=alert(1)> <script>alert(2)</script> trailing';

// ----------------------------------------------------------------------------
// Vision `images:annotate` response — populated (has text).
// `responses[0].fullTextAnnotation.text` carries line breaks (D-02), and
// `pages[0].property.detectedLanguages[0].languageCode = 'ja'`. Word-level
// `confidence` values average >= 0.6 (the non-low-confidence path).
// ----------------------------------------------------------------------------

export const VISION_POPULATED = {
  responses: [
    {
      fullTextAnnotation: {
        text: 'こんにちは世界\n二行目のテキスト',
        pages: [
          {
            property: {
              detectedLanguages: [{ languageCode: 'ja', confidence: 0.98 }],
            },
            blocks: [
              {
                paragraphs: [
                  {
                    words: [
                      { confidence: 0.95 },
                      { confidence: 0.92 },
                      { confidence: 0.88 },
                      { confidence: 0.9 },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  ],
};

// ----------------------------------------------------------------------------
// Vision response — empty (no text). `responses[0]` has NO fullTextAnnotation:
// the distinct no-text path (do NOT call translate, do NOT throw — Pitfall 4).
// ----------------------------------------------------------------------------

export const VISION_EMPTY = {
  responses: [{}],
};

// ----------------------------------------------------------------------------
// Vision response — low-confidence. fullTextAnnotation present but the word
// confidences average < 0.6, driving the D-04 amber low-confidence badge.
// ----------------------------------------------------------------------------

export const VISION_LOW_CONFIDENCE = {
  responses: [
    {
      fullTextAnnotation: {
        text: 'blurry text maybe',
        pages: [
          {
            property: {
              detectedLanguages: [{ languageCode: 'en', confidence: 0.4 }],
            },
            blocks: [
              {
                paragraphs: [
                  {
                    words: [
                      { confidence: 0.45 },
                      { confidence: 0.5 },
                      { confidence: 0.38 },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  ],
};

// ----------------------------------------------------------------------------
// Translation v2 response sample. `{ data: { translations: [{ translatedText,
// detectedSourceLanguage }] } }` — `format: 'text'` request, source omitted.
// ----------------------------------------------------------------------------

export const TRANSLATE_V2_SAMPLE = {
  data: {
    translations: [
      {
        translatedText: 'Hello world\nSecond line of text',
        detectedSourceLanguage: 'ja',
      },
    ],
  },
};

// ----------------------------------------------------------------------------
// A fully-mapped ImageResult, for renderer/state tests that need the normalized
// shape directly (rather than raw provider responses).
// ----------------------------------------------------------------------------

export const IMAGE_RESULT_POPULATED: ImageResult = {
  originalText: 'こんにちは世界\n二行目のテキスト',
  translatedText: 'Hello world\nSecond line of text',
  detectedLang: 'ja',
  confidence: 0.9125,
  usage: { inputTokens: 0, outputTokens: 0 },
};
