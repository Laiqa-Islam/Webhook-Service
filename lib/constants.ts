// Client-safe tuning knobs shared by server and console UI.

export const DEFAULT_MAX_ATTEMPTS = 6;

// Circuit breaker: consecutive failures on an endpoint before we stop
// hammering it, and how long we wait before sending a probe.
export const CIRCUIT_FAILURE_THRESHOLD = 3;
export const CIRCUIT_COOLDOWN_MS = 25_000;

// Payload cap for event `data`.
export const MAX_PAYLOAD_BYTES = 64 * 1024;

// Rotated secrets keep working for this long.
export const SECRET_ROTATION_GRACE_MS = 24 * 60 * 60 * 1000;
