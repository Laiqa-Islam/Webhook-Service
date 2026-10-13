"use client";

import { useState } from "react";
import type { DeliveryView } from "@/lib/types";
import { StatusBadge, clock, ago, inSecs } from "./bits";

function AttemptTicks({ d }: { d: DeliveryView }) {
  const ticks = [];
  for (let i = 0; i < Math.max(d.max_attempts, d.attempts.length); i++) {
    const attempt = d.attempts[i];
    if (attempt) {
      ticks.push(
        <span
          key={i}
          className="tick"
          title={`#${attempt.attempt_number}: ${attempt.error ?? `${attempt.status_code} OK`} (${attempt.duration_ms}ms)`}
          style={{
            backgroundColor: attempt.ok ? "var(--grn)" : "var(--red)",
            opacity: attempt.ok ? 1 : 0.85,
          }}
        />
      );
    } else {
      const isNext =
        i === d.attempts.length &&
        (d.status === "retrying" || d.status === "pending" || d.status === "processing");
      ticks.push(
        <span
          key={i}
          className={`tick ${isNext ? "blink" : ""}`}
          style={{
            backgroundColor: isNext ? "var(--amber)" : "transparent",
            border: isNext ? "none" : "1px solid var(--line)",
          }}
        />
      );
    }
  }
  return <span className="flex items-center gap-[3px]">{ticks}</span>;
}

function DeliveryDetail({
  d,
  onReplay,
  replaying,
}: {
  d: DeliveryView;
  onReplay: (id: string) => void;
  replaying: boolean;
}) {
  const replayLabel =
    d.status === "failed"
      ? "⟳ Replay"
      : d.status === "succeeded"
        ? "⟳ Resend"
        : d.status === "retrying"
          ? "⟳ Retry now"
          : null;

  return (
    <div className="border-t border-line/60 bg-panel2/50 px-4 py-3">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="font-mono text-[0.68rem] leading-relaxed text-mut">
          <div>
            <span className="text-dim">event </span>
            {d.event_id}
            <span className="text-dim"> · delivery </span>
            {d.id}
          </div>
          <div>
            <span className="text-dim">endpoint </span>
            {d.endpoint_url}
          </div>
          {d.last_error && d.status !== "succeeded" && (
            <div className="text-red">
              <span className="text-dim">last error </span>
              {d.last_error}
            </div>
          )}
        </div>
        {replayLabel && (
          <button
            onClick={() => onReplay(d.id)}
            disabled={replaying}
            className="rounded border border-blu/50 bg-blu/10 px-2.5 py-1 font-mono text-[0.68rem] font-semibold text-blu transition-colors hover:bg-blu/20 disabled:opacity-40"
          >
            {replaying ? "queueing…" : replayLabel}
          </button>
        )}
      </div>

      <table className="w-full font-mono text-[0.68rem]">
        <thead>
          <tr className="text-left text-dim">
            <th className="pb-1 pr-3 font-normal">#</th>
            <th className="pb-1 pr-3 font-normal">time</th>
            <th className="pb-1 pr-3 font-normal">trigger</th>
            <th className="pb-1 pr-3 font-normal">result</th>
            <th className="pb-1 font-normal">latency</th>
          </tr>
        </thead>
        <tbody>
          {d.attempts.length === 0 && (
            <tr>
              <td colSpan={5} className="py-1 text-dim">
                no attempts yet — dispatcher picks it up within ~1.5s
              </td>
            </tr>
          )}
          {d.attempts.map((a) => (
            <tr key={a.id} className="border-t border-line/40">
              <td className="py-1 pr-3 text-mut">{a.attempt_number}</td>
              <td className="py-1 pr-3 text-mut">{clock(a.created_at)}</td>
              <td className="py-1 pr-3 text-dim">{a.triggered_by}</td>
              <td
                className="py-1 pr-3"
                style={{ color: a.ok ? "var(--grn)" : "var(--red)" }}
              >
                {a.ok
                  ? `${a.status_code} delivered`
                  : (a.error ?? `HTTP ${a.status_code}`)}
              </td>
              <td className="py-1 text-mut">{a.duration_ms}ms</td>
            </tr>
          ))}
        </tbody>
      </table>

      <details className="mt-2">
        <summary className="cursor-pointer font-mono text-[0.65rem] text-dim hover:text-mut">
          signed payload
        </summary>
        <pre className="mt-1.5 max-h-40 overflow-auto rounded border border-line/60 bg-bg/60 p-2.5 font-mono text-[0.65rem] leading-relaxed text-mut">
          {JSON.stringify(
            {
              id: d.event_id,
              type: d.event_type,
              created_at: d.created_at,
              data: JSON.parse(d.payload),
            },
            null,
            2
          )}
        </pre>
      </details>
    </div>
  );
}

type Filter = "all" | "inflight" | "succeeded" | "failed";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "all" },
  { value: "inflight", label: "in flight" },
  { value: "succeeded", label: "delivered" },
  { value: "failed", label: "failed" },
];

function matches(filter: Filter, d: DeliveryView): boolean {
  if (filter === "all") return true;
  if (filter === "inflight")
    return d.status === "pending" || d.status === "processing" || d.status === "retrying";
  return d.status === filter;
}

export function Feed({
  deliveries,
  now,
  failedCount,
  onReplay,
  onReplayAllFailed,
  replayingId,
}: {
  deliveries: DeliveryView[];
  now: number;
  failedCount: number;
  onReplay: (id: string) => void;
  onReplayAllFailed: () => void;
  replayingId: string | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const visible = deliveries.filter((d) => matches(filter, d));

  const controls = (
    <div className="mb-2 flex items-center gap-1.5">
      {FILTERS.map((f) => (
        <button
          key={f.value}
          onClick={() => setFilter(f.value)}
          className={`rounded border px-2 py-0.5 font-mono text-[0.62rem] transition-colors ${
            filter === f.value
              ? "border-lineb bg-panel2 text-ink"
              : "border-line text-dim hover:text-mut"
          }`}
        >
          {f.label}
        </button>
      ))}
      {failedCount > 0 && (
        <button
          onClick={onReplayAllFailed}
          className="ml-auto rounded border border-red/40 bg-red/10 px-2 py-0.5 font-mono text-[0.62rem] font-semibold text-red transition-colors hover:bg-red/20"
        >
          ⟳ replay all failed ({failedCount})
        </button>
      )}
    </div>
  );

  if (deliveries.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-line font-mono text-xs text-dim">
        no deliveries yet — fire an event to see the pipeline move
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <>
        {controls}
        <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-line font-mono text-xs text-dim">
          nothing matches this filter
        </div>
      </>
    );
  }

  return (
    <>
    {controls}
    <div className="surface overflow-hidden">
      <div className="grid grid-cols-[120px_1fr_140px_120px] gap-3 border-b border-line px-4 py-2.5 max-lg:grid-cols-[110px_1fr_110px]">
        <span className="label">status</span>
        <span className="label">event → endpoint</span>
        <span className="label">attempts</span>
        <span className="label max-lg:hidden">next / when</span>
      </div>
      <ul>
        {visible.map((d) => (
          <li key={d.id} className="row-in border-b border-line/50 last:border-b-0">
            <button
              onClick={() => setOpen(open === d.id ? null : d.id)}
              className="grid w-full grid-cols-[120px_1fr_140px_120px] items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-panel2/60 max-lg:grid-cols-[110px_1fr_110px]"
            >
              <StatusBadge status={d.status} />
              <span className="min-w-0">
                <span className="block truncate font-mono text-[0.72rem] text-ink">
                  {d.event_type}
                </span>
                <span className="block truncate font-mono text-[0.62rem] text-dim">
                  {d.endpoint_url.replace(/^https?:\/\//, "")}
                </span>
              </span>
              <AttemptTicks d={d} />
              <span className="font-mono text-[0.65rem] text-mut max-lg:hidden">
                {d.status === "retrying" || d.status === "pending" ? (
                  <span className="text-amber">
                    retry in {inSecs(d.next_attempt_at, now)}
                  </span>
                ) : (
                  ago(d.updated_at, now)
                )}
              </span>
            </button>
            {open === d.id && (
              <DeliveryDetail
                d={d}
                onReplay={onReplay}
                replaying={replayingId === d.id}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
    </>
  );
}
