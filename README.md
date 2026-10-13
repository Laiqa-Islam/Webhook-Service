<div align="center">

# Relay

**A webhook delivery service: signed payloads, retries with backoff, and a live console that shows every attempt.**

Relay accepts an event over HTTP, signs it with HMAC-SHA256 the way Stripe does, and delivers it to your endpoints. When a delivery fails it retries with exponential backoff. When an endpoint stays down, a circuit breaker stops sending to it. Every attempt is logged, and any failed delivery can be replayed.

![Next.js 16](https://img.shields.io/badge/Next.js-16-000?logo=nextdotjs)
![React 19](https://img.shields.io/badge/React-19-149eca?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)
![Node](https://img.shields.io/badge/Node-%E2%89%A522.5-5fa04e?logo=nodedotjs&logoColor=white)
![Tests](https://img.shields.io/badge/tests-25%20passing-34e3a3)
![License: MIT](https://img.shields.io/badge/license-MIT-ffb43d)

</div>

---

## Why this exists

Sending a webhook is one `fetch()` call. Delivering it **reliably** is the hard part. The receiver might be down, slow, or flooded, and the same event must not arrive twice or out of order. Svix and Hookdeck are whole companies built around that problem.

Relay is a working, self-contained version of that system. Every mechanism runs live in the console, so you can watch it handle failures.

## Try it in 60 seconds

```bash
git clone <your-repo-url> relay && cd relay
npm install
npm run dev
```

- **http://localhost:3000**: landing page
- **http://localhost:3000/console**: the live delivery console

You don't need a database server, API keys, or a `.env` file. Relay creates a local SQLite database on first run and adds a **built-in demo destination**: a fake customer server that checks signatures the way a real consumer would, with a kill switch.

**The demo:**

1. Open `/console` and click **Fire Event**. It delivers immediately, and the destination log shows `sig✓`.
2. Set the demo destination to **DOWN**, then fire another event.
3. Watch the failed attempts stack up: 5s, 10s, 20s, 40s, 80s apart. After 3 straight failures the endpoint's **circuit breaker** opens.
4. Set it back to **HEALTHY**. The breaker sends a test request; when that succeeds, the queued deliveries go out. Click **⟳ Replay** on anything that failed for good.

## Features

| | |
| --- | --- |
| 🔏 **Stripe-style signatures** | `t=…,v1=<hmac-sha256>` computed over the raw body. Receivers compare in constant time and reject timestamps older than 5 minutes, which blocks replayed requests. |
| 🔁 **Exponential backoff** | Six attempts at 5s → 80s, each delay randomized by ±15% so a recovering endpoint isn't hit by every retry at once. Failed deliveries are kept, not dropped. |
| 🧾 **Idempotency** | An `Idempotency-Key` header stops duplicate events at ingestion. Payloads are byte-identical across retries, so consumers can dedupe on the event id. |
| ⚡ **Circuit breaker** | After 3 straight failures an endpoint is paused. After a cooldown, one test request checks whether it's back. If it is, queued deliveries go out in order. |
| ♻️ **Replay** | Resend any finished delivery, or replay every failed one at once. Full attempt history is kept. |
| 🚦 **Rate limiting** | A token bucket (8 burst, 2/s refill) on ingestion. Requests over the limit get `429` with a `Retry-After` header. |
| 🛡️ **SSRF guard** | Endpoint URLs pointing at private networks, cloud metadata IPs (`169.254.169.254`), internal hostnames, or URLs with embedded credentials are rejected. URLs are checked at registration and again before each delivery. |
| 🎯 **Subscriptions & ordering** | Endpoints choose which events they receive (`payment.*`) and can opt into strict FIFO. In FIFO mode, one failing delivery holds up everything queued behind it on that endpoint. |
| 🔑 **Zero-downtime secret rotation** | During a 24h rotation window every delivery carries two signatures, one per secret. Consumers can switch secrets without missing a delivery. |

New to webhooks? [HOW_IT_WORKS.md](HOW_IT_WORKS.md) explains the whole system using a post-office analogy.

## Architecture

```
POST /api/events ──► rate limit ──► persist event + one delivery per subscribed endpoint ──► 201
                                                    │
                     dispatcher (polls every 1.5s, booted by instrumentation.ts)
                                                    │  atomic claim → HMAC sign → POST (5s timeout)
                                       ┌────────────┴────────────┐
                                  2xx  ▼                         ▼  error / timeout / non-2xx
                               succeeded                  retrying (backoff + jitter)
                                                                 │  6 attempts
                                                                 ▼
                                                       failed ──⟳ replay──► pending
```

The request that sends an event returns as soon as the event is saved, and delivery happens in the background. Claims are atomic (`UPDATE … WHERE status IN (…)`), so the dispatcher can't send the same delivery twice. On restart, deliveries that were mid-send when a crash happened are put back in the retry queue.

## API

### Send an event

```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-42-paid" \
  -d '{"type": "payment.succeeded", "data": {"amount": 4200, "currency": "usd"}}'
```

Creates one delivery for each subscribed endpoint, or for a single endpoint if you pass `"endpoint_id": "ep_…"`. Sending the same `Idempotency-Key` again returns the original event with `idempotent_replay: true`.

### Endpoints

```bash
curl -X POST http://localhost:3000/api/endpoints \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/webhooks", "event_types": "payment.*", "strict_ordering": false}'
# → { "endpoint": { "id": "ep_…", "secret": "whsec_…", … } }
```

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/endpoints` | List endpoints |
| `PATCH` | `/api/endpoints/:id` | Update `url`, `description`, `active`, `event_types`, `strict_ordering` |
| `DELETE` | `/api/endpoints/:id` | Remove an endpoint and its history |
| `POST` | `/api/endpoints/:id/rotate` | Rotate the signing secret (24h dual-signing window) |
| `POST` | `/api/deliveries/:id/replay` | Replay one delivery |
| `POST` | `/api/deliveries/replay-failed` | Replay every failed delivery |
| `GET` | `/api/overview` | Everything the console shows, in one call |
| `PUT` | `/api/destination/config` | Demo kill switch: `{"mode": "healthy" \| "down" \| "timeout"}` |

## Verifying a Relay webhook

Every delivery carries these headers:

| Header | Value |
| --- | --- |
| `X-Webhook-Signature` | `t=<unix seconds>,v1=<hex HMAC-SHA256>` |
| `X-Webhook-Id` | delivery id (`dlv_…`), the same on every retry |
| `X-Webhook-Event-Id` | event id (`evt_…`); dedupe on this |
| `X-Webhook-Attempt` | attempt number |

```js
import { createHmac, timingSafeEqual } from "node:crypto";

export function verify(secret, header, rawBody, toleranceSeconds = 300) {
  const parts = header.split(",").map((p) => p.split("=", 2));
  const t = parts.find(([k]) => k === "t")?.[1];
  const v1s = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  return v1s.some((v1) => {
    const given = Buffer.from(v1, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
```

Always verify against the **raw** request body. Re-serializing the JSON can change key order and make a valid signature fail. During a secret rotation the header carries two `v1` values; accept the request if either one matches.

## Retry policy

| Attempt | Delay after failure |
| --- | --- |
| 1 → 2 | ~5s |
| 2 → 3 | ~10s |
| 3 → 4 | ~20s |
| 4 → 5 | ~40s |
| 5 → 6 | ~80s |
| after 6 | marked `failed` (replayable) |

Backoff spaces out retries of a single delivery. The circuit breaker pauses all deliveries to an endpoint that keeps failing.

## Tests

```bash
npm test
```

There are 25 unit tests, run with Node's built-in test runner, with no test framework installed. They cover signing and verification (round trip, secret rotation, tampering, replay window, malformed headers), the SSRF guard (private, CGNAT, link-local, IPv6 and v4-mapped ranges), backoff bounds and jitter, subscription matching, and the token bucket.

## Deployment

> **Relay won't run on Vercel as it's currently built.** Two parts of it need a server that stays running:
>
> 1. **Storage**: `node:sqlite` writes to `data/webhooks.db` on disk. Vercel functions have no persistent filesystem, so the database would be wiped between requests.
> 2. **The dispatcher**: retries come from a loop that runs inside the server process. Vercel functions stop after each request, so the loop wouldn't keep running and retries would never fire.

### Recommended: Railway or Render (no code changes)

Both run `next start` as a regular long-running server, which is how Relay is designed to run.

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Start command | `npm start` |
| Node version | 22.5 or newer (set by `engines` in `package.json`) |
| Env var | `ALLOW_LOCAL_ENDPOINTS=1`, needed for the built-in demo destination (see below) |
| Persistence | Optional. Mount a volume at `/app/data` so the database survives redeploys. Without one, the demo starts fresh after each deploy. |

**Why `ALLOW_LOCAL_ENDPOINTS=1`:** in production the SSRF guard blocks `localhost` URLs. The built-in demo destination is served by Relay itself at `localhost`, so without this flag every demo delivery would be blocked. Leave it unset if you only deliver to real external endpoints.

### Making it work on Vercel

It's possible with two changes:

- **Database**: replace `node:sqlite` with a hosted database, such as [Turso](https://turso.tech) (libSQL, close to the current SQLite schema) or Postgres (Neon or Vercel Postgres).
- **Dispatcher**: move the polling loop into an API route that a scheduler calls, such as a Vercel Cron Job or a queue like Upstash QStash. Vercel's Hobby plan only runs cron jobs once a day, which is far too slow for retries. A queue that calls back with per-message delays is the better fit.

## Project structure

```
app/
  page.tsx, landing.tsx    landing page (GSAP + Lenis + shadcn + Font Awesome)
  console/page.tsx         the delivery console
  ui/                      console components (feed, panels, 2s polling)
  api/                     events, endpoints, deliveries, destination, overview
lib/
  dispatcher.ts            claim → sign → POST → retry, circuit breaker, FIFO
  sign.ts                  HMAC signing + constant-time verification
  guard.ts                 SSRF validation
  ratelimit.ts             token bucket
  backoff.ts · match.ts    retry schedule · event-type subscriptions
  db.ts                    SQLite schema, migrations, demo seed
components/ui/             shadcn components
instrumentation.ts         starts the dispatcher with the server
tests/                     unit tests (node --test)
```

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · `node:sqlite` · shadcn/ui + Radix · GSAP + Lenis · Font Awesome · Node's built-in test runner.

## License

[MIT](LICENSE)
