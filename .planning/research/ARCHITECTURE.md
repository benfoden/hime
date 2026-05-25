# Architecture Research

**Domain:** Chrome MV3 Extension — keyboard-native inline translation
**Researched:** 2026-05-24
**Confidence:** HIGH (derived from actual v1.0 codebase)

## Standard Architecture

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

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| `background.ts` | LLM API calls, badge control, hotkey routing, settings read/write | MV3 service worker; lives in the extension origin |
| `content.ts` | DOM focus tracking, compose/YOLO mode state, text replacement | Injected at `document_end` on all URLs |
| `providers/openai.ts` | OpenAI Chat Completions API call + prompt construction | Implements `TranslationProvider` interface |
| `providers/gemini.ts` | Google Gemini API call + prompt construction | Same interface, different endpoint |
| `types.ts` | Shared types: Settings, Messages, TranslationProvider interface | Pure type definitions, no runtime code |
| `options.ts` / `options.html` | Settings page: key, model, language, formality, custom prompt | Standard extension options page |
| `popup.ts` / `popup.html` | Toolbar popup for quick status / actions | Extension action popup |

## Existing Project Structure

```
src/
├── types.ts              # All shared types + DEFAULT_SETTINGS
├── background.ts         # Service worker: routing, API calls, storage
├── content.ts            # Content script: DOM state machine
├── providers/
│   ├── openai.ts         # OpenAI provider implementation
│   └── gemini.ts         # Gemini provider implementation
├── popup.html            # Extension toolbar popup
├── popup.ts
├── popup.css
├── options.html          # Settings page
├── options.ts
├── options.css
└── icons/
    ├── icon.svg
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### Structure Rationale

- **`providers/`:** The only subdirectory — right choice. Provider logic is cleanly isolated behind `TranslationProvider` interface. Adding a new LLM provider means adding one file here, no other changes needed.
- **Flat `src/`:** Appropriate for this size. background/content/popup/options are platform-mandated entry points, not application layers — grouping them into sub-folders adds navigation overhead without clarifying relationships.
- **`types.ts` at root:** Single source of truth for all inter-module contracts, including the message protocol between content script and background. Keep it here.

## Architectural Patterns

### Pattern 1: Background-as-API-Gateway

**What:** All external network calls (LLM APIs) are routed through the background service worker. The content script never calls `fetch()` directly.

**Why it's mandatory:** Content scripts run in the host page's context and inherit its CSP. Most production sites have strict CSPs that would block calls to `api.openai.com`. The background service worker runs in the extension origin, which has no page-imposed CSP — only the `host_permissions` in `manifest.json` apply.

**Example:**
```typescript
// content.ts — never calls fetch
async function translateText(text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'translate', payload: { text } }, (response) => {
      if (response?.error) reject(new Error(response.error));
      else resolve(response?.translatedText || '');
    });
  });
}

// background.ts — the only place that calls fetch
const response = await fetch('https://api.openai.com/v1/chat/completions', { ... });
```

**Trade-off:** One extra message hop per translation. Acceptable — translations are 500ms+ operations; 1ms message overhead is noise.

### Pattern 2: Provider Interface + Registry

**What:** `TranslationProvider` interface defines `translate(text, config, apiKey, model)`. A registry object maps provider name strings to instances. Adding a provider means implementing the interface and adding to the registry.

**Why it's the right call:** Prevents provider-specific logic from leaking into background.ts's routing logic. The switch statement in `translateText()` would otherwise grow with each new provider.

**Example:**
```typescript
// background.ts
const providers: Record<string, TranslationProvider> = {
  openai: new OpenAIProvider(),
  gemini: new GeminiProvider(),
};

const provider = providers[settings.provider];
return await provider.translate(text, config, settings.apiKey, settings.model);
```

### Pattern 3: Typed Message Protocol

**What:** All content script ↔ background communication uses a discriminated union `MessageType` with typed message interfaces (`TranslateMessage`, `SetBadgeMessage`, etc.).

**Why it matters:** Background and content script are separate JS contexts — there is no shared memory, no shared type checking at runtime. The types exist to catch errors at compile time before they become silent runtime failures across the message boundary.

**Trade-off:** Requires explicit casting (`message as TranslateMessage`) which TypeScript can't fully enforce across runtime boundaries. Better than nothing; not as good as a validated schema.

### Pattern 4: Compose Mode as a State Machine

**What:** Compose mode is tracked as explicit state in the content script: `{ isActive, element, originalText }`. Transitions are: Off → On (enter), On → Off (cancel via Escape), On → Off (convert via hotkey toggle).

**Why:** The alternative — checking DOM state on every keypress — is fragile. Explicit state makes the lifecycle visible and testable. The `originalText` field is critical: it lets the content script extract only the newly-typed text (since compose mode activation) rather than the entire field contents.

## Data Flow

### Hotkey → Translation Flow

```
User presses Ctrl+Shift+T
    ↓
Chrome Commands API fires 'toggle-compose'
    ↓
background.ts: chrome.commands.onCommand
    ↓
chrome.tabs.sendMessage(tabId, { type: 'toggleCompose' })
    ↓
content.ts: onMessage handler → enterComposeMode() or convertComposeMode()
    ↓ (on convert)
chrome.runtime.sendMessage({ type: 'translate', payload: { text } })
    ↓
background.ts: onMessage handler → translateText()
    ↓
providers[settings.provider].translate(text, config, apiKey, model)
    ↓
fetch(provider API endpoint)
    ↓
response.translatedText sent back via sendResponse
    ↓
content.ts: setElementText(element, translated) via execCommand('insertText')
```

### Settings Flow

```
User saves settings in options.html
    ↓
options.ts: chrome.storage.local.set({ himeSettings: settings })
    ↓
background.ts: getSettings() reads chrome.storage.local on next translate call
    ↓ (no reactive subscription — lazy read on each translation)
```

Settings are read fresh on every translation call. There is no caching or reactive subscription to storage changes in the current implementation. This is correct for an extension this size — adding a subscription would complicate the service worker lifecycle with no measurable benefit.

### Badge State Flow

```
content.ts state change
    ↓
chrome.runtime.sendMessage({ type: 'setBadge', payload: { text, color } })
    ↓
background.ts: chrome.action.setBadgeText / setBadgeBackgroundColor
```

Badge control is intentionally centralized in the background. Content scripts cannot call `chrome.action.*` directly — that API is only available in the service worker and popup contexts.

## Key Architectural Constraints (MV3-Imposed)

| Constraint | Impact | Current Handling |
|------------|--------|-----------------|
| Service worker has no persistent memory | `composeState` in background.ts would be lost on worker termination | Compose state is owned by content.ts (persistent per page load) — correct |
| Content scripts inherit host CSP | Cannot call external APIs directly | All fetch() in background.ts |
| 4 registered commands max | Can add at most 1 more hotkey | Currently using 3 |
| `execCommand('insertText')` deprecated | Will eventually break; no better alternative yet | Accept the risk; monitor Chrome deprecation notices |
| `chrome.storage.*` is async | Every settings read requires await | Lazy per-call read; acceptable overhead |

## Anti-Patterns

### Anti-Pattern 1: Direct DOM Mutation for Text Replacement

**What people do:** `element.value = translatedText` or `element.innerHTML = translatedText`

**Why it's wrong:** Bypasses the browser's native undo stack. The user cannot Ctrl+Z to recover their original text. This is a non-starter for a tool that sits inside someone's active editing workflow.

**Do this instead:** `document.execCommand('insertText', false, text)` after selecting all content. Deprecated, but the only undo-safe path in Chrome extensions as of 2026.

### Anti-Pattern 2: Making LLM Calls from Content Script

**What people do:** Put `fetch('https://api.openai.com/...')` directly in content.ts for simplicity.

**Why it's wrong:** Fails silently on sites with CSP headers (which is most production sites). The error appears in the host page's console as a CSP violation, not in the extension console — extremely hard to debug.

**Do this instead:** Route all API calls through the background service worker via `chrome.runtime.sendMessage`.

### Anti-Pattern 3: Storing Compose State in Background

**What people do:** Track `composeState` in background.ts alongside the API call logic, since that's where hotkeys are received.

**Why it's wrong:** MV3 service workers are ephemeral — Chrome can terminate them after ~30 seconds of inactivity. State stored in the service worker's memory is lost on termination. A user mid-compose who pauses for 30 seconds would silently lose their compose context.

**Do this instead:** Own all compose state in the content script (persistent for the lifetime of the page). The background worker receives the hotkey and forwards it to the content script; the content script owns the state machine. This is the correct split in the current implementation.

### Anti-Pattern 4: Polling storage for Settings Changes

**What people do:** `setInterval(() => chrome.storage.local.get(...), 1000)` to pick up settings changes reactively.

**Why it's wrong:** Keeps the service worker alive unnecessarily, burns battery, adds complexity.

**Do this instead:** Read settings lazily on each translation request. Settings don't change frequently; one extra storage read per translation is unnoticeable.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| OpenAI API | Direct `fetch()` from background.ts with Bearer token | `host_permissions` in manifest.json required |
| Google Gemini API | Direct `fetch()` from background.ts with API key param | Same pattern, different auth mechanism |
| `chrome.storage.local` | Async key-value store for settings persistence | ~10MB limit; far more than needed |
| `chrome.storage.session` | Session-only storage (cleared on browser close) | Used when user selects "session" storage mode for API key |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Background ↔ Content Script | `chrome.runtime.sendMessage` (content→bg) and `chrome.tabs.sendMessage` (bg→content) | Async; must `return true` from listener to keep channel open |
| Background ↔ Options Page | `chrome.storage.local` (shared storage, not direct messages) | Options writes; background reads. No real-time sync needed. |
| Background ↔ Popup | `chrome.storage.local` + direct message if needed | Popup reads settings, can trigger badge updates |
| Providers ↔ Background | In-process function calls | Same JS context; no serialization overhead |

## Scaling Considerations

This is a client-side-only extension with no server. "Scaling" means handling more sites, more users' edge cases, and potentially more providers — not traffic load.

| Concern | Current State | Future Consideration |
|---------|---------------|---------------------|
| Provider count | 2 providers, registry pattern | Add new provider = 1 file + 1 registry entry. No other changes. |
| contenteditable complexity | Works for standard elements; known risk on Google Docs/Notion | May need site-specific adapters for complex editors |
| Hotkey slots | 3 of 4 used | 1 slot remaining; plan any new hotkeys carefully |
| Prompt sophistication | Single prompt template per provider | Could support per-language prompt overrides without arch change |
| Multi-language-pair | Out of scope v1 | Would require UI rework; architecture supports it (settings already has source/target) |

## Sources

- Chrome Extension MV3 documentation (authoritative): service worker lifecycle, CSP constraints, commands API limits
- Existing v1.0 codebase (`src/background.ts`, `src/content.ts`, `src/types.ts`, `src/providers/`)
- `manifest.json` for permissions model

---
*Architecture research for: hime Chrome MV3 extension (keyboard-native inline translation)*
*Researched: 2026-05-24*
*Confidence: HIGH — derived from actual implemented codebase, not speculation*
