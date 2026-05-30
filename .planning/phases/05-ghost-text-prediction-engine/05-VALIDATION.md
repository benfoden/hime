---
phase: 5
slug: ghost-text-prediction-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-30
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in) + tsc typecheck |
| **Config file** | none — `package.json` scripts |
| **Quick run command** | `node --test test/unit.mjs` |
| **Full suite command** | `npm test` (tsc && node --test 'test/**/*.mjs') |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/unit.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green + `tsc` clean
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (filled by planner per PLAN.md) | — | — | PRED-01..06 / LANG-01..02 | — | — | unit | `node --test test/unit.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/unit.mjs` — add suites for: debounce/race guard (stale-response rejection by seq+element), suggestion text sanitation (strip punctuation/newlines, trim to 2-3 words), language passthrough (LANG-01/02), field-eligibility filter (password/readonly/hidden/disabled rejected).
- [ ] Existing `node:test` infra covers unit-testable logic — no framework install needed.

*Pure-DOM rendering and execCommand undo behavior are browser-only — see Manual-Only below.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Ghost-text renders correctly over input/textarea/contenteditable | PRED-01 | Requires real DOM layout + caret geometry | Load unpacked extension, type in each field type, confirm ghost text aligns after caret |
| Tab/Enter accept joins native undo stack (Ctrl+Z reverts cleanly) | PRED-02 | execCommand undo-stack behavior is browser-runtime only | Accept a suggestion, press Ctrl+Z, confirm clean revert |
| Esc dismiss + continue-typing never corrupts committed text | PRED-03, PRED-04 | Live keystroke timing | Trigger suggestion, press Esc / keep typing, confirm no duplication or corruption |
| Clears on blur/focus-leave | PRED-05 | Focus events on live DOM | Trigger suggestion, click away, confirm ghost text gone |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (browser-only behaviors listed Manual-Only)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
