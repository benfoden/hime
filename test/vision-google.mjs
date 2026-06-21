/**
 * node:test harness for the Google Vision + Translation v2 provider (VIS-01).
 * Subject: dist/providers/vision-google.js (lands in Plan 02).
 *
 * Run individually: npm run build && node --test test/vision-google.mjs
 * Run as part of full suite: npm test
 *
 * Project law: verify against dist/, NEVER the service-worker console.
 *
 * Wave 0 note (Nyquist rule): the subject ships in Plan 02, so the assertions
 * that drive `GoogleVisionProvider` are expected RED until then. The fixtures
 * load now, and the request/response contract is pinned here so the subject
 * ships against a test that already exists.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { VISION_POPULATED, VISION_EMPTY, TRANSLATE_V2_SAMPLE } = await import(
  path.join(__dirname, '../dist/panel-mock.js')
);

// Subject is not built until Plan 02 — import lazily so this file still runs
// (RED) instead of crashing at top-level import.
async function loadProvider() {
  return import(path.join(__dirname, '../dist/providers/vision-google.js'));
}

/** Install a fetch stub that records calls and replays queued JSON responses. */
function stubFetch(responses) {
  const calls = [];
  const original = globalThis.fetch;
  let i = 0;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const body = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return {
      ok: true,
      status: 200,
      json: async () => body,
    };
  };
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

// ---------------------------------------------------------------------------
// VIS-01a: ocrTranslate POSTs to VISION_ENDPOINT (?key=) with a
//          DOCUMENT_TEXT_DETECTION body, then to TRANSLATE_V2_ENDPOINT with
//          q / target / format:'text', and maps both responses → ImageResult.
// ---------------------------------------------------------------------------
test('VIS-01a: ocrTranslate hits Vision then Translation v2 and maps to ImageResult', async () => {
  const { GoogleVisionProvider, VISION_ENDPOINT, TRANSLATE_V2_ENDPOINT } = await loadProvider();
  const stub = stubFetch([VISION_POPULATED, TRANSLATE_V2_SAMPLE]);
  try {
    const provider = new GoogleVisionProvider();
    const result = await provider.ocrTranslate('YmFzZTY0', 'image/png', 'en', 'SECRET_KEY');

    assert.equal(stub.calls.length, 2, 'expected exactly two network calls');

    // Call 1 → Vision images:annotate, ?key=, DOCUMENT_TEXT_DETECTION
    assert.ok(stub.calls[0].url.startsWith(VISION_ENDPOINT), 'first call must target VISION_ENDPOINT');
    assert.ok(stub.calls[0].url.includes('key='), 'Vision call must carry ?key=');
    const visionBody = JSON.parse(stub.calls[0].init.body);
    assert.equal(visionBody.requests[0].features[0].type, 'DOCUMENT_TEXT_DETECTION');

    // Call 2 → Translation v2, q/target/format:'text'
    assert.ok(stub.calls[1].url.startsWith(TRANSLATE_V2_ENDPOINT), 'second call must target TRANSLATE_V2_ENDPOINT');
    const transBody = JSON.parse(stub.calls[1].init.body);
    assert.ok('q' in transBody, 'translation body must carry q');
    assert.equal(transBody.target, 'en');
    assert.equal(transBody.format, 'text');

    // Mapped ImageResult
    assert.equal(typeof result.originalText, 'string');
    assert.ok(result.originalText.length > 0);
    assert.equal(result.translatedText, 'Hello world\nSecond line of text');
    assert.equal(result.detectedLang, 'ja');
    assert.ok(result.confidence >= 0.6, 'populated fixture should be high-confidence');
  } finally {
    stub.restore();
  }
});

// ---------------------------------------------------------------------------
// VIS-01b: VISION_EMPTY → no-text path: NO second (translation) call, and a
//          no-text sentinel is returned rather than an error being thrown.
// ---------------------------------------------------------------------------
test('VIS-01b: empty Vision response yields the no-text path with no translation call', async () => {
  const { GoogleVisionProvider } = await loadProvider();
  const stub = stubFetch([VISION_EMPTY]);
  try {
    const provider = new GoogleVisionProvider();
    const result = await provider.ocrTranslate('YmFzZTY0', 'image/png', 'en', 'SECRET_KEY');
    assert.equal(stub.calls.length, 1, 'no-text path must NOT call Translation v2');
    // Subject signals no-text (exact sentinel shape defined by Plan 02). Either a
    // falsy result or an explicit noText marker is acceptable; it must NOT throw.
    assert.ok(result == null || result.noText === true || result.originalText === '', 'expected a no-text sentinel');
  } finally {
    stub.restore();
  }
});

// ---------------------------------------------------------------------------
// VIS-01c (IMG-07): the API key never appears in a thrown error string.
// ---------------------------------------------------------------------------
test('VIS-01c: the API key never leaks into a thrown error message', async () => {
  const { GoogleVisionProvider } = await loadProvider();
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('network down');
  };
  try {
    const provider = new GoogleVisionProvider();
    const SECRET = 'super-secret-google-key';
    await provider
      .ocrTranslate('YmFzZTY0', 'image/png', 'en', SECRET)
      .then(() => assert.fail('expected ocrTranslate to reject'))
      .catch((err) => {
        const text = `${err?.message ?? ''} ${err?.stack ?? ''}`;
        assert.ok(!text.includes(SECRET), 'API key must never appear in a thrown error');
      });
  } finally {
    globalThis.fetch = original;
  }
});
