/**
 * In-memory token bucket, per client key. Each request costs one token;
 * tokens refill continuously. Good enough for a single-process service —
 * a multi-node deployment would back this with Redis.
 */

export const RATE_LIMIT_CAPACITY = 8;
export const RATE_LIMIT_REFILL_PER_SEC = 2;

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const g = globalThis as unknown as { __rlBuckets?: Map<string, Bucket> };
const buckets = (g.__rlBuckets ??= new Map());

export function takeToken(
  key: string,
  capacity = RATE_LIMIT_CAPACITY,
  refillPerSec = RATE_LIMIT_REFILL_PER_SEC
): { allowed: boolean; retryAfterSec: number; remaining: number } {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: capacity, updatedAt: now };

  const elapsed = (now - bucket.updatedAt) / 1000;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerSec);
  bucket.updatedAt = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    buckets.set(key, bucket);
    return {
      allowed: true,
      retryAfterSec: 0,
      remaining: Math.floor(bucket.tokens),
    };
  }

  buckets.set(key, bucket);
  return {
    allowed: false,
    retryAfterSec: Math.ceil((1 - bucket.tokens) / refillPerSec),
    remaining: 0,
  };
}
