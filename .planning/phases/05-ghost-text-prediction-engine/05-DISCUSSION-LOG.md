# Phase 5: Ghost-Text Prediction Engine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-30
**Phase:** 5-Ghost-Text Prediction Engine
**Areas discussed:** Trigger & defaults, Ghost-text rendering, Coexist with compose/YOLO, In-flight feedback

---

## Trigger & defaults

| Option | Description | Selected |
|--------|-------------|----------|
| Auto, 400ms, min 3 | Auto-fire after 400ms pause, ≥3 chars | partial |
| Auto, 250ms, min 2 | Snappier/eager, more API calls | |
| Manual trigger key | Fires only on key press | partial |

**User's choice:** "auto mode available with configurable debounce and mins. default is manual trigger key, also configurable in settings" — build BOTH paths; **default = manual**; auto opt-in with configurable debounce/min (exposed in Phase 7).
**Notes:** Recommended auto defaults ~400ms / 3 chars; recommended manual key Ctrl+Space (avoids v1.0 hotkeys). → D-01/D-02/D-03.

---

## Ghost-text rendering

| Option | Description | Selected |
|--------|-------------|----------|
| End-of-text only | Show ghost only when caret at end of field | ✓ |
| Anywhere caret is | Predict mid-text too | |

**User's choice:** End-of-text only.
**Notes:** input/textarea → absolute overlay (reuse v1.0 positioning); contenteditable → inline span; dim grey. → D-04/D-05/D-06.

---

## Coexist with compose / YOLO

| Option | Description | Selected |
|--------|-------------|----------|
| Pause during both | Suppress during compose + translation fetch | ✓ |
| Pause only during loading | Allow during compose | |

**User's choice:** Asked a clarifying question first ("how can these modes interact or not interact, overlap or not? i don't want to duplicate stuff here"). After explanation of the three modes + shared plumbing + Esc conflict, chose **"Yes — lock it"**: prediction suppressed during compose + translation fetch; shared field-detection/keydown/overlay plumbing reused; Esc = ghost-dismiss first then compose-cancel.
**Notes:** Core concern was avoiding duplication of field/keydown/overlay plumbing → D-07/D-08/D-09.

---

## In-flight feedback

| Option | Description | Selected |
|--------|-------------|----------|
| Silent | No spinner; ghost just appears; discard stale | ✓ |
| Subtle indicator | Dim dot near caret while fetching | |

**User's choice:** Silent.
**Notes:** Latest-request-wins; guard stale responses with a request token. → D-10.

## Claude's Discretion

- Prediction prompt wording + whether to reuse the translation model or a lighter call.
- Overlay caret-measurement technique for input/textarea.
- Request-token/abort mechanism for stale-response discarding.

## Deferred Ideas

- Multiple alternates + cycling → Phase 6 (VAR-*).
- Options-page settings → Phase 7 (SET-*).
- Streaming ghost text, after-cursor context, per-site allowlist, telemetry, multi-line → future milestone.
