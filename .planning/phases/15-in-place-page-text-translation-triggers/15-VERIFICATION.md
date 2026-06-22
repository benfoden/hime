---
phase: 15-in-place-page-text-translation-triggers
verified: 2026-06-22T16:16:56Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  note: initial verification
human_uat:
  performed_by: user (live browser)
  result: approved ("looks good — continue")
  covered: [manual triggers, in-place apply + corner-pill toggle, auto-offer banner, partial-failure toast/retry]
---

# Phase 15: In-Place Page-Text Translation + Triggers — Verification Report

**Phase Goal:** A user on a foreign-language page can translate its visible text in place — the page's own text swapped for the translation with layout intact — triggered manually or auto-offered when page language differs from target, toggled back to original at will.
**Verified:** 2026-06-22T16:16:56Z
**Status:** PASSED
**Re-verification:** No — initial verification
**Live UAT:** Human-confirmed (full feature approved in live browser). This report is the codebase-level goal-backward check.

## Goal Achievement

### Requirement Coverage (PAGE-01..05, TRIG-01..03)

| Req | Status | Evidence |
| --- | --- | --- |
| **PAGE-01** — translate visible text in place, layout preserved | ✓ PASS | `pageApplyChunk` (content.ts:1559) writes `node.nodeValue = value` (line 1578) — text-node value swap only, DOM structure/styling untouched → layout preserved. Dispatch via `pageTranslate` (1602). |
| **PAGE-02** — skip non-translatable nodes, interactivity intact | ✓ PASS | `pageCollectTextNodes` (content.ts:1482) uses `createTreeWalker` whose `acceptNode` walks the ancestor chain rejecting any `PAGE_SKIP_TAGS` element (SCRIPT/STYLE/NOSCRIPT/CODE/PRE/TEXTAREA/TITLE/TEMPLATE/SVG/MATH/HEAD) and any `isContentEditable` ancestor (lines 1491-1492). Form inputs carry no child text nodes. Only `nodeValue` is mutated, so links/buttons/form handlers stay attached. Canonical predicate set verified in page-walk.ts:16-37, test-covered. |
| **PAGE-03** — toggle back to original + re-apply, no reload | ✓ PASS | Once-only original capture into `pageStore` WeakMap on first apply (content.ts:1572-1573, guarded by `!pageStore.has`); `pageApplyState` (1683) flips each node in the strong `pageTranslatedNodes` array between `rec.original` and `rec.translated` via nodeValue. Driven by the corner pill click (1734) and the `togglePage` message (1976). Pure once-only guard `captureOriginal` test-covered (page-walk.mjs round-trip test passes). |
| **PAGE-04** — batched through background BYOK pipeline, key never on page | ✓ PASS | `pageChunkByBudget` groups nodes under `PAGE_CHUNK_MAX_CHARS=4000` (page-walk.ts:73,86); content sends `translatePageBatch` per chunk under a concurrency cap of 2 (content.ts:1608,1621). Worker case (background.ts:715) reads key ONLY from `s.apiKeys[s.provider]` (line 724) — `TranslatePageBatchMessage.payload` is `{items, config}` with NO key field (types.ts:350-356). Batched (not one-call-per-node) confirmed by chunk loop. |
| **PAGE-05** — static snapshot, dynamically-added content not auto-translated | ✓ PASS | `pageCollectTextNodes` is a single one-shot TreeWalk (content.ts:1482-1503); `pageTranslate` snapshots `nodes ?? pageCollectTextNodes()` once (1603). No MutationObserver on the page-text path — the only MutationObserver in content.ts (line 1324 `progMutationObserver`) belongs to the separate progressive-IMAGE mode. Explicit "no MutationObserver" contract at content.ts:1474. |
| **TRIG-01** — manual trigger via toolbar + right-click | ✓ PASS | Right-click: `hime-translate-page` context-menu item (background.ts:1074) → `onClicked` dispatches `{type:'translatePage'}` to active tab (line 1141, `.catch`-guarded). Toolbar: popup button `id="translatePage"` (popup.html:21) → `translatePageAction` (popup.ts:67) sends translatePage/togglePage. Content receives `translatePage` → `pageTranslate()` (content.ts:1970). |
| **TRIG-02** — auto-offer when `<html lang>` ≠ target, no spend same-language | ✓ PASS | Boot block (content.ts:2031) reads `document.documentElement.lang` + target, calls `progShouldGateByLanguage` (975, fail-safe gate-ON for missing/ambiguous) and `return`s BEFORE any banner creation when gated — same-language/unknown pages create no banner and trigger no API call (no `pageTranslate` until user clicks). Banner shown via `pageShowOfferBanner` (1767). |
| **TRIG-03** — unobtrusive, dismissible; manual always available | ✓ PASS | Slim fixed top banner with a ✕ dismiss (content.ts:1811) → `pageDismissBanner` (1838) removes it and appends origin to the `chrome.storage.session` `himeBannerDismissed` set (sticky per-origin for the session); boot re-checks `dismissed?.includes(origin)` (2040). Manual triggers (popup/right-click/pill) are independent code paths, available regardless of gate/dismissal. |

**Score:** 8/8 requirements verified

### ROADMAP Success Criteria (5) — all satisfied

| # | Criterion | Status | Maps to |
| --- | --- | --- | --- |
| 1 | Invoke "Translate page" (toolbar/right-click) → visible text replaced in place, layout preserved | ✓ | TRIG-01 + PAGE-01 |
| 2 | script/style/code/contenteditable/form-input untranslated; links/buttons/forms stay functional | ✓ | PAGE-02 |
| 3 | Toggle back to exact original + re-apply, no reload | ✓ | PAGE-03 |
| 4 | Batched BYOK pipeline (not per-node); key never reaches page | ✓ | PAGE-04 |
| 5 | Static snapshot; `<html lang>` mismatch → dismissible offer; same-language no spend; manual always available | ✓ | PAGE-05 + TRIG-02 + TRIG-03 |

### Key Link Verification (integration contracts)

| From | To | Via | Status | Detail |
| --- | --- | --- | --- | --- |
| content.ts | background worker | `translatePageBatch` message `{items, config}` | ✓ WIRED | Sender content.ts:1533; receiver background.ts:715-720 destructures same `{items, config}`. |
| worker | page-walk parse | `parsePageBatchReply(result.text, inputKeys)` | ✓ WIRED | background.ts:755; `inputKeys = Object.keys(items)` (735) — keys content sent (GLOBAL snapshot indices, content.ts:1625). |
| popup / context-menu | content.ts | `translatePage` / `togglePage` | ✓ WIRED | Triggers: background.ts:1141, popup.ts:77; receiver content.ts:1970,1976. |
| content.ts ↔ popup | state mirror | `chrome.storage.session['himePage']` | ✓ WIRED | Writer `pageWriteStateMirror` maps internal `'original'→'original-shown'`, `'translated'→'translated'` (content.ts:1703); popup reads exactly those two values (popup.ts:55-56) and origin-checks before relabel (54). Keys consistent (`himePage` both sides; types.ts:377). |
| content.ts ↔ self | banner dismissal | `chrome.storage.session['himeBannerDismissed']` | ✓ WIRED | Write content.ts:1844, read 2038; const `'himeBannerDismissed'` matches types.ts:374. |
| content.ts | gate | `progShouldGateByLanguage` | ✓ WIRED | Reused (not re-implemented) at boot 2036; canonical mirror at 975. |

### Threat / Safety Gates

| Gate | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| T-15-07/12 — no innerHTML for translated/UI text | nodeValue/textContent only | ✓ INTACT | `grep '.innerHTML ='` on content.ts AND page-walk.ts → **0 write sites**. Apply uses `node.nodeValue =` (1578,1687); pill/banner/toast use `textContent`/`createElement` only. |
| T-15-03/04/08 — API key never in content-script message | no key in payload | ✓ INTACT | `TranslatePageBatchMessage.payload` = `{items, config}` only (types.ts:350-356); worker reads `s.apiKeys[s.provider]` from storage (background.ts:724); no `apiKey` anywhere in the page path of content.ts. |
| T-15-01/05 — key-injection-guarded batch parse | iterate inputKeys only | ✓ INTACT | `parsePageBatchReply` iterates `inputKeys` only (page-walk.ts:161), string-typed entries, arrays/non-objects → `{}`. Dedicated tests for `evil` + `__proto__` injection keys PASS. Worker uses it verbatim (background.ts:755). |
| T-15-02 — page-walk module purity | no chrome.*, no DOM writes | ✓ INTACT | `grep -c 'chrome.'` page-walk.ts = **0**; no innerHTML; pure functions only. |
| PAGE-05 — static snapshot (no live SPA translate) | no MutationObserver on text path | ✓ INTACT | No MutationObserver wired to page text; the only one (1324) is the unrelated progressive-image observer. |
| T-15-06 — sendMessage to restricted tabs | guarded no-op | ✓ INTACT | Right-click dispatch `.catch`-guarded (background.ts:1141); popup action wrapped in try/catch (popup.ts:79). |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Build clean | `npm run build` | exit 0 | ✓ PASS |
| Pure-core unit suite | `node --test test/page-walk.mjs` | 20/20 pass | ✓ PASS |
| Full regression suite | `npm test` | 202 pass / 0 fail / 2 opt-in skip | ✓ PASS |
| Key-injection guard | parsePageBatchReply `evil`/`__proto__` tests | both dropped | ✓ PASS |

### Anti-Patterns Found

None. No `TODO`/`FIXME`/`XXX`/`TBD`/`HACK`/`PLACEHOLDER` markers in the page-translate source. No stub returns; `pageRemovePill` exists but unused — declared for a future reset path, not a blocking stub (no goal depends on it). No hardcoded-empty data flowing to render.

## Notable Observations (non-blocking)

1. **Context-menu nesting deviation (documented).** 15-02-SUMMARY claims FLATTEN "option b context-partitioning" keeps all three menu items top-level. The committed source (background.ts:1053-1064) instead documents and ACCEPTS Chrome's submenu auto-nesting ("option a") because the third item's page contexts overlap `hime-open-panel`. This is a truthful, intentional, code-documented choice — the right-click "Translate page" item still exists and dispatches correctly (TRIG-01 satisfied). The SUMMARY narrative is stale relative to the final code, but the requirement holds. Info-level only.

2. **page-walk.ts test parity.** The pure module mirrors content.ts logic verbatim with "MUST stay in sync" comments. content.ts's live `createTreeWalker` path cannot be node-tested (linkedom limitation, documented); its behavior is covered by the human live UAT. The pure equivalents are unit-tested.

## Gaps Summary

No gaps. All 8 requirements (PAGE-01..05, TRIG-01..03) and all 5 ROADMAP success criteria trace to concrete, wired, threat-safe committed source. All threat gates intact. Integration contracts (worker ↔ content ↔ page-walk parse; triggers; session-storage state/dismissal mirrors with consistent keys) line up. Build clean, 202/202 tests pass. Live browser UAT human-approved.

**Verdict: PASS.**

---

_Verified: 2026-06-22T16:16:56Z_
_Verifier: Claude (gsd-verifier)_
