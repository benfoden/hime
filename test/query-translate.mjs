/**
 * node:test harness for buildQueryTranslateConfig (pure function).
 * Exercises the explicit-direction contract (D-02): no auto-flip, args verbatim.
 *
 * Requirements covered: SRCH-02, D-02, D-03
 *
 * Run individually: npm run build && node --test test/query-translate.mjs
 * Run as part of full suite: npm test
 *
 * Project law: verify against dist/, NEVER the service-worker console.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { buildQueryTranslateConfig } = await import(
  path.join(__dirname, '../dist/query-translate.js')
);

// ---------------------------------------------------------------------------
// D-02: Explicit-direction contract — args are used verbatim, never flipped
// ---------------------------------------------------------------------------

test('D-02: buildQueryTranslateConfig returns sourceLanguage and targetLanguage verbatim', () => {
  const config = buildQueryTranslateConfig('English', 'Japanese', 'auto');
  assert.equal(config.sourceLanguage, 'English', 'sourceLanguage must be English');
  assert.equal(config.targetLanguage, 'Japanese', 'targetLanguage must be Japanese');
  assert.equal(config.formality, 'auto', 'formality must be auto');
});

test('D-02: buildQueryTranslateConfig with Japanese source does NOT flip direction', () => {
  // Proves args are never swapped even when source is Japanese (explicit-direction only)
  const config = buildQueryTranslateConfig('Japanese', 'English', 'polite');
  assert.equal(config.sourceLanguage, 'Japanese', 'sourceLanguage must remain Japanese (not flipped to English)');
  assert.equal(config.targetLanguage, 'English', 'targetLanguage must remain English (not flipped to Japanese)');
  assert.equal(config.formality, 'polite', 'formality must be polite');
});

test('D-02: buildQueryTranslateConfig passes formality formal verbatim', () => {
  const config = buildQueryTranslateConfig('English', 'Japanese', 'formal');
  assert.equal(config.sourceLanguage, 'English');
  assert.equal(config.targetLanguage, 'Japanese');
  assert.equal(config.formality, 'formal');
});

test('D-02: buildQueryTranslateConfig passes formality casual verbatim', () => {
  const config = buildQueryTranslateConfig('French', 'German', 'casual');
  assert.equal(config.sourceLanguage, 'French');
  assert.equal(config.targetLanguage, 'German');
  assert.equal(config.formality, 'casual');
});

// ---------------------------------------------------------------------------
// No-flip guarantee: passing a Japanese-looking TARGET does not swap source/target
// ---------------------------------------------------------------------------

test('no-flip: English→Japanese direction kept when target is Japanese (no jpPattern detection)', () => {
  // Even if the caller intends to translate INTO Japanese, direction stays as given.
  const config = buildQueryTranslateConfig('English', 'Japanese', 'auto');
  assert.equal(config.sourceLanguage, 'English', 'sourceLanguage must stay English');
  assert.equal(config.targetLanguage, 'Japanese', 'targetLanguage must stay Japanese');
});

// ---------------------------------------------------------------------------
// No customPrompt field
// ---------------------------------------------------------------------------

test('no customPrompt: returned config does not carry customPrompt', () => {
  const config = buildQueryTranslateConfig('English', 'Japanese', 'auto');
  assert.ok(!('customPrompt' in config), 'customPrompt must not be present in query-translate config');
});

test('no customPrompt: returned config has exactly sourceLanguage, targetLanguage, formality', () => {
  const config = buildQueryTranslateConfig('English', 'Japanese', 'polite');
  const keys = Object.keys(config).sort();
  assert.deepEqual(keys, ['formality', 'sourceLanguage', 'targetLanguage'],
    'config should have exactly three fields: sourceLanguage, targetLanguage, formality');
});
