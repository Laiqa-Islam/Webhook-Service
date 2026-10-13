import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { newId } from "@/lib/id";
import { takeToken } from "@/lib/ratelimit";
import { matchesEventType } from "@/lib/match";
import { DEFAULT_MAX_ATTEMPTS, MAX_PAYLOAD_BYTES } from "@/lib/constants";
import type { EndpointRow, EventRow } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Ingest an event and fan it out to all active endpoints (or a single
 * endpoint if `endpoint_id` is given).
 *
 * Body: { type: string, data: object, endpoint_id?: string }
 * Idempotency: pass an `Idempotency-Key` header (or `idempotency_key` in the
 * body). Re-sending the same key returns the original event and creates no
 * new deliveries.
 * Rate limited per client (token bucket) — 429 with Retry-After when empty.
 */
export async function POST(req: NextRequest) {
  const client =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const rl = takeToken(`ingest:${client}`);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: "rate limit exceeded — token bucket is empty",
        retry_after_seconds: rl.retryAfterSec,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSec) },
      }
    );
  }

  let body: {
    type?: string;
    data?: unknown;
    endpoint_id?: string;
    idempotency_key?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const type = body.type?.trim();
  if (!type) {
    return NextResponse.json(
      { error: "`type` is required, e.g. \"payment.succeeded\"" },
      { status: 400 }
    );
  }
  if (body.data === undefined || typeof body.data !== "object" || body.data === null) {
    return NextResponse.json(
      { error: "`data` is required and must be an object" },
      { status: 400 }
    );
  }
  if (type.length > 200) {
    return NextResponse.json(
      { error: "`type` must be 200 characters or fewer" },
      { status: 400 }
    );
  }

  const serialized = JSON.stringify(body.data);
  if (Buffer.byteLength(serialized) > MAX_PAYLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `payload too large — \`data\` is capped at ${MAX_PAYLOAD_BYTES / 1024}KB`,
      },
      { status: 413 }
    );
  }

  const idempotencyKey =
    req.headers.get("idempotency-key") ?? body.idempotency_key ?? null;

  if (idempotencyKey) {
    const existing = db()
      .prepare("SELECT * FROM events WHERE idempotency_key = ?")
      .get(idempotencyKey) as unknown as EventRow | undefined;
    if (existing) {
      return NextResponse.json(
        { event: serializeEvent(existing), idempotent_replay: true },
        { status: 200 }
      );
    }
  }

  let targets: EndpointRow[];
  if (body.endpoint_id) {
    const ep = db()
      .prepare("SELECT * FROM endpoints WHERE id = ?")
      .get(body.endpoint_id) as unknown as EndpointRow | undefined;
    if (!ep) {
      return NextResponse.json(
        { error: `endpoint ${body.endpoint_id} not found` },
        { status: 404 }
      );
    }
    // An explicitly targeted endpoint receives the event regardless of its
    // subscription (like sending a test event from a provider dashboard).
    targets = [ep];
  } else {
    targets = (
      db()
        .prepare("SELECT * FROM endpoints WHERE active = 1")
        .all() as unknown as EndpointRow[]
    ).filter((ep) => matchesEventType(ep.event_types, type));
  }

  const now = Date.now();
  const event: EventRow = {
    id: newId("evt"),
    type,
    payload: serialized,
    idempotency_key: idempotencyKey,
    created_at: now,
  };

  const database = db();
  database
    .prepare(
      "INSERT INTO events (id, type, payload, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(event.id, event.type, event.payload, event.idempotency_key, event.created_at);

  const insertDelivery = database.prepare(
    `INSERT INTO deliveries (id, event_id, endpoint_id, status, attempt_count, max_attempts, next_attempt_at, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', 0, ?, ?, ?, ?)`
  );
  const deliveryIds: string[] = [];
  for (const ep of targets) {
    const id = newId("dlv");
    insertDelivery.run(id, event.id, ep.id, DEFAULT_MAX_ATTEMPTS, now, now, now);
    deliveryIds.push(id);
  }

  return NextResponse.json(
    { event: serializeEvent(event), deliveries: deliveryIds },
    { status: 201 }
  );
}

export async function GET() {
  const events = db()
    .prepare("SELECT * FROM events ORDER BY created_at DESC LIMIT 100")
    .all() as unknown as EventRow[];
  return NextResponse.json({ events: events.map(serializeEvent) });
}

function serializeEvent(e: EventRow) {
  return {
    id: e.id,
    type: e.type,
    data: JSON.parse(e.payload),
    idempotency_key: e.idempotency_key,
    created_at: e.created_at,
  };
}
