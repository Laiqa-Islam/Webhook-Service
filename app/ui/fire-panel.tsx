"use client";

import { useState } from "react";
import type { EndpointRow } from "@/lib/types";
import { Panel } from "./bits";

const PRESETS: Record<string, object> = {
  "payment.succeeded": {
    amount: 4200,
    currency: "usd",
    customer: "cus_7f31ab",
    method: "card",
  },
  "invoice.created": {
    invoice: "in_88f0c2",
    total: 12900,
    currency: "usd",
    due_date: "2026-08-01",
  },
  "user.signed_up": {
    user_id: "usr_e19d44",
    email: "ada@example.com",
    plan: "pro",
  },
  "subscription.canceled": {
    subscription: "sub_51c9aa",
    reason: "payment_failed",
    canceled_at: "2026-07-07T12:00:00Z",
  },
};

export function FirePanel({
  endpoints,
  onFired,
}: {
  endpoints: EndpointRow[];
  onFired: () => void;
}) {
  const [type, setType] = useState("payment.succeeded");
  const [payload, setPayload] = useState(
    JSON.stringify(PRESETS["payment.succeeded"], null, 2)
  );
  const [target, setTarget] = useState("all");
  const [idemKey, setIdemKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const fire = async () => {
    let data: unknown;
    try {
      data = JSON.parse(payload);
    } catch {
      setNote({ ok: false, text: "payload is not valid JSON" });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idemKey.trim() ? { "Idempotency-Key": idemKey.trim() } : {}),
        },
        body: JSON.stringify({
          type,
          data,
          ...(target !== "all" ? { endpoint_id: target } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNote({ ok: false, text: json.error ?? `HTTP ${res.status}` });
      } else if (json.idempotent_replay) {
        setNote({
          ok: true,
          text: `idempotent replay — ${json.event.id} already ingested, no new deliveries`,
        });
      } else {
        setNote({
          ok: true,
          text: `${json.event.id} → ${json.deliveries.length} deliver${json.deliveries.length === 1 ? "y" : "ies"} enqueued`,
        });
        onFired();
      }
    } catch (err) {
      setNote({ ok: false, text: String(err) });
    } finally {
      setBusy(false);
    }
  };

  // Hammer the ingest API to show the token bucket pushing back with 429s.
  const burst = async () => {
    let data: unknown;
    try {
      data = JSON.parse(payload);
    } catch {
      setNote({ ok: false, text: "payload is not valid JSON" });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const statuses = await Promise.all(
        Array.from({ length: 15 }, (_, i) =>
          fetch("/api/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type,
              data: { ...(data as object), burst_seq: i + 1 },
              ...(target !== "all" ? { endpoint_id: target } : {}),
            }),
          }).then((r) => r.status)
        )
      );
      const accepted = statuses.filter((s) => s === 201).length;
      const limited = statuses.filter((s) => s === 429).length;
      setNote({
        ok: true,
        text: `burst of 15: ${accepted} accepted · ${limited} rate-limited (429 + Retry-After)`,
      });
      onFired();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Fire Event">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {Object.keys(PRESETS).map((t) => (
            <button
              key={t}
              onClick={() => {
                setType(t);
                setPayload(JSON.stringify(PRESETS[t], null, 2));
              }}
              className={`rounded border px-2 py-0.5 font-mono text-[0.65rem] transition-colors ${
                type === t
                  ? "border-amber/60 bg-amber/10 text-amber"
                  : "border-line text-mut hover:border-lineb hover:text-ink"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div>
          <label className="label mb-1 block">event type</label>
          <input
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded border border-line bg-panel2 px-2.5 py-1.5 font-mono text-xs text-ink"
            placeholder="payment.succeeded"
          />
        </div>

        <div>
          <label className="label mb-1 block">payload · data</label>
          <textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            rows={6}
            spellCheck={false}
            className="w-full resize-y rounded border border-line bg-panel2 px-2.5 py-1.5 font-mono text-xs leading-relaxed text-ink"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label mb-1 block">target</label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full rounded border border-line bg-panel2 px-2 py-1.5 font-mono text-xs text-ink"
            >
              <option value="all">all active endpoints</option>
              {endpoints.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {ep.url.replace(/^https?:\/\//, "")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label mb-1 block">idempotency key</label>
            <input
              value={idemKey}
              onChange={(e) => setIdemKey(e.target.value)}
              placeholder="optional"
              className="w-full rounded border border-line bg-panel2 px-2.5 py-1.5 font-mono text-xs text-ink placeholder:text-dim"
            />
          </div>
        </div>

        <div className="mt-1 flex gap-1.5">
          <button
            onClick={fire}
            disabled={busy}
            className="flex-1 rounded border border-amber/60 bg-amber/15 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-amber transition-colors hover:bg-amber/25 disabled:opacity-40"
          >
            {busy ? "Firing…" : "▸ Fire Event"}
          </button>
          <button
            onClick={burst}
            disabled={busy}
            title="fire 15 at once — watch the rate limiter reject the overflow"
            className="shrink-0 rounded border border-line px-3 py-2 font-mono text-[0.65rem] font-bold tracking-[0.1em] text-mut transition-colors hover:border-lineb hover:text-ink disabled:opacity-40"
          >
            ×15 BURST
          </button>
        </div>

        {note && (
          <p
            className={`font-mono text-[0.7rem] leading-snug ${note.ok ? "text-grn" : "text-red"}`}
          >
            {note.text}
          </p>
        )}
      </div>
    </Panel>
  );
}
