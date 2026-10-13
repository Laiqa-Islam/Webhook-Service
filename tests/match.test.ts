import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesEventType, normalizePatterns } from "../lib/match.ts";

test("star matches everything", () => {
  assert.equal(matchesEventType("*", "payment.succeeded"), true);
  assert.equal(matchesEventType("*", "anything.at.all"), true);
});

test("exact match", () => {
  assert.equal(matchesEventType("payment.succeeded", "payment.succeeded"), true);
  assert.equal(matchesEventType("payment.succeeded", "payment.failed"), false);
});

test("prefix wildcard", () => {
  assert.equal(matchesEventType("payment.*", "payment.succeeded"), true);
  assert.equal(matchesEventType("payment.*", "payment.refund.created"), true);
  assert.equal(matchesEventType("payment.*", "payments.succeeded"), false);
  assert.equal(matchesEventType("payment.*", "invoice.paid"), false);
});

test("comma-separated list matches any entry", () => {
  const list = "payment.*, invoice.paid";
  assert.equal(matchesEventType(list, "payment.succeeded"), true);
  assert.equal(matchesEventType(list, "invoice.paid"), true);
  assert.equal(matchesEventType(list, "invoice.created"), false);
});

test("normalizePatterns cleans up whitespace and defaults to *", () => {
  assert.deepEqual(normalizePatterns("  payment.* ,invoice.paid "), {
    ok: true,
    value: "payment.*, invoice.paid",
  });
  assert.deepEqual(normalizePatterns(""), { ok: true, value: "*" });
});

test("normalizePatterns rejects malformed patterns", () => {
  assert.equal(normalizePatterns("pay ment.*").ok, false);
  assert.equal(normalizePatterns("payment.**").ok, false);
  assert.equal(normalizePatterns("*.succeeded").ok, false);
});
