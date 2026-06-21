/**
 * node:test harness for the pure image-resolve utilities (VIS-03 + result-state
 * derivation). Subject: dist/image-resolve.js (lands in Plan 03).
 *
 * Run individually: npm run build && node --test test/image-resolve.mjs
 * Run as part of full suite: npm test
 *
 * Project law: verify against dist/, NEVER the service-worker console.
 *
 * The pure module exposes two complementary API surfaces, both pinned here:
 *   - the Plan 01 scaffold names (targetDimensions / deriveEntryState /
 *     meanConfidence) that operate on a raw Vision response, and
 *   - the Plan 03 contract names (downscaleTarget / deriveImageEntry /
 *     meanWordConfidence / isSupportedMime / needsReencode / stripBase64Prefix)
 *     consumed by the SW's OffscreenCanvas wiring (Plan 05).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { VISION_POPULATED, VISION_EMPTY, VISION_LOW_CONFIDENCE } = await import(
  path.join(__dirname, '../dist/panel-mock.js')
);

async function loadResolve() {
  return import(path.join(__dirname, '../dist/image-resolve.js'));
}

// ---------------------------------------------------------------------------
// VIS-03a: MIME guard accepts supported types and flags unsupported → re-encode.
// ---------------------------------------------------------------------------
test('VIS-03a: MIME guard accepts supported types and flags unsupported for re-encode', async () => {
  const { isSupportedMime, needsReencode } = await loadResolve();
  assert.equal(isSupportedMime('image/png'), true);
  assert.equal(isSupportedMime('image/jpeg'), true);
  // An unsupported type (e.g. svg/avif) must be flagged so the worker re-encodes.
  assert.equal(isSupportedMime('image/svg+xml'), false);
  assert.equal(needsReencode('image/avif'), true);
  assert.equal(needsReencode('image/png'), false);
  // Membership is case-insensitive.
  assert.equal(isSupportedMime('IMAGE/PNG'), true);
});

// ---------------------------------------------------------------------------
// VIS-03b: downscale long-edge math caps at the configured long edge and keeps
//          the result within Vision's pixel limits.
// ---------------------------------------------------------------------------
test('VIS-03b: downscale long-edge math caps at the configured long edge', async () => {
  const { targetDimensions, downscaleTarget, VISION_LONG_EDGE } = await loadResolve();
  const maxEdge = 1024;
  // Landscape image larger than the cap: long edge clamps to maxEdge, aspect kept.
  const out = targetDimensions(4000, 2000, maxEdge);
  assert.equal(Math.max(out.width, out.height), maxEdge, 'long edge must clamp to maxEdge');
  assert.ok(Math.abs(out.width / out.height - 4000 / 2000) < 0.02, 'aspect ratio preserved');
  // An already-small image is left unchanged (no upscaling).
  const small = targetDimensions(640, 480, maxEdge);
  assert.equal(small.width, 640);
  assert.equal(small.height, 480);

  // downscaleTarget defaults to VISION_LONG_EDGE and reports scaled state.
  assert.ok(VISION_LONG_EDGE > 0);
  const big = downscaleTarget(4000, 3000);
  assert.equal(Math.max(big.width, big.height), VISION_LONG_EDGE, 'long edge clamps to VISION_LONG_EDGE');
  assert.ok(Math.abs(big.width / big.height - 4000 / 3000) < 0.02, 'aspect ratio preserved');
  assert.equal(big.scaled, true);
  const keep = downscaleTarget(1000, 800);
  assert.equal(keep.width, 1000);
  assert.equal(keep.height, 800);
  assert.equal(keep.scaled, false);
});

// ---------------------------------------------------------------------------
// VIS-03d: base64 prefix stripping to Vision's content form.
// ---------------------------------------------------------------------------
test('VIS-03d: stripBase64Prefix removes the data URL prefix and leaves bare b64', async () => {
  const { stripBase64Prefix } = await loadResolve();
  assert.equal(stripBase64Prefix('data:image/png;base64,AAAB'), 'AAAB');
  assert.equal(stripBase64Prefix('AAAB'), 'AAAB');
  // A blob/data URL with a charset segment still strips at the comma.
  assert.equal(stripBase64Prefix('data:image/jpeg;base64,/9j/4AAQ'), '/9j/4AAQ');
});

// ---------------------------------------------------------------------------
// VIS-03c: result-state derivation — empty→no-text, mean confidence <0.60→
//          low-confidence, error→error; confidence computed word→symbol→page.
// ---------------------------------------------------------------------------
test('VIS-03c: result-state derivation maps empty / low-confidence / error', async () => {
  const { deriveEntryState, meanConfidence, meanWordConfidence } = await loadResolve();

  // Empty Vision response → no-text.
  assert.equal(deriveEntryState(VISION_EMPTY), 'no-text');

  // Populated, high mean confidence → populated (not low-confidence).
  assert.ok(meanConfidence(VISION_POPULATED) >= 0.6);
  assert.equal(deriveEntryState(VISION_POPULATED), 'populated');

  // Low mean confidence → low-confidence.
  assert.ok(meanConfidence(VISION_LOW_CONFIDENCE) < 0.6);
  assert.equal(deriveEntryState(VISION_LOW_CONFIDENCE), 'low-confidence');

  // meanWordConfidence operates on a fullTextAnnotation directly.
  const fta = VISION_POPULATED.responses[0].fullTextAnnotation;
  assert.ok(meanWordConfidence(fta) >= 0.6);
  assert.ok(meanWordConfidence(VISION_LOW_CONFIDENCE.responses[0].fullTextAnnotation) < 0.6);
  // No words → symbol/page fallback without throwing.
  const noWords = { pages: [{ confidence: 0.7, blocks: [{ paragraphs: [{ words: [] }] }] }] };
  assert.doesNotThrow(() => meanWordConfidence(noWords));
  assert.ok(meanWordConfidence(noWords) > 0);
});

// ---------------------------------------------------------------------------
// IMG-05 / D-04: deriveImageEntry maps {ocr|empty|error} → the ImageEntry union;
// low-confidence is a *populated* entry flagged, never a blank.
// ---------------------------------------------------------------------------
test('IMG-05: deriveImageEntry yields no-text / populated / low-confidence / error', async () => {
  const { deriveImageEntry } = await loadResolve();

  // Empty OCR → no-text; id + thumbnail pass through.
  const noText = deriveImageEntry({ id: 'a', thumbnailUrl: 'blob:t', ocr: { noText: true } });
  assert.equal(noText.kind, 'no-text');
  assert.equal(noText.id, 'a');
  assert.equal(noText.thumbnailUrl, 'blob:t');

  // Populated with conf >= threshold → populated, lowConfidence false.
  const hi = deriveImageEntry({
    id: 'b',
    ocr: { originalText: 'x', translatedText: 'y', detectedLang: 'ja', confidence: 0.9 },
  });
  assert.equal(hi.kind, 'populated');
  assert.equal(hi.lowConfidence, false);
  assert.equal(hi.result.confidence, 0.9);

  // Populated with conf < threshold → populated, lowConfidence true (not blank).
  const lo = deriveImageEntry({
    id: 'c',
    ocr: { originalText: 'x', translatedText: 'y', detectedLang: 'ja', confidence: 0.4 },
  });
  assert.equal(lo.kind, 'populated');
  assert.equal(lo.lowConfidence, true);

  // Error input → error entry carrying kind + message.
  const err = deriveImageEntry({ id: 'd', error: { kind: 'network', message: 'offline' } });
  assert.equal(err.kind, 'error');
  assert.equal(err.errorKind, 'network');
  assert.equal(err.message, 'offline');
  assert.equal(err.id, 'd');
});
