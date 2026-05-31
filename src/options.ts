import { DEFAULT_SETTINGS, PROVIDER_MODELS, OPENROUTER_ALLOWLIST, MODEL_META, migrateSettings, metaLabel, type Settings, type UsageRecord } from './types.js';

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
let usageContentDiv: HTMLDivElement;
let resetUsageBtn: HTMLButtonElement;

// Current settings
let currentSettings: Settings = { ...DEFAULT_SETTINGS };

// Load settings from storage
async function loadSettings(): Promise<void> {
  const result = await chrome.storage.local.get(['himeSettings']);
  currentSettings = migrateSettings(result.himeSettings || {});
  populateForm();
  await updateModelOptions();
}

// Populate form with current settings
function populateForm(): void {
  providerSelect.value = currentSettings.provider;
  apiKeyInput.value = currentSettings.apiKeys[currentSettings.provider] || '';
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
      const allModels: { id: string; name: string }[] = data.data || [];
      const availableIds = new Set(allModels.map((m: { id: string }) => m.id));

      // Filter to curated allowlist, preserving allowlist order (best first)
      const models = OPENROUTER_ALLOWLIST
        .filter(id => availableIds.has(id))
        .map(id => ({ id, name: id }));

      modelSelect.innerHTML = '';
      if (models.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No compatible models found';
        modelSelect.appendChild(option);
      } else {
        models.forEach((m) => {
          const option = document.createElement('option');
          option.value = m.id;
          option.textContent = metaLabel(m.id);
          modelSelect.appendChild(option);
        });
      }
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
    option.textContent = metaLabel(model);
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
  const provider = providerSelect.value as Settings['provider'];
  const updatedKeys = { ...currentSettings.apiKeys, [provider]: apiKeyInput.value };

  const newSettings: Settings = {
    provider,
    apiKeys: updatedKeys,
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

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function estimateCost(model: string, rec: UsageRecord): number | null {
  const meta = MODEL_META[model];
  if (!meta) return null;
  return (rec.inputTokens * meta.inPrice + rec.outputTokens * meta.outPrice) / 1_000_000;
}

async function loadUsage(): Promise<void> {
  const response = await chrome.runtime.sendMessage({ type: 'getUsage' });
  const usage: Record<string, UsageRecord> = response?.usage || {};
  const models = Object.keys(usage);

  if (models.length === 0) {
    usageContentDiv.innerHTML = '<p class="help-text">No usage data yet.</p>';
    return;
  }

  let totalIn = 0, totalOut = 0, totalReqs = 0, totalCost = 0;
  let hasCost = false;

  const rows = models.map(model => {
    const r = usage[model];
    totalIn += r.inputTokens;
    totalOut += r.outputTokens;
    totalReqs += r.requests;
    const cost = estimateCost(model, r);
    if (cost !== null) { totalCost += cost; hasCost = true; }
    const costCell = cost !== null ? `$${cost.toFixed(4)}` : '—';
    return `<tr>
      <td>${model}</td>
      <td class="num">${formatNumber(r.requests)}</td>
      <td class="num">${formatNumber(r.inputTokens)}</td>
      <td class="num">${formatNumber(r.outputTokens)}</td>
      <td class="num">${costCell}</td>
    </tr>`;
  }).join('');

  usageContentDiv.innerHTML = `<table class="usage-table">
    <thead><tr>
      <th>Model</th><th>Requests</th><th>Input tokens</th><th>Output tokens</th><th>Est. cost</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>
      <td>Total</td>
      <td class="num">${formatNumber(totalReqs)}</td>
      <td class="num">${formatNumber(totalIn)}</td>
      <td class="num">${formatNumber(totalOut)}</td>
      <td class="num">${hasCost ? '$' + totalCost.toFixed(4) : '—'}</td>
    </tr></tfoot>
  </table>`;
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
  usageContentDiv = document.getElementById('usageContent') as HTMLDivElement;
  resetUsageBtn = document.getElementById('resetUsage') as HTMLButtonElement;

  // Event listeners
  providerSelect.addEventListener('change', () => {
    // Save current key before switching, load new provider's key
    const prev = currentSettings.provider;
    const currentKey = apiKeyInput.value;
    if (currentKey) {
      currentSettings.apiKeys[prev] = currentKey;
    }
    currentSettings.provider = providerSelect.value as Settings['provider'];
    apiKeyInput.value = currentSettings.apiKeys[currentSettings.provider] || '';
    updateModelOptions();
  });
  testConnectionBtn.addEventListener('click', testConnection);
  saveBtn.addEventListener('click', saveSettings);
  resetUsageBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'resetUsage' });
    await loadUsage();
    showStatus('Usage data reset', 'success');
  });

  // Load settings and usage
  loadSettings();
  loadUsage();
});
