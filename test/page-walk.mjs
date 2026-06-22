/**
 * node:test harness for the pure page-walk helpers.
 * Exercises isTranslatableTag, collectTextNodesRecursive (recursive walk —
 * NOT native createTreeWalker, which linkedom does not drive under acceptNode,
 * RESEARCH Pitfall 3), chunkByBudget, buildPageBatchPrompt, parsePageBatchReply,
 * captureOriginal, and selectFailedRetry against dist/page-walk.js.
 *
 * Requirements covered: PAGE-01, PAGE-02, PAGE-03, PAGE-04, PAGE-05 + T-15-01 key-injection guard + D-04 failed-set
 *
 * Run individually: npm run build && node --test test/page-walk.mjs
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

const {
  SKIP_TAGS,
  isTranslatableTag,
  collectTextNodesRecursive,
  chunkByBudget,
  buildPageBatchPrompt,
  parsePageBatchReply,
  captureOriginal,
  selectFailedRetry,
  PAGE_CHUNK_MAX_CHARS,
  PAGE_CONCURRENCY_CAP,
} = await import(path.join(__dirname, '../dist/page-walk.js'));

/** Default config for prompt tests (matches TranslationConfig shape used elsewhere). */
const CONFIG = {
  sourceLanguage: 'English',
  targetLanguage: 'Japanese',
  formality: 'polite',
};

// An isEditable stub: an element is "editable" if it carries data-hime-editable
// (stands in for `el.isContentEditable` in the live walk — content.ts uses the
// native property, the test uses a marker attribute).
const isEditable = (el) => el.hasAttribute && el.hasAttribute('data-hime-editable');

// ---------------------------------------------------------------------------
// isTranslatableTag / SKIP_TAGS (PAGE-02)
// ---------------------------------------------------------------------------

test('isTranslatableTag: skip-set tags are non-translatable (case-insensitive)', () => {
  assert.equal(isTranslatableTag('SCRIPT'), false);
  assert.equal(isTranslatableTag('pre'), false);
  assert.equal(isTranslatableTag('Style'), false);
  assert.equal(isTranslatableTag('code'), false);
  assert.equal(isTranslatableTag('TEXTAREA'), false);
  assert.equal(isTranslatableTag('P'), true);
  assert.equal(isTranslatableTag('span'), true);
  assert.equal(isTranslatableTag('div'), true);
});

test('SKIP_TAGS covers the RESEARCH A3 non-translatable set', () => {
  for (const tag of ['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'TITLE', 'TEMPLATE', 'SVG', 'MATH', 'HEAD']) {
    assert.ok(SKIP_TAGS.has(tag), `SKIP_TAGS should contain ${tag}`);
  }
});

// ---------------------------------------------------------------------------
// collectTextNodesRecursive: skip-set + contenteditable + visibility (PAGE-01/02/05)
// ---------------------------------------------------------------------------

test('collectTextNodesRecursive: skips script/style/code/pre/textarea subtrees (PAGE-02)', () => {
  const { document } = parseHTML(`<!doctype html><html><body>
    <p>visible one</p>
    <script>var hidden = 'no translate';</script>
    <style>.x { color: red; }</style>
    <pre>preformatted skip</pre>
    <code>code skip</code>
    <textarea>textarea skip</textarea>
    <div>visible two</div>
  </body></html>`);
  const nodes = collectTextNodesRecursive(document.body, isEditable);
  const texts = nodes.map((n) => n.nodeValue.trim());
  assert.deepEqual(texts, ['visible one', 'visible two']);
});

test('collectTextNodesRecursive: skips contenteditable subtrees via isEditable (PAGE-02)', () => {
  const { document } = parseHTML(`<!doctype html><html><body>
    <p>keep me</p>
    <div data-hime-editable="true"><span>editable child skip</span></div>
    <p>keep me too</p>
  </body></html>`);
  const nodes = collectTextNodesRecursive(document.body, isEditable);
  const texts = nodes.map((n) => n.nodeValue.trim());
  assert.deepEqual(texts, ['keep me', 'keep me too']);
});

test('collectTextNodesRecursive: returns ordered visible nodes, whitespace-only omitted (PAGE-01/05)', () => {
  const { document } = parseHTML(`<!doctype html><html><body><p>first</p>   <p>  </p><div><span>nested second</span> tail third</div></body></html>`);
  const nodes = collectTextNodesRecursive(document.body, isEditable);
  const texts = nodes.map((n) => n.nodeValue.trim());
  // whitespace-only <p> and the inter-element whitespace are omitted; order preserved.
  assert.deepEqual(texts, ['first', 'nested second', 'tail third']);
});

// ---------------------------------------------------------------------------
// chunkByBudget (PAGE-04)
// ---------------------------------------------------------------------------

test('chunkByBudget: groups under budget and isolates an oversized node (PAGE-04)', () => {
  // 'aaaa'(4) + 'bb'(2) = 6 > 5 → flush ['aaaa'] then ['bb']; 'cccccc'(6) > 5 alone.
  const chunks = chunkByBudget(['aaaa', 'bb', 'cccccc'], 5);
  assert.deepEqual(chunks, [[0], [1], [2]]);
});

test('chunkByBudget: packs multiple small nodes into one chunk under budget', () => {
  const chunks = chunkByBudget(['a', 'b', 'c'], 5);
  assert.deepEqual(chunks, [[0, 1, 2]]);
});

test('chunkByBudget: oversized lone node still gets its own chunk', () => {
  const chunks = chunkByBudget(['x'.repeat(50)], 5);
  assert.deepEqual(chunks, [[0]]);
});

test('chunkByBudget: empty input → no chunks', () => {
  assert.deepEqual(chunkByBudget([], 5), []);
});

test('chunkByBudget: default budget is PAGE_CHUNK_MAX_CHARS', () => {
  assert.equal(PAGE_CHUNK_MAX_CHARS, 4000);
  assert.equal(PAGE_CONCURRENCY_CAP, 2);
  const oneBig = ['y'.repeat(3999), 'z'.repeat(2)];
  // 3999 + 2 = 4001 > 4000 → splits into two chunks under the default budget.
  assert.deepEqual(chunkByBudget(oneBig), [[0], [1]]);
});

// ---------------------------------------------------------------------------
// buildPageBatchPrompt
// ---------------------------------------------------------------------------

test('buildPageBatchPrompt: targets language, demands JSON-only, includes formality', () => {
  const prompt = buildPageBatchPrompt(CONFIG);
  assert.match(prompt, /Japanese/);
  assert.match(prompt, /ONLY a valid JSON object/);
  assert.match(prompt, /same keys/);
  assert.match(prompt, /です\/ます/); // polite formality instruction
  assert.doesNotMatch(prompt, /code fences\?/); // sanity — instructs against fences
  assert.match(prompt, /no code fences/);
});

// ---------------------------------------------------------------------------
// parsePageBatchReply: key-injection guard, string-typing, fallbacks (PAGE-04 / T-15-01)
// ---------------------------------------------------------------------------

test('parsePageBatchReply: iterates inputKeys only, drops injected/extraneous keys (T-15-01)', () => {
  const out = parsePageBatchReply('{"0":"hi","2":"yo","evil":"x"}', ['0', '1', '2']);
  assert.deepEqual(out, { 0: 'hi', 2: 'yo' }); // 'evil' dropped (not in inputKeys), '1' missing
});

test('parsePageBatchReply: drops a __proto__ injection key (T-15-01)', () => {
  const out = parsePageBatchReply('{"0":"ok","__proto__":"polluted"}', ['0']);
  assert.deepEqual(out, { 0: 'ok' });
  // The returned object's prototype is untouched (key was never read).
  assert.equal(Object.getPrototypeOf({}).polluted, undefined);
});

test('parsePageBatchReply: drops non-string entries', () => {
  const out = parsePageBatchReply('{"0":"keep","1":123,"2":null,"3":{"a":1}}', ['0', '1', '2', '3']);
  assert.deepEqual(out, { 0: 'keep' });
});

test('parsePageBatchReply: strips a ```json code fence then parses', () => {
  const raw = '```json\n{"0":"こんにちは","1":"さようなら"}\n```';
  const out = parsePageBatchReply(raw, ['0', '1']);
  assert.deepEqual(out, { 0: 'こんにちは', 1: 'さようなら' });
});

test('parsePageBatchReply: falls back to raw.trim() when stripWrappers result is unparseable', () => {
  const out = parsePageBatchReply('   {"0":"trimmed"}   ', ['0']);
  assert.deepEqual(out, { 0: 'trimmed' });
});

test('parsePageBatchReply: array / non-object / garbage → {}', () => {
  assert.deepEqual(parsePageBatchReply('["a","b"]', ['0', '1']), {});
  assert.deepEqual(parsePageBatchReply('null', ['0']), {});
  assert.deepEqual(parsePageBatchReply('"just a string"', ['0']), {});
  assert.deepEqual(parsePageBatchReply('not json at all', ['0']), {});
});

// ---------------------------------------------------------------------------
// captureOriginal: once-only capture → restore round-trip (PAGE-03 / Pitfall 7)
// ---------------------------------------------------------------------------

test('captureOriginal: first capture wins, re-capture does not overwrite original (PAGE-03)', () => {
  const store = new Map();
  captureOriginal(store, '0', 'X'); // original page text
  assert.deepEqual(store.get('0'), { original: 'X', translated: '' });

  // Simulate re-running translate while already translated: must NOT clobber original.
  captureOriginal(store, '0', 'TRANSLATED');
  assert.equal(store.get('0').original, 'X');
});

test('captureOriginal: restore round-trip — toggle reads back the captured original', () => {
  const store = new Map();
  const nodes = { 0: 'Hello', 1: 'World' };
  for (const key of Object.keys(nodes)) captureOriginal(store, key, nodes[key]);

  // Apply translations.
  store.get('0').translated = 'こんにちは';
  store.get('1').translated = '世界';

  // Toggle to translated.
  for (const key of Object.keys(nodes)) nodes[key] = store.get(key).translated;
  assert.deepEqual(nodes, { 0: 'こんにちは', 1: '世界' });

  // Toggle back to original — captured originals are intact.
  for (const key of Object.keys(nodes)) nodes[key] = store.get(key).original;
  assert.deepEqual(nodes, { 0: 'Hello', 1: 'World' });
});

// ---------------------------------------------------------------------------
// selectFailedRetry + chunkByBudget: failed-node retry contract (D-04)
// ---------------------------------------------------------------------------

test('selectFailedRetry: returns failed keys; caller clears then re-adds on fresh failure (D-04)', () => {
  const failed = new Set(['1', '4', '7']);
  const toRetry = selectFailedRetry(failed);
  assert.deepEqual(toRetry.sort(), ['1', '4', '7']);

  // Caller re-chunks ONLY the failed set — chunks are scoped to those keys' texts.
  const failedTexts = toRetry.map((k) => `text-${k}`);
  const chunks = chunkByBudget(failedTexts, 100);
  // All retried texts belong to the failed set, nothing else.
  const flatCount = chunks.reduce((n, c) => n + c.length, 0);
  assert.equal(flatCount, toRetry.length);

  // On success the caller clears the set; a later failure re-adds.
  failed.clear();
  assert.equal(failed.size, 0);
  failed.add('4');
  assert.deepEqual(selectFailedRetry(failed), ['4']);
});
