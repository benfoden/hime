import type { Message } from './types.js';

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
  return active;
}

// Utility: Check if element is an input field we can work with
function isValidInputElement(element: HTMLElement): boolean {
  const tag = element.tagName.toLowerCase();
  const isInput = tag === 'input' || tag === 'textarea';
  const isContentEditable = element.isContentEditable;
  
  // Skip password fields, hidden fields, readonly fields
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
  } else if (element.isContentEditable) {
    // For contenteditable, select all and replace
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.execCommand('insertText', false, text);
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
          reject(new Error(response.error));
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
  
  try {
    await setBadge('...', '#FFA500');
    const translated = await translateText(textToTranslate);
    
    // Replace the composed text with translation
    const newText = composeState.originalText + translated;
    setElementText(element, newText);
    
    removeComposeIndicator(element);
    composeState = { isActive: false, element: null, originalText: '' };
    await setBadge('');
    
    console.log('hime: Composed text translated');
  } catch (error) {
    console.error('hime: Translation failed', error);
    await setBadge('ERR', '#FF0000');
    setTimeout(() => setBadge('ON', '#4A90D9'), 2000);
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
    return; // Empty field, nothing to do
  }
  
  try {
    await setBadge('...', '#FFA500');
    const translated = await translateText(text);
    setElementText(element, translated);
    await setBadge('');
    console.log('hime: YOLO translation complete');
  } catch (error) {
    console.error('hime: YOLO translation failed', error);
    await setBadge('ERR', '#FF0000');
    setTimeout(() => setBadge(''), 2000);
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

// Listen for Escape key to cancel compose mode
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && composeState.isActive) {
    exitComposeMode();
  }
});

console.log('hime: Content script loaded');
