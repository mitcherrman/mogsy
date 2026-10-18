# EMAIL1 — Optional newsletter & Daily Challenge reminders

Issue: [#78](https://github.com/mitcherrman/mogsy/issues/78) · Branch: `email1/newsletter-subscriptions` (from `origin/main` `2151fcd6`) · **Draft. Nothing here is applied, deployed or sent.**

## State in one paragraph

Complete, flag-gated, and **dark**: registered users can opt in (unchecked by default) at both signup flows (and the onboarding conversion step) and in Settings; opt-in is a real double opt-in independent of Supabase's email confirmation; consent is audited append-only; unsubscribe is one click (RFC 8058 header + page); bounces/complaints suppress. The owner has a Newsletter workspace (Admin › Users › Accounts › **Newsletter**) and Users rows show subscription status. Campaign **sending is built but ships OFF** behind `NEWSLETTER_SENDING_ENABLED`, and no email provider is configured, so nothing can be sent. The database objects are **staged SQL, not applied**.

## Decisions (and the evidence behind them)

| Decision | Why |
|---|---|
| **Existing users are never subscribed.** No backfill, no trigger on `auth.users`/`profiles`; `handle_new_user` untouched. | Asserted by SQL tests (tables empty after migrating a DB that already had users; migration text has no `INSERT…SELECT`/trigger). |
| **Checkbox = intent, not consent.** The form writes `email_opt_in_intent` to the new account's metadata (no address, no consent). `useEmailSignupIntent` asks the server to convert it to a *pending* request; the server reads the metadata itself, restricts it to signup-offerable topics (never `promotions`), mails **the account's own address**, and clears it. | Works for session-immediate signup, confirm-email-then-return (even on another device), and guest upgrade. The browser never sends an address or topics. |
| **Double opt-in, token in the email only.** 256-bit token, only its SHA-256 stored, 72 h expiry, single use, older links invalidated by a newer request. `/email/confirm` needs a button press. | Link scanners GET every URL; a GET must not subscribe anyone. Supabase's confirmation proves a login mailbox, not marketing consent. |
| **Unsubscribe = stateless HMAC token** (`u1.<id>.<sig>`, `NEWSLETTER_TOKEN_SECRET`), never expires. One-click `POST` to `email-link` + `List-Unsubscribe`/`-Post` headers; the human page also needs a button; `GET` on the function only redirects. | RFC 8058; Gmail/Yahoo bulk-sender rules. A leaked token can only stop someone's mail. |
| **Tables are RLS default-deny.** Browsers get `SELECT` on *their own* subscription/consent rows, safe columns only. All writes are `SECURITY DEFINER` functions, `service_role` only; admin RPCs call `public.assert_owner` (OWN1). `email_consent_events` has update/delete/truncate-blocking triggers. | Tested as `anon` / `authenticated` / `service_role` on PGlite. |
| **Mailbox, not account, holds consent.** Eligibility = `subscribed` ∧ topic ∧ not anonymous ∧ `auth.users.email` still equals the consented address ∧ not suppressed. Account email change ⇒ not mailable until re-confirmed; a reassigned address does not inherit consent. | One SQL definition (`_newsletter_eligible`) used by counts, approval and sending. |
| **Provider: Resend behind a seam; default `disabled`.** | **Lovable email** (`@lovable.dev/email-js` 0.1.0 in `auth-email-hook`; 0.3.1 latest) documents only `purpose: "transactional"`, and its unsubscribe state is per sender domain (`notify.mogzy.lol`, the one carrying login/reset mail). Marketing there risks auth-mail deliverability, and there is no marketing API or secret in this repo. Resend: plain HTTPS, custom headers, `Idempotency-Key`, per-domain DKIM, signed (Svix) bounce/complaint webhooks — verified against Resend's docs. Swapping providers = one object implementing `EmailProvider`. A guard test forbids newsletter code from touching the Lovable stack. |
| **Migration is staged** at `supabase/email1-staged/` (like OWN1), not in `supabase/migrations`/`drizzle`. | Merging cannot auto-apply it; you asked for no production migrations without approval. Guard test enforces it. |
| **UI is behind `VITE_EMAIL_SUBSCRIPTIONS_ENABLED`** (build-time, fail-closed, unset today). | Lets the PR merge before the SQL exists with zero visible change. `/email/confirm` and `/email/unsubscribe` work regardless (anyone with an email can always leave). |
| **Newsletter UI is a dialog in Accounts, not a new Users section.** | `users2AudienceIa` guards "exactly Audience, Accounts, Moderation"; I did not weaken it. |
| **Campaigns freeze on approval; approval needs fresh MFA; send needs fresh MFA + typed `SEND <n>`** naming the audience size; DB refuses if the audience changed; each recipient re-checked at claim time; per-recipient idempotency key. | Prevents "approved A, sent B" and sending to people who left in between. |

## What changed

**New (staged SQL):** `supabase/email1-staged/{migrations/01_email1_subscriptions.sql, rollback/01_email1_rollback.sql, verification/email1_verify.sql}`.
**New Edge Functions** (all `verify_jwt=false`, each self-authenticates; registered in `supabase/config.toml`): `email-subscription` (JWT), `email-link` (token), `email-provider-webhook` (Svix signature), `newsletter-admin` (`requireOwner`). Logic lives in `supabase/functions/_shared/newsletter/` (`topics, tokens, render, provider, webhook, config, handlers, send, http`) so it is unit-tested without Deno.
**New frontend:** `src/lib/email/*`, `components/email/EmailOptInFields`, `components/settings/EmailPreferences`, `pages/EmailConfirm|EmailUnsubscribe` (+ routes), `components/admin/AdminNewsletter`, `lib/admin/{newsletter-admin,email-subscriptions}`.
**Edited (minimal, 4th argument / extra metadata only when a box is ticked):** `hooks/useAuth.tsx`, `pages/Auth.tsx`, `components/auth/AccountUpgradePanel.tsx`, `lib/auth/{account-upgrade,useAccountUpgrade}.ts`, `components/onboarding/OnboardingProfile.tsx`, `pages/Settings.tsx`, `components/admin/AdminUsers.tsx` (row tag, `Newsletter` filter, detail line, dialog button), `App.tsx`, `lib/route-prefetch.ts`, `.env.example`.
**Untouched:** `auth-email-hook`, Stripe, Daily Challenge, analytics, existing admin functions, `handle_new_user`.

## Tests (run locally, Windows, no browsers)

* **189 new tests in 14 files, all pass.** SQL on PGlite against the staged migration (45): no backfill, double opt-in, expiry, replay, throttling, intent-never-overrides, rebound mailbox, unsubscribe, suppression, eligibility, RLS/privileges as each role, append-only trail, owner gating of every admin RPC, campaign freeze/approve/send/skip/retry, rollback. TS (144): tokens, rendering/XSS, Resend adapter, Svix verification, kill-switch, handlers, send pipeline, UI (both signup flows + onboarding unticked-⇒-unchanged-call regressions, Settings, link pages, Admin Users, Newsletter workspace), structural guards.
* Affected areas together: **56 files / 668 tests pass** (auth, settings, admin, onboarding, hooks).
* `tsc -p tsconfig.app.json` clean; the four Deno entrypoints + shared modules pass **strict** `tsc` against stubbed Deno/esm types; `vite build` succeeds; eslint clean on new code (remaining findings are pre-existing `any`s).
* **Full suite:** 41 files fail identically on clean `origin/main` (checked by running them on a clean worktree: same files, same failing tests) — pre-existing/environmental, unrelated. 4 more (`PatchReports.catchup`, `LobbyPreviewPage.premiumAnalytics`, `QuizRankedMatch.rfx1b3`, `TeamSimPage.phase5a`) timed out under full-suite load and **pass in isolation (142/142)**. The full run's worker crashed at the end (`ERR_IPC_CHANNEL_CLOSED`) so no single green summary line exists.
* **Not run:** the Deno entrypoints themselves (no Deno here), Playwright/E2E (AGENTS.md: CI only), anything against a real Supabase or Resend.

## Blocked / remaining

1. **Apply the SQL** (needs your approval): run `email1_verify.sql`, apply `01_email1_subscriptions.sql` in the SQL editor (idempotent), re-run verify (expect 0/0/0 rows, RLS on 6 tables, 7 browser-callable functions all `admin_*`). Rollback file exports-first warning inside.
2. **Deploy the four functions** (Lovable credits are exhausted per #78 — deploy via Supabase CLI/dashboard).
3. **Provider + domain:** create a *dedicated* sending subdomain (e.g. `news.mogzy.lol`), add SPF/DKIM/DMARC, create the Resend account, webhook → `…/functions/v1/email-provider-webhook` for `email.bounced`, `email.complained`.
4. **Secrets** (Supabase Edge Function secrets): `NEWSLETTER_TOKEN_SECRET` (≥32 random chars; rotating it breaks already-sent unsubscribe links), `NEWSLETTER_EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `NEWSLETTER_FROM`, `NEWSLETTER_POSTAL_ADDRESS` (legally required in every campaign), optional `NEWSLETTER_REPLY_TO`, `NEWSLETTER_SITE_URL`. Keep **`NEWSLETTER_SENDING_ENABLED` unset** until launch.
5. **Daily Challenge reminders are not built** (per #78 they wait for a verified sender). The topic, consent text and audience exist; a scheduled function would read `_newsletter_eligible('daily_reminder')`, needs a send-time/timezone decision and a "not already played today" check.
6. Known gaps: no admin tool to lift a suppression or to erase a subscriber (the audit trail is append-only by design; an erasure procedure needs a legal decision); no open/click tracking (deliberate); consent/privacy-policy copy has not had legal review (`CONSENT_VERSION` must be bumped if wording changes); `email-link` and the confirmation endpoint have DB-level but no per-IP rate limiting.

## Launch checklist (real users)

Apply SQL + verify → deploy functions → domain DNS + Resend verified → secrets set → **end-to-end on staging with your own mailbox**: signup with box ticked ⇒ one confirmation email ⇒ click ⇒ `subscribed`; ignore link ⇒ stays pending; unsubscribe page + one-click header in Gmail; hard bounce/complaint ⇒ suppressed; test-send from the workspace; Admin row shows the badge → set `VITE_EMAIL_SUBSCRIPTIONS_ENABLED=true` (build) → only then consider `NEWSLETTER_SENDING_ENABLED=true`, and send the first campaign to yourself/staff as a one-person topic. Rollback: flag off hides everything; SQL rollback file removes the objects.
