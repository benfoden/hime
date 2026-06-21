// sidepanel.ts — Browser-only page entry for the hime image-OCR side panel.
//
// IMPORTANT: This file references browser globals (chrome.*, document, window)
// and is intentionally NOT imported by the node test harness. Unit-testable
// logic lives in DOM-agnostic modules: panel-render.ts (rendering) and
// image-resolve.ts (downscale/MIME/confidence math). See the search.ts header
// doctrine + RESEARCH Pitfall 1 / Recommended Project Structure.
//
// Behavior (clone of search.ts, push-driven divergence):
//   1. On open, read the global target language via getSettings (D-03) — used as
//      the fallback "→ Y" side of the "Detected: X → Y" direction line when an
//      entry does not already carry its own resolved target.
//   2. Rebuild the session list from chrome.storage.session (Pitfall 5) so a
//      slept/restarted MV3 worker never blanks the panel — persisted results
//      render on open, newest-first (D-01).
//   3. Register a chrome.runtime.onMessage listener: each worker push of
//      { type:'translateImage', payload:{ entry } } PREPENDs a new entry OR swaps
//      the matching skeleton for its filled result (D-01, via prependEntry).
//   4. Any comms/listener failure renders an explicit error state — never a
//      silent blank (IMG-05 / T-12-17).

import { renderPanel, prependEntry } from './panel-render.js';
import type { ImageEntry, ImageState } from './types.js';

// The durable job map key written by the worker (Plan 05). The value is a
// { [dedupKey]: ImageEntry } map persisted in chrome.storage.session.
const IMAGE_JOBS_KEY = 'himeImageJobs';

// Global target-language display name (D-03). Read once via getSettings; used as
// the direction-line target when an entry doesn't carry its own `target`.
let targetLanguage = 'Japanese';

/**
 * Read the persisted entries from storage.session newest-first. The worker keys
 * the map by dedupKey with no ordering guarantee, so we cannot recover true
 * insertion order from the object alone — render in the map's own key order
 * reversed (most-recently-written keys tend to land last) as a best-effort
 * newest-first. Live pushes thereafter prepend precisely (D-01).
 */
async function loadEntries(): Promise<ImageEntry[]> {
  const stored = await chrome.storage.session.get(IMAGE_JOBS_KEY);
  const map = stored?.[IMAGE_JOBS_KEY] as Record<string, ImageEntry> | undefined;
  if (!map) return [];
  return Object.values(map).reverse();
}

/**
 * Stamp the global target language onto a populated entry that lacks its own
 * resolved target (D-03). The worker already sets entry.target for fresh jobs;
 * this is a defensive fallback so the direction line never renders "→ " blank.
 */
function withTarget(entry: ImageEntry): ImageEntry {
  if (entry.kind === 'populated' && !entry.target) {
    return { ...entry, target: targetLanguage };
  }
  return entry;
}

document.addEventListener('DOMContentLoaded', async () => {
  const mount = document.getElementById('results') as HTMLElement | null;
  if (!mount) {
    // DOM incomplete — bail out gracefully (should never happen in production).
    return;
  }
  const status = document.getElementById('panel-status') as HTMLElement | null;
  const settingsLink = document.getElementById('open-settings') as HTMLElement | null;

  // ── Read settings once for the global target language (D-03) ───────────────
  try {
    const settingsReply = (await chrome.runtime.sendMessage({ type: 'getSettings' })) as
      | { settings?: { targetLanguage?: string } }
      | null;
    if (settingsReply?.settings?.targetLanguage) {
      targetLanguage = settingsReply.settings.targetLanguage;
    }
  } catch {
    // Worker not available — keep the default; the panel degrades gracefully.
  }

  // ── Rebuild the list from storage.session (Pitfall 5 / IMG-05) ─────────────
  try {
    const entries = (await loadEntries()).map(withTarget);
    const state: ImageState = entries.length > 0 ? { kind: 'list', entries } : { kind: 'empty' };
    renderPanel(state, document, mount);
  } catch {
    // Reading durable state failed — show an explicit error, never a blank.
    renderPanel(
      { kind: 'list', entries: [errorEntry('Could not load saved translations.')] },
      document,
      mount,
    );
  }

  // ── Live worker pushes: prepend / swap the matching skeleton (D-01) ────────
  // Also handles openImagePanel scroll-to-entry from the badge-click relay (D-04).
  chrome.runtime.onMessage.addListener((message: unknown) => {
    try {
      const msg = message as { type?: string; payload?: { entry?: ImageEntry; dedupKey?: string } } | null;

      if (msg?.type === 'translateImage') {
        // Standard push: prepend or swap entry in the panel.
        if (!msg.payload?.entry) return;
        if (status) status.textContent = '';
        prependEntry(withTarget(msg.payload.entry), document, mount);
        return;
      }

      if (msg?.type === 'openImagePanel') {
        // D-04 scroll-to-entry: find the row by data-entry-id and scroll into view.
        // The id may contain characters special to CSS selectors — escape them the
        // same way panel-render.ts cssEscape does (replace " and \ with \X).
        const dedupKey = msg.payload?.dedupKey;
        if (!dedupKey) return;
        const escaped = dedupKey.replace(/["\\]/g, '\\$&');
        const row = mount.querySelector(`[data-entry-id="${escaped}"]`);
        if (row) {
          row.scrollIntoView({ block: 'center' });
        }
        // If the row is not present yet (entry not rendered), no-op gracefully —
        // the job may still be in-flight; the entry will prepend when it finishes.
        return;
      }
    } catch {
      // A malformed/unexpected push must not blank the panel — surface an error
      // entry instead of failing silently (IMG-05 / T-12-17).
      prependEntry(errorEntry('A translation update could not be displayed.'), document, mount);
    }
    // Synchronous handler — no response channel kept open.
  });

  // ── Settings nav: open the extension's options page ────────────────────────
  settingsLink?.addEventListener('click', (event) => {
    event.preventDefault();
    try {
      chrome.runtime.openOptionsPage();
    } catch {
      // Options page unavailable — no-op.
    }
  });
});

/** Build a synthetic error entry so a panel-side failure renders explicitly. */
function errorEntry(message: string): ImageEntry {
  return {
    kind: 'error',
    id: `panel-error-${Date.now()}`,
    errorKind: 'unknown',
    message,
  };
}
