/**
 * Live Brave transport check — the repeatable terminal harness for the
 * 08-04 Task-3 manual-only verification (08-VALIDATION.md). Exercises the
 * REAL dist/brave-search.js BraveSearchClient against the live Brave API:
 * transport + auth + web.results→SearchResult mapping, all in one round-trip.
 *
 * NOTE: this runs in a terminal/node:test context only — NOT the extension
 * service-worker console (which the user cannot use). That path is reserved.
 *
 * Two ways to run, both honored here:
 *   1. As part of the suite:   npm test
 *      → SKIPS cleanly when BRAVE_API_KEY is unset (keeps the suite green and
 *        keyless-CI safe — Brave is metered/BYOK, no key in CI).
 *   2. Standalone live check:  BRAVE_API_KEY=<real-key> node test/brave-live.mjs
 *      → runs the live assertion and prints the PASS/FAIL transport summary.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { BraveSearchClient } = await import(path.join(__dirname, '../dist/brave-search.js'));

const key = process.env.BRAVE_API_KEY;

test('brave-live: transport + auth + mapping (live key)', { skip: key ? false : 'BRAVE_API_KEY not set — live Brave check skipped (metered/BYOK)' }, async () => {
  const client = new BraveSearchClient();
  let results;
  try {
    results = await client.search('tokyo weather', key, { count: 3 });
  } catch (e) {
    console.log('CLASSIFIED ERROR →', JSON.stringify(e, Object.getOwnPropertyNames(e), 2));
    console.log('\n✗ key/transport failed — see kind above (auth=bad key, search_quota=429)');
    throw e;
  }

  console.log('COUNT →', results.length);
  console.log('FIRST →', JSON.stringify(results[0], null, 2));

  const r = results[0] || {};
  assert.ok(results.length > 0, 'expected at least one result');
  assert.ok(r.title, 'first result missing title');
  assert.ok(r.url, 'first result missing url');
  assert.notEqual(r.description, undefined, 'first result missing description');
  assert.ok(r.hostname, 'first result missing hostname');

  console.log('\n✓ PASS — transport + auth + mapping all green');
});

// SRCH-LOCALE live pair check — the real "translates the right pair" guard. The
// 魔法少女 ("magical girl") query is identical in Japanese and Chinese kanji, so
// WITHOUT locale pinning Brave returned zh.wikipedia.org. country='JP' is what
// fixes it (verified via scripts/brave-lang-probe.mjs — search_lang did NOT). Opt-in
// (needs a live key); proves the end-to-end locale pinning structurally-proven elsewhere.
test('brave-live: country=JP pins Japanese results for the 魔法少女 regression', { skip: key ? false : 'BRAVE_API_KEY not set — live pair check skipped (metered/BYOK)' }, async () => {
  // Brave's Free plan is 1 req/s — space this off the prior live test so the
  // back-to-back calls don't 429 (a rate-limit collision, not a real failure).
  await new Promise((r) => setTimeout(r, 1600));

  const client = new BraveSearchClient();
  const results = await client.search('魔法少女', key, { count: 10, country: 'JP' });
  assert.ok(results.length > 0, 'expected results for 魔法少女');

  const hosts = results.map((r) => r.hostname || '');
  console.log('HOSTS →', hosts.join(', '));

  // No Chinese-Wikipedia leak (the exact symptom), and at least one Japanese signal
  // (a .jp TLD or a ja.* subdomain) in the top results.
  const zhLeak = hosts.filter((h) => /(^|\.)zh\./.test(h) || h.endsWith('.cn'));
  const jaSignal = hosts.filter((h) => /(^|\.)ja\./.test(h) || /\.jp$/.test(h));
  assert.equal(zhLeak.length, 0, `Chinese-locale results leaked despite country=JP: ${zhLeak.join(', ')}`);
  assert.ok(jaSignal.length > 0, `expected at least one Japanese-locale result (ja.* / .jp) — got: ${hosts.join(', ')}`);

  console.log('\n✓ PASS — country=JP returns Japanese-locale results, no zh leak');
});
