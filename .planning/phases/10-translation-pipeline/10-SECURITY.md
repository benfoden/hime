---
phase: 10
slug: translation-pipeline
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-10
---

# Phase 10 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Page → background worker | Content script sends `translateBatch` message with `{ items, config }` | Search result title/description text only (no URLs, no keys) |
| Worker → LLM provider | Worker calls `provider.translate()` with batch prompt + payload | Translatable text + LLM API key (key read from `chrome.storage`, never from message) |
| LLM reply → worker | Provider returns model text; `parseBatchReply` validates structure | Untrusted model output (treated as opaque data) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-10-01 | Information Disclosure | `buildBatchPayload` / translateBatch handler | mitigate | Payload built from `{t:title, d:description}` only; url/hostname/faviconUrl never referenced. Worker serializes only page-supplied `items` (`translate-batch.ts:17`, `background.ts:232-234`). | closed |
| T-10-02 | Tampering (XSS) | `mergeTranslations` output | mitigate | Translated strings carried as opaque data into `SearchResult` title/description; Phase 9 renderer assigns via `textContent`, never `innerHTML` (`translate-batch.ts:106`, `serp-render.ts:123,128`). | closed |
| T-10-03 | Tampering (prompt injection) | LLM reply structure | mitigate | `parseBatchReply` validates object + per-key `{t,d}` strings and iterates the original page-supplied `inputKeys` only — injected/renamed keys dropped; url/hostname carried verbatim (`translate-batch.ts:73-74`, `background.ts:233,254`). | closed |
| T-10-04 | Information Disclosure | API key in message | mitigate | LLM key read from `chrome.storage` via `getSettings()` inside the worker; `TranslateBatchMessage.payload` is `{ items, config }` only — no key field (`background.ts:222`, `types.ts:131-137`). | closed |
| T-10-05 | Denial of Service | unbounded/slow LLM call | mitigate | `Promise.race` caps `provider.translate` at 8000ms (D-04); on timeout the synthetic `AbortError` is classified via `classifyError` → `kind:'network'`, worker returns `{ error, kind:'network' }` and the page keeps its raw stage (XLT-05) (`background.ts:247-260`, `errors.ts:26-33`). Fixed in commit `e0f576b`. | closed |
| T-10-SC | Tampering (supply chain) | package installs | accept | No npm/pip/cargo installs in this phase; `package.json` untouched by Phase 10 commits. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-10-01 | T-10-SC | Phase 10 installs no packages; supply-chain surface unchanged. | Ben Foden | 2026-06-10 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-10 | 6 | 5 | 1 | gsd-security-auditor (initial — T-10-05 open) |
| 2026-06-10 | 6 | 6 | 0 | gsd-security-auditor (re-verify after fix `e0f576b`) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter
