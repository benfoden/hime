/**
 * node:test harness for the pure progressive-mode cost-guard and dedup logic.
 * Subject: dist/progressive-guard.js (lands in Task 2).
 *
 * Run individually: npm run build && node --test test/progressive-guard.mjs
 * Run as part of full suite: npm test
 *
 * Project law: verify against dist/, NEVER the service-worker console.
 *
 * Behaviors pinned (one test per guard, per 13-01 plan):
 *   PROG-04 / D-02   isEligibleSize     — ≥150px long edge filter
 *   D-02a            createBudget       — counts STARTED jobs, not successes
 *   D-02             createConcurrencyGate — 2-slot in-flight cap
 *   PROG-03          contentDedupKey    — content-hash, not URL identity
 *   D-01             createDwellScheduler — dwell-debounce (injected small ms)
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Fixtures — built from src/progressive-mock.ts via dist/progressive-mock.js.
const {
  ELIGIBLE_SIZE_200_100,
  INELIGIBLE_SIZE_149_149,
  ELIGIBLE_SIZE_10_150,
  INELIGIBLE_SIZE_0_0,
  BYTES_A,
  BYTES_B,
  BYTES_A_COPY,
} = await import(path.join(__dirname, '../dist/progressive-mock.js'));

// Lazy subject import — will throw "Cannot find module" until Task 2 ships.
async function loadGuard() {
  return import(path.join(__dirname, '../dist/progressive-guard.js'));
}

// ---------------------------------------------------------------------------
// PROG-04 / D-02: isEligibleSize — ≥150px on the long edge passes; below rejects.
// ---------------------------------------------------------------------------
test('isEligibleSize: ≥150px long edge passes, <150px rejected, zero rejected', async () => {
  const { isEligibleSize } = await loadGuard();

  // (200, 100) → long edge is 200 ≥ 150 → eligible.
  assert.equal(
    isEligibleSize(ELIGIBLE_SIZE_200_100.width, ELIGIBLE_SIZE_200_100.height),
    true,
    '200×100 should be eligible (long edge 200)',
  );

  // (149, 149) → long edge is 149 < 150 → ineligible.
  assert.equal(
    isEligibleSize(INELIGIBLE_SIZE_149_149.width, INELIGIBLE_SIZE_149_149.height),
    false,
    '149×149 should be ineligible (long edge 149)',
  );

  // (10, 150) → long edge is height=150 ≥ 150 → eligible (portrait, long edge counts).
  assert.equal(
    isEligibleSize(ELIGIBLE_SIZE_10_150.width, ELIGIBLE_SIZE_10_150.height),
    true,
    '10×150 should be eligible (long edge 150)',
  );

  // (0, 0) → degenerate; both edges 0 < 150 → ineligible.
  assert.equal(
    isEligibleSize(INELIGIBLE_SIZE_0_0.width, INELIGIBLE_SIZE_0_0.height),
    false,
    '0×0 should be ineligible',
  );
});

// ---------------------------------------------------------------------------
// D-02a: createBudget — counts STARTED jobs (not successes); budget = 10.
// ---------------------------------------------------------------------------
test('createBudget: admits first 10 starts, rejects 11th; isExhausted fires at 10', async () => {
  const { createBudget } = await loadGuard();

  const budget = createBudget(10);

  // First 10 tryConsume() calls must succeed.
  for (let i = 0; i < 10; i++) {
    assert.equal(budget.tryConsume(), true, `tryConsume call ${i + 1} should return true`);
  }

  // Budget must report 10 started and be exhausted.
  assert.equal(budget.started, 10, 'started should be 10 after 10 consumes');
  assert.equal(budget.isExhausted, true, 'isExhausted should be true after 10 consumes');

  // 11th call is rejected.
  assert.equal(budget.tryConsume(), false, '11th tryConsume should return false');

  // started does not increment beyond the limit.
  assert.equal(budget.started, 10, 'started must not exceed the budget limit');
});

// ---------------------------------------------------------------------------
// D-02: createConcurrencyGate — 2-slot cap; release makes room.
// ---------------------------------------------------------------------------
test('createConcurrencyGate: cap=2 admits 2 then blocks; release restores a slot', async () => {
  const { createConcurrencyGate } = await loadGuard();

  const gate = createConcurrencyGate(2);
  assert.equal(gate.inFlight, 0, 'starts with 0 in-flight');

  // First two acquires succeed.
  assert.equal(gate.tryAcquire(), true, 'first acquire should succeed');
  assert.equal(gate.inFlight, 1, 'inFlight should be 1');

  assert.equal(gate.tryAcquire(), true, 'second acquire should succeed');
  assert.equal(gate.inFlight, 2, 'inFlight should be 2');

  // Third acquire is blocked (at cap).
  assert.equal(gate.tryAcquire(), false, 'third acquire should be blocked');
  assert.equal(gate.inFlight, 2, 'inFlight must not exceed cap');

  // After one release, another acquire is permitted.
  gate.release();
  assert.equal(gate.inFlight, 1, 'inFlight drops to 1 after release');

  assert.equal(gate.tryAcquire(), true, 'acquire after release should succeed');
  assert.equal(gate.inFlight, 2, 'inFlight back to 2');
});

// ---------------------------------------------------------------------------
// PROG-03: contentDedupKey — stable content-hash; different bytes → different
// keys; same bytes from a different URL → same key (not URL identity).
// ---------------------------------------------------------------------------
test('contentDedupKey: identical bytes → same key; different bytes → different key; URL is irrelevant', async () => {
  const { contentDedupKey } = await loadGuard();

  const keyA = contentDedupKey(BYTES_A);
  const keyB = contentDedupKey(BYTES_B);
  const keyACopy = contentDedupKey(BYTES_A_COPY);

  // Same bytes (different allocation) → identical keys.
  assert.equal(keyA, keyACopy, 'identical byte content must yield the same dedup key');

  // Different bytes → different keys.
  assert.notEqual(keyA, keyB, 'different byte content must yield different dedup keys');

  // Key is a non-empty string (stable, prefix-tagged).
  assert.equal(typeof keyA, 'string', 'key must be a string');
  assert.ok(keyA.length > 0, 'key must be non-empty');

  // Key must use the imgc_ prefix (distinct from URL-based img_ keys, PROG-03).
  assert.ok(keyA.startsWith('imgc_'), `key must start with "imgc_", got: ${keyA}`);
});

// ---------------------------------------------------------------------------
// D-01: createDwellScheduler — fires after the dwell window; cancel suppresses;
// re-schedule restarts timer (debounce).  Uses injected small ms (NOT DWELL_MS).
// ---------------------------------------------------------------------------
test('createDwellScheduler: fires after window; cancel suppresses; re-schedule debounces', async () => {
  const { createDwellScheduler } = await loadGuard();

  const SMALL_MS = 50; // Well below DWELL_MS=400 so tests are fast.
  const scheduler = createDwellScheduler(SMALL_MS);

  // --- sub-test 1: does NOT fire synchronously ---
  let syncFired = false;
  scheduler.schedule('key1', () => { syncFired = true; });
  assert.equal(syncFired, false, 'callback must not fire synchronously');

  // --- sub-test 2: fires after the window elapses ---
  let fired = false;
  scheduler.schedule('key2', () => { fired = true; });
  await new Promise((resolve) => setTimeout(resolve, SMALL_MS + 30));
  assert.equal(fired, true, 'callback must fire after the dwell window');

  // --- sub-test 3: cancel before the window suppresses the fire ---
  let cancelledFired = false;
  scheduler.schedule('key3', () => { cancelledFired = true; });
  scheduler.cancel('key3');
  await new Promise((resolve) => setTimeout(resolve, SMALL_MS + 30));
  assert.equal(cancelledFired, false, 'cancelled callback must not fire');

  // --- sub-test 4: re-scheduling the same key restarts the timer (debounce) ---
  let debounceCount = 0;
  const debounceKey = 'key4';
  scheduler.schedule(debounceKey, () => { debounceCount++; });
  // Re-schedule before window expires — this should reset the timer.
  await new Promise((resolve) => setTimeout(resolve, SMALL_MS - 20));
  scheduler.schedule(debounceKey, () => { debounceCount++; });
  // After the first window from the original schedule, fire count must still be 0.
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(debounceCount, 0, 'debounce: re-schedule must suppress the earlier fire');
  // After the second window completes, exactly one fire.
  await new Promise((resolve) => setTimeout(resolve, SMALL_MS + 30));
  assert.equal(debounceCount, 1, 'debounce: must fire exactly once after the final window');
});
