import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkEndpointUrl } from "@/lib/guard";
import { normalizePatterns } from "@/lib/match";
import type { EndpointRow } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const existing = db()
    .prepare("SELECT * FROM endpoints WHERE id = ?")
    .get(id) as unknown as EndpointRow | undefined;
  if (!existing) {
    return NextResponse.json({ error: "endpoint not found" }, { status: 404 });
  }

  let body: {
    url?: string;
    description?: string;
    active?: boolean;
    event_types?: string;
    strict_ordering?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const url = body.url?.trim() ?? existing.url;
  const check = checkEndpointUrl(url);
  if (!check.ok) {
    return NextResponse.json(
      { error: `unsafe endpoint URL: ${check.reason}` },
      { status: 400 }
    );
  }
  const description = body.description?.trim() ?? existing.description;
  const active =
    body.active === undefined ? existing.active : body.active ? 1 : 0;
  let eventTypes = existing.event_types;
  if (body.event_types !== undefined) {
    const patterns = normalizePatterns(body.event_types);
    if (!patterns.ok) {
      return NextResponse.json({ error: patterns.reason }, { status: 400 });
    }
    eventTypes = patterns.value;
  }
  const strictOrdering =
    body.strict_ordering === undefined
      ? existing.strict_ordering
      : body.strict_ordering
        ? 1
        : 0;

  db()
    .prepare(
      "UPDATE endpoints SET url = ?, description = ?, active = ?, event_types = ?, strict_ordering = ? WHERE id = ?"
    )
    .run(url, description, active, eventTypes, strictOrdering, id);

  return NextResponse.json({
    endpoint: {
      ...existing,
      url,
      description,
      active,
      event_types: eventTypes,
      strict_ordering: strictOrdering,
    },
  });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const database = db();
  const existing = database
    .prepare("SELECT id FROM endpoints WHERE id = ?")
    .get(id);
  if (!existing) {
    return NextResponse.json({ error: "endpoint not found" }, { status: 404 });
  }

  database
    .prepare(
      "DELETE FROM attempts WHERE delivery_id IN (SELECT id FROM deliveries WHERE endpoint_id = ?)"
    )
    .run(id);
  database.prepare("DELETE FROM deliveries WHERE endpoint_id = ?").run(id);
  database.prepare("DELETE FROM endpoints WHERE id = ?").run(id);

  return NextResponse.json({ deleted: id });
}
