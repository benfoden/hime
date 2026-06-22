/**
 * node:test harness for overlay-geometry.ts mapBox() coordinate mapping.
 * Subject: dist/overlay-geometry.js (pure module — no chrome.*, no DOM).
 *
 * Run individually: npm run build && node --test test/overlay-geometry.mjs
 * Run as part of full suite: npm test
 *
 * Project law: verify against dist/, NEVER the service-worker console.
 *
 * Tests cover the three-transform mapBox pipeline (OVL-04):
 *   (a) undo downscale: submitted-px → natural-px
 *   (b) object-fit letterbox: natural-px → rendered rect
 *   (c) zero-dim guard: submitted w/h <= 0 → safe zero rect (no NaN)
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadGeometry() {
  return import(path.join(__dirname, '../dist/overlay-geometry.js'));
}

// ---------------------------------------------------------------------------
// OVL-04 Case 1: downscale-undo + object-fit:fill
//
// submitted: 2048x1536 (downscaled from natural 4096x3072)
// natural:   4096x3072
// rendered:  1024x768
// objectFit: 'fill' => independent scaleX/scaleY, no offset
//
// Box in submitted-px: TL(100,100), TR(400,100), BR(400,200), BL(100,200)
//   => left=100, top=100, width=300, height=100
//
// Step (a): upX = 4096/2048 = 2, upY = 3072/1536 = 2
//   natural box: left=200, top=200, width=600, height=200
//
// Step (b): fill: scaleX=1024/4096=0.25, scaleY=768/3072=0.25, offX=0, offY=0
//   result: left=200*0.25=50, top=200*0.25=50, width=600*0.25=150, height=200*0.25=50
// ---------------------------------------------------------------------------
test('OVL-04 fill: downscale-undo + object-fit:fill produces exact quarter-scale result', async () => {
  const { mapBox } = await loadGeometry();

  const box = [
    { x: 100, y: 100 },
    { x: 400, y: 100 },
    { x: 400, y: 200 },
    { x: 100, y: 200 },
  ];
  const result = mapBox(
    box,
    { w: 2048, h: 1536 }, // submitted (post-downscale)
    { w: 4096, h: 3072 }, // natural
    { w: 1024, h: 768 },  // rendered
    'fill',
  );

  // Exact derived values -- no off-by-downscale-factor drift allowed
  assert.equal(result.left,   50,  'left: 200 natural-px * 0.25 fill scaleX');
  assert.equal(result.top,    50,  'top: 200 natural-px * 0.25 fill scaleY');
  assert.equal(result.width,  150, 'width: 600 natural-px * 0.25 fill scaleX');
  assert.equal(result.height, 50,  'height: 200 natural-px * 0.25 fill scaleY');
});

// ---------------------------------------------------------------------------
// OVL-04 Case 2: object-fit:contain -- positive letterbox offsets
//
// submitted: 1000x1000 (no downscale, same as natural)
// natural:   1000x1000
// rendered:  1000x500 (widescreen container, square image)
// objectFit: 'contain' => scale = min(1000/1000, 500/1000) = 0.5
//   offX = (1000 - 1000*0.5)/2 = 250  (image centered horizontally)
//   offY = (500 - 1000*0.5)/2  = 0
//
// Box in submitted-px: left=100, top=100, width=100, height=100
//   result: left=100*0.5+250=300, top=100*0.5+0=50, width=50, height=50
// ---------------------------------------------------------------------------
test('OVL-04 contain: positive letterbox offset centers box inside widescreen container', async () => {
  const { mapBox } = await loadGeometry();

  const box = [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
    { x: 200, y: 200 },
    { x: 100, y: 200 },
  ];
  const result = mapBox(
    box,
    { w: 1000, h: 1000 }, // submitted == natural (no downscale)
    { w: 1000, h: 1000 }, // natural
    { w: 1000, h: 500 },  // rendered: widescreen -- creates top/bottom letterbox
    'contain',
  );

  assert.equal(result.left,   300, 'left: 100*0.5 + 250 letterbox offX');
  assert.equal(result.top,     50, 'top: 100*0.5 + 0 offY');
  assert.equal(result.width,   50, 'width: 100*0.5');
  assert.equal(result.height,  50, 'height: 100*0.5');
});

// ---------------------------------------------------------------------------
// OVL-04 Case 3: object-fit:cover -- negative offset (image overflows)
//
// submitted: 1000x500 (wide, no downscale)
// natural:   1000x500
// rendered:  500x500 (square -- wide image overflows left/right under cover)
// objectFit: 'cover' => scale = max(500/1000, 500/500) = max(0.5, 1) = 1
//   offX = (500 - 1000*1)/2 = -250  (image overflows left+right)
//   offY = (500 - 500*1)/2  = 0
//
// Box in submitted-px: left=0, top=0, width=100, height=100
//   result: left=0*1+(-250)=-250, top=0, width=100, height=100
// ---------------------------------------------------------------------------
test('OVL-04 cover: negative offset when image overflows the rendered container', async () => {
  const { mapBox } = await loadGeometry();

  const box = [
    { x: 0,   y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0,   y: 100 },
  ];
  const result = mapBox(
    box,
    { w: 1000, h: 500 }, // submitted == natural
    { w: 1000, h: 500 }, // natural
    { w: 500,  h: 500 }, // rendered: square -- wide image overflows under cover
    'cover',
  );

  assert.equal(result.left,   -250, 'left: 0*1 + (-250) negative cover offX');
  assert.equal(result.top,       0, 'top: 0*1 + 0');
  assert.equal(result.width,   100, 'width: 100*1');
  assert.equal(result.height,  100, 'height: 100*1');
});

// ---------------------------------------------------------------------------
// OVL-04 Case 4: zero submitted dimension guard -- must not produce NaN
//
// A zero submitted width/height must return a safe zero rect, not NaN/Infinity.
// ---------------------------------------------------------------------------
test('OVL-04 zero-dim guard: submitted w=0 returns safe zero rect, no NaN', async () => {
  const { mapBox } = await loadGeometry();

  const box = [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
    { x: 200, y: 200 },
    { x: 100, y: 200 },
  ];
  const result = mapBox(
    box,
    { w: 0, h: 100 }, // degenerate zero width
    { w: 1000, h: 1000 },
    { w: 500,  h: 500 },
    'fill',
  );

  // Must not be NaN or Infinity
  assert.ok(!isNaN(result.left),   'left must not be NaN');
  assert.ok(!isNaN(result.top),    'top must not be NaN');
  assert.ok(!isNaN(result.width),  'width must not be NaN');
  assert.ok(!isNaN(result.height), 'height must not be NaN');
  assert.ok(isFinite(result.left),   'left must be finite');
  assert.ok(isFinite(result.width),  'width must be finite');
});
