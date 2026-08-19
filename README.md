# Group Payment Ledger · دفتر الجماعة

A shared-expense **record** for groups in Egypt: one collector, many members,
an append-only claim→confirmation paper trail. The product records payments —
it never moves money, stores no images, and sends no messages (all sharing
happens via `wa.me` deep links from the user's own WhatsApp).

**Read first:** `PLAN.md` (scope + invariants) · `MEMORY.md` (decision log) ·
`COMPLIANCE.md` (**regulations deliberately skipped in this demo build and
required before any public launch**).

## Flow

1. **Collector** logs in with phone + OTP, creates a group (Building /
   Apartment / Family / Trip / Custom), adds members by name — under 90s.
2. Each member gets a **token link** (`/m/<token>`) — no signup, no install.
3. Collector opens a **cycle** ("2026-03", 350 EGP per member) → obligations.
4. Member opens their link, taps **"I paid"** with amount/date/method/
   reference, then **"Send proof on WhatsApp"** — the screenshot goes
   peer-to-peer in WhatsApp, never through this system.
5. Collector **confirms or rejects** the claim. Every step is an immutable
   row; the timeline is always fully visible to the member.

## Stack

Next.js 15 (App Router, server actions) · TypeScript · Tailwind v4 (RTL-first,
Arabic default + English toggle) · Drizzle ORM · Postgres · installable PWA.

## Deploy to Vercel

1. Create a Postgres database (Vercel Postgres / Neon — see COMPLIANCE.md §B2
   about hosting region before any real launch).
2. Import this repo in Vercel. Set env vars:
   - `DATABASE_URL` — pooled Postgres connection string
   - `AUTH_SECRET` — long random string (`openssl rand -base64 32`)
   - `DEV_OTP_ECHO=1` — **demo only**: shows the OTP on the login screen
     because no SMS provider is wired up yet. Remove for production.
3. Apply the schema once: `DATABASE_URL=... npm run db:migrate`
   (or `npm run db:push`).
4. Deploy. Install the PWA from the browser menu ("Add to Home Screen").

## Local dev

```bash
npm install
cp .env.example .env   # fill DATABASE_URL, AUTH_SECRET
npm run db:migrate
npm run dev
```

## Repo map

- `src/db/schema.ts` — full ledger schema (groups, pots, cycles, obligations,
  append-only claims/confirmations, audit_log, versioned consents)
- `src/app/login` — phone + OTP (stateless HMAC codes, `SmsProvider` interface)
- `src/app/dashboard` — groups list + create (template → auto default pot)
- `src/app/g/[id]` — collector view: pending claims, balances + WhatsApp
  reminders, cycles, members + token links
- `src/app/m/[token]` — member view: obligations, claim form, WhatsApp proof
  link, immutable timeline
- `public/sw.js`, `src/app/manifest.ts` — PWA
- `drizzle/` — generated SQL migrations
