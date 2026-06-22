import type { Settings } from './types.js';
import { STORAGE_PAGE_STATE } from './types.js';

// DOM Elements
let sourceLangSpan: HTMLSpanElement;
let targetLangSpan: HTMLSpanElement;
let swapBtn: HTMLButtonElement;
let openOptionsBtn: HTMLButtonElement;
let openSearchBtn: HTMLButtonElement;
let openImagePanelBtn: HTMLButtonElement;
let translatePageBtn: HTMLButtonElement;
let includeImagesCheckbox: HTMLInputElement;

// Shape of the global page-state mirror in chrome.storage.session (D-01). It is a
// SINGLE record across all tabs — Plan 03's content script writes the active page's
// { origin, state } — so the popup MUST origin-check it before relabeling.
interface PageStateMirror {
  origin?: string;
  state?: 'translated' | 'original-shown';
}

// Load settings and update UI
async function loadSettings(): Promise<void> {
  const result = await chrome.storage.local.get(['himeSettings']);
  const settings: Settings = result.himeSettings || {
    sourceLanguage: 'English',
    targetLanguage: 'Japanese',
  };
  
  sourceLangSpan.textContent = settings.sourceLanguage;
  targetLangSpan.textContent = settings.targetLanguage;
  includeImagesCheckbox.checked = settings.includeImages ?? false;

  await refreshTranslatePageLabel();
}

// Mirror the active tab's page state onto the Translate page button label, but
// ONLY when the global session mirror's stored origin matches the active tab's
// origin (D-01 / T-15-15). The mirror is one global record shared across tabs, so
// without this origin check the popup would show "Show original" for a tab that was
// never translated. Any mismatch / missing url / restricted tab → default label.
async function refreshTranslatePageLabel(): Promise<void> {
  translatePageBtn.textContent = 'Translate page';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;
    let activeOrigin: string;
    try {
      activeOrigin = new URL(tab.url).origin;
    } catch {
      return; // unparseable / restricted url (chrome://, etc.) → keep default label
    }
    const mirror = (await chrome.storage.session.get(STORAGE_PAGE_STATE))[
      STORAGE_PAGE_STATE
    ] as PageStateMirror | undefined;
    if (!mirror || mirror.origin !== activeOrigin) return;
    if (mirror.state === 'translated') translatePageBtn.textContent = 'Show original';
    else if (mirror.state === 'original-shown') translatePageBtn.textContent = 'Show translation';
  } catch {
    // storage/tabs query failure → keep the default "Translate page" label.
  }
}

// Dispatch the in-place page-translation gesture to the active tab. Mirrors
// openImagePanel: a popup click is a user gesture. Reads the global page-state
// mirror to decide between a fresh translate (translatePage) and a toggle of an
// already-translated page (togglePage). Wrapped in try/catch so a restricted /
// content-script-less tab (Pitfall 4 / T-15-06) is a graceful no-op.
async function translatePageAction(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) return;
    const mirror = (await chrome.storage.session.get(STORAGE_PAGE_STATE))[
      STORAGE_PAGE_STATE
    ] as PageStateMirror | undefined;
    const alreadyActed =
      mirror?.state === 'translated' || mirror?.state === 'original-shown';
    const msgType = alreadyActed ? 'togglePage' : 'translatePage';
    await chrome.tabs.sendMessage(tab.id, { type: msgType });
    window.close();
  } catch (error) {
    console.error('Failed to dispatch page translation:', error);
  }
}

// Swap language direction
async function swapDirection(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: 'swapDirection' });
    // Reload to show updated direction
    await loadSettings();
  } catch (error) {
    console.error('Failed to swap direction:', error);
  }
}

// Open options page
function openOptions(): void {
  chrome.runtime.openOptionsPage();
}

// Open search page in a new tab
function openSearch(): void {
  chrome.tabs.create({ url: chrome.runtime.getURL('search.html') });
}

// Open the image side panel for the active tab. The popup button click is a user
// gesture, so chrome.sidePanel.open is allowed here — a site-independent way to
// open the panel even when a page suppresses its own right-click menu.
async function openImagePanel(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) {
      await chrome.sidePanel.open({ tabId: tab.id });
      window.close();
    }
  } catch (error) {
    console.error('Failed to open image panel:', error);
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  sourceLangSpan = document.getElementById('sourceLang') as HTMLSpanElement;
  targetLangSpan = document.getElementById('targetLang') as HTMLSpanElement;
  swapBtn = document.getElementById('swapBtn') as HTMLButtonElement;
  openOptionsBtn = document.getElementById('openOptions') as HTMLButtonElement;
  openSearchBtn = document.getElementById('openSearch') as HTMLButtonElement;
  openImagePanelBtn = document.getElementById('openImagePanel') as HTMLButtonElement;
  translatePageBtn = document.getElementById('translatePage') as HTMLButtonElement;
  includeImagesCheckbox = document.getElementById('includeImages') as HTMLInputElement;

  swapBtn.addEventListener('click', swapDirection);
  openOptionsBtn.addEventListener('click', openOptions);
  openSearchBtn.addEventListener('click', openSearch);
  openImagePanelBtn.addEventListener('click', openImagePanel);
  translatePageBtn.addEventListener('click', translatePageAction);
  includeImagesCheckbox.addEventListener('change', async () => {
    const result = await chrome.storage.local.get(['himeSettings']);
    const current: Partial<Settings> = result.himeSettings || {};
    await chrome.storage.local.set({
      himeSettings: { ...current, includeImages: includeImagesCheckbox.checked },
    });
  });

  loadSettings();
});
