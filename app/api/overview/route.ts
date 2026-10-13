import { NextResponse } from "next/server";
import { db, getSetting } from "@/lib/db";
import type {
  ActivityBucket,
  AttemptRow,
  DeliveryView,
  DestinationMode,
  EndpointHealth,
  EndpointRow,
  Overview,
  ReceiptRow,
} from "@/lib/types";

const SPARK_BUCKET_MS = 30_000;
const SPARK_WINDOW_MS = 15 * 60_000;

export const runtime = "nodejs";

/** Everything the console needs, in one poll. */
export async function GET() {
  const database = db();

  const deliveries = database
    .prepare(
      `SELECT d.*, e.type AS event_type, e.payload AS payload, ep.url AS endpoint_url
       FROM deliveries d
       JOIN events e ON e.id = d.event_id
       JOIN endpoints ep ON ep.id = d.endpoint_id
       ORDER BY d.created_at DESC
       LIMIT 40`
    )
    .all() as unknown as (Omit<DeliveryView, "attempts">)[];

  const withAttempts: DeliveryView[] = deliveries.map((d) => ({
    ...d,
    attempts: database
      .prepare(
        "SELECT * FROM attempts WHERE delivery_id = ? ORDER BY attempt_number ASC"
      )
      .all(d.id) as unknown as AttemptRow[],
  }));

  const counts = database
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM events) AS events,
         COUNT(*) AS deliveries,
         SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) AS succeeded,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN status IN ('pending', 'processing', 'retrying') THEN 1 ELSE 0 END) AS inFlight
       FROM deliveries`
    )
    .get() as {
    events: number;
    deliveries: number;
    succeeded: number | null;
    failed: number | null;
    inFlight: number | null;
  };

  const endpoints = database
    .prepare("SELECT * FROM endpoints ORDER BY created_at ASC")
    .all() as unknown as EndpointRow[];

  const healthRows = database
    .prepare(
      `SELECT d.endpoint_id AS endpoint_id,
              COUNT(*) AS attempts,
              SUM(a.ok) AS delivered,
              AVG(CASE WHEN a.ok = 1 THEN a.duration_ms END) AS avg_ms
       FROM attempts a
       JOIN deliveries d ON d.id = a.delivery_id
       GROUP BY d.endpoint_id`
    )
    .all() as unknown as {
    endpoint_id: string;
    attempts: number;
    delivered: number | null;
    avg_ms: number | null;
  }[];
  const endpointHealth: Record<string, EndpointHealth> = {};
  for (const h of healthRows) {
    endpointHealth[h.endpoint_id] = {
      attempts: h.attempts,
      delivered: h.delivered ?? 0,
      successRate:
        h.attempts > 0 ? Math.round(((h.delivered ?? 0) / h.attempts) * 100) : null,
      avgMs: h.avg_ms === null ? null : Math.round(h.avg_ms),
    };
  }

  const receipts = database
    .prepare(
      "SELECT * FROM destination_receipts ORDER BY id DESC LIMIT 12"
    )
    .all() as unknown as ReceiptRow[];

  // Attempt volume over the last 15 minutes, in 30s buckets, for the sparkline.
  const nowMs = Date.now();
  const windowStart = nowMs - SPARK_WINDOW_MS;
  const bucketRows = database
    .prepare(
      `SELECT (created_at / ${SPARK_BUCKET_MS}) AS bucket,
              SUM(ok) AS ok, COUNT(*) - SUM(ok) AS fail
       FROM attempts WHERE created_at >= ? GROUP BY bucket`
    )
    .all(windowStart) as unknown as { bucket: number; ok: number; fail: number }[];
  const byBucket = new Map(bucketRows.map((r) => [Math.floor(r.bucket), r]));
  const activity: ActivityBucket[] = [];
  for (
    let b = Math.floor(windowStart / SPARK_BUCKET_MS) + 1;
    b <= Math.floor(nowMs / SPARK_BUCKET_MS);
    b++
  ) {
    const row = byBucket.get(b);
    activity.push({
      t: b * SPARK_BUCKET_MS,
      ok: row?.ok ?? 0,
      fail: row?.fail ?? 0,
    });
  }

  const settled = (counts.succeeded ?? 0) + (counts.failed ?? 0);
  const overview: Overview = {
    now: nowMs,
    activity,
    stats: {
      events: counts.events,
      deliveries: counts.deliveries,
      succeeded: counts.succeeded ?? 0,
      failed: counts.failed ?? 0,
      inFlight: counts.inFlight ?? 0,
      successRate:
        settled > 0 ? Math.round(((counts.succeeded ?? 0) / settled) * 100) : null,
    },
    deliveries: withAttempts,
    endpoints,
    endpointHealth,
    destination: {
      mode: (getSetting("destination_mode") ?? "healthy") as DestinationMode,
      demoEndpointId: getSetting("demo_endpoint_id"),
      receipts,
    },
  };

  return NextResponse.json(overview, {
    headers: { "Cache-Control": "no-store" },
  });
}
