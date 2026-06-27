/**
 * node:test harness for overlay-fit.ts fitText() shrink-to-fit logic.
 * Subject: dist/overlay-fit.js (pure module -- no chrome.*, no DOM, no canvas).
 *
 * Run individually: npm run build && node --test test/overlay-fit.mjs
 * Run as part of full suite: npm test
 *
 * Project law: verify against dist/, NEVER the service-worker console.
 *
 * Tests cover the fitText binary-search pipeline (OVL-05):
 *   - fits:    short text in a generous box -> maxFont, clamped=false
 *   - shrinks: long text in a small box -> font strictly between min and max
 *   - clamps:  text that overflows even at minFont -> minFont, clamped=true
 *   - CJK:     no-space string wraps per-character (lines.length > 1)
 *
 * Stub measure: (text, fontPx) => text.length * fontPx
 *   (deterministic -- no canvas needed)
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadFit() {
  return import(path.join(__dirname, '../dist/overlay-fit.js'));
}

// Deterministic stub: measure(text, fontPx) = text.length * fontPx
// CJK chars are each 1 character so this simulates ~1em/char width correctly.
const stub = (text, fontPx) => text.length * fontPx;

// ---------------------------------------------------------------------------
// OVL-05 Case 1: fits -- short text in a generous box => maxFont, clamped=false
//
// text: "Hi" (2 chars), boxW=200, boxH=200
// defaults: maxFont=28, minFont=9, lineHeight=1.2, pad=4
//
// At fontPx=28: measure("Hi", 28)=2*28=56 <= 200-8=192. 1 line.
// Height check: 1*28*1.2=33.6 <= 192. Fits.
// Binary search finds fontPx=28 (maxFont). clamped=false.
// ---------------------------------------------------------------------------
test('OVL-05 fits: short text in generous box returns maxFont, clamped=false', async () => {
  const { fitText } = await loadFit();

  const result = fitText('Hi', 200, 200, stub);

  assert.equal(result.fontPx,  28,    'short text fits at maxFont=28');
  assert.equal(result.clamped, false, 'does not clamp when text fits');
  assert.ok(result.lines.length >= 1, 'at least one line');
  assert.equal(result.lines.join(' '), 'Hi', 'text content preserved in lines');
});

// ---------------------------------------------------------------------------
// OVL-05 Case 2: shrinks -- long multi-word text in small box => font strictly
// between minFont and maxFont, clamped=false.
//
// text: "A B C D E F" (6 single-char words), boxW=100, boxH=60
// defaults: maxFont=28, minFont=9, lineHeight=1.2, pad=4
// budget_w=92, budget_h=52
//
// Derived: fontPx=18 is the largest fitting size (see test header analysis).
//   At fontPx=18: "A B C" = 5*18=90 <= 92 -> "A B C D"=7*18=126>92 -> line1="A B C"
//   "D E F" = 5*18=90 <= 92 -> line2="D E F"
//   Lines=2. Height: 2*18*1.2=43.2 <= 52. Fits.
//   At fontPx=19: too tall (see analysis).
// ---------------------------------------------------------------------------
test('OVL-05 shrinks: multi-word text in small box returns font strictly between min and max', async () => {
  const { fitText } = await loadFit();

  const result = fitText('A B C D E F', 100, 60, stub);

  assert.ok(result.fontPx > 9,  'font above minFont (not at floor)');
  assert.ok(result.fontPx < 28, 'font below maxFont (shrank)');
  assert.equal(result.clamped, false, 'not clamped -- fits at chosen font');
  assert.ok(result.lines.length > 1, 'wrapped into multiple lines');
});

// ---------------------------------------------------------------------------
// OVL-05 Case 3: clamps -- text overflows even at minFont => fontPx=9, clamped=true
//
// text: "AAAAAAAAAA BBBBBBBBBB CCCCCCCCCC DDDDDDDDDD" (4 x 10-char words)
// boxW=20, boxH=10 -- intentionally tiny
// budget_w=12, budget_h=2
//
// At minFont=9: any word alone ("AAAAAAAAAA"=10*9=90) > budget_w=12.
//   Each word is oversized but still goes in its own line (never silently dropped).
//   4 lines. Height: 4*9*1.2=43.2 > 2. Overflows.
// Result: fontPx=9 (minFont floor honored), clamped=true.
// ---------------------------------------------------------------------------
test('OVL-05 clamps: text overflowing even at minFont returns fontPx=9 and clamped=true', async () => {
  const { fitText } = await loadFit();

  const result = fitText(
    'AAAAAAAAAA BBBBBBBBBB CCCCCCCCCC DDDDDDDDDD',
    20,
    10,
    stub,
  );

  assert.equal(result.fontPx,  9,    'fontPx is minFont floor (9), never below');
  assert.equal(result.clamped, true, 'clamped=true when overflows even at minFont');
});

// ---------------------------------------------------------------------------
// OVL-05 Case 4: CJK -- no-space string wraps per-character, not as one blob
//
// text: "ABCDEF" with no spaces, opts.cjk=true, boxW=50, boxH=200
// (using ASCII chars -- the wrap mode is driven by opts.cjk, not Unicode detection)
// budget_w=42, budget_h=192
//
// With cjk=true, the wrap is per-character (each char is a potential break point).
// At a sufficiently large font, 6 chars can't all fit on one 42-wide line:
//   e.g. at fontPx=28: 1 char=28 <= 42, 2 chars=56>42 => each char is its own line.
//   6 lines. Height: 6*28*1.2=201.6 > 192. Doesn't fit at 28.
//   Search finds a smaller font where chars wrap into 2+ lines.
//
// Key assertion: lines.length > 1 (per-char wrap happened -- not one unbreakable blob)
// ---------------------------------------------------------------------------
test('OVL-05 CJK: no-space string with cjk=true wraps per-character into multiple lines', async () => {
  const { fitText } = await loadFit();

  const result = fitText(
    'ABCDEF', // 6 chars, no spaces -- would be ONE unbreakable line without CJK mode
    50,
    200,
    stub,
    { cjk: true },
  );

  assert.ok(result.lines.length > 1, 'CJK per-char wrap produces multiple lines (not one blob)');
  // Verify all chars are present across lines (no chars dropped)
  const rejoined = result.lines.join('');
  assert.equal(rejoined, 'ABCDEF', 'all characters preserved across lines');
  assert.equal(result.clamped, false, 'generous height means no clamp needed');
});
