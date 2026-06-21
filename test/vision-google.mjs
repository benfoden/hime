/**
 * node:test harness for the Google Vision + Translation v2 provider (VIS-01).
 * Subject: dist/providers/vision-google.js (lands in Plan 02).
 *
 * Run individually: npm run build && node --test test/vision-google.mjs
 * Run as part of full suite: npm test
 *
 * Project law: verify against dist/, NEVER the service-worker console.
 *
 * Pins the full two-call provider contract: Vision images:annotate
 * (DOCUMENT_TEXT_DETECTION, ?key=) → Translation v2 (q/target/format:'text',
 * ?key=, source omitted) → normalized ImageResult. Also pins the no-text
 * short-circuit (Translation v2 NOT called), the low-confidence number, the
 * classifyError('google', ...) → {kind:'auth'} mapping on !response.ok, and the
 * IMG-07 key-safety invariant (key absent from any thrown error message/stack).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { VISION_POPULATED, VISION_EMPTY, VISION_LOW_CONFIDENCE } =
  await import(path.join(__dirname, '../dist/panel-mock.js'));

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

/** Install a fetch stub that returns a non-ok response with the given status/body. */
function stubFetchError(status, body) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return {
      ok: false,
      status,
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
// VIS-01a: ocr() POSTs to VISION_ENDPOINT (?key=) with a DOCUMENT_TEXT_DETECTION
//          body (image.content === base64, NO data: prefix) and maps the response
//          → OcrResult (originalText verbatim w/ breaks, Vision-detected lang,
//          confidence). It does NOT translate — only ONE network call (the LLM
//          pipeline owns translation now).
// ---------------------------------------------------------------------------
test('VIS-01a: ocr hits Vision only and maps to OcrResult', async () => {
  const { GoogleVisionProvider, VISION_ENDPOINT } = await loadProvider();
  const stub = stubFetch([VISION_POPULATED]);
  try {
    const provider = new GoogleVisionProvider();
    assert.equal(provider.name, 'google');
    const result = await provider.ocr('YmFzZTY0', 'image/png', 'SECRET_KEY');

    assert.equal(stub.calls.length, 1, 'ocr must make exactly ONE network call (no translation)');

    // Vision images:annotate, ?key=, DOCUMENT_TEXT_DETECTION
    assert.ok(stub.calls[0].url.startsWith(VISION_ENDPOINT), 'call must target VISION_ENDPOINT');
    assert.ok(stub.calls[0].url.includes('key='), 'Vision call must carry ?key=');
    const visionBody = JSON.parse(stub.calls[0].init.body);
    assert.equal(visionBody.requests[0].features[0].type, 'DOCUMENT_TEXT_DETECTION');
    // base64 is passed verbatim into image.content with NO data: URL prefix.
    assert.equal(visionBody.requests[0].image.content, 'YmFzZTY0');
    assert.ok(!String(visionBody.requests[0].image.content).startsWith('data:'), 'no data: prefix');

    // Mapped OcrResult — no translatedText (translation is the LLM's job).
    assert.equal(typeof result.originalText, 'string');
    assert.equal(result.originalText, 'こんにちは世界\n二行目のテキスト', 'originalText is fullTextAnnotation.text verbatim');
    assert.ok(result.originalText.includes('\n'), 'OCR newline preserved into originalText');
    assert.equal(result.translatedText, undefined, 'ocr() must NOT translate');
    assert.equal(result.detectedLang, 'ja', 'detectedLang from Vision pages[0].property.detectedLanguages');
    assert.ok(result.confidence >= 0.6, 'populated fixture should be high-confidence');
    assert.ok(result.usage, 'OCR usage present for recordUsage');
  } finally {
    stub.restore();
  }
});

// ---------------------------------------------------------------------------
// VIS-01b: VISION_EMPTY → no-text sentinel (null) rather than a throw.
// ---------------------------------------------------------------------------
test('VIS-01b: empty Vision response yields the no-text sentinel', async () => {
  const { GoogleVisionProvider } = await loadProvider();
  const stub = stubFetch([VISION_EMPTY]);
  try {
    const provider = new GoogleVisionProvider();
    const result = await provider.ocr('YmFzZTY0', 'image/png', 'SECRET_KEY');
    assert.equal(stub.calls.length, 1, 'one Vision call');
    assert.equal(result, null, 'expected the no-text sentinel (null), must NOT throw');
  } finally {
    stub.restore();
  }
});

// ---------------------------------------------------------------------------
// VIS-01d (D-04): low-confidence OCR reports a confidence number < 0.60. The
//          amber badge is applied downstream — the provider just reports it.
// ---------------------------------------------------------------------------
test('VIS-01d: low-confidence OCR reports confidence < 0.60', async () => {
  const { GoogleVisionProvider } = await loadProvider();
  const stub = stubFetch([VISION_LOW_CONFIDENCE]);
  try {
    const provider = new GoogleVisionProvider();
    const result = await provider.ocr('YmFzZTY0', 'image/png', 'SECRET_KEY');
    assert.equal(stub.calls.length, 1, 'one Vision call');
    assert.ok(result.originalText.length > 0, 'low-confidence has text');
    assert.ok(result.confidence < 0.6, `expected confidence < 0.60, got ${result.confidence}`);
  } finally {
    stub.restore();
  }
});

// ---------------------------------------------------------------------------
// VIS-01e (IMG-05): a !response.ok (403) routes through classifyError('google')
//          → the rejected error carries .kind === 'auth'.
// ---------------------------------------------------------------------------
test('VIS-01e: a 403 Vision response rejects with a classified auth error', async () => {
  const { GoogleVisionProvider } = await loadProvider();
  const stub = stubFetchError(403, { error: { message: 'permission denied' } });
  try {
    const provider = new GoogleVisionProvider();
    await provider
      .ocr('YmFzZTY0', 'image/png', 'SECRET_KEY')
      .then(() => assert.fail('expected ocr to reject on 403'))
      .catch((err) => {
        assert.equal(err.kind, 'auth', 'classifyError maps 403 → auth');
      });
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
      .ocr('YmFzZTY0', 'image/png', SECRET)
      .then(() => assert.fail('expected ocr to reject'))
      .catch((err) => {
        const text = `${err?.message ?? ''} ${err?.stack ?? ''}`;
        assert.ok(!text.includes(SECRET), 'API key must never appear in a thrown error');
      });
  } finally {
    globalThis.fetch = original;
  }
});

// ---------------------------------------------------------------------------
// VIS-02a (VIS-02): testConnection probes the Vision endpoint ONLY (?key=) and
//          resolves on 200. Translation no longer runs through this key, so the
//          key needs only the Cloud Vision API enabled.
// ---------------------------------------------------------------------------
test('VIS-02a: testConnection probes Vision only and resolves on success', async () => {
  const { GoogleVisionProvider, VISION_ENDPOINT } = await loadProvider();
  const stub = stubFetch([VISION_EMPTY]);
  try {
    const provider = new GoogleVisionProvider();
    await provider.testConnection('SECRET_KEY');
    assert.equal(stub.calls.length, 1, 'testConnection must call ONLY the Vision endpoint');
    assert.ok(stub.calls[0].url.startsWith(VISION_ENDPOINT), 'call must target VISION_ENDPOINT');
    assert.ok(stub.calls[0].url.includes('key=SECRET_KEY'), 'Vision probe must carry ?key=');
  } finally {
    stub.restore();
  }
});

// ---------------------------------------------------------------------------
// VIS-02b (VIS-02): an invalid key (403) rejects with a classified auth error.
// ---------------------------------------------------------------------------
test('VIS-02b: testConnection rejects with a classified auth error on a 403', async () => {
  const { GoogleVisionProvider } = await loadProvider();
  const stub = stubFetchError(403, { error: { message: 'API key not valid' } });
  try {
    const provider = new GoogleVisionProvider();
    await provider
      .testConnection('BAD_KEY')
      .then(() => assert.fail('expected testConnection to reject on 403'))
      .catch((err) => {
        assert.equal(err.kind, 'auth', 'classifyError maps 403 → auth');
      });
    assert.equal(stub.calls.length, 1, 'one Vision probe');
  } finally {
    stub.restore();
  }
});

// ---------------------------------------------------------------------------
// VIS-02c (IMG-07): the key never appears in a testConnection error string.
// ---------------------------------------------------------------------------
test('VIS-02c: the API key never leaks into a testConnection error message', async () => {
  const { GoogleVisionProvider } = await loadProvider();
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('network down');
  };
  try {
    const provider = new GoogleVisionProvider();
    const SECRET = 'super-secret-google-key';
    await provider
      .testConnection(SECRET)
      .then(() => assert.fail('expected testConnection to reject'))
      .catch((err) => {
        const text = `${err?.message ?? ''} ${err?.stack ?? ''}`;
        assert.ok(!text.includes(SECRET), 'API key must never appear in a thrown error');
      });
  } finally {
    globalThis.fetch = original;
  }
});
