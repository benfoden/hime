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

// D-05: Loading overlay — dims field to 50% opacity, shows "translating..." label
function showLoadingOverlay(element: HTMLElement): void {
  // Dim the field
  element.style.opacity = '0.5';
  element.dataset.himeLoading = 'true';

  // Create floating overlay label
  const overlay = document.createElement('div');
  overlay.id = 'hime-loading-overlay';
  overlay.textContent = 'translating...';
  overlay.style.cssText = [
    'position: absolute',
    'pointer-events: none',
    'font-family: monospace',
    'font-size: 13px',
    'color: #FFA500',
    'background: rgba(0, 0, 0, 0.7)',
    'padding: 2px 8px',
    'border-radius: 3px',
    'z-index: 2147483647',
    'white-space: nowrap',
  ].join(';');

  // Position over the element
  const rect = element.getBoundingClientRect();
  overlay.style.top = `${rect.top + window.scrollY + 4}px`;
  overlay.style.left = `${rect.left + window.scrollX + 4}px`;

  document.body.appendChild(overlay);
}

// Remove loading overlay and restore opacity
function hideLoadingOverlay(element: HTMLElement): void {
  element.style.opacity = '';
  delete element.dataset.himeLoading;

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
});

// Listen for Escape key to cancel compose mode
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && composeState.isActive) {
    exitComposeMode();
  }
});

// In-page hotkey listener (capture phase so site handlers can't swallow it).
// This is the reliable hotkey path — chrome.commands global shortcuts are
// unreliable (reserved-key conflicts, unassigned defaults), so hotkeys are
// handled here instead of via the manifest "commands" / background onCommand.
//   Ctrl+Y        -> toggle compose mode (enter / convert)
//   Ctrl+Shift+Y  -> YOLO translate the focused field
//   Ctrl+Shift+S  -> swap translation direction (handled in background)
document.addEventListener('keydown', (event) => {
  const ctrl = event.ctrlKey || event.metaKey;
  if (!ctrl || event.altKey) return;
  const key = event.key.toLowerCase();

  // Swap direction works regardless of focus.
  if (event.shiftKey && key === 's') {
    event.preventDefault();
    event.stopPropagation();
    chrome.runtime.sendMessage({ type: 'swapDirection' });
    return;
  }

  // Compose / YOLO only act when a valid input field is focused, so we don't
  // hijack Ctrl+Y (redo) etc. outside text fields.
  const element = getActiveElement();
  if (!element || !isValidInputElement(element)) return;

  if (event.shiftKey && key === 'y') {
    event.preventDefault();
    event.stopPropagation();
    void yoloTranslate();
    return;
  }

  if (!event.shiftKey && key === 'y') {
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
