# Phase 5: Ghost-Text Prediction Engine - Context

**Gathered:** 2026-05-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver live inline ghost-text completion in editable fields: as the user works in any
`<input>`, `<textarea>`, or `contenteditable`, hime suggests a 2-3 word completion rendered
as dim inline ghost text after the cursor. The user can accept it (Tab/Enter, undo-safe via
`execCommand('insertText')`), dismiss it (Esc), or supersede it by continuing to type.
Completions are generated from text-before-cursor via the existing background service-worker
provider layer, in the field's **own** language (independent of the translate target setting).

Covers requirements **PRED-01..06**, **LANG-01**, **LANG-02**. Variations/cycling (VAR-*) and
the options-page settings (SET-*) are Phases 6 and 7 — Phase 5 ships the single-completion
engine with sensible hardcoded defaults that those later phases make multiple/configurable.

</domain>

<decisions>
## Implementation Decisions

### Trigger behavior (default + modes)
- **D-01:** Default trigger is **manual** — a key press fires a prediction for the current
  field (no auto-firing out of the box). This is the shipped default to keep the feature
  unsurprising and API cost predictable.
- **D-02:** An **auto** trigger mode also exists (predict-as-you-type after a debounce). Auto
  is opt-in. In Phase 5 build both code paths; default to manual. The debounce delay and the
  minimum-characters threshold are parameters (auto mode) — Phase 5 uses defaults (recommended
  ~400ms debounce, min 3 chars); Phase 7 (SET-02, SET-04) exposes them in options.
- **D-03:** Recommended default manual trigger key: **Ctrl+Space** (avoids the v1.0 hotkeys
  Ctrl+Y / Ctrl+Shift+Y / Ctrl+Shift+S). Planner may adjust if Ctrl+Space conflicts on common
  sites; final key becomes configurable in Phase 7. Registered on the existing capture-phase
  keydown listener, NOT a `chrome.commands` slot (consistent with v1.0 rationale).

### Ghost-text rendering
- **D-04:** Render ghost text **only when the caret is at the end of the field's text**
  (end-of-text completion). Mid-text caret → no ghost shown. Simplest correct behavior; covers
  the dominant typing case and avoids overlay-alignment edge cases.
- **D-05:** `<input>` / `<textarea>` cannot contain styled child nodes, so ghost text is drawn
  with an **absolutely-positioned overlay** aligned to the caret/end-of-text — reuse the v1.0
  overlay-positioning approach (`getBoundingClientRect` + `scrollX/scrollY`, `z-index`
  `2147483647`, `pointer-events: none`). `contenteditable` may use an **inline ghost span**
  appended after the caret. Appearance: dim grey, inline, visually continuous with typed text.
- **D-06:** Ghost text never mutates committed text and clears cleanly on blur/focus-leave
  (PRED-06). On accept, insert the suggestion at the caret via `execCommand('insertText')`
  (undo-safe, PRED-02); cursor lands at end of inserted text.

### Coexistence with v1.0 compose / YOLO
- **D-07:** Inline prediction is the always-on background layer in valid fields. It is
  **suppressed while compose mode is active** and **while a translation loading overlay is
  showing** (field mid-mutation). No double overlays, no key contention.
- **D-08:** **Shared plumbing is reused, not duplicated** — `getActiveElement`,
  `isValidInputElement` (skips password/readonly/disabled/hidden + canvas-editor decline),
  field-text read, the single capture-phase keydown listener, and overlay positioning. Phase 5
  factors these so prediction and compose share one implementation.
- **D-09:** **Esc precedence:** if a ghost suggestion is showing, Esc dismisses the ghost
  first; with no ghost and compose active, Esc cancels compose (existing v1.0 behavior). Because
  prediction is suppressed during compose (D-07), these paths never collide.

### In-flight feedback
- **D-10:** **Silent** — no spinner/indicator while a prediction is being fetched. Ghost text
  simply appears when ready. Predictions fire far more often than translations, so a spinner
  would flicker. Superseded/stale prediction responses are **discarded** (latest-request-wins;
  guard with a request token/sequence so an in-flight result for outdated context is dropped).

### Language behavior (locked by requirements)
- **D-11:** Completion is produced in the **field's own language/context**, independent of the
  translate target-language setting — no forced translation of the completion (LANG-02). Works
  across `<input>`, `<textarea>`, `contenteditable`, reusing v1.0 field detection (LANG-01).

### Accept / dismiss keys (locked by requirements — not re-discussed)
- **D-12:** Tab (or Enter) accepts the showing suggestion; Esc dismisses without altering
  content; continued typing supersedes (PRED-02/03/05). Tab/Enter/Esc are fixed editor-idiomatic
  keys (per REQUIREMENTS Out of Scope); only the trigger/cycle keys are configurable. When no
  suggestion is showing, Tab/Enter/Esc retain native field behavior (don't hijack focus moves).

### Claude's Discretion
- Exact prediction prompt wording and whether prediction reuses the same configured model as
  translation or a lighter call — planner/researcher decide (PRED-04 only locks "via the
  existing background provider layer").
- Precise overlay caret-measurement technique for `<input>`/`<textarea>` (mirror-div vs.
  measured text width) — planner picks the robust approach.
- Request-token/abort mechanism for stale-response discarding.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — v1.1 requirements; Phase 5 owns PRED-01..06, LANG-01, LANG-02.
  Note the Out of Scope items (no streaming token-by-token; no after-cursor context; Tab/Enter/Esc
  fixed; no local model; canvas editors decline).
- `.planning/ROADMAP.md` — Phase 5 goal + success criteria; phases 6 (variations) and 7 (settings).

### Existing code (v1.0 patterns to reuse)
- `src/content.ts` — field detection (`getActiveElement`, `isValidInputElement`, `isCanvasEditor`),
  undo-safe insertion (`setElementText` → `execCommand('insertText')`), capture-phase keydown
  hotkey listener, absolute loading-overlay positioning, compose-mode state + Esc handling.
- `src/background.ts` — service-worker message handler + provider dispatch (the layer predictions
  call through).
- `src/providers/{openai,gemini,openrouter}.ts`, `src/providers/prompt.ts` — provider abstraction
  and prompt assembly the prediction call extends.
- `src/types.ts` — shared message/type definitions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getActiveElement()` / `isValidInputElement()` (`content.ts`): field detection + canvas/password/
  readonly exclusion — reuse verbatim for prediction eligibility (satisfies LANG-01).
- `setElementText()` pattern / `execCommand('insertText')`: undo-safe insertion — accept inserts
  the suggestion the same way (PRED-02). Reuse, don't duplicate.
- Loading-overlay positioning (`showLoadingOverlay`): absolute overlay aligned via
  `getBoundingClientRect` + scroll offsets, max z-index, `pointer-events:none` — the ghost-text
  overlay for input/textarea follows this exact technique (D-05).
- Capture-phase `keydown` listener (`content.ts` bottom): single in-page listener that v1.0
  hotkeys hang off; add prediction trigger/accept/dismiss handling here, not a second listener.
- Background message → provider dispatch (`background.ts` `translateText` path): prediction sends
  a new message type through the same channel (PRED-04).

### Established Patterns
- content.js is a **classic script** (no ESM import/export at top level — would break the content
  script). Keep prediction code in the same non-module style / file structure.
- Hotkeys live in-page on the capture-phase listener; `chrome.commands` is intentionally avoided
  (reserved-key conflicts). Prediction trigger/cycle keys follow this.
- Provider abstraction means prediction must not touch provider internals — only the
  background message contract.

### Integration Points
- New background message type (e.g. `predict`) handled in `background.ts`, dispatching to the
  active provider with a prediction prompt.
- New prediction state + ghost-overlay lifecycle in `content.ts`, gated by the compose/loading
  suppression rule (D-07).

</code_context>

<specifics>
## Specific Ideas

- "Auto mode available with configurable debounce and mins; default is manual trigger key, also
  configurable in settings" — verbatim user intent for D-01/D-02.
- User explicitly wants **no duplication** between prediction and the v1.0 compose/YOLO/translation
  paths — shared field/keydown/overlay plumbing factored once (D-08).

</specifics>

<deferred>
## Deferred Ideas

- Multiple alternate completions + in-field cycling → **Phase 6** (VAR-01..03).
- Options-page settings (enable/disable, debounce, max variations, trigger behavior, cycle key)
  → **Phase 7** (SET-01..05).
- Streaming token-by-token ghost text, after-cursor context, per-site allowlist, acceptance
  telemetry, multi-line completion → future milestone (REQUIREMENTS Future/Out of Scope).

</deferred>

---

*Phase: 5-Ghost-Text Prediction Engine*
*Context gathered: 2026-05-30*
