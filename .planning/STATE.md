---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Image Translation — Phases 12-14 (in progress; started 2026-06-20)
status: Awaiting next milestone
stopped_at: Phase 14 context gathered
last_updated: "2026-06-22T00:22:20.278Z"
last_activity: 2026-06-22 — Milestone v1.3 completed and archived
progress:
  total_phases: 11
  completed_phases: 3
  total_plans: 16
  completed_plans: 16
  percent: 27
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-20)

**Core value:** Type English, get natural Japanese inline — without breaking your keyboard flow.
**Last shipped:** v1.2 Translated Search (phases 8-11, 2026-06-20)
**Current focus:** Phase 14 — ux-quality-hardening-vision-settings

## Current Position

Phase: Milestone v1.3 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-06-22 — Milestone v1.3 completed and archived

## Performance Metrics

**Velocity (v1.2):**

- Total plans completed: 11
- Average duration: — min
- Total execution time: — hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 8 | 4 | - | - |
| 10 | 2 | - | - |
| 11 | 3 | - | - |

*Updated after each plan completion*
| Phase 12 P06 | ~8m | 2 tasks | 3 files |
| Phase 13-progressive-viewport-mode-cost-control-privacy-opt-in P01 | 25 | - tasks | - files |

## Accumulated Context

### Decisions

v1.3 roadmap decisions (see PROJECT.md / research SUMMARY for full rationale):

- 3 phases (12-14): manual vertical slice → progressive + cost control → UX/quality hardening + vision settings. Pipeline built once in Phase 12; both triggers funnel through the single `translateImage` worker case.
- Vision provider: single-call vision LLM (Claude Vision) behind a provider-agnostic `VisionProvider` interface. Rejected Google Vision + Translation v3 (v3 takes no API key → breaks BYOK/no-backend); abstraction leaves Gemini/OpenAI swappable later.
- Side-panel text output only — no in-image overlay/inpaint, no manga/vertical-CJK craft this milestone.
- Context menu adds no hotkey slot (still 3/4 Chrome commands); `chrome.sidePanel.open()` must fire synchronously inside the gesture handler before any `await`.
- Progressive mode is OFF by default; its cost guards (content-hash dedup + cache, concurrency cap, per-page budget, dwell debounce, min-size filter) and first-enable privacy warning are hard prerequisites, not enhancements.
- MV3 worker lifecycle: job/dedup/result state persists in `storage.session` with per-call timeouts so a slept/restarted worker never hangs the panel.
- Reuse shipped patterns: `translateImage` mirrors v1.2 `searchTranslated`; `panel-render.ts` clones `serp-render.ts` (textContent-only); `sidepanel.ts` clones `search.ts`; key-stays-in-worker invariant unchanged.

Phase 12 Plan 01 (types/build foundation):

- Bumped @types/chrome to ^0.0.304 (planned ^0.0.258 still lacks sidePanel.open(); verified via real tsc check on chrome.sidePanel.open({ tabId })).
- languageToIso uses region-qualified Chinese codes (zh-CN / zh-TW) since Translation v2 distinguishes Simplified vs Traditional.
- Wave 0 test files import subjects lazily so each is discovered and runs RED (subjects land Plans 02-04) while fixtures load eagerly — no subject ships untested (Nyquist rule).

Phase 12 Plan 05 (image pipeline worker controller):

- dedupKey is a djb2 content-key over info.srcUrl, used as BOTH the storage.session map key and the panel entry id (D-01). The right-click context exposes no reliable dimensions, so srcUrl is the identity; re-clicking replays the cached entry without re-billing.
- Image job/dedup/result persists to chrome.storage.session under `himeImageJobs` ({ [dedupKey]: ImageEntry }); a finished entry is replayed, an in-flight `loading` entry is not restarted — survives MV3 worker termination (Pitfall 5).
- onClicked owns gesture-first `sidePanel.open({ tabId })` (before any await — Pitfall 1) and the dedupKey; the `translateImage` message case is a secondary replay/(re-)run path so Plan 06's panel can query a durable entry by dedupKey.
- contextMenus registered in the EXISTING onInstalled via removeAll-then-create (Pitfall 6 duplicate-id), not at module top level.
- Byte ladder + OffscreenCanvas downscale/re-encode live in background.ts (SW-only); the pure dimension math is imported from image-resolve (Pattern law). Pixels always resolved in the worker (fetch / captureVisibleTab), never a tainted page canvas.

Carried forward:

- All network + BYOK keys stay in the background service worker — never on the page.
- `document.execCommand('insertText')` accepted as deprecated but undo-safe; monitor Chrome releases.
- `content.ts` is a classic script — pure observer logic lives in a node-testable `image-observer.ts`; IntersectionObserver wiring is inlined.
- [Phase ?]: Phase 12 Plan 06 (side panel page): sidepanel.{ts,html,css} clone search.* — rebuild list from storage.session himeImageJobs on open (Pitfall 5/IMG-05), runtime.onMessage prepends/swaps worker pushes via prependEntry (D-01), getSettings target language as defensive fallback (D-03); all rendering via panel-render.ts textContent-only, no innerHTML in the page.
- [Phase ?]: imgc_ prefix for content-hash dedup keys

### Pending Todos

None yet.

### Blockers/Concerns

- Progressive mode cost/privacy: one paid call per image per scroll if naively wired — dedup/cache/budget/concurrency/debounce/min-size + default-OFF + first-enable warning are mandatory (Phase 13).
- Cross-origin / tainted-canvas image bytes: resolve in the worker under host_permissions with `captureVisibleTab` crop fallback; validate MIME/size before send (Phase 12).
- MV3 worker termination on slow image jobs: durable `storage.session` state + per-call timeout < 30s (Phase 12).
- CJK / vertical-text OCR quality: known vendor gap, no manga-grade guidance; set expectations, show original alongside translation, defer OSS stack (Phase 14).
- Final per-provider image request shape (Claude image block) to confirm in Phase 12 planning; `--research-phase` recommended for Phases 12 and 13.

## Session Continuity

Last session: 2026-06-21T17:11:51.509Z
Stopped at: Phase 14 context gathered
Resume file: .planning/phases/14-ux-quality-hardening-vision-settings/14-CONTEXT.md

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
