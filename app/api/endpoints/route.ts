import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { newId, newSecret } from "@/lib/id";
import { checkEndpointUrl } from "@/lib/guard";
import { normalizePatterns } from "@/lib/match";
import type { EndpointRow } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const endpoints = db()
    .prepare("SELECT * FROM endpoints ORDER BY created_at ASC")
    .all() as unknown as EndpointRow[];
  return NextResponse.json({ endpoints });
}

/**
 * Register a destination endpoint.
 * Body: { url: string, description?: string, event_types?: string, strict_ordering?: boolean }
 * `event_types` is a comma-separated pattern list, e.g. "payment.*, invoice.paid" (default "*").
 */
export async function POST(req: NextRequest) {
  let body: {
    url?: string;
    description?: string;
    event_types?: string;
    strict_ordering?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const url = body.url?.trim();
  if (!url) {
    return NextResponse.json({ error: "`url` is required" }, { status: 400 });
  }
  const check = checkEndpointUrl(url);
  if (!check.ok) {
    return NextResponse.json(
      { error: `unsafe endpoint URL: ${check.reason}` },
      { status: 400 }
    );
  }

  const patterns = normalizePatterns(body.event_types ?? "*");
  if (!patterns.ok) {
    return NextResponse.json({ error: patterns.reason }, { status: 400 });
  }

  const endpoint = {
    id: newId("ep"),
    url,
    description: body.description?.trim() ?? "",
    secret: newSecret(),
    active: 1,
    created_at: Date.now(),
    event_types: patterns.value,
    strict_ordering: body.strict_ordering ? 1 : 0,
  };
  db()
    .prepare(
      `INSERT INTO endpoints (id, url, description, secret, active, created_at, event_types, strict_ordering)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      endpoint.id,
      endpoint.url,
      endpoint.description,
      endpoint.secret,
      endpoint.active,
      endpoint.created_at,
      endpoint.event_types,
      endpoint.strict_ordering
    );

  return NextResponse.json({ endpoint }, { status: 201 });
}
