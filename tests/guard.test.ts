import { test } from "node:test";
import assert from "node:assert/strict";
import { checkEndpointUrl } from "../lib/guard.ts";

const blocked = (url: string) => {
  const r = checkEndpointUrl(url);
  assert.equal(r.ok, false, `${url} should be blocked`);
};
const allowed = (url: string) => {
  const r = checkEndpointUrl(url);
  assert.equal(r.ok, true, `${url} should be allowed`);
};

test("public https endpoints are allowed", () => {
  allowed("https://example.com/webhooks");
  allowed("http://api.example.co.uk:8080/hook?x=1");
});

test("loopback is allowed outside production (demo destination)", () => {
  allowed("http://localhost:3000/api/destination");
  allowed("http://127.0.0.1/hook");
});

test("cloud metadata and link-local are blocked", () => {
  blocked("http://169.254.169.254/latest/meta-data");
  blocked("http://169.254.0.1/");
});

test("private ranges are blocked", () => {
  blocked("http://10.0.0.5/hook");
  blocked("http://172.16.0.1/hook");
  blocked("http://172.31.255.255/hook");
  blocked("http://192.168.1.1/hook");
  blocked("http://100.64.0.1/hook"); // CGNAT
  blocked("http://0.0.0.0/hook");
});

test("private IPv6 is blocked, including v4-mapped", () => {
  blocked("http://[fd12:3456::1]/hook");
  blocked("http://[fe80::1]/hook");
  blocked("http://[::ffff:192.168.1.1]/hook");
});

test("internal-looking hostnames are blocked", () => {
  blocked("http://db.internal/hook");
  blocked("http://printer.local/hook");
  blocked("http://intranet/hook"); // no dot
});

test("non-http schemes and embedded credentials are blocked", () => {
  blocked("ftp://example.com/hook");
  blocked("file:///etc/passwd");
  blocked("https://user:pass@example.com/hook");
  blocked("not a url");
});
