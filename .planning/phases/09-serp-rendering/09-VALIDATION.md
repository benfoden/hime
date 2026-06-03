---
phase: 9
slug: serp-rendering
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-03
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `09-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (built-in, Node 24) + `node:assert/strict` |
| **Config file** | none — convention only; `npm test` = `tsc && node --test 'test/**/*.mjs'` |
| **DOM provider** | `linkedom` (`parseHTML`) — Wave 0 dev-dependency install |
| **Quick run command** | `npm run build && node --test test/serp.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

**Repo conventions (verified):** tests are `.mjs`, import the **compiled** module from `../dist/*.js` (never `src/`); `node:test` + `node:assert/strict`; resolve dist paths via `fileURLToPath(import.meta.url)`. **Project law:** verify against `dist/`, NEVER the service-worker console — the renderer + mocks MUST be importable so the node test asserts XSS-safety and verbatim hrefs headlessly (this is why `serp-render.ts` is DOM-agnostic, `document` injected).

---

## Sampling Rate

- **After every task commit:** Run `npm run build && node --test test/serp.mjs`
- **After every plan wave:** Run `npm test` (keeps Phase 8 transport/error tests green too)
- **Before `/gsd-verify-work`:** Full suite green + manual `?state=` walkthrough of all 7 states
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-W0 | 0 | 0 | infra | — | linkedom installed; serp-render DOM-agnostic; mocks exported | smoke | `node -e "require('linkedom')"` | ❌ W0 | ⬜ pending |
| 09-SERP-01a | tbd | 1 | SERP-01 | — | row renders favicon node + hostname + title anchor + snippet | unit | `node --test test/serp.mjs` | ❌ W0 | ⬜ pending |
| 09-SERP-01b | tbd | 1 | SERP-01 | T-info-leak | no `faviconUrl` → letter-tile span (not img), first letter uppercased; no network | unit | `node --test test/serp.mjs` | ❌ W0 | ⬜ pending |
| 09-SERP-02 | tbd | 1 | SERP-02 | T-url-tamper | `getAttribute('href')` equals mock `url` byte-for-byte (NOT `.href`); `rel=noopener noreferrer` | unit | `node --test test/serp.mjs` | ❌ W0 | ⬜ pending |
| 09-SERP-03a | tbd | 1 | SERP-03 | T-xss | after XSS mock render, `mount.querySelectorAll('script').length === 0` AND payload present as textContent | unit | `node --test test/serp.mjs` | ❌ W0 | ⬜ pending |
| 09-SERP-03b | tbd | 1 | SERP-03 | T-xss | `<strong>`-containing description → snippet node `.children.length === 0` (tags neutralized, never innerHTML) | unit | `node --test test/serp.mjs` | ❌ W0 | ⬜ pending |
| 09-SERP-04 | tbd | 1 | SERP-04 | — | `loading` state renders ≥1 `.serp-skeleton` row and zero `.serp-row` | unit | `node --test test/serp.mjs` | ❌ W0 | ⬜ pending |
| 09-SERP-05a | tbd | 1 | SERP-05 | — | `empty` state renders distinct empty notice, no rows | unit | `node --test test/serp.mjs` | ❌ W0 | ⬜ pending |
| 09-SERP-05b | tbd | 1 | SERP-05 | — | each error kind (`auth`/`network`/`search_quota`/`unknown`) distinct copy; quota matches /quota/i + "search quota exceeded"; no retry timer | unit | `node --test test/serp.mjs` | ❌ W0 | ⬜ pending |
| 09-BUILD | tbd | 1 | build | — | `dist/search.{html,css,js}` exist after build | smoke | `npm run build && ls dist/search.html dist/search.css dist/search.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `npm install --save-dev linkedom` — DOM provider for the renderer test
- [ ] `src/serp-render.ts` — DOM-agnostic `renderSerp(state, doc, mount)` (`document` injected) so node can import it
- [ ] `src/search-mock.ts` — exports the XSS probe + all 7 states; page and test import the SAME fixtures
- [ ] `test/serp.mjs` — covers SERP-01..05 (imports `dist/serp-render.js` + `dist/search-mock.js`, drives a linkedom document)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Light-theme Google-style layout matches design direction | SERP-01 (D-04 fidelity) | Visual aesthetic not machine-assertable | Open `dist/search.html?state=populated` in browser; cycle all 7 `?state=` values (populated/skeleton/empty/auth/network/quota/unknown) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (linkedom, serp-render, search-mock, test/serp.mjs)
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
