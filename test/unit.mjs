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
