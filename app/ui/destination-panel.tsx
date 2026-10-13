"use client";

import type { DestinationMode, ReceiptRow } from "@/lib/types";
import { Panel, clock } from "./bits";

const MODES: {
  value: DestinationMode;
  label: string;
  hint: string;
  color: string;
}[] = [
  { value: "healthy", label: "HEALTHY", hint: "responds 200", color: "var(--grn)" },
  { value: "down", label: "DOWN", hint: "responds 500", color: "var(--red)" },
  { value: "timeout", label: "TIMEOUT", hint: "hangs 8s", color: "var(--amber)" },
];

export function DestinationPanel({
  mode,
  receipts,
  onModeChange,
}: {
  mode: DestinationMode;
  receipts: ReceiptRow[];
  onModeChange: (mode: DestinationMode) => void;
}) {
  const active = MODES.find((m) => m.value === mode)!;

  return (
    <Panel
      title="Demo Destination"
      accent={
        <span className="inline-flex items-center gap-1.5">
          <span
            className={`dot ${mode !== "healthy" ? "" : "dot-live"}`}
            style={{ backgroundColor: active.color }}
          />
          <span
            className="font-mono text-[0.65rem] font-semibold tracking-[0.12em]"
            style={{ color: active.color }}
          >
            {active.label}
          </span>
        </span>
      }
    >
      <p className="mb-3 font-mono text-[0.7rem] leading-relaxed text-mut">
        /api/destination — a fake customer server that verifies signatures.
        Kill it, watch retries pile up, then revive it.
      </p>

      <div className="mb-4 grid grid-cols-3 gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => onModeChange(m.value)}
            className={`rounded border px-2 py-1.5 text-center transition-colors ${
              mode === m.value
                ? "border-lineb bg-panel2"
                : "border-line hover:border-lineb"
            }`}
            style={mode === m.value ? { borderColor: m.color } : undefined}
          >
            <span
              className="block font-mono text-[0.65rem] font-bold tracking-[0.1em]"
              style={{ color: mode === m.value ? m.color : "var(--mut)" }}
            >
              {m.label}
            </span>
            <span className="block text-[0.6rem] text-dim">{m.hint}</span>
          </button>
        ))}
      </div>

      <div className="label mb-2">received by destination</div>
      {receipts.length === 0 ? (
        <p className="font-mono text-[0.7rem] text-dim">nothing yet</p>
      ) : (
        <ul className="flex max-h-44 flex-col gap-1 overflow-y-auto">
          {receipts.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 font-mono text-[0.68rem]"
            >
              <span className="text-dim">{clock(r.received_at)}</span>
              <span
                style={{
                  color:
                    r.responded_status === 200
                      ? "var(--grn)"
                      : r.responded_status === 0
                        ? "var(--amber)"
                        : "var(--red)",
                }}
              >
                {r.responded_status === 0 ? "hang" : r.responded_status}
              </span>
              <span className="truncate text-mut">{r.event_type ?? "?"}</span>
              <span className="ml-auto shrink-0 text-dim">
                #{r.attempt ?? "?"}
              </span>
              <span
                title={r.signature_valid ? "signature verified" : "bad signature"}
                style={{ color: r.signature_valid ? "var(--grn)" : "var(--red)" }}
              >
                {r.signature_valid ? "sig✓" : "sig✗"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
