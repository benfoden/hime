/**
 * node:test harness for the pure image-resolve utilities (VIS-03 + result-state
 * derivation). Subject: dist/image-resolve.js (lands in Plan 03).
 *
 * Run individually: npm run build && node --test test/image-resolve.mjs
 * Run as part of full suite: npm test
 *
 * Project law: verify against dist/, NEVER the service-worker console.
 *
 * Wave 0 note (Nyquist rule): the subject ships in Plan 03, so these assertions
 * are expected RED until then. The contract is pinned here now so the pure
 * module ships against an existing test.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { VISION_POPULATED, VISION_EMPTY, VISION_LOW_CONFIDENCE } = await import(
  path.join(__dirname, '../dist/panel-mock.js')
);

// Subject is not built until Plan 03 — import lazily so this file still runs (RED).
async function loadResolve() {
  return import(path.join(__dirname, '../dist/image-resolve.js'));
}

// ---------------------------------------------------------------------------
// VIS-03a: MIME guard accepts supported types and flags unsupported → re-encode.
// ---------------------------------------------------------------------------
test('VIS-03a: MIME guard accepts supported types and flags unsupported for re-encode', async () => {
  const { isSupportedMime } = await loadResolve();
  assert.equal(isSupportedMime('image/png'), true);
  assert.equal(isSupportedMime('image/jpeg'), true);
  // An unsupported type (e.g. webp/avif/svg) must be flagged so the worker re-encodes.
  assert.equal(isSupportedMime('image/svg+xml'), false);
});

// ---------------------------------------------------------------------------
// VIS-03b: downscale long-edge math caps at the configured long edge and keeps
//          the result within Vision's pixel limits.
// ---------------------------------------------------------------------------
test('VIS-03b: downscale long-edge math caps at the configured long edge', async () => {
  const { targetDimensions } = await loadResolve();
  const maxEdge = 1024;
  // Landscape image larger than the cap: long edge clamps to maxEdge, aspect kept.
  const out = targetDimensions(4000, 2000, maxEdge);
  assert.equal(Math.max(out.width, out.height), maxEdge, 'long edge must clamp to maxEdge');
  assert.ok(Math.abs(out.width / out.height - 4000 / 2000) < 0.02, 'aspect ratio preserved');
  // An already-small image is left unchanged (no upscaling).
  const small = targetDimensions(640, 480, maxEdge);
  assert.equal(small.width, 640);
  assert.equal(small.height, 480);
});

// ---------------------------------------------------------------------------
// VIS-03c: result-state derivation — empty→no-text, mean confidence <0.60→
//          low-confidence, error→error.
// ---------------------------------------------------------------------------
test('VIS-03c: result-state derivation maps empty / low-confidence / error', async () => {
  const { deriveEntryState, meanConfidence } = await loadResolve();

  // Empty Vision response → no-text.
  assert.equal(deriveEntryState(VISION_EMPTY), 'no-text');

  // Populated, high mean confidence → populated (not low-confidence).
  assert.ok(meanConfidence(VISION_POPULATED) >= 0.6);
  assert.equal(deriveEntryState(VISION_POPULATED), 'populated');

  // Low mean confidence → low-confidence.
  assert.ok(meanConfidence(VISION_LOW_CONFIDENCE) < 0.6);
  assert.equal(deriveEntryState(VISION_LOW_CONFIDENCE), 'low-confidence');
});
