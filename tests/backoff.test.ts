import { test } from "node:test";
import assert from "node:assert/strict";
import { backoffMs } from "../lib/backoff.ts";

test("doubles each retry: ~5s, ~10s, ~20s, ~40s, ~80s", () => {
  const expected = [5000, 10000, 20000, 40000, 80000];
  for (let n = 1; n <= 5; n++) {
    for (let sample = 0; sample < 50; sample++) {
      const delay = backoffMs(n);
      assert.ok(
        delay >= expected[n - 1] * 0.85 && delay <= expected[n - 1] * 1.15,
        `backoffMs(${n}) = ${delay} outside +/-15% of ${expected[n - 1]}`
      );
    }
  }
});

test("jitter actually varies (no thundering herd)", () => {
  const samples = new Set(Array.from({ length: 20 }, () => backoffMs(3)));
  assert.ok(samples.size > 1, "expected jittered delays to differ");
});
