import { randomBytes } from "node:crypto";

/** Stripe-style prefixed ids, e.g. evt_9f2c1ab34d56e78f */
export function newId(prefix: "evt" | "ep" | "dlv" | "att"): string {
  return `${prefix}_${randomBytes(9).toString("hex")}`;
}

/** Signing secret shared with the endpoint owner, e.g. whsec_... */
export function newSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}
