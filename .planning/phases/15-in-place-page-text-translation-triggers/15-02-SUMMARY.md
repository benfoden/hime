---
phase: 15-in-place-page-text-translation-triggers
plan: 02
subsystem: api
tags: [chrome-mv3, service-worker, byok, context-menu, popup, page-translation, key-injection-guard, session-storage]

# Dependency graph
requires:
  - phase: 15-01 (pure page-walk core)
    provides: buildPageBatchPrompt/parsePageBatchReply (page-batch prompt + key-injection-guarded parse), TranslatePageBatchMessage/Response types, STORAGE_PAGE_STATE session key
  - phase: v1.2 (translated search, phases 8-11)
    provides: translateBatch worker case (BYOK key-from-storage, 8s Promise.race AbortError, recordUsage, classifyError) cloned here
  - phase: 14 (image translation)
    provides: ensureContextMenus()/onClicked FLATTEN pattern; hime-open-panel context-menu + sidePanel gesture precedent
provides:
  - "src/background.ts — translatePageBatch worker case (BYOK batched page translation, key only from storage) + hime-translate-page context-menu item + onClicked dispatch"
  - "src/popup.ts — translatePageAction gesture (translatePage vs togglePage) + origin-checked state-mirror label from chrome.storage.session"
  - "src/popup.html — Translate page button"
affects: [15-03, content.ts-translatePage-receiver, content.ts-translatePageBatch-sender, popup-state-mirror]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Worker-case clone doctrine: translatePageBatch mirrors the shipped translateBatch case verbatim (key from s.apiKeys[s.provider] only, 8s synthetic AbortError race, recordUsage) but swaps in the plain-string page-batch prompt/parse"
    - "Context-menu FLATTEN by context-partitioning (A6 option b): three top-level items kept flat by mutually-exclusive contexts arrays rather than accepting a 'hime' submenu"
    - "Global session state-mirror is origin-checked before relabeling: popup compares STORAGE_PAGE_STATE.origin against the active tab's origin (D-01) so a never-translated tab never shows a stale 'Show original'"

key-files:
  created: []
  modified:
    - src/background.ts
    - src/popup.ts
    - src/popup.html

key-decisions:
  - "FLATTEN resolved via context-partitioning (option b): the image item stays contexts:['image'], the existing non-image item and the new hime-translate-page item use disjoint context arrays so all three stay top-level — no 'hime' submenu introduced"
  - "Popup origin-check guards the GLOBAL session mirror: if mirror.origin !== active tab origin (or mirror/url absent), the label falls back to 'Translate page' (D-01, T-15-15)"
  - "translatePageAction chooses togglePage when the (origin-matched) mirror state is translated/original-shown, else translatePage — same gesture-first sender shape as openImagePanel"

patterns-established:
  - "Pattern: BYOK page-batch worker case — key never accepted from the message/payload, only s.apiKeys[s.provider]; parse via parsePageBatchReply(result.text, inputKeys) (T-15-04, T-15-05)"
  - "Pattern: every tabs.sendMessage to an arbitrary tab is .catch-guarded so restricted/content-script-less tabs no-op (T-15-06)"

requirements-completed: [PAGE-04, TRIG-01]

# Metrics
duration: ~15min
completed: 2026-06-22
---

# Phase 15 Plan 02: Background Worker + Manual Triggers Summary

**A BYOK-batched `translatePageBatch` worker case (key sourced only from storage) plus the two manual triggers — a context-partitioned 'Translate page' right-click item and an origin-checked, state-mirrored popup button — that dispatch translatePage/togglePage to the active tab.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-06-22 (approx)
- **Completed:** 2026-06-22
- **Tasks:** 4 (3 code + 1 human-verify checkpoint)
- **Files modified:** 3 (all pre-existing)

## Accomplishments
- `translatePageBatch` worker case in `background.ts` (line ~715): a verbatim clone of the shipped `translateBatch` handler — `apiKey = s.apiKeys[s.provider]` (BYOK from storage, never from payload), no-key → `{kind:'auth'}`, unknown-provider guard, 8s `Promise.race` synthetic AbortError, `recordUsage`, and `parsePageBatchReply(result.text, inputKeys)` (T-15-05 key-injection guard) — but built on the plain-string page-batch prompt from `page-walk.ts` rather than the `{t,d}` search-batch prompt.
- A third `hime-translate-page` context-menu item registered inside `ensureContextMenus()`, kept top-level via context-partitioning (FLATTEN A6 option b) rather than a submenu, with an `onClicked` branch that dispatches `{type:'translatePage'}` to the active tab under a `.catch` guard (T-15-06 / Pitfall 4).
- A 'Translate page' popup button (`popup.html` `id="translatePage"`) wired to `translatePageAction`, which reads the GLOBAL `STORAGE_PAGE_STATE` session mirror, origin-checks it against the active tab, sends `togglePage` when already translated/original-shown for that origin else `translatePage`, all in a try/catch for restricted tabs, then closes the popup.
- The popup label in `loadSettings()` mirrors page state ('Show original' / 'Show translation') ONLY when the mirror's stored origin matches the active tab's origin (`new URL(tab.url).origin`), else falls back to 'Translate page' (D-01 / T-15-15).

## Task Commits

Each task was committed atomically:

1. **Task 1: translatePageBatch worker case (BYOK batched page translation)** — `8637d71` (feat)
2. **Task 2: 'Translate page' context-menu item + onClicked dispatch** — `ebb6eea` (feat)
3. **Task 3: popup 'Translate page' button with origin-checked state mirror** — `1752adf` (feat)
4. **Task 4: human-verify checkpoint** — manual browser verification, APPROVED by user (live verify passed); no commit

**Plan metadata:** this docs commit (`docs(15-02): complete background worker + triggers plan`)

## Files Created/Modified
- `src/background.ts` (+~84 lines across two commits) — `buildPageBatchPrompt`/`parsePageBatchReply` import, `translatePageBatch` case, `hime-translate-page` context-menu item + extended FLATTEN comment, onClicked dispatch branch
- `src/popup.ts` (+63 lines) — `STORAGE_PAGE_STATE` import, `translatePageBtn` ref + DOMContentLoaded wiring, `translatePageAction`, origin-checked label in `loadSettings()`
- `src/popup.html` (+1 line) — `<button id="translatePage" class="btn-primary">Translate page</button>`

## Decisions Made
- **FLATTEN resolved by context-partitioning (option b), not a submenu.** The image item keeps `contexts:['image']`; the existing non-image item and the new `hime-translate-page` item use disjoint context arrays, so Chrome keeps all three items top-level without auto-nesting them under a "hime" submenu — preserving the existing two items' presentation. The FLATTEN comment was extended to state this 3-item invariant truthfully.
- **The GLOBAL session mirror is origin-checked before any relabel.** `STORAGE_PAGE_STATE` is one record across all tabs (Plan 03 writes `{origin, state}`), so the popup compares `mirror.origin` against the active tab's origin and only relabels on a match; mismatch/absent → default 'Translate page' (D-01).
- **No new key-handling.** The page case reuses the exact storage-read law from `translateBatch`; no `apiKey`/`key` is ever read from the message/payload (T-15-04).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Threat Surface
All four threat-register mitigations for this plan are in place:
- **T-15-04 (Info disclosure, translatePageBatch):** key read only from `s.apiKeys[s.provider]`; never accepted from the message, never echoed in any response.
- **T-15-05 (Tampering, LLM reply parse):** `parsePageBatchReply(result.text, inputKeys)` reused verbatim from Plan 01 (iterates inputKeys only, string-typed).
- **T-15-06 (DoS-self, sendMessage to restricted tab):** every `chrome.tabs.sendMessage` (right-click onClicked + popup action) is `.catch`/try-catch guarded — restricted/content-script-less tabs no-op. Confirmed in Task 4 step 4.
- **T-15-15 (Spoofing, global session mirror):** popup origin-checks the mirror before relabeling — a never-translated tab never shows a stale 'Show original'. Confirmed in Task 4 step 5.

No new threat surface beyond the plan's `<threat_model>`.

## User Setup Required
None - no external service configuration required. No new dependency, permission, or env var.

## Next Phase Readiness
- The worker case + both triggers are live and human-verified. Plan 03's content script consumes them: it sends `translatePageBatch` to this worker case and receives `translatePage`/`togglePage` from these triggers. (Plan 03 + 04 code already committed in this phase; this summary closes the deferred 15-02 documentation.)
- Phase 15 remaining work: phase-end batched human verification (already approved for these triggers), then phase verifier/close.

## Self-Check: PASSED
- `src/background.ts`, `src/popup.ts`, `src/popup.html` — all FOUND
- Commits `8637d71`, `ebb6eea`, `1752adf` — all FOUND in git log
- `case 'translatePageBatch'`, `hime-translate-page` (create + onClicked), `translatePageAction`, `id="translatePage"`, `STORAGE_PAGE_STATE`, origin-check (`new URL`) — all present in committed source

---
*Phase: 15-in-place-page-text-translation-triggers*
*Completed: 2026-06-22*
