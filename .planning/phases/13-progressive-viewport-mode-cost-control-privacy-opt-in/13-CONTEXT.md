# Phase 13: Progressive Viewport Mode + Cost Control + Privacy Opt-In - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

With an explicit opt-in (default OFF), a user reading an image-heavy page sees images
auto-translated into the side panel as they approach the viewport — built on Phase 12's
`translateImage` worker case, per-image state contract, and durable `storage.session`
job/dedup state. The phase delivers the IntersectionObserver trigger, the cost guards,
the first-enable privacy warning, and the on-page badge/activity surface. It does NOT
add new translation capability — it reuses the Phase 12 pipeline (Vision OCR → the user's
configured LLM translation model).

Scope = PROG-01..PROG-06. Per-site scoping/allowlist (PROG-F1) is explicitly deferred.

</domain>

<decisions>
## Implementation Decisions

### Trigger aggressiveness (PROG-02)
- **D-01:** Balanced trigger. IntersectionObserver `rootMargin ≈ 200px` (fire just before
  an image scrolls into view) with a **400ms dwell debounce** so fast scroll-throughs do
  NOT fire a paid job — only images the user pauses near translate. Planner/researcher may
  tune the exact px/ms from real scroll behavior, but the intent is "fire slightly ahead,
  not on every flyby."

### Cost guards (PROG-04)
- **D-02:** Default guard values (each image now costs TWO calls — Vision OCR + the LLM
  translation — so guards are deliberately conservative):
  - **Concurrency cap: 2** simultaneous in-flight progressive jobs.
  - **Per-page budget: 10** auto-translated images per page (then progressive stops for
    that page until reload; the user can still right-click beyond the budget).
  - **Minimum eligibility: ≥150px on the long edge** — skip icons/sprites/tracking pixels.
  - Dwell debounce (D-01) is also a guard (no fire on flyby).
- **D-02a:** The per-page budget counts *jobs started*, not successes — a failed/no-text
  image still consumes budget (otherwise an all-fail page loops forever).

### Privacy warning + opt-in (PROG-01, PROG-05)
- **D-03:** First-enable = a **blocking one-time modal** the user must acknowledge before
  progressive turns on. Copy MUST disclose BOTH destinations: image bytes → **Google Cloud
  Vision**, and the OCR'd text → **the user's configured LLM translation provider**
  (per the Phase 12 OCR/LLM steer — it is no longer just "a vision API"). Acknowledgement
  is remembered (no re-prompt on later enables).
- **D-03a:** While progressive is ON, a **small persistent "progressive ON" indicator** is
  always visible (so auto-upload is never silent) — distinct from the transient activity
  count (D-04). Toggle takes effect immediately, no extension reload (PROG-01).

### Badge + activity UI (PROG-05, PROG-06)
- **D-04:** Each progressively translated image gets a **small on-image overlay badge**.
  **Clicking the badge is a user gesture** → it MAY call `sidePanel.open()` and scroll the
  panel to that image's entry. This is the sanctioned way the panel opens for progressive
  results: PROG-06 forbids *auto*-opening (IntersectionObserver is not a gesture), but a
  human badge-click IS a gesture and is allowed.
- **D-04a:** A small **activity count** (pending + done this page) is shown — e.g. on the
  toolbar action badge or near the ON indicator — so the user knows work is happening and
  can choose to open the panel themselves. Progressive results still populate the panel
  when it is already open (PROG-06), but the panel is NEVER auto-opened by the observer.

### Claude's Discretion
- Exact `rootMargin` px and dwell ms (D-01) — tune from scroll behavior; defaults above.
- Content-hash dedup mechanism (PROG-03): reuse Phase 12's `dedupKey`/`storage.session`
  job map; planner decides whether the progressive key is content-hash vs normalized-URL
  (criteria say content-hash so re-scroll AND same-image-different-URL both dedup). Must
  never re-bill an already-translated image.
- Badge visual design + indicator placement — planner/UI; keep minimal, non-blocking, and
  textContent-only (no innerHTML in page context, per Phase 12 rendering law).
- Where the per-page budget counter + ack flag live (likely `storage.session` for the
  counter, `storage.local` for the one-time ack).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 12 pipeline this phase reuses
- `.planning/phases/12-image-ocr-pipeline-right-click-side-panel/12-CONTEXT.md` — panel list
  model (D-01 prepend), target-language source (D-03), per-image state (D-04); all carry forward.
- `src/background.ts` — `translateImage` worker case, `runImageJob`, `ocrAndTranslateImage`
  (OCR→LLM translate), `getJob`/`setJob` `storage.session` dedup map. Progressive jobs MUST
  funnel through this same worker path (one pipeline, two triggers).
- `src/sidepanel.ts` / `src/panel-render.ts` — panel rebuild-on-open + prepend listener;
  progressive results populate via the same `pushEntry` path.

### Requirements
- `.planning/REQUIREMENTS.md` — PROG-01..PROG-06 (this phase), PROG-F1 (deferred), and the
  Phase 12 IMG/VIS reqs for the shared pipeline.
- `.planning/ROADMAP.md` §"Phase 13" — goal + 5 success criteria.

### Cross-cutting steers (from Phase 12 human-verify, 2026-06-21)
- Translation runs through the user's LLM provider, NOT Google Translate v2 → the privacy
  warning (D-03) must name the LLM provider, and the cost guards (D-02) account for 2 calls/image.
- Image results are session-scoped (`storage.session`) and must not persist beyond the
  browser session — progressive results inherit this.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `runImageJob(srcUrl, tabId, dedupKey)` + `ocrAndTranslateImage` (background.ts): the entire
  OCR→translate→entry pipeline already exists. Progressive trigger only needs to call into the
  `translateImage` worker message with a content-hash dedupKey + the cost-guard gating in front.
- `getJob`/`setJob` `storage.session` dedup map: already prevents re-billing a finished dedupKey
  — progressive dedup (PROG-03) reuses it directly.
- Panel prepend/rebuild (sidepanel.ts, panel-render.ts): progressive entries render with no new
  panel code.

### Established Patterns
- One worker message (`translateImage`) is the single funnel for both triggers (right-click +
  progressive) — phase 12 deliberately built it this way (see 12-CONTEXT D-01 rationale).
- Page-context rendering is textContent-only, never innerHTML (Phase 12 security law) — the
  on-image badge must obey this.
- BYOK keys read only in the worker; the content script never sees them — progressive trigger
  sends only `{srcUrl, dedupKey}` shaped messages, never keys.

### Integration Points
- NEW content-script module: IntersectionObserver over eligible `<img>` (≥150px), dwell debounce,
  per-page budget + concurrency gate, then post `translateImage` to the worker.
- NEW settings toggle (PROG-01) + first-enable modal (PROG-05) + persistent ON indicator.
- Worker: may need a concurrency-aware queue if the cap is enforced worker-side (vs content-side).

</code_context>

<specifics>
## Specific Ideas

- Badge-click-as-gesture (D-04): the user explicitly wants the on-image badge to be clickable to
  open the panel *at that image*. This turns PROG-06's constraint into a feature — the one
  gesture-backed path to open the panel for a progressive result.
- Conservative-by-default spend: user lowered the per-page budget from a suggested 20 to **10**,
  signaling cost-caution is the priority over coverage. Keep defaults frugal.

</specifics>

<deferred>
## Deferred Ideas

- **PROG-F1 — per-site scoping / allowlist** for progressive mode: v1.3 ships a single global
  toggle + first-enable warning. Per-site control is a future phase (already deferred in
  REQUIREMENTS.md).
- **On-demand re-translate** of an already-translated image (IMG-F1): deferred to a later phase;
  v1.3 shows the first result only.
- Backlog (separate, search-translation, not this phase): 999.1 two-pass SERP, 999.2 auto-translate
  on clickthrough.

</deferred>

---

*Phase: 13-progressive-viewport-mode-cost-control-privacy-opt-in*
*Context gathered: 2026-06-21*
