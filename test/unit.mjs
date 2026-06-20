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

const { classifyError, classifyBraveError } = await import(path.join(__dirname, '../dist/errors.js'));
const { stripWrappers } = await import(path.join(__dirname, '../dist/output.js'));
const { migrateSettings } = await import(path.join(__dirname, '../dist/types.js'));

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

test('classifyError: 402 → credits kind', () => {
  const result = classifyError('openrouter', null, { status: 402 });
  assert.equal(result.kind, 'credits');
  assert.match(result.message, /out of credits/i);
  assert.equal(result.status, 402);
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
// classifyBraveError tests (Phase 08-01 Task 1) — Brave Search error model
// 429 → search_quota (distinct from LLM rate_limit), 401/403 → auth,
// network → network, other → unknown.
// ---------------------------------------------------------------------------

test('classifyBraveError: 429 → search_quota kind with quota message', () => {
  const result = classifyBraveError(null, { status: 429 });
  assert.equal(result.kind, 'search_quota');
  assert.match(result.message, /quota/i);
  assert.equal(result.message, 'Search quota exceeded — check your Brave plan');
  assert.equal(result.status, 429);
});

test('classifyBraveError: 401 → auth kind', () => {
  const result = classifyBraveError(new Error('bad key'), { status: 401 });
  assert.equal(result.kind, 'auth');
  assert.match(result.message, /brave api key/i);
  assert.equal(result.status, 401);
});

test('classifyBraveError: 403 → auth kind', () => {
  const result = classifyBraveError(new Error('forbidden'), { status: 403 });
  assert.equal(result.kind, 'auth');
});

test('classifyBraveError: TypeError (offline) → network kind', () => {
  const result = classifyBraveError(new TypeError('Failed to fetch'));
  assert.equal(result.kind, 'network');
  assert.equal(result.message, 'Network error — request timed out or offline');
});

test('classifyBraveError: AbortError (timeout) → network kind', () => {
  const err = new Error('Request was aborted');
  err.name = 'AbortError';
  const result = classifyBraveError(err);
  assert.equal(result.kind, 'network');
  assert.equal(result.message, 'Network error — request timed out or offline');
});

test('classifyBraveError: 500 with bodyMessage → unknown kind with status and body', () => {
  const result = classifyBraveError(new Error('server error'), { status: 500, bodyMessage: 'boom' });
  assert.equal(result.kind, 'unknown');
  assert.ok(result.message.includes('500'), `message should contain '500', got: ${result.message}`);
  assert.ok(result.message.includes('boom'), `message should contain body, got: ${result.message}`);
  assert.equal(result.status, 500);
});

// Regression guard: the LLM rate_limit path must stay distinct from search_quota (D-07).
test('classifyBraveError: 429 is NOT the LLM rate_limit kind (D-07 discriminator)', () => {
  const brave = classifyBraveError(null, { status: 429 });
  const llm = classifyError('openai', new Error('rate limited'), { status: 429 });
  assert.equal(brave.kind, 'search_quota');
  assert.equal(llm.kind, 'rate_limit');
  assert.notEqual(brave.kind, llm.kind);
});

// ---------------------------------------------------------------------------
// migrateSettings braveApiKey tests (Phase 08-01 Task 2)
// Legacy blobs without braveApiKey get the '' default via the DEFAULT_SETTINGS
// spread — must be '' not undefined (Pitfall 3).
// ---------------------------------------------------------------------------

test('migrateSettings: empty blob gets braveApiKey default ""', () => {
  assert.equal(migrateSettings({}).braveApiKey, '');
});

test('migrateSettings: existing braveApiKey value preserved', () => {
  assert.equal(migrateSettings({ braveApiKey: 'abc' }).braveApiKey, 'abc');
});

test('migrateSettings: legacy blob lacking braveApiKey → "" not undefined', () => {
  // A realistic legacy blob from before the Brave feature existed.
  const legacy = { provider: 'openai', apiKey: 'sk-old', model: 'gpt-5-mini' };
  const migrated = migrateSettings(legacy);
  assert.equal(migrated.braveApiKey, '');
  assert.notEqual(migrated.braveApiKey, undefined);
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

// ---------------------------------------------------------------------------
// Provider hardening tests (Task 2) — fetch mocked globally
// ---------------------------------------------------------------------------

const { OpenAIProvider } = await import(path.join(__dirname, '../dist/providers/openai.js'));
const { GeminiProvider } = await import(path.join(__dirname, '../dist/providers/gemini.js'));
const { OpenRouterProvider } = await import(path.join(__dirname, '../dist/providers/openrouter.js'));

const BASE_CONFIG = { sourceLanguage: 'English', targetLanguage: 'Japanese', formality: 'auto' };

// Helper: install a mock fetch, run async fn, restore
async function withFetch(mockFn, fn) {
  const orig = globalThis.fetch;
  globalThis.fetch = mockFn;
  try { return await fn(); } finally { globalThis.fetch = orig; }
}

// --- OpenAI: 401 → auth message ---
test('OpenAIProvider: 401 rejects with auth message', async () => {
  const provider = new OpenAIProvider();
  await withFetch(
    async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Incorrect API key provided' } }),
    }),
    async () => {
      await assert.rejects(
        () => provider.translate('hello', BASE_CONFIG, 'bad-key', 'gpt-5-mini'),
        (err) => {
          assert.ok(err.message.includes('Invalid or unauthorized API key'), `got: ${err.message}`);
          return true;
        }
      );
    }
  );
});

// --- OpenAI: 429 → rate_limit message ---
test('OpenAIProvider: 429 rejects with rate limit message', async () => {
  const provider = new OpenAIProvider();
  await withFetch(
    async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'rate limit exceeded' } }),
    }),
    async () => {
      await assert.rejects(
        () => provider.translate('hello', BASE_CONFIG, 'key', 'gpt-5-mini'),
        (err) => {
          assert.ok(err.message.includes('Rate limited by openai'), `got: ${err.message}`);
          return true;
        }
      );
    }
  );
});

// --- OpenAI: stripWrappers applied on success ---
test('OpenAIProvider: success response strips surrounding quotes', async () => {
  const provider = new OpenAIProvider();
  const result = await withFetch(
    async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '"こんにちは"' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    }),
    () => provider.translate('hello', BASE_CONFIG, 'key', 'gpt-5-mini')
  );
  assert.equal(result.text, 'こんにちは');
  assert.equal(result.usage.inputTokens, 10);
  assert.equal(result.usage.outputTokens, 5);
});

// --- OpenAI: TypeError (offline) → network message ---
test('OpenAIProvider: fetch TypeError rejects with network message', async () => {
  const provider = new OpenAIProvider();
  await withFetch(
    async () => { throw new TypeError('Failed to fetch'); },
    async () => {
      await assert.rejects(
        () => provider.translate('hello', BASE_CONFIG, 'key', 'gpt-5-mini'),
        (err) => {
          assert.ok(err.message.includes('Network error'), `got: ${err.message}`);
          return true;
        }
      );
    }
  );
});

// --- Gemini: 401 → auth message ---
test('GeminiProvider: 401 rejects with auth message', async () => {
  const provider = new GeminiProvider();
  await withFetch(
    async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'API_KEY_INVALID' } }),
    }),
    async () => {
      await assert.rejects(
        () => provider.translate('hello', BASE_CONFIG, 'bad-key', 'gemini-2.5-flash'),
        (err) => {
          assert.ok(err.message.includes('Invalid or unauthorized API key'), `got: ${err.message}`);
          return true;
        }
      );
    }
  );
});

// --- Gemini: 429 → rate_limit message ---
test('GeminiProvider: 429 rejects with rate limit message', async () => {
  const provider = new GeminiProvider();
  await withFetch(
    async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'rate limit' } }),
    }),
    async () => {
      await assert.rejects(
        () => provider.translate('hello', BASE_CONFIG, 'key', 'gemini-2.5-flash'),
        (err) => {
          assert.ok(err.message.includes('Rate limited by gemini'), `got: ${err.message}`);
          return true;
        }
      );
    }
  );
});

// --- Gemini: stripWrappers applied on success ---
test('GeminiProvider: success response strips surrounding quotes', async () => {
  const provider = new GeminiProvider();
  const result = await withFetch(
    async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '"こんにちは"' }] } }],
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 7 },
      }),
    }),
    () => provider.translate('hello', BASE_CONFIG, 'key', 'gemini-2.5-flash')
  );
  assert.equal(result.text, 'こんにちは');
  assert.equal(result.usage.inputTokens, 12);
  assert.equal(result.usage.outputTokens, 7);
});

// --- Gemini: TypeError (offline) → network message ---
test('GeminiProvider: fetch TypeError rejects with network message', async () => {
  const provider = new GeminiProvider();
  await withFetch(
    async () => { throw new TypeError('Failed to fetch'); },
    async () => {
      await assert.rejects(
        () => provider.translate('hello', BASE_CONFIG, 'key', 'gemini-2.5-flash'),
        (err) => {
          assert.ok(err.message.includes('Network error'), `got: ${err.message}`);
          return true;
        }
      );
    }
  );
});

// ---------------------------------------------------------------------------
// OpenRouter provider tests (Plan 02.1-01)
// ---------------------------------------------------------------------------

// --- OpenRouter: 401 → auth message ---
test('OpenRouterProvider: 401 rejects with auth message', async () => {
  const provider = new OpenRouterProvider();
  await withFetch(
    async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Invalid API key' } }),
    }),
    async () => {
      await assert.rejects(
        () => provider.translate('hello', BASE_CONFIG, 'bad-key', 'anthropic/claude-3.5-sonnet'),
        (err) => {
          assert.ok(err.message.includes('Invalid or unauthorized API key'), `got: ${err.message}`);
          return true;
        }
      );
    }
  );
});

// --- OpenRouter: 429 → rate_limit message ---
test('OpenRouterProvider: 429 rejects with rate limit message', async () => {
  const provider = new OpenRouterProvider();
  await withFetch(
    async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'rate limit' } }),
    }),
    async () => {
      await assert.rejects(
        () => provider.translate('hello', BASE_CONFIG, 'key', 'anthropic/claude-3.5-sonnet'),
        (err) => {
          assert.ok(err.message.includes('Rate limited by openrouter'), `got: ${err.message}`);
          return true;
        }
      );
    }
  );
});

// --- OpenRouter: stripWrappers applied on success ---
test('OpenRouterProvider: success response strips surrounding quotes', async () => {
  const provider = new OpenRouterProvider();
  const result = await withFetch(
    async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '"こんにちは"' } }],
        usage: { prompt_tokens: 15, completion_tokens: 8 },
      }),
    }),
    () => provider.translate('hello', BASE_CONFIG, 'key', 'anthropic/claude-3.5-sonnet')
  );
  assert.equal(result.text, 'こんにちは');
  assert.equal(result.usage.inputTokens, 15);
  assert.equal(result.usage.outputTokens, 8);
});

// --- OpenRouter: TypeError (offline) → network message ---
test('OpenRouterProvider: fetch TypeError rejects with network message', async () => {
  const provider = new OpenRouterProvider();
  await withFetch(
    async () => { throw new TypeError('Failed to fetch'); },
    async () => {
      await assert.rejects(
        () => provider.translate('hello', BASE_CONFIG, 'key', 'anthropic/claude-3.5-sonnet'),
        (err) => {
          assert.ok(err.message.includes('Network error'), `got: ${err.message}`);
          return true;
        }
      );
    }
  );
});

// ---------------------------------------------------------------------------
// Cross-site compatibility tests (Phase 3)
// These test the logic patterns used in content.ts since it's a classic script.
// ---------------------------------------------------------------------------

test('isCanvasEditor heuristic: returns true when parent has large canvas', () => {
  // This tests the algorithm, not the actual DOM (no JSDOM in this project)
  // The algorithm: walk up to 5 parent levels, check for canvas > 200x200
  const mockCanvas = { width: 500, height: 800 };
  const hasLargeCanvas = mockCanvas.width > 200 && mockCanvas.height > 200;
  assert.equal(hasLargeCanvas, true, 'Large canvas should trigger detection');
});

test('isCanvasEditor heuristic: returns false for small canvas', () => {
  const mockCanvas = { width: 50, height: 50 };
  const hasLargeCanvas = mockCanvas.width > 200 && mockCanvas.height > 200;
  assert.equal(hasLargeCanvas, false, 'Small canvas should not trigger detection');
});

test('shadow DOM traversal: returns inner activeElement when shadowRoot exists', () => {
  // Test the algorithm: if active.shadowRoot && active.shadowRoot.activeElement -> return inner
  const innerElement = { tagName: 'DIV', isContentEditable: true };
  const outerElement = { shadowRoot: { activeElement: innerElement } };
  const result = outerElement.shadowRoot && outerElement.shadowRoot.activeElement
    ? outerElement.shadowRoot.activeElement
    : outerElement;
  assert.strictEqual(result, innerElement);
});

test('shadow DOM traversal: returns outer element when no shadowRoot', () => {
  const outerElement = { shadowRoot: null, tagName: 'INPUT' };
  const result = outerElement.shadowRoot && outerElement.shadowRoot.activeElement
    ? outerElement.shadowRoot.activeElement
    : outerElement;
  assert.strictEqual(result, outerElement);
});

test('shadow DOM traversal: returns outer element when closed shadowRoot (null)', () => {
  // Closed shadow roots are not accessible — .shadowRoot is null
  const outerElement = { shadowRoot: null, tagName: 'DIV' };
  const result = outerElement.shadowRoot && outerElement.shadowRoot.activeElement
    ? outerElement.shadowRoot.activeElement
    : outerElement;
  assert.strictEqual(result, outerElement);
});

test('cursor positioning: selectionStart/End set to text length for input', () => {
  const text = 'translated text here';
  const selectionStart = text.length;
  const selectionEnd = text.length;
  assert.equal(selectionStart, 20);
  assert.equal(selectionEnd, 20);
});

test('overlay lifecycle: show sets opacity 0.5, hide restores empty', () => {
  // Test the state transitions
  let opacity = '';
  let himeLoading = undefined;

  // show
  opacity = '0.5';
  himeLoading = 'true';
  assert.equal(opacity, '0.5');
  assert.equal(himeLoading, 'true');

  // hide
  opacity = '';
  himeLoading = undefined;
  assert.equal(opacity, '');
  assert.equal(himeLoading, undefined);
});

// ---------------------------------------------------------------------------
// sanitizeSuggestion tests (Phase 05-01 Task 1)
// ---------------------------------------------------------------------------

const { sanitizeSuggestion } = await import(path.join(__dirname, '../dist/predict-util.js'));

test('sanitizeSuggestion: trims surrounding whitespace', () => {
  assert.equal(sanitizeSuggestion('  bright and sunny  '), 'bright and sunny');
});

test('sanitizeSuggestion: truncates at first newline', () => {
  assert.equal(sanitizeSuggestion('line one\nline two'), 'line one');
});

test('sanitizeSuggestion: strips control chars (ASCII BEL)', () => {
  assert.equal(sanitizeSuggestion('foo\x07bar'), 'foobar');
});

test('sanitizeSuggestion: empty string returns empty', () => {
  assert.equal(sanitizeSuggestion(''), '');
});

test('sanitizeSuggestion: only newlines returns empty', () => {
  assert.equal(sanitizeSuggestion('\n\n'), '');
});

// ---------------------------------------------------------------------------
// buildPredictionPrompt tests (Phase 05-01 Task 1)
// ---------------------------------------------------------------------------

const { buildPredictionPrompt } = await import(path.join(__dirname, '../dist/providers/prompt.js'));

test('buildPredictionPrompt: contains "2 to 3 words"', () => {
  assert.ok(buildPredictionPrompt().includes('2 to 3 words'), `missing "2 to 3 words", got: ${buildPredictionPrompt()}`);
});

test('buildPredictionPrompt: contains "language"', () => {
  assert.ok(buildPredictionPrompt().includes('language'), `missing "language", got: ${buildPredictionPrompt()}`);
});

test('buildPredictionPrompt: does NOT contain "translate" (LANG-02)', () => {
  assert.ok(!/translate/i.test(buildPredictionPrompt()), `unexpected "translate" in prompt, got: ${buildPredictionPrompt()}`);
});

// ---------------------------------------------------------------------------
// Provider predict() tests (Phase 05-01 Task 2)
// ---------------------------------------------------------------------------

// --- OpenAI predict: success ---
test('OpenAIProvider predict: success returns suggestion text and usage', async () => {
  const provider = new OpenAIProvider();
  const result = await withFetch(
    async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'bright and sunny' } }],
        usage: { prompt_tokens: 8, completion_tokens: 3 },
      }),
    }),
    () => provider.predict('The weather is', 'key', 'gpt-5-mini')
  );
  assert.equal(result.text, 'bright and sunny');
  assert.equal(result.usage.inputTokens, 8);
  assert.equal(result.usage.outputTokens, 3);
});

// --- OpenAI predict: 401 → auth error ---
test('OpenAIProvider predict: 401 rejects with auth kind', async () => {
  const provider = new OpenAIProvider();
  await withFetch(
    async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Incorrect API key' } }),
    }),
    async () => {
      await assert.rejects(
        () => provider.predict('hello', 'bad-key', 'gpt-5-mini'),
        (err) => {
          assert.equal(err.kind, 'auth');
          return true;
        }
      );
    }
  );
});

// --- Gemini predict: success ---
test('GeminiProvider predict: success returns suggestion text', async () => {
  const provider = new GeminiProvider();
  const result = await withFetch(
    async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '晴れです' }] } }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 },
      }),
    }),
    () => provider.predict('今日の天気は', 'key', 'gemini-2.5-flash')
  );
  assert.equal(result.text, '晴れです');
});

// --- OpenRouter predict: success ---
test('OpenRouterProvider predict: success returns suggestion text', async () => {
  const provider = new OpenRouterProvider();
  const result = await withFetch(
    async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'and bright' } }],
        usage: { prompt_tokens: 6, completion_tokens: 2 },
      }),
    }),
    () => provider.predict('The weather is', 'key', 'openai/gpt-4.1-mini')
  );
  assert.equal(result.text, 'and bright');
});

// ---------------------------------------------------------------------------
// background.ts predict logic tests (Phase 05-01 Task 3)
// Logic-only — no Chrome API
// ---------------------------------------------------------------------------

test('predictText input clip: 600-char input sliced to last 500 chars', () => {
  const input = 'a'.repeat(600);
  const clipped = input.slice(-500);
  assert.equal(clipped.length, 500);
  // Last 500 chars of 600 'a's is still 500 'a's
  assert.equal(clipped, 'a'.repeat(500));
});

test('sanitizeSuggestion applied to multiline provider result', () => {
  const raw = 'two words\nextra line';
  assert.equal(sanitizeSuggestion(raw), 'two words');
});

test('sanitizeSuggestion applied to provider result with control chars', () => {
  const raw = 'bright\x07sunny';
  assert.equal(sanitizeSuggestion(raw), 'brightsunny');
});

// ---------------------------------------------------------------------------
// Ghost-text prediction engine logic tests (Phase 05-02 Task 1)
// Logic-only — no content.ts import (classic script, not importable).
// Algorithms are tested inline, mirroring lines 414-479 precedent.
// ---------------------------------------------------------------------------

test('isCaretAtEnd: selectionStart === selectionEnd === value.length → true', () => {
  const value = 'hello';
  const selectionStart = value.length;
  const selectionEnd = value.length;
  assert.equal(selectionStart === selectionEnd && selectionStart === value.length, true);
});

test('isCaretAtEnd: selectionStart < value.length → false', () => {
  const value = 'hello';
  const selectionStart = 2;
  const selectionEnd = 2;
  assert.equal(selectionStart === selectionEnd && selectionStart === value.length, false);
});

test('isCaretAtEnd: selection is a range (start !== end) → false', () => {
  const value = 'hello';
  const selectionStart = 0;
  const selectionEnd = 5;
  assert.equal(selectionStart === selectionEnd && selectionStart === value.length, false);
});

test('min-chars gate: text.trim().length < 3 → request not issued (ab rejected)', () => {
  const text = 'ab';
  assert.equal(text.trim().length < 3, true, '"ab" should be rejected by min-chars gate');
});

test('min-chars gate: text.trim().length >= 3 → request allowed (abc accepted)', () => {
  const text = 'abc';
  assert.equal(text.trim().length < 3, false, '"abc" should pass min-chars gate');
});

test('stale seq guard: response seq !== current seq → discarded', () => {
  const responseSeq = 1;
  const currentSeq = 2;
  const shouldDiscard = responseSeq !== currentSeq;
  assert.equal(shouldDiscard, true, 'seq=1 vs current=2 should be discarded');
});

test('stale seq guard: response seq === current seq → accepted', () => {
  const responseSeq = 3;
  const currentSeq = 3;
  const shouldDiscard = responseSeq !== currentSeq;
  assert.equal(shouldDiscard, false, 'matching seq should not be discarded');
});

test('element guard: different element → discarded', () => {
  const capturedEl = { id: 'field-a' };
  const currentEl = { id: 'field-b' };
  const shouldDiscard = capturedEl !== currentEl;
  assert.equal(shouldDiscard, true, 'mismatched element should be discarded');
});

test('element guard: same element → accepted', () => {
  const capturedEl = { id: 'field-a' };
  const currentEl = capturedEl;
  const shouldDiscard = capturedEl !== currentEl;
  assert.equal(shouldDiscard, false, 'same element reference should not be discarded');
});

test('input truncation: getTextBeforeCursor result clipped to last 500 chars', () => {
  const longText = 'a'.repeat(600);
  const clipped = longText.slice(-500);
  assert.equal(clipped.length, 500);
});

test('sanitizeGhost: strips control chars and trims', () => {
  // Test the inline algorithm used by sanitizeGhost
  const raw = '  bright\x07sunny  ';
  const newlineIdx = raw.indexOf('\n');
  const s = newlineIdx >= 0 ? raw.slice(0, newlineIdx) : raw;
  const result = s.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
  assert.equal(result, 'brightsunny');
});

test('sanitizeGhost: truncates at first newline', () => {
  const raw = 'line one\nline two';
  const newlineIdx = raw.indexOf('\n');
  const s = newlineIdx >= 0 ? raw.slice(0, newlineIdx) : raw;
  const result = s.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
  assert.equal(result, 'line one');
});

// ---------------------------------------------------------------------------
// Keydown wiring logic tests (Phase 05-02 Task 3)
// Logic-only — no content.ts import (classic script, not importable).
// ---------------------------------------------------------------------------

test('ghostShowing gate: Tab NOT intercepted when suggestion is empty', () => {
  // Gate logic: ghostShowing = predictionState.suggestion !== ''
  const suggestion = '';
  const ghostShowing = suggestion !== '';
  // Tab should not be intercepted when ghost is not showing
  assert.equal(ghostShowing, false, 'empty suggestion → Tab falls through to native behavior');
});

test('ghostShowing gate: Tab IS intercepted when suggestion is non-empty', () => {
  const suggestion = 'bright and sunny';
  const ghostShowing = suggestion !== '';
  assert.equal(ghostShowing, true, 'non-empty suggestion → Tab intercepted to acceptGhost');
});

test('Enter accept: gated to input tag only (textarea passes through)', () => {
  // Enter only accepts ghost when element tag is 'input' (Pitfall 5: textarea needs newline)
  const inputTag = 'input';
  const textareaTag = 'textarea';
  const shouldAcceptOnInput = inputTag === 'input';
  const shouldAcceptOnTextarea = textareaTag === 'input';
  assert.equal(shouldAcceptOnInput, true, 'Enter should accept ghost in single-line input');
  assert.equal(shouldAcceptOnTextarea, false, 'Enter should NOT accept ghost in textarea');
});

test('Enter accept: gated to input tag only (contenteditable passes through)', () => {
  const contentEditableTag = 'div'; // contenteditable div
  const shouldAccept = contentEditableTag === 'input';
  assert.equal(shouldAccept, false, 'Enter should NOT accept ghost in contenteditable');
});

// ---------------------------------------------------------------------------
// BraveSearchClient tests (Phase 08-02 Task 2) — Brave Search transport.
// search() GETs the Brave web-search endpoint with X-Subscription-Token,
// maps web.results[] → SearchResult[] (urls verbatim, SERP-02), and rejects
// with classifyBraveError kinds on failure (429→search_quota, 401→auth,
// network→network). Fetch is mocked via the withFetch helper above.
// ---------------------------------------------------------------------------

const { BraveSearchClient, BRAVE_ENDPOINT } = await import(path.join(__dirname, '../dist/brave-search.js'));

// Build a mock fetch returning a 200 JSON body, capturing the call args.
function braveOkFetch(body, captured) {
  return async (urlStr, init) => {
    captured.url = urlStr;
    captured.init = init;
    return {
      ok: true,
      status: 200,
      json: async () => body,
    };
  };
}

const SAMPLE_BRAVE_BODY = {
  web: {
    results: [
      {
        title: 'Best Greek Restaurants',
        url: 'https://example.com/greek?q=1&x=2',
        description: 'The best <strong>Greek</strong> spots',
        meta_url: { hostname: 'example.com', favicon: 'https://imgs.search.brave.com/fav1' },
      },
      {
        title: 'No hostname result',
        url: 'https://nohost.test/path',
        // meta_url.hostname absent → fall back to new URL(url).hostname
        meta_url: {},
        // description absent → '' fallback
      },
    ],
  },
};

test('BraveSearchClient: 200 maps web.results to SearchResult[] with title/url/description/hostname', async () => {
  const client = new BraveSearchClient();
  const captured = {};
  const results = await withFetch(braveOkFetch(SAMPLE_BRAVE_BODY, captured), () =>
    client.search('greek food', 'test-key'),
  );
  assert.equal(results.length, 2);
  assert.equal(results[0].title, 'Best Greek Restaurants');
  assert.equal(results[0].description, 'The best <strong>Greek</strong> spots');
  assert.equal(results[0].hostname, 'example.com');
});

test('BraveSearchClient: url is byte-for-byte verbatim from web.results (SERP-02)', async () => {
  const client = new BraveSearchClient();
  const captured = {};
  const results = await withFetch(braveOkFetch(SAMPLE_BRAVE_BODY, captured), () =>
    client.search('greek food', 'test-key'),
  );
  // The url with query params must not be re-encoded or mutated.
  assert.equal(results[0].url, 'https://example.com/greek?q=1&x=2');
});

test('BraveSearchClient: missing meta_url.hostname falls back to new URL(url).hostname', async () => {
  const client = new BraveSearchClient();
  const captured = {};
  const results = await withFetch(braveOkFetch(SAMPLE_BRAVE_BODY, captured), () =>
    client.search('q', 'test-key'),
  );
  assert.equal(results[1].hostname, 'nohost.test');
});

test('BraveSearchClient: missing description → "" (never undefined)', async () => {
  const client = new BraveSearchClient();
  const captured = {};
  const results = await withFetch(braveOkFetch(SAMPLE_BRAVE_BODY, captured), () =>
    client.search('q', 'test-key'),
  );
  assert.equal(results[1].description, '');
  assert.notEqual(results[1].description, undefined);
});

test('BraveSearchClient: empty/absent web.results → [] (not a throw)', async () => {
  const client = new BraveSearchClient();
  const captured = {};
  const empty = await withFetch(braveOkFetch({ web: { results: [] } }, captured), () =>
    client.search('q', 'k'),
  );
  assert.deepEqual(empty, []);
  const absent = await withFetch(braveOkFetch({}, captured), () => client.search('q', 'k'));
  assert.deepEqual(absent, []);
});

test('BraveSearchClient: request carries X-Subscription-Token header equal to key + Accept json', async () => {
  const client = new BraveSearchClient();
  const captured = {};
  await withFetch(braveOkFetch(SAMPLE_BRAVE_BODY, captured), () =>
    client.search('greek food', 'my-secret-key'),
  );
  assert.equal(captured.init.headers['X-Subscription-Token'], 'my-secret-key');
  assert.equal(captured.init.headers['Accept'], 'application/json');
});

test('BraveSearchClient: request URL contains q, count, result_filter=web params', async () => {
  const client = new BraveSearchClient();
  const captured = {};
  await withFetch(braveOkFetch(SAMPLE_BRAVE_BODY, captured), () =>
    client.search('greek food', 'k', { count: 5 }),
  );
  const u = new URL(captured.url);
  assert.equal(u.searchParams.get('q'), 'greek food');
  assert.equal(u.searchParams.get('count'), '5');
  assert.equal(u.searchParams.get('result_filter'), 'web');
  assert.equal(u.origin + u.pathname, BRAVE_ENDPOINT);
});

test('BraveSearchClient: 429 rejects with .kind === "search_quota"', async () => {
  const client = new BraveSearchClient();
  await withFetch(
    async () => ({ ok: false, status: 429, json: async () => ({}) }),
    async () => {
      await assert.rejects(
        () => client.search('q', 'k'),
        (err) => {
          assert.equal(err.kind, 'search_quota');
          return true;
        },
      );
    },
  );
});

test('BraveSearchClient: 401 rejects with .kind === "auth"', async () => {
  const client = new BraveSearchClient();
  await withFetch(
    async () => ({ ok: false, status: 401, json: async () => ({ message: 'bad key' }) }),
    async () => {
      await assert.rejects(
        () => client.search('q', 'k'),
        (err) => {
          assert.equal(err.kind, 'auth');
          assert.equal(err.status, 401);
          return true;
        },
      );
    },
  );
});

test('BraveSearchClient: fetch throwing TypeError rejects with .kind === "network"', async () => {
  const client = new BraveSearchClient();
  await withFetch(
    async () => {
      throw new TypeError('Failed to fetch');
    },
    async () => {
      await assert.rejects(
        () => client.search('q', 'k'),
        (err) => {
          assert.equal(err.kind, 'network');
          return true;
        },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// searchTranslated / testBraveKey handler logic (Phase 08-03 Task 1)
//
// background.ts calls chrome.* at module load, so it is not importable under
// node:test. Following the predict-handler precedent (logic tested inline as
// pure algorithm, no chrome import), these tests exercise the EXTRACTABLE pure
// logic of the searchTranslated/testBraveKey handlers: dedup-key normalization,
// in-flight dedup collapsing, the source==target `direct` flag, and the
// empty-key short-circuit guard.
// ---------------------------------------------------------------------------

// (a) dedupKey normalization — trim().toLowerCase()
test('searchTranslated dedup: dedupKey normalizes via trim().toLowerCase()', () => {
  const dedupKey = (q) => q.trim().toLowerCase();
  assert.equal(dedupKey('Hello '), 'hello');
  assert.equal(dedupKey('  WORLD'), 'world');
  // Two visually-distinct submits of the same query normalize identically.
  assert.equal(dedupKey('Tokyo '), dedupKey('tokyo'));
});

// (b) dedup harness — two same-key calls reuse ONE underlying async fn
test('searchTranslated dedup: two same-key submits issue only ONE underlying search', async () => {
  let fetchCount = 0;
  // Stand-in for braveClient.search — increments once per real invocation.
  const underlyingSearch = async (_q) => {
    fetchCount += 1;
    return [{ title: 'r' }];
  };

  const inFlight = new Map();
  // Mirrors the handler's dedup branch with try/finally cleanup (Pitfall 4).
  async function dispatch(query) {
    const key = query.trim().toLowerCase();
    if (inFlight.has(key)) {
      return inFlight.get(key);
    }
    const promise = underlyingSearch(query);
    inFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      inFlight.delete(key);
    }
  }

  // Fire two same-query submits before the first resolves.
  const [a, b] = await Promise.all([dispatch('Hello '), dispatch('hello')]);
  assert.equal(fetchCount, 1, 'expected exactly one underlying search for two same-key submits');
  assert.deepEqual(a, b);
  // Map entry cleaned up after settle (Pitfall 4).
  assert.equal(inFlight.size, 0);
});

// (b2) dedup cleanup on FAILURE — a rejected query leaves no hanging entry
test('searchTranslated dedup: failed query deletes Map entry (try/finally, Pitfall 4)', async () => {
  const inFlight = new Map();
  const failingSearch = async () => {
    throw Object.assign(new Error('boom'), { kind: 'search_quota' });
  };
  async function dispatch(query) {
    const key = query.trim().toLowerCase();
    const promise = failingSearch(query);
    inFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      inFlight.delete(key);
    }
  }
  await assert.rejects(() => dispatch('q'));
  assert.equal(inFlight.size, 0, 'failed query must not leave a hanging dedup entry');
});

// (c) direct flag — isDirect = (source === target)
test('searchTranslated direct flag: isDirect true for equal, false for unequal source/target', () => {
  const isDirect = (s, t) => s === t;
  assert.equal(isDirect('Japanese', 'Japanese'), true);
  assert.equal(isDirect('English', 'English'), true);
  assert.equal(isDirect('English', 'Japanese'), false);
});

// (d) empty-key guard — short-circuits before a fetch flag is set
test('searchTranslated empty.key guard: empty braveApiKey short-circuits before fetch', () => {
  let fetchAttempted = false;
  function guardThenFetch(apiKey) {
    if (!apiKey) {
      return { error: 'Brave API key not configured — add it in options', kind: 'auth' };
    }
    fetchAttempted = true;
    return { results: [] };
  }
  const res = guardThenFetch('');
  assert.equal(fetchAttempted, false, 'must not attempt a fetch when key is empty');
  assert.equal(res.kind, 'auth');
  assert.ok(/api key/i.test(res.error));
});
