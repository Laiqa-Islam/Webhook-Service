"use client";

import type { DeliveryStatus } from "@/lib/types";

export const STATUS_META: Record<
  DeliveryStatus,
  { label: string; color: string; live: boolean }
> = {
  pending: { label: "QUEUED", color: "var(--blu)", live: true },
  processing: { label: "IN FLIGHT", color: "var(--amber)", live: true },
  retrying: { label: "RETRYING", color: "var(--amber)", live: true },
  succeeded: { label: "DELIVERED", color: "var(--grn)", live: false },
  failed: { label: "FAILED", color: "var(--red)", live: false },
};

export function StatusBadge({ status }: { status: DeliveryStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className="inline-flex items-center gap-1.5"
      style={{ color: meta.color }}
    >
      <span
        className={`dot ${meta.live ? "dot-live" : ""}`}
        style={{ backgroundColor: meta.color }}
      />
      <span className="font-mono text-[0.65rem] font-semibold tracking-[0.12em]">
        {meta.label}
      </span>
    </span>
  );
}

export function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-GB", { hour12: false });
}

export function ago(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function inSecs(ts: number, now: number): string {
  const s = Math.max(0, Math.ceil((ts - now) / 1000));
  return `${s}s`;
}

export function Panel({
  title,
  accent,
  children,
  className = "",
}: {
  title: string;
  accent?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`surface ${className}`}>
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <h2 className="label flex items-center gap-2 !text-mut">
          <span
            aria-hidden
            className="inline-block h-2.5 w-0.5 rounded-full bg-amber/70"
          />
          {title}
        </h2>
        {accent}
      </header>
      <div className="hair mx-4" />
      <div className="p-4">{children}</div>
    </section>
  );
}
