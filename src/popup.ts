import type { Settings } from './types.js';

// DOM Elements
let sourceLangSpan: HTMLSpanElement;
let targetLangSpan: HTMLSpanElement;
let swapBtn: HTMLButtonElement;
let openOptionsBtn: HTMLButtonElement;

// Load settings and update UI
async function loadSettings(): Promise<void> {
  const result = await chrome.storage.local.get(['himeSettings']);
  const settings: Settings = result.himeSettings || {
    sourceLanguage: 'English',
    targetLanguage: 'Japanese',
  };
  
  sourceLangSpan.textContent = settings.sourceLanguage;
  targetLangSpan.textContent = settings.targetLanguage;
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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  sourceLangSpan = document.getElementById('sourceLang') as HTMLSpanElement;
  targetLangSpan = document.getElementById('targetLang') as HTMLSpanElement;
  swapBtn = document.getElementById('swapBtn') as HTMLButtonElement;
  openOptionsBtn = document.getElementById('openOptions') as HTMLButtonElement;
  
  swapBtn.addEventListener('click', swapDirection);
  openOptionsBtn.addEventListener('click', openOptions);
  
  loadSettings();
});
