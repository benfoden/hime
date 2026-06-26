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

// ---------------------------------------------------------------------------
// SRCH-LOCALE: languageToBraveCountry — pin Brave result locale via `country`.
//
// This is the CORE-PROMISE guard: hime must search in the right language. The
// 魔法少女 ("magical girl") regression — valid Japanese AND Chinese in pure kanji —
// returned zh.wikipedia.org. Empirically (test/brave-lang-probe.mjs vs the live API)
// `search_lang` did NOT pin the locale and Brave's enum even rejects 'ja' (422);
// `country=JP` is what returns ja.wikipedia.org. So we pin by country (ISO 3166-1
// alpha-2). These tests pin every supported language to its exact country code,
// require coverage for all of them, and reject anything that isn't a 2-letter
// uppercase country code — so a wrong/lowercased value fails CI instead of shipping.
// ---------------------------------------------------------------------------

const { languageToBraveCountry, SUPPORTED_LANGUAGES } = await import(
  path.join(__dirname, '../dist/types.js')
);

// Exact expected Brave `country` (ISO 3166-1 alpha-2) per supported language —
// the primary country for that language. undefined would mean "no mapping → Brave
// default (US)". Update THIS table deliberately when the supported set changes; a
// silent drift fails the coverage test below.
const EXPECTED_BRAVE_COUNTRY = {
  English: 'US',
  Japanese: 'JP',
  Korean: 'KR',
  'Chinese (Simplified)': 'CN',
  'Chinese (Traditional)': 'TW',
  Spanish: 'ES',
  French: 'FR',
  German: 'DE',
  Italian: 'IT',
  Portuguese: 'BR',
  Dutch: 'NL',
  Russian: 'RU',
  Polish: 'PL',
  Turkish: 'TR',
  Arabic: 'SA',
  Hindi: 'IN',
  Vietnamese: 'VN',
  Thai: 'TH',
  Indonesian: 'ID',
};

test('SRCH-LOCALE (golden): every supported language maps to its exact Brave country', () => {
  for (const [name, expected] of Object.entries(EXPECTED_BRAVE_COUNTRY)) {
    assert.equal(
      languageToBraveCountry(name),
      expected,
      `${name} must map to country ${JSON.stringify(expected)} — wrong/missing country lets Brave pick the wrong locale`,
    );
  }
});

test('SRCH-LOCALE (regression): Japanese pins country JP (the 魔法少女 → ja.wikipedia fix)', () => {
  assert.equal(languageToBraveCountry('Japanese'), 'JP');
});

test('SRCH-LOCALE (validity): every mapped value is a 2-letter uppercase ISO 3166-1 code', () => {
  for (const lang of SUPPORTED_LANGUAGES) {
    const code = languageToBraveCountry(lang);
    if (code === undefined) continue; // no mapping → Brave default, allowed
    assert.match(code, /^[A-Z]{2}$/, `${lang} → "${code}" is not a 2-letter uppercase country code`);
  }
});

test('SRCH-LOCALE (coverage): the supported set matches the expected table (no silent drift)', () => {
  // Adding/removing a language in SUPPORTED_LANGUAGES fails this until the golden
  // table is updated — forcing a deliberate Brave-country decision per language.
  assert.deepEqual(
    [...SUPPORTED_LANGUAGES].sort(),
    Object.keys(EXPECTED_BRAVE_COUNTRY).sort(),
    'SUPPORTED_LANGUAGES drifted from EXPECTED_BRAVE_COUNTRY — add the new language with its country',
  );
});

test('SRCH-LOCALE: unknown/free-text returns undefined (caller omits country)', () => {
  assert.equal(languageToBraveCountry('Klingon'), undefined);
  assert.equal(languageToBraveCountry(''), undefined);
});
