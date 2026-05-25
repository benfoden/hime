# Phase 3: Cross-Site Compatibility - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-25
**Phase:** 3-Cross-Site Compatibility
**Areas discussed:** Shadow DOM traversal, Google Docs strategy, Loading & failure UX, Site-specific detection

---

## Shadow DOM Traversal

| Option | Description | Selected |
|--------|-------------|----------|
| Recursive shadowRoot walk | Follow activeElement into .shadowRoot.activeElement recursively until no more shadow roots | |
| One-level only | Check one level of shadowRoot, simpler but might miss deeply nested cases | ✓ |
| Open shadow only + skip closed | Walk open shadow roots recursively, skip closed | |

**User's choice:** One-level only
**Notes:** None

### Follow-up: Iframe Injection

| Option | Description | Selected |
|--------|-------------|----------|
| Enable all_frames | Add all_frames: true to manifest, content script loads in every iframe | |
| Keep top-frame only | Don't inject into iframes, Gmail compose and similar iframe editors won't work | ✓ |

**User's choice:** Keep top-frame only
**Notes:** Accepted that some iframe-based editors may not work

---

## Google Docs Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Graceful degradation message | Detect Google Docs, show clear message, don't attempt | ✓ |
| Clipboard-based workaround | Copy translated text to clipboard + show notification | |
| Skip silently | Don't detect or message, hotkeys just do nothing | |

**User's choice:** Graceful degradation message
**Notes:** Detection via feature detection (canvas editor), not URL matching

---

## Loading & Failure UX

| Option | Description | Selected |
|--------|-------------|----------|
| Badge '...' is enough | Already shows orange '...' badge during API call | |
| Add field opacity dim | Dim field to 50% opacity during translation + badge | |
| Badge + cursor change | Keep badge '...' and set cursor to 'wait' on the field | |

**User's choice:** Dim field to 50% + floating overlay text "translating..." (custom — terminal UI style)
**Notes:** User specifically requested text-based progress similar to terminal UI approaches

### Follow-up: Overlay Positioning

| Option | Description | Selected |
|--------|-------------|----------|
| Replace field text temporarily | Field shows 'translating...' during API call | |
| Overlay text on dimmed field | Small floating label positioned over the dimmed field | ✓ |
| Badge text only | Badge shows animated dots, field just dims | |

**User's choice:** Overlay text on dimmed field
**Notes:** Original text still visible underneath but dimmed

---

## Site-Specific Detection

| Option | Description | Selected |
|--------|-------------|----------|
| URL-based site detector + adapter map | Detect site from URL, each site gets adapter object | |
| Feature detection only | No URL checking, detect DOM capabilities | ✓ |
| Hybrid: feature detect + URL hints | Primary feature detection, URL hint for known-broken sites | |

**User's choice:** Feature detection only
**Notes:** All detection including Google Docs degradation uses feature detection, not URL matching

---

## Claude's Discretion

- Overlay CSS implementation (positioning, z-index, styling)
- Feature detection heuristics for canvas editors
- Console logging for site compatibility debugging

## Deferred Ideas

- Lightweight desktop app as system-wide IME (OS-level keyboard hooks, IBus/Fcitx/TSF) — separate product
- Native Linux IME pathway — related to desktop app, IBus/Fcitx integration
- `all_frames` iframe injection — revisit if testing reveals critical editors need it
