---
phase: 15
slug: in-place-page-text-translation-triggers
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-22
updated: 2026-06-22
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node built-in `node:test` + `node:assert/strict` + `linkedom` (project standard) |
| **Config file** | none — `package.json` `test` script: `tsc && node --test 'test/**/*.mjs'` |
| **Quick run command** | `npm run build && node --test test/page-walk.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** `npm run build && node --test test/page-walk.mjs` (Wave 1) / `npm run build` (Waves 2-4 are wiring/UI verified by build + manual checkpoint)
- **After every plan wave:** `npm test`
- **Before `/gsd-verify-work`:** Full suite green + manual load-unpacked verify (checkpoints 15-02/03/04)
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | PAGE-04 | T-15-04 | translatePageBatch payload carries no API key | unit (compile) | `npm run build` | ❌ W0 (types) | ⬜ pending |
| 15-01-02 | 01 | 1 | PAGE-01/02/04/05 | T-15-01 / T-15-02 | parsePageBatchReply iterates inputKeys only, string-typed; pure module no chrome.*/innerHTML | unit | `node --test test/page-walk.mjs` | ❌ W0 | ⬜ pending |
| 15-01-03 | 01 | 1 | PAGE-01/02/03/04/05 | T-15-01 | walk skip-set, chunk sizing, key-injection drop, once-only restore, failed-set retry | unit | `node --test test/page-walk.mjs` | ❌ W0 | ⬜ pending |
| 15-02-01 | 02 | 2 | PAGE-04 | T-15-04 / T-15-05 | worker reads key from storage only; key-injection-guarded parse | unit (compile) | `npm run build` | ✅ (build) | ⬜ pending |
| 15-02-02 | 02 | 2 | TRIG-01 | T-15-06 | context-menu dispatch guarded against restricted tabs | unit (compile) | `npm run build` | ✅ (build) | ⬜ pending |
| 15-02-03 | 02 | 2 | TRIG-01 | T-15-06 | popup dispatch try/catch on restricted tabs; state mirror | unit (compile) | `npm run build` | ✅ (build) | ⬜ pending |
| 15-02-04 | 02 | 2 | TRIG-01 | T-15-06 | triggers dispatch + no-op on restricted tabs | manual | load-unpacked checkpoint | manual | ⬜ pending |
| 15-03-01 | 03 | 3 | PAGE-01/02/05 | T-15-07 / T-15-10 | nodeValue-only replace (no innerHTML); read-then-write | unit (compile) | `npm run build` | ✅ (build) | ⬜ pending |
| 15-03-02 | 03 | 3 | PAGE-03 | T-15-07 / T-15-08 | toggle via strong array; state mirror; no key on page | unit (compile) | `npm run build` | ✅ (build) | ⬜ pending |
| 15-03-03 | 03 | 3 | PAGE-01/02/03/05 | T-15-07 / T-15-08 | in-place replace, toggle round-trip, static snapshot, no key leak | manual | load-unpacked checkpoint | manual | ⬜ pending |
| 15-04-01 | 04 | 4 | TRIG-02/03 | T-15-11 / T-15-12 | gate-before-spend; banner textContent-only; per-origin session dismissal | unit (compile) | `npm run build` | ✅ (build) | ⬜ pending |
| 15-04-02 | 04 | 4 | PAGE-04 | T-15-12 / T-15-14 | single-toast (no stack); retry scoped to failed Set; no innerHTML | unit (compile) | `npm run build` | ✅ (build) | ⬜ pending |
| 15-04-03 | 04 | 4 | TRIG-02/03 + PAGE-04 | T-15-11..14 | banner gating + sticky dismissal + same-lang no-banner + partial-failure retry | manual | load-unpacked checkpoint | manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/page-walk.mjs` — covers PAGE-01/02/03/04/05 pure logic + V5 key-injection guard + D-04 failed-set (Plan 01 Task 3 creates it)
- [ ] `src/page-walk.ts` must export pure helpers (no `chrome.*`, recursive-walk variant) for the harness (Plan 01 Task 2 creates it)
- Framework install: none — `node:test`, `node:assert`, `linkedom` all present as devDeps.

*All MISSING automated references are produced inside Wave 1 (Plan 01) before any consumer depends on them.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| In-place replace preserves layout/links; code/pre/script untranslated | PAGE-01, PAGE-02 | Requires real DOM + CSS layout + live link/form interactivity (MEMORY.md: no SW-console tests) | 15-03 Task 3 steps 2-3 |
| Toggle pill + popup mirror round-trips to exact original, no reload | PAGE-03 | Live in-page UI + popup gesture | 15-03 Task 3 steps 3-4 |
| Post-trigger DOM content not auto-translated (static snapshot) | PAGE-05 | Needs real dynamic/infinite-scroll page | 15-03 Task 3 step 5 |
| Key never reaches the page | PAGE-04 (security) | DevTools network/console inspection | 15-03 Task 3 step 6 |
| Right-click + popup triggers fire; restricted-tab no-op | TRIG-01 | Live context menu + restricted pages | 15-02 Task 4 |
| Auto-offer banner gating + sticky per-origin dismissal; same-lang no banner | TRIG-02, TRIG-03 | Live banner across real foreign/same-language origins + session lifetime | 15-04 Task 3 steps 2-4 |
| Partial-failure: successes applied, single toast + red badge + retry-failed | PAGE-04 / D-04 | Requires inducing real chunk failures + observing badge/toast | 15-04 Task 3 step 5 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (auto tasks: build/test; checkpoints: human-check + manual map)
- [x] Sampling continuity: no 3 consecutive auto tasks without automated verify (every auto task runs `npm run build`; Plan 01 runs the test suite)
- [x] Wave 0 covers all MISSING references (page-walk.ts + test/page-walk.mjs created in Wave 1 before any consumer)
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-22
