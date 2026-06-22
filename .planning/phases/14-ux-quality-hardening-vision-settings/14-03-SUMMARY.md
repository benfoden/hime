---
phase: 14-ux-quality-hardening-vision-settings
plan: "03"
subsystem: panel-render
tags: [panel, render, css, copy, cjk, affordance, img-06, d-01, d-02, d-03, d-04]
dependency_graph:
  requires: [14-01]
  provides: [panel-num chip, panel-note CJK, panel-copy button, show-original toggle, is-collapsed original block]
  affects: [src/panel-render.ts, src/sidepanel.css, test/panel-render.mjs]
tech_stack:
  added: []
  patterns: [el() textContent-only rendering (IMG-02), data-attribute handoff to browser-only host, collapsed original block revealed by sidepanel.ts]
key_files:
  created: []
  modified:
    - src/panel-render.ts
    - src/sidepanel.css
    - test/panel-render.mjs
decisions:
  - "panel-num chip guarded on himeNum != null so legacy storage.session entries render without a chip (optional-field pattern)"
  - "panel-original block rendered collapsed (is-collapsed) via CSS display:none; toggle reveal deferred to sidepanel.ts (14-04) to keep panel-render.ts node-testable"
  - "originalBlock uses textContent then appendChild(copyBtn) so original text is set safely before the child button is appended"
  - "Copy original button appended inside the collapsed originalBlock so both text and its copy path travel together"
  - "is-collapsed CSS rule uses display:none — simple, togglable by class removal in sidepanel.ts without any JS knowledge in this module"
metrics:
  duration_minutes: 35
  completed_date: "2026-06-21"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
  tests_added: 10
  tests_total: 18
---

# Phase 14 Plan 03: Panel-Render Affordances Summary

**One-liner:** textContent-only `[hime N]` chip, CJK/vertical note, sharpened error card, Copy button + collapsed show-original toggle — all via the `el()` helper, no navigator in panel-render.ts.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | [hime N] chip + CJK note + reason-bearing failure card | 308520d | src/panel-render.ts, src/sidepanel.css, test/panel-render.mjs |
| 2 | Copy button + show-original toggle nodes | d0c74b9 | src/panel-render.ts, src/sidepanel.css, test/panel-render.mjs |

## What Was Built

### Task 1 — `[hime N]` chip, CJK note, error card sharpening

**`src/panel-render.ts`:**
- `panel-num` chip prepended on EVERY `ImageEntry` kind (`loading`, `populated`, `no-text`, `error`), guarded on `entry.himeNum != null` so pre-Phase-14 persisted entries still render without it (optional-field law from types.ts).
- `panel-note` conditional appended in the `populated` branch after the low-confidence badge: `if (entry.verticalOrCjk)` — renders `'vertical/CJK text — OCR may be imperfect'` via `el()` textContent-only. Absent when `verticalOrCjk` is false or undefined (no standing disclaimer).
- D-02 error card: `entry.message` already renders the worker's reason-naming string (from 14-01's classified error pipeline); confirmed via tests. The two branches (`no-text`, `error`) remain separate.

**`src/sidepanel.css`:**
- `.panel-num`: monospace, 11px, `#1a73e8` on `#e8f0fe` background with `#aecbfa` border — mirrors the content-script on-image badge style.
- `.panel-note`: 12px, `#4d5156`, italic — modeled on `.panel-direction`.
- `.panel-error .panel-message`: added `border-left: 4px solid #c5221f` accent on top of the existing red box — makes the failure card unmistakably distinct from the muted italic `.panel-no-text .panel-message`.

**`test/panel-render.mjs`:** 7 new cases — chip on populated/no-text/error, chip absent for legacy, CJK note conditional (true/false/absent), error vs no-text class distinction, XSS probe in error message.

### Task 2 — Copy button + show-original toggle (IMG-06, D-01)

**`src/panel-render.ts`** (populated branch):
- `panel-copy` button: `el(doc, 'button', { text: 'Copy', className: 'panel-copy' })` + `setAttribute('data-copy', entry.result.translatedText)` + `data-copy-kind="translation"`. No click listener — browser-only `navigator.clipboard` wired in sidepanel.ts (14-04).
- `panel-show-original` toggle: `el(doc, 'button', { text: 'show original', className: 'panel-show-original' })`. No click listener.
- `panel-original` block rendered with `is-collapsed` class by default. `textContent = entry.result.originalText` set directly (safe via the property), then the original copy button appended inside the block: `data-copy=originalText`, `data-copy-kind="original"`.

**`src/sidepanel.css`:**
- `.panel-copy`: minimal button style (white bg, `#4A90D9` text, border, border-radius, hover state).
- `.panel-show-original`: link-like (no bg/border, underline, `#4d5156`).
- `.is-collapsed { display: none; }`: the toggle-reveal mechanism; class removed by the sidepanel.ts host.

**`test/panel-render.mjs`:** 3 new cases — Copy button with correct data-copy/kind, show-original toggle present, collapsed original block with its own copy node; navigator-free render verification; XSS probe through data-copy attribute.

## Verification

```
npm run build   → clean (tsc 0 errors)
node --test test/panel-render.mjs  → 18/18 pass
npm test        → 177/177 pass (2 skipped: live API keys not set)
```

Acceptance criteria grep results:
- `rg "panel-num|verticalOrCjk|panel-note" src/panel-render.ts` — 6 matches (chip prepend on 4 kinds + note conditional + text)
- `rg "\.panel-num|\.panel-note" src/sidepanel.css` — both classes present
- `rg "innerHTML|navigator" src/panel-render.ts` — comments only, no code-level usage
- `rg "\.panel-copy|\.panel-show-original" src/sidepanel.css` — both present
- `rg "is-collapsed" src/panel-render.ts` — original block rendered collapsed by default

## Deviations from Plan

None — plan executed exactly as written.

The one minor interpretation call: the plan said `panel-original` should be rendered "collapsed" — implemented via `is-collapsed` CSS class (`display: none`) instead of HTML `hidden` attribute, keeping reveal to a single class toggle in the sidepanel.ts host. This is within the "keep markup minimal (Claude's Discretion)" intent.

## Threat Flags

None. No new network endpoints, auth paths, or file access patterns introduced. The `data-copy` attribute holds OCR/translation strings already visible in the same entry — no new disclosure surface (T-14-08 accepted as per threat model).

## Self-Check: PASSED

- [x] `src/panel-render.ts` modified — exists and was committed in 308520d + d0c74b9
- [x] `src/sidepanel.css` modified — exists and was committed in both commits
- [x] `test/panel-render.mjs` modified — exists and was committed in both commits
- [x] Commit 308520d exists: `git log --oneline | grep 308520d` ✓
- [x] Commit d0c74b9 exists: `git log --oneline | grep d0c74b9` ✓
- [x] 18 tests pass, 0 fail
- [x] `npm run build` exits 0
- [x] No `innerHTML` or `navigator` in panel-render.ts code
