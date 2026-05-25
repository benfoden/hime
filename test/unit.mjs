/**
 * Unit tests for classifyError and stripWrappers.
 * Runs against compiled output in dist/ via:  npm test
 * (tsc compiles src→dist, then node --test test/)
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { classifyError } = await import(path.join(__dirname, '../dist/errors.js'));
const { stripWrappers } = await import(path.join(__dirname, '../dist/output.js'));

// ---------------------------------------------------------------------------
// classifyError tests
// ---------------------------------------------------------------------------

test('classifyError: 401 → auth kind with key message', () => {
  const result = classifyError('openai', new Error('bad key'), { status: 401 });
  assert.equal(result.kind, 'auth');
  assert.equal(result.message, 'Invalid or unauthorized API key — check it in options');
  assert.equal(result.status, 401);
});

test('classifyError: 403 → auth kind (gemini)', () => {
  const result = classifyError('gemini', new Error('forbidden'), { status: 403 });
  assert.equal(result.kind, 'auth');
  assert.equal(result.message, 'Invalid or unauthorized API key — check it in options');
});

test('classifyError: 429 → rate_limit kind', () => {
  const result = classifyError('openai', new Error('rate limited'), { status: 429 });
  assert.equal(result.kind, 'rate_limit');
  assert.equal(result.message, 'Rate limited by openai — wait and retry');
  assert.equal(result.status, 429);
});

test('classifyError: AbortError → network kind', () => {
  const err = new Error('Request was aborted');
  err.name = 'AbortError';
  const result = classifyError('openai', err);
  assert.equal(result.kind, 'network');
  assert.equal(result.message, 'Network error — request timed out or offline');
});

test('classifyError: fetch TypeError → network kind', () => {
  const result = classifyError('openai', new TypeError('Failed to fetch'));
  assert.equal(result.kind, 'network');
  assert.equal(result.message, 'Network error — request timed out or offline');
});

test('classifyError: 500 with bodyMessage → unknown kind with body', () => {
  const result = classifyError('gemini', new Error('server error'), { status: 500, bodyMessage: 'boom' });
  assert.equal(result.kind, 'unknown');
  assert.equal(result.message, 'gemini error 500: boom');
  assert.equal(result.status, 500);
});

test('classifyError: 418 → unknown kind with status in message', () => {
  const result = classifyError('openai', new Error("I'm a teapot"), { status: 418 });
  assert.equal(result.kind, 'unknown');
  assert.ok(result.message.includes('418'), `message should contain '418', got: ${result.message}`);
});

// ---------------------------------------------------------------------------
// stripWrappers tests
// ---------------------------------------------------------------------------

test('stripWrappers: removes surrounding double quotes', () => {
  assert.equal(stripWrappers('"こんにちは"'), 'こんにちは');
});

test('stripWrappers: removes Japanese corner quotes', () => {
  assert.equal(stripWrappers('「こんにちは」'), 'こんにちは');
});

test('stripWrappers: removes leading "Here is the translation:" line', () => {
  const result = stripWrappers('Here is the translation: こんにちは');
  assert.equal(result, 'こんにちは');
});

test('stripWrappers: removes markdown code fences', () => {
  assert.equal(stripWrappers('```\nこんにちは\n```'), 'こんにちは');
});

test('stripWrappers: removes leading "Translation:" prefix', () => {
  assert.equal(stripWrappers('Translation: こんにちは'), 'こんにちは');
});

test('stripWrappers: trims surrounding whitespace', () => {
  assert.equal(stripWrappers('  こんにちは  '), 'こんにちは');
});

test('stripWrappers: clean text passes through untouched', () => {
  const clean = 'こんにちは。元気ですか？';
  assert.equal(stripWrappers(clean), clean);
});

// ---------------------------------------------------------------------------
// buildSystemPrompt tests (Task 1)
// ---------------------------------------------------------------------------

const { buildSystemPrompt } = await import(path.join(__dirname, '../dist/providers/prompt.js'));

test('buildSystemPrompt: contains "Output ONLY the translated text"', () => {
  const result = buildSystemPrompt({ targetLanguage: 'Japanese', formality: 'auto', sourceLanguage: 'English' });
  assert.ok(result.includes('Output ONLY the translated text'), `missing core instruction, got: ${result}`);
});

test('buildSystemPrompt: auto formality contains tuned register cues', () => {
  const result = buildSystemPrompt({ targetLanguage: 'Japanese', formality: 'auto', sourceLanguage: 'English' });
  assert.ok(result.includes('Detect the register of the input'), `missing detect instruction, got: ${result}`);
  assert.ok(result.includes("hey what's up"), `missing casual example, got: ${result}`);
  assert.ok(result.includes('Thank you for your help with this matter'), `missing business example, got: ${result}`);
});

test('buildSystemPrompt: casual formality contains タメ口 / plain form instruction', () => {
  const result = buildSystemPrompt({ targetLanguage: 'Japanese', formality: 'casual', sourceLanguage: 'English' });
  assert.ok(result.includes('タメ口'), `missing タメ口, got: ${result}`);
  assert.ok(result.includes('plain form'), `missing plain form, got: ${result}`);
});

test('buildSystemPrompt: polite formality contains です/ます instruction', () => {
  const result = buildSystemPrompt({ targetLanguage: 'Japanese', formality: 'polite', sourceLanguage: 'English' });
  assert.ok(result.includes('です/ます'), `missing です/ます, got: ${result}`);
});

test('buildSystemPrompt: formal formality contains 敬語 instruction', () => {
  const result = buildSystemPrompt({ targetLanguage: 'Japanese', formality: 'formal', sourceLanguage: 'English' });
  assert.ok(result.includes('敬語'), `missing 敬語, got: ${result}`);
});

test('buildSystemPrompt: customPrompt is appended at end', () => {
  const result = buildSystemPrompt({ targetLanguage: 'Japanese', formality: 'auto', sourceLanguage: 'English', customPrompt: 'EXTRA' });
  assert.ok(result.endsWith('EXTRA'), `customPrompt not at end, got: ${result}`);
});

test('buildSystemPrompt: no chrome. reference in output', () => {
  const result = buildSystemPrompt({ targetLanguage: 'Japanese', formality: 'auto', sourceLanguage: 'English' });
  assert.ok(!result.includes('chrome.'), `unexpected chrome. in prompt, got: ${result}`);
});
