# Phase 14: UX / Quality Hardening + Vision Settings - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the image-translation feature **settings-complete and trustworthy on real-world
content**. The user can copy results, the side panel honestly distinguishes "no text"
from failures and sets expectations where vendor OCR is weak (CJK/vertical), oversized
images fail gracefully, and progressive auto-translation stops wasting paid calls on
pages that are already in the user's reading language.

Scope = **VIS-02** (Vision key + connection test — already largely landed, verify only)
and **IMG-06** (copy from panel), plus three quality-hardening additions folded in by the
user: the no-text/failure honesty pass (SC#3), the CJK/oversized expectations pass (SC#4),
backlog **999.4** (per-image numbering), and a new **page-language gate** on progressive
firing.

It does NOT add new translation capability — it reuses the Phase 12 pipeline (Vision OCR →
the user's configured LLM translation model) and the Phase 13 progressive surface. It does
NOT build in-place image overlay (999.3 — its own v1.4 phase).

</domain>

<decisions>
## Implementation Decisions

### Copy affordance (IMG-06, SC#2)
- **D-01:** Each populated side-panel entry gets **one `Copy` button that copies the
  translated text**. The detected **original** text is reachable via a small per-entry
  **"show original" toggle**; when expanded it has its own copy path. Click → brief
  inline "Copied" / checkmark feedback. Clipboard via `navigator.clipboard.writeText`
  on the entry's stored string (no innerHTML; consistent with the IMG-02 textContent law).
  Rationale: keeps the default row light — the common action (copy the translation) is
  one tap; the original stays available without cluttering every entry.

### No-text vs failure honesty (SC#3)
- **D-02:** A genuine **"no text found"** and an actual **failure** must be **visually
  distinct states**, never the same muted blank:
  - No-text → neutral/muted card: "No text found in image." (the existing `panel-no-text`
    style is fine).
  - Failure → a clearly different card (amber/red) that **names the reason** — e.g. "Vision
    auth failed", "image too large", "translation failed", "network error" — sourced from
    the worker error already surfaced (the Phase 12/`fb9395e` Google-reason surfacing).
  - The user can always tell empty-but-fine from broken. No silent or misleading blanks.

### CJK / vertical + oversized expectations (SC#4)
- **D-03:** **Per-result note only — NO standing panel disclaimer.** When a result's
  detected script/orientation is **CJK or vertical text**, attach a small per-entry quality
  note (e.g. "vertical/CJK text — OCR may be imperfect"). Clean panel by default; the
  caveat appears only where it actually applies.
- **D-03a:** **Oversized images fail gracefully, not opaquely.** Tune the VIS-03 downscale
  limits so large images send reliably; when an image still exceeds Google's limits
  (≤10 MB JSON request, ≤75M-px OCR cap, supported MIME), surface a **clear** "image too
  large — downscaled / could not send" message (this is the failure card from D-02), never
  a raw/opaque error.

### Per-image numbering (999.4 — FOLDED IN)
- **D-04:** Give each translated image a **stable sequential number keyed to the dedup
  key**, rendered as **`[hime N]`** in BOTH the on-image badge and its side-panel entry, so
  the user can correlate a badge with its panel entry at a glance. Dedup-keyed (not arrival
  order) so a **re-scroll / re-trigger keeps the same number** — never renumbers an image
  the user already saw. Builds on Phase 13's `openImagePanel` badge↔entry link (badge-click
  → scroll panel to entry is already shipped).

### Page-language gate on progressive (NEW guard on PROG)
- **D-05:** Progressive **auto**-translation fires **only when the page's language differs
  from the user's translation target**. If the page is already in the user's target/reading
  language there is nothing to translate, so progressive **stays OFF for that page** — no
  paid Vision/LLM calls wasted.
- **D-05a:** **Detection = the page `<html lang>` attribute** (free, no API call). When
  `lang` is **missing or ambiguous, default the gate to OFF** (conservative — never
  auto-spend on an undetectable page).
- **D-05b:** **Gate applies to progressive ONLY.** Right-click "Translate image" is an
  explicit user gesture and **always works**, regardless of detected page language.

### Claude's Discretion
- Exact copy-feedback affordance (inline checkmark vs transient toast) and the "show
  original" toggle's exact markup — keep minimal, textContent-only.
- Precise per-result CJK/vertical detection signal (Vision response script hints vs
  orientation heuristic) — planner/researcher decides; intent is "flag only where weak".
- Exact downscale limit values to tune (D-03a) — derive from Google's published caps and
  real large-image behavior, not guessed.
- Where the per-image sequence counter lives (likely `storage.session` keyed by dedup key,
  alongside the existing job map).
- How the language-target comparison normalizes (`<html lang>` BCP-47 region/script
  subtags vs the stored target language code) — planner decides the comparison rule.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope + requirements
- `.planning/ROADMAP.md` §"Phase 14: UX / Quality Hardening + Vision Settings" — goal, the 4 success criteria, requirements VIS-02 + IMG-06.
- `.planning/REQUIREMENTS.md` — VIS-02 (Vision key + connection test), IMG-06 (copy translated + original), VIS-03 (downscale/validation, referenced by D-03a).

### Prior-phase decisions this phase builds on
- `.planning/phases/13-progressive-viewport-mode-cost-control-privacy-opt-in/13-CONTEXT.md` — progressive guards (D-02 cost guards), badge↔panel link (D-04 `openImagePanel`), low-confidence amber badge, the OCR→LLM steer disclosure.
- `.planning/phases/12-image-ocr-pipeline-right-click-side-panel/12-CONTEXT.md` — IMG-02 textContent-only rendering law, per-image state contract, side-panel renderer origin.

### Code touch-points (existing, to extend — see code_context)
- `src/panel-render.ts` — entry renderer; already emits detected-lang line, low-confidence badge, no-text message. Copy button (D-01), distinct failure card (D-02), per-result CJK note (D-03), `[hime N]` number (D-04) all land here.
- `src/sidepanel.ts` / `src/sidepanel.css` / `src/sidepanel.html` — panel host + styling for the new affordances.
- `src/options.ts` / `src/options.html` — VIS-02 key field (`googleApiKeyInput`) + `testVisionKeyBtn` + connection test ALREADY landed; verify the test exercises Vision + Translation through the background worker (SC#1 wording).
- `src/content.ts` / `src/progressive-guard.ts` — progressive firing + existing guards; the D-05 page-language gate is a new guard here.
- `src/providers/vision-google.ts` — OCR call + downscale/limit handling (D-03a tuning), Google error reason (D-02 failure copy).
- `src/types.ts` — `ImageState` / `ImageEntry` shape; numbering + per-result note + error-reason fields extend here.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `panel-render.ts` already renders `detectedLang → target` line, a `low-confidence amber`
  badge, and a `panel-no-text` "No text found" card — D-02/D-03 extend these states rather
  than inventing a new renderer.
- VIS-02 is **already implemented** (`options.ts`: `googleApiKeyInput`, `testVisionKeyBtn`,
  `visionTestStatusDiv`, connection-test handler; commits `0a07344`, `fb9395e`, `269316a`).
  Phase 14's VIS-02 work is **verification only** — confirm the connection test exercises
  the Vision + Translation endpoints **through the background worker** (SC#1), not just a
  bare models-list endpoint. Do not re-plan the key UI from scratch.
- Phase 13 `openImagePanel` already wires badge-click → open panel + scroll to entry; D-04
  numbering rides on top of that existing badge↔entry correlation.

### Established Patterns
- **IMG-02 textContent-only law:** every OCR'd / translated string assigned via
  `textContent`, never `innerHTML` — copy buttons, notes, numbers must all honor it.
- Worker-mediated calls: OCR/translate go through `background.ts`; the connection test and
  any new gating should follow the same worker boundary.
- Progressive guards live in `progressive-guard.ts` and are checked before a paid job — the
  D-05 language gate is a sibling guard evaluated **before** the IntersectionObserver job
  fires.

### Integration Points
- Dedup key (Phase 12 `dedupKey` / `storage.session` job map) is the anchor for D-04's
  stable per-image number.
- `<html lang>` read in the content script (`content.ts`) feeds the D-05 gate; compared
  against the stored translation target before progressive eligibility.

</code_context>

<specifics>
## Specific Ideas

- Badge label format is literally **`[hime N]`** (user-specified), shown identically in the
  on-image badge and the panel entry.
- The user's framing of the language gate: progressive should "only run on pages that are
  in [a language other than] the target language, otherwise default to off" — i.e. don't
  auto-translate a page already in your reading language (D-05).

</specifics>

<deferred>
## Deferred Ideas

- **999.3 In-place image overlay translation** (text-on-image, swap toggle) — its own v1.4
  phase, explicitly out of scope here (medium effort; per-block boundingPoly overlays).
- **999.1 / 999.2** (two-pass SERP translation; auto-translate destination on clickthrough)
  — unrelated backlog, untouched.
- **Per-site progressive scoping / allowlist** (PROG-F1) — still deferred from Phase 13;
  the D-05 language gate is page-language-based, not a per-site allowlist.

</deferred>

---

*Phase: 14-ux-quality-hardening-vision-settings*
*Context gathered: 2026-06-21*
