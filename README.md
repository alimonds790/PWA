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

## Deploy to Vercel (no CLI needed, ~3 minutes)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/import?s=https%3A%2F%2Fgithub.com%2Falimonds790%2FPWA)

1. **Import the repo**: [vercel.com/new/import?s=https://github.com/alimonds790/PWA](https://vercel.com/new/import?s=https%3A%2F%2Fgithub.com%2Falimonds790%2FPWA)
   (log in with the GitHub account that owns the repo). Framework is
   auto-detected as Next.js — keep all defaults and Deploy. The first
   deploy builds fine without a database.
2. **Add a database**: project → **Storage** tab → **Create Database** →
   **Neon (Postgres)** → accept defaults. This injects `DATABASE_URL`
   into the project automatically.
3. **Add two env vars**: project → **Settings → Environment Variables**:
   - `AUTH_SECRET` — any long random string
   - `DEV_OTP_ECHO` = `1` — **demo only**: shows the OTP on the login
     screen because no SMS provider is wired up. Remove for production
     (COMPLIANCE.md §B6).
4. **Redeploy**: **Deployments** tab → ⋯ on the latest → **Redeploy**.
   Migrations run automatically at boot (`src/instrumentation.ts`;
   disable with `AUTO_MIGRATE=0`).
5. Open the URL, log in with any Egyptian-format mobile (e.g.
   `01012345678`), type the code shown on screen — you're the collector.
   Install it from the browser menu ("Add to Home Screen").

> ⚠️ Vercel + Neon host data outside Egypt — fine for a demo, a PDPC
> licensing issue for a real launch. See COMPLIANCE.md §B2.

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
