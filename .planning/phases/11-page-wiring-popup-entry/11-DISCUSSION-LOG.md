# Phase 11: Page Wiring & Popup Entry - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-11
**Phase:** 11-page-wiring-popup-entry
**Areas discussed:** Query translation path, Disclosure line format, On-page search input UX, Failure & staging behavior

---

## Query Translation Path

| Option | Description | Selected |
|--------|-------------|----------|
| Worker-side in searchTranslated | Extend handler: translate query first, then Brave search; page sends one message | ✓ |
| Page-side: separate translate call | Page does query-translate then searchTranslated; two round-trips | |

| Option (same-lang) | Description | Selected |
|--------|-------------|----------|
| Skip translation, search raw | Reuse `direct` short-circuit; no LLM call | ✓ |
| Always translate | Run LLM even when source==target | |

**User's choice:** Worker-side + skip-when-same.
**Notes:** Direction must be explicit source→target, not the auto-flip/swap toggle (SRCH-02). Response must return `translatedQuery` for the disclosure line.

---

## Disclosure Line Format

| Option | Description | Selected |
|--------|-------------|----------|
| Translated + original | `Searching in Japanese for: 検索 (English: search)` | ✓ |
| Translated query only | `Searching in Japanese for: 検索` | |
| Original + translated, both labeled | Two labeled lines | |

| Option (same-lang line) | Description | Selected |
|--------|-------------|----------|
| Plain `Searching for: ___` | Drop "in {language}" framing | ✓ |
| Hide the line | No disclosure when no translation | |
| Same format, language shown | `Searching in English for: ___` | |

**User's choice:** Translated + original; plain form when source==target.
**Notes:** Read-only; re-search via the search box, not by editing the line.

---

## On-Page Search Input UX

| Option | Description | Selected |
|--------|-------------|----------|
| Popup button opens blank page | SRCH-01 literal; user types on page | ✓ |
| Popup has a query input too | Pre-fill `?q=`, auto-run; second entry point | |

| Option (search box) | Description | Selected |
|--------|-------------|----------|
| Top search bar, Enter + button | Google-style top bar, re-runs in place | ✓ |
| Centered hero → moves to top | Homepage-style, relocates after first search | |

**User's choice:** Blank-page launcher + top search bar.
**Notes:** Popup stays a launcher (no query field). Re-submit re-runs full pipeline in same tab.

---

## Failure & Staging Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Search raw query, flag it | Fall back to untranslated query, note in disclosure | ✓ |
| Block with an error | No search, prompt retry | |

| Option (staging) | Description | Selected |
|--------|-------------|----------|
| After query xlat, before results | submit → xlat → disclosure+skeleton → raw → translated | ✓ |
| Immediately on submit (optimistic) | Show original first, fill translated later | |

**User's choice:** Graceful raw-fallback + disclosure-after-xlat staging.
**Notes:** Consistent with XLT-05 / p10 raw-results fallback.

---

## Claude's Discretion

- Response-field naming and message-type extension shape (must satisfy the `translatedQuery` contract).
- Page-side 3-stage render state machine (reuse `renderSerp` seam).
- CSS/markup for search bar + disclosure line within existing `search.css` theme.

## Deferred Ideas

- Popup-side query input / `?q=` deep-link entry — rejected this phase (D-08).
- Centered-hero → top-bar layout animation — deferred (D-09).
