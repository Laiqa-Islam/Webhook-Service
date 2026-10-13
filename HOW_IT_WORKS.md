# How Relay Works (explained like you're five-ish)

Imagine Relay is a **magical post office** for computer messages.

## The letters 📨

When something interesting happens in an app — someone pays, someone signs
up — the app writes it down in a letter and hands it to our post office.
That letter is called an **event**. Every letter gets a unique tracking
number like `evt_a1b2c3` so we never lose it.

**On the site:** the "Fire Event" panel is how you hand us a letter.

## The houses 🏠

Other computers want copies of these letters. Each one gives us their
address (like `https://their-server.com/webhooks`). We call each address an
**endpoint**. When a letter arrives at the post office, we make one copy for
every house on the list. Each copy is called a **delivery**.

**On the site:** the "Endpoints" panel is our address book.

### Not every house wants every letter 📬

When a house signs up, it can say *"only send me letters about payments,
please"*. They write it like `payment.*` — meaning "anything that starts
with payment." A house that says `*` gets everything. If a letter about a
new user arrives, the payments-only house simply never hears about it —
no copy is even made.

### Some houses are very fussy about order 1️⃣2️⃣3️⃣ (FIFO)

Most houses don't mind if letter #7 arrives a bit before letter #6 — they
check the dates and sort it out. But a house can ask for **strict order**:
we hand over one letter at a time, oldest first, and we do not deliver the
next one until the current one is accepted.

The catch (and we're honest about it): if letter #6 keeps getting the door
slammed on it, letters #7, #8, #9 all wait in line behind it. That's called
**head-of-line blocking**, and it's the price of promising perfect order.
Houses with the **FIFO** badge chose that trade.

## The wax seal 🔏

Anyone could knock on a house's door and say "hi, I'm the post office, here's
a letter!" — even a liar. So when a house signs up, we give them a **secret
stamp** (it looks like `whsec_...`) that only they and we know.

Every letter we deliver is pressed with a wax seal made from that secret
(computers call this an **HMAC signature**). The house checks the seal:
if it matches, the letter is really from us and nobody changed the words
inside. We also write the exact time on the seal, so a sneaky person can't
save an old letter and re-deliver it next week (a **replay attack**).

**On the site:** the destination panel shows `sig✓` when the seal checks out.

### Changing the stamp without chaos 🔄

Sometimes a house wants a new secret stamp (maybe the old one leaked).
For one day, we press the letter with **both** the old seal and the new
one — so whether the house checks with the old stamp or the new stamp, the
letter still verifies. No mail is ever bounced during the swap. That's
**secret rotation**, and it's the "rotate" button next to each endpoint.

## The very patient mail carrier 🚚

Sometimes a house doesn't answer — the server is down or too slow. Our mail
carrier doesn't cry and doesn't give up. They:

1. Try again after **5 seconds**,
2. then **10 seconds**,
3. then **20, 40, 80** — waiting **twice as long** each time
   (this is called **exponential backoff** — knocking softer and less often
   on a door that isn't answering).

After **6 tries**, the carrier writes **FAILED** on the delivery and puts it
on the "sad shelf" — but keeps it! A human can look at it later and press
**⟳ Replay** (or "replay all failed"), and the carrier happily runs out and
tries again. Every single knock is written down in a logbook: what time,
what the house said, how long it took.

**On the site:** the little colored squares next to each delivery are the
knocks — red for a slammed door, green for "delivered!"

## The fuse box ⚡ (circuit breaker)

If a house slams the door **3 times in a row**, something's clearly wrong
with the house. Knocking 500 more times won't help — it just annoys everyone.
So a fuse trips: we **stop knocking on that house entirely** and let mail
for it pile up safely at the post office.

After a **25-second timeout**, we send **one scout** with a single letter (the
**probe**). If the door opens — great! Fuse back on, and the whole pile of
mail rushes out in order. If the door slams again, the fuse trips again and
we wait another round.

**On the site:** you'll see a red **CIRCUIT OPEN** badge on the endpoint,
with a countdown to the next scout.

## No double letters 📝 (idempotency)

Apps get nervous and sometimes hand us the same letter twice ("did you get
that?? here it is again!!"). If a letter comes with an **idempotency key**
(a note like "order-42-paid"), we check our records: seen that note before?
Then we smile, say "already got it, friend," and file **zero** new
deliveries. The house never gets a confusing duplicate.

## The line at the counter 🎟️ (rate limiter)

The post office counter has a bucket of **8 tokens**. Handing us a letter
costs one token, and the bucket refills at 2 tokens per second. If someone
sprints in with 15 letters at once, the first bunch get in, and the rest are
told **"429 — take a breath, come back in a second"** (there's literally a
`Retry-After` note on the rejection). This keeps one over-excited app from
flooding the whole post office.

**On the site:** press **×15 BURST** and watch some letters get accepted and
the overflow get politely bounced.

## The bouncer at the address desk 🚫 (SSRF guard)

Someone could try registering a sneaky address like
`http://169.254.169.254/` (that's the building's own key closet, where cloud
servers keep passwords) or `http://192.168.1.1` (the neighbor's private
router). A post office that delivers *anywhere it's told* can be tricked
into robbing its own building.

So the address desk checks every new address: private networks, internal
hostnames, and the key closet are **refused on the spot** — and checked
*again* right before every delivery, just in case.

## The practice house 🎪

The site ships with one fake house: the **demo destination**. It's a real
receiver that checks wax seals like a real customer would — but it has a
big red switch:

- **HEALTHY** — opens the door, says thanks (200)
- **DOWN** — slams the door (500)
- **TIMEOUT** — pretends to be asleep and never answers

That's the whole demo: fire a letter → flip the switch to DOWN → watch the
carrier retry, the fuse trip, the mail pile up → flip back to HEALTHY →
watch the scout succeed and everything get delivered. Nothing was lost,
everything was written down, and every letter had a valid seal.

---

## The grown-up glossary

| Kid version | Real term |
| --- | --- |
| Letter | Event |
| House / address | Endpoint |
| "Only payment letters please" | Event-type subscription (`payment.*`) |
| Fussy house that wants perfect order | Strict FIFO ordering (head-of-line blocking) |
| Copy of a letter for one house | Delivery |
| Knock on the door | Delivery attempt |
| Wax seal | HMAC-SHA256 signature (`t=…,v1=…` header) |
| Secret stamp | Signing secret (`whsec_…`) |
| Two seals during a stamp swap | Dual-signing during secret rotation |
| Patient carrier waiting longer each time | Exponential backoff with jitter |
| Fuse box | Circuit breaker (closed → open → half-open) |
| Scout | Half-open probe request |
| "Already got it, friend" | Idempotency key deduplication |
| Token bucket at the counter | Rate limiting (429 + Retry-After) |
| Bouncer at the address desk | SSRF protection |
| Sad shelf + replay | Dead letter queue + manual replay |
| Logbook | Attempt log (status, latency, response) |
