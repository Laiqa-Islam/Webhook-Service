/**
 * Event-type subscription matching (client-safe, no node imports).
 *
 * An endpoint subscribes with a comma-separated pattern list:
 *   "*"                        → every event
 *   "payment.succeeded"        → exactly that type
 *   "payment.*"                → any type under the payment. prefix
 *   "payment.*, invoice.paid"  → either
 */
export function parsePatterns(raw: string): string[] {
  const patterns = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return patterns.length > 0 ? patterns : ["*"];
}

export function matchesEventType(patternList: string, eventType: string): boolean {
  return parsePatterns(patternList).some((pattern) => {
    if (pattern === "*") return true;
    if (pattern.endsWith(".*"))
      return eventType.startsWith(pattern.slice(0, -1));
    return eventType === pattern;
  });
}

/** Validate a user-supplied pattern list; returns a normalized string or an error. */
export function normalizePatterns(
  raw: string
): { ok: true; value: string } | { ok: false; reason: string } {
  const patterns = parsePatterns(raw || "*");
  for (const p of patterns) {
    if (!/^(\*|[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+|\.\*)*)$/.test(p)) {
      return {
        ok: false,
        reason: `invalid pattern "${p}" — use "*", "a.b", or "a.*"`,
      };
    }
  }
  return { ok: true, value: patterns.join(", ") };
}
