"use client";

import { useLayoutEffect, useRef } from "react";
import Link from "next/link";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowRight } from "lucide-react";

import { config, type IconDefinition } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faShieldHalved,
  faArrowsRotate,
  faFingerprint,
  faBoltLightning,
  faRotateRight,
  faGaugeHigh,
  faLock,
  faListCheck,
  faTowerBroadcast,
  faKey,
  faServer,
  faCircleCheck,
  faPaperPlane,
} from "@fortawesome/free-solid-svg-icons";
import { faGithub } from "@fortawesome/free-brands-svg-icons";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

config.autoAddCss = false;
gsap.registerPlugin(ScrollTrigger);

const CAPABILITIES: {
  icon: IconDefinition;
  tone: string;
  title: string;
  body: string;
}[] = [
  {
    icon: faShieldHalved,
    tone: "text-amber",
    title: "Stripe-style signatures",
    body: "Every payload ships signed: t=…,v1=<hmac-sha256> over the raw body. Constant-time compared, replay-window enforced — tamper with a byte and it fails.",
  },
  {
    icon: faArrowsRotate,
    tone: "text-blu",
    title: "Exponential backoff",
    body: "5s → 10s → 20s → 40s → 80s, each with ±15% jitter so a recovering endpoint isn't stampeded. Six attempts before a delivery is parked — never dropped.",
  },
  {
    icon: faFingerprint,
    tone: "text-grn",
    title: "Idempotency, both ways",
    body: "An Idempotency-Key dedupes ingestion. Bodies stay byte-identical across attempts, so consumers can safely dedupe on the event id.",
  },
  {
    icon: faBoltLightning,
    tone: "text-amber",
    title: "Circuit breaker",
    body: "Three straight failures trip an endpoint open. Traffic pauses instead of hammering a dead host; a half-open probe tests recovery, then the backlog flushes in order.",
  },
  {
    icon: faRotateRight,
    tone: "text-blu",
    title: "Replay anything",
    body: "Every settled delivery is replayable — resend a success, retry a failure, or drain the entire dead-letter queue in one click. Full attempt history preserved.",
  },
  {
    icon: faGaugeHigh,
    tone: "text-grn",
    title: "Rate limiting",
    body: "A token bucket guards ingestion — a burst is fine, a flood isn't. Overflow gets a clean 429 with Retry-After instead of taking the pipeline down.",
  },
  {
    icon: faLock,
    tone: "text-red",
    title: "SSRF-guarded endpoints",
    body: "Endpoint URLs are screened at registration and again at delivery: private ranges, link-local, cloud-metadata IPs and internal hostnames are refused.",
  },
  {
    icon: faListCheck,
    tone: "text-amber",
    title: "Ordering you control",
    body: "Best-effort by default; opt into strict FIFO per endpoint — one delivery at a time, in order, with honest head-of-line blocking. The real trade-off, surfaced.",
  },
];

const PIPELINE: {
  icon: IconDefinition;
  step: string;
  title: string;
  body: string;
  tone: string;
}[] = [
  {
    icon: faPaperPlane,
    step: "01",
    title: "Ingest",
    body: "POST an event. It's persisted and a delivery is created per subscribed endpoint, then the request returns — the caller never waits on a slow receiver.",
    tone: "text-blu",
  },
  {
    icon: faKey,
    step: "02",
    title: "Sign",
    body: "The dispatcher builds the body, stamps a timestamp and computes the HMAC — dual-signing during a secret rotation so no delivery is ever dropped.",
    tone: "text-amber",
  },
  {
    icon: faServer,
    step: "03",
    title: "Deliver",
    body: "A POST goes out with a 5-second timeout. A 2xx settles it; anything else — error, timeout, refusal — is a failure and enters the retry schedule.",
    tone: "text-grn",
  },
  {
    icon: faArrowsRotate,
    step: "04",
    title: "Retry",
    body: "Failures back off exponentially with jitter across six attempts. Watch the ticks fill on the live feed; a parked delivery is one click from replay.",
    tone: "text-amber",
  },
  {
    icon: faBoltLightning,
    step: "05",
    title: "Protect",
    body: "If an endpoint keeps failing, its circuit opens and traffic pauses. A single probe tests recovery before the queue is allowed to flush again.",
    tone: "text-red",
  },
];

const STATS: { value: number; suffix?: string; label: string }[] = [
  { value: 6, label: "attempts before a delivery is parked" },
  { value: 80, suffix: "s", label: "max backoff, from a 5s first retry" },
  { value: 3, label: "straight failures trip the breaker" },
  { value: 100, suffix: "%", label: "of payloads HMAC-signed" },
];

const MARQUEE = [
  "HMAC-SHA256",
  "Exponential backoff",
  "Idempotency keys",
  "Circuit breaker",
  "Dead-letter replay",
  "Token-bucket limiting",
  "SSRF guard",
  "Strict FIFO",
  "Secret rotation",
  "Live delivery feed",
];

const FAQ = [
  {
    q: "How is this different from just calling fetch() in a loop?",
    a: "The hard parts aren't the HTTP call — they're everything around it. Relay persists every event, retries with jittered exponential backoff, dedupes on idempotency keys, trips a circuit breaker on dead endpoints, signs each payload, and keeps a replayable log. That's the same problem Svix and Hookdeck are entire businesses around.",
  },
  {
    q: "How do consumers verify a webhook is really from Relay?",
    a: "Each delivery carries X-Webhook-Signature: t=<unix>,v1=<hmac-sha256 of `t.body`>. The receiver recomputes the HMAC with their shared secret over the raw body and compares in constant time, rejecting anything outside a 5-minute window. During a secret rotation, deliveries carry both signatures so nobody drops a webhook mid-migration.",
  },
  {
    q: "What happens when a destination goes down?",
    a: "The delivery retries on a backoff schedule — 5s, 10s, 20s, 40s, 80s — up to six attempts, then parks as failed (never lost). If a whole endpoint fails three times straight, its circuit opens so healthy traffic isn't held up; a probe checks recovery before the backlog flushes in creation order.",
  },
  {
    q: "Can I try the whole thing locally?",
    a: "Yes. The console ships with a built-in demo destination that verifies signatures like a real consumer and has a kill switch — flip it to DOWN or TIMEOUT and watch retries pile up, then revive it and hit replay. No external services, no keys.",
  },
];

function RelayMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`relative grid place-items-center rounded-xl border border-line ${className}`}
      style={{
        background:
          "linear-gradient(180deg, rgba(255,180,61,0.16), rgba(255,180,61,0.02))",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 22px -14px rgba(255,180,61,0.7)",
      }}
    >
      <svg width="60%" height="60%" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="2.6" fill="var(--amber)" />
        <path d="M7.4 7.4a6.6 6.6 0 000 9.2" stroke="var(--amber)" strokeWidth="1.6" strokeLinecap="round" opacity="0.9" />
        <path d="M16.6 7.4a6.6 6.6 0 010 9.2" stroke="var(--amber)" strokeWidth="1.6" strokeLinecap="round" opacity="0.9" />
        <path d="M4.7 4.7a10.4 10.4 0 000 14.6" stroke="var(--amber)" strokeWidth="1.4" strokeLinecap="round" opacity="0.4" />
        <path d="M19.3 4.7a10.4 10.4 0 010 14.6" stroke="var(--amber)" strokeWidth="1.4" strokeLinecap="round" opacity="0.4" />
      </svg>
    </span>
  );
}

export function Landing() {
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({ duration: 1.05 });
    lenis.on("scroll", ScrollTrigger.update);
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    const ctx = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .from("[data-hero]", { y: 30, opacity: 0, duration: 0.9, stagger: 0.1 })
        .from(
          "[data-mock]",
          { y: 50, opacity: 0, rotateX: 8, duration: 1.1 },
          "-=0.65",
        )
        .from("[data-seal]", { scale: 0, rotate: -35, duration: 0.7, ease: "back.out(1.7)" }, "-=0.5");

      gsap.to("[data-mock-wrap]", {
        y: -40,
        ease: "none",
        scrollTrigger: { trigger: "[data-hero-section]", start: "top top", end: "bottom top", scrub: 0.6 },
      });

      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        gsap.from(el, {
          y: 34,
          opacity: 0,
          duration: 0.85,
          ease: "power2.out",
          scrollTrigger: { trigger: el, start: "top 88%" },
        });
      });

      gsap.utils.toArray<HTMLElement>("[data-stagger]").forEach((grid) => {
        gsap.from(grid.children, {
          y: 40,
          opacity: 0,
          duration: 0.7,
          stagger: 0.08,
          ease: "power2.out",
          scrollTrigger: { trigger: grid, start: "top 84%" },
        });
      });

      gsap.utils.toArray<HTMLElement>("[data-count]").forEach((el) => {
        const target = Number(el.dataset.count);
        const state = { v: 0 };
        gsap.to(state, {
          v: target,
          duration: 1.6,
          ease: "power1.out",
          snap: { v: 1 },
          scrollTrigger: { trigger: el, start: "top 88%" },
          onUpdate: () => {
            el.textContent = String(Math.round(state.v));
          },
        });
      });

      // packet travelling the pipeline rail
      gsap.fromTo(
        "[data-packet]",
        { left: "0%" },
        {
          left: "100%",
          duration: 3.4,
          ease: "power1.inOut",
          repeat: -1,
          repeatDelay: 0.4,
          scrollTrigger: { trigger: "[data-rail]", start: "top 90%" },
        },
      );
    }, root);

    return () => {
      ctx.revert();
      gsap.ticker.remove(raf);
      lenis.destroy();
    };
  }, []);

  return (
    <div ref={root} className="min-h-screen overflow-x-clip">
      {/* announcement */}
      <div className="border-b border-line bg-panel/60 px-4 py-2 text-center backdrop-blur">
        <p className="font-mono text-[11px] tracking-[0.12em] text-mut">
          <span className="text-grn">●</span> LIVE DEMO — fire an event, kill the
          destination, watch it retry &amp; recover.{" "}
          <Link href="/console" className="text-amber underline-offset-4 hover:underline">
            Open the console →
          </Link>
        </p>
      </div>

      {/* nav */}
      <header className="sticky top-0 z-40 border-b border-line bg-bg/70 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <RelayMark className="h-9 w-9" />
            <span className="text-xl font-extrabold tracking-[-0.02em] text-ink">
              Relay
            </span>
          </Link>
          <div className="hidden items-center gap-8 text-sm text-mut md:flex">
            <a href="#capabilities" className="transition-colors hover:text-ink">
              Capabilities
            </a>
            <a href="#pipeline" className="transition-colors hover:text-ink">
              How it works
            </a>
            <a href="#developers" className="transition-colors hover:text-ink">
              Developers
            </a>
            <a href="#faq" className="transition-colors hover:text-ink">
              FAQ
            </a>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="lg" asChild className="hidden h-10 px-4 text-mut hover:text-ink sm:inline-flex">
              <a href="#developers">Docs</a>
            </Button>
            <Button size="lg" asChild className="h-10 px-5">
              <Link href="/console">
                Open console
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        </nav>
      </header>

      {/* hero */}
      <section data-hero-section className="relative">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 pb-24 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:pt-24">
          <div>
            <div data-hero className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-panel/60 px-3 py-1">
              <FontAwesomeIcon icon={faTowerBroadcast} className="text-amber" style={{ fontSize: 12 }} />
              <span className="label !text-mut">webhook delivery, done right</span>
            </div>
            <h1
              data-hero
              className="text-5xl font-extrabold leading-[1.05] tracking-[-0.03em] text-ink sm:text-6xl lg:text-[4.3rem]"
            >
              Deliver webhooks
              <br />
              like they{" "}
              <span className="text-signal">can&apos;t fail</span>.
            </h1>
            <p data-hero className="mt-6 max-w-lg text-base leading-relaxed text-mut">
              Relay accepts an event, signs it with HMAC the way Stripe does,
              and delivers it to your endpoints — retrying with exponential
              backoff, tripping a circuit breaker on dead hosts, and logging
              every attempt so you can replay the ones that failed.
            </p>
            <div data-hero className="mt-9 flex flex-wrap items-center gap-3">
              <Button size="lg" asChild className="h-11 px-6 text-sm">
                <Link href="/console">
                  Open the console
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild className="h-11 px-6 text-sm">
                <a href="#pipeline">See how it works</a>
              </Button>
            </div>
            <div data-hero className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-xs text-dim">
              <span className="inline-flex items-center gap-1.5">
                <FontAwesomeIcon icon={faCircleCheck} className="text-grn" style={{ fontSize: 12 }} />
                signed &amp; verified
              </span>
              <span className="inline-flex items-center gap-1.5">
                <FontAwesomeIcon icon={faCircleCheck} className="text-grn" style={{ fontSize: 12 }} />
                6-attempt retries
              </span>
              <span className="inline-flex items-center gap-1.5">
                <FontAwesomeIcon icon={faCircleCheck} className="text-grn" style={{ fontSize: 12 }} />
                zero-config demo
              </span>
            </div>
          </div>

          {/* console mock */}
          <div data-mock-wrap className="relative hidden lg:block" style={{ perspective: 1200 }}>
            <div
              data-mock
              className="surface overflow-hidden"
            >
              <div className="flex items-center gap-1.5 border-b border-line bg-panel2/60 px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-grn/60" />
                <span className="ml-3 font-mono text-[10px] text-dim">relay.dev/console</span>
                <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] text-grn">
                  <span className="dot dot-live" style={{ backgroundColor: "var(--grn)", color: "var(--grn)" }} />
                  live
                </span>
              </div>
              <div className="space-y-2.5 p-4">
                <div className="grid grid-cols-4 gap-2">
                  {[
                    ["EVENTS", "128", "text-ink"],
                    ["DELIVERED", "124", "text-grn"],
                    ["RETRYING", "3", "text-amber"],
                    ["SUCCESS", "97%", "text-grn"],
                  ].map(([l, v, t]) => (
                    <div key={l} className="rounded-lg border border-line bg-panel2/50 px-2 py-2">
                      <div className="label !text-[0.5rem]">{l}</div>
                      <div className={`mt-1 font-mono text-base font-semibold ${t}`}>{v}</div>
                    </div>
                  ))}
                </div>
                {[
                  ["payment.succeeded", "DELIVERED", "var(--grn)", [1]],
                  ["invoice.created", "RETRYING", "var(--amber)", [0, 0, 2]],
                  ["user.signed_up", "DELIVERED", "var(--grn)", [0, 1]],
                ].map(([type, status, color, ticks]) => (
                  <div
                    key={type as string}
                    className="flex items-center gap-3 rounded-lg border border-line bg-panel2/40 px-3 py-2.5"
                  >
                    <span className="inline-flex items-center gap-1.5" style={{ color: color as string }}>
                      <span
                        className={`dot ${status === "RETRYING" ? "dot-live" : ""}`}
                        style={{ backgroundColor: color as string }}
                      />
                      <span className="font-mono text-[0.6rem] font-semibold">{status as string}</span>
                    </span>
                    <span className="truncate font-mono text-[0.7rem] text-ink">{type as string}</span>
                    <span className="ml-auto flex items-center gap-[3px]">
                      {(ticks as number[]).map((k, i) => (
                        <span
                          key={i}
                          className="h-3.5 w-2 rounded-[2px]"
                          style={{
                            backgroundColor:
                              k === 1 ? "var(--grn)" : k === 2 ? "var(--amber)" : "var(--red)",
                          }}
                        />
                      ))}
                      {Array.from({ length: 6 - (ticks as number[]).length }).map((_, i) => (
                        <span key={`e${i}`} className="h-3.5 w-2 rounded-[2px] border border-line" />
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* signed seal */}
            <div
              data-seal
              className="absolute -right-6 -top-6 grid h-20 w-20 place-items-center rounded-full border border-amber/40 bg-panel text-center shadow-[0_10px_30px_-8px_rgba(255,180,61,0.5)]"
              style={{ background: "radial-gradient(circle at 50% 35%, rgba(255,180,61,0.18), var(--panel) 70%)" }}
            >
              <div>
                <FontAwesomeIcon icon={faShieldHalved} className="text-amber" style={{ fontSize: 18 }} />
                <div className="mt-1 font-mono text-[7px] tracking-[0.18em] text-amber">HMAC·SIGNED</div>
              </div>
            </div>
          </div>
        </div>

        {/* marquee strip */}
        <div className="relative overflow-hidden border-y border-line bg-panel/40 py-3">
          <div className="flex w-max marquee">
            {[...MARQUEE, ...MARQUEE].map((m, i) => (
              <span key={i} className="mx-6 inline-flex items-center gap-2 font-mono text-xs text-dim">
                <span className="text-amber">✦</span>
                {m}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* stats */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div data-stagger className="grid grid-cols-2 gap-y-10 text-center md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="font-mono text-5xl font-bold text-ink">
                <span data-count={s.value}>0</span>
                {s.suffix && <span className="text-amber">{s.suffix}</span>}
              </div>
              <div className="mx-auto mt-3 max-w-[190px] text-xs leading-relaxed text-mut">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* capabilities */}
      <section id="capabilities" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20">
        <div data-reveal className="max-w-2xl">
          <p className="label mb-3 !text-amber">✦ Capabilities</p>
          <h2 className="text-4xl font-bold tracking-[-0.02em] text-ink">
            The hard parts of delivery, solved and visible.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-mut">
            Retries, idempotency and ordering are a real distributed-systems
            problem — not a tutorial. Relay handles each one and shows you it
            working.
          </p>
        </div>
        <div data-stagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map((c) => (
            <Card key={c.title} className="card-lift gap-0 bg-panel py-0 ring-line">
              <CardContent className="p-5">
                <span className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-panel2">
                  <FontAwesomeIcon icon={c.icon} className={c.tone} style={{ fontSize: 16 }} />
                </span>
                <h3 className="mt-4 text-base font-semibold text-ink">{c.title}</h3>
                <p className="mt-1.5 text-[0.82rem] leading-relaxed text-mut">{c.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* pipeline */}
      <section id="pipeline" className="border-y border-line bg-panel/30">
        <div className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24">
          <div data-reveal className="max-w-2xl">
            <p className="label mb-3 !text-amber">✦ The delivery pipeline</p>
            <h2 className="text-4xl font-bold tracking-[-0.02em] text-ink">
              One event, five guarantees.
            </h2>
          </div>

          {/* animated rail */}
          <div data-rail data-reveal className="relative mt-14 mb-14 h-px bg-line">
            <div
              data-packet
              className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-amber"
              style={{ boxShadow: "0 0 0 4px rgba(255,180,61,0.18), 0 0 16px 2px rgba(255,180,61,0.6)" }}
            />
            <div className="absolute inset-0 flex justify-between">
              {PIPELINE.map((p) => (
                <span key={p.step} className="h-2 w-2 -translate-y-1/2 rounded-full border border-lineb bg-bg" />
              ))}
            </div>
          </div>

          <div data-stagger className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
            {PIPELINE.map((p) => (
              <div key={p.step} className="rounded-xl border border-line bg-panel p-5">
                <div className="flex items-center justify-between">
                  <FontAwesomeIcon icon={p.icon} className={p.tone} style={{ fontSize: 18 }} />
                  <span className="font-mono text-xs text-dim">{p.step}</span>
                </div>
                <h3 className="mt-4 text-base font-semibold text-ink">{p.title}</h3>
                <p className="mt-1.5 text-[0.8rem] leading-relaxed text-mut">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* developers / code */}
      <section id="developers" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div data-reveal>
            <p className="label mb-3 !text-amber">✦ Built for developers</p>
            <h2 className="text-4xl font-bold tracking-[-0.02em] text-ink">
              Fire an event with one request.
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-mut">
              POST JSON to <code className="rounded bg-panel2 px-1.5 py-0.5 font-mono text-[0.8rem] text-amber">/api/events</code>{" "}
              and Relay fans it out to every subscribed endpoint — signed,
              retried and logged. Consumers verify with a shared secret in a
              few lines.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Prefixed ids everywhere — evt_, dlv_, att_",
                "Idempotency-Key header dedupes retries of your call",
                "Every attempt recorded: status, latency, response",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm text-mut">
                  <FontAwesomeIcon icon={faCircleCheck} className="mt-0.5 text-grn" style={{ fontSize: 14 }} />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div data-reveal className="surface overflow-hidden font-mono text-[0.78rem] leading-relaxed">
            <div className="flex items-center gap-1.5 border-b border-line bg-panel2/60 px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-grn/60" />
              <span className="ml-3 text-[10px] text-dim">fire-event.sh</span>
            </div>
            <pre className="overflow-x-auto p-4 text-mut">
              <span className="text-dim"># fire an event; Relay signs &amp; delivers it</span>
              {"\n"}
              <span className="text-grn">curl</span> -X POST localhost:3000/api/events \{"\n"}
              {"  "}-H <span className="text-amber">&quot;Idempotency-Key: order-42&quot;</span> \{"\n"}
              {"  "}-d <span className="text-amber">&apos;&#123;&quot;type&quot;:&quot;payment.succeeded&quot;,</span>{"\n"}
              {"       "}<span className="text-amber">&quot;data&quot;:&#123;&quot;amount&quot;:4200&#125;&#125;&apos;</span>{"\n\n"}
              <span className="text-dim"># → delivered with this header:</span>{"\n"}
              <span className="text-blu">X-Webhook-Signature</span>: t=1699…,v1=<span className="text-ink">d2fc0530…</span>{"\n"}
              <span className="text-blu">X-Webhook-Event-Id</span>:  <span className="text-ink">evt_1d7175dc7b</span>{"\n"}
              <span className="text-blu">X-Webhook-Attempt</span>:   <span className="text-ink">1</span>
            </pre>
          </div>
        </div>
      </section>

      {/* faq */}
      <section id="faq" className="border-t border-line bg-panel/30">
        <div className="mx-auto max-w-3xl scroll-mt-20 px-6 py-24">
          <div data-reveal className="text-center">
            <p className="label mb-3 !text-amber">✦ Questions</p>
            <h2 className="text-4xl font-bold tracking-[-0.02em] text-ink">
              Before you wire it up.
            </h2>
          </div>
          <div data-reveal className="mt-10">
            <Accordion type="single" collapsible className="w-full">
              {FAQ.map((f, i) => (
                <AccordionItem key={i} value={`q-${i}`} className="border-line">
                  <AccordionTrigger className="text-left text-base font-semibold text-ink hover:no-underline">
                    {f.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm leading-relaxed text-mut">
                    {f.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* cta */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div
          data-reveal
          className="surface relative overflow-hidden px-8 py-16 text-center"
        >
          <div className="pointer-events-none absolute -inset-1/2 opacity-[0.14] sheen"
            style={{ background: "conic-gradient(from 0deg, transparent, var(--amber), transparent 30%)" }}
          />
          <div className="relative">
            <RelayMark className="mx-auto h-12 w-12" />
            <h2 className="mx-auto mt-6 max-w-xl text-4xl font-bold tracking-[-0.02em] text-ink">
              Watch a webhook survive a dead endpoint.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-mut">
              Fire a test event, flip the built-in destination to DOWN, and
              watch Relay retry, back off, trip the breaker — then deliver on
              replay. No setup, no keys.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" asChild className="h-11 px-7 text-sm">
                <Link href="/console">
                  Open the console
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild className="h-11 px-6 text-sm">
                <a href="#capabilities">Review the capabilities</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-line bg-panel/50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-10">
          <div className="flex items-center gap-2.5">
            <RelayMark className="h-8 w-8" />
            <div>
              <div className="font-bold text-ink">Relay</div>
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-dim">
                webhook delivery service
              </div>
            </div>
          </div>
          <div className="flex items-center gap-5 font-mono text-xs text-dim">
            <span>Next.js 16 · node:sqlite · HMAC · GSAP</span>
            <a href="#" className="text-mut transition-colors hover:text-ink" aria-label="GitHub">
              <FontAwesomeIcon icon={faGithub} style={{ fontSize: 18 }} />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
