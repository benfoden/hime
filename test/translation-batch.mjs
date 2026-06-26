/**
 * node:test harness for the batch translation pipeline (pure functions).
 * Exercises buildBatchPayload, buildBatchTranslatePrompt, parseBatchReply,
 * and mergeTranslations against dist/translate-batch.js.
 *
 * Requirements covered: XLT-02, XLT-03, XLT-04, XLT-05
 *
 * Run individually: npm run build && node --test test/translation-batch.mjs
 * Run as part of full suite: npm test
 *
 * Project law: verify against dist/, NEVER the service-worker console.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  buildBatchPayload,
  buildBatchTranslatePrompt,
  parseBatchReply,
  mergeTranslations,
  chunkResults,
} = await import(path.join(__dirname, '../dist/translate-batch.js'));

// ---------------------------------------------------------------------------
// Shared fixture: SearchResult[] with distinctive url/hostname to test XLT-04.
// Row 2 has a <script>/<strong> description (carryover from SERP-03 shape).
// ---------------------------------------------------------------------------

/** @type {Array<{title: string, url: string, description: string, hostname: string, faviconUrl?: string}>} */
const RESULTS = [
  {
    title: 'Wikipedia: Ramen',
    url: 'https://secret.example.com/path?q=1',
    description: 'Ramen is a Japanese noodle dish <strong>popular</strong> worldwide.',
    hostname: 'secret.example.com',
    faviconUrl: 'https://secret.example.com/favicon.ico',
  },
  {
    title: 'Tokyo Food Guide',
    url: 'https://tokyofoodguide.example.net/ramen',
    description: 'Our curated list of the best ramen restaurants in Tokyo.',
    hostname: 'tokyofoodguide.example.net',
  },
  {
    title: 'XSS Probe',
    url: 'https://xss.example.org/page',
    description: 'safe text <strong>bold</strong> <script>alert(1)</script> trailing',
    hostname: 'xss.example.org',
  },
];

/** Default config used in buildBatchTranslatePrompt tests. */
const CONFIG = {
  sourceLanguage: 'English',
  targetLanguage: 'Japanese',
  formality: 'polite',
};

// ---------------------------------------------------------------------------
// XLT-02: buildBatchPayload
// ---------------------------------------------------------------------------

test('XLT-02: buildBatchPayload produces {i:{t,d}} keyed shape', () => {
  const payload = buildBatchPayload(RESULTS);
  // Keys are "0".."n-1"
  assert.deepEqual(Object.keys(payload).sort(), ['0', '1', '2']);
  // Each value has t and d matching the source
  assert.equal(payload['0'].t, RESULTS[0].title);
  assert.equal(payload['0'].d, RESULTS[0].description);
  assert.equal(payload['1'].t, RESULTS[1].title);
  assert.equal(payload['1'].d, RESULTS[1].description);
  assert.equal(payload['2'].t, RESULTS[2].title);
  assert.equal(payload['2'].d, RESULTS[2].description);
});

test('XLT-02: buildBatchTranslatePrompt contains JSON instruction and target language', () => {
  const prompt = buildBatchTranslatePrompt(CONFIG);
  assert.ok(prompt.length > 0, 'prompt should be non-empty');
  assert.ok(prompt.includes(CONFIG.targetLanguage), `prompt should include target language "${CONFIG.targetLanguage}"`);
  assert.ok(prompt.includes('JSON'), 'prompt should contain "JSON"');
  assert.ok(prompt.includes('same keys'), 'prompt should contain "same keys"');
  assert.ok(!prompt.includes('Output ONLY the translated text'), 'prompt must NOT contain the single-output instruction');
});

test('XLT-05: buildBatchTranslatePrompt pins the output language (no Chinese-for-Japanese drift)', () => {
  const prompt = buildBatchTranslatePrompt(CONFIG);
  // The pin must name the target language and forbid other scripts so CJK targets
  // don't drift (target Japanese, output Chinese — the reported defect).
  assert.ok(
    /MUST be written entirely in Japanese/.test(prompt),
    'prompt should hard-pin the target language',
  );
  assert.ok(/never any other language/i.test(prompt), 'prompt should forbid other languages/scripts');
});

// ---------------------------------------------------------------------------
// XLT-05: chunkResults — small per-request batches for reliable back-translation
// ---------------------------------------------------------------------------

test('XLT-05: chunkResults splits into fixed-size, order-preserving chunks', () => {
  const arr = [0, 1, 2, 3, 4, 5, 6];
  const chunks = chunkResults(arr, 5);
  assert.deepEqual(chunks, [[0, 1, 2, 3, 4], [5, 6]], 'splits into size-5 chunks, remainder last');
  assert.deepEqual(chunks.flat(), arr, 'preserves order and all elements');
});

test('XLT-05: chunkResults exact multiple yields full chunks only', () => {
  assert.deepEqual(chunkResults([1, 2, 3, 4], 2), [[1, 2], [3, 4]]);
});

test('XLT-05: chunkResults edge cases (empty, single, size>=len, size<=0)', () => {
  assert.deepEqual(chunkResults([], 5), [], 'empty → no chunks');
  assert.deepEqual(chunkResults([9], 5), [[9]], 'single under size → one chunk');
  assert.deepEqual(chunkResults([1, 2], 9), [[1, 2]], 'size >= len → one chunk');
  assert.deepEqual(chunkResults([1, 2, 3], 0), [[1, 2, 3]], 'size 0 → single fallback chunk');
  // returns copies, not the input ref
  const src = [1, 2];
  assert.notEqual(chunkResults(src, 5)[0], src, 'chunk is a copy, not the input array');
});

// ---------------------------------------------------------------------------
// XLT-04: URL/hostname never sent in payload
// ---------------------------------------------------------------------------

test('XLT-04: buildBatchPayload omits url/hostname/faviconUrl', () => {
  const payload = buildBatchPayload(RESULTS);
  for (const [key, value] of Object.entries(payload)) {
    assert.deepEqual(
      Object.keys(value).sort(),
      ['d', 't'],
      `key "${key}" should have exactly {t, d} — got: ${JSON.stringify(Object.keys(value))}`,
    );
  }
});

test('XLT-04: serialized payload contains no result URL/hostname substring', () => {
  const payload = buildBatchPayload(RESULTS);
  const serialized = JSON.stringify(payload);
  assert.ok(!serialized.includes('secret.example.com'), 'serialized payload must not include hostname');
  assert.ok(!serialized.includes('https://secret.example.com'), 'serialized payload must not include full url');
  assert.ok(!serialized.includes('tokyofoodguide.example.net'), 'serialized payload must not include second hostname');
  assert.ok(!serialized.includes('xss.example.org'), 'serialized payload must not include third hostname');
});

// ---------------------------------------------------------------------------
// XLT-03: parseBatchReply — happy path and fallback matrix
// ---------------------------------------------------------------------------

test('XLT-03: parseBatchReply with full valid reply returns all keys', () => {
  const inputKeys = ['0', '1', '2'];
  const reply = JSON.stringify({
    '0': { t: 'ラーメン', d: '説明0' },
    '1': { t: '東京', d: '説明1' },
    '2': { t: 'テスト', d: '説明2' },
  });
  const result = parseBatchReply(reply, inputKeys);
  assert.deepEqual(result, {
    '0': { t: 'ラーメン', d: '説明0' },
    '1': { t: '東京', d: '説明1' },
    '2': { t: 'テスト', d: '説明2' },
  });
});

test('XLT-03: parseBatchReply with a missing key returns partial map', () => {
  const inputKeys = ['0', '1', '2'];
  // Key "1" missing from reply
  const reply = JSON.stringify({
    '0': { t: 'ラーメン', d: '説明0' },
    '2': { t: 'テスト', d: '説明2' },
  });
  const result = parseBatchReply(reply, inputKeys);
  assert.ok('0' in result, 'key "0" should be present');
  assert.ok(!('1' in result), 'key "1" should be absent (missing from reply)');
  assert.ok('2' in result, 'key "2" should be present');
});

test('XLT-03: parseBatchReply with malformed entry (missing d) omits that key', () => {
  const inputKeys = ['0', '1'];
  const reply = JSON.stringify({
    '0': { t: 'ラーメン', d: '説明0' },
    '1': { t: '東京' }, // missing d
  });
  const result = parseBatchReply(reply, inputKeys);
  assert.ok('0' in result, 'key "0" should be present');
  assert.ok(!('1' in result), 'key "1" should be absent (missing d)');
});

test('XLT-03: parseBatchReply with non-string t/d omits that key', () => {
  const inputKeys = ['0', '1'];
  const reply = JSON.stringify({
    '0': { t: 'ラーメン', d: '説明0' },
    '1': { t: 1, d: {} }, // non-string t/d
  });
  const result = parseBatchReply(reply, inputKeys);
  assert.ok('0' in result, 'key "0" should be present');
  assert.ok(!('1' in result), 'key "1" should be absent (non-string t/d)');
});

test('XLT-03: parseBatchReply ignores extra/renamed reply keys', () => {
  const inputKeys = ['0', '1'];
  const reply = JSON.stringify({
    '0': { t: 'ラーメン', d: '説明0' },
    '1': { t: '東京', d: '説明1' },
    'item_0': { t: 'injected', d: 'injected' }, // extra key — must be ignored
    '99': { t: 'extra', d: 'extra' },            // out-of-range key — must be ignored
  });
  const result = parseBatchReply(reply, inputKeys);
  // Result keys must be a subset of inputKeys
  for (const key of Object.keys(result)) {
    assert.ok(inputKeys.includes(key), `key "${key}" is not in inputKeys`);
  }
  assert.ok(!('item_0' in result), '"item_0" must not appear in result');
  assert.ok(!('99' in result), '"99" must not appear in result');
});

test('XLT-03: parseBatchReply with non-JSON reply returns empty map', () => {
  const result = parseBatchReply('not json at all', ['0', '1']);
  assert.deepEqual(result, {});
});

test('XLT-03: parseBatchReply with JSON array returns empty map', () => {
  const result = parseBatchReply('[1,2,3]', ['0', '1']);
  assert.deepEqual(result, {});
});

test('XLT-03: parseBatchReply strips code fences before parsing', () => {
  const inputKeys = ['0', '1'];
  const innerJson = JSON.stringify({
    '0': { t: 'ラーメン', d: '説明0' },
    '1': { t: '東京', d: '説明1' },
  });
  // Wrap in code fences (exercises stripWrappers path)
  const raw = '```json\n' + innerJson + '\n```';
  const result = parseBatchReply(raw, inputKeys);
  assert.ok('0' in result, 'key "0" should be parsed through code fences');
  assert.ok('1' in result, 'key "1" should be parsed through code fences');
  assert.equal(result['0'].t, 'ラーメン');
});

// ---------------------------------------------------------------------------
// XLT-05: mergeTranslations
// ---------------------------------------------------------------------------

test('XLT-05: mergeTranslations with full translations overlays t/d and carries url/hostname verbatim', () => {
  const translations = {
    '0': { t: 'ラーメン記事', d: '日本のラーメン料理' },
    '1': { t: '東京グルメ', d: '東京のラーメン店' },
    '2': { t: 'テスト記事', d: 'テスト説明' },
  };
  const merged = mergeTranslations(RESULTS, translations);
  assert.equal(merged.length, RESULTS.length);

  for (let i = 0; i < RESULTS.length; i++) {
    // Title and description are overlaid
    assert.equal(merged[i].title, translations[String(i)].t, `row ${i}: title should be translated`);
    assert.equal(merged[i].description, translations[String(i)].d, `row ${i}: description should be translated`);
    // url/hostname carried verbatim
    assert.equal(merged[i].url, RESULTS[i].url, `row ${i}: url must be verbatim`);
    assert.equal(merged[i].hostname, RESULTS[i].hostname, `row ${i}: hostname must be verbatim`);
  }
  // faviconUrl carried verbatim for row 0
  assert.equal(merged[0].faviconUrl, RESULTS[0].faviconUrl, 'faviconUrl must be carried verbatim');
});

test('XLT-05: mergeTranslations with partial translations keeps raw for missing keys', () => {
  // Only key "0" translated
  const translations = {
    '0': { t: 'ラーメン記事', d: '日本のラーメン料理' },
  };
  const merged = mergeTranslations(RESULTS, translations);
  assert.equal(merged[0].title, 'ラーメン記事', 'row 0 should be translated');
  assert.deepEqual(merged[1], RESULTS[1], 'row 1 should be identical to raw (no translation)');
  assert.deepEqual(merged[2], RESULTS[2], 'row 2 should be identical to raw (no translation)');
});

test('XLT-05: mergeTranslations with empty map returns all raw', () => {
  const merged = mergeTranslations(RESULTS, {});
  // Value equality — each row matches raw
  assert.deepEqual(merged, RESULTS);
  // Reference inequality — must be a NEW array
  assert.ok(merged !== RESULTS, 'mergeTranslations must return a new array, not the original');
});

test('XLT-05: mergeTranslations passes XSS text through unchanged as data (textContent-safe at render)', () => {
  // Simulate an LLM translating a description to an XSS payload
  const xssPayload = '<img src=x onerror=alert(1)>';
  const translations = {
    '0': { t: RESULTS[0].title, d: xssPayload },
  };
  const merged = mergeTranslations(RESULTS, translations);
  // The XSS string must survive as exact data — the renderer applies textContent, not innerHTML
  assert.equal(merged[0].description, xssPayload,
    'XSS payload must be stored as opaque string data; renderer (textContent) prevents execution');
});
