# Phase 15 Context — In-Place Page-Text Translation + Triggers

**Created:** 2026-06-22
**Phase goal:** A user on a foreign-language page can translate its visible text in place — page's own text swapped for the translation with layout intact — triggered manually or auto-offered when page language differs from target, toggled back to original at will.
**Requirements:** PAGE-01..05, TRIG-01..03

## Domain

Walk the current page's text nodes, translate them through the existing background BYOK LLM pipeline (batched), and swap each in place preserving layout. Static snapshot at trigger time. A control flips original ↔ translation without reload. Two triggers: manual (popup + right-click menu) and an auto-offer banner gated by `<html lang>`.

## Locked guardrails (from REQUIREMENTS.md / PROJECT.md — do NOT revisit)

- **REPLACE-in-place** (not bilingual).
- **STATIC snapshot** only — no MutationObserver / SPA live-translate. Content added to the DOM after trigger is not auto-translated.
- **No new OSS dependency** — own code (TreeWalker + batched pipeline). No inpainting/typesetting libs.
- **Batched BYOK pipeline**, key stays in the background worker — never on the page.
- **Skip non-translatable nodes:** `script`, `style`, `code`/`pre`, `contenteditable`, form inputs/`textarea`. Page interactivity (links, buttons, forms) must stay intact.
- **Same-language pages incur no API spend.** Manual trigger always available regardless of detected language.

## Decisions (this discussion)

### D-01 · Control surface & toggle — in-page floating pill (primary), popup + right-click triggers
- **Manual trigger (TRIG-01):** a "Translate page" button in the existing toolbar **popup** (`popup.html`/`popup.ts` — the toolbar action already opens the popup; reuse it, sits alongside the v1.2 Search entry) **and** a right-click context-menu item "Translate page" (alongside the existing image menu items in `background.ts`).
- **Toggle back / re-apply (PAGE-03):** while a page is translated, show a **small in-page floating pill** (corner) that flips original ↔ translation in one tap. The popup button **mirrors** the current state (shows "Show original" / "Show translation" accordingly). No reload, no re-open required.
- Rejected: toolbar-badge-click toggle (conflicts with the action→popup binding; would need rework).

### D-02 · Auto-offer — top banner, session + per-origin dismissal
- When `<html lang>` base ≠ target base (via the existing `progShouldGateByLanguage` mirrored in `content.ts:975`), show a **slim, dismissible top banner** offering "Translate this page" (TRIG-02/03).
- **Dismissal stickiness:** once dismissed, the banner stays gone for that **origin for the rest of the browser session** (persist a dismissed-origins set in `chrome.storage.session`). Manual trigger remains available after dismiss.
- Unobtrusive + dismissible (TRIG-03). No banner on same-language pages (no spend).

### D-03 · Translatable scope — visible text nodes only
- Translate **visible text nodes only.** Attributes (`alt`, `title`, `placeholder`, `aria-label`) stay in source language for v1.4 — keeps scope/cost minimal, matches the user's go-fast pattern.
- (Attribute translation noted as a deferred idea below.)

### D-04 · Partial-failure — apply successes + dismissible error toast + red badge + retry-failed-sections
- On partial batch failure: **apply all successful translations**, leave failed regions in source text (page stays usable), and surface **one dismissible error toast** + the red error badge (matches v1.3 error-handling spirit / `setBadgeText` ERR pattern).
- The toast offers a **"Retry failed sections"** action that re-batches **only the failed nodes** (not the whole page). Requires tracking which snapshot nodes failed so retry targets just them.

## Canonical refs (downstream agents MUST read)

- `.planning/REQUIREMENTS.md` — v1.4 requirements (PAGE/OVL/TRIG) + scope guardrails. **Locked.**
- `.planning/PROJECT.md` — "Current Milestone: v1.4" block (goal, target features, key context).
- `.planning/research/SOURCES.md` — v1.4 curated dossier: Firefox/Bergamot **TreeWalker replace + tag-alignment**, **translate-tools/domtranslator** reference impl, W3C contrast (overlay phase). Use TreeWalker replace + tag-alignment patterns for in-place node swap.
- `.planning/ROADMAP.md` — Phase 15 details + dependency notes.

## Code context (reusable assets — verified)

- **`src/translate-batch.ts`** — keyed-JSON batch translation helpers (`buildBatchPayload`/`applyBatch`-style, `BatchTranslations = Record<string, BatchItem>`). The batching/keyed-mapping primitive to reuse for page text (map each text node → stable key → batch → map translation back).
- **`src/content.ts`** (1459 lines) — classic-script content script. Already mirrors `progShouldGateByLanguage` / `progNormalizeToBase` (line 975) and reads `document.documentElement.lang` (lines 1426/1451). Holds the in-page DOM conventions, badge-relay messaging, and existing overlay/pill UI patterns to follow.
- **`src/background.ts`** (46KB) — background worker: BYOK translate pipeline, `chrome.contextMenus` create/`onClicked` (existing "Translate image with hime" / "Open hime image panel" at lines 994/1007 — add "Translate page" the same way), badge `setBadgeText`/`setBadgeBackgroundColor`. All network + keys live here.
- **`src/popup.html` / `src/popup.ts`** — toolbar popup (action `default_popup`). Add the "Translate page" button + state-mirroring here, alongside the v1.2 Search entry.
- **`src/progressive-guard.ts`** — canonical `shouldGateByLanguage` (the source the content.ts copy mirrors).
- **`src/types.ts`** (20KB) — message-type contracts; add a `translatePage`-style background message case + page-translate state types here.
- **manifest.json** — permissions already include `activeTab`, `storage`, `scripting`, `contextMenus`, `sidePanel`; action uses `default_popup`. No new permission expected for page-text translation.

## Deferred ideas (note, do not build in 15)

- Translate visible **attributes** (`alt`/`title`/`placeholder`/`aria-label`) — deferred from D-03.
- Bilingual display mode — already milestone-deferred.
- Dynamic / SPA live translation (MutationObserver) — already milestone-deferred.
- Per-site opt-out / auto-translate allowlist — deferred (banner dismissal is session-only).

## Open questions for research/planning

- Best TreeWalker filter + chunking strategy for batching text nodes within a char/token budget (cost vs round-trips); preserve inline-tag boundaries (tag-alignment per the Bergamot/domtranslator refs).
- Original-text restore mechanism for the toggle (WeakMap node→original vs data-attribute) and how it survives the re-apply path.
- Failed-node tracking structure to support D-04 "retry failed sections."
