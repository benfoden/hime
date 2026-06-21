/**
 * node:test harness for the side-panel renderer (IMG-02 / IMG-03 / IMG-05).
 * Subject: dist/panel-render.js (lands in Plan 04).
 *
 * Run individually: npm run build && node --test test/panel-render.mjs
 * Run as part of full suite: npm test
 *
 * Project law: verify against dist/, NEVER the service-worker console.
 *
 * Wave 0 note (Nyquist rule): the subject ships in Plan 04, so these assertions
 * are expected RED until then. The render contract (states, prepend order,
 * break preservation, XSS-safety) is pinned here now.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseHTML } from 'linkedom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { IMAGE_RESULT_POPULATED, XSS_PROBE } = await import(
  path.join(__dirname, '../dist/panel-mock.js')
);

// Subject is not built until Plan 04 — import lazily so this file still runs (RED).
async function loadRenderer() {
  return import(path.join(__dirname, '../dist/panel-render.js'));
}

const { document } = parseHTML('<!doctype html><body>');

function freshMount() {
  return document.createElement('div');
}

// ---------------------------------------------------------------------------
// IMG-02/03/05a: renderPanel renders populated, no-text, low-confidence
//                (amber badge), and error entry states.
// ---------------------------------------------------------------------------
test('IMG-05a: renderPanel renders each entry state (populated / no-text / low-confidence / error)', async () => {
  const { renderPanel } = await loadRenderer();

  const populated = freshMount();
  renderPanel(
    { kind: 'list', entries: [{ kind: 'populated', id: 'a', result: IMAGE_RESULT_POPULATED, lowConfidence: false }] },
    document,
    populated,
  );
  assert.ok((populated.textContent ?? '').includes(IMAGE_RESULT_POPULATED.translatedText.split('\n')[0]));

  const noText = freshMount();
  renderPanel({ kind: 'list', entries: [{ kind: 'no-text', id: 'b' }] }, document, noText);
  assert.ok(noText.querySelector('.panel-entry') !== null, 'no-text entry should render a row');

  const lowConf = freshMount();
  renderPanel(
    { kind: 'list', entries: [{ kind: 'populated', id: 'c', result: IMAGE_RESULT_POPULATED, lowConfidence: true }] },
    document,
    lowConf,
  );
  assert.ok(lowConf.querySelector('.amber, .low-confidence') !== null, 'low-confidence entry needs an amber badge');

  const errored = freshMount();
  renderPanel(
    { kind: 'list', entries: [{ kind: 'error', id: 'd', errorKind: 'network', message: 'offline' }] },
    document,
    errored,
  );
  assert.ok((errored.textContent ?? '').includes('offline'), 'error entry renders its message');
});

// ---------------------------------------------------------------------------
// IMG-05b (D-01): newest-first prepend order.
// ---------------------------------------------------------------------------
test('IMG-05b: entries render newest-first (D-01 prepend order)', async () => {
  const { renderPanel } = await loadRenderer();
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
});

// ---------------------------------------------------------------------------
// IMG-03 (D-02): OCR line breaks preserved — text node carries a pre-wrap class.
// ---------------------------------------------------------------------------
test('IMG-03: translated/original text preserves breaks via a pre-wrap class', async () => {
  const { renderPanel } = await loadRenderer();
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
// IMG-02 (XSS): an XSS_PROBE OCR/translation string renders as inert text — no
//               injected element appears in the tree.
// ---------------------------------------------------------------------------
test('IMG-02: XSS_PROBE renders as inert text (no injected <img>/<script>)', async () => {
  const { renderPanel } = await loadRenderer();
  const mount = freshMount();
  const probeResult = { ...IMAGE_RESULT_POPULATED, originalText: XSS_PROBE, translatedText: XSS_PROBE };
  renderPanel(
    { kind: 'list', entries: [{ kind: 'populated', id: 'x', result: probeResult, lowConfidence: false }] },
    document,
    mount,
  );
  assert.equal(mount.querySelectorAll('script').length, 0, 'no <script> node may be injected');
  // No <img> sourced from the probe payload (a legitimate thumbnail <img> would
  // carry a thumbnailUrl, which this entry does not set).
  assert.equal(mount.querySelectorAll('img').length, 0, 'no <img> may be injected from OCR text');
  assert.ok((mount.textContent ?? '').includes('onerror=alert(1)'), 'payload must appear as inert text');
});
