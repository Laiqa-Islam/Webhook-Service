import { NextRequest, NextResponse } from "next/server";
import { db, getSetting } from "@/lib/db";
import { verifySignature } from "@/lib/sign";
import type { DestinationMode, EndpointRow } from "@/lib/types";

export const runtime = "nodejs";

/**
 * The built-in demo destination — plays the role of a customer's server
 * receiving webhooks. It verifies the HMAC signature like a real consumer
 * would, logs a receipt, and responds according to the kill switch:
 *   healthy → 200, down → 500, timeout → hangs past the delivery timeout.
 */
export async function POST(req: NextRequest) {
  const mode = (getSetting("destination_mode") ?? "healthy") as DestinationMode;
  const rawBody = await req.text();

  // Verify against the demo endpoint's secret, exactly as a consumer holding
  // their whsec_ secret would.
  const demoEndpointId = getSetting("demo_endpoint_id");
  const endpoint = demoEndpointId
    ? (db()
        .prepare("SELECT * FROM endpoints WHERE id = ?")
        .get(demoEndpointId) as unknown as EndpointRow | undefined)
    : undefined;

  const verification = endpoint
    ? verifySignature(
        endpoint.secret,
        req.headers.get("x-webhook-signature"),
        rawBody
      )
    : { valid: false, reason: "demo endpoint secret unavailable" };

  let eventId: string | null = null;
  let eventType: string | null = null;
  try {
    const parsed = JSON.parse(rawBody);
    eventId = parsed.id ?? null;
    eventType = parsed.type ?? null;
  } catch {
    // leave nulls
  }

  const respondedStatus = mode === "down" ? 500 : 200;

  db()
    .prepare(
      `INSERT INTO destination_receipts (event_id, event_type, delivery_id, attempt, signature_valid, responded_status, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      eventId,
      eventType,
      req.headers.get("x-webhook-id"),
      Number(req.headers.get("x-webhook-attempt")) || null,
      verification.valid ? 1 : 0,
      mode === "timeout" ? 0 : respondedStatus,
      Date.now()
    );
  // Keep only the most recent receipts.
  db()
    .prepare(
      "DELETE FROM destination_receipts WHERE id NOT IN (SELECT id FROM destination_receipts ORDER BY id DESC LIMIT 50)"
    )
    .run();

  if (mode === "timeout") {
    // Hang longer than the dispatcher's 5s delivery timeout.
    await new Promise((r) => setTimeout(r, 8000));
  }

  if (mode === "down") {
    return NextResponse.json(
      { error: "simulated outage — destination is down" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    received: true,
    signature_valid: verification.valid,
    ...(verification.valid ? {} : { signature_error: verification.reason }),
  });
}
