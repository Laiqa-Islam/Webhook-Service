"use client";

import { useState } from "react";
import type { EndpointHealth, EndpointRow } from "@/lib/types";
import { CIRCUIT_COOLDOWN_MS } from "@/lib/constants";
import { Panel, inSecs } from "./bits";

function CircuitBadge({ ep, now }: { ep: EndpointRow; now: number }) {
  if (ep.circuit_state === "open") {
    const probeAt = (ep.circuit_opened_at ?? now) + CIRCUIT_COOLDOWN_MS;
    return (
      <span className="shrink-0 rounded bg-red/15 px-1.5 py-px font-mono text-[0.58rem] font-bold tracking-wider text-red">
        CIRCUIT OPEN · probe in {inSecs(probeAt, now)}
      </span>
    );
  }
  if (ep.circuit_state === "half_open") {
    return (
      <span className="blink shrink-0 rounded bg-amber/15 px-1.5 py-px font-mono text-[0.58rem] font-bold tracking-wider text-amber">
        PROBING
      </span>
    );
  }
  if (ep.consecutive_failures > 0) {
    return (
      <span className="shrink-0 rounded bg-amber/10 px-1.5 py-px font-mono text-[0.58rem] font-bold tracking-wider text-amber/80">
        {ep.consecutive_failures} FAIL{ep.consecutive_failures > 1 ? "S" : ""}
      </span>
    );
  }
  return null;
}

export function EndpointsPanel({
  endpoints,
  health,
  demoEndpointId,
  now,
  onChanged,
}: {
  endpoints: EndpointRow[];
  health: Record<string, EndpointHealth>;
  demoEndpointId: string | null;
  now: number;
  onChanged: () => void;
}) {
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [eventTypes, setEventTypes] = useState("");
  const [strictOrdering, setStrictOrdering] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setError(null);
    const res = await fetch("/api/endpoints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        description,
        event_types: eventTypes.trim() || "*",
        strict_ordering: strictOrdering,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? `HTTP ${res.status}`);
      return;
    }
    setUrl("");
    setDescription("");
    setEventTypes("");
    setStrictOrdering(false);
    onChanged();
  };

  const toggle = async (ep: EndpointRow) => {
    await fetch(`/api/endpoints/${ep.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !ep.active }),
    });
    onChanged();
  };

  const remove = async (ep: EndpointRow) => {
    if (!confirm(`Delete endpoint ${ep.url} and its delivery history?`)) return;
    await fetch(`/api/endpoints/${ep.id}`, { method: "DELETE" });
    onChanged();
  };

  const rotate = async (ep: EndpointRow) => {
    if (
      !confirm(
        `Rotate the signing secret for ${ep.url}?\nThe old secret keeps verifying for 24h (deliveries carry both signatures).`
      )
    )
      return;
    await fetch(`/api/endpoints/${ep.id}/rotate`, { method: "POST" });
    setRevealed(ep.id);
    onChanged();
  };

  const copySecret = async (ep: EndpointRow) => {
    await navigator.clipboard.writeText(ep.secret);
    setCopied(ep.id);
    setTimeout(() => setCopied((c) => (c === ep.id ? null : c)), 1200);
  };

  return (
    <Panel title="Endpoints">
      <ul className="flex flex-col gap-2.5">
        {endpoints.map((ep) => {
          const h = health[ep.id];
          const rotating =
            ep.old_secret_expires_at !== null && ep.old_secret_expires_at > now;
          return (
            <li key={ep.id} className="rounded border border-line bg-panel2 p-2.5">
              <div className="flex items-center gap-2">
                <span
                  className="dot"
                  style={{
                    backgroundColor: !ep.active
                      ? "var(--dim)"
                      : ep.circuit_state === "open"
                        ? "var(--red)"
                        : ep.circuit_state === "half_open"
                          ? "var(--amber)"
                          : "var(--grn)",
                  }}
                />
                <span className="truncate font-mono text-[0.72rem] text-ink">
                  {ep.url}
                </span>
                {ep.id === demoEndpointId && (
                  <span className="shrink-0 rounded bg-blu/15 px-1.5 py-px font-mono text-[0.58rem] font-bold tracking-wider text-blu">
                    DEMO
                  </span>
                )}
                {ep.strict_ordering === 1 && (
                  <span
                    className="shrink-0 rounded bg-panel px-1.5 py-px font-mono text-[0.58rem] font-bold tracking-wider text-mut"
                    title="strict ordering — one delivery at a time, in order; a retrying delivery blocks the queue"
                  >
                    FIFO
                  </span>
                )}
                <CircuitBadge ep={ep} now={now} />
              </div>
              <p className="mt-1 pl-4 font-mono text-[0.62rem] text-dim">
                listens:{" "}
                <span className="text-mut">
                  {ep.event_types === "*" ? "all events" : ep.event_types}
                </span>
              </p>
              {ep.description && (
                <p className="mt-1 pl-4 text-[0.68rem] text-dim">{ep.description}</p>
              )}
              {h && (
                <p className="mt-1 pl-4 font-mono text-[0.62rem] text-dim">
                  {h.attempts} attempt{h.attempts === 1 ? "" : "s"} ·{" "}
                  <span
                    style={{
                      color:
                        h.successRate === null
                          ? undefined
                          : h.successRate >= 90
                            ? "var(--grn)"
                            : h.successRate >= 50
                              ? "var(--amber)"
                              : "var(--red)",
                    }}
                  >
                    {h.successRate ?? "—"}% ok
                  </span>
                  {h.avgMs !== null && <> · avg {h.avgMs}ms</>}
                </p>
              )}
              <div className="mt-1.5 flex items-center gap-2 pl-4">
                <button
                  onClick={() => setRevealed(revealed === ep.id ? null : ep.id)}
                  className="truncate font-mono text-[0.65rem] text-mut hover:text-ink"
                >
                  {revealed === ep.id ? ep.secret : "whsec_••••••••"}
                </button>
                <button
                  onClick={() => copySecret(ep)}
                  className="font-mono text-[0.65rem] text-dim hover:text-ink"
                >
                  {copied === ep.id ? "copied ✓" : "copy"}
                </button>
                <span className="ml-auto" />
                <button
                  onClick={() => rotate(ep)}
                  className="font-mono text-[0.65rem] text-mut hover:text-ink"
                  title="rotate signing secret (old one stays valid 24h)"
                >
                  rotate
                </button>
                <button
                  onClick={() => toggle(ep)}
                  className="font-mono text-[0.65rem] text-mut hover:text-ink"
                >
                  {ep.active ? "pause" : "resume"}
                </button>
                {ep.id !== demoEndpointId && (
                  <button
                    onClick={() => remove(ep)}
                    className="font-mono text-[0.65rem] text-red/70 hover:text-red"
                  >
                    delete
                  </button>
                )}
              </div>
              {rotating && (
                <p className="mt-1 pl-4 font-mono text-[0.6rem] text-amber/80">
                  ⟳ rotated — old secret verifies until{" "}
                  {new Date(ep.old_secret_expires_at!).toLocaleString()} (dual-signed)
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/webhooks"
          className="w-full rounded border border-line bg-panel2 px-2.5 py-1.5 font-mono text-xs text-ink placeholder:text-dim"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="description (optional)"
          className="w-full rounded border border-line bg-panel2 px-2.5 py-1.5 text-xs text-ink placeholder:text-dim"
        />
        <div className="flex gap-1.5">
          <input
            value={eventTypes}
            onChange={(e) => setEventTypes(e.target.value)}
            placeholder='event types, e.g. payment.*, invoice.paid (default *)'
            className="min-w-0 flex-1 rounded border border-line bg-panel2 px-2.5 py-1.5 font-mono text-[0.68rem] text-ink placeholder:text-dim"
          />
          <label
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded border border-line px-2.5 font-mono text-[0.62rem] text-mut hover:border-lineb"
            title="one delivery at a time, in order — a retrying delivery blocks everything behind it"
          >
            <input
              type="checkbox"
              checked={strictOrdering}
              onChange={(e) => setStrictOrdering(e.target.checked)}
              className="accent-[var(--amber)]"
            />
            FIFO
          </label>
          <button
            onClick={add}
            className="shrink-0 rounded border border-line px-3 py-1.5 font-mono text-[0.65rem] font-bold tracking-[0.12em] text-mut transition-colors hover:border-lineb hover:text-ink"
          >
            + ADD
          </button>
        </div>
        <p className="font-mono text-[0.6rem] leading-relaxed text-dim">
          URLs are SSRF-checked: private IPs, link-local/metadata ranges, and
          internal hostnames are rejected.
        </p>
        {error && <p className="font-mono text-[0.68rem] text-red">{error}</p>}
      </div>
    </Panel>
  );
}
