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

- (2026-09-05) v1.5 shipped, e2e-verified (fresh Playwright suite, local
  Postgres 16): building regression + trip with second pot ("العربية",
  collector هدى), custom override (250 vs 200 default), collector login by
  phone → link_user → confirm from her own dashboard, token rotation kills
  old link, print record complete, free-limit gate redirects with notice.
- v1.5 decisions:
  - D14: Group access = admin OR collector of ≥1 pot (`src/lib/authz.ts`);
    collectors can open cycles + confirm only for their own pots; member
    management stays admin-only.
  - D15: Member↔user linking happens at login: any group_members row with
    the verified phone and NULL user_id gets user_id set (audited,
    action=link_user). This is the brief's "member later registers" path.
  - D16: Export = print stylesheet + browser save-as-PDF. No server-side
    file generation ever (invariant #1 adjacent; nothing to store).
  - D17: Entitlement gate checks only at CREATE (never visibility), behind
    BILLING_ENABLED env flag, default off.
  - D18: Consent row (policy v1.0-demo, purposes payment_record+otp_login)
    inserted for collectors at first login; member consent UX still open
    (COMPLIANCE.md §B3).
  - D19: New-pot form defaults all members checked; the chosen collector is
    auto-excluded from pot_members (never owes self).

- (2026-08-19) v1 basics COMPLETE and verified: full Playwright e2e against
  local Postgres 16 passed (OTP login → create group → add members → open
  cycle → member token link → claim w/ reference → wa.me proof deep link →
  collector confirm w/ note → member sees confirmed timeline → manifest/sw/
  icons 200). `tsc --noEmit` and `next build` green. Migration
  `drizzle/0000_*.sql` applies cleanly.
- Additional decisions made during build:
  - D10: Collector is a group_member but NOT a pot_member in v1 — he never
    owes himself; addMember auto-joins the single pot.
  - D11: Cycle form takes "amount per member" (not total/N).
  - D12: Tailwind v4 — custom classes can't be `@apply`'d; variants share a
    grouped base rule in globals.css instead.
  - D13: After a server action redirect, Next does client-side RSC nav;
    initial flight-payload scripts in the DOM go stale (matters for tests
    scraping page HTML — reload first).
- (init) Repo was empty. PLAN.md, MEMORY.md, COMPLIANCE.md created first,
  before any code, per owner instruction.

## 4. Gotchas / open items

- Deploy needs: Vercel env `DATABASE_URL` + `AUTH_SECRET` (+`DEV_OTP_ECHO=1`
  for demo), then `npm run db:migrate` once against the real DB.
- Next up (per brief §11, post-basics): multi-pot UI for trips, custom/
  per-unit splits UI, PDF/image export, pricing gate flag, recurring cycle
  auto-open, consent-capture UX, token rotation UI, rate limiting.
- Hosting region is an OPEN QUESTION in the brief (PDPC cross-border) —
  Vercel is a demo host per owner instruction; see COMPLIANCE.md.
- PWA icons: simple generated PNGs (no design pass yet).
