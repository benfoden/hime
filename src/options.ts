import { DEFAULT_SETTINGS, PROVIDER_MODELS, OPENROUTER_ALLOWLIST, MODEL_META, SUPPORTED_LANGUAGES, migrateSettings, metaLabel, STORAGE_PROGRESSIVE_ACK, type Settings, type UsageRecord } from './types.js';

// DOM Elements
let providerSelect: HTMLSelectElement;
let apiKeyInput: HTMLInputElement;
let modelSelect: HTMLSelectElement;
let storageModeSelect: HTMLSelectElement;
let sourceLanguageSelect: HTMLSelectElement;
let targetLanguageSelect: HTMLSelectElement;
let swapLanguagesBtn: HTMLButtonElement;
let formalitySelect: HTMLSelectElement;
let customPromptTextarea: HTMLTextAreaElement;
let testConnectionBtn: HTMLButtonElement;
let braveApiKeyInput: HTMLInputElement;
let testBraveKeyBtn: HTMLButtonElement;
let braveTestStatusDiv: HTMLDivElement;
let googleApiKeyInput: HTMLInputElement;
let testVisionKeyBtn: HTMLButtonElement;
let visionTestStatusDiv: HTMLDivElement;
let saveBtn: HTMLButtonElement;
let statusDiv: HTMLDivElement;
let testStatusDiv: HTMLDivElement;
let usageContentDiv: HTMLDivElement;
let resetUsageBtn: HTMLButtonElement;
let predictHotkeyBtn: HTMLButtonElement;
let composeHotkeyBtn: HTMLButtonElement;
let yoloHotkeyBtn: HTMLButtonElement;
let swapHotkeyBtn: HTMLButtonElement;
// Progressive Image Translation elements (Plan 13-02 / PROG-01)
let progressiveToggle: HTMLInputElement;
let progressiveStatusDiv: HTMLDivElement;
let progressiveModal: HTMLDivElement;
let progressiveModalEnableBtn: HTMLButtonElement;
let progressiveModalCancelBtn: HTMLButtonElement;

// Current settings
let currentSettings: Settings = { ...DEFAULT_SETTINGS };

// True while a hotkey-capture button is recording a key combo.
let capturingHotkey = false;

// Keys of Settings that hold a hotkey string.
type HotkeyKey = 'predictHotkey' | 'composeHotkey' | 'yoloHotkey' | 'swapHotkey';

// Format a captured KeyboardEvent into a hotkey string ("Ctrl+Shift+Y").
// Returns null for a pure-modifier press (caller keeps recording). Ctrl/Cmd
// both normalize to "Ctrl" to match content.ts matchesHotkey().
function formatHotkey(event: KeyboardEvent): string | null {
  const k = event.key;
  if (k === 'Control' || k === 'Shift' || k === 'Alt' || k === 'Meta') return null;
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
  if (event.shiftKey) parts.push('Shift');
  if (event.altKey) parts.push('Alt');
  let keyName: string;
  if (k === ' ' || event.code === 'Space') keyName = 'Space';
  else if (k.length === 1) keyName = k.toUpperCase();
  else keyName = k; // Enter, ArrowUp, etc.
  parts.push(keyName);
  return parts.join('+');
}

// Wire a capture button: click → record next combo → write to currentSettings.
// Esc cancels and restores the previous value. A modifier (Ctrl/Shift/Alt) is
// required so a bare key can't hijack normal typing on every page.
function setupHotkeyCapture(btn: HTMLButtonElement, key: HotkeyKey): void {
  btn.addEventListener('click', () => {
    if (capturingHotkey) return;
    capturingHotkey = true;
    const previous = currentSettings[key];
    btn.textContent = 'Press keys…';
    btn.classList.add('capturing');

    const finish = (text: string): void => {
      capturingHotkey = false;
      btn.textContent = text;
      btn.classList.remove('capturing');
      document.removeEventListener('keydown', onKey, true);
    };

    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { finish(previous); return; }
      const formatted = formatHotkey(e);
      if (!formatted) return; // pure modifier — keep waiting
      if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)) {
        btn.textContent = 'Need Ctrl/Shift/Alt…';
        return;
      }
      currentSettings[key] = formatted;
      finish(formatted);
    };

    document.addEventListener('keydown', onKey, true);
  });
}

// Load settings from storage
async function loadSettings(): Promise<void> {
  const result = await chrome.storage.local.get(['himeSettings']);
  currentSettings = migrateSettings(result.himeSettings || {});
  populateForm();
  await updateModelOptions();
}

// Fill a language <select> with SUPPORTED_LANGUAGES, ensuring the currently
// stored value is present (legacy/custom free-text values are injected so they
// are never silently dropped) and selected.
function populateLanguageSelect(select: HTMLSelectElement, current: string): void {
  const options = SUPPORTED_LANGUAGES.includes(current)
    ? [...SUPPORTED_LANGUAGES]
    : [current, ...SUPPORTED_LANGUAGES];
  select.replaceChildren();
  for (const lang of options) {
    const opt = document.createElement('option');
    opt.value = lang;
    opt.textContent = lang;
    select.appendChild(opt);
  }
  select.value = current;
}

// Populate form with current settings
function populateForm(): void {
  providerSelect.value = currentSettings.provider;
  apiKeyInput.value = currentSettings.apiKeys[currentSettings.provider] || '';
  braveApiKeyInput.value = currentSettings.braveApiKey || '';
  googleApiKeyInput.value = currentSettings.googleApiKey || '';
  modelSelect.value = currentSettings.model;
  storageModeSelect.value = currentSettings.storageMode;
  populateLanguageSelect(sourceLanguageSelect, currentSettings.sourceLanguage);
  populateLanguageSelect(targetLanguageSelect, currentSettings.targetLanguage);
  formalitySelect.value = currentSettings.formality;
  customPromptTextarea.value = currentSettings.customPrompt || '';
  predictHotkeyBtn.textContent = currentSettings.predictHotkey;
  composeHotkeyBtn.textContent = currentSettings.composeHotkey;
  yoloHotkeyBtn.textContent = currentSettings.yoloHotkey;
  swapHotkeyBtn.textContent = currentSettings.swapHotkey;
  // PROG-01: reflect persisted toggle state.
  progressiveToggle.checked = currentSettings.progressiveEnabled;
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
    sourceLanguage: sourceLanguageSelect.value,
    targetLanguage: targetLanguageSelect.value,
    formality: formalitySelect.value as 'auto' | 'casual' | 'polite' | 'formal',
    customPrompt: customPromptTextarea.value || undefined,
    predictHotkey: currentSettings.predictHotkey,
    composeHotkey: currentSettings.composeHotkey,
    yoloHotkey: currentSettings.yoloHotkey,
    swapHotkey: currentSettings.swapHotkey,
    // D-03: top-level field (NOT inside apiKeys). Persisted from the Translated Search input.
    braveApiKey: braveApiKeyInput.value,
    // Top-level Google Vision/Translation key (braveApiKey precedent). Persisted
    // from the Image Translation input (VIS-02).
    googleApiKey: googleApiKeyInput.value,
    // PROG-01: persisted from the progressive toggle (D-03 ack gate enforced in change handler).
    progressiveEnabled: progressiveToggle.checked,
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

// Test the Brave Search key. Unlike testConnection (which POSTs the LLM key from
// the page), this routes through the background worker (D-04): the key is saved to
// storage first, then a payload-less testBraveKey message is sent — the key is never
// carried in the message or fetched directly from this page (XLT-01 / T-08-10).
async function testBraveKey(): Promise<void> {
  if (!braveApiKeyInput.value) {
    // SSET-02: "key required" — no worker call when the field is empty.
    showStatus('Brave API key required — enter it first', 'error', braveTestStatusDiv);
    return;
  }

  // Save the Brave key to storage FIRST (partial save merged into currentSettings).
  // On save failure, surface it and do NOT proceed to test against a stale key (Pitfall 5).
  const merged: Settings = { ...currentSettings, braveApiKey: braveApiKeyInput.value };
  try {
    await chrome.storage.local.set({ himeSettings: merged });
    currentSettings = merged;
  } catch (error) {
    showStatus(`Could not save Brave key: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error', braveTestStatusDiv);
    return;
  }

  showStatus('Testing Brave key…', 'info', braveTestStatusDiv);
  testBraveKeyBtn.disabled = true;
  try {
    // No key in the payload — the worker reads it from storage (XLT-01).
    const response = await chrome.runtime.sendMessage({ type: 'testBraveKey' });
    if (response?.ok) {
      showStatus('Brave key valid!', 'success', braveTestStatusDiv);
    } else {
      showStatus(response?.error ?? 'Brave key test failed', 'error', braveTestStatusDiv);
    }
  } catch {
    showStatus('Could not reach background worker', 'error', braveTestStatusDiv);
  } finally {
    testBraveKeyBtn.disabled = false;
  }
}

// Test the Google Cloud Vision key (VIS-02). Like testBraveKey, this routes
// through the background worker (T-12-01): the key is saved to storage first,
// then a payload-less testVisionKey message is sent — the key is never carried
// in the message or fetched from this page. The worker probes the Vision
// endpoint ONLY (translation now runs through the configured LLM provider,
// not this key) — the key needs only Cloud Vision API enabled.
async function testVisionKey(): Promise<void> {
  if (!googleApiKeyInput.value) {
    showStatus('Vision/OCR key required — enter it first', 'error', visionTestStatusDiv);
    return;
  }

  // Save the key to storage FIRST (partial save merged into currentSettings). On
  // save failure, surface it and do NOT test against a stale key.
  const merged: Settings = { ...currentSettings, googleApiKey: googleApiKeyInput.value };
  try {
    await chrome.storage.local.set({ himeSettings: merged });
    currentSettings = merged;
  } catch (error) {
    showStatus(`Could not save Vision key: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error', visionTestStatusDiv);
    return;
  }

  showStatus('Testing Vision key…', 'info', visionTestStatusDiv);
  testVisionKeyBtn.disabled = true;
  try {
    // No key in the payload — the worker reads it from storage (T-12-01).
    const response = await chrome.runtime.sendMessage({ type: 'testVisionKey' });
    if (response?.ok) {
      showStatus('Vision key valid!', 'success', visionTestStatusDiv);
    } else {
      showStatus(response?.error ?? 'Vision key test failed', 'error', visionTestStatusDiv);
    }
  } catch {
    showStatus('Could not reach background worker', 'error', visionTestStatusDiv);
  } finally {
    testVisionKeyBtn.disabled = false;
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

// Wire the progressive toggle + first-enable privacy modal (PROG-01, PROG-05, D-03).
//
// Flow when the user turns the toggle ON:
//   1. Read chrome.storage.local[STORAGE_PROGRESSIVE_ACK].
//   2. If NOT acknowledged → show blocking modal, revert checkbox to OFF.
//      Enable click → set ack, hide modal, re-check toggle, save settings.
//      Cancel click → hide modal, leave toggle OFF.
//   3. If acknowledged → skip modal; save settings immediately.
//
// The "save and propagate live" is achieved by calling saveSettings() on Enable,
// which persists progressiveEnabled:true to himeSettings in storage.local.
// content.ts already watches chrome.storage.onChanged for himeSettings, so the
// change propagates without an extension reload (PROG-01).
function showProgressiveModal(): void {
  progressiveModal.style.display = 'flex';
}

function hideProgressiveModal(): void {
  progressiveModal.style.display = 'none';
}

function setupProgressiveToggle(): void {
  progressiveToggle.addEventListener('change', () => {
    if (!progressiveToggle.checked) {
      // Turning OFF: just save — no modal needed.
      void saveSettings();
      return;
    }

    // Turning ON: check if the user has already acknowledged the privacy warning.
    void chrome.storage.local.get([STORAGE_PROGRESSIVE_ACK]).then((result) => {
      const acked = result[STORAGE_PROGRESSIVE_ACK] === true;
      if (acked) {
        // Already consented — enable immediately.
        void saveSettings();
      } else {
        // First enable: show the blocking privacy modal and revert the toggle until
        // the user explicitly clicks Enable (D-03 / PROG-05 consent requirement).
        progressiveToggle.checked = false;
        showProgressiveModal();
      }
    });
  });

  progressiveModalEnableBtn.addEventListener('click', () => {
    // Persist the one-time acknowledgement to storage.local (D-03).
    void chrome.storage.local.set({ [STORAGE_PROGRESSIVE_ACK]: true }).then(() => {
      hideProgressiveModal();
      // Re-enable the toggle and save settings so the feature activates immediately.
      progressiveToggle.checked = true;
      void saveSettings();
    });
  });

  progressiveModalCancelBtn.addEventListener('click', () => {
    // User declined — hide modal, leave toggle OFF (D-03 decline → stays off).
    hideProgressiveModal();
    progressiveToggle.checked = false;
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Get DOM elements
  providerSelect = document.getElementById('provider') as HTMLSelectElement;
  apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;
  modelSelect = document.getElementById('model') as HTMLSelectElement;
  storageModeSelect = document.getElementById('storageMode') as HTMLSelectElement;
  sourceLanguageSelect = document.getElementById('sourceLanguage') as HTMLSelectElement;
  targetLanguageSelect = document.getElementById('targetLanguage') as HTMLSelectElement;
  swapLanguagesBtn = document.getElementById('swapLanguages') as HTMLButtonElement;
  formalitySelect = document.getElementById('formality') as HTMLSelectElement;
  customPromptTextarea = document.getElementById('customPrompt') as HTMLTextAreaElement;
  testConnectionBtn = document.getElementById('testConnection') as HTMLButtonElement;
  braveApiKeyInput = document.getElementById('braveApiKey') as HTMLInputElement;
  testBraveKeyBtn = document.getElementById('testBraveKey') as HTMLButtonElement;
  braveTestStatusDiv = document.getElementById('braveTestStatus') as HTMLDivElement;
  googleApiKeyInput = document.getElementById('googleApiKey') as HTMLInputElement;
  testVisionKeyBtn = document.getElementById('testVisionKey') as HTMLButtonElement;
  visionTestStatusDiv = document.getElementById('visionTestStatus') as HTMLDivElement;
  saveBtn = document.getElementById('save') as HTMLButtonElement;
  statusDiv = document.getElementById('status') as HTMLDivElement;
  testStatusDiv = document.getElementById('testStatus') as HTMLDivElement;
  usageContentDiv = document.getElementById('usageContent') as HTMLDivElement;
  resetUsageBtn = document.getElementById('resetUsage') as HTMLButtonElement;
  predictHotkeyBtn = document.getElementById('predictHotkey') as HTMLButtonElement;
  composeHotkeyBtn = document.getElementById('composeHotkey') as HTMLButtonElement;
  yoloHotkeyBtn = document.getElementById('yoloHotkey') as HTMLButtonElement;
  swapHotkeyBtn = document.getElementById('swapHotkey') as HTMLButtonElement;
  // Progressive toggle elements (Plan 13-02)
  progressiveToggle = document.getElementById('progressiveEnabled') as HTMLInputElement;
  progressiveStatusDiv = document.getElementById('progressiveStatus') as HTMLDivElement;
  progressiveModal = document.getElementById('progressiveModal') as HTMLDivElement;
  progressiveModalEnableBtn = document.getElementById('progressiveModalEnable') as HTMLButtonElement;
  progressiveModalCancelBtn = document.getElementById('progressiveModalCancel') as HTMLButtonElement;

  setupHotkeyCapture(predictHotkeyBtn, 'predictHotkey');
  setupHotkeyCapture(composeHotkeyBtn, 'composeHotkey');
  setupHotkeyCapture(yoloHotkeyBtn, 'yoloHotkey');
  setupHotkeyCapture(swapHotkeyBtn, 'swapHotkey');
  setupProgressiveToggle();

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
  // Swap the source/target language values in place (each dropdown carries the
  // other's value as an option once populated, so assignment always succeeds).
  swapLanguagesBtn.addEventListener('click', () => {
    const src = sourceLanguageSelect.value;
    const tgt = targetLanguageSelect.value;
    populateLanguageSelect(sourceLanguageSelect, tgt);
    populateLanguageSelect(targetLanguageSelect, src);
  });
  testConnectionBtn.addEventListener('click', testConnection);
  testBraveKeyBtn.addEventListener('click', testBraveKey);
  testVisionKeyBtn.addEventListener('click', testVisionKey);
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
