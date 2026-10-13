import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";

export const runtime = "nodejs";

const MODES = ["healthy", "down", "timeout"] as const;

export async function GET() {
  return NextResponse.json({
    mode: getSetting("destination_mode") ?? "healthy",
  });
}

/** Flip the demo destination's kill switch. Body: { mode: "healthy" | "down" | "timeout" } */
export async function PUT(req: NextRequest) {
  let body: { mode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!MODES.includes(body.mode as (typeof MODES)[number])) {
    return NextResponse.json(
      { error: `mode must be one of: ${MODES.join(", ")}` },
      { status: 400 }
    );
  }
  setSetting("destination_mode", body.mode!);
  return NextResponse.json({ mode: body.mode });
}
