# Phase 10: Translation Pipeline - Pattern Map

**Mapped:** 2026-06-10
**Files analyzed:** 4 (2 new, 2 modified)
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/translate-batch.ts` | utility (pure functions) | transform | `src/providers/prompt.ts` + `src/output.ts` | role-match |
| `src/background.ts` | service worker handler | request-response | `src/background.ts` `case 'searchTranslated'` (lines 167–214) | exact |
| `src/types.ts` | model/types | — | `src/types.ts` `SearchTranslatedMessage` / `SearchTranslatedResponse` (lines 106–122) | exact |
| `test/translation-batch.mjs` | test harness | — | `test/serp.mjs` | exact |

---

## Pattern Assignments

### `src/translate-batch.ts` (utility, transform)

**Analogs:** `src/providers/prompt.ts` (prompt construction pattern), `src/output.ts` (stripWrappers), `src/errors.ts` (ErrorKind import)

**Imports pattern** — copy from `src/providers/prompt.ts` lines 1–2, adapt:
```typescript
// src/providers/prompt.ts lines 1-2
import type { TranslationConfig } from '../types.js';
```
New file sits at `src/translate-batch.ts` (same level), so the import path is `'./types.js'`. Also import `stripWrappers` from `'./output.js'` and `SearchResult` from `'./types.js'`.

**Prompt builder pattern** — copy from `src/providers/prompt.ts` lines 8–17 (`buildSystemPrompt`):
```typescript
// src/providers/prompt.ts lines 8-17
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
```
`buildBatchTranslatePrompt` uses the SAME array-join pattern and SAME `getFormalityInstruction` call shape, but replaces the "Output ONLY translated text" line with a JSON instruction. `getFormalityInstruction` is module-private in `prompt.ts` — either export it or duplicate the switch in `translate-batch.ts`.

**stripWrappers usage pattern** — copy from `src/output.ts` lines 15–66 (see usage shape: call `stripWrappers(raw)` on the raw LLM string before `JSON.parse`). The function is already exported.

**Error kind import** — copy from `src/types.ts` line 2:
```typescript
// src/types.ts line 2
export type { ErrorKind, ClassifiedError } from './errors.js';
```
In `translate-batch.ts`, import directly: `import type { ErrorKind } from './errors.js';`

---

### `src/background.ts` — new `translateBatch` case (handler, request-response)

**Analog:** `src/background.ts` `case 'searchTranslated'` (lines 167–214) and `case 'translate'` (lines 138–153)

**Handler structure pattern** — exact shape to clone from lines 138–153:
```typescript
// src/background.ts lines 138-153
case 'translate': {
  const translateMsg = message as TranslateMessage;
  const s = await getSettings();
  console.log('[hime] translate request', { provider: s.provider, model: s.model, length: translateMsg.payload.text.length });
  try {
    const result = await translateText(translateMsg.payload.text);
    sendResponse({ translatedText: result.text });
  } catch (err) {
    const kind = (err as any)?.kind ?? 'unknown';
    const status = (err as any)?.status;
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[hime] translate failed', { provider: s.provider, model: s.model, status, kind, message: errorMessage });
    sendResponse({ error: errorMessage, kind });
  }
  break;
}
```

**Provider + apiKey resolution pattern** — exact shape from `translateText()` lines 78–109:
```typescript
// src/background.ts lines 80-89
const settings = await getSettings();
const apiKey = settings.apiKeys[settings.provider] || '';
if (!apiKey) {
  throw new Error(`API key not configured for ${settings.provider}. Please set it in the extension options.`);
}
const provider = providers[settings.provider];
if (!provider) {
  throw new Error(`Unknown provider: ${settings.provider}`);
}
```
The `translateBatch` case inlines this same guard pattern (as `searchTranslated` does at lines 170–177) so the check is explicit in the case body — not hidden behind a helper.

**`searchTranslated` error response pattern** — copy lines 191–196 and 205–209:
```typescript
// src/background.ts lines 191-196 (dedup reuse path error shape)
const kind = (err as { kind?: string })?.kind ?? 'unknown';
const errorMessage = err instanceof Error ? err.message : 'Unknown error';
sendResponse({ error: errorMessage, kind });
```

**`recordUsage` wiring pattern** — copy from `translateText()` lines 104–107:
```typescript
// src/background.ts lines 104-107
const result = await provider.translate(text, config, apiKey, settings.model);
if (result.usage) {
  await recordUsage(settings.model, result.usage);
}
```

**`return true` — already present** at line 278; no per-case change needed:
```typescript
// src/background.ts line 278
return true; // Keep message channel open for async
```

**Import additions** needed at top of file (lines 1–17): add `TranslateBatchMessage` to the existing named import block from `'./types.js'`. Add import of `buildBatchPayload`, `buildBatchTranslatePrompt`, `parseBatchReply` from `'./translate-batch.js'`.

---

### `src/types.ts` — new `MessageType` member + interfaces (model, types)

**Analog:** `src/types.ts` `SearchTranslatedMessage` + `SearchTranslatedResponse` (lines 106–122), and `MessageType` union (lines 57–71)

**MessageType extension pattern** — copy lines 57–71, add `'translateBatch'` member:
```typescript
// src/types.ts lines 57-71
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
  | 'predict'
  | 'searchTranslated'
  | 'testBraveKey';
  // Add: | 'translateBatch'
```

**Message interface pattern** — copy `SearchTranslatedMessage` (lines 106–113) as the exact structural template:
```typescript
// src/types.ts lines 106-113
export interface SearchTranslatedMessage extends Message {
  type: 'searchTranslated';
  payload: {
    query: string;
    sourceLanguage: string;
    targetLanguage: string;
  };
}
```
`TranslateBatchMessage` follows the same `extends Message` + `payload` shape.

**Response interface pattern** — copy `SearchTranslatedResponse` (lines 115–122) as the exact structural template:
```typescript
// src/types.ts lines 115-122
// Worker → page reply for a searchTranslated request.
// Success → { results, direct? }; failure → { error, kind } (D-02).
export interface SearchTranslatedResponse {
  results?: SearchResult[];
  direct?: boolean;
  error?: string;
  kind?: import('./errors.js').ErrorKind;
}
```
`TranslateBatchResponse` uses the same discriminant convention: success has `translations?`, failure has `error?` + `kind?`. The `kind` import path is identical.

---

### `test/translation-batch.mjs` (test harness, unit)

**Analog:** `test/serp.mjs` (entire file, lines 1–208)

**File header + imports pattern** — copy lines 1–20 verbatim, replacing the module path:
```javascript
// test/serp.mjs lines 1-20
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseHTML } from 'linkedom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { renderSerp } = await import(path.join(__dirname, '../dist/serp-render.js'));
const { MOCKS, XSS_PROBE } = await import(path.join(__dirname, '../dist/search-mock.js'));
```
`translation-batch.mjs` imports from `'../dist/translate-batch.js'` instead. No linkedom needed (pure function tests — no DOM).

**Test block pattern** — copy the `test('SERP-01a: …', () => { … })` structure (lines 36–59). Each test in `translation-batch.mjs` is a named `test('XLT-0X: …', () => { … })` block using `assert.equal` / `assert.ok` / `assert.deepEqual`. No async needed for pure function tests.

**Assertion style** — copy from lines 38–58: use `assert.equal(actual, expected, message)` for scalar comparisons; `assert.ok(condition, message)` for boolean checks. For object shape checks, use `assert.deepEqual`.

---

## Shared Patterns

### `{ error, kind }` response discriminant
**Source:** `src/types.ts` lines 115–122 (`SearchTranslatedResponse`), `src/background.ts` lines 174–176
**Apply to:** `TranslateBatchResponse` interface, `translateBatch` case error path
```typescript
// Success: presence of data field (translations / results)
// Failure: presence of error string + kind discriminant
error?: string;
kind?: import('./errors.js').ErrorKind;
```

### Error classification + kind extraction
**Source:** `src/background.ts` lines 145–151, `src/errors.ts` lines 19–73
**Apply to:** `translateBatch` case catch block
```typescript
// src/background.ts lines 145-151
const kind = (err as any)?.kind ?? 'unknown';
const status = (err as any)?.status;
const errorMessage = err instanceof Error ? err.message : 'Unknown error';
sendResponse({ error: errorMessage, kind });
```

### `Promise.race` timeout (no analog in codebase — new pattern)
**Source:** None in codebase. Provider internal timeout is at `src/providers/openai.ts` (10s AbortController). D-04 requires 8s.
**Apply to:** `translateBatch` case only
Pattern: `Promise.race([provider.translate(…), new Promise<never>((_, reject) => setTimeout(() => reject(Object.assign(new Error('Translation timed out'), { name: 'AbortError' })), 8000))])`

### `stripWrappers` before JSON.parse
**Source:** `src/output.ts` lines 15–66 (`stripWrappers`)
**Apply to:** `parseBatchReply` in `src/translate-batch.ts`
```typescript
// Two-attempt parse: stripWrappers first, raw fallback
try { parsed = JSON.parse(stripWrappers(raw)); } catch { /* fall through */ }
if (parsed === undefined) {
  try { parsed = JSON.parse(raw.trim()); } catch { return {}; }
}
```

### Module file header (no Chrome API)
**Source:** `src/providers/prompt.ts` line 1, `src/output.ts` line 1, `src/errors.ts` line 1
**Apply to:** `src/translate-batch.ts` — pure functions, no Chrome API imports, no `chrome.*` references
```typescript
// src/providers/prompt.ts line 1
// Shared prompt builder for hime translation providers — no Chrome API imports.
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `Promise.race` timeout in `translateBatch` | pattern | — | No existing capped-timeout LLM call in codebase; providers use their own internal 10s AbortController that cannot be overridden without interface changes |

---

## Metadata

**Analog search scope:** `src/`, `test/`
**Files scanned:** `src/background.ts`, `src/types.ts`, `src/providers/prompt.ts`, `src/output.ts`, `src/errors.ts`, `test/serp.mjs`
**Pattern extraction date:** 2026-06-10
