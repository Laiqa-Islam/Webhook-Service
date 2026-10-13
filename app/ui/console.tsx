"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityBucket, DestinationMode, Overview } from "@/lib/types";
import { Feed } from "./feed";
import { FirePanel } from "./fire-panel";
import { DestinationPanel } from "./destination-panel";
import { EndpointsPanel } from "./endpoints-panel";

const POLL_MS = 2000;

/** Relay's signature broadcast mark. */
function RelayMark() {
  return (
    <span
      className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line"
      style={{
        background:
          "linear-gradient(180deg, rgba(255,180,61,0.16), rgba(255,180,61,0.02))",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 22px -14px rgba(255,180,61,0.7)",
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="2.6" fill="var(--amber)" />
        <path d="M7.4 7.4a6.6 6.6 0 000 9.2" stroke="var(--amber)" strokeWidth="1.6" strokeLinecap="round" opacity="0.9" />
        <path d="M16.6 7.4a6.6 6.6 0 010 9.2" stroke="var(--amber)" strokeWidth="1.6" strokeLinecap="round" opacity="0.9" />
        <path d="M4.7 4.7a10.4 10.4 0 000 14.6" stroke="var(--amber)" strokeWidth="1.4" strokeLinecap="round" opacity="0.4" />
        <path d="M19.3 4.7a10.4 10.4 0 010 14.6" stroke="var(--amber)" strokeWidth="1.4" strokeLinecap="round" opacity="0.4" />
      </svg>
    </span>
  );
}

/** Attempt volume, last 15 min: green = delivered, red = failed, stacked. */
function Sparkline({ activity }: { activity: ActivityBucket[] }) {
  const w = 4;
  const gap = 1.5;
  const h = 30;
  const max = Math.max(1, ...activity.map((b) => b.ok + b.fail));
  const total = activity.reduce((n, b) => n + b.ok + b.fail, 0);
  return (
    <div className="flex flex-col items-center px-2">
      <svg
        width={activity.length * (w + gap)}
        height={h}
        className="block"
        aria-label="delivery attempts over the last 15 minutes"
      >
        {activity.map((b, i) => {
          const x = i * (w + gap);
          const okH = Math.round((b.ok / max) * (h - 2));
          const failH = Math.round((b.fail / max) * (h - 2));
          return (
            <g key={b.t}>
              {okH > 0 && (
                <rect x={x} y={h - okH} width={w} height={okH} rx={1} fill="var(--grn)" opacity={0.9} />
              )}
              {failH > 0 && (
                <rect x={x} y={h - okH - failH - (okH > 0 ? 1 : 0)} width={w} height={failH} rx={1} fill="var(--red)" opacity={0.9} />
              )}
              {okH === 0 && failH === 0 && (
                <rect x={x} y={h - 1.5} width={w} height={1.5} rx={0.5} fill="var(--line)" />
              )}
            </g>
          );
        })}
      </svg>
      <span className="label mt-1">attempts · 15 min ({total})</span>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="flex min-w-[58px] flex-col items-center px-2.5">
      <span
        className="tnum font-mono text-[1.35rem] font-semibold leading-none"
        style={{ color: color ?? "var(--ink)" }}
      >
        {value}
      </span>
      <span className="label mt-1.5">{label}</span>
    </div>
  );
}

export function Console() {
  const [data, setData] = useState<Overview | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/overview", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {
      // server restarting mid-poll — next tick will catch up
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loop = async () => {
      await refresh();
      if (!cancelled) timer.current = setTimeout(loop, POLL_MS);
    };
    loop();
    const clockTick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      clearInterval(clockTick);
    };
  }, [refresh]);

  const setMode = async (mode: DestinationMode) => {
    // Optimistic — the poll will confirm.
    setData((d) =>
      d ? { ...d, destination: { ...d.destination, mode } } : d
    );
    await fetch("/api/destination/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    refresh();
  };

  const replay = async (id: string) => {
    setReplayingId(id);
    try {
      await fetch(`/api/deliveries/${id}/replay`, { method: "POST" });
      await refresh();
    } finally {
      setReplayingId(null);
    }
  };

  const replayAllFailed = async () => {
    await fetch("/api/deliveries/replay-failed", { method: "POST" });
    refresh();
  };

  if (!data) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <RelayMark />
        <span className="label flex items-center gap-2 !text-dim">
          <span
            className="dot dot-live"
            style={{ backgroundColor: "var(--amber)", color: "var(--amber)" }}
          />
          connecting to console
        </span>
      </main>
    );
  }

  const { stats } = data;
  const successColor =
    stats.successRate === null
      ? undefined
      : stats.successRate >= 90
        ? "var(--grn)"
        : stats.successRate >= 50
          ? "var(--amber)"
          : "var(--red)";
  const statItems: { label: string; value: string | number; color?: string }[] = [
    { label: "events", value: stats.events },
    { label: "deliveries", value: stats.deliveries },
    {
      label: "in flight",
      value: stats.inFlight,
      color: stats.inFlight > 0 ? "var(--amber)" : undefined,
    },
    { label: "delivered", value: stats.succeeded, color: "var(--grn)" },
    {
      label: "failed",
      value: stats.failed,
      color: stats.failed > 0 ? "var(--red)" : undefined,
    },
    {
      label: "success",
      value: stats.successRate === null ? "—" : `${stats.successRate}%`,
      color: successColor,
    },
  ];

  return (
    <main className="mx-auto w-full max-w-[1400px] px-5 py-6">
      <header className="rise mb-7 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="flex items-center gap-3.5">
          <RelayMark />
          <div>
            <h1 className="flex items-baseline gap-2.5">
              <span className="text-[1.7rem] font-extrabold leading-none tracking-[-0.02em]">
                Relay
              </span>
              <span className="label !text-dim">webhook delivery console</span>
            </h1>
            <p className="mt-2 flex items-center gap-2.5 text-[0.72rem] text-mut">
              <span className="inline-flex items-center gap-1.5 font-mono text-grn">
                <span
                  className="dot dot-live"
                  style={{ backgroundColor: "var(--grn)", color: "var(--grn)" }}
                />
                live
              </span>
              <span className="text-dim">·</span>
              <span className="font-mono text-dim">
                signed · backoff retries · idempotent · replayable
              </span>
            </p>
          </div>
        </div>

        <div className="surface flex flex-wrap items-center gap-y-2 rounded-2xl px-2.5 py-2.5">
          <Sparkline activity={data.activity} />
          {statItems.map((s) => (
            <div key={s.label} className="flex items-center">
              <span className="mx-0.5 h-9 w-px bg-line" />
              <Stat label={s.label} value={s.value} color={s.color} />
            </div>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-[380px_1fr] gap-5 max-lg:grid-cols-1">
        <div className="flex flex-col gap-5">
          <div className="rise" style={{ animationDelay: "60ms" }}>
            <FirePanel
              endpoints={data.endpoints.filter((e) => e.active)}
              onFired={refresh}
            />
          </div>
          <div className="rise" style={{ animationDelay: "120ms" }}>
            <DestinationPanel
              mode={data.destination.mode}
              receipts={data.destination.receipts}
              onModeChange={setMode}
            />
          </div>
          <div className="rise" style={{ animationDelay: "180ms" }}>
            <EndpointsPanel
              endpoints={data.endpoints}
              health={data.endpointHealth}
              demoEndpointId={data.destination.demoEndpointId}
              now={now}
              onChanged={refresh}
            />
          </div>
        </div>

        <div className="rise" style={{ animationDelay: "90ms" }}>
          <div className="mb-2.5 flex items-center justify-between px-0.5">
            <h2 className="label flex items-center gap-2 !text-mut">
              <span
                className="dot dot-live"
                style={{ backgroundColor: "var(--grn)", color: "var(--grn)" }}
              />
              Delivery Feed · live
            </h2>
            <span className="font-mono text-[0.62rem] text-dim">
              polling every {POLL_MS / 1000}s
            </span>
          </div>
          <Feed
            deliveries={data.deliveries}
            now={now}
            failedCount={stats.failed}
            onReplay={replay}
            onReplayAllFailed={replayAllFailed}
            replayingId={replayingId}
          />
        </div>
      </div>
    </main>
  );
}
