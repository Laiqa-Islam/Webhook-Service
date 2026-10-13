const BASE_DELAY_S = 5; // retry schedule: 5s, 10s, 20s, 40s, 80s (+/- jitter)

/**
 * Delay before attempt (n+1), given n attempts have failed: exponential
 * doubling with ±15% jitter so a recovering endpoint isn't stampeded by
 * every backed-off delivery retrying at the same instant.
 */
export function backoffMs(failedAttempts: number): number {
  const base = BASE_DELAY_S * 1000 * 2 ** (failedAttempts - 1);
  const jitter = 0.85 + Math.random() * 0.3;
  return Math.round(base * jitter);
}
