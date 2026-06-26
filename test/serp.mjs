/**
 * node:test harness for the SERP renderer.
 * Drives renderSerp against a linkedom document and asserts SERP-01..05.
 *
 * Run individually: npm run build && node --test test/serp.mjs
 * Run as part of full suite: npm test
 *
 * Project law: verify against dist/, NEVER the service-worker console.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseHTML } from 'linkedom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { renderSerp } = await import(path.join(__dirname, '../dist/serp-render.js'));
const { MOCKS, XSS_PROBE } = await import(path.join(__dirname, '../dist/search-mock.js'));

// Shared linkedom document — one per file is fine; each test creates its own mount.
const { document } = parseHTML('<!doctype html><body>');

/** Helper: create a fresh mount element and render a given state into it. */
function render(state) {
  const mount = document.createElement('div');
  renderSerp(state, document, mount);
  return mount;
}

// ---------------------------------------------------------------------------
// SERP-TRANSLATING: the `translating` flag tags every row with .serp-translating
// (the CSS colour-wave) so raw rows can paint immediately while back-translation
// streams in; omitted/false leaves rows un-tagged.
// ---------------------------------------------------------------------------

test('SERP-translating: translating:true tags every row with .serp-translating', () => {
  const mount = render({ ...MOCKS.populated, translating: true });
  const rows = mount.querySelectorAll('.serp-row');
  assert.ok(rows.length > 0, 'expected rows');
  for (const row of rows) {
    assert.ok(row.classList.contains('serp-translating'), 'row should carry the wave class');
  }
});

test('SERP-translating: default/omitted leaves rows un-tagged (settled)', () => {
  const plain = render(MOCKS.populated);
  for (const row of plain.querySelectorAll('.serp-row')) {
    assert.ok(!row.classList.contains('serp-translating'), 'settled row must not carry the wave class');
  }
  const explicitFalse = render({ ...MOCKS.populated, translating: false });
  for (const row of explicitFalse.querySelectorAll('.serp-row')) {
    assert.ok(!row.classList.contains('serp-translating'), 'translating:false must not tag rows');
  }
});

// ---------------------------------------------------------------------------
// SERP-01a: populated state renders one row per result with favicon, hostname,
//           title anchor, and snippet.
// ---------------------------------------------------------------------------
test('SERP-01a: populated mock renders one .serp-row per result with favicon/host/title/snippet', () => {
  const mount = render(MOCKS.populated);
  const rows = mount.querySelectorAll('.serp-row');
  const results = MOCKS.populated.results;
  assert.equal(rows.length, results.length, `expected ${results.length} rows, got ${rows.length}`);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // Favicon node present (img or span.serp-tile)
    const faviconNode = row.querySelector('.serp-favicon');
    assert.ok(faviconNode !== null, `row ${i}: missing .serp-favicon`);
    // Hostname text present
    const hostEl = row.querySelector('.serp-host');
    assert.ok(hostEl !== null, `row ${i}: missing .serp-host`);
    assert.equal(hostEl.textContent, results[i].hostname, `row ${i}: hostname mismatch`);
    // Title anchor present
    const titleAnchor = row.querySelector('a.serp-title');
    assert.ok(titleAnchor !== null, `row ${i}: missing a.serp-title`);
    assert.equal(titleAnchor.textContent, results[i].title, `row ${i}: title mismatch`);
    // Snippet present
    const snippet = row.querySelector('.serp-snippet');
    assert.ok(snippet !== null, `row ${i}: missing .serp-snippet`);
  }
});

// ---------------------------------------------------------------------------
// SERP-01b: a row without faviconUrl renders a .serp-tile span (not an img),
//           with the uppercased first letter of hostname.
// ---------------------------------------------------------------------------
test('SERP-01b: no-faviconUrl row renders .serp-tile span (not img), first letter uppercased', () => {
  const mount = render(MOCKS.populated);
  const rows = mount.querySelectorAll('.serp-row');
  const results = MOCKS.populated.results;

  // Find the index of XSS_PROBE (no faviconUrl) in results
  const probeIdx = results.findIndex(r => r === XSS_PROBE || r.url === XSS_PROBE.url);
  assert.ok(probeIdx >= 0, 'XSS_PROBE row not found in populated mock');

  const probeRow = rows[probeIdx];
  // Must have a .serp-tile span
  const tile = probeRow.querySelector('.serp-tile');
  assert.ok(tile !== null, 'expected a .serp-tile span for no-faviconUrl row');
  // Must NOT have an img.serp-favicon in that row
  const img = probeRow.querySelector('img.serp-favicon');
  assert.equal(img, null, 'expected no img.serp-favicon for no-faviconUrl row');
  // Tile text is first letter uppercased
  const firstLetter = (XSS_PROBE.hostname[0] ?? '?').toUpperCase();
  assert.equal(tile.textContent, firstLetter, `tile text should be "${firstLetter}"`);
});

// ---------------------------------------------------------------------------
// SERP-02: anchor's getAttribute('href') equals the mock url byte-for-byte.
//          Use getAttribute (not .href) to avoid base-URL resolution.
// ---------------------------------------------------------------------------
test('SERP-02: anchor getAttribute("href") equals mock url verbatim (SERP-02)', () => {
  const mount = render(MOCKS.populated);
  const rows = mount.querySelectorAll('.serp-row');
  const results = MOCKS.populated.results;

  for (let i = 0; i < rows.length; i++) {
    const anchor = rows[i].querySelector('a.serp-title');
    assert.ok(anchor !== null, `row ${i}: missing a.serp-title`);
    const stored = anchor.getAttribute('href');
    assert.equal(stored, results[i].url,
      `row ${i}: href "${stored}" !== expected "${results[i].url}"`);
    // Also verify rel is set correctly
    assert.equal(anchor.getAttribute('rel'), 'noopener noreferrer',
      `row ${i}: rel missing or wrong`);
  }
});

// ---------------------------------------------------------------------------
// SERP-03a: after rendering the XSS probe, no <script> node exists anywhere
//           in the tree, AND the malicious substring appears as textContent.
// ---------------------------------------------------------------------------
test('SERP-03a: no <script> node after XSS probe render; payload present as inert text', () => {
  // Render a single-result state using XSS_PROBE
  const xssState = { kind: 'populated', results: [XSS_PROBE] };
  const mount = render(xssState);

  // Zero script nodes — the XSS guarantee
  const scriptNodes = mount.querySelectorAll('script');
  assert.equal(scriptNodes.length, 0,
    `expected 0 <script> nodes, found ${scriptNodes.length}`);

  // The malicious string must appear as plain text somewhere in the tree
  const fullText = mount.textContent ?? '';
  assert.ok(
    fullText.includes('alert(1)') || fullText.includes('<script>'),
    `malicious payload not found as inert text in mount.textContent: "${fullText}"`,
  );
});

// ---------------------------------------------------------------------------
// SERP-03b: the snippet element for the <strong>-containing description has
//           .children.length === 0 (tags neutralized, never parsed into elements).
// ---------------------------------------------------------------------------
test('SERP-03b: snippet .children.length === 0 for description with <strong>/<script> tags', () => {
  const xssState = { kind: 'populated', results: [XSS_PROBE] };
  const mount = render(xssState);

  const snippet = mount.querySelector('.serp-snippet');
  assert.ok(snippet !== null, 'expected .serp-snippet element');
  assert.equal(snippet.children.length, 0,
    `snippet must have 0 child elements (got ${snippet.children.length}) — tags must not be parsed into DOM nodes`);
});

// ---------------------------------------------------------------------------
// SERP-04: loading state renders ≥1 .serp-skeleton rows and zero .serp-row.
// ---------------------------------------------------------------------------
test('SERP-04: skeleton state renders ≥1 .serp-skeleton rows, zero .serp-row', () => {
  const mount = render(MOCKS.skeleton);

  const skeletons = mount.querySelectorAll('.serp-skeleton');
  assert.ok(skeletons.length >= 1, `expected ≥1 .serp-skeleton rows, got ${skeletons.length}`);

  const rows = mount.querySelectorAll('.serp-row');
  assert.equal(rows.length, 0, `expected 0 .serp-row in skeleton state, got ${rows.length}`);
});

// ---------------------------------------------------------------------------
// SERP-05a: empty state renders a distinct .serp-empty notice and zero rows.
// ---------------------------------------------------------------------------
test('SERP-05a: empty state renders .serp-empty notice, zero .serp-row', () => {
  const mount = render(MOCKS.empty);

  const notice = mount.querySelector('.serp-empty');
  assert.ok(notice !== null, 'expected .serp-empty notice element');

  const rows = mount.querySelectorAll('.serp-row');
  assert.equal(rows.length, 0, `expected 0 .serp-row in empty state, got ${rows.length}`);
});

// ---------------------------------------------------------------------------
// SERP-05b: each error kind renders distinct copy; quota matches /quota/i and
//           contains "search quota exceeded"; no timer scheduled.
// ---------------------------------------------------------------------------
test('SERP-05b: error states render distinct copy; quota matches /quota/i and "search quota exceeded"', () => {
  const errorKeys = ['auth', 'network', 'quota', 'unknown'];
  const messages = [];

  for (const key of errorKeys) {
    const mount = render(MOCKS[key]);
    const notice = mount.querySelector('.serp-error');
    assert.ok(notice !== null, `${key}: expected .serp-error notice`);
    const msg = notice.textContent ?? '';
    assert.ok(msg.length > 0, `${key}: error message should not be empty`);
    messages.push(msg);

    // Quota must contain the literal phrase
    if (key === 'quota') {
      assert.match(msg, /quota/i, `quota: message "${msg}" does not match /quota/i`);
      assert.ok(
        msg.toLowerCase().includes('search quota exceeded'),
        `quota: message "${msg}" does not contain "search quota exceeded"`,
      );
    }

    // data-error-kind attribute set
    const kind = notice.getAttribute('data-error-kind');
    assert.ok(kind !== null && kind.length > 0,
      `${key}: expected data-error-kind attribute`);
  }

  // All four messages must be pairwise distinct
  for (let i = 0; i < messages.length; i++) {
    for (let j = i + 1; j < messages.length; j++) {
      assert.notEqual(messages[i], messages[j],
        `error messages for ${errorKeys[i]} and ${errorKeys[j]} are identical: "${messages[i]}"`);
    }
  }
});
