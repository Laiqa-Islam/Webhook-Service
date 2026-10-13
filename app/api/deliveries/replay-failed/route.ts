import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DEFAULT_MAX_ATTEMPTS } from "@/lib/constants";

export const runtime = "nodejs";

/** Re-enqueue every permanently failed delivery (drain the dead letter queue). */
export async function POST() {
  const now = Date.now();
  const result = db()
    .prepare(
      `UPDATE deliveries
       SET status = 'pending', next_attempt_at = ?, max_attempts = attempt_count + ?, manual_next = 1, updated_at = ?
       WHERE status = 'failed'`
    )
    .run(now, DEFAULT_MAX_ATTEMPTS, now);

  return NextResponse.json({ replayed: result.changes });
}
