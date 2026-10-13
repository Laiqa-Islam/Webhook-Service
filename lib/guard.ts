import { isIP } from "node:net";

/**
 * SSRF guard for endpoint URLs.
 *
 * A webhook sender is a "confused deputy" risk: if we'll POST to any URL a
 * user registers, they can aim us at cloud metadata services or hosts inside
 * our network. So endpoint URLs are validated at registration and again at
 * delivery time.
 *
 * Loopback is allowed outside production so the built-in demo destination
 * works; private LAN / link-local / metadata ranges are always blocked.
 *
 * Known limitation (documented, not solved here): a hostname that resolves
 * to a private IP later (DNS rebinding) isn't caught — production systems
 * pin the resolved IP at request time.
 */

const ALLOW_LOOPBACK =
  process.env.NODE_ENV !== "production" ||
  process.env.ALLOW_LOCAL_ENDPOINTS === "1";

export function checkEndpointUrl(
  raw: string
): { ok: true } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "not a valid URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `scheme ${url.protocol}// is not allowed — use http(s)` };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "credentials in the URL are not allowed" };
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  const loopback =
    host === "localhost" ||
    host === "::1" ||
    (isIP(host) === 4 && host.startsWith("127."));
  if (loopback) {
    return ALLOW_LOOPBACK
      ? { ok: true }
      : { ok: false, reason: "loopback addresses are blocked in production" };
  }

  if (isIP(host) === 4 && isPrivateV4(host)) {
    return { ok: false, reason: `IP ${host} is in a private/reserved range` };
  }
  if (isIP(host) === 6 && isPrivateV6(host)) {
    return { ok: false, reason: `IP ${host} is in a private/reserved range` };
  }
  if (/\.(local|internal|localdomain)$/.test(host) || !host.includes(".")) {
    return { ok: false, reason: `hostname "${host}" looks internal` };
  }

  return { ok: true };
}

function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 172 && b >= 16 && b <= 31) ||
    a === 192 && b === 168 ||
    (a === 169 && b === 254) || // link-local, incl. 169.254.169.254 metadata
    a >= 224 // multicast + reserved
  );
}

function isPrivateV6(ip: string): boolean {
  const low = ip.toLowerCase();
  if (low.startsWith("::ffff:")) {
    const mapped = low.slice(7);
    return isIP(mapped) === 4 ? isPrivateV4(mapped) || mapped.startsWith("127.") : true;
  }
  return (
    low.startsWith("fc") ||
    low.startsWith("fd") || // unique local fc00::/7
    low.startsWith("fe8") ||
    low.startsWith("fe9") ||
    low.startsWith("fea") ||
    low.startsWith("feb") // link-local fe80::/10
  );
}
