# Phase 5: Ghost-Text Prediction Engine - Research

**Researched:** 2026-05-30
**Domain:** Chrome MV3 content script — inline ghost-text rendering, undo-safe text insertion,
debounced AI prediction, request race-condition handling, language detection
**Confidence:** HIGH (core patterns) / MEDIUM (prompt engineering specifics)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Default trigger is **manual** — a key press fires a prediction for the current field
  (no auto-firing out of the box). This is the shipped default.
- **D-02:** An **auto** trigger mode also exists (predict-as-you-type after a debounce). Auto is
  opt-in. Phase 5 builds both code paths; default = manual. Defaults: ~400ms debounce, min 3 chars;
  Phase 7 (SET-02, SET-04) exposes them in options.
- **D-03:** Recommended default manual trigger key: **Ctrl+Space** (avoids v1.0 hotkeys
  Ctrl+Y / Ctrl+Shift+Y / Ctrl+Shift+S). Final key becomes configurable in Phase 7. Registered on
  the existing capture-phase keydown listener, NOT a `chrome.commands` slot.
- **D-04:** Render ghost text **only when the caret is at the end of the field's text** (end-of-text
  completion). Mid-text caret → no ghost shown.
- **D-05:** `<input>` / `<textarea>` → absolutely-positioned overlay aligned to end-of-text, reuse
  v1.0 overlay-positioning approach (`getBoundingClientRect` + `scrollX/scrollY`, `z-index:
  2147483647`, `pointer-events: none`). `contenteditable` → inline ghost span appended after caret.
  Appearance: dim grey, inline, visually continuous with typed text.
- **D-06:** Ghost text never mutates committed text; clears cleanly on blur/focus-leave (PRED-06).
  On accept, insert via `execCommand('insertText')` (undo-safe, PRED-02); cursor lands at end.
- **D-07:** Prediction suppressed while compose mode is active AND while a translation loading
  overlay is showing. No double overlays, no key contention.
- **D-08:** Shared plumbing reused, not duplicated — `getActiveElement`, `isValidInputElement`,
  field-text read, the single capture-phase keydown listener, and overlay positioning.
- **D-09:** **Esc precedence:** ghost showing → Esc dismisses ghost first; no ghost + compose active
  → Esc cancels compose (existing v1.0 behavior).
- **D-10:** **Silent** — no spinner/indicator while prediction is being fetched. Stale responses
  discarded via latest-request-wins + request token/sequence.
- **D-11:** Completion produced in the **field's own language/context**, independent of translate
  target-language setting (LANG-02).
- **D-12:** Tab (or Enter) accepts; Esc dismisses; continued typing supersedes. When no suggestion
  showing, Tab/Enter/Esc retain native field behavior.

### Claude's Discretion

- Exact prediction prompt wording and whether prediction reuses the same configured model as
  translation or a lighter call (PRED-04 only locks "via the existing background provider layer").
- Precise overlay caret-measurement technique for `<input>`/`<textarea>` (mirror-div vs. measured
  text width).
- Request-token/abort mechanism for stale-response discarding.

### Deferred Ideas (OUT OF SCOPE)

- Multiple alternate completions + in-field cycling → **Phase 6** (VAR-01..03).
- Options-page settings (enable/disable, debounce, max variations, trigger behavior, cycle key)
  → **Phase 7** (SET-01..05).
- Streaming token-by-token ghost text, after-cursor context, per-site allowlist, acceptance
  telemetry, multi-line completion → future milestone.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PRED-01 | Ghost text rendered inline after a configurable debounce while typing | Debounce pattern (clearTimeout/setTimeout), auto vs manual code paths |
| PRED-02 | Tab/Enter accepts suggestion undo-safely via `execCommand('insertText')` | execCommand remains the only undo-safe insertion API for native inputs; insert at caret, no full-select |
| PRED-03 | Esc dismisses without altering content | Conditional Esc in existing keydown listener; Esc precedence rule (D-09) |
| PRED-04 | Predictions via existing background service-worker provider layer | New `predict` message type to `background.ts`; provider contract unchanged |
| PRED-05 | Continued typing supersedes ghost text; new prediction refreshes after debounce | Ghost overlay removed on any `input`/`keydown` that isn't Tab/Enter/Esc; debounce restarts |
| PRED-06 | Ghost text clears on blur/focus-leave; never mutates committed text | `focusout` listener removes ghost overlay; overlay-only approach (never DOM-injected into value) |
| LANG-01 | Works in `<input>`, `<textarea>`, `contenteditable`; reuses v1.0 field detection | `isValidInputElement` reused verbatim; end-of-caret detection per element type |
| LANG-02 | Completions in field's own language; independent of translate target setting | Prompt instructs model to continue in the same language as the input; no target-language param used |
</phase_requirements>

---

## Summary

Phase 5 adds a live ghost-text inline completion engine to hime. The user types in any editable
field, optionally presses Ctrl+Space (manual mode) or pauses typing for ~400ms (auto mode), and
sees 2-3 words of AI-generated continuation rendered as dim grey ghost text after the caret. Tab
or Enter accepts (undo-safe insertion); Esc dismisses; continued typing clears the ghost and
schedules a fresh prediction.

The rendering approach diverges by field type: `<input>` and `<textarea>` cannot contain styled
child elements, so ghost text is rendered via an absolutely-positioned overlay div aligned to the
field's right edge (using the same `getBoundingClientRect + scrollX/Y` technique already in
`showLoadingOverlay`). `contenteditable` elements support inline DOM children, so a non-editable
ghost span is appended directly after the caret node. Caret-at-end detection is cheap and
reliable: `selectionStart === value.length` for inputs/textareas; `window.getSelection().focusNode`
comparison for contenteditable.

Race conditions are eliminated with a per-field request sequence counter (integer, not UUID).
Before issuing a new prediction request the counter is incremented; when a response arrives, it is
discarded if the stored sequence no longer matches. A companion `AbortController` cancels the
in-flight fetch on supersession so model API costs are not wasted. `chrome.i18n.detectLanguage` is
available in content scripts and provides language detection via Chrome's built-in CLD engine, but
for this phase language-agnostic completion is achieved purely via prompt instruction rather than
explicit detection (simpler, more robust for mixed-language fields). The existing background message
contract is extended with a `predict` message type, and all three providers (OpenAI, Gemini,
OpenRouter) are usable without provider-specific prediction code.

**Primary recommendation:** Use the mirror-div approach for `<input>`/`<textarea>` caret pixel
measurement, an absolutely-positioned overlay for ghost text display, and an inline `[contenteditable=false]` span for `contenteditable` ghost text. Extend the single existing
`keydown` listener; do not add a second listener. Keep auto and manual trigger paths as two
branches of the same `schedulePrediction` function.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Ghost-text DOM rendering | Content script (browser) | — | Requires live DOM access to the focused field |
| Caret position measurement | Content script (browser) | — | getBoundingClientRect/Selection API only available in page context |
| Debounce + trigger logic | Content script (browser) | — | Responds to keydown/input events in page context |
| Request race handling (sequence/abort) | Content script (browser) | — | Token lives with the in-flight request state |
| Prediction API call | Background service worker | — | Same pattern as `translate`; avoids CORS issues from content script |
| Prompt assembly | Background service worker | providers/prompt.ts | Extends existing `buildSystemPrompt` pattern |
| Language detection | Content script (browser) | Background (fallback) | `chrome.i18n.detectLanguage` available in content script context |
| Provider dispatch | Background service worker | — | All three existing providers handle prediction via new message type |
| Accept/dismiss key handling | Content script (browser) | — | Lives in existing capture-phase keydown listener |

---

## Standard Stack

### Core (zero new runtime dependencies required)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native DOM APIs | — | `getBoundingClientRect`, `getComputedStyle`, `window.getSelection`, `document.execCommand` | Already used in content.ts; no bundle size cost |
| `AbortController` / `AbortSignal` | — (browser built-in) | Cancel stale fetch requests | Standard Web API; supported in all Chrome versions relevant to MV3 |
| `chrome.i18n.detectLanguage` | — (Chrome built-in) | Language detection in content scripts | Available in content scripts per Chrome i18n API; uses Chrome's Compact Language Detector |
| `chrome.runtime.sendMessage` | — (Chrome built-in) | Content→background prediction request | Existing pattern in codebase |

**No new npm dependencies are required for Phase 5.** [VERIFIED: codebase inspection — existing overlay positioning already uses getBoundingClientRect + scrollY; `execCommand('insertText')` already used in `setElementText`]

### Supporting (Claude's discretion — mirror-div approach)

The mirror-div caret-measurement pattern is implemented inline (not via an npm package) to avoid
adding a dependency to a content script. The `textarea-caret` npm package (v3.1.0, last published
2022-06-27) implements this pattern and can be referenced for the CSS property list to copy, but
should be inlined rather than imported in a classic content script.

| Technique | Version | Purpose | When to Use |
|-----------|---------|---------|-------------|
| Mirror-div (inline impl) | n/a | Pixel-accurate caret X position in `<input>`/`<textarea>` | Required for overlay left-alignment past typed text |
| `window.getSelection()` + Range | n/a | Caret-at-end detection and pixel coords in contenteditable | Native; no library needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Mirror-div inline | `textarea-caret` npm package (v3.1.0) | Package is well-tested but adds a dependency to a classic content script — inline the relevant CSS copy list instead |
| `chrome.i18n.detectLanguage` | `franc` or `langdetect` npm packages | npm packages add bundle weight; Chrome's CLD is already available in content scripts with no bundle cost |
| Prompt-only language continuation | Explicit lang detection + lang param in prompt | Prompt-only is simpler and handles mixed-language fields gracefully; explicit detection is marginally more reliable on very short inputs |
| Sequence counter (integer) | UUID-based request ID | Integer counter is simpler, same correctness guarantee for sequential single-field usage |

**Installation:** No new packages to install. [VERIFIED: all required APIs are browser built-ins or already-installed Chrome extension APIs]

---

## Architecture Patterns

### System Architecture Diagram

```
User types / presses Ctrl+Space
         │
         ▼
[content.ts — keydown listener (capture phase)]
         │
    ┌────┴─────────────────────────────────────┐
    │  Is ghost showing?                        │
    │  Tab/Enter → acceptGhost()                │
    │  Esc       → dismissGhost() (D-09)        │
    │  Any other key → clearGhost() + schedule  │
    └──────────────────────────────────────────┘
         │
         ▼
[schedulePrediction(element, mode)]
         │
    ┌────┴──────────────────────────────────────┐
    │  manual mode: fire immediately             │
    │  auto mode:   clearTimeout + setTimeout    │
    │               (~400ms debounce)            │
    └───────────────────────────────────────────┘
         │
         ▼
[requestPrediction(element)]
    • increment requestSeq
    • abort previous AbortController
    • create new AbortController
    • read text-before-cursor
    • check caret-at-end (D-04)
    • suppress if composeState.isActive OR
      himeLoading dataset (D-07)
         │
         ▼
chrome.runtime.sendMessage({ type: 'predict', payload: { text } })
         │
         ▼ (background.ts)
[handlePredictMessage]
    • getSettings() → provider + apiKey + model
    • provider.predict(text, apiKey, model)
         │
    ┌────┴──────────────────────────────────────┐
    │  OpenAI / Gemini / OpenRouter provider     │
    │  POST to provider API                     │
    │  system: "Continue in same language, 2-3  │
    │           words only, no punctuation"     │
    │  user: <text-before-cursor>               │
    │  max_tokens: 10, stop: ["\n", ". ", "! "] │
    └───────────────────────────────────────────┘
         │
         ▼ (content.ts — response callback)
[onPredictResponse(seq, suggestion)]
    • if seq !== currentRequestSeq → DISCARD
    • if suggestion empty → DISCARD
    • renderGhost(element, suggestion)
         │
    ┌────┴──────────────────────────────────────┐
    │  <input>/<textarea>:                       │
    │    absolutely-positioned overlay div       │
    │    positioned at end of field text         │
    │    (mirror-div pixel measurement)          │
    │  contenteditable:                          │
    │    inline <span contenteditable="false">   │
    │    appended after last text node           │
    └───────────────────────────────────────────┘

Ghost showing:
    Tab/Enter → execCommand('insertText', false, suggestion)
    Esc       → removeGhostOverlay()
    focusout  → removeGhostOverlay() (PRED-06)
    input     → removeGhostOverlay() + reschedule
```

### Recommended Project Structure

No new directories needed. All changes live in existing files:

```
src/
├── content.ts          # Ghost state, render/clear, keydown extensions, debounce
├── background.ts       # New 'predict' message case + predictText() function
├── providers/
│   ├── prompt.ts       # New buildPredictionPrompt() function
│   ├── openai.ts       # New predict() method on OpenAIProvider
│   ├── gemini.ts       # New predict() method on GeminiProvider
│   └── openrouter.ts   # New predict() method on OpenRouterProvider
└── types.ts            # New PredictMessage type; extend MessageType union
```

### Pattern 1: Caret-at-End Detection

**What:** Determine whether the user's caret is at the end of the field's text content before
showing or refreshing a ghost suggestion (D-04).

**When to use:** Every time a prediction could be triggered or shown.

```typescript
// Source: MDN HTMLInputElement.selectionStart [CITED: developer.mozilla.org]
function isCaretAtEnd(element: HTMLElement): boolean {
  const tag = element.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') {
    const el = element as HTMLInputElement | HTMLTextAreaElement;
    // selectionStart === selectionEnd means no range selection
    return el.selectionStart === el.selectionEnd &&
           el.selectionStart === el.value.length;
  }
  if (element.isContentEditable) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    // collapsed range at end of the element's last text node
    if (!range.collapsed) return false;
    const lastChild = element.lastChild;
    if (!lastChild) return true; // empty element
    if (lastChild.nodeType === Node.TEXT_NODE) {
      return range.endContainer === lastChild &&
             range.endOffset === (lastChild as Text).length;
    }
    // For nested structure: check if selection is at end of element
    const endRange = document.createRange();
    endRange.selectNodeContents(element);
    endRange.collapse(false);
    return range.compareBoundaryPoints(Range.END_TO_END, endRange) === 0;
  }
  return false;
}
```

### Pattern 2: Mirror-Div Caret Pixel Measurement for input/textarea

**What:** Measure the pixel X offset of the end-of-text inside an `<input>` or `<textarea>` to
position the ghost overlay at the correct horizontal position.

**When to use:** When rendering the ghost overlay for `<input>`/`<textarea>` (D-05).

The key CSS properties that must be copied from the source element to the mirror div are:
`font-family`, `font-size`, `font-weight`, `font-style`, `font-variant`, `letter-spacing`,
`word-spacing`, `line-height`, `text-indent`, `text-transform`, `padding-top`, `padding-right`,
`padding-bottom`, `padding-left`, `border-top-width`, `border-right-width`,
`border-bottom-width`, `border-left-width`, `box-sizing`, and `overflow-x`.

```typescript
// Source: component/textarea-caret-position algorithm (CITED: github.com/component/textarea-caret-position)
// Inline implementation — do not import the npm package into a classic content script
const MIRROR_PROPS: Array<keyof CSSStyleDeclaration> = [
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
  'letterSpacing', 'wordSpacing', 'lineHeight', 'textIndent',
  'textTransform', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'boxSizing', 'overflowX',
];

function getTextEndX(element: HTMLInputElement | HTMLTextAreaElement): number {
  const mirror = document.createElement('div');
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  const cs = window.getComputedStyle(element);
  for (const prop of MIRROR_PROPS) {
    (mirror.style as any)[prop] = cs[prop];
  }
  // For single-line inputs, prevent wrapping
  if (element.tagName.toLowerCase() === 'input') {
    mirror.style.whiteSpace = 'pre';
  }
  // Set width to match the element
  mirror.style.width = cs.width;
  const text = document.createTextNode(element.value);
  const cursor = document.createElement('span');
  cursor.textContent = '​'; // zero-width space to measure end position
  mirror.appendChild(text);
  mirror.appendChild(cursor);
  document.body.appendChild(mirror);
  const x = cursor.offsetLeft;
  document.body.removeChild(mirror);
  return x;
}
```

### Pattern 3: Ghost Overlay Rendering for input/textarea

**What:** Create and position the absolutely-positioned ghost text div after the user's typed text.

**When to use:** After a prediction response arrives and caret is confirmed at end (D-05).

```typescript
// Source: adapted from v1.0 showLoadingOverlay pattern in content.ts [VERIFIED: codebase]
const GHOST_OVERLAY_ID = 'hime-ghost-overlay';

function renderGhostOverlay(element: HTMLInputElement | HTMLTextAreaElement, suggestion: string): void {
  removeGhostOverlay(); // clear any previous
  const cs = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const textEndX = getTextEndX(element);

  const overlay = document.createElement('div');
  overlay.id = GHOST_OVERLAY_ID;
  overlay.textContent = suggestion;
  overlay.style.cssText = [
    'position: absolute',
    'pointer-events: none',
    `font-family: ${cs.fontFamily}`,
    `font-size: ${cs.fontSize}`,
    `font-weight: ${cs.fontWeight}`,
    `line-height: ${cs.lineHeight}`,
    'color: rgba(120,120,120,0.6)',
    'z-index: 2147483647',
    'white-space: pre',
    'overflow: hidden',
    `top: ${rect.top + window.scrollY + parseFloat(cs.paddingTop)}px`,
    `left: ${rect.left + window.scrollX + parseFloat(cs.paddingLeft) + textEndX}px`,
  ].join(';');
  document.body.appendChild(overlay);
}

function removeGhostOverlay(): void {
  document.getElementById(GHOST_OVERLAY_ID)?.remove();
}
```

### Pattern 4: Ghost Span for contenteditable

**What:** Insert a non-editable ghost span after the current caret position in a contenteditable.

**When to use:** After a prediction response arrives and caret is confirmed at end in contenteditable (D-05).

```typescript
// Source: MDN Selection/Range API [CITED: developer.mozilla.org]
const GHOST_SPAN_CLASS = 'hime-ghost-span';

function renderGhostSpan(element: HTMLElement, suggestion: string): void {
  removeGhostSpan(); // clear any previous
  const span = document.createElement('span');
  span.className = GHOST_SPAN_CLASS;
  span.contentEditable = 'false';
  span.textContent = suggestion;
  span.style.cssText = 'color:rgba(120,120,120,0.6);pointer-events:none;user-select:none;';
  // Append after last text node / at current cursor position
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(false); // collapse to end
    range.insertNode(span);
    // Move caret back to before the ghost span so typing supersedes it
    range.setStartBefore(span);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    element.appendChild(span);
  }
}

function removeGhostSpan(): void {
  document.querySelectorAll('.' + GHOST_SPAN_CLASS).forEach(el => el.remove());
}
```

### Pattern 5: Request Sequence / AbortController Race Guard

**What:** Ensures only the most-recently-requested prediction response is rendered; stale responses
from previous keystrokes are discarded.

**When to use:** Every prediction request (D-10).

```typescript
// Source: AbortController pattern [CITED: developer.mozilla.org/en-US/docs/Web/API/AbortController]
let currentRequestSeq = 0;
let currentAbortController: AbortController | null = null;

async function requestPrediction(element: HTMLElement): Promise<void> {
  // Abort any in-flight request
  currentAbortController?.abort();
  currentAbortController = new AbortController();
  const seq = ++currentRequestSeq;

  const text = getTextBeforeCursor(element);
  if (!text || text.trim().length < 3) return; // min chars gate

  try {
    const suggestion = await sendPredictMessage(text, currentAbortController.signal);
    if (seq !== currentRequestSeq) return; // stale — discard
    if (!suggestion?.trim()) return;
    renderGhost(element, suggestion);
  } catch (err) {
    if ((err as any)?.name === 'AbortError') return; // expected — not an error
    // Silent failure per D-10 — no badge, no indicator
  }
}
```

### Pattern 6: Prediction Prompt

**What:** A minimal system prompt that instructs the model to continue the user's text in the same
language with exactly 2-3 words, with no additional formatting or explanation.

**When to use:** In `buildPredictionPrompt()` in `providers/prompt.ts` (Claude's discretion area).

```typescript
// [ASSUMED] — prompt structure based on training knowledge of completion tasks
// Verify behavior in testing
export function buildPredictionPrompt(): string {
  return [
    'You are an inline text completion engine.',
    'Continue the text with 2 to 3 words only.',
    'Match the exact language and register of the input.',
    'Output ONLY the continuation words — no explanation, no punctuation at the start, no quotes.',
    'If the text ends mid-word, complete that word as one of your words.',
  ].join('\n');
}

// API call parameters:
// max_tokens: 10   (2-3 words is typically 4-8 tokens; 10 gives buffer)
// stop: ["\n", "。", "！", "？"]  (stop on newline or sentence-ending punctuation)
// temperature: default (don't set it — gpt-5 models reject non-default temperature)
```

### Pattern 7: Debounce (Auto Mode)

**What:** Delay prediction firing until the user pauses typing for `debounceMs` milliseconds.

**When to use:** Auto mode code path (D-02).

```typescript
// Source: Standard clearTimeout/setTimeout debounce pattern [VERIFIED: TypeScript standard library]
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEFAULT_DEBOUNCE_MS = 400;
const DEFAULT_MIN_CHARS = 3;

function schedulePrediction(element: HTMLElement, mode: 'manual' | 'auto'): void {
  if (mode === 'manual') {
    void requestPrediction(element);
    return;
  }
  // Auto mode
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  const text = getTextBeforeCursor(element);
  if (!text || text.trim().length < DEFAULT_MIN_CHARS) return;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void requestPrediction(element);
  }, DEFAULT_DEBOUNCE_MS);
}
```

### Pattern 8: New Background Message Type

**What:** Add a `predict` message type to the background handler, parallel to the existing
`translate` type.

**When to use:** `background.ts` message handler (PRED-04).

```typescript
// Source: adapted from existing translateText() in background.ts [VERIFIED: codebase]
case 'predict': {
  const predictMsg = message as PredictMessage;
  const s = await getSettings();
  try {
    const result = await predictText(predictMsg.payload.text);
    sendResponse({ suggestion: result.text });
  } catch (err) {
    // Silent per D-10 — respond with empty, not error badge
    sendResponse({ suggestion: '' });
  }
  break;
}
```

### Anti-Patterns to Avoid

- **Mutating `element.value` or `element.innerText` directly for ghost text:** Corrupts undo
  history and triggers site `input` event listeners. Use overlay/span only.
- **Second `keydown` listener:** The codebase has one capture-phase listener; adding a second
  creates ordering ambiguity. Add Tab/Enter/Esc/Ctrl+Space to the existing listener block.
- **Using `chrome.commands` for Ctrl+Space:** Inconsistent with the v1.0 rationale; reserved-key
  conflicts. Keep all hotkeys in the in-page capture-phase listener.
- **Relying on `himeLoading` dataset alone for suppression:** Check both `composeState.isActive`
  AND the presence of the loading overlay (`element.dataset.himeLoading`) per D-07.
- **Showing ghost text when caret is not at end:** Even with D-04 in place, the overlay rendering
  must re-confirm caret position because the position can change between request and response.
- **Not aborting the in-flight request on field blur:** The blur handler must call both
  `removeGhostOverlay()` AND `currentAbortController?.abort()` to avoid a late response
  rendering into the wrong field after refocus.
- **Appending ghost span without removing it on `input` events:** The `input` event on
  contenteditable fires before `keydown` in some browsers; listen for both to ensure removal.
- **ESM import/export in content.ts:** content.js is loaded as a classic script; any
  `import`/`export` at top level breaks loading. All prediction code must follow the existing
  non-module style. [VERIFIED: codebase comment and content.ts line 1-5]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Undo-safe text insertion into native inputs | Direct `element.value =` assignment | `document.execCommand('insertText', false, text)` | Assignment bypasses the browser's undo stack; no standard alternative exists for native inputs [CITED: github.com/mdn/content/issues/40245] |
| HTTP request cancellation | Manual "cancelled" flag checked in `.then()` | `AbortController` + `signal` passed to `fetch()` | AbortController cancels the network request itself, saving API costs; flag-only approach wastes tokens on stale completions |
| Language detection | Regex heuristics per script | `chrome.i18n.detectLanguage()` (available in content scripts) OR prompt-only continuation | Chrome's CLD is accurate, free, and zero-bundle-size; for 2-3 word completion the prompt-only approach is sufficient and avoids a round-trip |
| Debounce | npm `lodash.debounce` | Inline `clearTimeout/setTimeout` (3 lines) | Adding lodash to a content script is disproportionate for a 3-line pattern |

**Key insight:** The ghost-text DOM problem looks like it needs a library but is solvable with
inline mirror-div code (~30 lines) and native Selection/Range APIs. The only non-standard piece
is `execCommand('insertText')`, which is deprecated but irreplaceable.

---

## Common Pitfalls

### Pitfall 1: Ctrl+Space Conflicts on Target Systems

**What goes wrong:** `Ctrl+Space` clears formatting in Google Docs (but Google Docs is a canvas
editor — already excluded by `isCanvasEditor()`). More seriously, `Ctrl+Space` is the **IME
toggle** in CJK input methods on Linux (fcitx, ibus) and some Windows configurations. For users
who type CJK characters — exactly hime's target audience — this binding can interfere with their
system IME activation. [VERIFIED: WebSearch — Ctrl+Space used by fcitx on Linux for IME toggle,
and by Google Docs for clear-formatting]

**Why it happens:** System-level IME hotkeys are registered at the OS level and may consume
Ctrl+Space before the browser receives it. In-page `keydown` capture-phase listeners cannot
intercept OS-level key captures.

**How to avoid:** Document the conflict prominently. The Phase 5 default Ctrl+Space is reasonable
for English-primary users and non-CJK systems. Phase 7 makes it configurable. Consider
`Alt+Space` or `Ctrl+/` as documented alternatives for CJK users. Since Google Docs is already
excluded, the web-app Ctrl+Space conflict (clear formatting) is moot for this extension. The IME
conflict on Linux/Windows CJK systems is the real risk.

**Warning signs:** User reports that trigger key "doesn't fire" on CJK-configured systems.

### Pitfall 2: Ghost Span Corrupting contenteditable Undo History

**What goes wrong:** Inserting a DOM span for ghost text via `range.insertNode()` is recorded in
the browser's undo history for the contenteditable element. If the user presses Ctrl+Z they may
undo the ghost span insertion rather than their own typed characters.

**Why it happens:** `insertNode` is a DOM mutation; contenteditable browsers include DOM
mutations in their undo buffer.

**How to avoid:** Insert the ghost span using `document.execCommand('insertHTML', false, spanHtml)`
on Chrome (which does NOT add a separate undo entry in most implementations), OR insert the span
directly into the DOM but immediately call a no-op `execCommand` to "join" the undo record. The
safest approach: use `MutationObserver` to detect when the span is typed over rather than relying
on DOM undo, and always remove via a direct `element.remove()` (not execCommand) on dismiss.

**Warning signs:** Ctrl+Z undoes the ghost span visible, leaving ghost text as committed text.

### Pitfall 3: Stale Overlay After Field Re-focus

**What goes wrong:** User focuses field A, prediction fires (seq=1). User clicks away to field B.
The in-flight request for A resolves. Since the blur handler removed the ghost and reset seq, the
response arrives after `currentRequestSeq` was reset — the stale check passes if seq happens
to match the new field's counter.

**Why it happens:** The sequence counter is per-content-script, not per-element. If two fields are
rapidly focused, the sequence for field A might match field B's counter.

**How to avoid:** Include the `element` reference in the closure check, not just the sequence
number. The stale guard should be: `if (seq !== currentRequestSeq || element !== currentElement)
return;` Track `currentElement` alongside `currentRequestSeq`.

**Warning signs:** Ghost text appears in a different field than where the user is typing.

### Pitfall 4: Tab Key Hijack on Non-suggestion Scenario

**What goes wrong:** Tab is handled in the keydown listener to accept suggestions. If the ghost
is not showing, Tab must pass through to native behavior (focus move). Unconditionally calling
`event.preventDefault()` on Tab breaks keyboard navigation across the page.

**Why it happens:** The accept-key handler runs before the "is ghost showing?" check.

**How to avoid:** Gate every `preventDefault()` call on ghost visibility:
```typescript
if (event.key === 'Tab' && ghostElement !== null) {
  event.preventDefault();
  event.stopPropagation();
  acceptGhost();
}
// else: fall through to native Tab behavior
```
`ghostElement` is `null` when no ghost is showing.

**Warning signs:** Tab no longer moves focus between form fields on any page.

### Pitfall 5: Enter Key Submitting Forms Instead of Accepting

**What goes wrong:** Enter in a single-line `<input>` inside a `<form>` triggers form submission
before the keydown listener can accept the ghost suggestion.

**Why it happens:** The capture-phase listener runs before default behavior, so `preventDefault`
can prevent form submission — but only if the listener fires before the browser's built-in submit
behavior. In practice, capture phase works. The risk is accidental `stopPropagation()` on Enter in
a textarea where Enter should insert a newline.

**How to avoid:** Only `preventDefault()` Enter when a ghost is showing AND the element is a
single-line `<input>`. For `<textarea>` and `contenteditable`, Enter with a ghost showing should
accept AND allow normal newline behavior — or prefer Tab-only accept to avoid this ambiguity
entirely. CONTEXT.md says "Tab (or Enter)" — document that Enter accept only applies to
single-line inputs where form submission is the default Enter behavior.

**Warning signs:** Form submission fires when user tries to accept a suggestion.

### Pitfall 6: getComputedStyle Returns "normal" for line-height When Unset

**What goes wrong:** `getComputedStyle(element).lineHeight` can return the string `"normal"` for
the mirror-div copy. Passing `"normal"` as the `line-height` value for the ghost overlay causes
incorrect vertical alignment.

**Why it happens:** Some sites don't set an explicit line-height on inputs, leaving it browser-default "normal".

**How to avoid:** When `lineHeight === 'normal'`, compute a fallback: `parseFloat(fontSize) * 1.2`.

**Warning signs:** Ghost text appears vertically misaligned relative to the cursor line.

### Pitfall 7: execCommand('insertText') Deprecated Status

**What goes wrong:** Fear that `execCommand` will be removed, breaking accept behavior.

**Why it happens:** MDN marks it deprecated.

**Reality:** execCommand('insertText') is the **only** browser API that inserts text into native
`<input>`/`<textarea>` and preserves the undo stack. There is no standardized alternative. The
W3C editing community explicitly acknowledges this gap. Chrome has not indicated any timeline
for removal. This extension already relies on it in v1.0 (see `setElementText`). Continue using
it; monitor Chrome release notes. [CITED: github.com/mdn/content/issues/40245]

---

## Code Examples

### Getting text before cursor (all field types)

```typescript
// Source: MDN HTMLInputElement.selectionStart + Selection API [CITED: developer.mozilla.org]
function getTextBeforeCursor(element: HTMLElement): string {
  const tag = element.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') {
    const el = element as HTMLInputElement | HTMLTextAreaElement;
    const pos = el.selectionStart ?? el.value.length;
    return el.value.slice(0, pos);
  }
  if (element.isContentEditable) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return element.innerText || '';
    const range = sel.getRangeAt(0).cloneRange();
    range.setStart(element, 0);
    return range.toString();
  }
  return '';
}
```

### Accepting a ghost suggestion (insert at caret)

```typescript
// Source: existing setElementText pattern in content.ts [VERIFIED: codebase]
// Key difference from setElementText: insert AT caret, not replace all
function acceptGhost(element: HTMLElement, suggestion: string): void {
  removeGhost(element);
  element.focus();
  // execCommand inserts at current selection point (caret)
  document.execCommand('insertText', false, suggestion);
  // After insertion, caret is at end of inserted text — correct behavior
}
```

### Suppression check (D-07)

```typescript
// Source: CONTEXT.md D-07, D-08 [CITED: 05-CONTEXT.md]
function isPredictionSuppressed(element: HTMLElement): boolean {
  // Suppress during compose mode
  if (composeState.isActive) return true;
  // Suppress while a translation loading overlay is showing for this element
  if (element.dataset.himeLoading) return true;
  return false;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `chrome.commands` for all hotkeys | In-page capture-phase keydown | v1.0 (Phase 4) | No reserved-key conflicts; add prediction keys to same listener |
| `AbortController` only for timeout | `AbortController` for both timeout AND stale-request cancellation | Best practice | Two controllers per request: one for timeout, one for supersession |
| `document.execCommand` for full replace | `document.execCommand('insertText')` at caret for accept | v1.0 baseline established | Insert at caret, not full-replace; cursor lands after inserted text |

**Deprecated/outdated:**
- `document.execCommand` (all commands except `insertText`, `insertHTML`): Removed or non-functional in many browsers. `insertText` remains the **only** viable undo-safe insertion API for native inputs. [CITED: developer.mozilla.org/en-US/docs/Web/API/Document/execCommand]

---

## Ctrl+Space Conflict Analysis

| Context | Does Ctrl+Space conflict? | Severity | Notes |
|---------|--------------------------|----------|-------|
| Google Docs | Yes (clear formatting) | **None for hime** — Google Docs is a canvas editor, already excluded by `isCanvasEditor()` | [VERIFIED: Google Docs keyboard shortcuts docs] |
| Linux CJK (fcitx/ibus) | Yes (IME toggle) | **HIGH** — OS-level capture may prevent the browser from seeing Ctrl+Space at all | [VERIFIED: WebSearch — fcitx uses Ctrl+Space as IME toggle] |
| Windows CJK IME | Possibly (varies by IME) | **MEDIUM** — some Windows CJK IMEs use Ctrl+Space | [ASSUMED — not directly verified per-IME] |
| Gmail | No known conflict | Low | |
| Notion | No known conflict | Low | Notion uses Ctrl+/ for shortcuts, not Ctrl+Space |
| Slack | No known conflict | Low | |
| Standard textarea sites | No conflict | None | |

**Recommendation:** Proceed with Ctrl+Space as default. The target user (hime's primary use case
is Japanese input on an English system) likely has CJK IME configured — document the conflict and
recommend remapping in Phase 7. `Alt+Space` is a cleaner default for CJK users but `Alt+Space`
is also captured by Windows for window management. `Ctrl+/` is a safe universal fallback to
document.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Prediction prompt structure (buildPredictionPrompt content) | Pattern 6 | Wrong wording → model returns full sentences, markdown, or refuses; fix with prompt iteration |
| A2 | Windows CJK IMEs use Ctrl+Space | Conflict Analysis | Some IMEs may not; real conflict narrower than stated |
| A3 | `document.execCommand('insertHTML', false, ...)` does NOT add a separate undo entry for the ghost span in contenteditable | Pitfall 2 | If wrong, ghost span removal on dismiss leaves undo artifacts; mitigation: test and fall back to direct DOM insertion with MutationObserver guard |
| A4 | max_tokens=10 is sufficient headroom for 2-3 words across all languages | Pattern 6 | CJK languages tokenize differently — 2-3 CJK words may be 4-6 tokens (likely fine within 10), but verify |

**Non-assumed claims (verified or cited):**
- execCommand('insertText') is the only undo-safe insertion API for native inputs [CITED]
- textarea-caret npm package version 3.1.0, last published 2022-06-27 [VERIFIED: npm registry]
- chrome.i18n.detectLanguage is available in content scripts [VERIFIED: Chrome i18n API docs]
- Ctrl+Space = IME toggle on Linux fcitx [VERIFIED: WebSearch]
- Ctrl+Space = clear formatting in Google Docs [VERIFIED: Google Docs keyboard shortcuts]
- selectionStart/selectionEnd for caret-at-end detection [CITED: MDN]
- AbortController for stale fetch cancellation [CITED: MDN]

---

## Open Questions

1. **max_tokens for CJK completion**
   - What we know: 2-3 English words = ~4-7 tokens; `max_tokens: 10` gives buffer
   - What's unclear: CJK words may tokenize to 1-2 tokens each (denser); 10 may be too few
     or too many (more tokens = more latency)
   - Recommendation: Use `max_tokens: 8` as a starting point; test with Japanese/Chinese text;
     bump to 12 if truncation observed

2. **gpt-5-nano / gpt-5-mini response to temperature restriction**
   - What we know: The `openai.ts` comment says gpt-5 models reject non-default temperature;
     the provider omits the temperature param
   - What's unclear: Whether prediction calls need any temperature guidance
   - Recommendation: Omit temperature (same as translation calls) and rely on stop sequences
     for brevity control

3. **Whether to use the same configured model or a lighter one for prediction**
   - What we know: CONTEXT.md leaves this as Claude's discretion; prediction fires more often
     than translation (potentially on every keystroke in auto mode)
   - Recommendation: Use the same configured model (no extra configuration; the user has already
     chosen their cost/quality tradeoff). Document in Phase 7 as a configurable option.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 5 is a TypeScript/DOM code change. All external dependencies are
Chrome built-in APIs (already verified in v1.0) and the existing AI provider APIs (already
configured by the user).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node:test`) |
| Config file | none — invoked via `npm test` → `tsc && node --test 'test/**/*.mjs'` |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRED-01 | Debounce fires after ~400ms pause, manual fires immediately | unit | `npm test` (test/unit.mjs) | ❌ Wave 0 |
| PRED-02 | `execCommand('insertText')` inserts at caret, moves cursor to end | unit (logic only — DOM mock) | `npm test` | ❌ Wave 0 |
| PRED-03 | Esc dismisses ghost without altering content | unit (state machine) | `npm test` | ❌ Wave 0 |
| PRED-04 | predict message routed through background to provider | unit (message contract) | `npm test` | ❌ Wave 0 |
| PRED-05 | Typing after ghost shown clears ghost and reschedules | unit (event sequence) | `npm test` | ❌ Wave 0 |
| PRED-06 | blur/focusout removes ghost overlay | unit (event → state) | `npm test` | ❌ Wave 0 |
| LANG-01 | `isValidInputElement` correctly excludes password/readonly/hidden/disabled | unit | `npm test` | ✅ (existing) |
| LANG-02 | Prediction prompt contains no target-language instruction | unit (prompt builder) | `npm test` | ❌ Wave 0 |
| PRED-04 (race) | Stale response (seq mismatch) is discarded | unit (sequence guard) | `npm test` | ❌ Wave 0 |
| PRED-04 (abort) | AbortController abort on supersession — no ghost rendered | unit (abort error path) | `npm test` | ❌ Wave 0 |

Note: Content script DOM operations (overlay rendering, span insertion) cannot be fully unit-tested
without a browser DOM. Test the logic and state-machine aspects; accept that overlay pixel
alignment requires manual browser testing.

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** `npm test` green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `test/unit.mjs` — add prediction state-machine tests (ghost lifecycle, seq guard, debounce
  logic, buildPredictionPrompt content, caret-at-end detection algorithm)
- [ ] No framework install needed — existing Node.js test runner

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | Text-before-cursor is passed to the API but is user's own content; no injection surface. Truncate to max ~500 chars before sending to avoid runaway token cost |
| V6 Cryptography | no | — |

**Specific risks:**
- **Token cost amplification:** Auto mode can fire a request on every debounce expiry. A site that
  programmatically spams `input` events could trigger many requests. Mitigation: the min-chars
  gate (≥3) and debounce (400ms) bound the rate; AbortController cancels superseded requests
  before the network layer if a new request arrives during the same debounce window.
- **Ghost text XSS:** The suggestion from the API is set as `textContent` (not `innerHTML`), so
  HTML in the response is rendered as literal text, not executed. [VERIFIED: code patterns above]

---

## Sources

### Primary (HIGH confidence)

- Existing `src/content.ts` — `setElementText`, `showLoadingOverlay`, `isValidInputElement`,
  keydown listener structure [VERIFIED: codebase inspection]
- Existing `src/background.ts` — message handler pattern, provider dispatch [VERIFIED: codebase]
- Existing `src/providers/` — provider abstraction shape; `TranslationProvider` interface
  [VERIFIED: codebase]
- MDN `HTMLInputElement.selectionStart` — caret-at-end technique [CITED: developer.mozilla.org]
- MDN `AbortController` — stale request cancellation [CITED: developer.mozilla.org]
- MDN `document.execCommand` — deprecation status and no-viable-alternative note
  [CITED: developer.mozilla.org]
- Chrome Extensions i18n API docs — `chrome.i18n.detectLanguage` available in content scripts
  [CITED: developer.chrome.com/docs/extensions/reference/api/i18n]
- npm registry `textarea-caret` — version 3.1.0, published 2022-06-27 [VERIFIED: npm view]

### Secondary (MEDIUM confidence)

- github.com/mdn/content/issues/40245 — confirms execCommand insertText has no viable
  alternative for undo-safe insertion in native inputs [CITED]
- component/textarea-caret-position GitHub README — mirror-div algorithm and CSS property list
  [CITED: github.com/component/textarea-caret-position]
- Google Docs keyboard shortcuts help — Ctrl+Space = clear formatting [CITED: support.google.com]
- WebSearch (fcitx Linux IME) — Ctrl+Space = IME toggle on Linux CJK systems [VERIFIED: multiple sources]

### Tertiary (LOW confidence / ASSUMED)

- Prediction prompt wording — trained knowledge, not verified against provider docs; marked ASSUMED
- Windows CJK IME Ctrl+Space behavior — general knowledge, not per-IME verified; marked ASSUMED
- `execCommand('insertHTML')` not adding undo entry for ghost span — needs browser testing

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all core APIs are browser built-ins already in use in codebase
- Architecture: HIGH — extends existing patterns directly; no new architectural decisions
- Ghost rendering technique (overlay): HIGH — getBoundingClientRect + scrollY already in codebase
- Ghost rendering technique (mirror-div pixel measurement): MEDIUM — well-established pattern, inline impl needed
- Pitfalls: HIGH — Ctrl+Space/IME conflict is a real documented issue; others are standard async patterns
- Prompt engineering: MEDIUM — structure is standard but exact wording needs iteration in testing

**Research date:** 2026-05-30
**Valid until:** 2026-06-30 (stable APIs; re-verify if Chrome ships breaking MV3 changes)
