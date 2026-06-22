/**
 * OPT-IN live provider smoke test for the Google Vision OCR path.
 *
 * Drives the REAL GoogleVisionProvider against the REAL Cloud Vision endpoint
 * with a real BYOK key, OCR'ing a bundled text-bearing image. This is the one
 * verification that genuinely cannot be node-mocked: it proves a real Vision OCR
 * call against the shipped bundle. Translation is NOT exercised here — that runs
 * through the main LLM pipeline (covered by the openai/gemini provider tests).
 *
 * Project law (MEMORY: no-service-worker-console-tests): verify hime via a node
 * harness against dist/ with an env-supplied key — NEVER the service-worker
 * console. This file imports the built dist/providers/vision-google.js, exactly
 * what ships.
 *
 * DEFAULT-GREEN: with no GOOGLE_API_KEY set, the live test is SKIPPED, so the
 * standard `npm test` stays green offline and never touches the network or a key.
 *
 * Run live (single line — copy/paste):
 *   GOOGLE_API_KEY=YOUR_KEY node --test test/vision-live.mjs
 *
 * The key's Google Cloud project needs ONLY the Cloud Vision API enabled — a 403
 * here means Vision is disabled/blocked on the key, surfaced as an auth-kind error.
 *
 * SECURITY (T-12-19): the key is read from process.env only, is never
 * interpolated into any console output or assertion message, and is never
 * committed. If a call fails, only the provider's classified error message is
 * surfaced (which omits the key — it lives solely in URL searchParams).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { GoogleVisionProvider } = await import(
  path.join(__dirname, '../dist/providers/vision-google.js')
);

const apiKey = process.env.GOOGLE_API_KEY;
const haveKey = typeof apiKey === 'string' && apiKey.length > 0;

// A small bundled PNG that contains legible text (Japanese: こんにちは / 世界).
const fixturePath = path.join(__dirname, 'fixtures/ocr-sample.png');

test(
  'VIS-01 live: GoogleVisionProvider OCRs a real image via dist/ (opt-in)',
  // No GOOGLE_API_KEY → skip cleanly so the default suite stays green offline.
  { skip: haveKey ? false : 'set GOOGLE_API_KEY to run the live provider smoke' },
  async () => {
    const imageBase64 = readFileSync(fixturePath).toString('base64');
    const provider = new GoogleVisionProvider();

    let result;
    try {
      // OCR-only contract: ocr(imageBase64, mime, apiKey) — translation is the
      // LLM pipeline's job now, NOT the vision provider's. base64 only, NO data:
      // URL prefix (the provider expects raw content).
      result = await provider.ocr(imageBase64, 'image/png', apiKey);
    } catch (err) {
      // Surface ONLY the classified message — never the key. (A 403 here usually
      // means the Cloud Vision API is not enabled on the key's project.)
      const message = err instanceof Error ? err.message : String(err);
      assert.fail(`live ocr threw: ${message}`);
    }

    // The fixture has text, so the provider must NOT return the no-text sentinel.
    assert.ok(result !== null, 'expected a result (image has text), got the no-text sentinel (null)');

    assert.ok(
      typeof result.originalText === 'string' && result.originalText.trim().length > 0,
      'expected non-empty originalText from OCR',
    );
    // detectedLang should be a plausible BCP-47/ISO-ish code (e.g. "ja", "en").
    assert.ok(
      typeof result.detectedLang === 'string' && /^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(result.detectedLang),
      `expected a plausible detectedLang code, got: ${JSON.stringify(result.detectedLang)}`,
    );
  },
);
