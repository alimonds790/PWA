# MEMORY — live context for Claude Code sessions

> Purpose: context preservation across sessions/compaction. Update this file
> whenever a decision is made or a step completes. `PLAN.md` = intent,
> `MEMORY.md` = current state. Keep entries terse, newest at top of §3.

## 1. Fixed facts

- Repo: `alimonds790/PWA` · branch: `claude/group-payment-ledger-pwa-x3r3ja`
  (push directly, draft PR to default branch when pushed).
- Deploy target: Vercel + external Postgres (Neon / Vercel Postgres) via
  `DATABASE_URL`. Second env var: `AUTH_SECRET`. Optional: `DEV_OTP_ECHO=1`.
- Regulations are deliberately IGNORED for this build per owner instruction;
  everything skipped is catalogued in `COMPLIANCE.md`. The 8 hard product
  invariants in PLAN.md §1 are still enforced (they're architecture, not
  paperwork).
- Owner: alimm790@gmail.com (attribution only).

## 2. Decisions log (why, not just what)

- D1: Manual Next.js scaffold (no create-next-app) — deterministic files,
  no interactive prompts, controlled deps.
- D2: OTP is stateless HMAC(phone, 10-min timeslice) → 6 digits; no DB row
  needed before first login. Delivery behind `SmsProvider` interface;
  only `ConsoleSmsProvider` implemented (constraint: no real SMS in v1 demo).
- D3: Session = HttpOnly cookie, base64url(JSON{uid,phone,exp}) + HMAC-SHA256
  signature with `AUTH_SECRET`. No session table (deliberate simplicity).
- D4: Obligation.status is DERIVED state and may be updated
  (`pending|claimed|confirmed|rejected`); claims/confirmations are the
  immutable record. Latest confirmation row wins for status; all rows shown.
- D5: Money as `numeric(12,2)`; arithmetic done in integer piastres helpers.
- D6: Cycle creation takes "amount due per member" (equal split) for basics;
  schema already carries split_type/share_amount for custom/per-unit later.
- D7: i18n via `locale` cookie, `ar` default, dir=rtl on <html>; dictionary
  object, no i18n library.
- D8: Pages touching DB are `force-dynamic` so `next build` never needs a DB.
- D9: DB client (postgres.js) created lazily at first query, `prepare:false`
  for pooled serverless (Neon pgbouncer) compatibility.

## 3. State / progress

- (init) Repo was empty. PLAN.md, MEMORY.md, COMPLIANCE.md created first,
  before any code, per owner instruction.

## 4. Gotchas / open items

- No Postgres in the dev container: verification is `tsc --noEmit` +
  `next build`; runtime DB paths are untested until a real DATABASE_URL demo.
- Drizzle migrations generated with drizzle-kit; apply with
  `npm run db:push` (or `db:migrate`) against the real DB before first use.
- Hosting region is an OPEN QUESTION in the brief (PDPC cross-border) —
  Vercel is a demo host per owner instruction; see COMPLIANCE.md.
- PWA icons: simple generated PNGs (no design pass yet).
