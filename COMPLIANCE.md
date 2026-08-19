# COMPLIANCE — deliberately skipped for this build, REQUIRED before publishing

Owner instruction for this build: *"ignore all regulations for now but
highlight which would be needed if published."* This file is that highlight.
Nothing here is legal advice; get Egyptian counsel before launch.

## A. What this build already respects (architecture, kept on purpose)

These are product invariants, not paperwork, so they were NOT skipped:

- No image/file storage anywhere (keeps us out of PDPL "sensitive financial
  data" storage tier: no separate PDPC licence, no DPO trigger from images).
- No money movement (stays outside Central Bank of Egypt licensing).
- Platform sends zero messages — WhatsApp deep links open the *user's own*
  app (avoids the electronic-marketing permit question).
- No third-party auth, no third-party analytics (no cross-border transfer
  via SDKs).
- Append-only ledger, archive-never-delete, audit log, versioned `consents`
  table exists in the schema.

## B. Skipped now — MUST be resolved before any public launch

1. **PDPL (Law 151/2020) registration & licence tier.** Processing personal
   data (names, phone numbers tied to payment obligations) requires PDPC
   registration; tier/fee for small operators unresolved. Enforcement ramp
   ~1 Nov 2026.
2. **Hosting region / cross-border transfer.** This demo deploys to
   **Vercel + Neon in non-Egyptian regions = personal data leaves Egypt**,
   which under PDPL requires a PDPC licence. Before launch: either obtain
   that licence or move to Egypt-resident hosting (the code is
   hosting-agnostic: `DATABASE_URL`, `AUTH_SECRET`, SMS provider config).
3. **Consent capture UX.** The `consents` table exists but v1 basics does
   not yet show a privacy policy / collect explicit consent at member or
   collector onboarding. Required: versioned policy text (Arabic), purpose
   list, capture on first use, withdrawal path.
4. **Privacy policy + records of processing activities (RoPA).** PDPL
   requires maintained processing records. Not written yet.
5. **Data subject rights plumbing.** Access/erasure-request handling
   (erasure = anonymise display fields, keep ledger integrity — needs legal
   sign-off on that interpretation).
6. **SMS OTP via a licensed Egyptian aggregator.** Current build has a
   console/dev provider only, plus `DEV_OTP_ECHO` which prints the OTP to
   the login screen for demos. **`DEV_OTP_ECHO` must be OFF in production**;
   a real aggregator contract (sender-ID registration with NTRA rules)
   is needed.
7. **WhatsApp deep-link = marketing? (open question in brief).** Confirm
   with counsel that a collector-triggered `wa.me` link from his own phone
   is not "electronic marketing" needing a permit.
8. **Terms of service / "record not arbiter" disclaimer.** Copy must state
   the platform does not adjudicate disputes and holds no funds.
9. **Security hardening before real data:** rate-limiting OTP + token
   endpoints, token rotation/revocation UI (schema supports rotation),
   secrets management, backups & retention policy, TLS-only cookies
   (already `secure` in prod), dependency audit.
10. **Cookie/locale banner needs:** session + locale cookies are strictly
    functional — likely exempt, but confirm under PDPL/e-commerce guidance.
