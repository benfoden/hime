// NOTE: no imports/exports in this file. content.js is loaded by the manifest
// content_scripts as a CLASSIC script, not an ES module, so any top-level
// import/export makes tsc emit `export {}` which throws
// "Uncaught SyntaxError: Unexpected token 'export'" and the whole content
// script fails to load. Keep Message defined locally here.
type Message = { type: string; payload?: unknown };

// Compose mode state
let composeState: {
  isActive: boolean;
  element: HTMLElement | null;
  originalText: string;
} = {
  isActive: false,
  element: null,
  originalText: '',
};

// ---------------------------------------------------------------------------
// Prediction engine state and helpers (Phase 05-02)
// ---------------------------------------------------------------------------

// Ghost-text inline prediction shelved while v1.1 is paused (helm decision 2026-06-02).
// Flag gates the only live entrypoint (the manual predict hotkey); the engine code is
// left intact so the feature can be re-enabled by flipping this back to true.
const PREDICT_ENABLED = false;

// D-01 default: manual trigger only; auto (predict-as-you-type) is opt-in.
// Phase 7 (SET-01/SET-02) will expose this in options and set it from storage.
// Using let (not const) so Phase 7 can update it without a code change.
let PREDICT_TRIGGER_MODE: 'manual' | 'auto' = 'manual';
const DEFAULT_DEBOUNCE_MS = 400;  // D-02 — Phase 7 makes configurable
const DEFAULT_MIN_CHARS = 3;      // D-02 — Phase 7 makes configurable

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

// Caret-at-end detection — D-04: only trigger prediction when caret is at field end.
// Source: MDN HTMLInputElement.selectionStart
function isCaretAtEnd(element: HTMLElement): boolean {
  const tag = element.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') {
    const el = element as HTMLInputElement | HTMLTextAreaElement;
    return el.selectionStart === el.selectionEnd && el.selectionStart === el.value.length;
  }
  if (element.isContentEditable) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return false;
    // Build a range spanning from the caret to the end of the element's contents.
    // The caret is "at the end" when nothing but whitespace follows it. This
    // tolerates the trailing <br>/<div> scaffolding rich editors like Gmail compose
    // insert — the earlier strict compareBoundaryPoints check failed there because
    // the structural end sits after that scaffolding, which the caret never reaches.
    const tail = document.createRange();
    tail.selectNodeContents(element);
    try {
      tail.setStart(range.endContainer, range.endOffset);
    } catch {
      return false; // caret container outside element — treat as not-at-end
    }
    return tail.toString().replace(/\s+/g, '') === '';
  }
  return false;
}

// Get the text before the cursor — returned value is clipped to last 500 chars (T-05-01).
// Source: MDN HTMLInputElement.selectionStart + Selection API
function getTextBeforeCursor(element: HTMLElement): string {
  const tag = element.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') {
    const el = element as HTMLInputElement | HTMLTextAreaElement;
    const pos = el.selectionStart ?? el.value.length;
    return el.value.slice(0, pos).slice(-500);
  }
  if (element.isContentEditable) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return (element.innerText || '').slice(-500);
    const range = sel.getRangeAt(0).cloneRange();
    range.setStart(element, 0);
    return range.toString().slice(-500);
  }
  return '';
}

// Defense-in-depth sanitization before writing ghost text to DOM.
// Server (Plan 01 sanitizeSuggestion) already sanitizes; this is a local guard.
// content.ts is a classic script — cannot import from predict-util.ts.
function sanitizeGhost(raw: string): string {
  if (!raw) return '';
  // Truncate at first newline
  const newlineIdx = raw.indexOf('\n');
  const s = newlineIdx >= 0 ? raw.slice(0, newlineIdx) : raw;
  // Strip C0/C1 control characters
  return s.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
}

// Promise wrapper for chrome.runtime.sendMessage — mirrors translateText pattern (lines 220-240).
// AbortSignal is used client-side: if aborted before resolve, result is discarded.
function sendPredictMessage(text: string, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'predict', payload: { text } } as Message,
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        // Check abort before resolving — the sendMessage itself isn't abortable
        if (signal.aborted) {
          resolve('');
          return;
        }
        resolve(response?.suggestion || '');
      }
    );
  });
}

// ---------------------------------------------------------------------------
// Ghost text rendering — Task 2 (Phase 05-02)
// ---------------------------------------------------------------------------

const GHOST_OVERLAY_ID = 'hime-ghost-overlay';
const GHOST_SPAN_CLASS = 'hime-ghost-span';

// CSS properties copied from source element to mirror div for pixel measurement.
// Source: component/textarea-caret-position algorithm (inline — not imported)
const MIRROR_PROPS: ReadonlyArray<string> = [
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
  'letterSpacing', 'wordSpacing', 'lineHeight', 'textIndent',
  'textTransform', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'boxSizing', 'overflowX',
];

// Mirror-div pixel measurement of the X offset at the end of the text.
// Handles Pitfall 6: if lineHeight === 'normal', fall back to fontSize * 1.2.
// Source: component/textarea-caret-position (inlined — classic script, no import)
function getTextEndX(element: HTMLInputElement | HTMLTextAreaElement): number {
  const cs = window.getComputedStyle(element);
  const mirror = document.createElement('div');
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  for (const prop of MIRROR_PROPS) {
    // Pitfall 6: lineHeight 'normal' → compute from fontSize
    if (prop === 'lineHeight' && cs.lineHeight === 'normal') {
      mirror.style.lineHeight = `${parseFloat(cs.fontSize) * 1.2}px`;
    } else {
      (mirror.style as unknown as Record<string, string>)[prop] = cs[prop as keyof CSSStyleDeclaration] as string;
    }
  }
  // Single-line inputs: prevent wrapping
  if (element.tagName.toLowerCase() === 'input') {
    mirror.style.whiteSpace = 'pre';
  }
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

// Absolutely-positioned ghost overlay for input/textarea.
// Mimics v1.0 showLoadingOverlay positioning: getBoundingClientRect + scrollX/Y.
// textContent only — never innerHTML (T-05-07 XSS guard).
function renderGhostOverlay(element: HTMLInputElement | HTMLTextAreaElement, suggestion: string): void {
  document.getElementById(GHOST_OVERLAY_ID)?.remove(); // clear any previous
  const cs = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const textEndX = getTextEndX(element);

  // Pitfall 6: fallback for lineHeight 'normal'
  const lineHeight = cs.lineHeight === 'normal'
    ? `${parseFloat(cs.fontSize) * 1.2}px`
    : cs.lineHeight;

  const overlay = document.createElement('div');
  overlay.id = GHOST_OVERLAY_ID;
  overlay.textContent = suggestion; // textContent — never innerHTML (T-05-07)
  overlay.style.cssText = [
    'position: absolute',
    'pointer-events: none',
    `font-family: ${cs.fontFamily}`,
    `font-size: ${cs.fontSize}`,
    `font-weight: ${cs.fontWeight}`,
    `line-height: ${lineHeight}`,
    'color: rgba(120,120,120,0.6)',
    'z-index: 2147483647',
    'white-space: pre',
    'overflow: hidden',
    `top: ${rect.top + window.scrollY + parseFloat(cs.paddingTop)}px`,
    `left: ${rect.left + window.scrollX + parseFloat(cs.paddingLeft) + textEndX}px`,
  ].join(';');
  document.body.appendChild(overlay);
}

// Inline ghost span for contenteditable.
// Span is [contenteditable=false] so typing supersedes it naturally.
// Source: MDN Selection/Range API
function renderGhostSpan(element: HTMLElement, suggestion: string): void {
  document.querySelectorAll('.' + GHOST_SPAN_CLASS).forEach(el => el.remove()); // clear previous
  const span = document.createElement('span');
  span.className = GHOST_SPAN_CLASS;
  span.contentEditable = 'false';
  span.textContent = suggestion; // textContent — never innerHTML (T-05-07)
  span.style.cssText = 'color:rgba(120,120,120,0.6);pointer-events:none;user-select:none;';
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(false); // collapse to end
    range.insertNode(span);
    // Move caret back before the ghost span so typing supersedes it (PRED-05)
    range.setStartBefore(span);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    element.appendChild(span);
  }
}

// Dispatch ghost rendering by element type.
function renderGhost(element: HTMLElement, suggestion: string): void {
  const tag = element.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') {
    renderGhostOverlay(element as HTMLInputElement | HTMLTextAreaElement, suggestion);
  } else if (element.isContentEditable) {
    renderGhostSpan(element, suggestion);
  }
  predictionState.suggestion = suggestion;
  predictionState.element = element;
}

// Remove all ghost UI and clear the suggestion state.
function removeGhost(): void {
  document.getElementById(GHOST_OVERLAY_ID)?.remove();
  document.querySelectorAll('.' + GHOST_SPAN_CLASS).forEach(el => el.remove());
  predictionState.suggestion = '';
}

// Accept the current ghost suggestion via undo-safe execCommand (PRED-02, D-06).
// Tab or Enter triggers this; cursor lands after inserted text.
function acceptGhost(element: HTMLElement): void {
  const s = predictionState.suggestion;
  if (!s) return;
  removeGhost();
  element.focus();
  document.execCommand('insertText', false, s);
  // For contenteditable, collapse selection to end after insert
  if (element.isContentEditable) {
    window.getSelection()?.collapseToEnd();
  }
  predictionState.element = null;
}

// Dismiss the ghost without altering committed text (PRED-03, D-09).
function dismissGhost(): void {
  removeGhost();
  predictionState.element = null;
}

// Schedule a prediction request (D-01/D-02: manual fires immediately; auto debounces).
// Source: Pattern 7 from RESEARCH.md
function schedulePrediction(element: HTMLElement, mode: 'manual' | 'auto'): void {
  if (mode === 'manual') {
    void requestPrediction(element);
    return;
  }
  // Auto mode — debounce
  if (predictionState.debounceTimer !== null) {
    clearTimeout(predictionState.debounceTimer);
    predictionState.debounceTimer = null;
  }
  const text = getTextBeforeCursor(element);
  if (!text || text.trim().length < DEFAULT_MIN_CHARS) return;
  predictionState.debounceTimer = setTimeout(() => {
    predictionState.debounceTimer = null;
    void requestPrediction(element);
  }, DEFAULT_DEBOUNCE_MS);
}

// Race-guarded prediction request — Pattern 5 from RESEARCH.md.
// Increments requestSeq; any response with a different seq is stale and discarded.
// Element guard (Pitfall 3): seq alone can collide across fields — check element too.
async function requestPrediction(element: HTMLElement): Promise<void> {
  // D-07: suppress during compose mode or while a loading overlay is showing
  if (composeState.isActive) return;
  if ((element as HTMLElement & { dataset: DOMStringMap }).dataset.himeLoading) return;

  if (!isValidInputElement(element)) return;
  if (!isCaretAtEnd(element)) return;

  const text = getTextBeforeCursor(element);
  if (!text || text.trim().length < DEFAULT_MIN_CHARS) return;

  // Abort any in-flight request for this or a previous element
  predictionState.abortController?.abort();
  predictionState.abortController = new AbortController();

  const seq = ++predictionState.requestSeq;
  predictionState.element = element;

  try {
    const suggestion = await sendPredictMessage(text, predictionState.abortController.signal);
    // Stale guard: seq or element mismatch → discard (Pitfall 3, D-10)
    if (seq !== predictionState.requestSeq || element !== predictionState.element) return;
    const clean = sanitizeGhost(suggestion);
    if (!clean) return;
    renderGhost(element, clean);
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') return; // expected — not an error
    // All other errors are silent per D-10 (no badge, no indicator)
  }
}

// ---------------------------------------------------------------------------
// CSS for compose mode indicator
const COMPOSE_BORDER_STYLE = '2px solid #4A90D9';
const COMPOSE_BORDER_RADIUS = '3px';

// Utility: Get the active/focused element
function getActiveElement(): HTMLElement | null {
  const active = document.activeElement as HTMLElement;
  if (!active || active === document.body) return null;
  // D-01: one-level shadow root traversal (open roots only)
  if (active.shadowRoot && active.shadowRoot.activeElement) {
    return active.shadowRoot.activeElement as HTMLElement;
  }
  return active;
}

// D-03/D-04: Feature-detect canvas-based editors (e.g. Google Docs).
// Heuristic: the focused element is a contenteditable with no meaningful
// textContent AND a sibling/ancestor canvas element is rendering the actual doc.
function isCanvasEditor(element: HTMLElement): boolean {
  // Check if element is inside a container with a canvas that occupies the viewport
  const parent = element.closest('.kix-appview-editor') as HTMLElement
    || element.closest('[role="textbox"]')?.closest('[data-canvas]') as HTMLElement;
  // Broader heuristic: nearby canvas sibling with large dimensions
  const container = element.parentElement;
  if (container) {
    const canvas = container.querySelector('canvas');
    if (canvas && canvas.width > 200 && canvas.height > 200) {
      return true;
    }
  }
  // Walk up a few levels to find canvas siblings (Google Docs structure)
  let walk: HTMLElement | null = element;
  for (let i = 0; i < 5 && walk; i++) {
    walk = walk.parentElement;
    if (walk) {
      const canvas = walk.querySelector(':scope > canvas');
      if (canvas && (canvas as HTMLCanvasElement).width > 200 && (canvas as HTMLCanvasElement).height > 200) {
        return true;
      }
    }
  }
  return false;
}

// Utility: Check if element is an input field we can work with
function isValidInputElement(element: HTMLElement): boolean {
  // D-03/D-04: Detect canvas-based editors (Google Docs) via feature detection.
  // Google Docs renders into a canvas element and uses a hidden contenteditable
  // as a key-event sink — there are no real text nodes to manipulate.
  if (isCanvasEditor(element)) {
    console.log('hime: Unsupported editor (canvas-based rendering). hime does not support this editor.');
    return false;
  }

  const tag = element.tagName.toLowerCase();
  const isInput = tag === 'input' || tag === 'textarea';
  const isContentEditable = element.isContentEditable;

  if (isInput) {
    const inputEl = element as HTMLInputElement;
    if (inputEl.type === 'password') return false;
    if (inputEl.disabled) return false;
    if (inputEl.readOnly) return false;
    if (inputEl.hidden) return false;
  }

  return isInput || isContentEditable;
}

// Utility: Get text from element
function getElementText(element: HTMLElement): string {
  const tag = element.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') {
    return (element as HTMLInputElement | HTMLTextAreaElement).value;
  }
  if (element.isContentEditable) {
    return element.innerText || '';
  }
  return '';
}

// Utility: Set text in element (with undo support via execCommand)
function setElementText(element: HTMLElement, text: string): void {
  const tag = element.tagName.toLowerCase();

  // Focus the element first
  element.focus();

  if (tag === 'input' || tag === 'textarea') {
    const inputEl = element as HTMLInputElement | HTMLTextAreaElement;
    // Select all text
    inputEl.select();
    // Use execCommand for undo-compatible replacement
    document.execCommand('insertText', false, text);
    // D-08: Ensure cursor is at end of inserted text
    inputEl.selectionStart = inputEl.selectionEnd = text.length;
  } else if (element.isContentEditable) {
    // For contenteditable, select all and replace
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.execCommand('insertText', false, text);
    // D-08: Ensure cursor is at end of inserted text
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      sel.collapseToEnd();
    }
  }
}

// Apply compose mode indicator
function applyComposeIndicator(element: HTMLElement): void {
  element.style.border = COMPOSE_BORDER_STYLE;
  element.style.borderRadius = COMPOSE_BORDER_RADIUS;
  element.dataset.himeCompose = 'true';
}

// Remove compose mode indicator
function removeComposeIndicator(element: HTMLElement): void {
  element.style.border = '';
  element.style.borderRadius = '';
  delete element.dataset.himeCompose;
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerInterval: ReturnType<typeof setInterval> | null = null;

function showLoadingOverlay(element: HTMLElement): void {
  element.style.opacity = '0.5';
  element.dataset.himeLoading = 'true';

  const overlay = document.createElement('div');
  overlay.id = 'hime-loading-overlay';
  overlay.style.cssText = [
    'position: absolute',
    'pointer-events: none',
    'font-family: monospace',
    'font-size: 11px',
    'color: #FFA500',
    'background: rgba(0, 0, 0, 0.7)',
    'padding: 1px 6px',
    'border-radius: 3px',
    'z-index: 2147483647',
    'white-space: nowrap',
  ].join(';');

  let frame = 0;
  overlay.textContent = SPINNER_FRAMES[0];
  spinnerInterval = setInterval(() => {
    frame = (frame + 1) % SPINNER_FRAMES.length;
    overlay.textContent = SPINNER_FRAMES[frame];
  }, 80);

  const rect = element.getBoundingClientRect();
  overlay.style.top = `${rect.top + window.scrollY + 4}px`;
  overlay.style.left = `${rect.left + window.scrollX + 4}px`;

  document.body.appendChild(overlay);
}

function hideLoadingOverlay(element: HTMLElement): void {
  element.style.opacity = '';
  delete element.dataset.himeLoading;

  if (spinnerInterval) {
    clearInterval(spinnerInterval);
    spinnerInterval = null;
  }

  const overlay = document.getElementById('hime-loading-overlay');
  if (overlay) {
    overlay.remove();
  }
}

// Update extension badge
async function setBadge(text: string, color?: string): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: 'setBadge',
      payload: { text, color },
    });
  } catch (error) {
    console.error('Failed to set badge:', error);
  }
}

// Map error kind to badge text and color
function badgeForKind(kind?: string): { text: string; color: string } {
  switch (kind) {
    case 'auth':       return { text: 'KEY',  color: '#FF0000' };
    case 'credits':    return { text: '$$$',  color: '#FF0000' };
    case 'rate_limit': return { text: 'RATE', color: '#FF8C00' };
    case 'network':    return { text: 'NET',  color: '#FF0000' };
    default:           return { text: 'ERR',  color: '#FF0000' };
  }
}

// Translate text via background script
async function translateText(text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: 'translate',
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
          resolve(response?.translatedText || '');
        }
      }
    );
  });
}

// Enter compose mode
async function enterComposeMode(): Promise<void> {
  const element = getActiveElement();
  if (!element || !isValidInputElement(element)) {
    console.log('hime: No valid input element focused');
    return;
  }
  
  composeState = {
    isActive: true,
    element,
    originalText: getElementText(element),
  };
  
  applyComposeIndicator(element);
  await setBadge('ON', '#4A90D9');
  
  console.log('hime: Entered compose mode');
}

// Exit compose mode (cancel without translating)
function exitComposeMode(): void {
  if (composeState.element) {
    removeComposeIndicator(composeState.element);
  }
  composeState = { isActive: false, element: null, originalText: '' };
  setBadge('');
  console.log('hime: Exited compose mode (cancelled)');
}

// Convert compose mode (translate and exit)
async function convertComposeMode(): Promise<void> {
  if (!composeState.isActive || !composeState.element) {
    return;
  }
  
  const element = composeState.element;
  const currentText = getElementText(element);
  
  // Get the text that was typed during compose mode
  // (everything after the original text, or just the new content)
  let textToTranslate = currentText;
  if (currentText.startsWith(composeState.originalText)) {
    textToTranslate = currentText.slice(composeState.originalText.length).trim();
  }
  
  if (!textToTranslate) {
    exitComposeMode();
    return;
  }
  
  const snapshot = getElementText(element);
  try {
    showLoadingOverlay(element);
    await setBadge('...', '#FFA500');
    const translated = await translateText(textToTranslate);

    hideLoadingOverlay(element);
    // Replace the composed text with translation
    const newText = composeState.originalText + translated;
    setElementText(element, newText);

    removeComposeIndicator(element);
    composeState = { isActive: false, element: null, originalText: '' };
    await setBadge('');

    console.log('hime: Composed text translated');
  } catch (error) {
    hideLoadingOverlay(element);
    setElementText(element, snapshot);
    const b = badgeForKind((error as any)?.kind);
    await setBadge(b.text, b.color);
    removeComposeIndicator(element);
    composeState = { isActive: false, element: null, originalText: '' };
    console.error('hime: compose translation failed', { kind: (error as any)?.kind, message: (error as any)?.message });
  }
}

// YOLO translate (translate entire field)
async function yoloTranslate(): Promise<void> {
  const element = getActiveElement();
  if (!element || !isValidInputElement(element)) {
    console.log('hime: No valid input element focused');
    return;
  }

  const text = getElementText(element);
  if (!text.trim()) {
    return;
  }

  const snapshot = text;
  try {
    showLoadingOverlay(element);
    await setBadge('...', '#FFA500');
    const translated = await translateText(text);
    hideLoadingOverlay(element);
    setElementText(element, translated);
    await setBadge('');
    console.log('hime: YOLO translation complete');
  } catch (error) {
    hideLoadingOverlay(element);
    setElementText(element, snapshot);
    const b = badgeForKind((error as any)?.kind);
    await setBadge(b.text, b.color);
    console.error('hime: YOLO translation failed', { kind: (error as any)?.kind, message: (error as any)?.message });
  }
}

// Handle focus change (cancel compose if focus leaves)
function handleFocusChange(): void {
  if (composeState.isActive) {
    const activeElement = getActiveElement();
    if (activeElement !== composeState.element) {
      exitComposeMode();
    }
  }
}

// Message handler from background script
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'toggleCompose': {
          if (composeState.isActive) {
            await convertComposeMode();
          } else {
            await enterComposeMode();
          }
          sendResponse({ success: true });
          break;
        }
        
        case 'yoloTranslate': {
          await yoloTranslate();
          sendResponse({ success: true });
          break;
        }
        
        case 'directionSwapped': {
          // Update UI if needed when direction is swapped
          sendResponse({ success: true });
          break;
        }
        
        default:
          sendResponse({ error: 'Unknown message type' });
      }
    } catch (error) {
      sendResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  })();
  
  return true; // Keep channel open for async
});

// Listen for focus changes
document.addEventListener('focusin', handleFocusChange);
document.addEventListener('focusout', () => {
  // Delay check to allow focusin to fire on the new target first
  setTimeout(handleFocusChange, 0);
  // PRED-06: clear ghost on blur + abort any in-flight prediction.
  // Do this immediately (not deferred) so a late response can't render into the wrong field.
  removeGhost();
  predictionState.abortController?.abort();
  predictionState.abortController = null;
  predictionState.suggestion = '';
  predictionState.element = null;
  if (predictionState.debounceTimer !== null) {
    clearTimeout(predictionState.debounceTimer);
    predictionState.debounceTimer = null;
  }
});

// Listen for Escape key — ghost dismiss takes precedence over compose cancel (D-09).
// Ghost showing → Esc dismisses ghost; no ghost + compose active → Esc cancels compose.
// Prediction is suppressed during compose (D-07), so these paths don't collide.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (predictionState.suggestion !== '') {
      // D-09: ghost showing → dismiss ghost first; do NOT cancel compose
      event.preventDefault();
      event.stopPropagation();
      dismissGhost();
    } else if (composeState.isActive) {
      exitComposeMode();
    }
  }
});

// ---------------------------------------------------------------------------
// Configurable hotkeys (SET-03) — read from chrome.storage.local, live-updated.
// content.ts is a classic script and cannot import DEFAULT_SETTINGS, so the
// defaults below mirror types.ts DEFAULT_SETTINGS. They are overwritten by
// stored settings on load and on any chrome.storage change.
// ---------------------------------------------------------------------------
const hotkeyStrings: { predict: string; compose: string; yolo: string; swap: string } = {
  predict: 'Ctrl+/',
  compose: 'Ctrl+Y',
  yolo: 'Ctrl+Shift+Y',
  swap: 'Ctrl+Shift+S',
};

type ParsedHotkey = { ctrl: boolean; shift: boolean; alt: boolean; key: string; code: string | null };

// Parse a hotkey string like "Ctrl+Shift+Y" into modifier flags + key.
// "Ctrl"/"Cmd"/"Meta" all map to ctrl (matched against ctrlKey || metaKey).
// "Space" is matched by event.code (event.key for space is a literal space).
function parseHotkey(str: string): ParsedHotkey | null {
  if (!str) return null;
  const hk: ParsedHotkey = { ctrl: false, shift: false, alt: false, key: '', code: null };
  for (const raw of str.split('+')) {
    const p = raw.trim();
    if (!p) continue;
    const low = p.toLowerCase();
    if (low === 'ctrl' || low === 'control' || low === 'cmd' || low === 'command' || low === 'meta') hk.ctrl = true;
    else if (low === 'shift') hk.shift = true;
    else if (low === 'alt' || low === 'option') hk.alt = true;
    else hk.key = p;
  }
  if (!hk.key) return null;
  if (hk.key.toLowerCase() === 'space') hk.code = 'Space';
  return hk;
}

let parsedHotkeys: { predict: ParsedHotkey | null; compose: ParsedHotkey | null; yolo: ParsedHotkey | null; swap: ParsedHotkey | null } = {
  predict: parseHotkey(hotkeyStrings.predict),
  compose: parseHotkey(hotkeyStrings.compose),
  yolo: parseHotkey(hotkeyStrings.yolo),
  swap: parseHotkey(hotkeyStrings.swap),
};

function reparseHotkeys(): void {
  parsedHotkeys = {
    predict: parseHotkey(hotkeyStrings.predict),
    compose: parseHotkey(hotkeyStrings.compose),
    yolo: parseHotkey(hotkeyStrings.yolo),
    swap: parseHotkey(hotkeyStrings.swap),
  };
}

// Exact-match a KeyboardEvent against a parsed hotkey. Modifiers must match
// exactly (so Ctrl+Y does not also fire for Ctrl+Shift+Y). Ctrl token matches
// ctrlKey OR metaKey (Mac Cmd). Key compared case-insensitively, except Space
// which is matched by event.code.
function matchesHotkey(event: KeyboardEvent, hk: ParsedHotkey | null): boolean {
  if (!hk) return false;
  const ctrl = event.ctrlKey || event.metaKey;
  if (ctrl !== hk.ctrl) return false;
  if (event.shiftKey !== hk.shift) return false;
  if (event.altKey !== hk.alt) return false;
  if (hk.code) return event.code === hk.code;
  return event.key.toLowerCase() === hk.key.toLowerCase();
}

function loadHotkeySettings(): void {
  chrome.storage.local.get(['himeSettings'], (result) => {
    const s = (result.himeSettings || {}) as Record<string, unknown>;
    if (typeof s.predictHotkey === 'string' && s.predictHotkey) hotkeyStrings.predict = s.predictHotkey;
    if (typeof s.composeHotkey === 'string' && s.composeHotkey) hotkeyStrings.compose = s.composeHotkey;
    if (typeof s.yoloHotkey === 'string' && s.yoloHotkey) hotkeyStrings.yolo = s.yoloHotkey;
    if (typeof s.swapHotkey === 'string' && s.swapHotkey) hotkeyStrings.swap = s.swapHotkey;
    reparseHotkeys();
  });
}

loadHotkeySettings();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.himeSettings) loadHotkeySettings();
});

// In-page hotkey listener (capture phase so site handlers can't swallow it).
// This is the reliable hotkey path — chrome.commands global shortcuts are
// unreliable (reserved-key conflicts, unassigned defaults), so hotkeys are
// handled here instead of via the manifest "commands" / background onCommand.
// All four action hotkeys are user-configurable (parsedHotkeys, above):
//   predict       -> trigger prediction (manual mode, D-03); default Ctrl+/
//   compose       -> toggle compose mode (enter / convert); default Ctrl+Y
//   yolo          -> YOLO translate the focused field; default Ctrl+Shift+Y
//   swap          -> swap translation direction (handled in background); default Ctrl+Shift+S
// Fixed (not configurable):
//   Tab / Enter   -> accept ghost suggestion (PRED-02, D-12)
//   Esc           -> dismiss ghost (PRED-03, D-09) — also handled in the non-capture listener
//   typing        -> supersede ghost (PRED-05)
document.addEventListener('keydown', (event) => {
  // --- Ghost accept / dismiss / supersede (NOT ctrl-gated — must come before early-out) ---
  const ghostShowing = predictionState.suggestion !== '';
  const activeEl = getActiveElement();
  if (ghostShowing && activeEl && activeEl === predictionState.element) {
    if (event.key === 'Tab' ||
        (event.key === 'Enter' && activeEl.tagName.toLowerCase() === 'input')) {
      // PRED-02, D-12: Tab accepts any field; Enter only accepts single-line input
      // (Pitfall 4: Tab falls through to native focus-move when no ghost)
      // (Pitfall 5: Enter in textarea/contenteditable is newline — let it pass)
      event.preventDefault();
      event.stopPropagation();
      acceptGhost(activeEl);
      return;
    }
    // Note: Esc is handled in the non-capture keydown listener above for ghost-first precedence.
    // Supersede: any printable character, Backspace, or Delete clears ghost (PRED-05).
    // Modifier chords (Ctrl/Cmd/Alt) are NOT supersede input — they pass through
    // untouched so native shortcuts like Ctrl+Z (undo) work normally. The accepted
    // ghost text is already committed via execCommand('insertText'), which is itself
    // part of the native undo stack, so Ctrl+Z undoes real edits with no special-casing.
    const modifierChord = event.ctrlKey || event.metaKey || event.altKey;
    if (!modifierChord && (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete')) {
      removeGhost();
      if (PREDICT_TRIGGER_MODE === 'auto') {
        schedulePrediction(activeEl, 'auto'); // reschedule after debounce (PRED-05)
      }
      // do NOT preventDefault — let the character commit normally
    }
  }

  // Swap direction works regardless of focus.
  if (matchesHotkey(event, parsedHotkeys.swap)) {
    event.preventDefault();
    event.stopPropagation();
    chrome.runtime.sendMessage({ type: 'swapDirection' });
    return;
  }

  // Compose / YOLO / Predict only act when a valid input field is focused, so we don't
  // hijack the configured keys (e.g. Ctrl+Y redo) outside text fields.
  const element = getActiveElement();
  if (!element || !isValidInputElement(element)) return;

  // Manual prediction trigger (D-03). Default Ctrl+/ — chosen because Ctrl+Space
  // conflicts with the CJK IME toggle on Linux (fcitx/ibus) at the OS level; the
  // OS may capture it before the browser sees it. Key is now user-configurable
  // (SET-03). See 05-RESEARCH.md Pitfall 1 for the full analysis.
  if (PREDICT_ENABLED && matchesHotkey(event, parsedHotkeys.predict)) {
    event.preventDefault();
    event.stopPropagation();
    schedulePrediction(element, 'manual');
    return;
  }

  // YOLO checked before compose: with exact modifier matching the default
  // Ctrl+Shift+Y and Ctrl+Y are disjoint, but order-independence is cheap insurance.
  if (matchesHotkey(event, parsedHotkeys.yolo)) {
    event.preventDefault();
    event.stopPropagation();
    void yoloTranslate();
    return;
  }

  if (matchesHotkey(event, parsedHotkeys.compose)) {
    event.preventDefault();
    event.stopPropagation();
    if (composeState.isActive) {
      void convertComposeMode();
    } else {
      void enterComposeMode();
    }
  }
}, true);

console.log('hime: Content script loaded');
