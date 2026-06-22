// Shared test fixtures for the Phase 13 progressive-mode guard suite.
// Imported by test/progressive-guard.mjs via dist/progressive-mock.js.
//
// Mirrors panel-mock.ts conventions: typed exports, intent comments, no runtime
// side-effects.  This file MUST NOT import chrome.* or DOM APIs — it is loaded
// by the node:test harness directly from dist/.

// ---------------------------------------------------------------------------
// Size fixtures for isEligibleSize (D-02 ≥150px on the long edge).
// ---------------------------------------------------------------------------

/** An image large enough on its long edge — should pass the eligibility filter. */
export const ELIGIBLE_SIZE_200_100 = { width: 200, height: 100 } as const;

/** A square just below the minimum — rejected on both edges. */
export const INELIGIBLE_SIZE_149_149 = { width: 149, height: 149 } as const;

/** Portrait image where the long edge (height) is exactly at the minimum. */
export const ELIGIBLE_SIZE_10_150 = { width: 10, height: 150 } as const;

/** Zero-dimension image — degenerate, must be rejected. */
export const INELIGIBLE_SIZE_0_0 = { width: 0, height: 0 } as const;

// ---------------------------------------------------------------------------
// Byte fixtures for contentDedupKey (PROG-03 content-hash).
//
// `BYTES_A` and `BYTES_B` are distinct — they must produce different keys.
// `BYTES_A_COPY` is the same bytes as `BYTES_A` but a separate allocation —
// they must produce the SAME key regardless of URL (content-hash identity).
// ---------------------------------------------------------------------------

/** A small distinct byte pattern — the "first image" fixture. */
export const BYTES_A = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Different byte pattern — must hash to a different key than BYTES_A. */
export const BYTES_B = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

/** Identical bytes to BYTES_A but a separate Uint8Array allocation.
 * Used to prove that the dedup key is content-addressed, not object-identity-
 * or URL-addressed (same-image-different-URL must dedup, PROG-03). */
export const BYTES_A_COPY = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
