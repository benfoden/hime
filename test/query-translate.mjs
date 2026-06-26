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
// SRCH-LANG: languageToBraveSearchLang — pin Brave result locale.
//
// This is the CORE-PROMISE guard: hime must search in the right language. The
// 魔法少女 ("magical girl") regression — valid Japanese AND Chinese in pure kanji —
// returned zh.wikipedia.org because Brave got NO search_lang and auto-detected,
// then STAYED broken because the code was 'jp' (invalid; Brave wants ISO 639-1 'ja').
// These tests pin every supported language to its exact Brave code (golden table),
// require coverage for all but the known-unsupported, and reject any non-ISO-639-1
// value — so a future 'jp'-style typo fails CI instead of shipping.
// ---------------------------------------------------------------------------

const { languageToBraveSearchLang, SUPPORTED_LANGUAGES } = await import(
  path.join(__dirname, '../dist/types.js')
);

// Exact expected Brave search_lang per supported language. Brave uses ISO 639-1
// (verified against Brave's Web Search API docs) — Japanese is 'ja' NOT 'jp' —
// with Chinese split by script ('zh-hans'/'zh-hant'). undefined = Brave has no
// matching locale → omit the param (auto-detect). Update THIS table deliberately
// when the supported set changes; a silent drift fails the coverage test below.
const EXPECTED_BRAVE_LANG = {
  English: 'en',
  Japanese: 'ja',
  Korean: 'ko',
  'Chinese (Simplified)': 'zh-hans',
  'Chinese (Traditional)': 'zh-hant',
  Spanish: 'es',
  French: 'fr',
  German: 'de',
  Italian: 'it',
  Portuguese: 'pt',
  Dutch: 'nl',
  Russian: 'ru',
  Polish: 'pl',
  Turkish: 'tr',
  Arabic: 'ar',
  Hindi: 'hi',
  Vietnamese: 'vi',
  Thai: 'th',
  Indonesian: undefined, // Brave has no Indonesian search_lang → auto-detect
};

// A reference set of real ISO 639-1 two-letter codes (the standard Brave's
// search_lang follows). Deliberately does NOT contain 'jp' — that's the whole
// point: the bug code must be rejected. Chinese is the documented exception
// (script-qualified), allowed separately below.
const ISO_639_1 = new Set([
  'en', 'ja', 'ko', 'zh', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'pl', 'tr',
  'ar', 'hi', 'vi', 'th', 'id', 'ms', 'sv', 'da', 'fi', 'no', 'nb', 'cs', 'sk',
  'hu', 'ro', 'bg', 'hr', 'sr', 'uk', 'el', 'he', 'fa', 'ur', 'bn', 'ta', 'te',
  'ml', 'kn', 'mr', 'gu', 'pa', 'ca', 'eu', 'gl', 'et', 'lv', 'lt', 'sl',
]);
const BRAVE_SCRIPT_EXCEPTIONS = new Set(['zh-hans', 'zh-hant']);

test('SRCH-LANG (golden): every supported language maps to its exact Brave code', () => {
  for (const [name, expected] of Object.entries(EXPECTED_BRAVE_LANG)) {
    assert.equal(
      languageToBraveSearchLang(name),
      expected,
      `${name} must map to ${JSON.stringify(expected)} (Brave ISO 639-1) — a wrong code makes Brave auto-detect the wrong locale`,
    );
  }
});

test('SRCH-LANG (regression): Japanese is "ja", and "jp" is never a valid code', () => {
  assert.equal(languageToBraveSearchLang('Japanese'), 'ja');
  // The exact bug: 'jp' is not ISO 639-1 and must never appear as a mapped value.
  for (const lang of SUPPORTED_LANGUAGES) {
    assert.notEqual(languageToBraveSearchLang(lang), 'jp', `${lang} must not map to invalid 'jp'`);
  }
});

test('SRCH-LANG (validity): every mapped value is a real ISO 639-1 code (or zh-hans/zh-hant)', () => {
  for (const lang of SUPPORTED_LANGUAGES) {
    const code = languageToBraveSearchLang(lang);
    if (code === undefined) continue; // unsupported → omitted, allowed
    const valid = ISO_639_1.has(code) || BRAVE_SCRIPT_EXCEPTIONS.has(code);
    assert.ok(valid, `${lang} → "${code}" is not a valid Brave search_lang (ISO 639-1 / zh-han*)`);
  }
});

test('SRCH-LANG (coverage): the supported set matches the expected table (no silent drift)', () => {
  // If a language is added/removed in SUPPORTED_LANGUAGES, this fails until the
  // golden table is updated — forcing a deliberate Brave-code decision per language.
  assert.deepEqual(
    [...SUPPORTED_LANGUAGES].sort(),
    Object.keys(EXPECTED_BRAVE_LANG).sort(),
    'SUPPORTED_LANGUAGES drifted from EXPECTED_BRAVE_LANG — add the new language with its Brave code',
  );
});

test('SRCH-LANG: unknown/free-text returns undefined (caller omits search_lang)', () => {
  assert.equal(languageToBraveSearchLang('Klingon'), undefined);
  assert.equal(languageToBraveSearchLang(''), undefined);
});
