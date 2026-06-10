---
phase: 10
slug: translation-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-10
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in `node --test`) over compiled `dist/` |
| **Config file** | none — `tsc` compiles `src/` → `dist/`, harness imports `dist/*.js` |
| **Quick run command** | `npm run build && node --test test/translation-batch.mjs` |
| **Full suite command** | `npm test` (`tsc && node --test 'test/**/*.mjs'`) |
| **Estimated runtime** | ~5–10 seconds |

> Project convention: verify hime via the node harness on `dist/`, NEVER the
> service-worker console. Pure functions in `src/translate-batch.ts` are imported
> from `dist/translate-batch.js` and exercised directly — no browser needed.

---

## Sampling Rate

- **After every task commit:** Run `npm run build && node --test test/translation-batch.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

> Filled by the planner per task. Coverage must address XLT-02..05 behaviors:
> keyed-JSON batch build, per-item count-mismatch fallback, URL-never-sent,
> XSS-safe translated text, and timeout-leaves-raw.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | XLT-02 | — | keyed-JSON `{i:{t,d}}` payload built from results | unit | `node --test test/translation-batch.mjs` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | XLT-04 | T-10-01 | URLs/hostnames never present in batch payload | unit | `node --test test/translation-batch.mjs` | ❌ W0 | ⬜ pending |
| 10-01-03 | 01 | 1 | XLT-03 | — | per-key parse → missing/malformed key falls back to raw | unit | `node --test test/translation-batch.mjs` | ❌ W0 | ⬜ pending |
| 10-02-01 | 02 | 2 | XLT-05 | — | timeout/error path leaves raw results rendered | unit | `node --test test/translation-batch.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs above are indicative — planner finalizes the map.*

---

## Wave 0 Requirements

- [ ] `test/translation-batch.mjs` — unit harness importing `dist/translate-batch.js`
- [ ] Fixtures: a mock `SearchResult[]` incl. a row with `<script>`/`<strong>` in
      `description` (XSS-safety carryover) and a row with HTML in `title`.

*Existing `test/serp.mjs` is the structural analog for the new harness.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live 3-stage render (skeleton→raw→translated) in a real browser | XLT-05 | Requires a loaded extension + live Brave/LLM keys; page wiring lands in Phase 11 | Deferred to Phase 11 verify-work; Phase 10 validates pure pipeline functions via harness |

*Pure pipeline behaviors (XLT-02/03/04 + timeout fallback logic) have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
