# Phase 10: Translation Pipeline - Research

**Researched:** 2026-06-10
**Domain:** Chrome MV3 service worker messaging, LLM JSON-mode, per-item batch fallback
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Two-message flow. Phase 8's `searchTranslated` stays unchanged (returns raw `SearchResult[]`). Phase 10 adds a new `translateBatch` message: page sends raw title/description pairs (keyed), worker returns keyed translations, page overlays and re-renders. Page owns the three visible stages (skeleton → raw → translated).
- **D-02:** Single batched call with a nested per-index keyed object `{"0":{"t":<title>,"d":<desc>}, "1":{…}}`. Only `title` and `description` are ever in the prompt — `url`, `hostname`, `faviconUrl` are never sent. Reuse existing `TranslationProvider.translate(text, …)` abstraction by passing keyed-JSON as the `text` payload and parsing the reply. No new provider method unless research shows the existing one can't carry JSON cleanly (planner's call).
- **D-03:** Per-item fallback. Assert each input key has a corresponding well-formed `{t,d}` reply. Missing keys, extra/unexpected keys, or malformed entries: only affected items fall back to raw. Whole-batch parse failure (non-JSON reply): every item degrades to raw. Never blank, never mismapped.
- **D-04:** Explicit `AbortController` timeout (~8s) on the `translateBatch` LLM call. On timeout or any translation error, worker returns an error and page keeps the already-rendered raw stage.
- **D-05:** Overlay re-uses Phase 9 renderer unchanged. Page merges translated `title`/`description` into a new `SearchResult[]` (raw `url`/`hostname`/`faviconUrl` carried verbatim) and re-calls `renderSerp({ kind: 'populated', results }, …)`.

### Claude's Discretion

- Exact prompt wording / system instruction, whether to request provider JSON mode, and how the keyed-JSON is escaped.
- Whether `translateBatch` lives as a new `MessageType` case mirroring the `translate` case, and the precise response interface name (follow established `{ data | error, kind }` convention).
- Batch size handling if result set ever exceeds a sane token budget (current `count: 10` makes this a non-issue now — note only).

### Deferred Ideas (OUT OF SCOPE)

- Query box / disclosure line / debounce / popup entry (SRCH-01/02/03 — Phase 11).
- The Brave fetch and `searchTranslated` contract (Phase 8, reused as-is).
- SERP DOM rendering (Phase 9, reused as-is).
- Per-result "show original" hover/toggle (post-milestone).
- Caching of recent searches/translations (post-milestone).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| XLT-02 | Result titles and snippets are translated in one batched LLM call using a keyed JSON object (`{"0": …, "1": …}`), reusing the existing OpenAI/Gemini/OpenRouter provider abstraction. | D-02 architecture confirmed viable with existing `translate(text, config, apiKey, model)` — pass keyed-JSON as `text`, parse reply. Prompt needs JSON-instruction addition. |
| XLT-03 | After batch translation returns, result count is asserted against input; on mismatch affected items fall back to raw (never blank, never mismapped). | Per-key validation function pattern detailed in Code Examples. Whole-batch non-JSON triggers full raw fallback. |
| XLT-04 | Only `title` and `description` fields are sent to the translation prompt — URLs/hostnames are never passed. | Build payload from `{ t: r.title, d: r.description }` only. `url`, `hostname`, `faviconUrl` excluded at construction time. |
| XLT-05 | Pipeline renders progressively (skeleton → raw Brave results → translated overlay) so a SW timeout or translation failure still leaves usable untranslated results. | Raw render happens synchronously before `translateBatch` is sent. `AbortController` 8s timeout + error-path returns keep raw stage intact. |

</phase_requirements>

---

## Summary

Phase 10 wires a single batched LLM call into the existing provider abstraction and adds
page-side orchestration for the three-stage progressive render. The central question
(D-02: can `translate(text, …)` carry keyed-JSON cleanly?) resolves to **yes**, but
requires a prompt adjustment: the current `buildSystemPrompt` instructs "output ONLY the
translated text" which will fight JSON output. The fix is a new `buildBatchTranslatePrompt`
(or an overloaded variant) that replaces the no-formatting instruction with a strict JSON
instruction. No changes to the provider classes themselves are needed — they already
accept arbitrary `text`, already pass `signal` internally via their own `AbortController`,
and already return `result.text` as a string the caller can `JSON.parse`.

The AbortController constraint (D-04, ~8s) cannot reuse the provider's internal timeout
because the provider classes create their own internal `AbortController` with a hardcoded
10s timeout. The solution is a **race** pattern: the worker creates its own
`AbortController` with an 8s timeout, passes `signal` to… but wait — `translate()` does
NOT accept a signal parameter today. The minimal threading approach is a `Promise.race`
between the `provider.translate(…)` call and an 8s `setTimeout` reject — no provider
code change needed.

The page-side orchestration in `search.ts` follows a clear two-call sequence: render
skeleton, send `searchTranslated`, render raw on response, fire `translateBatch`, merge
translations on response and re-render. The merge function is trivial: map over raw
results, substitute `t`/`d` for keys that validated, carry all other fields verbatim.

**Primary recommendation:** Add one new pure function module `src/translate-batch.ts`
containing (1) `buildBatchPayload(results)`, (2) `buildBatchPrompt(config)`, and
(3) `parseBatchReply(raw, inputKeys)` — tested entirely in the node harness. Wire the
`translateBatch` message handler in `background.ts` following the `translate` case exactly.
The page orchestration lives as a new helper in `search.ts` (or a co-located module).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Keyed-JSON prompt construction | Background SW | — | Provider call happens in worker; prompt built alongside it |
| LLM call with timeout | Background SW | — | All LLM calls go through the worker (XLT-01) |
| Per-key reply validation / fallback | Background SW | — | Validation before sending response; worker sends merged-or-raw result OR the caller (page) does the merge; see Open Questions |
| Progressive stage rendering | Page (search.ts) | — | Page owns the three visible stages (D-01) |
| Result merge (translated+raw fields) | Page (search.ts) | — | Page receives keyed translations, merges into SearchResult[], re-calls renderSerp (D-05) |
| XSS safety of translated text | Page (serp-render.ts) | — | textContent assignment in renderer (Phase 9 contract, unchanged) |

---

## Standard Stack

### Core (no new packages required)

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| Node `node:test` + linkedom | existing | Test harness against `dist/` | Established project convention; never SW console |
| TypeScript `tsc` | existing ~5.2 | Compile | Already the only build step |

No new npm packages are needed for this phase. All capabilities are implemented using
existing primitives (fetch, AbortController, JSON.parse, native Promise).

### Supporting

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `Promise.race` | AbortController-equivalent timeout without threading `signal` into providers | Wraps `provider.translate()` + a reject timer to implement D-04 without modifying provider classes |
| `output.ts#stripWrappers` | Strip markdown fences from LLM reply before `JSON.parse` | Already handles ```json fences; call before parsing the batch reply |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Promise.race` timeout | Pass `signal` to provider classes | Requires modifying all three providers + `TranslationProvider` interface — large diff, out of scope |
| New `buildBatchPrompt` function | Inline prompt string in background.ts | Inline can't be unit-tested; function in `translate-batch.ts` can be tested in the node harness |
| Page-side per-key validation | Worker-side per-key validation | Worker-side is cleaner separation (worker returns a `TranslateBatchResponse` with per-item results); both are viable — see Open Questions |

**Installation:** No new packages to install.

---

## Package Legitimacy Audit

> Not applicable — this phase installs no external packages.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
Page (search.ts)                  Background SW (background.ts)
     |                                      |
     |--- searchTranslated ---------------->|
     |                                      |--- BraveSearchClient.search()
     |                                      |<-- SearchResult[] (raw)
     |<-- { results, direct? } ------------|
     |                                      |
     | renderSerp({kind:'loading'})         |
     | renderSerp({kind:'populated',results})|   <- raw stage rendered here
     |                                      |
     |--- translateBatch { items: {…} } --->|
     |                            Promise.race(provider.translate(), 8s timeout)
     |                                      |--- provider.translate(keyedJSON, …)
     |                                      |<-- TranslationResult { text: jsonString }
     |                                      | parseBatchReply() → per-key validated map
     |<-- { translations: {…} } -----------|
     |                                      |
     | mergeTranslations(raw, translations) |
     | renderSerp({kind:'populated',        |
     |   results:merged})                   |   <- translated overlay
     |                                      |
     | [on timeout/error: keep raw stage]   |
```

### Recommended Project Structure

```
src/
├── translate-batch.ts     # Pure functions: buildBatchPayload, buildBatchPrompt, parseBatchReply
├── background.ts          # +case 'translateBatch' (wires translate-batch.ts + provider)
├── search.ts              # +3-stage orchestration (searchTranslated → raw → translateBatch)
└── types.ts               # +MessageType 'translateBatch', TranslateBatchMessage, TranslateBatchResponse
```

### Pattern 1: Message Handler Clone (`translateBatch` case in background.ts)

The `translate` case is the exact template. Key differences from `translate`:

- Input is typed `TranslateBatchMessage` with `payload: { items: Record<string, {t:string, d:string}>, config: TranslationConfig }` (or equivalent)
- Calls `provider.translate(JSON.stringify(items), batchConfig, apiKey, model)`
- Wraps the call in `Promise.race` with an 8s reject timer (not the provider's own 10s)
- Calls `parseBatchReply(result.text, inputKeys)` to validate per-key
- Returns `{ translations: Record<string, {t:string, d:string}> }` on success; `{ error, kind }` on failure

```typescript
// Source: [ASSUMED] — derived from existing background.ts case 'translate' pattern
case 'translateBatch': {
  const msg = message as TranslateBatchMessage;
  const s = await getSettings();
  const apiKey = s.apiKeys[s.provider] ?? '';
  if (!apiKey) {
    sendResponse({ error: `API key not configured for ${s.provider}`, kind: 'auth' });
    break;
  }
  const provider = providers[s.provider];
  if (!provider) {
    sendResponse({ error: `Unknown provider: ${s.provider}`, kind: 'unknown' });
    break;
  }
  const { items, config } = msg.payload;
  const inputKeys = Object.keys(items);
  const payloadText = JSON.stringify(items);
  const batchConfig: TranslationConfig = { ...config };

  try {
    const result = await Promise.race([
      provider.translate(payloadText, batchConfig, apiKey, s.model),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error('Translation timed out'), { name: 'AbortError' })), 8000)
      ),
    ]);
    if (result.usage) await recordUsage(s.model, result.usage);
    const translations = parseBatchReply(result.text, inputKeys);
    sendResponse({ translations });
  } catch (err) {
    const kind = (err as any)?.kind ?? 'unknown';
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    sendResponse({ error: errorMessage, kind });
  }
  break;
}
```

**`return true` at end of `onMessage`:** Already present globally (line 278 of background.ts: `return true; // Keep message channel open for async`). The outer `return true` covers ALL cases including `translateBatch` — no per-case change needed. [VERIFIED: codebase — background.ts line 278]

### Pattern 2: Prompt for Batch Translation

The current `buildSystemPrompt` instructs `"Output ONLY the translated text — no explanations, no quotes, no markdown."` This directly conflicts with returning a JSON object. A new `buildBatchTranslatePrompt(config)` function replaces steps 1-2:

```typescript
// Source: [ASSUMED] — derived from existing buildSystemPrompt pattern in prompt.ts
export function buildBatchTranslatePrompt(config: TranslationConfig): string {
  const formalityInstruction = getFormalityInstruction(config.formality);
  return [
    `You are a translation engine. Translate the following JSON object to ${config.targetLanguage}.`,
    `The input is a JSON object: {"0":{"t":"<title>","d":"<description>"}, "1":{...}, ...}`,
    `Return ONLY a valid JSON object with the same keys and shape — no explanation, no markdown, no code fences.`,
    `Translate the value of each "t" (title) and "d" (description) field.`,
    `Preserve the exact same keys. Do not add or remove keys.`,
    formalityInstruction,
    config.customPrompt || '',
  ].join('\n').trim();
}
```

**Why not use JSON mode / `response_format`?**

- **OpenAI** supports `response_format: { type: "json_object" }` for compatible models. gpt-5-mini and gpt-5-nano are likely to support it but are new enough that this isn't confirmed. [ASSUMED]
- **Gemini** supports `generationConfig.responseMimeType: "application/json"`. This is documented for Gemini 1.5+. [CITED: https://ai.google.dev/api/generate-content#v1beta.GenerationConfig]
- **OpenRouter** passes `response_format` through to the underlying model when the model supports it. [ASSUMED]

Recommendation: **do NOT use JSON mode** in this phase. Reasons:
1. The provider `translate()` interface takes no `response_format` param — adding it requires an interface change and provider edits in all three files.
2. `stripWrappers` + `JSON.parse` already handles the code-fence wrapper case reliably.
3. Prompt-level JSON instruction is sufficient for models of this quality tier.
4. JSON mode would be an optimization for Phase 10; add it only if test results show frequent parse failures.

### Pattern 3: `parseBatchReply` — Per-Key Validation (D-03)

This is the core robustness function. It must be a pure function so it can be unit-tested in the node harness.

```typescript
// Source: [ASSUMED] — derived from D-03 specification in 10-CONTEXT.md
export interface BatchItem { t: string; d: string; }
export type BatchTranslations = Record<string, BatchItem>;

/**
 * Parse the LLM reply for a batch translate call.
 *
 * Returns a map of key → {t, d} for every key that had a well-formed reply.
 * Missing, extra-only, or malformed entries are OMITTED (caller falls back to raw for those).
 * A non-JSON reply (throws JSON.parse) returns an empty map (caller falls back all items to raw).
 */
export function parseBatchReply(
  raw: string,
  inputKeys: string[],
): BatchTranslations {
  // Step 1: strip LLM wrappers (code fences, meta commentary) — reuse stripWrappers
  const cleaned = stripWrappers(raw);

  // Step 2: attempt JSON.parse — failure = whole-batch fallback (empty map)
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return {};
  }

  // Step 3: must be an object, not an array
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {};
  }

  // Step 4: per-key validation — only include keys from inputKeys with well-formed {t,d}
  const result: BatchTranslations = {};
  for (const key of inputKeys) {
    const entry = (parsed as Record<string, unknown>)[key];
    if (
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as any).t === 'string' &&
      typeof (entry as any).d === 'string'
    ) {
      result[key] = { t: (entry as any).t, d: (entry as any).d };
    }
    // else: key missing or malformed → omit → caller shows raw for this item
  }
  return result;
}
```

### Pattern 4: Page-Side Merge and Orchestration (`search.ts`)

The three-stage sequence for Phase 11 wiring (Phase 10 establishes the functions; Phase 11 wires the live calls):

```typescript
// Source: [ASSUMED] — derived from D-01 and D-05 specifications
async function runSearchPipeline(query: string, targetLanguage: string, sourceLanguage: string) {
  // Stage 1: skeleton
  renderSerp({ kind: 'loading' }, document, mount);

  // Stage 2: raw results from worker
  const searchResp: SearchTranslatedResponse = await sendMessage({ type: 'searchTranslated', payload: { query, sourceLanguage, targetLanguage } });
  if (searchResp.error || !searchResp.results?.length) {
    renderSerp(searchResp.error
      ? { kind: 'error', errorKind: searchResp.kind ?? 'unknown', message: searchResp.error }
      : { kind: 'empty' }, document, mount);
    return;
  }
  const rawResults = searchResp.results;
  renderSerp({ kind: 'populated', results: rawResults }, document, mount); // raw stage

  // Stage 3: translation overlay (failure leaves raw stage intact)
  const items = buildBatchPayload(rawResults); // {0:{t,d}, 1:{t,d}, …}
  const batchResp: TranslateBatchResponse = await sendMessage({ type: 'translateBatch', payload: { items, config: translationConfig } });
  if (batchResp.error || !batchResp.translations) return; // keep raw
  const merged = mergeTranslations(rawResults, batchResp.translations);
  renderSerp({ kind: 'populated', results: merged }, document, mount); // translated overlay
}

function mergeTranslations(raw: SearchResult[], translations: BatchTranslations): SearchResult[] {
  return raw.map((r, i) => {
    const t = translations[String(i)];
    return t ? { ...r, title: t.t, description: t.d } : r; // raw fallback for missing keys
  });
}
```

### Anti-Patterns to Avoid

- **Sending `url`/`hostname`/`faviconUrl` in the prompt payload** — violates XLT-04; construct `items` from `{t: r.title, d: r.description}` only.
- **Using `innerHTML` to render translated text** — Phase 9 renderer already uses `textContent`; the translated overlay goes through the same renderer path unchanged (D-05).
- **Mutating `rawResults` in place** — always create a new `SearchResult[]` in `mergeTranslations` so the raw stage reference stays clean.
- **Relying on the provider's internal 10s timeout** — provider timeout is 10s; D-04 requires 8s on the translation call specifically. Use `Promise.race` with a separate 8s timer.
- **Parsing JSON before stripping wrappers** — call `stripWrappers(raw)` first; several models wrap JSON in ` ```json ``` ` fences.
- **Swapping array index (number) for string key** — the keyed-JSON uses string keys `"0"`, `"1"`, etc.; always use `String(i)` when building and looking up.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LLM wrapper stripping | Custom regex | `output.ts#stripWrappers` | Already handles code fences, meta-commentary lines, quote pairs; tested |
| Error classification | Custom switch | `errors.ts#classifyError` | Handles AbortError → network, 401/403 → auth, 429 → rate_limit; already wired |
| Provider HTTP calls | New fetch wrappers | Existing `provider.translate(text, config, apiKey, model)` | Handles response parsing, error throwing, usage tracking |
| DOM rendering | New DOM builder | `serp-render.ts#renderSerp` | XSS-safe, tested, unchanged (D-05) |

**Key insight:** The entire translation batch path is a thin orchestration layer on top of existing primitives. The only new logic is: prompt construction, keyed-JSON serialization/deserialization, and per-key validation. Keep `translate-batch.ts` under ~100 lines.

---

## Common Pitfalls

### Pitfall 1: `buildSystemPrompt` "output ONLY translated text" fights JSON output

**What goes wrong:** Provider receives `{"0":{"t":"…","d":"…"}}` as user content, but the system prompt says "Output ONLY the translated text — no explanations, no quotes, no markdown." Some models obey the no-quotes instruction and return a plain string instead of JSON.

**Why it happens:** `buildSystemPrompt` was designed for single-string translation. The "no markdown" and "no quotes" lines conflict with valid JSON syntax.

**How to avoid:** Use a new `buildBatchTranslatePrompt` that explicitly instructs JSON output. Never reuse `buildSystemPrompt` for batch calls. [VERIFIED: codebase — prompt.ts lines 11-16 confirm the conflict]

**Warning signs:** `parseBatchReply` returns `{}` or partially empty results in testing.

### Pitfall 2: Provider's internal AbortController timeout fires before the 8s race

**What goes wrong:** Each provider creates its own `AbortController` with `setTimeout(..., 10000)` (10s). The D-04 target is 8s. The race resolves via the 8s timer first, which is correct. But if the race rejects with the synthetic error, the provider's internal fetch is still running with its own signal for up to 2 more seconds. This is a benign GC issue (no dangling request survives after the response channel closes), not a correctness issue.

**Why it happens:** `translate()` does not accept an external `signal` parameter.

**How to avoid:** Accept this behavior. The synthetic 8s reject carries `name: 'AbortError'` so `classifyError` maps it to `kind: 'network'`. The page receives `{ error, kind: 'network' }` and keeps the raw stage (D-04). [VERIFIED: codebase — errors.ts lines 26-34 confirm AbortError → network classification]

### Pitfall 3: LLM returns extra keys in the batch reply

**What goes wrong:** Model "helpfully" adds extra keys (e.g., key `"10"` when input had 0–9) or renames keys (e.g., `"item_0"` instead of `"0"`). Naively iterating the reply object instead of iterating `inputKeys` leads to mismapped or undefined entries.

**Why it happens:** Models sometimes paraphrase or add commentary keys.

**How to avoid:** In `parseBatchReply`, iterate `inputKeys` (the validated input set), not the parsed reply's keys. Extra keys in the reply are silently ignored. [VERIFIED: derived from D-03 specification]

### Pitfall 4: `JSON.parse` of partial/truncated reply

**What goes wrong:** A very slow model returns a truncated JSON object (hits max_tokens or connection drops mid-stream). `JSON.parse` throws. If the catch block is not carefully scoped, this can blank the page.

**Why it happens:** LLMs with small output budgets or max_tokens limits.

**How to avoid:** The whole-batch try/catch in `parseBatchReply` returns `{}` on any parse failure. The page checks `Object.keys(translations).length === 0` or simply treats any missing key as raw. Never blank. [VERIFIED: derived from D-03 specification]

### Pitfall 5: `return true` requirement for async `onMessage`

**What goes wrong:** Without `return true` at the end of the synchronous `onMessage` callback, the message channel closes before `sendResponse` is called asynchronously, and the page receives `undefined`.

**Why it happens:** Chrome's `onMessage` API closes the channel after the synchronous handler returns unless `return true` is explicitly returned.

**How to avoid:** Already handled globally in `background.ts` — the outer listener returns `true` unconditionally (line 278). The `translateBatch` case lives inside the same listener; no per-case change needed. [VERIFIED: codebase — background.ts line 278]

### Pitfall 6: SW termination on slow connections

**What goes wrong:** MV3 service workers can be terminated after ~30s of inactivity. The searchTranslated + translateBatch two-call sequence can reach 15–25s on slow connections (noted in STATE.md). If the SW terminates between the two calls, the `translateBatch` message is never handled.

**Why it happens:** Chrome MV3 SW lifecycle — no persistent background page.

**How to avoid:** Each message is its own independent request/response (D-01 rationale). If the SW terminates and restarts, `translateBatch` still succeeds — SW re-initialization is fast (< 100ms). Progressive render means raw results are already visible; translation failure is non-fatal. The 8s AbortController timeout (D-04) also caps the worst case. No `keepAlive` ping needed.

**Warning signs:** `translateBatch` response never arrives in testing with a slow/mocked network; check for SW restart in chrome://serviceworker-internals.

### Pitfall 7: `stripWrappers` step 3 (meta-commentary) incorrectly strips valid JSON

**What goes wrong:** `stripWrappers` step 3 looks for a line starting with "Translation:" and takes text after the colon. If a JSON value happens to start with "Translation:", the parser strips the key-value context.

**Why it happens:** `stripWrappers` was designed for plain-text translation responses.

**How to avoid:** In `parseBatchReply`, call `stripWrappers` for fence-stripping (step 2), then attempt `JSON.parse` on the result. If that fails, also attempt `JSON.parse` on the raw string directly (bypassing `stripWrappers`) — this handles the rare case where `stripWrappers` over-strips. A two-attempt parse order: `stripWrappers(raw)` first, then `raw.trim()` fallback. [ASSUMED — based on analysis of stripWrappers implementation in output.ts]

---

## Code Examples

### Building the batch payload

```typescript
// Source: [ASSUMED] — derived from D-02 and XLT-04 specifications
export function buildBatchPayload(results: SearchResult[]): Record<string, { t: string; d: string }> {
  const payload: Record<string, { t: string; d: string }> = {};
  for (let i = 0; i < results.length; i++) {
    // XLT-04: only title and description — never url, hostname, faviconUrl
    payload[String(i)] = { t: results[i].title, d: results[i].description };
  }
  return payload;
}
```

### Two-attempt JSON parse (tolerates strip-wrapper over-stripping)

```typescript
// Source: [ASSUMED] — derived from analysis of output.ts#stripWrappers
function tryParseJSON(raw: string): unknown {
  try { return JSON.parse(stripWrappers(raw)); } catch { /* fall through */ }
  try { return JSON.parse(raw.trim()); } catch { return null; }
}
```

### Message type additions to types.ts

```typescript
// Source: [ASSUMED] — follows established MessageType and Message conventions in types.ts
export type MessageType =
  | /* … existing … */
  | 'translateBatch';

export interface TranslateBatchMessage extends Message {
  type: 'translateBatch';
  payload: {
    items: Record<string, { t: string; d: string }>;
    config: TranslationConfig;
  };
}

// Worker → page reply for translateBatch.
// Success → { translations }; failure → { error, kind }
export interface TranslateBatchResponse {
  translations?: Record<string, { t: string; d: string }>;
  error?: string;
  kind?: import('./errors.js').ErrorKind;
}
```

---

## Runtime State Inventory

> Not applicable — this is a greenfield feature addition, not a rename/refactor/migration phase.

---

## Environment Availability

> This phase adds no new external dependencies. The manifest already declares
> `host_permissions` for all three LLM provider domains. The build system (`tsc` + `copy-assets`)
> requires no changes.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| TypeScript (tsc) | Build | Yes | ~5.2 | — |
| node --test | Test harness | Yes | Node 18+ | — |
| linkedom | Test DOM | Yes | ^0.18.12 | — |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert/strict` |
| Config file | none — tests run via `npm test` (tsc && node --test 'test/**/*.mjs') |
| Quick run command | `npm run build && node --test test/translation-batch.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| XLT-02 | `buildBatchPayload` produces correct keyed-JSON shape with only `t`/`d` fields | unit | `node --test test/translation-batch.mjs` | No — Wave 0 |
| XLT-02 | `buildBatchPrompt` produces a system prompt containing JSON instruction | unit | `node --test test/translation-batch.mjs` | No — Wave 0 |
| XLT-03 | `parseBatchReply` with complete valid reply returns all keys | unit | `node --test test/translation-batch.mjs` | No — Wave 0 |
| XLT-03 | `parseBatchReply` with missing key returns partial map (affected key absent) | unit | `node --test test/translation-batch.mjs` | No — Wave 0 |
| XLT-03 | `parseBatchReply` with non-JSON reply returns empty map (all-raw fallback) | unit | `node --test test/translation-batch.mjs` | No — Wave 0 |
| XLT-03 | `parseBatchReply` with malformed `{t}` (missing `d`) omits that key | unit | `node --test test/translation-batch.mjs` | No — Wave 0 |
| XLT-03 | `parseBatchReply` with extra keys in reply ignores them | unit | `node --test test/translation-batch.mjs` | No — Wave 0 |
| XLT-04 | `buildBatchPayload` never includes `url`, `hostname`, or `faviconUrl` in output | unit | `node --test test/translation-batch.mjs` | No — Wave 0 |
| XLT-04 | URL-never-sent: assert no SearchResult URL substring appears in the serialized payload | unit | `node --test test/translation-batch.mjs` | No — Wave 0 |
| XLT-05 | `mergeTranslations` with full translations produces correctly overlaid SearchResult[] | unit | `node --test test/translation-batch.mjs` | No — Wave 0 |
| XLT-05 | `mergeTranslations` with partial translations: translated items show translations, missing items show raw | unit | `node --test test/translation-batch.mjs` | No — Wave 0 |
| XLT-05 | `mergeTranslations` with empty translations: all items show raw | unit | `node --test test/translation-batch.mjs` | No — Wave 0 |
| XLT-05 (timeout-leaves-raw) | Worker returns `{ error, kind }` on timeout; page keeps raw — tested by asserting `mergeTranslations` is never called when response has `error` | integration/manual | visual QA with slow-network DevTools throttle | No |
| SERP-03 (XSS translated) | After `mergeTranslations` with XSS-containing translations, `renderSerp` renders no `<script>` node | unit (extend serp.mjs) | `node --test test/serp.mjs` | No — extend existing |

### Sampling Rate

- **Per task commit:** `npm run build && node --test test/translation-batch.mjs`
- **Per wave merge:** `npm test` (full suite including unit.mjs, serp.mjs, translation-batch.mjs)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `test/translation-batch.mjs` — covers XLT-02, XLT-03, XLT-04, XLT-05 unit cases (12 tests above)
- [ ] Extend `test/serp.mjs` with one XSS-translated-text test (import merged results through renderSerp)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | No | — |
| V5 Input Validation | Yes | `parseBatchReply` validates structure before accepting; URLs excluded from prompt (XLT-04) |
| V6 Cryptography | No | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| URL/hostname leakage via prompt | Information Disclosure | `buildBatchPayload` excludes `url`/`hostname`/`faviconUrl` at construction time; `URL-never-sent` test asserts this |
| Prompt injection via result title/description | Tampering | LLM response goes through `parseBatchReply` structural validation; injected instructions cannot alter `url`/`hostname` which are carried verbatim from the original `SearchResult`; translated text rendered via `textContent` (SERP-03) |
| XSS via LLM-translated text | Tampering | Phase 9 renderer always uses `textContent` — translated text arrives in `title`/`description` fields of `SearchResult` and follows the same XSS-safe render path; no new risk |
| API key exposure | Information Disclosure | `translateBatch` payload contains `items` and `config` only — no API key ever in the message (XLT-01 / existing architecture) |

---

## Open Questions

1. **Where does per-key validation live — worker side or page side?**
   - What we know: D-01 says "worker returns keyed translations, page overlays." D-03 says "per-item fallback." This is ambiguous about whether the worker delivers a fully validated map (omitting bad keys) or delivers the raw JSON string and the page validates.
   - What's unclear: If the worker validates, `TranslateBatchResponse.translations` only contains confirmed `{t,d}` pairs; the page's `mergeTranslations` simply uses `translations[String(i)] ?? raw`. If the page validates, the worker response carries the raw text and the page calls `parseBatchReply`.
   - Recommendation: **Worker-side validation** (worker calls `parseBatchReply`, returns `{ translations: Record<string, {t,d}> }`). This keeps the page orchestration simple and keeps test-surface entirely in the node harness (no browser environment needed for validation logic). The page only does the merge.

2. **Should `buildBatchPrompt` live in `providers/prompt.ts` or in a new `translate-batch.ts`?**
   - What we know: `prompt.ts` currently holds `buildSystemPrompt` and `buildPredictionPrompt`. Adding `buildBatchTranslatePrompt` there is consistent.
   - What's unclear: `translate-batch.ts` would colocate payload building, prompt building, and reply parsing — all the batch-specific logic. The node harness only needs to import one module.
   - Recommendation: New `src/translate-batch.ts` for all batch-specific pure functions (`buildBatchPayload`, `buildBatchTranslatePrompt`, `parseBatchReply`, `mergeTranslations`). Import from `background.ts` and `search.ts`. `prompt.ts` stays untouched.

3. **Does `config.customPrompt` get appended in `buildBatchTranslatePrompt`?**
   - What we know: `buildSystemPrompt` appends `config.customPrompt` if set. The batch prompt instructs strict JSON output. A custom prompt saying "be verbose and explain your choices" would break JSON parsing.
   - Recommendation: Append `config.customPrompt` but add a note to the prompt: "Your response must still be valid JSON." Or, for safety, omit `customPrompt` from the batch path (it was designed for single-string translation register hints, not batch JSON).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | gpt-5-mini and gpt-5-nano support `response_format: { type: "json_object" }` | Standard Stack / Architecture Patterns | Low — recommendation is to NOT use JSON mode; prompt-level instruction used instead |
| A2 | OpenRouter passes `response_format` through to underlying model | Standard Stack | Low — not using JSON mode in this phase |
| A3 | Two-attempt JSON parse order (`stripWrappers` first, raw fallback) handles all `stripWrappers` over-strip cases | Common Pitfalls / Code Examples | Medium — if there are edge cases neither attempt parses, `parseBatchReply` returns `{}` (all-raw fallback), which is still safe |
| A4 | SW termination between the two messages is non-fatal because each message restarts the SW | Common Pitfalls | Low — confirmed by MV3 architecture; SW restart < 100ms |
| A5 | `getFormalityInstruction` can be imported/reused from `prompt.ts` in `translate-batch.ts` | Architecture Patterns | Low — it's a module-private function today; would need to be exported or duplicated |

**If this table is empty:** All claims in this research were verified or cited — not the case here; 5 assumptions documented above.

---

## Sources

### Primary (HIGH confidence)

- `src/background.ts` — `translate` case pattern, `return true` behavior, `recordUsage` wiring [VERIFIED: codebase]
- `src/providers/openai.ts`, `gemini.ts`, `openrouter.ts` — `translate()` signature, internal AbortController at 10s, `stripWrappers` call, no external signal param [VERIFIED: codebase]
- `src/providers/prompt.ts` — `buildSystemPrompt` "Output ONLY translated text" conflict with JSON [VERIFIED: codebase]
- `src/errors.ts` — AbortError → network, 429 → rate_limit classification [VERIFIED: codebase]
- `src/output.ts` — `stripWrappers` steps (fence, meta-commentary, quote pairs) [VERIFIED: codebase]
- `src/serp-render.ts` — `renderSerp` signature, textContent-only rendering, no change needed (D-05) [VERIFIED: codebase]
- `src/types.ts` — `TranslationProvider.translate` signature, `MessageType`, `SearchResult`, `TranslationConfig` [VERIFIED: codebase]
- `test/serp.mjs` — node harness pattern for linkedom-based testing [VERIFIED: codebase]
- `manifest.json` — existing host_permissions cover all three LLM providers; no manifest change needed [VERIFIED: codebase]

### Secondary (MEDIUM confidence)

- Gemini `responseMimeType: "application/json"` — documented for Gemini 1.5+ at https://ai.google.dev/api/generate-content#v1beta.GenerationConfig [CITED]

### Tertiary (LOW confidence / ASSUMED)

- gpt-5-mini/gpt-5-nano `response_format` JSON mode support — assumed from GPT-4o Mini precedent; not verified for these specific model IDs [ASSUMED]
- `stripWrappers` over-strip edge case with JSON values — derived from code analysis, not empirically tested [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all primitives are verified in codebase; no new packages
- Architecture: HIGH — all patterns derived from existing verified code; locked decisions fully specified
- Pitfalls: HIGH for code-verified items; MEDIUM for assumed behavioral edge cases
- Validation Architecture: HIGH — follows established node harness pattern exactly

**Research date:** 2026-06-10
**Valid until:** 2026-07-10 (stable domain; provider API changes are the only drift risk)
