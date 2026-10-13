import { test } from "node:test";
import assert from "node:assert/strict";
import { takeToken } from "../lib/ratelimit.ts";

test("allows up to capacity, then blocks with a Retry-After hint", () => {
  const key = `test-${Math.random()}`;
  for (let i = 0; i < 3; i++) {
    assert.equal(takeToken(key, 3, 1).allowed, true, `request ${i + 1} should pass`);
  }
  const blocked = takeToken(key, 3, 1);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 1);
});

test("tokens refill over time", async () => {
  const key = `test-${Math.random()}`;
  for (let i = 0; i < 2; i++) takeToken(key, 2, 10); // drain at 10 tokens/s
  assert.equal(takeToken(key, 2, 10).allowed, false);
  await new Promise((r) => setTimeout(r, 150)); // ~1.5 tokens back
  assert.equal(takeToken(key, 2, 10).allowed, true);
});

test("buckets are isolated per key", () => {
  const a = `test-${Math.random()}`;
  const b = `test-${Math.random()}`;
  takeToken(a, 1, 1);
  assert.equal(takeToken(a, 1, 1).allowed, false);
  assert.equal(takeToken(b, 1, 1).allowed, true);
});
