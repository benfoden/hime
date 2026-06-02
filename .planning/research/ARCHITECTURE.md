# Architecture Research

**Domain:** Chrome MV3 Extension — keyboard-native inline translation
**Researched:** 2026-06-02 (updated for v1.2 Translated Search)
**Confidence:** HIGH (derived from actual v1.0 codebase + v1.2 integration analysis)

---

## Part 1: Existing v1.0 Architecture (unchanged — for context)

Chrome MV3 mandates a strict three-layer separation. The architecture is not optional — it is imposed by the platform:

```
┌─────────────────────────────────────────────────────────────┐
│                   USER / BROWSER LAYER                       │
│  Keyboard shortcut → Chrome Commands API                     │
│  Tab focus, active element, DOM events                       │
└───────────────────────────┬─────────────────────────────────┘
                            │ chrome.runtime messages
┌───────────────────────────▼─────────────────────────────────┐
│              BACKGROUND SERVICE WORKER                       │
│  background.ts                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Command      │  │ Message      │  │  Provider        │  │
│  │ Handler      │  │ Handler      │  │  Registry        │  │
│  │ (hotkeys)    │  │ (translate,  │  │  openai/gemini   │  │
│  │              │  │  badge, etc) │  │                  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                         ↕ fetch()                           │
│                   ┌──────────────┐                          │
│                   │ chrome.      │                          │
│                   │ storage.*    │                          │
│                   └──────────────┘                          │
└───────────────────────────┬─────────────────────────────────┘
                            │ chrome.runtime messages
┌───────────────────────────▼─────────────────────────────────┐
│                   CONTENT SCRIPT                             │
│  content.ts (injected into every page)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Compose Mode │  │ YOLO Mode    │  │  DOM Utilities   │  │
│  │ State Machine│  │ Handler      │  │  getActiveEl,    │  │
│  │              │  │              │  │  setElementText  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                         ↕                                   │
│                   ┌──────────────┐                          │
│                   │ Host Page    │                          │
│                   │ DOM / Input  │                          │
│                   │ Elements     │                          │
│                   └──────────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities (v1.0)

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| `background.ts` | LLM API calls, badge control, hotkey routing, settings read/write | MV3 service worker; lives in the extension origin |
| `content.ts` | DOM focus tracking, compose/YOLO mode state, text replacement | Injected at `document_end` on all URLs |
| `providers/openai.ts` | OpenAI Chat Completions API call + prompt construction | Implements `TranslationProvider` interface |
| `providers/gemini.ts` | Google Gemini API call + prompt construction | Same interface, different endpoint |
| `types.ts` | Shared types: Settings, Messages, TranslationProvider interface | Pure type definitions, no runtime code |
| `options.ts` / `options.html` | Settings page: key, model, language, formality, custom prompt | Standard extension options page |
| `popup.ts` / `popup.html` | Toolbar popup for quick status / actions | Extension action popup |

---

## Part 2: v1.2 Translated Search — Integration Architecture

### The Core Question: Where Does Each Network Call Live?

**Answer: ALL network calls (Brave Search + translation) must go through the background service worker.**

**Reasoning for Brave Search specifically:**

Extension pages (search.html / search.ts) are NOT content scripts — they run in the extension origin, not in a host page. This means they are *not* subject to host-page CSP restrictions. Technically, a direct `fetch()` to `https://api.search.brave.com/` from `search.ts` *could* work if `host_permissions` includes that domain.

However, routing Brave Search through background.ts is still the correct choice for three reasons:

1. **API key security**: The Brave Search API key must be read from `chrome.storage.local`. While `search.ts` can call `chrome.storage.local.get()` directly (extension pages have full storage access), centralizing all key-reads in background.ts follows the existing pattern where the background worker is the single point of storage access for sensitive credentials.

2. **Consistency**: The existing pattern is explicit: background.ts owns ALL external fetch calls. `search.ts` mimicking this pattern means any future key rotation, request logging, or error-classification logic added to background.ts benefits search automatically.

3. **Host permissions list**: Keeping the Brave domain declared once in manifest.json and accessed only from background.ts means `search.ts` needs zero new permissions. If search.ts called Brave directly, the same permission would be declared but split across two call sites.

**Translation calls from search.ts follow the same pattern for the same reasons.** The existing `translate` message type is already used by content scripts to invoke the provider registry in background.ts — search.ts sends the same message type. No new message-type needed for translation.

### v1.2 System Overview

```
┌───────────────────────────────────────────────────────────────────┐
│  search.html / search.ts  (new extension page)                    │
│  ┌─────────────────┐  ┌───────────────────────────────────────┐  │
│  │ SearchInput     │  │ SerpRenderer                          │  │
│  │ - query field   │  │ - renders SearchResult[]              │  │
│  │ - submit button │  │ - title (translated), snippet (trans) │  │
│  │ - loading state │  │ - href → original URL                 │  │
│  └────────┬────────┘  └───────────────────────────────────────┘  │
│           │  chrome.runtime.sendMessage                           │
└───────────┼───────────────────────────────────────────────────────┘
            │
            ▼  { type: 'translateQuery', payload: { query } }
┌───────────────────────────────────────────────────────────────────┐
│  background.ts  (service worker)                                  │
│                                                                   │
│  Step 1: translateQuery                                           │
│    translateText(query)  →  provider.translate()  →  LLM API     │
│    ──────────────────────────────────────────────────────────     │
│  Step 2: braveSearch (new handler)                                │
│    BraveSearchClient.search(translatedQuery)  →  Brave API        │
│    ──────────────────────────────────────────────────────────     │
│  Step 3: translateResults (new handler)                           │
│    batch translate titles+snippets  →  provider.translate() x N  │
│    (or single batch call with all titles+snippets joined)         │
│    ──────────────────────────────────────────────────────────     │
│  Returns: { results: SearchResult[] }  back to search.ts          │
└───────────────────────────────────────────────────────────────────┘
```

### Message Types (new and reused)

**Reused (no changes to background.ts message handler):**
- `translate` — search.ts can send this for query translation if a standalone call is needed. The existing handler works as-is.
- `getSettings` — search.ts reads settings (to know source/target language) exactly like options.ts does.

**New message types to add:**

| Message Type | Direction | Payload | Response |
|---|---|---|---|
| `searchTranslated` | search.ts → background | `{ query: string }` | `{ results: SearchResult[] }` or `{ error: string }` |

The `searchTranslated` message encapsulates the entire three-step flow (translate query → Brave search → translate results) as a single round-trip. This is cleaner than three separate messages because: (a) the search page has no intermediate use for the translated query text, and (b) the background can handle the entire pipeline atomically, including error handling at each step without multiple round-trip failures to manage in the UI.

**If a separate query-translate step is needed for UX** (e.g., showing "searching in Japanese for: ..." before results arrive), split into two messages:

| Message Type | Direction | Payload | Response |
|---|---|---|---|
| `translateQuery` | search.ts → background | `{ query: string }` | `{ translatedQuery: string }` |
| `braveSearch` | search.ts → background | `{ translatedQuery: string }` | `{ results: RawSearchResult[] }` |

Then results translation reuses the existing `translate` message type for each batch. However, this three-message approach adds round-trip complexity and is only justified if the UX needs intermediate states. Start with `searchTranslated` as the single atomic message.

### Full Data Flow Diagram

```
User types query → clicks Search
    ↓
search.ts: chrome.runtime.sendMessage({ type: 'searchTranslated', payload: { query } })
    ↓
background.ts: case 'searchTranslated'
    ├─ [Step 1] translateText(query)
    │    └─ providers[settings.provider].translate(query, {
    │         sourceLanguage: settings.sourceLanguage,   // e.g. "English"
    │         targetLanguage: settings.targetLanguage,   // e.g. "Japanese"
    │         ...
    │       }, apiKey, model)
    │    └─ returns translatedQuery (e.g. "機械学習")
    │
    ├─ [Step 2] BraveSearchClient.search(translatedQuery, braveApiKey)
    │    └─ fetch('https://api.search.brave.com/res/v1/web/search', {
    │         headers: { 'X-Subscription-Token': braveApiKey, 'Accept': 'application/json' }
    │       })
    │    └─ returns RawSearchResult[] (title, url, description in target language)
    │
    ├─ [Step 3] batch translate titles + snippets
    │    Option A (simple): one translate call per result, sequential or parallel
    │    Option B (efficient): join all titles+snippets with separator, one LLM call
    │    └─ returns translated title + snippet pairs
    │
    └─ sendResponse({ results: SearchResult[] })
         // SearchResult = { title: string, url: string, snippet: string }
         // title + snippet are translated; url is the original untouched

search.ts: receives results → SerpRenderer.render(results)
```

**Result translation batching recommendation:** Join all titles and snippets into one LLM call with a structured separator (e.g., XML-tagged blocks or a JSON array). One API call for 10 results is far cheaper than 10 separate calls. The provider's `translate()` method already accepts arbitrary text — pass a structured batch string and parse it back. This detail belongs in a helper function in `search.ts` or a new `src/search-util.ts`.

### New and Modified Files

**New files:**

| File | Purpose |
|---|---|
| `src/search.html` | Extension page HTML — search input + SERP container |
| `src/search.ts` | Page controller — handles input, sends messages, passes results to renderer |
| `src/search.css` | SERP styles — classic result list layout |
| `src/search-renderer.ts` | Pure function: `renderResults(results: SearchResult[]): void` — DOM updates only, no I/O |
| `src/brave-search.ts` | `BraveSearchClient` — wraps `fetch()` to Brave API, maps response to `RawSearchResult[]` |

**Modified files:**

| File | Changes |
|---|---|
| `src/background.ts` | Add `case 'searchTranslated'` handler; import and call `BraveSearchClient` |
| `src/types.ts` | Add `SearchResult`, `RawSearchResult` interfaces; add `'searchTranslated'` to `MessageType` union; add `SearchTranslatedMessage` interface; add `braveApiKey` field to `Settings` |
| `manifest.json` | Add `"https://api.search.brave.com/*"` to `host_permissions`; add `search.html` to `web_accessible_resources` or register as an extension page |
| `src/options.html` | Add Brave Search API key input field in API Configuration section |
| `src/options.ts` | Read/write `settings.braveApiKey` alongside existing provider keys |

**No changes needed:**
- `content.ts` — search is a separate extension page, not injected into host pages
- `providers/*.ts` — existing provider implementations work unchanged
- `popup.ts` / `popup.html` — may add a "Search" button/link to open search page, but not required

### Opening the Search Page

The search page is an extension page opened via `chrome.tabs.create({ url: chrome.runtime.getURL('search.html') })`. This can be triggered from:
- The extension popup (add a "Search" button)
- The omnibox keyword (optional: register in manifest with `"omnibox": { "keyword": "hime" }`)
- A direct toolbar button if the popup is converted to open search instead

The simplest path: add a "Translated Search" button to `popup.html` that calls `chrome.tabs.create`. No new manifest entry required.

### Settings Addition: Brave API Key

The `Settings` interface in `types.ts` gains one field:

```typescript
export interface Settings extends TranslationConfig, ProviderConfig {
  // ... existing fields ...
  braveApiKey: string;  // BYOK Brave Search API key
}
```

Storage and retrieval follows the identical pattern to LLM API keys — stored in `chrome.storage.local` under `himeSettings`, read via `getSettings()` in background.ts. The options page gets a new password input field in the "API Configuration" section, labeled "Brave Search API Key".

`DEFAULT_SETTINGS` gets `braveApiKey: ''`. `migrateSettings()` needs no change — the spread `{ ...DEFAULT_SETTINGS, ...raw }` already handles new fields gracefully.

### Testability

**Pure functions to isolate:**

| Function | Location | What it does | How to test |
|---|---|---|---|
| `mapBraveResponse(raw)` | `src/brave-search.ts` | Maps raw Brave API JSON → `RawSearchResult[]` | Unit test with fixture JSON |
| `buildBatchTranslationPrompt(results)` | `src/search-util.ts` | Constructs the joined batch string for LLM | Unit test with known inputs |
| `parseBatchTranslationResponse(raw, count)` | `src/search-util.ts` | Parses LLM batch response back to string pairs | Unit test with mock LLM responses |
| `renderResults(container, results)` | `src/search-renderer.ts` | DOM update only, no side effects | Node test with jsdom or manual DOM fixture |

The `BraveSearchClient.search()` method wraps `fetch()` — keep it a thin wrapper so tests can inject a mock fetch. The background handler (`case 'searchTranslated'`) orchestrates these pure functions and is the only piece that requires a full integration test.

### Build Order (dependency-respecting sequence)

1. **Types first** (`src/types.ts`) — add `SearchResult`, `RawSearchResult`, `braveApiKey`, `searchTranslated` message types. Everything else imports from here.

2. **BraveSearchClient** (`src/brave-search.ts`) — standalone module, no dependencies on other new files. Add Brave `host_permissions` to `manifest.json` at the same time.

3. **Settings addition** — add `braveApiKey` to `options.html` + `options.ts`. Verify round-trip: key saves to storage, loads back. Independent of search page.

4. **Background handler** (`src/background.ts`) — add `case 'searchTranslated'` using the now-complete `BraveSearchClient` and existing `translateText()`. Can be tested via chrome.runtime.sendMessage from DevTools console before search UI exists.

5. **Search utilities** (`src/search-util.ts`) — batch translation helpers, pure functions. Unit testable immediately after writing.

6. **SERP renderer** (`src/search-renderer.ts`) — pure DOM renderer, testable with hardcoded `SearchResult[]` array before plumbing is complete.

7. **Search page** (`src/search.html` + `src/search.ts` + `src/search.css`) — wires everything together. Depends on all above.

8. **Popup integration** — add "Translated Search" link/button to `popup.html` + `popup.ts`. Last because it's purely additive.

---

## Existing Project Structure (v1.0)

```
src/
├── types.ts              # All shared types + DEFAULT_SETTINGS
├── background.ts         # Service worker: routing, API calls, storage
├── content.ts            # Content script: DOM state machine
├── providers/
│   ├── openai.ts         # OpenAI provider implementation
│   ├── gemini.ts         # Gemini provider implementation
│   └── openrouter.ts     # OpenRouter provider implementation
├── popup.html
├── popup.ts
├── popup.css
├── options.html          # Settings page
├── options.ts
├── options.css
└── icons/
    └── *.png / icon.svg
```

## v1.2 Target Structure (additions marked with +)

```
src/
├── types.ts              # + SearchResult, RawSearchResult, braveApiKey, searchTranslated
├── background.ts         # + case 'searchTranslated' handler
├── content.ts            # (unchanged)
├── brave-search.ts       # + NEW: BraveSearchClient wrapping Brave API fetch
├── search-util.ts        # + NEW: batch translation prompt builder/parser
├── search-renderer.ts    # + NEW: pure function SERP DOM renderer
├── search.html           # + NEW: search page HTML
├── search.ts             # + NEW: search page controller
├── search.css            # + NEW: SERP styles
├── providers/            # (unchanged)
├── popup.html            # + add "Translated Search" button
├── popup.ts              # + open search.html via chrome.tabs.create
├── options.html          # + Brave API key input field
├── options.ts            # + read/write braveApiKey
└── ...
```

---

## Architectural Patterns

### Pattern 1: Background-as-API-Gateway (existing, extended for search)

**What:** All external network calls — LLM APIs and now Brave Search — are routed through the background service worker. Neither the search page nor content scripts ever call `fetch()` directly.

**Why it's the right call for search.ts even though search.ts is an extension page (not a content script):** The Brave API key lives in `chrome.storage.local`. Centralizing the key-read + fetch in background.ts keeps key access in one place, follows established project convention, and means future request logging or retry logic applies automatically.

**Extended example for search:**
```typescript
// search.ts — sends one message, gets back translated results
const response = await chrome.runtime.sendMessage({
  type: 'searchTranslated',
  payload: { query: userInput }
});
if (response.error) showError(response.error);
else renderResults(response.results);

// background.ts — case 'searchTranslated' — the only place that calls Brave API
const settings = await getSettings();
const translatedQuery = await translateText(query);         // reuses existing function
const rawResults = await braveSearch(translatedQuery, settings.braveApiKey);
const results = await translateResults(rawResults);          // new function
sendResponse({ results });
```

### Pattern 2: Provider Interface Reuse (existing, no changes needed)

The `TranslationProvider` interface and registry in background.ts handle query translation and result translation identically to inline translation. No new provider abstraction needed — the search handler calls the existing `translateText()` function and the existing `providers[settings.provider]` registry.

### Pattern 3: Single Atomic Message for Multi-Step Pipeline

**What:** The `searchTranslated` message encapsulates translate-query + fetch-brave + translate-results as one round-trip from search.ts to background.ts.

**Why not three separate messages:** Each round-trip adds latency and error-handling boilerplate in search.ts. The search page has no reason to show the translated query text to the user (it just shows results), so intermediate results have no UX value. A single message makes the happy path simple and error handling centralized in the background handler.

**Trade-off:** If UX requires showing "Searching in Japanese for: 機械学習..." before results arrive, split into `translateQuery` + `braveSearch` + `translate` messages and stream progress. For v1.2 MVP, atomic is cleaner.

### Pattern 4: Pure Renderer Function

**What:** `search-renderer.ts` exports a single `renderResults(container: HTMLElement, results: SearchResult[]): void`. No network calls, no storage reads, no message passing.

**Why:** Makes the SERP layout testable in isolation. Given a fixed `SearchResult[]` array, the rendered HTML is deterministic and verifiable without a background worker or live API.

---

## Anti-Patterns

### Anti-Pattern 1: Direct Brave API Fetch from search.ts

**What people might do:** Call `fetch('https://api.search.brave.com/res/v1/web/search', ...)` directly from `search.ts`.

**Why it's wrong:** Technically possible (extension pages have host permissions), but it splits the API key access pattern — now keys are read from storage in two places (background.ts for LLM keys, search.ts for the Brave key). Breaks the single-point-of-key-read invariant that makes future key management changes easy.

**Do this instead:** Route Brave calls through background.ts via `sendMessage`, same as all other API calls.

### Anti-Pattern 2: Per-Result Translation Calls

**What people might do:** Translate each search result title and snippet in a separate LLM call inside a `results.map(async r => translate(r.title + r.snippet))`.

**Why it's wrong:** For 10 results, this fires 10-20 separate LLM API calls, multiplying cost and latency by 10x.

**Do this instead:** Batch all titles and snippets into one LLM call. Construct a numbered list or XML-tagged block, send as one `translate` call, parse the structured response back into per-result strings. One call for all results. Implement in `search-util.ts` as `buildBatchPrompt()` / `parseBatchResponse()`.

### Anti-Pattern 3: Translating Result Titles Without Preserving URLs

**What people might do:** Mutate the result objects' `url` field during translation or map incorrectly, losing the original source URL.

**Why it's wrong:** The SERP must link to the original (untranslated) source pages. Losing the URL makes results useless.

**Do this instead:** Keep `url` immutable through the entire pipeline. The translation step receives `{ title, snippet }` pairs indexed by position and returns translated pairs; `url` is carried through separately and never passed to the LLM.

### Anti-Pattern 4: Auto-Detect Language Flip for Query Translation

**What people might do:** Call the existing `translateText()` function which auto-detects Japanese input and flips source/target direction.

**Why it's wrong:** `background.ts#translateText()` currently applies auto-direction-flip logic — if the text contains Japanese characters, it swaps source and target. For query translation on the search page, the user is always typing in their source language. The auto-flip would incorrectly reverse the direction if the user happens to paste a Japanese term to search in English.

**Do this instead:** Add a `translateTextExplicit(text, source, target)` helper (or pass explicit config to a refactored `translateText`) that bypasses auto-flip. Or call `providers[settings.provider].translate(text, explicitConfig, ...)` directly from the search handler. The existing `translateText()` function is content-script-oriented; the search handler should use the provider API directly with explicit `sourceLanguage` / `targetLanguage` from settings.

---

## Integration Points

### External Services (v1.2 additions)

| Service | Integration Pattern | Auth | Notes |
|---------|---------------------|------|-------|
| Brave Search API | `fetch()` from background.ts only | `X-Subscription-Token: <key>` header | BYOK key stored in `chrome.storage.local`; add `"https://api.search.brave.com/*"` to `host_permissions` |
| LLM Providers (existing) | `fetch()` from background.ts via provider registry | Bearer / API key per provider | Reused unchanged for query + result translation |

### Internal Boundaries (v1.2 additions)

| Boundary | Communication | Notes |
|----------|---------------|-------|
| search.ts → background.ts | `chrome.runtime.sendMessage({ type: 'searchTranslated', ... })` | Same async pattern as content.ts; `return true` in listener already present |
| background.ts → BraveSearchClient | In-process function call | Same context; no serialization |
| background.ts → search.ts (results) | `sendResponse({ results })` | Passes `SearchResult[]` array |
| search.ts → search-renderer.ts | Direct function call | Same module; pure render function |
| options.ts → chrome.storage.local | Existing settings pattern | `braveApiKey` added to `himeSettings` object |

---

## Manifest Changes Required

```json
{
  "host_permissions": [
    "https://api.openai.com/*",
    "https://generativelanguage.googleapis.com/*",
    "https://openrouter.ai/*",
    "https://api.search.brave.com/*"
  ]
}
```

The search page itself (search.html) does not need `web_accessible_resources` — it is an extension page opened via `chrome.runtime.getURL('search.html')`, not embedded in a host page. Extension pages are accessible from within the extension by default.

---

## Sources

- Chrome Extension MV3 network request documentation: https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
- Brave Search API documentation: https://api-dashboard.search.brave.com/app/documentation/web-search/get-started
- Existing v1.0 codebase (`src/background.ts`, `src/types.ts`, `src/options.ts`, `manifest.json`)

---
*Architecture research for: hime Chrome MV3 extension — v1.2 Translated Search integration*
*Researched: 2026-06-02*
*Confidence: HIGH — derived from actual implemented codebase + verified Chrome extension CORS behavior*
