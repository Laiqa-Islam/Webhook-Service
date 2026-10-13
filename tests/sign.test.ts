import { test } from "node:test";
import assert from "node:assert/strict";
import { signPayload, verifySignature } from "../lib/sign.ts";

const body = JSON.stringify({ id: "evt_1", type: "payment.succeeded", data: { amount: 42 } });
const ts = () => Math.floor(Date.now() / 1000);

test("round trip: sign then verify", () => {
  const header = signPayload(["whsec_abc"], ts(), body);
  assert.equal(verifySignature("whsec_abc", header, body).valid, true);
});

test("wrong secret is rejected", () => {
  const header = signPayload(["whsec_abc"], ts(), body);
  assert.equal(verifySignature("whsec_other", header, body).valid, false);
});

test("tampered body is rejected", () => {
  const header = signPayload(["whsec_abc"], ts(), body);
  assert.equal(verifySignature("whsec_abc", header, body + " ").valid, false);
});

test("dual-signed header verifies with either secret (rotation window)", () => {
  const header = signPayload(["whsec_new", "whsec_old"], ts(), body);
  assert.equal(verifySignature("whsec_new", header, body).valid, true);
  assert.equal(verifySignature("whsec_old", header, body).valid, true);
  assert.equal(verifySignature("whsec_neither", header, body).valid, false);
});

test("stale timestamp is rejected (replay attack)", () => {
  const stale = ts() - 3600;
  const header = signPayload(["whsec_abc"], stale, body);
  const result = verifySignature("whsec_abc", header, body);
  assert.equal(result.valid, false);
  assert.match(result.reason!, /tolerance/);
});

test("stale timestamp accepted within a custom tolerance", () => {
  const header = signPayload(["whsec_abc"], ts() - 3600, body);
  assert.equal(verifySignature("whsec_abc", header, body, 7200).valid, true);
});

test("malformed headers are rejected, not crashed on", () => {
  for (const bad of [null, "", "t=abc,v1=zz", "v1=aaaa", "t=123", "garbage"]) {
    assert.equal(verifySignature("whsec_abc", bad, body).valid, false);
  }
});
