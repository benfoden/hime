---
phase: 15-in-place-page-text-translation-triggers
plan: 04
subsystem: content-script
tags: [chrome-mv3, content-script, auto-offer-banner, language-gate, session-dismissal, partial-failure, error-toast, retry, classic-script-mirror]

# Dependency graph
requires:
  - plan: 15-01
    provides: "STORAGE_BANNER_DISMISSED key ('himeBannerDismissed') mirrored verbatim into content.ts (classic-script no-imports law)"
  - plan: 15-03
    provides: "shared pageFailedNodes Set (declared + per-key populated); pageTranslate(nodes?) apply path; badgeForKind/setBadge; progShouldGateByLanguage gate"
provides:
  - "src/content.ts — auto-offer top banner gated by progShouldGateByLanguage + per-origin chrome.storage.session dismissal (sticky for the session); whole-chunk failure population of the shared pageFailedNodes Set via pageRecordChunkFailure; single singleton-by-id error toast + red error badge after chunks settle; pageRetryFailed re-batching ONLY [...pageFailedNodes]"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Classic-script mirror doctrine extended again: STORAGE_BANNER_DISMISSED const duplicated verbatim into content.ts with a 'MUST stay in sync with types.ts' comment (content.ts cannot import)"
    - "Boot-gate-before-spend: the auto-offer banner boot block reuses the ALREADY-MIRRORED progShouldGateByLanguage so same-language/unknown pages early-return before any banner creation or API spend (TRIG-02 cost guarantee)"
    - "Singleton-by-id toast (idempotent getElementById guard): re-fire updates the existing toast's label via a data-attribute selector, never appends a second toast"
    - "Consume-don't-redeclare: whole-chunk failure path ADDS to Plan 03's shared pageFailedNodes Set; retry snapshots [...pageFailedNodes], clears, and re-batches only those nodes (T-15-14, no whole-page re-translate)"

key-files:
  created: []
  modified:
    - src/content.ts

key-decisions:
  - "STORAGE_BANNER_DISMISSED mirrored as a local const ('himeBannerDismissed') rather than imported — same classic-script no-imports law that forces the page-walk + TranslationConfig mirrors; carries a 'MUST stay in sync with types.ts' comment"
  - "Banner is a separate document_end boot block (a second chrome.storage.local.get(['himeSettings'])) mirroring the progressive boot gate, rather than folding into the existing progressive block — keeps the TRIG-02 gate independent of progressiveEnabled (the banner offers manual page-text translation regardless of progressive-image mode)"
  - "Whole-chunk failure remembers the error kind (lastKind) across chunk replies; the toast/badge fire ONCE after the cursor-driven batch barrier settles (pageFailedNodes.size > 0), not per-chunk — single toast, single badge (D-04)"
  - "Retry clears the shared Set first, then re-batches the snapshot via pageTranslate(nodes); nodes that succeed are simply not re-added, nodes that fail again repopulate the Set (Plan 03 per-key path + this plan's whole-chunk path) and re-fire the singleton toast"

requirements-completed: [TRIG-02, TRIG-03, PAGE-04]

# Metrics
duration: ~2min
completed: 2026-06-22
---

# Phase 15 Plan 04: Auto-Offer Banner + Partial-Failure Resilience Summary

**Adds the two remaining Phase 15 surfaces to `content.ts`: a slim dismissible top banner that — on `document_end` — offers page translation ONLY on foreign-language, non-dismissed origins (reusing `progShouldGateByLanguage` so same-language pages incur no spend) with per-origin `chrome.storage.session` stickiness; and the partial-failure UX that populates Plan 03's shared `pageFailedNodes` Set on whole-chunk failures, applies all successes, shows ONE singleton-by-id error toast + red error badge, and offers "Retry failed sections" re-batching only `[...pageFailedNodes]`.**

## Performance
- **Duration:** ~2 min
- **Completed:** 2026-06-22
- **Tasks:** 2 code tasks complete; Task 3 is a deferred/batched human-verify checkpoint
- **Files modified:** 1 (src/content.ts, +243 / -3)

## Accomplishments

### Task 1 — Auto-offer banner (TRIG-02, TRIG-03)
- **`pageShowOfferBanner(origin)`** — slim fixed top banner (full-width, `top:0`, `z-index:2147483646`, `pointer-events:auto`), idempotent-by-id, mirroring progCreateIndicator conventions. `textContent`-only label + a "Translate this page" button (runs the SAME path as the `translatePage` message → `pageTranslate()` from Plan 03, then dismisses) + a ✕ dismiss button. Never innerHTML.
- **`pageDismissBanner(origin)`** — removes the banner element, reads the `chrome.storage.session` dismissed-set, and appends the origin (deduped) so it stays gone for that origin for the rest of the session (D-02). The manual trigger (popup/right-click/pill) stays available.
- **`document_end` boot block** — a second `chrome.storage.local.get(['himeSettings'])` mirroring the progressive boot gate (content.ts:1789-1802). Reads `document.documentElement.lang` + `targetLanguage`, reuses the already-mirrored `progShouldGateByLanguage(pageLang, target)` — `if (progShouldGateByLanguage(...)) return` BEFORE any banner creation (TRIG-02 no-spend gate). Then checks `dismissed?.includes(origin)` before calling `pageShowOfferBanner(origin)` (A7 origin granularity).
- **`STORAGE_BANNER_DISMISSED`** local const = `'himeBannerDismissed'` with a "MUST stay in sync with types.ts STORAGE_BANNER_DISMISSED" comment (classic-script law).

### Task 2 — Partial-failure resilience (PAGE-04 / D-04)
- **`pageRecordChunkFailure(nodes)`** — the WHOLE-CHUNK failure path: adds every node in a failed chunk to Plan 03's shared `pageFailedNodes` Set. Does NOT re-declare the Set (exactly one `new Set<Text>()` for it across content.ts, owned by Plan 03) and does NOT reach into Plan 03's apply internals.
- **`pageTranslate` integration** — the per-chunk `.catch` now routes whole-chunk failures through `pageRecordChunkFailure(chunkNodes)` and remembers the error `kind` (`lastKind`). After the cursor-driven batch barrier settles, the terminal `.then` fires `pageShowErrorToast(lastKind)` ONCE iff `pageFailedNodes.size > 0`. Successes are applied regardless (page stays usable).
- **`pageShowErrorToast(kind?)`** — SINGLETON by id (idempotent `getElementById` guard): on re-fire it updates the existing toast's label via a `data-hime-toast-label` selector — never appends a second toast. Shows `pageFailedNodes.size` as the failed-region count, a "Retry failed sections" button (→ removes toast, calls `pageRetryFailed`) and a dismiss ✕. Maps `kind` via `badgeForKind(kind)` and calls `setBadge(badge.text, badge.color)` for the red error badge (content.ts:515-535). textContent-only.
- **`pageRetryFailed()`** — snapshots `[...pageFailedNodes]`, CLEARS the Set, and calls `pageTranslate(nodes)` scoped to just those nodes (Plan 03 re-keys by snapshot index over the array it receives). Successful nodes are not re-added; nodes that fail again repopulate the Set (Plan 03 per-key path + this plan's whole-chunk path) and re-fire the singleton toast (T-15-14: only failed nodes re-batched, never the whole page).

## Task Commits
1. **Task 1: auto-offer banner gated by language + per-origin session dismissal** — `054b28a` (feat)
2. **Task 2: partial-failure UI — consume pageFailedNodes, single error toast, red badge, retry-failed** — `9dfd736` (feat)

## Deviations from Plan
None functionally — plan executed as written. One naming/structure note worth recording:
- The plan's `pageShowOfferBanner` mirrors progCreateIndicator's single-`div` + `style.cssText` pattern, but the banner needed two clickable buttons + a label, so it composes a flex row of `createElement('button')`/`createElement('span')` children (each textContent-only, no innerHTML) rather than a single text node. Same conventions (fixed position, idempotent-by-id, high z-index, textContent-only); functionally the plan's intent.

## Known Stubs
None. All declared symbols are wired: `pageShowOfferBanner`/`pageDismissBanner` invoked from the boot block + button handlers; `pageRecordChunkFailure`/`pageShowErrorToast`/`pageRetryFailed` invoked from `pageTranslate`'s catch/settle paths and the toast's retry button.

## Threat Surface
- **T-15-11 (Tampering, lang→gate):** mitigated. `document.documentElement.lang` feeds only `progShouldGateByLanguage` (pure string compare); fail-safe direction is gate-ON (no banner, no spend).
- **T-15-12 (EoP/XSS, banner+toast DOM):** mitigated. All banner/toast text is `textContent`-only; `grep -nF ".innerHTML =" src/content.ts` → ZERO write sites. The raw `innerHTML` string count rose 11→13 only from new "...never innerHTML" doc comments. Both surfaces idempotent-by-id.
- **T-15-13 (Spoofing, per-origin dismissal):** accepted by design. Dismissal keyed on `location.origin` in `chrome.storage.session` (per-profile, ephemeral) — correct "this site" granularity (A7), no cross-origin leakage.
- **T-15-14 (DoS/self, retry loop):** mitigated. `pageRetryFailed` re-batches ONLY `[...pageFailedNodes]`; success removes nodes; repeated failure re-fires one singleton toast; each retry is user-initiated — no runaway loop.
No new threat surface beyond the plan's `<threat_model>`.

## User Setup Required
None — no new dependency, permission, or env var. `chrome.storage.session` is covered by the existing `storage` permission.

## Verification (automated portion)
- `npm run build` exits 0.
- `npm test` → 202 pass / 0 fail / 2 opt-in skip (no regression).
- Greps: `pageShowOfferBanner`/`pageDismissBanner` present; `progShouldGateByLanguage` reused (new call site, not a re-implementation); `STORAGE_BANNER_DISMISSED` read AND write present; `pageRecordChunkFailure`/`pageShowErrorToast`/`pageRetryFailed` all present; `badgeForKind(kind)`/`setBadge` in the error path; `[...pageFailedNodes]` read + `pageFailedNodes.clear()`; exactly one `new Set<Text>()` for `pageFailedNodes` across content.ts (consumed, not re-declared); `.innerHTML =` write sites = 0; toast singleton-by-id (getElementById guard + data-attr label update on re-fire).

## Remaining: Live Browser Checkpoint (Task 3 — DEFERRED/BATCHED)
Task 3 is a `checkpoint:human-verify` (blocking gate). Per the orchestrator, all phase-15 live-verify checkpoints are batched into one human gate at the end of the phase. Code is complete and committed; the human must verify in a live browser per the plan's how-to-verify steps:
1. Foreign-language page → slim banner appears; "Translate this page" translates in place + closes the banner.
2. Reload → banner reappears (fresh session); after ✕ dismiss, same-origin navigation keeps it GONE for the session; manual trigger still works.
3. Same-language page (`<html lang>` == target) → NO banner (TRIG-02 no-spend gate).
4. Partial failure (e.g. invalid BYOK key so chunks fail) → successes applied, failures stay in source, ONE error toast (not stacked) + red badge; "Retry failed sections" re-attempts only failed regions (restore the key to see them succeed); toast dismissible.

## Self-Check: PASSED
- `src/content.ts` — FOUND; functions pageShowOfferBanner / pageDismissBanner / pageRecordChunkFailure / pageShowErrorToast / pageRetryFailed — all FOUND.
- Commits `054b28a`, `9dfd736` — both FOUND in git log.

---
*Phase: 15-in-place-page-text-translation-triggers*
*Completed (code): 2026-06-22 — live checkpoint deferred to batched phase-end human gate*
