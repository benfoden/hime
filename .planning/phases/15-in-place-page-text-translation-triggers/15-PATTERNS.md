# Phase 15: In-Place Page-Text Translation + Triggers - Pattern Map

**Mapped:** 2026-06-21
**Files analyzed:** 8 (3 new, 5 modified/reused)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/page-walk.ts` (NEW) | utility (pure module) | transform / batch | `src/translate-batch.ts` + `src/progressive-guard.ts` | exact (pure-module doctrine) |
| `test/page-walk.mjs` (NEW) | test | transform | `test/translation-batch.mjs` | exact |
| `src/content.ts` (MOD) | content-script (in-page UI + live DOM walk + apply/toggle) | event-driven + request-response | self (existing `prog*` indicator/badge/gate body) | exact (same file) |
| `src/background.ts` (MOD) | worker (context menu + batch message case) | request-response | self (`translateBatch` case L664; `ensureContextMenus` L990) | exact (same file) |
| `src/popup.ts` (MOD) | popup gesture surface | request-response | self (`openImagePanel` L47) | exact (same file) |
| `src/popup.html` (MOD) | config/markup | — | existing `openImagePanel`/`openSearch` buttons | role-match |
| `src/types.ts` (MOD) | model (message contracts) | — | `TranslateBatchMessage`/`TranslateBatchResponse` L325-339; `STORAGE_PROGRESSIVE_ACK` L323 | exact |
| `src/translate-batch.ts` (REUSE/template) | utility | transform | self (template for page-batch variant) | exact |

**Classic-script law (load-bearing):** `content.ts` is a classic content script and **cannot `import`** the pure module. Pure logic in `page-walk.ts` is the canonical, node-tested copy; the needed predicates must be **duplicated verbatim** into `content.ts` with a "MUST stay in sync" comment — exactly as `progShouldGateByLanguage`/`progNormalizeToBase` are mirrored from `progressive-guard.ts` (see content.ts:949-980).

---

## Pattern Assignments

### `src/page-walk.ts` (NEW — pure utility, transform)

**Analog:** `src/translate-batch.ts` (header/export style, key-injection-guarded parse) + `src/progressive-guard.ts` (`createConcurrencyGate`, constants block).

**Header + no-Chrome-import convention** (translate-batch.ts:1-7):
```typescript
// Batch translation pipeline for hime — no Chrome API imports.
import type { TranslationConfig, SearchResult } from './types.js';
export type BatchItem = { t: string; d: string };
export type BatchTranslations = Record<string, BatchItem>;
```
→ `page-walk.ts` opens the same way: type-only imports from `./types.js`, **no `chrome.*`, no live `document`** in the pure parts (DOM types only where unavoidable). New exports: `PageBatch = Record<string,string>`, `buildPageBatchPrompt(config)`, `parsePageBatchReply(raw, inputKeys)`, `chunkByBudget(texts, maxChars)`, `collectTextNodesRecursive(...)` (test-only variant), `isTranslatableTag`/skip-set predicate.

**Key-injection-guarded parse to CLONE** (translate-batch.ts:48-92) — this is the security-critical analog for `parsePageBatchReply`:
```typescript
export function parseBatchReply(raw: string, inputKeys: string[]): BatchTranslations {
  let parsed: unknown;
  try { parsed = JSON.parse(stripWrappers(raw)); } catch { /* fall through */ }
  if (parsed === undefined) { try { parsed = JSON.parse(raw.trim()); } catch { return {}; } }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const obj = parsed as Record<string, unknown>;
  const result: BatchTranslations = {};
  for (const key of inputKeys) {                    // iterate inputKeys ONLY (XLT-03)
    const entry = obj[key];
    if (entry !== null && typeof entry === 'object' ...) { result[key] = ...; }
  }
  return result;
}
```
→ `parsePageBatchReply` keeps the two-attempt parse + `stripWrappers` + non-array guard, but iterates `inputKeys` and accepts only `typeof entry === 'string'` (plain key→string, no `{t,d}`).

**Prompt-builder template** (translate-batch.ts:28-37) — `buildBatchTranslatePrompt`: array-of-lines `.join('\n').trim()`, "Return ONLY a valid JSON object with the same keys", `getFormalityInstruction(config.formality)`. → `buildPageBatchPrompt` mirrors this for a flat `{"0":"text",...}` shape.

**Concurrency cap to reuse** (progressive-guard.ts:110-125): `createConcurrencyGate(cap)` with `tryAcquire()/release()/inFlight`. Use this (default 2) to cap simultaneous `translatePageBatch` chunk calls. Constants block convention: named const + tune-comment (progressive-guard.ts).

---

### `test/page-walk.mjs` (NEW — test)

**Analog:** `test/translation-batch.mjs` (lines 1-30) — exact structural template.

```javascript
/** node:test harness ... verify against dist/, NEVER the service-worker console. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { parsePageBatchReply, chunkByBudget, collectTextNodesRecursive } =
  await import(path.join(__dirname, '../dist/page-walk.js'));
```
→ Import from **`dist/`** (project law, per MEMORY.md: no SW-console tests). Use `linkedom` for the DOM walk (recursive variant — linkedom's `createTreeWalker` + `acceptNode` returns nothing; verified in RESEARCH). Cover: skip-set, visibility, chunk sizes, key stability, restore round-trip (pure map, not WeakMap), failed-node retry set.

---

### `src/content.ts` (MOD — content-script: live walk, in-page UI, apply/toggle)

**Analog:** self — the existing `prog*` family.

**Mirrored-gate duplication law** (content.ts:949-980) — the precedent for copying pure logic into the classic script:
```typescript
// --- Mirrored shouldGateByLanguage from progressive-guard.ts (D-05) ---
// Classic-script law: content.ts cannot import progressive-guard.ts, so the
// logic is mirrored verbatim here.  Keep both in sync.
function progShouldGateByLanguage(pageLang: string, targetLang: string): boolean { ... }
```
→ Reuse `progShouldGateByLanguage` **as-is** for the auto-offer banner gate (TRIG-02). Duplicate the `page-walk.ts` walk predicates the same way, with a matching "MUST stay in sync" comment.

**In-page fixed UI element** (content.ts:1077-1097, `progCreateIndicator`) — the template for the floating **pill**, **banner**, and **toast**:
```typescript
function progCreateIndicator(): void {
  if (document.getElementById(HIME_PROG_INDICATOR_ID)) return; // idempotent by id
  const el = document.createElement('div');
  el.id = HIME_PROG_INDICATOR_ID;
  el.style.cssText = ['position: fixed','bottom: 8px','right: 8px',
    'z-index: 2147483646','white-space: nowrap', ...].join(';');
  el.textContent = 'hime: progressive ON'; // textContent — NEVER innerHTML (T-13-06)
  document.body.appendChild(el);
}
```
→ Pill: `position:fixed` corner, idempotent-by-id, `textContent`-only, z-index `2147483646`. Banner: same conventions at `top:0` full-width slim. Toast: same, with a `<button>` child for "Retry failed sections" (use `addEventListener('click', ...)`, mirroring the badge-click at content.ts:1139). **Never `innerHTML`** (anti-XSS law T-13-06).

**Clickable in-page control → message dispatch** (content.ts:1139-1147): badge `addEventListener('click', () => chrome.runtime.sendMessage({type, payload}))`. → Pill click flips state locally + writes mirror to `chrome.storage.session`; banner "Translate" runs the same path as the `translatePage` message.

**onMessage extension pattern** (content.ts:1389-1415): add a top-level `chrome.runtime.onMessage.addListener` branch for `translatePage` / `togglePage` (from worker/popup). Follow the existing `if (message.type === ...) { ...; sendResponse(...); return false; }` shape; `return false` for synchronous handlers (async work that needs the channel open returns `true`).

**Boot gate read** (content.ts:1419-1432): `chrome.storage.local.get(['himeSettings'], (result) => {...})` reading `document.documentElement.lang` and `s.targetLanguage`, then `progShouldGateByLanguage(...)`. → Auto-offer boot mirrors this exactly, adding the `chrome.storage.session.get('himeBannerDismissed')` per-origin check before `showOfferBanner(origin)`.

**Badge ERR signalling** (content.ts:515-535): `setBadge(text,color)` sends `{type:'setBadge'}` to worker; `badgeForKind(kind)` maps `auth→KEY`, default→`{text:'ERR',color:'#FF0000'}`. → D-04 partial-failure: red badge via `setBadge(...badgeForKind(kind))`.

**Worker-call promise wrapper** (content.ts:538-558, `translateText`): `new Promise` around `chrome.runtime.sendMessage`, checking `chrome.runtime.lastError`, then `response.error` (attach `.kind`), else resolve. → The per-chunk `translatePageBatch` call wraps the same way; `lastError` guard also covers Pitfall 4 (content-script-less tab).

---

### `src/background.ts` (MOD — worker: message case + context menu)

**Analog:** self — `translateBatch` case (L664-711) and `ensureContextMenus` (L990-1011) / `onClicked` (L1046-1065).

**Worker batch-message handler to CLONE** (background.ts:664-711) — verbatim shape for `translatePageBatch`:
```typescript
case 'translateBatch': {
  const { items, config } = (message as TranslateBatchMessage).payload;
  const s = await getSettings();
  const apiKey = s.apiKeys[s.provider] || '';        // BYOK from storage — NEVER page
  if (!apiKey) { sendResponse({ error: `API key not configured for ${s.provider}`, kind: 'auth' }); break; }
  const provider = providers[s.provider];
  if (!provider) { sendResponse({ error: `Unknown provider: ${s.provider}`, kind: 'unknown' }); break; }
  const inputKeys = Object.keys(items);
  const userContent = `${buildBatchTranslatePrompt(config)}\n\n${JSON.stringify(items)}`;
  try {
    const result = await Promise.race([
      provider.translate(userContent, config, apiKey, s.model),
      new Promise<never>((_, reject) => setTimeout(
        () => reject(Object.assign(new Error('Translation timed out'), { name: 'AbortError' })), 8000)),
    ]);
    if (result.usage) await recordUsage(s.model, result.usage);
    sendResponse({ translations: parseBatchReply(result.text, inputKeys) });
  } catch (err) {
    const kind = (err as { kind?: string })?.kind ?? classifyError(s.provider, err).kind;
    sendResponse({ error: err instanceof Error ? err.message : 'Unknown error', kind });
  }
  break;
}
```
→ `translatePageBatch`: identical key-from-storage law, no-key→`{kind:'auth'}`, 8s `Promise.race` AbortError, `recordUsage`, but `buildPageBatchPrompt`/`parsePageBatchReply` and plain-string `items`.

**Context-menu registration to EXTEND** (background.ts:990-1011, `ensureContextMenus`):
```typescript
function ensureContextMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'hime-translate-image', title: 'Translate image with hime', contexts: ['image'] });
    // FLATTEN: contexts deliberately EXCLUDE 'image' so the two hime items never
    // appear in the same menu at once. Chrome auto-nests when 2+ are visible.
    chrome.contextMenus.create({ id: 'hime-open-panel', title: 'Open hime image panel',
      contexts: ['page','selection','link','editable','video','audio','frame'] });
  });
}
ensureContextMenus();                                  // top-level, every worker load (durable fix)
chrome.runtime.onStartup.addListener(ensureContextMenus);
```
→ Add a third item `hime-translate-page`. **FLATTEN invariant is load-bearing** (background.ts:1000): a third overlapping-context item re-triggers Chrome's submenu nesting. Planner must decide submenu-vs-context-partition (RESEARCH A6). Register inside the same `removeAll` callback; keep top-level registration.

**onClicked dispatch** (background.ts:1046-1065): `chrome.contextMenus.onClicked.addListener((info, tab) => { if (!tab?.id) return; if (info.menuItemId === '...') {...; return;} })`. → Add `if (info.menuItemId === 'hime-translate-page') { chrome.tabs.sendMessage(tab.id, { type: 'translatePage' }); return; }`. (No `sidePanel.open` gesture-first concern here — that constraint is image-specific.)

---

### `src/popup.ts` + `src/popup.html` (MOD — popup gesture)

**Analog:** self — `openImagePanel` (popup.ts:47-57) and the DOMContentLoaded wiring (60-74).

```typescript
async function openImagePanel(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) { await chrome.sidePanel.open({ tabId: tab.id }); window.close(); }
  } catch (error) { console.error('Failed to open image panel:', error); }
}
```
→ `translatePageAction`: `chrome.tabs.query({active,currentWindow})` → read `chrome.storage.session.himePage` state mirror → send `translatePage` (first time) or `togglePage` (already translated) via `chrome.tabs.sendMessage(tab.id, ...)`, wrapped in try/catch (Pitfall 4: restricted tabs reject). State mirror sets the button label in `loadSettings()` (popup.ts:12-21) — "Translate page" / "Show original" / "Show translation".

**popup.html:** add `<button id="translatePage">` alongside the existing `openSearch`/`openImagePanel` buttons; wire `addEventListener('click', translatePageAction)` in the DOMContentLoaded block (popup.ts:60-73).

---

### `src/types.ts` (MOD — message contracts)

**Analog:** `MessageType` union (L135-157), `TranslateBatchMessage`/`TranslateBatchResponse` (L325-339), `STORAGE_PROGRESSIVE_ACK` const (L323).

```typescript
export interface TranslateBatchMessage extends Message {
  type: 'translateBatch';
  payload: { items: Record<string, { t: string; d: string }>; config: TranslationConfig; };
}
export interface TranslateBatchResponse {
  translations?: Record<string, { t: string; d: string }>;
  error?: string;
  kind?: import('./errors.js').ErrorKind;
}
```
→ Add to `MessageType`: `'translatePage'`, `'togglePage'`, `'translatePageBatch'`. Add interfaces `TranslatePageBatchMessage` (`payload: { items: Record<string,string>; config: TranslationConfig }`) and `TranslatePageBatchResponse` (`translations?: Record<string,string>; error?; kind?`). Add session-storage key consts mirroring `STORAGE_PROGRESSIVE_ACK` style: `STORAGE_BANNER_DISMISSED` and `STORAGE_PAGE_STATE` (both `chrome.storage.session`, ephemeral by design — document the lifetime in the comment as the ack const does).

---

## Shared Patterns

### BYOK key boundary (locked, applies to all worker handlers)
**Source:** `src/background.ts:668` (`const apiKey = s.apiKeys[s.provider] || ''`).
**Apply to:** `translatePageBatch`. Key is **always** read from storage in the worker, never placed in any page-bound message. No-key → `{error, kind:'auth'}` short-circuit.

### Keyed-JSON parse with key-injection guard (V5 input validation)
**Source:** `src/translate-batch.ts:48-92` (`parseBatchReply`).
**Apply to:** `parsePageBatchReply` in `page-walk.ts`. Iterate **inputKeys only**, two-attempt `stripWrappers`/raw parse, reject arrays/non-objects, type-check each entry (`typeof === 'string'`).

### In-page UI = textContent + fixed + idempotent-by-id (anti-XSS T-13-06)
**Source:** `src/content.ts:1077-1097` (`progCreateIndicator`).
**Apply to:** pill, banner, toast. `document.createElement` + `style.cssText` + `textContent` (never `innerHTML`), idempotent `getElementById` guard, z-index `2147483646`.

### In-place replace = mutate `Text.nodeValue` only (PAGE-01/02)
**Source:** RESEARCH Pattern 3; corollary of the codebase `textContent`-only law (T-13-06). No element wrapping, no `innerHTML`. WeakMap-backed restore (`WeakMap<Text,{original,translated}>` + strong `translatedNodes: Text[]` for toggle iteration — WeakMap is not enumerable).

### Worker→content dispatch + lastError guard
**Source:** `chrome.tabs.sendMessage` precedent (background.ts onClicked) + `chrome.runtime.lastError` check (content.ts:546, 1193).
**Apply to:** all `translatePage`/`togglePage` sends from worker/popup; wrap in try/catch (Pitfall 4: restricted tabs).

### Badge error signalling (D-04)
**Source:** `src/content.ts:515-535` (`setBadge` + `badgeForKind`).
**Apply to:** partial-failure path — red `ERR` badge via `badgeForKind(kind)`.

### Concurrency cap for N chunk calls
**Source:** `src/progressive-guard.ts:110-125` (`createConcurrencyGate`).
**Apply to:** capping simultaneous `translatePageBatch` chunk calls (default cap 2).

### Pure-module / classic-script mirror doctrine
**Source:** `src/content.ts:949-980` (mirrored `progShouldGateByLanguage`).
**Apply to:** every pure helper in `page-walk.ts` that `content.ts` needs — canonical in `page-walk.ts` (node-tested), duplicated verbatim into `content.ts` with a "MUST stay in sync" comment.

### Test harness against dist/
**Source:** `test/translation-batch.mjs:1-26`.
**Apply to:** `test/page-walk.mjs` — import from `../dist/page-walk.js`, `node:test` + `node:assert/strict`, linkedom for DOM (recursive walk, not native TreeWalker).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | Every new/modified file maps to a verified in-repo precedent. The only genuinely novel logic (TreeWalker live walk, WeakMap toggle store) has no direct analog but inherits structural conventions from `prog*` + `translate-batch` and is covered by RESEARCH Patterns 1/3/4. |

## Metadata

**Analog search scope:** `src/` (translate-batch.ts, background.ts, content.ts, popup.ts, types.ts, progressive-guard.ts), `test/`.
**Files scanned:** 7 source + 1 test (direct read) + grep across src/test.
**Pattern extraction date:** 2026-06-21
