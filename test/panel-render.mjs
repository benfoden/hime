/**
 * node:test harness for the side-panel renderer (IMG-02 / IMG-03 / IMG-05).
 * Subject: dist/panel-render.js (lands in Plan 04).
 *
 * Run individually: npm run build && node --test test/panel-render.mjs
 * Run as part of full suite: npm test
 *
 * Project law: verify against dist/, NEVER the service-worker console.
 *
 * Seven cases pinned (12-04-PLAN Task 1):
 *   1. populated entry: thumbnail → direction → translation → original (D-02 order).
 *   2. breaks preserved: text nodes carry a pre-wrap class; newline survives.
 *   3. low-confidence: lowConfidence:true → amber badge; false → no badge.
 *   4. no-text: explicit no-text node (not blank, IMG-05).
 *   5. error: per-entry error row carries the message (IMG-05, never blank).
 *   6. D-01 prepend: prependEntry adds to TOP, keeps prior entries; renderPanel
 *      renders a list newest-first.
 *   7. XSS: an XSS_PROBE translation renders as inert text — no injected element.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseHTML } from 'linkedom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { IMAGE_RESULT_POPULATED, IMAGE_RESULT_POPULATED_CJK, XSS_PROBE } = await import(
  path.join(__dirname, '../dist/panel-mock.js')
);

const { renderPanel, prependEntry } = await import(
  path.join(__dirname, '../dist/panel-render.js')
);

const { document } = parseHTML('<!doctype html><body>');

function freshMount() {
  return document.createElement('div');
}

// ---------------------------------------------------------------------------
// 1. IMG-02/03 (D-02): a populated entry renders thumbnail → direction →
//    translation → original, in that DOM order (translation ABOVE original).
// ---------------------------------------------------------------------------
test('IMG-02: populated entry renders thumbnail → direction → translation → original (D-02 order)', () => {
  const mount = freshMount();
  renderPanel(
    {
      kind: 'list',
      entries: [
        {
          kind: 'populated',
          id: 'a',
          thumbnailUrl: 'https://example.test/thumb.png',
          result: IMAGE_RESULT_POPULATED,
          lowConfidence: false,
        },
      ],
    },
    document,
    mount,
  );

  const entry = mount.querySelector('.panel-entry');
  assert.ok(entry !== null, 'a populated entry must render a .panel-entry row');

  const thumb = entry.querySelector('img');
  assert.ok(thumb !== null, 'populated entry needs a thumbnail <img>');
  assert.equal(thumb.getAttribute('src'), 'https://example.test/thumb.png', 'thumbnail src set verbatim');

  const direction = entry.querySelector('.panel-direction');
  assert.ok(direction !== null, 'populated entry needs a direction line');
  assert.ok((direction.textContent ?? '').includes('Detected:'), 'direction line says "Detected:"');
  assert.ok(/[→→]/.test(direction.textContent ?? ''), 'direction line carries the arrow');

  const translation = entry.querySelector('.panel-translation');
  const original = entry.querySelector('.panel-original');
  assert.ok(translation !== null, 'populated entry needs a translation node');
  assert.ok(original !== null, 'populated entry needs an original node');
  assert.ok((translation.textContent ?? '').includes(IMAGE_RESULT_POPULATED.translatedText.split('\n')[0]));
  assert.ok((original.textContent ?? '').includes(IMAGE_RESULT_POPULATED.originalText.split('\n')[0]));

  // DOM order: thumbnail before direction before translation before original.
  const order = ['img', '.panel-direction', '.panel-translation', '.panel-original'].map(sel =>
    Array.prototype.indexOf.call(entry.querySelectorAll('*'), entry.querySelector(sel)),
  );
  assert.ok(order[0] < order[1], 'thumbnail precedes direction');
  assert.ok(order[1] < order[2], 'direction precedes translation');
  assert.ok(order[2] < order[3], 'translation precedes original (D-02: translation ABOVE original)');
});

// ---------------------------------------------------------------------------
// 2. IMG-03 (D-02): translated/original text preserves breaks via a pre-wrap class.
// ---------------------------------------------------------------------------
test('IMG-03: translated/original text preserves breaks via a pre-wrap class', () => {
  const mount = freshMount();
  renderPanel(
    { kind: 'list', entries: [{ kind: 'populated', id: 'a', result: IMAGE_RESULT_POPULATED, lowConfidence: false }] },
    document,
    mount,
  );
  const prewrap = mount.querySelector('.pre-wrap, .panel-text');
  assert.ok(prewrap !== null, 'a pre-wrap text class must carry the multi-line OCR text');
  assert.ok((prewrap.textContent ?? '').includes('\n'), 'the original newline must be preserved in textContent');
});

// ---------------------------------------------------------------------------
// 3. IMG-05/D-04: low-confidence renders an amber badge; non-low does NOT.
// ---------------------------------------------------------------------------
test('IMG-05/D-04: low-confidence entry shows amber badge; non-low does not', () => {
  const low = freshMount();
  renderPanel(
    { kind: 'list', entries: [{ kind: 'populated', id: 'c', result: IMAGE_RESULT_POPULATED, lowConfidence: true }] },
    document,
    low,
  );
  assert.ok(low.querySelector('.amber, .low-confidence') !== null, 'low-confidence entry needs an amber badge');

  const high = freshMount();
  renderPanel(
    { kind: 'list', entries: [{ kind: 'populated', id: 'd', result: IMAGE_RESULT_POPULATED, lowConfidence: false }] },
    document,
    high,
  );
  assert.equal(high.querySelector('.amber, .low-confidence'), null, 'a non-low-confidence entry has NO amber badge');
});

// ---------------------------------------------------------------------------
// 4. IMG-05: a no-text entry renders an explicit no-text state (not blank).
// ---------------------------------------------------------------------------
test('IMG-05: no-text entry renders an explicit message node (never blank)', () => {
  const mount = freshMount();
  renderPanel({ kind: 'list', entries: [{ kind: 'no-text', id: 'b' }] }, document, mount);
  const entry = mount.querySelector('.panel-entry');
  assert.ok(entry !== null, 'no-text entry should render a row');
  assert.ok((entry.textContent ?? '').trim().length > 0, 'no-text entry must not be blank');
});

// ---------------------------------------------------------------------------
// 5. IMG-05: an error entry renders a per-entry error row with the message.
// ---------------------------------------------------------------------------
test('IMG-05: error entry renders a per-entry error row carrying the message', () => {
  const mount = freshMount();
  renderPanel(
    { kind: 'list', entries: [{ kind: 'error', id: 'd', errorKind: 'auth', message: 'key not configured' }] },
    document,
    mount,
  );
  const errorRow = mount.querySelector('.panel-error');
  assert.ok(errorRow !== null, 'error entry needs a .panel-error row');
  assert.ok((errorRow.textContent ?? '').includes('key not configured'), 'error row renders its message');
});

// ---------------------------------------------------------------------------
// 6. IMG-05b (D-01): newest-first. renderPanel renders entries newest-first;
//    prependEntry adds a new entry to the TOP and keeps prior entries.
// ---------------------------------------------------------------------------
test('IMG-05b (D-01): renderPanel renders newest-first; prependEntry prepends keeping prior entries', () => {
  const mount = freshMount();
  renderPanel(
    {
      kind: 'list',
      entries: [
        { kind: 'populated', id: 'newest', result: { ...IMAGE_RESULT_POPULATED, translatedText: 'NEWEST' }, lowConfidence: false },
        { kind: 'populated', id: 'oldest', result: { ...IMAGE_RESULT_POPULATED, translatedText: 'OLDEST' }, lowConfidence: false },
      ],
    },
    document,
    mount,
  );
  const rows = mount.querySelectorAll('.panel-entry');
  assert.ok(rows.length >= 2, 'expected at least two entries');
  assert.ok((rows[0].textContent ?? '').includes('NEWEST'), 'first rendered row must be the newest entry');

  // prependEntry adds a brand-new entry to the very top, keeping prior entries.
  prependEntry(
    { kind: 'populated', id: 'fresh', result: { ...IMAGE_RESULT_POPULATED, translatedText: 'FRESH' }, lowConfidence: false },
    document,
    mount,
  );
  assert.equal(mount.querySelectorAll('.panel-entry').length, 3, 'prependEntry keeps prior entries (count = 3)');
  assert.ok((mount.firstElementChild.textContent ?? '').includes('FRESH'), 'the prepended entry is mount.firstElementChild');
});

// ---------------------------------------------------------------------------
// 6b. prependEntry replaces an existing entry of the same id in place (skeleton
//     → result swap) without duplicating.
// ---------------------------------------------------------------------------
test('D-01: prependEntry replaces a same-id entry in place (skeleton → result)', () => {
  const mount = freshMount();
  prependEntry({ kind: 'loading', id: 'job-1' }, document, mount);
  assert.equal(mount.querySelectorAll('.panel-entry').length, 1, 'skeleton entry present');

  prependEntry(
    { kind: 'populated', id: 'job-1', result: { ...IMAGE_RESULT_POPULATED, translatedText: 'DONE' }, lowConfidence: false },
    document,
    mount,
  );
  assert.equal(mount.querySelectorAll('.panel-entry').length, 1, 'same-id swap must NOT duplicate the entry');
  assert.ok((mount.firstElementChild.textContent ?? '').includes('DONE'), 'the swapped-in result replaces the skeleton');
});

// ---------------------------------------------------------------------------
// 7. IMG-02 (XSS): an XSS_PROBE OCR/translation string renders as inert text —
//    no injected element appears in the tree.
// ---------------------------------------------------------------------------
test('IMG-02: XSS_PROBE renders as inert text (no injected <img>/<script>)', () => {
  const mount = freshMount();
  const probeResult = { ...IMAGE_RESULT_POPULATED, originalText: XSS_PROBE, translatedText: XSS_PROBE };
  renderPanel(
    { kind: 'list', entries: [{ kind: 'populated', id: 'x', result: probeResult, lowConfidence: false }] },
    document,
    mount,
  );
  assert.equal(mount.querySelectorAll('script').length, 0, 'no <script> node may be injected');
  // No <img> sourced from the probe payload. This entry sets no thumbnailUrl, so
  // any <img> present would have to come from the OCR text — which must not happen.
  assert.equal(mount.querySelector('img[src="x"]'), null, 'no probe-sourced <img src="x"> may be injected');
  assert.ok((mount.textContent ?? '').includes('onerror=alert(1)'), 'payload must appear as inert text');
});

// ---------------------------------------------------------------------------
// 8. D-04: [hime N] chip renders on every entry kind when himeNum is set.
// ---------------------------------------------------------------------------
test('D-04: [hime N] chip renders on populated entry when himeNum is set', () => {
  const mount = freshMount();
  renderPanel(
    {
      kind: 'list',
      entries: [{ kind: 'populated', id: 'h1', result: IMAGE_RESULT_POPULATED, lowConfidence: false, himeNum: 3 }],
    },
    document,
    mount,
  );
  const chip = mount.querySelector('.panel-num');
  assert.ok(chip !== null, 'populated entry with himeNum must render a .panel-num chip');
  assert.ok((chip.textContent ?? '').includes('[hime 3]'), 'chip text must be "[hime 3]"');
});

test('D-04: [hime N] chip renders on no-text entry when himeNum is set', () => {
  const mount = freshMount();
  renderPanel(
    { kind: 'list', entries: [{ kind: 'no-text', id: 'h2', himeNum: 7 }] },
    document,
    mount,
  );
  const chip = mount.querySelector('.panel-num');
  assert.ok(chip !== null, 'no-text entry with himeNum must render a .panel-num chip');
  assert.ok((chip.textContent ?? '').includes('[hime 7]'), 'chip text must be "[hime 7]"');
});

test('D-04: [hime N] chip renders on error entry when himeNum is set', () => {
  const mount = freshMount();
  renderPanel(
    { kind: 'list', entries: [{ kind: 'error', id: 'h3', errorKind: 'auth', message: 'auth failed', himeNum: 2 }] },
    document,
    mount,
  );
  const chip = mount.querySelector('.panel-num');
  assert.ok(chip !== null, 'error entry with himeNum must render a .panel-num chip');
  assert.ok((chip.textContent ?? '').includes('[hime 2]'), 'chip text must be "[hime 2]"');
});

test('D-04: [hime N] chip absent when himeNum is not set (legacy entry safety)', () => {
  const mount = freshMount();
  renderPanel(
    { kind: 'list', entries: [{ kind: 'populated', id: 'h4', result: IMAGE_RESULT_POPULATED, lowConfidence: false }] },
    document,
    mount,
  );
  assert.equal(mount.querySelector('.panel-num'), null, 'legacy entry without himeNum must NOT render a chip');
});

// ---------------------------------------------------------------------------
// 9. D-03: CJK note appears only when verticalOrCjk is true.
// ---------------------------------------------------------------------------
test('D-03: CJK note appears only on populated entries with verticalOrCjk:true', () => {
  const cjkMount = freshMount();
  renderPanel(
    {
      kind: 'list',
      entries: [{ kind: 'populated', id: 'cjk1', result: IMAGE_RESULT_POPULATED_CJK, lowConfidence: false, verticalOrCjk: true }],
    },
    document,
    cjkMount,
  );
  const note = cjkMount.querySelector('.panel-note');
  assert.ok(note !== null, 'verticalOrCjk:true entry must render a .panel-note');
  assert.ok((note.textContent ?? '').includes('vertical/CJK'), 'CJK note text must mention "vertical/CJK"');

  const nonCjkMount = freshMount();
  renderPanel(
    {
      kind: 'list',
      entries: [{ kind: 'populated', id: 'cjk2', result: IMAGE_RESULT_POPULATED, lowConfidence: false, verticalOrCjk: false }],
    },
    document,
    nonCjkMount,
  );
  assert.equal(nonCjkMount.querySelector('.panel-note'), null, 'verticalOrCjk:false must NOT render a .panel-note');

  const absentMount = freshMount();
  renderPanel(
    {
      kind: 'list',
      entries: [{ kind: 'populated', id: 'cjk3', result: IMAGE_RESULT_POPULATED, lowConfidence: false }],
    },
    document,
    absentMount,
  );
  assert.equal(absentMount.querySelector('.panel-note'), null, 'absent verticalOrCjk must NOT render a .panel-note');
});

// ---------------------------------------------------------------------------
// 10. D-02: error card and no-text card render as different classes.
// ---------------------------------------------------------------------------
test('D-02: error entry uses .panel-error (distinct from .panel-no-text)', () => {
  const errorMount = freshMount();
  renderPanel(
    { kind: 'list', entries: [{ kind: 'error', id: 'e1', errorKind: 'quota', message: 'quota exceeded' }] },
    document,
    errorMount,
  );
  assert.ok(errorMount.querySelector('.panel-error') !== null, 'error entry must have .panel-error class');
  assert.equal(errorMount.querySelector('.panel-no-text'), null, 'error entry must NOT have .panel-no-text class');
  assert.ok((errorMount.querySelector('.panel-message')?.textContent ?? '').includes('quota exceeded'), 'error message names the reason');

  const noTextMount = freshMount();
  renderPanel(
    { kind: 'list', entries: [{ kind: 'no-text', id: 'nt1' }] },
    document,
    noTextMount,
  );
  assert.ok(noTextMount.querySelector('.panel-no-text') !== null, 'no-text entry must have .panel-no-text class');
  assert.equal(noTextMount.querySelector('.panel-error'), null, 'no-text entry must NOT have .panel-error class');
});

// ---------------------------------------------------------------------------
// 11. T-14-07 (XSS): XSS_PROBE via himeNum chip name + note renders inert.
// ---------------------------------------------------------------------------
test('T-14-07: XSS_PROBE as message in error entry renders as inert text', () => {
  const mount = freshMount();
  renderPanel(
    { kind: 'list', entries: [{ kind: 'error', id: 'xss2', errorKind: 'unknown', message: XSS_PROBE }] },
    document,
    mount,
  );
  assert.equal(mount.querySelectorAll('script').length, 0, 'XSS_PROBE in error message must not inject <script>');
  assert.equal(mount.querySelector('img[src="x"]'), null, 'XSS_PROBE must not inject <img src="x">');
  assert.ok((mount.textContent ?? '').includes('onerror=alert(1)'), 'XSS_PROBE must appear as inert text in error message');
});
