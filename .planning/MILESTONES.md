# Milestones

## v1.3 Image Translation (Shipped: 2026-06-22)

**Phases completed:** 3 phases (12–14), 16 plans

**Audit:** passed (16/16 requirements; all 4 E2E flows wired). See `milestones/v1.3-MILESTONE-AUDIT.md`.

**Key accomplishments:**

- Right-click any `<img>` → OCR + translate the text inside it, surfaced as readable text in the side panel (original + translation + detected language). Image bytes resolved in the background worker via a fetch/`captureVisibleTab` ladder for cross-origin and tainted-canvas images.
- Provider-agnostic `VisionProvider` (Google Cloud Vision `images:annotate` DOCUMENT_TEXT_DETECTION for OCR + language detection), with images validated/downscaled to Google's limits (≤10 MB, ≤75 M-px) so oversized inputs fail gracefully.
- **Deviation D-V01:** OCR'd text translates through the user's existing LLM provider, not Cloud Translation v2 — the Google key needs only the Cloud Vision scope, and translation reuses already-configured provider + target language.
- Progressive viewport mode (opt-in, default OFF): IntersectionObserver auto-translation with first-enable privacy warning, content-hash dedup (re-scroll never re-bills), and cost guards — concurrency cap, per-page budget, 400 ms dwell debounce, min-size + page-language eligibility filters.
- Explicit per-image state machine (loading / no-text / low-confidence / error — never a silent blank); `[hime N]` numbered badges; copy buttons for translation + original; CJK/vertical-text note.
- BYOK key entry + Vision connection test in settings; all vision calls routed through the background service worker, key never exposed to the page.

---

## v1.2 Translated Search (Shipped: 2026-06-20)

**Phases completed:** 4 phases (8–11), 11 plans
**Scope note:** Phases 5–7 belong to the PAUSED v1.1 Inline Predictions milestone (phase 5 shelved behind `PREDICT_ENABLED=false`); they are not part of v1.2.

**Key accomplishments:**

- Shared type contract for Translated Search: `SearchResult` interface, `searchTranslated`/`testBraveKey` message types, top-level `Settings.braveApiKey`, and `classifyBraveError()` mapping HTTP 429 to a dedicated `search_quota` kind distinct from LLM rate-limiting.
- Isolated `BraveSearchClient` — single authenticated GET against the Brave web-search endpoint, `web.results[]`→`SearchResult[]` with verbatim URLs (SERP-02), 429→search_quota / 401→auth / network classification, plus the manifest `host_permissions` entry.
- Background worker wiring: `searchTranslated` + `testBraveKey` in the onMessage switch with an in-flight dedup Map (D-05), source==target `direct` flag, storage-only Brave key read (XLT-01, never accepted from the page); plus the Brave BYOK key field + worker-routed "Test Brave Key" button in options.
- Keyed-JSON batch translation core — `buildBatchPayload`/`parseBatchReply`/`mergeTranslations` (16 node:test cases, XLT-02/03/04/05 fallback matrix, URL-never-sent invariant) wired into `case 'translateBatch'` with an 8s Promise.race timeout (D-04).
- Worker-side query translation in `searchTranslated`: explicit source→target LLM call before Brave search, `translatedQuery`/`translationFailed` returned to the page, raw-query fallback on LLM failure (SRCH-02).
- `search.html` wired end-to-end: Google-style search bar + read-only disclosure line, live skeleton→raw→translated SERP orchestration via `renderSerp`, `?state=` mock driver removed; XSS-safe rendering (SERP-03, textContent-only); plus user-steered scope-adds (back-translation toggle, settings link, loading timer, language dropdowns + swap).

**Audit:** passed (17/18 requirements; SERP-02/03 confirmed satisfied; SRCH-06 literal debounce accepted as satisfied-by-dedup). See `milestones/v1.2-MILESTONE-AUDIT.md`.

---

## v1.0 MVP (Shipped: 2026-05-25)

**Phases completed:** 4 phases, 8 plans, 10 tasks

**Key accomplishments:**

- classifyError and stripWrappers pure helpers with typed ErrorKind, plus the project's first automated test gate (14 node:test assertions, npm test exits 0)
- Shared Auto-formality prompt with multi-cue register detection wired into hardened OpenAI and Gemini providers (10s abort, classifyError, stripWrappers)
- OpenRouterProvider class wired into hime extension using OpenAI-compatible chat completions at openrouter.ai, with 33 passing unit tests
- OpenRouter added to settings dropdown with async model fetch from openrouter.ai/api/v1/models, Loading/Failed placeholders, and Test Connection support
- 7 cross-site compatibility unit tests added (33 -> 40 total); manual verification on 7 editors pending human checkpoint

---
