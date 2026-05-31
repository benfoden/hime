# Phase 5: Ghost-Text Prediction Engine - Pattern Map

**Mapped:** 2026-05-30
**Files analyzed:** 7 (5 modified, 0 new directories)
**Analogs found:** 7 / 7

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/content.ts` (ghost state + rendering + keydown extensions) | content-script, utility | event-driven | `src/content.ts` existing overlay + keydown listener | exact — extend in-place |
| `src/background.ts` (new `predict` case) | service-worker handler | request-response | `src/background.ts` `translate` case (lines 101–115) | exact — parallel case |
| `src/providers/prompt.ts` (new `buildPredictionPrompt`) | utility | transform | `src/providers/prompt.ts` `buildSystemPrompt` (lines 8–17) | exact — sibling export |
| `src/providers/openai.ts` (new `predict` method) | service, provider | request-response | `src/providers/openai.ts` `translate` method (lines 9–61) | exact — parallel method |
| `src/providers/gemini.ts` (new `predict` method) | service, provider | request-response | `src/providers/gemini.ts` `translate` method (lines 9–65) | exact — parallel method |
| `src/providers/openrouter.ts` (new `predict` method) | service, provider | request-response | `src/providers/openrouter.ts` `translate` method (lines 9–62) | exact — parallel method |
| `src/types.ts` (new `PredictMessage` type + `MessageType` union) | config/types | — | `src/types.ts` `TranslateMessage` (lines 70–77) + `MessageType` union (lines 52–63) | exact — extend union + add interface |
| `test/unit.mjs` (new prediction state-machine tests) | test | — | `test/unit.mjs` provider mock-fetch pattern (lines 165–407) | exact — same framework + helper |

---

## Pattern Assignments

### `src/content.ts` — ghost state block (new top-level state variables)

**Analog:** `src/content.ts` compose-state block (lines 9–17)

This file is a **classic script** (no ESM import/export — enforced by comment at line 1–5).
All new prediction code must follow the same non-module style.

**State variables pattern** (copy from lines 9–17):
```typescript
// Prediction state — mirrors composeState shape: plain object, no class
let predictionState: {
  suggestion: string;
  element: HTMLElement | null;
  requestSeq: number;
  abortController: AbortController | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
} = {
  suggestion: '',
  element: null,
  requestSeq: 0,
  abortController: null,
  debounceTimer: null,
};
```

---

### `src/content.ts` — `showLoadingOverlay` (overlay positioning analog for ghost overlay)

**Analog:** `src/content.ts` `showLoadingOverlay` (lines 148–179)

**Overlay creation + positioning pattern** (copy from lines 148–179):
```typescript
// From showLoadingOverlay — the ghost overlay follows this exact pattern:
const overlay = document.createElement('div');
overlay.id = 'hime-loading-overlay';         // ghost uses 'hime-ghost-overlay'
overlay.style.cssText = [
  'position: absolute',
  'pointer-events: none',
  'font-family: monospace',
  'font-size: 11px',
  'color: #FFA500',                           // ghost uses rgba(120,120,120,0.6)
  'z-index: 2147483647',
  'white-space: nowrap',
].join(';');

// Positioning — the ghost overlay copies this rect + scroll offset technique:
const rect = element.getBoundingClientRect();
overlay.style.top = `${rect.top + window.scrollY + 4}px`;
overlay.style.left = `${rect.left + window.scrollX + 4}px`;  // ghost: + paddingLeft + textEndX
document.body.appendChild(overlay);
```

**Key differences for ghost overlay:**
- `id`: `'hime-ghost-overlay'`
- `left`: `rect.left + window.scrollX + parseFloat(cs.paddingLeft) + textEndX` (mirror-div measurement)
- `top`: `rect.top + window.scrollY + parseFloat(cs.paddingTop)`
- `font-family/size/weight/line-height`: copied from `getComputedStyle(element)` to match field exactly
- No spinner, no `setInterval` — ghost text is static once rendered

**`hideLoadingOverlay` teardown pattern** (copy from lines 181–194):
```typescript
// hideLoadingOverlay — ghost removeGhostOverlay follows this shape:
function hideLoadingOverlay(element: HTMLElement): void {
  element.style.opacity = '';
  delete element.dataset.himeLoading;          // ghost: no dataset mutation
  if (spinnerInterval) {
    clearInterval(spinnerInterval);
    spinnerInterval = null;
  }
  const overlay = document.getElementById('hime-loading-overlay');
  if (overlay) overlay.remove();               // ghost: getElementById('hime-ghost-overlay')?.remove()
}
```

---

### `src/content.ts` — `setElementText` (execCommand accept analog)

**Analog:** `src/content.ts` `setElementText` (lines 101–129)

**execCommand('insertText') pattern** (lines 107–114):
```typescript
// setElementText selects ALL then inserts. acceptGhost inserts AT caret (no select):
element.focus();
// For input/textarea — caret insert (NOT inputEl.select() before):
document.execCommand('insertText', false, suggestion);
// selectionStart/End lands at end of inserted text automatically

// For contenteditable:
document.execCommand('insertText', false, suggestion);
const sel = window.getSelection();
if (sel && sel.rangeCount > 0) {
  sel.collapseToEnd();
}
```

---

### `src/content.ts` — capture-phase keydown listener (extend for prediction keys)

**Analog:** `src/content.ts` capture-phase keydown listener (lines 420–454)

**Listener structure pattern** (lines 420–454 — add prediction branches here):
```typescript
// The existing listener at line 420 is the ONLY capture-phase listener.
// Add prediction key handling INSIDE this listener, not a new addEventListener.
document.addEventListener('keydown', (event) => {
  const ctrl = event.ctrlKey || event.metaKey;
  if (!ctrl || event.altKey) return;
  const key = event.key.toLowerCase();

  // Swap direction: line 425–430 (keep unchanged)

  // Valid-field guard: line 433–434 (keep unchanged)
  const element = getActiveElement();
  if (!element || !isValidInputElement(element)) return;

  // NEW: ghost accept — Tab and Enter (gate on ghost showing)
  // Ghost dismiss — Esc (before existing compose-Esc, per D-09)
  // Ghost trigger — Ctrl+Space (D-03)

  // Existing Ctrl+Shift+Y and Ctrl+Y blocks follow (lines 438–453)
}, true);  // <-- true = capture phase (line 454)
```

**Esc precedence pattern** — copy from lines 407–411 (the earlier non-capture listener):
```typescript
// Existing Esc handler at line 407-411:
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && composeState.isActive) {
    exitComposeMode();
  }
});
// Ghost Esc must be inserted BEFORE compose check, inside the same handler block.
// Per D-09: if ghost showing -> dismissGhost(); else if composeState.isActive -> exitComposeMode()
```

---

### `src/content.ts` — `translateText` (sendMessage round-trip analog for `sendPredictMessage`)

**Analog:** `src/content.ts` `translateText` (lines 220–240)

**chrome.runtime.sendMessage Promise wrapper pattern** (lines 220–240):
```typescript
async function translateText(text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: 'translate',          // prediction: 'predict'
        payload: { text },
      } as Message,
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.error) {
          const e = new Error(response.error);
          (e as any).kind = response.kind ?? 'unknown';
          reject(e);
        } else {
          resolve(response?.translatedText || ''); // prediction: response?.suggestion || ''
        }
      }
    );
  });
}
```

---

### `src/content.ts` — `focusout` / `focusin` event listeners (blur cleanup analog)

**Analog:** `src/content.ts` focus listeners (lines 400–404):
```typescript
document.addEventListener('focusin', handleFocusChange);
document.addEventListener('focusout', () => {
  setTimeout(handleFocusChange, 0);
});
```

**Ghost blur cleanup pattern** — add inside the existing focusout callback:
```typescript
// Inside focusout callback: clear ghost + abort in-flight request
removeGhostOverlay();
predictionState.abortController?.abort();
predictionState.abortController = null;
predictionState.suggestion = '';
predictionState.element = null;
if (predictionState.debounceTimer !== null) {
  clearTimeout(predictionState.debounceTimer);
  predictionState.debounceTimer = null;
}
```

---

### `src/background.ts` — new `predict` case in message handler

**Analog:** `src/background.ts` `translate` case (lines 101–115)

**Message case pattern** (lines 97–115):
```typescript
// The entire message handler at lines 97–161 follows this async IIFE + switch pattern:
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'translate': {                          // copy as 'predict'
          const translateMsg = message as TranslateMessage;  // PredictMessage
          const s = await getSettings();
          console.log('[hime] translate request', { provider: s.provider, model: s.model, length: translateMsg.payload.text.length });
          try {
            const result = await translateText(translateMsg.payload.text);  // predictText()
            sendResponse({ translatedText: result.text });                  // { suggestion: result.text }
          } catch (err) {
            const kind = (err as any)?.kind ?? 'unknown';
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            sendResponse({ error: errorMessage, kind });  // prediction: sendResponse({ suggestion: '' }) per D-10
          }
          break;
        }
        // ... other cases
      }
    } catch (error) {
      sendResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  })();
  return true; // Keep message channel open for async — line 161
});
```

**`translateText` function as analog for `predictText`** (lines 63–94):
```typescript
// translateText structure — predictText follows this shape:
async function predictText(text: string): Promise<TranslationResult> {
  const settings = await getSettings();
  const apiKey = settings.apiKeys[settings.provider] || '';
  if (!apiKey) throw new Error(`API key not configured...`);
  const provider = providers[settings.provider];
  if (!provider) throw new Error(`Unknown provider: ...`);
  // prediction: call provider.predict(text, apiKey, settings.model) instead of provider.translate()
  const result = await provider.predict(text, apiKey, settings.model);
  // prediction: no recordUsage() in Phase 5 (silent per D-10, no badge updates)
  return result;
}
```

---

### `src/providers/prompt.ts` — new `buildPredictionPrompt` function

**Analog:** `src/providers/prompt.ts` `buildSystemPrompt` (lines 8–17)

**Prompt builder pattern** (lines 8–17):
```typescript
// buildSystemPrompt — buildPredictionPrompt is a sibling export, same file:
export function buildSystemPrompt(config: TranslationConfig): string {
  const formalityInstruction = getFormalityInstruction(config.formality);
  return [
    `You are a translation engine. Translate the following text to ${config.targetLanguage}.`,
    `Output ONLY the translated text — no explanations, no quotes, no markdown.`,
    `Use natural, native-sounding phrasing that a native speaker would actually use.`,
    formalityInstruction,
    config.customPrompt || '',
  ].join('\n').trim();
}

// buildPredictionPrompt takes no config (LANG-02: no target-language param):
export function buildPredictionPrompt(): string {
  return [
    'You are an inline text completion engine.',
    'Continue the text with 2 to 3 words only.',
    'Match the exact language and register of the input.',
    'Output ONLY the continuation words — no explanation, no punctuation at the start, no quotes.',
    'If the text ends mid-word, complete that word as one of your words.',
  ].join('\n');
}
```

---

### `src/providers/openai.ts` — new `predict` method

**Analog:** `src/providers/openai.ts` `translate` method (lines 9–61)

**Full method pattern** (lines 9–61 — copy structure, replace prompt + params):
```typescript
// translate() call structure — predict() copies this exactly:
async translate(text: string, config: TranslationConfig, apiKey: string, model: string): Promise<TranslationResult> {
  const systemPrompt = buildSystemPrompt(config);  // prediction: buildPredictionPrompt() (no config)

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text },
          ],
          // prediction adds: max_tokens: 10, stop: ["\n", "。", "！", "？"]
          // omit temperature (gpt-5 models reject non-default — same as translate)
        }),
        signal: controller.signal,
      });
    } catch (err) {
      const c = classifyError('openai', err);
      const e = new Error(c.message);
      (e as any).kind = c.kind;
      throw e;
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const bodyMessage = (body as any)?.error?.message;
      const c = classifyError('openai', null, { status: response.status, bodyMessage });
      const e = new Error(c.message); (e as any).kind = c.kind; (e as any).status = c.status;
      throw e;
    }

    const data = await response.json();
    const usage = data.usage ? {
      inputTokens: data.usage.prompt_tokens ?? 0,
      outputTokens: data.usage.completion_tokens ?? 0,
    } : undefined;
    return { text: stripWrappers(data.choices[0]?.message?.content || ''), usage };
    // prediction: may skip stripWrappers since output should be bare words; decide in impl
  } finally {
    clearTimeout(timeout);
  }
}
```

---

### `src/providers/gemini.ts` — new `predict` method

**Analog:** `src/providers/gemini.ts` `translate` method (lines 9–65)

**Key Gemini-specific differences to preserve** (lines 18–36):
```typescript
// Gemini uses systemInstruction field (not messages[0].role='system'):
body: JSON.stringify({
  contents: [{ parts: [{ text }] }],
  systemInstruction: { parts: [{ text: systemPrompt }] },
  // prediction adds: generationConfig: { maxOutputTokens: 10, stopSequences: ["\n", "。", "！", "？"] }
}),

// Gemini response extraction (lines 56–61):
const data = await response.json();
const meta = data.usageMetadata;
const usage = meta ? {
  inputTokens: meta.promptTokenCount ?? 0,
  outputTokens: meta.candidatesTokenCount ?? 0,
} : undefined;
return { text: stripWrappers(data.candidates[0]?.content?.parts[0]?.text || ''), usage };
```

---

### `src/providers/openrouter.ts` — new `predict` method

**Analog:** `src/providers/openrouter.ts` `translate` method (lines 9–62)

**Key OpenRouter-specific differences to preserve** (lines 19–25):
```typescript
// OpenRouter uses OpenAI-compatible messages format + required attribution headers:
headers: {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${apiKey}`,
  'HTTP-Referer': 'https://github.com/benfoden/hime',  // required by OpenRouter ToS
  'X-Title': 'hime',
},
// prediction adds: max_tokens: 10, stop: ["\n", "。", "！", "？"] in body
```

---

### `src/types.ts` — new `PredictMessage` type + `MessageType` union extension

**Analog:** `src/types.ts` `TranslateMessage` interface (lines 70–77) + `MessageType` union (lines 52–63)

**Type extension pattern** (lines 52–77):
```typescript
// MessageType union — add 'predict' and 'predictResponse':
export type MessageType =
  | 'translate'
  | 'translateResponse'
  | 'setBadge'
  | 'getSettings'
  | 'settingsResponse'
  | 'swapDirection'
  | 'toggleCompose'
  | 'yoloTranslate'
  | 'directionSwapped'
  | 'getUsage'
  | 'resetUsage'
  | 'predict';           // ADD THIS

// TranslateMessage shape — PredictMessage follows this exactly:
export interface TranslateMessage extends Message {
  type: 'translate';
  payload: {
    text: string;
    targetElement?: string;
  };
}

// New — PredictMessage (same payload shape as TranslateMessage):
export interface PredictMessage extends Message {
  type: 'predict';
  payload: {
    text: string;
  };
}
```

Note: `TranslationProvider` interface (lines 40–43) must also gain a `predict` method signature:
```typescript
export interface TranslationProvider {
  name: string;
  translate(text: string, config: TranslationConfig, apiKey: string, model: string): Promise<TranslationResult>;
  predict(text: string, apiKey: string, model: string): Promise<TranslationResult>;  // ADD
}
```

---

### `test/unit.mjs` — new prediction state-machine + prompt tests

**Analog:** `test/unit.mjs` mock-fetch provider tests (lines 165–407) and logic-only tests (lines 414–479)

**Test framework pattern** (lines 1–16):
```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import compiled dist output — NOT src:
const { buildPredictionPrompt } = await import(path.join(__dirname, '../dist/providers/prompt.js'));
```

**Logic-only (no DOM) test pattern** (lines 414–479):
```javascript
// Tests that verify algorithmic behavior without DOM — use same pattern as lines 455-479:
test('isCaretAtEnd: selectionStart === value.length → true', () => {
  const value = 'hello';
  const selectionStart = value.length;
  const selectionEnd = value.length;
  assert.equal(selectionStart === selectionEnd && selectionStart === value.length, true);
});
```

**Mock-fetch test pattern** (lines 165–169):
```javascript
// withFetch helper used for all provider tests — reuse for predict() tests:
async function withFetch(mockFn, fn) {
  const orig = globalThis.fetch;
  globalThis.fetch = mockFn;
  try { return await fn(); } finally { globalThis.fetch = orig; }
}

// predict() test follows same shape as translate() tests (lines 172–247):
test('OpenAIProvider predict: success returns suggestion text', async () => {
  const provider = new OpenAIProvider();
  const result = await withFetch(
    async () => ({
      ok: true, status: 200,
      json: async () => ({
        choices: [{ message: { content: 'bright and sunny' } }],
        usage: { prompt_tokens: 8, completion_tokens: 3 },
      }),
    }),
    () => provider.predict('The weather is', 'key', 'gpt-5-mini')
  );
  assert.equal(result.text, 'bright and sunny');
});
```

---

## Shared Patterns

### Classic-script constraint (applies to all `content.ts` changes)

**Source:** `src/content.ts` line 1–5 comment
**Apply to:** Every new function added to `content.ts`

No `import` or `export` at top level. All new types must be declared inline with `type` or `interface` (not imported from `types.ts`). The local `type Message` at line 6 is the precedent.

```typescript
// The file's own local type — prediction uses this same Message for sendMessage calls:
type Message = { type: string; payload?: unknown };
```

### AbortController + timeout pattern (applies to all provider `predict` methods)

**Source:** `src/providers/openai.ts` lines 11–13, 58–60
**Apply to:** `predict` method in `openai.ts`, `gemini.ts`, `openrouter.ts`

```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10000);
try {
  // ... fetch with signal: controller.signal
} finally {
  clearTimeout(timeout);
}
```

### Error classification pattern (applies to all provider `predict` methods)

**Source:** `src/providers/openai.ts` lines 35–50
**Apply to:** `predict` method in all three providers

```typescript
// fetch error:
const c = classifyError('openai', err);
const e = new Error(c.message);
(e as any).kind = c.kind;
throw e;

// non-ok response:
const body = await response.json().catch(() => ({}));
const bodyMessage = (body as any)?.error?.message;
const c = classifyError('openai', null, { status: response.status, bodyMessage });
const e = new Error(c.message);
(e as any).kind = c.kind;
(e as any).status = c.status;
throw e;
```

### Suppression check before any prediction action (applies to all prediction trigger points in `content.ts`)

**Source:** `src/content.ts` lines 293–295 (`composeState.isActive` check) and lines 148–150 (`element.dataset.himeLoading`)
**Apply to:** `requestPrediction()` entry guard in `content.ts`

```typescript
// D-07 suppression (from CONTEXT.md, analogs are these two checks already in content.ts):
if (composeState.isActive) return;              // line 293 pattern
if (element.dataset.himeLoading) return;        // line 150 pattern (himeLoading dataset)
```

### `getSettings()` call in background handler

**Source:** `src/background.ts` lines 31–34, used at lines 103 and 119
**Apply to:** `predictText()` in `background.ts`

```typescript
async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(['himeSettings']);
  return migrateSettings(result.himeSettings || {});
}
// Called at start of every action function — predictText() follows this same pattern.
```

---

## No Analog Found

All files have direct analogs. No new directories or file types are introduced.

---

## Metadata

**Analog search scope:** `src/content.ts`, `src/background.ts`, `src/providers/openai.ts`, `src/providers/gemini.ts`, `src/providers/openrouter.ts`, `src/providers/prompt.ts`, `src/types.ts`, `test/unit.mjs`
**Files scanned:** 8
**Pattern extraction date:** 2026-05-30
