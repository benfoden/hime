---
phase: 8
slug: api-integration-scaffold
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-03
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in test runner (`node --test`) over compiled `.mjs` |
| **Config file** | none — `tsconfig.json` drives the `tsc` precompile; tests live in `test/*.mjs` |
| **Quick run command** | `npm test` (`tsc && node --test 'test/**/*.mjs'`) |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10–20 seconds (tsc compile dominates) |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 8-xx | brave-client | — | SRCH-04 | — | URL built with q/count; X-Subscription-Token header set; key never logged | unit | `npm test` | ❌ W0 | ⬜ pending |
| 8-xx | brave-client | — | SERP-02 (contract) | — | `SearchResult.url` is verbatim Brave `web.results[].url`, unmutated | unit | `npm test` | ❌ W0 | ⬜ pending |
| 8-xx | brave-client | — | SRCH-05 | — | source==target → `direct:true`, no translation branch entered | unit | `npm test` | ❌ W0 | ⬜ pending |
| 8-xx | brave-client | — | SRCH-06 | — | duplicate in-flight query → single Brave fetch (call count asserted) | unit | `npm test` | ❌ W0 | ⬜ pending |
| 8-xx | error-model | — | SERP-05 / D-07 | — | HTTP 429 → kind `search_quota`, message "search quota exceeded", no retry | unit | `npm test` | ❌ W0 | ⬜ pending |
| 8-xx | error-model | — | SERP-05 | — | non-429 network failure → distinct kind, not `search_quota` | unit | `npm test` | ❌ W0 | ⬜ pending |
| 8-xx | bg-handler | — | XLT-01 | — | searchTranslated routes through background; key read in worker only | unit | `npm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs finalized by planner; rows map requirements → automated assertions.*

---

## Wave 0 Requirements

- [ ] `test/unit.mjs` — extend with BraveSearchClient URL/header/dedup assertions, error-classification (429→search_quota), source==target short-circuit, and searchTranslated routing. **Single shared test file** — to avoid the wave test-file race (BUG-4), do NOT co-schedule two plans that both edit `test/unit.mjs` in the same wave; serialize test edits or scope each plan to its own assertions added at wave end.
- [ ] Mock `fetch` / `chrome.storage.local` in-test (no live Brave calls in unit tests; live validation is manual via Test Brave Key).

*Existing infrastructure (`node --test`) covers all automated phase requirements — no new framework install.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "Test Brave Key" validates a real key against the live endpoint | SSET-02, SC#1 | Requires a real Brave API key + network; can't run in CI | In options page, enter a valid Brave key → click Test Brave Key → expect success; enter a bad key → expect human-readable invalid-key error; empty → "key required". |
| Live searchTranslated round-trip returns real results | SRCH-04, SC#2 | Requires live Brave key + loaded extension | Load unpacked dist, send searchTranslated from a page console, confirm a result array returns and no key is exposed to the page. |
| Live 429 surfaces as "search quota exceeded" | SERP-05, SC#4 | Hard to force 429 deterministically without burning quota | Exhaust quota or mock at the network layer; confirm message + no auto-retry. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
