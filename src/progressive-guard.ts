// Pure progressive-mode cost-guard and dedup logic for Phase 13.
// NO chrome.* and NO document references: this module is imported by both the
// content script (Plan 03, IntersectionObserver trigger) and the service
// worker (Plan 04, concurrency-aware queue). The guards are proven here once
// as pure functions rather than re-derived in two browser-only files.
// (Pattern law — mirror image-resolve.ts's module doctrine.)

// ----------------------------------------------------------------------------
// Constants (D-01, D-02 — tune-comment per design decision doc 13-CONTEXT.md).
// ----------------------------------------------------------------------------

/** D-02: Minimum long-edge size (px) for an image to be eligible for
 *  progressive OCR.  Images below this are icons/sprites/tracking pixels
 *  that cost tokens but produce no useful text. */
export const MIN_LONG_EDGE_PX = 150;

/** D-02: Maximum number of progressive jobs STARTED per page before the
 *  budget gate stops admitting new jobs for this page.  Counts starts,
 *  not successes (D-02a): a failed/no-text image still consumes budget so
 *  an all-fail page never loops forever. */
export const PER_PAGE_BUDGET = 10;

/** D-02: Maximum number of progressive jobs running simultaneously (in-flight).
 *  Two jobs × two API calls each (Vision OCR + LLM translate) = four
 *  concurrent HTTPS requests — conservative to avoid quota spikes. */
export const CONCURRENCY_CAP = 2;

/** D-01: Dwell-debounce window (ms).  The IntersectionObserver fires a
 *  callback; the scheduler waits this long with no cancel before starting
 *  a paid job.  Intent: fire on images the user PAUSES near, not on every
 *  flyby during a fast scroll. */
export const DWELL_MS = 400;

/** D-01: IntersectionObserver rootMargin (px).  Fire slightly ahead of the
 *  viewport so the OCR result is ready when the image comes fully into view.
 *  Intent is fire-ahead, not on flyby.  Plan 03 reads this for the observer
 *  config.  Paired with DWELL_MS: large margin + dwell = see-it-coming,
 *  slow-scrollers-only semantics. */
export const ROOT_MARGIN_PX = 200;

// ----------------------------------------------------------------------------
// D-02: isEligibleSize — long-edge filter (PROG-04 cost control).
// ----------------------------------------------------------------------------

/**
 * True iff the longer of `width` / `height` meets the minimum long-edge
 * threshold.  Skips icons, tracking pixels, and sprite slivers.
 */
export function isEligibleSize(width: number, height: number): boolean {
  return Math.max(width, height) >= MIN_LONG_EDGE_PX;
}

// ----------------------------------------------------------------------------
// D-02a: createBudget — per-page started-job counter (PROG-04 cost control).
// ----------------------------------------------------------------------------

export interface Budget {
  /** Attempt to consume one budget slot.  Returns true (slot taken) while
   *  `started < limit`; returns false once the budget is exhausted.
   *  Counts STARTS regardless of job outcome (D-02a). */
  tryConsume(): boolean;
  /** Number of jobs started so far (monotonically increasing, max = limit). */
  readonly started: number;
  /** True once `started` has reached the configured limit. */
  readonly isExhausted: boolean;
}

/**
 * Factory for a per-page started-job budget gate.
 *
 * @param limit Maximum number of starts to allow (default PER_PAGE_BUDGET).
 */
export function createBudget(limit: number = PER_PAGE_BUDGET): Budget {
  let started = 0;
  return {
    tryConsume(): boolean {
      if (started >= limit) return false;
      started++;
      return true;
    },
    get started(): number {
      return started;
    },
    get isExhausted(): boolean {
      return started >= limit;
    },
  };
}

// ----------------------------------------------------------------------------
// D-02: createConcurrencyGate — simultaneous in-flight cap (PROG-04).
// ----------------------------------------------------------------------------

export interface ConcurrencyGate {
  /** Attempt to acquire an in-flight slot.  Returns true and increments
   *  `inFlight` if below the cap; returns false without mutating state
   *  if the cap is already reached. */
  tryAcquire(): boolean;
  /** Release one in-flight slot (floor at 0). */
  release(): void;
  /** Current number of in-flight jobs. */
  readonly inFlight: number;
}

/**
 * Factory for a concurrency gate that caps simultaneous in-flight jobs.
 *
 * @param cap Maximum concurrent jobs (default CONCURRENCY_CAP).
 */
export function createConcurrencyGate(cap: number = CONCURRENCY_CAP): ConcurrencyGate {
  let inFlight = 0;
  return {
    tryAcquire(): boolean {
      if (inFlight >= cap) return false;
      inFlight++;
      return true;
    },
    release(): void {
      if (inFlight > 0) inFlight--;
    },
    get inFlight(): number {
      return inFlight;
    },
  };
}

// ----------------------------------------------------------------------------
// PROG-03: contentDedupKey — content-hash dedup (re-bill prevention).
// ----------------------------------------------------------------------------

/**
 * Stable content-hash dedup key over raw image bytes.  djb2 over the byte
 * array — same algorithm as `imageDedupKey` in background.ts but iterated
 * over bytes (not char codes) and prefixed `imgc_` so a content key never
 * collides with the URL-based `img_` namespace used by background.ts.
 *
 * Identical bytes → identical key regardless of source URL, so the same
 * image served from two different CDN paths dedups correctly (PROG-03).
 * Collision risk is the same low-value, non-security profile already
 * accepted for the URL-based key (T-13-01 — per-session, identity-only).
 */
export function contentDedupKey(bytes: Uint8Array): string {
  let hash = 5381;
  for (let i = 0; i < bytes.length; i++) {
    hash = ((hash << 5) + hash + bytes[i]) | 0;
  }
  return `imgc_${(hash >>> 0).toString(36)}`;
}

// ----------------------------------------------------------------------------
// D-05: shouldGateByLanguage — page-language gate (conservative-by-default).
// ----------------------------------------------------------------------------

// Minimal display-name → ISO base-subtag map mirroring LANGUAGE_ISO in types.ts.
// progressive-guard.ts must stay free of chrome.*/document/browser globals so it
// remains node-testable.  Only the base subtag is needed here (zh-CN → zh).
// MUST stay in sync with types.ts LANGUAGE_ISO.
const GUARD_LANGUAGE_ISO: Readonly<Record<string, string>> = {
  English: 'en',
  Japanese: 'ja',
  Korean: 'ko',
  'Chinese (Simplified)': 'zh',
  'Chinese (Traditional)': 'zh',
  Spanish: 'es',
  French: 'fr',
  German: 'de',
  Italian: 'it',
  Portuguese: 'pt',
  Dutch: 'nl',
  Russian: 'ru',
  Polish: 'pl',
  Turkish: 'tr',
  Arabic: 'ar',
  Hindi: 'hi',
  Vietnamese: 'vi',
  Thai: 'th',
  Indonesian: 'id',
};

/**
 * Normalize a BCP-47 language tag or display name to its ISO-639-1 base subtag.
 *
 * Handles:
 * - Display names ('Japanese' → 'ja', 'Chinese (Simplified)' → 'zh').
 * - Raw BCP-47 tags ('en-US' → 'en', 'zh-TW' → 'zh').
 * - Unknown values: trimmed/lowercased input (fallback, same as languageToIso).
 */
function normalizeToBase(lang: string): string {
  const trimmed = lang.trim();
  if (!trimmed) return '';
  // Check display-name map first (covers 'Japanese', 'Chinese (Simplified)', etc.).
  const mapped = GUARD_LANGUAGE_ISO[trimmed];
  if (mapped) return mapped;
  // Treat as BCP-47 tag: take the first subtag, lowercase.
  return trimmed.split('-')[0].toLowerCase();
}

/**
 * D-05 page-language gate predicate.
 *
 * Returns `true`  → GATE ON: do NOT start progressive auto-translation.
 *                   Reason: the page language already matches the user's reading
 *                   language, OR the language is missing/ambiguous (conservative
 *                   default — spend nothing when we cannot be certain).
 *
 * Returns `false` → GATE OFF: allow progressive auto-translation.
 *                   Reason: the page is confidently detected as a different
 *                   language from the user's translation target.
 *
 * Call site pattern (content.ts):
 *   const gate = progShouldGateByLanguage(document.documentElement.lang, s.targetLanguage);
 *   if (progressiveEnabled && !gate) startProgressive();
 *
 * @param pageLang    Raw `<html lang>` value (DOM-read by the caller, not here).
 *                    May be empty string when the attribute is absent.
 * @param targetLang  Stored target language — either a display name ('Japanese')
 *                    or an ISO code; both are normalised to a base subtag before
 *                    comparison.
 */
export function shouldGateByLanguage(pageLang: string, targetLang: string): boolean {
  const base = normalizeToBase(pageLang);
  // Empty/whitespace page lang → conservative gate ON (missing or ambiguous).
  if (!base) return true;
  const target = normalizeToBase(targetLang);
  // Gate ON when the page is already in the user's reading language.
  return base === target;
}

// ----------------------------------------------------------------------------
// D-01: createDwellScheduler — dwell-debounce (fire on pause, not on flyby).
// ----------------------------------------------------------------------------

export interface DwellScheduler {
  /** Schedule `cb` to fire after `ms` quiet time for `key`.  If `key` is
   *  already scheduled, the existing timer is cancelled and a fresh one
   *  starts (debounce — re-scroll restarts the window, D-01). */
  schedule(key: string, cb: () => void): void;
  /** Cancel any pending timer for `key`.  A no-op if none is scheduled. */
  cancel(key: string): void;
}

/**
 * Factory for a per-key dwell-debounce scheduler.
 *
 * @param ms Dwell window in ms (default DWELL_MS).  Pass a small value in
 *           tests to avoid waiting 400 ms per case.
 */
export function createDwellScheduler(ms: number = DWELL_MS): DwellScheduler {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  return {
    schedule(key: string, cb: () => void): void {
      // Cancel any prior timer for this key (debounce).
      const existing = timers.get(key);
      if (existing !== undefined) clearTimeout(existing);
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          cb();
        }, ms),
      );
    },
    cancel(key: string): void {
      const existing = timers.get(key);
      if (existing !== undefined) {
        clearTimeout(existing);
        timers.delete(key);
      }
    },
  };
}
