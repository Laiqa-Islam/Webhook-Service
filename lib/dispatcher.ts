import { db } from "./db";
import { newId } from "./id";
import { signPayload } from "./sign";
import { checkEndpointUrl } from "./guard";
import { backoffMs } from "./backoff";
import {
  CIRCUIT_COOLDOWN_MS,
  CIRCUIT_FAILURE_THRESHOLD,
} from "./constants";
import type { DeliveryRow, EndpointRow, EventRow } from "./types";

const TICK_MS = 1500;
const REQUEST_TIMEOUT_MS = 5000;
const RESPONSE_BODY_LIMIT = 2048;

const g = globalThis as unknown as { __dispatcherRunning?: boolean };

export function startDispatcher() {
  // Guard against dev-server HMR spawning duplicate loops.
  if (g.__dispatcherRunning) return;
  g.__dispatcherRunning = true;

  // Recover deliveries stranded in `processing` by a previous crash/restart.
  db()
    .prepare(
      "UPDATE deliveries SET status = 'retrying', updated_at = ? WHERE status = 'processing'"
    )
    .run(Date.now());

  console.log("[dispatcher] started, polling every", TICK_MS, "ms");

  const loop = async () => {
    try {
      await tick();
    } catch (err) {
      console.error("[dispatcher] tick failed:", err);
    } finally {
      setTimeout(loop, TICK_MS);
    }
  };
  loop();
}

async function tick() {
  const now = Date.now();
  const due = db()
    .prepare(
      `SELECT d.* FROM deliveries d
       JOIN endpoints e ON e.id = d.endpoint_id
       WHERE d.status IN ('pending', 'retrying')
         AND d.next_attempt_at <= ?
         AND e.active = 1
       ORDER BY d.created_at ASC
       LIMIT 25`
    )
    .all(now) as unknown as DeliveryRow[];
  if (due.length === 0) return;

  // Deliveries to the same endpoint go out sequentially in creation order
  // (best-effort ordering); different endpoints are delivered in parallel.
  const byEndpoint = new Map<string, DeliveryRow[]>();
  for (const d of due) {
    const group = byEndpoint.get(d.endpoint_id) ?? [];
    group.push(d);
    byEndpoint.set(d.endpoint_id, group);
  }

  await Promise.all(
    [...byEndpoint.entries()].map(async ([endpointId, group]) => {
      const endpoint = db()
        .prepare("SELECT * FROM endpoints WHERE id = ?")
        .get(endpointId) as unknown as EndpointRow | undefined;
      if (!endpoint) return;

      // Circuit breaker: an endpoint that keeps failing gets left alone for a
      // cooldown instead of being hammered. Deliveries stay queued; after the
      // cooldown exactly one probe goes out (half-open) — success closes the
      // circuit and the backlog flushes, failure re-opens it.
      let probeOnly = false;
      if (endpoint.circuit_state === "open") {
        const openedAt = endpoint.circuit_opened_at ?? 0;
        if (now - openedAt < CIRCUIT_COOLDOWN_MS) return;
        db()
          .prepare("UPDATE endpoints SET circuit_state = 'half_open' WHERE id = ?")
          .run(endpointId);
        probeOnly = true;
        console.log(`[circuit] ${endpointId} half-open, sending probe`);
      } else if (endpoint.circuit_state === "half_open") {
        probeOnly = true;
      }

      // Strict FIFO mode: only ever dispatch the endpoint's oldest unsettled
      // delivery. If the head isn't in this batch (e.g. it's mid-backoff and
      // not due yet), everything behind it waits — honest head-of-line
      // blocking, the price of guaranteed ordering.
      const toDeliver = probeOnly ? group.slice(0, 1) : group;
      if (endpoint.strict_ordering) {
        const head = db()
          .prepare(
            `SELECT id FROM deliveries
             WHERE endpoint_id = ? AND status IN ('pending', 'processing', 'retrying')
             ORDER BY created_at ASC LIMIT 1`
          )
          .get(endpointId) as { id: string } | undefined;
        if (!head || head.id !== toDeliver[0]?.id) return;
      }

      for (const delivery of toDeliver) {
        const result = await deliverOnce(delivery);
        if (result === "skipped") continue;
        const circuitNowOpen = recordEndpointResult(
          endpointId,
          result === "succeeded",
          probeOnly
        );
        if (circuitNowOpen) break;
        if (result === "failed" && endpoint.strict_ordering) {
          // If the head is still retrying (not exhausted), the queue stays
          // blocked behind it; if it just failed permanently, the next
          // delivery becomes the new head and may proceed.
          const status = (
            db()
              .prepare("SELECT status FROM deliveries WHERE id = ?")
              .get(delivery.id) as { status: string }
          ).status;
          if (status === "retrying") break;
        }
      }
    })
  );
}

/** Track consecutive failures per endpoint and flip the circuit breaker. Returns true if the circuit is now open. */
function recordEndpointResult(
  endpointId: string,
  ok: boolean,
  wasProbe: boolean
): boolean {
  const ep = db()
    .prepare(
      "SELECT consecutive_failures, circuit_state FROM endpoints WHERE id = ?"
    )
    .get(endpointId) as unknown as
    | Pick<EndpointRow, "consecutive_failures" | "circuit_state">
    | undefined;
  if (!ep) return false;

  if (ok) {
    if (ep.consecutive_failures > 0 || ep.circuit_state !== "closed") {
      db()
        .prepare(
          "UPDATE endpoints SET consecutive_failures = 0, circuit_state = 'closed', circuit_opened_at = NULL WHERE id = ?"
        )
        .run(endpointId);
      if (ep.circuit_state !== "closed")
        console.log(`[circuit] ${endpointId} probe succeeded, circuit closed`);
    }
    return false;
  }

  const failures = ep.consecutive_failures + 1;
  const shouldOpen = wasProbe || failures >= CIRCUIT_FAILURE_THRESHOLD;
  db()
    .prepare(
      shouldOpen
        ? "UPDATE endpoints SET consecutive_failures = ?, circuit_state = 'open', circuit_opened_at = ? WHERE id = ?"
        : "UPDATE endpoints SET consecutive_failures = ? WHERE id = ?"
    )
    .run(...(shouldOpen ? [failures, Date.now(), endpointId] : [failures, endpointId]));
  if (shouldOpen)
    console.log(
      `[circuit] ${endpointId} OPEN after ${failures} consecutive failures — cooling down ${CIRCUIT_COOLDOWN_MS / 1000}s`
    );
  return shouldOpen;
}

async function deliverOnce(
  delivery: DeliveryRow
): Promise<"succeeded" | "failed" | "skipped"> {
  const now = Date.now();

  // Atomic claim — if another tick already grabbed it, skip.
  const claim = db()
    .prepare(
      "UPDATE deliveries SET status = 'processing', updated_at = ? WHERE id = ? AND status IN ('pending', 'retrying')"
    )
    .run(now, delivery.id);
  if (claim.changes === 0) return "skipped";

  const event = db()
    .prepare("SELECT * FROM events WHERE id = ?")
    .get(delivery.event_id) as unknown as EventRow;
  const endpoint = db()
    .prepare("SELECT * FROM endpoints WHERE id = ?")
    .get(delivery.endpoint_id) as unknown as EndpointRow;

  const attemptNumber = delivery.attempt_count + 1;
  const triggeredBy = delivery.manual_next ? "manual" : "auto";

  // The body is byte-identical across attempts so consumers can dedupe on id;
  // only the timestamp/signature headers change.
  const body = JSON.stringify({
    id: event.id,
    type: event.type,
    created_at: event.created_at,
    data: JSON.parse(event.payload),
  });
  const timestamp = Math.floor(Date.now() / 1000);

  // Sign with the current secret, plus the old one during a rotation window.
  const secrets = [endpoint.secret];
  if (
    endpoint.old_secret &&
    endpoint.old_secret_expires_at &&
    endpoint.old_secret_expires_at > now
  ) {
    secrets.push(endpoint.old_secret);
  }

  let statusCode: number | null = null;
  let responseBody: string | null = null;
  let error: string | null = null;
  const t0 = performance.now();

  // Re-check the URL at delivery time too — it may have been registered
  // before the guard existed, or edited since.
  const urlCheck = checkEndpointUrl(endpoint.url);
  if (!urlCheck.ok) {
    error = `blocked by SSRF guard: ${urlCheck.reason}`;
  } else {
    try {
      const res = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Relay-Webhooks/1.0",
          "X-Webhook-Id": delivery.id,
          "X-Webhook-Event-Id": event.id,
          "X-Webhook-Attempt": String(attemptNumber),
          "X-Webhook-Signature": signPayload(secrets, timestamp, body),
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
      statusCode = res.status;
      responseBody = (await res.text()).slice(0, RESPONSE_BODY_LIMIT);
      if (!res.ok) error = `endpoint responded ${res.status}`;
    } catch (err) {
      error =
        err instanceof Error && err.name === "TimeoutError"
          ? `request timed out after ${REQUEST_TIMEOUT_MS}ms`
          : err instanceof Error
            ? `${err.name}: ${err.message}${err.cause ? ` (${String(err.cause)})` : ""}`
            : String(err);
    }
  }

  const durationMs = Math.round(performance.now() - t0);
  const succeeded = error === null;
  const finishedAt = Date.now();

  db()
    .prepare(
      `INSERT INTO attempts (id, delivery_id, attempt_number, triggered_by, status_code, ok, response_body, error, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      newId("att"),
      delivery.id,
      attemptNumber,
      triggeredBy,
      statusCode,
      succeeded ? 1 : 0,
      responseBody,
      error,
      durationMs,
      finishedAt
    );

  if (succeeded) {
    db()
      .prepare(
        "UPDATE deliveries SET status = 'succeeded', attempt_count = ?, manual_next = 0, last_error = NULL, updated_at = ? WHERE id = ?"
      )
      .run(attemptNumber, finishedAt, delivery.id);
    console.log(
      `[dispatcher] ${delivery.id} delivered to ${endpoint.url} (attempt ${attemptNumber}, ${durationMs}ms)`
    );
    return "succeeded";
  }

  const exhausted = attemptNumber >= delivery.max_attempts;
  if (exhausted) {
    db()
      .prepare(
        "UPDATE deliveries SET status = 'failed', attempt_count = ?, manual_next = 0, last_error = ?, updated_at = ? WHERE id = ?"
      )
      .run(attemptNumber, error, finishedAt, delivery.id);
    console.log(
      `[dispatcher] ${delivery.id} FAILED permanently after ${attemptNumber} attempts: ${error}`
    );
  } else {
    const delay = backoffMs(attemptNumber);
    db()
      .prepare(
        "UPDATE deliveries SET status = 'retrying', attempt_count = ?, manual_next = 0, last_error = ?, next_attempt_at = ?, updated_at = ? WHERE id = ?"
      )
      .run(attemptNumber, error, finishedAt + delay, finishedAt, delivery.id);
    console.log(
      `[dispatcher] ${delivery.id} attempt ${attemptNumber} failed (${error}), retrying in ${Math.round(delay / 1000)}s`
    );
  }
  return "failed";
}
