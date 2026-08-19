# PLAN — Group Payment Ledger PWA (v1 basics)

> Read together with `MEMORY.md` (live state / decisions) and `COMPLIANCE.md`
> (regulations deliberately ignored in this build, required before publishing).
> Source of truth for product intent: the Build Brief (summarised in §0).

## 0. Product in one paragraph

A shared-expense ledger for groups in Egypt where one person (the collector)
collects money from several others. Members open a token link (no signup),
see what they owe, mark themselves paid with structured fields, send the
proof screenshot peer-to-peer via their own WhatsApp (never through us), and
the collector confirms or rejects in the app. The durable artifact is the
append-only claim→confirmation timeline. The product sells a paper trail,
not a payment. Primary competitor: WhatsApp. Collector setup must be < 90s.

## 1. Hard invariants (never violate, even in "basic" scope)

1. No image/file storage anywhere (no upload endpoints, no base64 in DB).
2. No money movement / payment gateway.
3. Platform sends no messages — all messaging is `wa.me` deep links opened on
   the *user's own* phone.
4. Only the collector authenticates. Members use signed/unique token links.
5. No third-party auth (Google/Apple/Facebook).
6. No third-party analytics or SDKs shipping data abroad.
7. Ledger is append-only: `payment_claims` and `confirmations` are never
   UPDATEd; corrections are new rows. Derived status on `obligations` may be
   recomputed, history may not.
8. Exactly one collector per pot. No debt netting.

## 2. Stack (locked)

- Next.js (App Router) + TypeScript, server actions for all mutations
- Tailwind CSS, RTL-first (`<html dir="rtl" lang="ar">` default, EN toggle)
- Postgres + Drizzle ORM (`DATABASE_URL`), hosting-agnostic (Neon/Vercel
  Postgres in dev/demo; migratable to Egypt-resident hosting by config)
- Auth (collector): phone + OTP → HMAC-signed HttpOnly session cookie.
  OTP delivery behind an `SmsProvider` interface; v1 ships only a
  console/dev provider (real Egyptian SMS aggregator is post-v1 config).
- Auth (member): unique random `access_token` per group member, URL `/m/[token]`
- PWA: `manifest`, service worker (network-first, offline shell), icons
- Deploy target: Vercel (needs `DATABASE_URL`, `AUTH_SECRET` env vars)
- No queues, no cache layer, no microservices, no extra deps beyond the above.

## 3. Data model (Drizzle schema, mirrors brief §3)

`users` (collectors only) · `groups` (template type, admin, EGP) ·
`group_members` (display name, optional phone, unique access_token,
nullable user_id, archived_at — archive never delete) ·
`pots` (group_id, name, collector_member_id, split_type, recurrence) ·
`pot_members` (subset of group members, share_amount) ·
`cycles` (pot_id, period_label, due_date) ·
`obligations` (cycle_id, group_member_id, amount_due, derived status) ·
`payment_claims` (append-only) · `confirmations` (append-only) ·
`audit_log` (before/after JSON on every state change) ·
`consents` (versioned policy consent — built now, cheap now, painful later).

Pot is in the schema from day one; the UI hides pots when a group has one.

## 4. Build order & status

Legend: [x] done · [~] partial · [ ] not started

1. [x] Repo scaffold: Next.js + TS + Tailwind + Drizzle config, env template
2. [x] Schema + migrations (all tables incl. audit_log, consents)
3. [x] Collector auth: phone + OTP (console SMS provider), signed session
4. [x] Group creation w/ templates → auto default pot → add members (token gen)
5. [x] Token-link member view `/m/[token]`: balance + history (read-only)
6. [x] Payment claim submission (structured fields) + WhatsApp proof deep link
7. [x] Collector confirm/reject with note + audit log
8. [x] Cycle creation (one-off + monthly label); obligations generated per split
9. [x] Outstanding-balances view for whole group
10. [x] WhatsApp reminder deep links (collector side)
11. [x] PWA: manifest + service worker + icons + install
12. [x] Arabic-first RTL pass + EN toggle
13. [x] COMPLIANCE.md — regulations skipped now, needed before publishing
14. [x] README (deploy-to-Vercel instructions), typecheck + build green, push, draft PR

All 14 steps verified by an end-to-end browser test against a local
Postgres (login → group → members → cycle → claim → wa.me proof link →
confirm → member timeline → PWA assets). See MEMORY.md §3.

Deferred beyond this build (in brief, not in "basics"): multi-pot UI for
trips (schema supports it), per-unit/custom splits UI (schema supports it),
PDF/image export, pricing/entitlement gate, recurring cycle auto-generation
(manual "open next month" button instead), member phone-recovery flow.

## 5. Key flows

**Collector onboarding (<90s):** phone → OTP → name group (template) →
add member names → share each member's link via own WhatsApp. Done.

**Proof flow:** member opens token link → "I paid" → amount/date/method/
reference/note → claim row inserted → button opens
`https://wa.me/<collector>?text=<summary>` → screenshot goes P2P in WhatsApp →
collector sees pending claim in app → confirm/reject (+note) → timeline row.

**Corrections:** never edit. A rejected claim stays; member submits a new
claim. A wrong confirmation is followed by a new confirmation row
(rejected/confirmed) — latest row wins for derived status, all rows visible.

## 6. Conventions

- All mutations = server actions in `actions.ts` next to the page; every
  mutation writes an `audit_log` row in the same transaction.
- All DB pages `export const dynamic = 'force-dynamic'` (no build-time DB).
- Money stored as integer piastres? NO — stored as `numeric(12,2)` EGP for
  legibility of the record; never do float math in JS (compare as strings /
  use integer piastres in computation helpers).
- Tokens: 24 bytes `crypto.randomBytes` base64url.
- i18n: `locale` cookie (`ar` default), dictionary in `src/lib/i18n.ts`.
- Dev/demo convenience `DEV_OTP_ECHO=1` shows the OTP on screen — must be
  OFF for any real deployment (listed in COMPLIANCE.md).
