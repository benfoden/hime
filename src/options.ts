import { DEFAULT_SETTINGS, PROVIDER_MODELS, type Settings } from './types.js';

// DOM Elements
let providerSelect: HTMLSelectElement;
let apiKeyInput: HTMLInputElement;
let modelSelect: HTMLSelectElement;
let storageModeSelect: HTMLSelectElement;
let sourceLanguageInput: HTMLInputElement;
let targetLanguageInput: HTMLInputElement;
let formalitySelect: HTMLSelectElement;
let customPromptTextarea: HTMLTextAreaElement;
let testConnectionBtn: HTMLButtonElement;
let saveBtn: HTMLButtonElement;
let statusDiv: HTMLDivElement;

// Current settings
let currentSettings: Settings = { ...DEFAULT_SETTINGS };

// Load settings from storage
async function loadSettings(): Promise<void> {
  const result = await chrome.storage.local.get(['himeSettings']);
  currentSettings = { ...DEFAULT_SETTINGS, ...result.himeSettings };
  populateForm();
  updateModelOptions();
}

// Populate form with current settings
function populateForm(): void {
  providerSelect.value = currentSettings.provider;
  apiKeyInput.value = currentSettings.apiKey;
  modelSelect.value = currentSettings.model;
  storageModeSelect.value = currentSettings.storageMode;
  sourceLanguageInput.value = currentSettings.sourceLanguage;
  targetLanguageInput.value = currentSettings.targetLanguage;
  formalitySelect.value = currentSettings.formality;
  customPromptTextarea.value = currentSettings.customPrompt || '';
}

// Update model options based on selected provider
function updateModelOptions(): void {
  const provider = providerSelect.value as keyof typeof PROVIDER_MODELS;
  const models = PROVIDER_MODELS[provider] || [];
  
  modelSelect.innerHTML = '';
  models.forEach(model => {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    modelSelect.appendChild(option);
  });
  
  // Restore selection if valid
  const validModels: readonly string[] = models;
  if (validModels.includes(currentSettings.model)) {
    modelSelect.value = currentSettings.model;
  } else {
    currentSettings.model = models[0];
    modelSelect.value = models[0];
  }
}

// Save settings to storage
async function saveSettings(): Promise<void> {
  const newSettings: Settings = {
    provider: providerSelect.value as 'openai' | 'gemini',
    apiKey: apiKeyInput.value,
    model: modelSelect.value,
    storageMode: storageModeSelect.value as 'persistent' | 'session',
    sourceLanguage: sourceLanguageInput.value,
    targetLanguage: targetLanguageInput.value,
    formality: formalitySelect.value as 'auto' | 'casual' | 'polite' | 'formal',
    customPrompt: customPromptTextarea.value || undefined,
    composeHotkey: currentSettings.composeHotkey,
    yoloHotkey: currentSettings.yoloHotkey,
    swapHotkey: currentSettings.swapHotkey,
  };
  
  await chrome.storage.local.set({ himeSettings: newSettings });
  currentSettings = newSettings;
  showStatus('Settings saved!', 'success');
}

// Test API connection
async function testConnection(): Promise<void> {
  const provider = providerSelect.value;
  const apiKey = apiKeyInput.value;
  const model = modelSelect.value;
  
  if (!apiKey) {
    showStatus('Please enter an API key first', 'error');
    return;
  }
  
  showStatus('Testing connection...', 'info');
  testConnectionBtn.disabled = true;
  
  try {
    let response: Response;
    
    if (provider === 'openai') {
      response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });
    } else if (provider === 'gemini') {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      );
    } else {
      throw new Error('Unknown provider');
    }
    
    if (response.ok) {
      showStatus('Connection successful!', 'success');
    } else {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      showStatus(`Connection failed: ${error.error?.message || response.statusText}`, 'error');
    }
  } catch (error) {
    showStatus(`Connection error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
  } finally {
    testConnectionBtn.disabled = false;
  }
}

// Show status message
function showStatus(message: string, type: 'success' | 'error' | 'info'): void {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = 'block';
  
  if (type === 'success' || type === 'info') {
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Get DOM elements
  providerSelect = document.getElementById('provider') as HTMLSelectElement;
  apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;
  modelSelect = document.getElementById('model') as HTMLSelectElement;
  storageModeSelect = document.getElementById('storageMode') as HTMLSelectElement;
  sourceLanguageInput = document.getElementById('sourceLanguage') as HTMLInputElement;
  targetLanguageInput = document.getElementById('targetLanguage') as HTMLInputElement;
  formalitySelect = document.getElementById('formality') as HTMLSelectElement;
  customPromptTextarea = document.getElementById('customPrompt') as HTMLTextAreaElement;
  testConnectionBtn = document.getElementById('testConnection') as HTMLButtonElement;
  saveBtn = document.getElementById('save') as HTMLButtonElement;
  statusDiv = document.getElementById('status') as HTMLDivElement;
  
  // Event listeners
  providerSelect.addEventListener('change', updateModelOptions);
  testConnectionBtn.addEventListener('click', testConnection);
  saveBtn.addEventListener('click', saveSettings);
  
  // Load settings
  loadSettings();
});
