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
let testStatusDiv: HTMLDivElement;

// Current settings
let currentSettings: Settings = { ...DEFAULT_SETTINGS };

// Load settings from storage
async function loadSettings(): Promise<void> {
  const result = await chrome.storage.local.get(['himeSettings']);
  currentSettings = { ...DEFAULT_SETTINGS, ...result.himeSettings };
  populateForm();
  await updateModelOptions();
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
async function updateModelOptions(): Promise<void> {
  const provider = providerSelect.value as keyof typeof PROVIDER_MODELS;

  if (provider === 'openrouter') {
    // D-01: Fetch models dynamically from OpenRouter API
    modelSelect.innerHTML = '<option value="">Loading models...</option>';
    modelSelect.disabled = true;
    try {
      const apiKey = apiKeyInput.value;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      const response = await fetch('https://openrouter.ai/api/v1/models', { headers });
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }
      const data = await response.json();
      const models: { id: string; name: string }[] = (data.data || [])
        .sort((a: { id: string }, b: { id: string }) => (a.id as string).localeCompare(b.id as string));
      modelSelect.innerHTML = '';
      if (models.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No models available';
        modelSelect.appendChild(option);
      } else {
        models.forEach((m) => {
          const option = document.createElement('option');
          option.value = m.id;
          option.textContent = m.id;
          modelSelect.appendChild(option);
        });
      }
      // Restore selection if valid
      const modelIds = models.map(m => m.id);
      if (modelIds.includes(currentSettings.model)) {
        modelSelect.value = currentSettings.model;
      } else if (models.length > 0) {
        currentSettings.model = models[0].id;
        modelSelect.value = models[0].id;
      }
    } catch (err) {
      modelSelect.innerHTML = '';
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Failed to load models';
      modelSelect.appendChild(option);
      showStatus(`Could not fetch OpenRouter models: ${err instanceof Error ? err.message : 'unknown error'}`, 'error');
    } finally {
      modelSelect.disabled = false;
    }
    return;
  }

  // Static model list for openai/gemini (existing logic)
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
  } else if (models.length > 0) {
    currentSettings.model = models[0] as string;
    modelSelect.value = models[0] as string;
  }
}

// Save settings to storage
async function saveSettings(): Promise<void> {
  const newSettings: Settings = {
    provider: providerSelect.value as 'openai' | 'gemini' | 'openrouter',
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
    showStatus('Please enter an API key first', 'error', testStatusDiv);
    return;
  }

  showStatus('Testing connection...', 'info', testStatusDiv);
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
    } else if (provider === 'openrouter') {
      response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });
    } else {
      throw new Error('Unknown provider');
    }
    
    if (response.ok) {
      showStatus('Connection successful!', 'success', testStatusDiv);
    } else {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      showStatus(`Connection failed: ${error.error?.message || response.statusText}`, 'error', testStatusDiv);
    }
  } catch (error) {
    showStatus(`Connection error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error', testStatusDiv);
  } finally {
    testConnectionBtn.disabled = false;
  }
}

// Show status message
function showStatus(message: string, type: 'success' | 'error' | 'info', target: HTMLDivElement = statusDiv): void {
  target.textContent = message;
  target.className = `status ${type}`;
  target.style.display = 'block';

  if (type === 'success' || type === 'info') {
    setTimeout(() => {
      target.style.display = 'none';
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
  testStatusDiv = document.getElementById('testStatus') as HTMLDivElement;
  
  // Event listeners
  providerSelect.addEventListener('change', updateModelOptions);
  testConnectionBtn.addEventListener('click', testConnection);
  saveBtn.addEventListener('click', saveSettings);
  
  // Load settings
  loadSettings();
});
