# Phase 3: Cross-Site Compatibility - Context

**Gathered:** 2026-05-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Make hime's compose + YOLO modes work reliably on 7 high-traffic complex editors:
Gmail compose, Google Docs, Notion, Slack web, Discord web, Twitter/X, and GitHub.
This phase adapts the existing content script to handle Shadow DOM, non-standard
contenteditable implementations, and canvas-based editors. No new user-facing
capabilities — this phase extends reach of what Phase 1+2 already shipped.

</domain>

<decisions>
## Implementation Decisions

### Shadow DOM traversal (D-01)
- **D-01:** One-level shadow root traversal only. `getActiveElement()` checks
  `document.activeElement`, then if it has an open `.shadowRoot`, checks
  `.shadowRoot.activeElement` once. No recursive walk. Closed shadow roots are
  skipped — treat the host element as the target.

### Iframe injection (D-02)
- **D-02:** Keep top-frame only. Do NOT add `all_frames: true` to the manifest.
  If Gmail compose or other editors use iframes, hime won't inject there.
  Test and document which editors work vs don't under this constraint.

### Google Docs strategy (D-03)
- **D-03:** Graceful degradation. Detect Google Docs via feature detection (canvas-based
  editor, no real contenteditable text nodes) — NOT URL matching. When detected, show
  a clear user message ("hime doesn't support this editor"). Don't attempt partial hacks.

### Site-specific detection approach (D-04)
- **D-04:** Feature detection only. No URL-based site detection or per-site adapter map.
  Branch on DOM capabilities: is it contenteditable? Does it have a shadow root?
  Is it a canvas-rendered editor? Google Docs degradation message also uses feature
  detection, not URL check.

### Loading indicator — YOLO-02 (D-05)
- **D-05:** During API call, dim the active field to 50% opacity AND show a floating
  overlay label ("translating...") positioned over the dimmed field. Original text
  remains visible underneath. Badge still shows orange '...' in toolbar. On completion
  or failure, remove overlay and restore opacity.

### Failure restore — YOLO-03 (D-06)
- **D-06:** Already have snapshot-restore from Phase 2. Extend to all site-specific
  code paths. On ANY failure, restore the snapshot and clear the loading overlay.

### Focus-leave cleanup — COMP-07 (D-07)
- **D-07:** When focus leaves the active compose field, clear the blue border AND
  the "ON" badge. `handleFocusChange()` already partially handles this — ensure it
  fires reliably on complex editors where focus events may behave differently.

### Cursor preservation — REPL-03 (D-08)
- **D-08:** After translation completes, cursor should be at end of inserted text.
  `execCommand('insertText')` naturally leaves cursor at insertion end — verify this
  holds on each target editor. If a site moves cursor, restore it.

### Compose trigger — COMP-06 (D-09)
- **D-09:** Compose mode triggers translation when user presses the compose hotkey
  again (Ctrl+Y toggles on/off, second press translates). This is already implemented.
  Verify it works on all target editors — the in-page keydown listener uses capture
  phase which should intercept before site handlers.

### Claude's Discretion
- Overlay implementation details (CSS positioning, z-index, styling of the "translating..." label)
- Exact feature detection heuristics for canvas-based editors vs standard contenteditable
- Whether to log site compatibility findings to console for debugging

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — Phase 3 reqs: FIELD-08 through FIELD-14, REPL-03, COMP-06, COMP-07, YOLO-02, YOLO-03

### Architecture
- `.planning/PROJECT.md` — Key decisions: execCommand for undo-safe replacement, in-page hotkeys, no backend
- `.planning/ROADMAP.md` — Phase 3 goal + success criteria + dependency on Phase 2

### Source code
- `src/content.ts` — Field detection (`getActiveElement`, `isValidInputElement`), text replacement (`setElementText`), compose state, hotkey listener
- `manifest.json` — Content script injection config (currently top-frame only, `<all_urls>`)

### Prior phase context
- `.planning/phases/02-prompt-quality-error-hardening/02-CONTEXT.md` — Error classification, snapshot-restore pattern, badge conventions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getActiveElement()` — needs one-level shadow root extension
- `setElementText()` — execCommand approach works for standard contenteditable; canvas editors need detection + skip
- `badgeForKind()` — error badge mapping, reuse as-is
- Snapshot-restore pattern in `yoloTranslate()` and `convertComposeMode()` — extend with overlay

### Established Patterns
- In-page capture-phase keydown listener for hotkeys — should work cross-site since capture fires before site handlers
- Badge as primary status indicator (`ON`, `...`, `ERR`, `KEY`, `RATE`, `NET`)
- Content script is a classic (non-module) script — no imports, types defined locally

### Integration Points
- `getActiveElement()` — single point to add shadow DOM traversal
- `isValidInputElement()` — add canvas-editor detection here for graceful degradation
- `setElementText()` — add loading overlay before replacement, remove after
- `handleFocusChange()` — ensure it fires for shadow DOM elements
- `manifest.json` content_scripts — currently no `all_frames` (keeping it that way per D-02)

</code_context>

<specifics>
## Specific Ideas

- Loading overlay should feel like terminal UI — text-based, not spinners or animations
- Dim effect at 50% opacity on the field itself, overlay text positioned on top

</specifics>

<deferred>
## Deferred Ideas

- **Lightweight desktop app as system-wide IME** — fundamentally different product surface requiring OS-level keyboard hooks (IBus/Fcitx on Linux, TSF on Windows, Input Sources on macOS). Consider for v2+ as a separate project.
- **Native Linux IME pathway** — related to above. IBus or Fcitx integration would give system-wide input method support beyond the browser. Separate product scope.
- **`all_frames` iframe injection** — if testing reveals critical editors (Gmail compose) require iframe injection, revisit D-02 in a future phase.

</deferred>

---

*Phase: 3-Cross-Site Compatibility*
*Context gathered: 2026-05-25*
