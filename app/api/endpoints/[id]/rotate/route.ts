import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { newSecret } from "@/lib/id";
import { SECRET_ROTATION_GRACE_MS } from "@/lib/constants";
import type { EndpointRow } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Rotate an endpoint's signing secret with zero downtime.
 *
 * The old secret stays valid for a 24h grace window: every delivery in that
 * window carries two v1 signatures (new secret first, old second), so
 * consumers verifying with either secret keep working while they migrate.
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const endpoint = db()
    .prepare("SELECT * FROM endpoints WHERE id = ?")
    .get(id) as unknown as EndpointRow | undefined;
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint not found" }, { status: 404 });
  }

  const now = Date.now();
  const secret = newSecret();
  db()
    .prepare(
      "UPDATE endpoints SET secret = ?, old_secret = ?, old_secret_expires_at = ? WHERE id = ?"
    )
    .run(secret, endpoint.secret, now + SECRET_ROTATION_GRACE_MS, id);

  return NextResponse.json({
    endpoint_id: id,
    secret,
    old_secret_expires_at: now + SECRET_ROTATION_GRACE_MS,
  });
}
