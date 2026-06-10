# Phase 10: Translation Pipeline — Discussion Log

**Date:** 2026-06-10
**Mode:** discuss (helm-driven, interactive)

## Areas presented

User selected all four gray areas. Two carried real forks (asked explicitly);
two were req-determined and locked to recommended defaults.

### 1. Data-flow / message contract (forked)
- **Options:** Two messages (rec) / Long-lived port / Fold into one response.
- **Chosen:** Two messages — `searchTranslated` stays raw (Phase 8 unchanged),
  add `translateBatch`; page drives skeleton→raw→translated.
- **Why:** Single request/response per message, no SW port lifecycle, clean
  two-call contract for Phase 11. Fold-into-one rejected (loses raw stage →
  violates success criterion 3).

### 2. Keyed-JSON shape (locked to rec)
- **Chosen:** Single batched call, nested per-index `{"0":{"t","d"}}`, only
  title+description in prompt (XLT-04), reuse `provider.translate(text)` with
  keyed-JSON payload.

### 3. Count-assertion granularity (locked to rec)
- **Chosen:** Per-item fallback — missing/extra/malformed keys → that item shows
  raw; valid keys translate; non-JSON reply → all raw (XLT-03).

### 4. Timeout / failure handling (forked)
- **Options:** Explicit abort ~8s (rec) / Provider default only / Shorter ~4s.
- **Chosen:** Explicit `AbortController` ~8s. On timeout/error, page keeps the
  already-rendered raw stage (XLT-05, success criterion 4).

## Additional decision
- **Overlay rendering:** No renderer change — re-render `populated` with merged
  translated `SearchResult[]` through existing `renderSerp`.

## Deferred ideas
- None raised. Batch-size chunking noted as a non-issue at current Brave
  `count: 10`.
