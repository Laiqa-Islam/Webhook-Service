import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stripe-style payload signing.
 *
 * The signed payload is `${timestamp}.${rawBody}` and the signature header is
 *   X-Webhook-Signature: t=<unix seconds>,v1=<hex hmac-sha256>[,v1=…]
 *
 * During a secret rotation the header carries one v1 entry per live secret
 * (new first, old second), so consumers on either secret keep verifying —
 * zero-downtime rotation, same trick Stripe uses.
 *
 * Receivers rebuild the signed payload from the raw request body and compare
 * with a constant-time equality check, rejecting stale timestamps to prevent
 * replay attacks.
 */
export function signPayload(
  secrets: string[],
  timestamp: number,
  rawBody: string
): string {
  const sigs = secrets.map(
    (secret) =>
      `v1=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`
  );
  return [`t=${timestamp}`, ...sigs].join(",");
}

const DEFAULT_TOLERANCE_S = 300;

export function verifySignature(
  secret: string,
  header: string | null,
  rawBody: string,
  toleranceSeconds = DEFAULT_TOLERANCE_S
): { valid: boolean; reason?: string } {
  if (!header) return { valid: false, reason: "missing signature header" };

  let t = NaN;
  const v1s: string[] = [];
  for (const part of header.split(",")) {
    const idx = part.indexOf("=");
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === "t") t = Number(value);
    if (key === "v1") v1s.push(value);
  }
  if (!Number.isFinite(t) || v1s.length === 0)
    return { valid: false, reason: "malformed signature header" };

  const age = Math.abs(Date.now() / 1000 - t);
  if (age > toleranceSeconds)
    return { valid: false, reason: "timestamp outside tolerance" };

  const expected = createHmac("sha256", secret)
    .update(`${t}.${rawBody}`)
    .digest();
  for (const v1 of v1s) {
    const given = Buffer.from(v1, "hex");
    if (given.length === expected.length && timingSafeEqual(given, expected))
      return { valid: true };
  }
  return { valid: false, reason: "signature mismatch" };
}
