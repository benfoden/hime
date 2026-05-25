# Phase 2: Prompt Quality & Error Hardening — Context

**Date:** 2026-05-24
**Goal:** Translations are clean and failures surface actionable feedback.

<domain>
Harden the existing translation pipeline (compose + YOLO modes) so that: (a) auto-formality
reliably infers register, and (b) every failure mode produces a distinct, user-visible,
actionable signal instead of a silent hang or generic error. No new user-facing capabilities —
this phase improves quality and resilience of what Phase 1 already shipped.
</domain>

<decisions>

### Error → message mapping (ERR-03/04/05, LOG-02)
- Add a shared `classifyError(provider, err, response?)` helper returning `{ kind, message }`
  where `kind ∈ { auth | rate_limit | network | unknown }`.
- Status mapping:
  - `401 | 403` → kind `auth`, message "Invalid or unauthorized API key — check it in options"
  - `429` → kind `rate_limit`, message "Rate limited by {provider} — wait and retry"
  - `AbortError` (timeout) or fetch `TypeError` (offline) → kind `network`, message "Network error — request timed out or offline"
  - any other 4xx/5xx → kind `unknown`, message "{provider} error {status}: {body message}"
- UI uses `kind` to drive badge/notification distinctly (not just badge color).

### Timeout + restore on failure (ERR-03, YOLO-03)
- Wrap provider fetch in `AbortController` with **10s** timeout.
- Snapshot original field content BEFORE replacement (both compose and YOLO).
- On ANY failure: restore the snapshot, set badge red "ERR".
- Badge clears on next successful translation (ERR-02 already implemented — reuse).

### Auto-formality prompt tuning (FORM-06/07)
- Instruction-only refinement first (no full few-shot — keeps latency/token cost low).
- Add 2–3 inline register cues to the Auto formality instruction (casual input→casual output,
  business/formal input→polite/formal output) with one short illustrative pair.
- Validate against the FORM-06/07 acceptance inputs (casual "hey what's up", business
  "Thank you for your help with this matter").

### Logging detail (LOG-02)
- `console.error` a structured object `{ provider, model, status, kind, endpoint, message }` on failure.
- No remote/telemetry logging — BYOK, no backend (consistent with PROJECT.md architecture).

</decisions>

<canonical_refs>
- `.planning/REQUIREMENTS.md` — Phase 2 reqs: FORM-06/07, ERR-03/04/05, LOG-02, YOLO-03
- `.planning/ROADMAP.md` — Phase 2 goal + boundary
- `src/background.ts` — message routing, translate dispatch, error surfacing (lines ~64,119,152)
- `src/providers/openai.ts` / `src/providers/gemini.ts` — fetch + generic error throw (line ~26-31)
- `src/content.ts` — field read/replace (snapshot/restore lives here)
- `PROJECT.md` — System prompt + formality instruction templates (Decision Log)
</canonical_refs>

<code_context>
**Reusable / integration points:**
- Provider abstraction already exists (`providers/openai.ts`, `providers/gemini.ts`) — add timeout + classifyError at this layer.
- Badge already supports red "ERR" (ERR-01 done) and auto-clear (ERR-02 done) — reuse, don't rebuild.
- `formality: 'auto'` default already wired in `background.ts:39`; prompt template lives in PROJECT.md Decision Log.
- Errors currently collapse to `new Error("{provider} API error: {status}")` — replace with classifyError at throw sites.
- No timeout exists today — fetch can hang indefinitely (root cause of ERR-03 gap).
</code_context>

<deferred>
- Retry-with-backoff on 429/5xx — not in this phase (surface the error first; auto-retry is its own decision).
- Streaming / translate-as-you-type — out of v1 scope per PROJECT.md.
- Few-shot prompt examples — only if instruction-only tuning fails FORM-06/07 validation.
</deferred>
