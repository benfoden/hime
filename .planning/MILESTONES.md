# Milestones

## v1.0 MVP (Shipped: 2026-05-25)

**Phases completed:** 4 phases, 8 plans, 10 tasks

**Key accomplishments:**

- classifyError and stripWrappers pure helpers with typed ErrorKind, plus the project's first automated test gate (14 node:test assertions, npm test exits 0)
- Shared Auto-formality prompt with multi-cue register detection wired into hardened OpenAI and Gemini providers (10s abort, classifyError, stripWrappers)
- OpenRouterProvider class wired into hime extension using OpenAI-compatible chat completions at openrouter.ai, with 33 passing unit tests
- OpenRouter added to settings dropdown with async model fetch from openrouter.ai/api/v1/models, Loading/Failed placeholders, and Test Connection support
- 7 cross-site compatibility unit tests added (33 -> 40 total); manual verification on 7 editors pending human checkpoint

---
