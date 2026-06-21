/**
 * node:test harness for the disclosure-line text builder (pure function).
 * Exercises buildDisclosureText for translated/direct/failed cases (D-05/D-06/D-10).
 *
 * Requirements covered: SRCH-03, D-05, D-06, D-10
 *
 * Run individually: npm run build && node --test test/disclosure.mjs
 * Run as part of full suite: npm test
 *
 * Project law: verify against dist/, NEVER the service-worker console.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { buildDisclosureText } = await import(path.join(__dirname, '../dist/disclosure.js'));

// ---------------------------------------------------------------------------
// D-05: translated case
// ---------------------------------------------------------------------------

test('D-05: translated case returns "Searching in {targetLanguage} for: {translatedQuery} ({sourceLanguage}: {originalQuery})"', () => {
  const result = buildDisclosureText({
    kind: 'translated',
    sourceLanguage: 'English',
    targetLanguage: 'Japanese',
    originalQuery: 'search',
    translatedQuery: '検索',
  });
  assert.equal(result, 'Searching in Japanese for: 検索 (English: search)');
});

test('D-05: translated case with different languages produces correct phrasing', () => {
  const result = buildDisclosureText({
    kind: 'translated',
    sourceLanguage: 'French',
    targetLanguage: 'Spanish',
    originalQuery: 'bonjour',
    translatedQuery: 'hola',
  });
  assert.equal(result, 'Searching in Spanish for: hola (French: bonjour)');
});

// ---------------------------------------------------------------------------
// D-06: direct case (same language, no translation)
// ---------------------------------------------------------------------------

test('D-06: direct case returns plain "Searching for: {originalQuery}" — no language framing', () => {
  const result = buildDisclosureText({
    kind: 'direct',
    originalQuery: 'ramen',
  });
  assert.equal(result, 'Searching for: ramen');
});

test('D-06: direct case does not include "in {language}" anywhere', () => {
  const result = buildDisclosureText({
    kind: 'direct',
    originalQuery: 'sushi restaurants',
  });
  assert.ok(!result.includes(' in '), 'direct case must not include " in " language framing');
  assert.equal(result, 'Searching for: sushi restaurants');
});

// ---------------------------------------------------------------------------
// D-10: failed case (LLM translation failed/timed out)
// ---------------------------------------------------------------------------

test('D-10: failed case returns degraded note "translation unavailable, searched as typed"', () => {
  const result = buildDisclosureText({
    kind: 'failed',
    originalQuery: 'search',
  });
  assert.equal(result, 'Searching for: search — translation unavailable, searched as typed');
});

test('D-10: failed case includes "translation unavailable" phrasing', () => {
  const result = buildDisclosureText({
    kind: 'failed',
    originalQuery: 'any query',
  });
  assert.ok(result.includes('translation unavailable'), 'failed case must include "translation unavailable"');
  assert.ok(result.includes('any query'), 'failed case must include the original query');
});

// ---------------------------------------------------------------------------
// Edge case: empty strings must not throw
// ---------------------------------------------------------------------------

test('edge case: translated with empty strings does not throw', () => {
  assert.doesNotThrow(() => {
    buildDisclosureText({
      kind: 'translated',
      sourceLanguage: '',
      targetLanguage: '',
      originalQuery: '',
      translatedQuery: '',
    });
  });
});

test('edge case: direct with empty originalQuery does not throw', () => {
  assert.doesNotThrow(() => {
    buildDisclosureText({ kind: 'direct', originalQuery: '' });
  });
});

test('edge case: failed with empty originalQuery does not throw', () => {
  assert.doesNotThrow(() => {
    buildDisclosureText({ kind: 'failed', originalQuery: '' });
  });
});
