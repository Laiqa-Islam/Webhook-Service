import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DEFAULT_MAX_ATTEMPTS } from "@/lib/constants";
import type { DeliveryRow } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Replay a delivery: re-enqueue it for immediate dispatch with a fresh retry
 * budget. Attempt history is preserved — the replayed attempt shows up as the
 * next attempt number, tagged `manual`.
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const delivery = db()
    .prepare("SELECT * FROM deliveries WHERE id = ?")
    .get(id) as unknown as DeliveryRow | undefined;
  if (!delivery) {
    return NextResponse.json({ error: "delivery not found" }, { status: 404 });
  }
  if (delivery.status === "processing" || delivery.status === "pending") {
    return NextResponse.json(
      { error: `delivery is already ${delivery.status}` },
      { status: 409 }
    );
  }

  const now = Date.now();
  db()
    .prepare(
      `UPDATE deliveries
       SET status = 'pending', next_attempt_at = ?, max_attempts = ?, manual_next = 1, updated_at = ?
       WHERE id = ?`
    )
    .run(now, delivery.attempt_count + DEFAULT_MAX_ATTEMPTS, now, id);

  return NextResponse.json({ replayed: id });
}
