# Agent-Native CLI — Design Findings

> Status: design findings + open research. Captured 2026-06-25 during v1.5 vision discussion.
> Decision so far: **core refactor first → agentic CLI. No MCP server.** Differentiator scope TBD.
> Open research: validate Layer 0 contract against external exemplars (see bottom).

## Thesis

hime's translation engine (BYOK LLM providers, Vision OCR, keyed-JSON batch, SERP) is
currently trapped behind a Chrome service-worker message bus — humans click, that's the
ceiling. The 10x move is **stop making translation a UI humans click; make it a capability
agents wield in a loop.** Same engine, new front door.

Architecture: extract a pure `@hime/core` lib (no `chrome.*` deps) from
`src/translate-batch.ts`, `src/providers/*`, `src/query-translate.ts`, `src/image-resolve.ts`.
Extension imports it; CLI imports it. One engine, two surfaces.

```
@hime/core      pure TS: translate(), ocrTranslate(), searchTranslated(), translatePage()
  ├── extension  (existing — swap inline logic → import core)
  └── hime-cli   (humans + agents that shell out)
```

## Two layers — do not conflate

The usual mistake: treating "agent-native" as a feature. It's two distinct layers. Layer 0
is the **interface contract** that makes any CLI agent-legible — non-negotiable, cheap.
The differentiators are **translation-specific capability** only possible with an agent in
the loop — that's where you pick bets.

---

## Layer 0 — interface contract (the floor, not a feature)

What makes any CLI agent-native at the seam. This is what `gh` and similar agent-legible
tools get right. Without it, every differentiator below is invisible to an agent. With it,
even plain `hime translate` is already far more useful than the extension.

- **`--json` on every command**, stable + **versioned schema**. Human-pretty by default,
  machine-clean on the flag.
- **Meaningful exit codes** — success / partial / auth-fail / rate-limited / bad-input — so
  an agent branches without parsing prose. (eng-standards: typed/meaningful exit codes.)
- **Cost + token counts + confidence score in the output payload.** An agent must account
  for spend and decide whether to trust a result.
- **NDJSON streaming** for long jobs — agent sees progress, acts on partials.
- **`--dry-run` + idempotency** — agent plans before it spends.
- **Validate args at the boundary** (eng-standards CLI rule); don't assume an interactive TTY.

---

## The four differentiators — payoff vs tradeoff

### 1. Roundtrip fidelity verification — the headline 10x
Translate → back-translate → compare → emit confidence signal + flag drift.

- **Payoff:** an agent cannot eyeball CJK output to know it's right. This is the one
  capability that turns translation from fire-and-hope into a closed loop the agent can
  trust, retry, or escalate on. A click-UI fundamentally cannot do this → pure agent value.
- **Tradeoff:** 2–3× token cost (back-translation, plus judge call if semantic). Latency.
  Back-translation is an imperfect oracle — can launder a real error or invent a fake one.
  Threshold tuning needed.
- **Two flavors:** *cheap* = lexical/embedding diff of original vs back-translation (fast,
  rough). *Expensive* = LLM-as-judge semantic equivalence (accurate, extra call).
  Recommend cheap-by-default, `--verify=semantic` opt-in.

### 2. Persistent glossary / translation memory — highest compounding value
Project-local `.hime/glossary.json` of locked term mappings + already-translated segments,
injected into every call, reused across sessions.

- **Payoff:** terminology consistency across a corpus and across time — what professional
  localization lives or dies on. Agent maintains it as **state**, so quality compounds the
  longer it works. Cache hits skip re-translation → also cuts cost.
- **Tradeoff:** state management is real work — staleness, team merge conflicts, prompt
  bloat as the glossary grows (need relevance filtering / retrieval, not dump-everything).
  Cache invalidation is the classic hard problem.

### 3. Corpus fan-out — scale one context can't hold
`hime translate ./docs --glob '**/*.md'` → parallel-translate a whole tree, preserve
structure, write alongside or in place.

- **Payoff:** migrate an entire doc set / repo in one shot — work that overflows any single
  agent context. hime already has concurrency/budget/debounce guards from phase 13, so the
  hard part is half-built.
- **Tradeoff:** orchestration + partial-failure handling — needs a **resumable manifest**
  so a crash at file 400/500 doesn't redo 399. Highest cost-blowout + rate-limit risk.
  Needs idempotency.

### 4. Context-coherent batch — quality on long docs
Pass neighboring segments / doc-level summary so each chunk knows its neighbors.

- **Payoff:** pronouns, tense, register, recurring entities stay consistent across a long
  doc instead of resetting per chunk.
- **Tradeoff:** more tokens per call, window management. Keyed-JSON batch already does part
  of this → lowest marginal gain of the four.

---

## Recommendation

Ship **Layer 0 + roundtrip (cheap default) + glossary** as v1.5. Best payoff-to-effort:
roundtrip gives agents *trust*, glossary gives *consistency + compounding state*; together
they're the line between "a translate command" and "a translation capability an agent runs
autonomously." Defer **corpus fan-out** to v1.6 (high payoff, most plumbing/failure
handling). Treat **context-coherence** as a tuning pass on the existing batch, not a
headline feature.

## Open research (do before planning)

- Anchor Layer 0 against real exemplars of agent-friendly CLI design. User cited "the
  Google Workspace CLI before it was taken down" as a model — find what made it
  agent-legible (output contract, auth flow, command shape) and pull principles.
- Survey `gh`, `gcloud`, `stripe`, modern AI-CLI patterns for `--json` schema conventions,
  exit-code taxonomies, NDJSON streaming, and onboarding (`init`) flows.
- Confirm whether any specific tool is meant by the Workspace reference (name it, anchor on it).
