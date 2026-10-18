# PT1.7 — $50 annual Premium gift: handoff

**Objective.** The owner buys 12 months of Premium as a gift for a friend in California, for exactly **$50.00 USD total**, paid once, never renewed. The friend redeems it with their own verified account and gets **365 days of Premium from the redemption date**.

**Branch:** `billing/annual-gift-50` (7c99892b), merged to `main` by PR #67 (merge commit `3d5cb057`). **Status (2026-10-17): 0004 applied in production (ledger id 5), and the gift Edge Functions are live from `main` (§10). Private gift checkout is still OFF, no Stripe test-mode run has happened, nothing has been published, and no card has been charged.**

## 1. What existed vs what changed

| Area | Before (origin/main `6b46e1c0`, verified live 2026-10-17) | Now |
|---|---|---|
| Gift data | `public.gifts` table. Anon **holds SELECT** (live probe). The 20260624 column REVOKE is a no-op under table-level SELECT | 0004: browser roles keep only a column SELECT of display fields, under the existing RLS; no write and no payment-column read |
| "Paid" | `verify-gift` flipped pending→paid on `session.payment_status` alone, only when the buyer reopened the success page. The webhook **skipped** gifts | Every webhook event, the buyer's return page and redemption all re-read session + PaymentIntent + charge + dispute from Stripe, and record the result through `gift_record_payment`, a monotonic SQL state machine |
| Redemption | `redeem_gift_code` consumed the gift in SQL; `redeem-gift` then granted Premium in a **separate** JS step. **Any account holding the code** could redeem; no email verification | `gift_redeem`: **one transaction** that row-locks the gift and requires `paid`, a verified non-guest account, a **recipient email match** and single use. It then grants Premium (or diamonds) and consumes the gift together. `redeem_gift_code` is dropped |
| Refunds / disputes | Never reached gifts | Refunded or disputed gifts can't be redeemed. After redemption, a full refund or a lost dispute **revokes** the grant and restores whatever it stacked on |
| Private $50 offer | Lovable's `private-annual-gift.ts` / `gift-payment.ts`: never called, relied on a non-existent RPC, a hard-coded recipient-email env var, and `any` types | Rewritten in place and fully tested: server terms, fail-closed config, buyer allowlist, exact-amount and tax checks |
| UI | **No gift UI** in the frontend (Shop page gone) | Gift Premium entry on `/lol/premium`, `/lol/premium/gift` (buy + return), `/lol/premium/redeem` (inbox + code) |

Unchanged: `create-checkout` (subscriptions and the catalog-gift path), `check-subscription`, `customer-portal`, `gift-catalog.ts`, `offer-catalog.ts`, the subscription branch of `stripe-webhook`, and PT1.6b's custom-offer code (beyond event routing).

## 2. Verified architecture

```
Buyer (allowlisted, verified email) ──gift-checkout{checkout}──► gift_private_prepare (1 pending/buyer)
   → Stripe Checkout: 1 × server price, card only, no promo codes, PI+session metadata
   → gift_attach_session (compare-and-set; loser's session expired)
Stripe ──webhook (signature verified)──► handleGiftEvent → re-read Stripe → gift_record_payment
Buyer return (?gift=&checkout=success) ──gift-checkout{status}──► reconcile → code shown only when 'paid'
Recipient (verified email = recipient) ──redeem-gift──► reconcile (fail closed) → gift_redeem (atomic)
```

Payment rules for the private gift (`inspectGiftPayment` plus SQL): the session must belong to this gift (id, buyer, recipient, price, quantity 1, no extra lines). Status must be complete/paid, the PaymentIntent succeeded and the charge paid. Session, PaymentIntent and charge amounts must all be **5000 usd**, with a discount of 0. The price must be active, one-time, $50.00 USD, and tax-inclusive when Stripe Tax is used. Tax: `stripe_tax_inclusive` requires `automatic_tax.status = complete`; `approved_not_taxable` requires that Stripe Tax is off. SQL rechecks 5000/usd independently. Catalog gifts are checked against `gift-catalog.ts`; their amount is recorded, not pinned, because promotion codes are allowed there.

## 3. Configuration (all fail closed; none set)

| Secret | Meaning |
|---|---|
| `PRIVATE_ANNUAL_GIFT_CHECKOUT_ENABLED=true` | master switch |
| `STRIPE_PRIVATE_ANNUAL_GIFT_PRICE_ID=price_…` | a **live-account** one-time $50.00 USD Price (`tax_behavior=inclusive` if Stripe Tax is used) |
| `PRIVATE_ANNUAL_GIFT_TAX_MODE` | `stripe_tax_inclusive` or `approved_not_taxable`. Unset = tax not approved = off |
| `PRIVATE_ANNUAL_GIFT_BUYER_USER_IDS` | comma-separated user UUIDs allowed to buy (the owner's) |
| `PRIVATE_ANNUAL_GIFT_LIVE_APPROVED=true` | required as well when `STRIPE_SECRET_KEY` is live |

Lovable's `PRIVATE_ANNUAL_GIFT_RECIPIENT_EMAIL` and `PRIVATE_ANNUAL_GIFT_CA_TAX_APPROVED` are **no longer read**. The buyer enters the recipient, and tax approval is the explicit `TAX_MODE`.

## 4. Files

- **SQL:** `drizzle/migrations/0004_pt1_7_annual_gift.sql` (+ `meta/_journal.json`, `meta/0004_snapshot.json`), `supabase/verification/pt17_gift_verify.sql` (read-only before/after bundle, dry-run tested)
- **Edge (shared, pure TS):** `_shared/private-annual-gift.ts`, `_shared/gift-payment.ts`, `_shared/gift-checkout.ts`, `_shared/gift-redeem.ts`, `_shared/gift-wiring.ts`
- **Edge (entry points):** `gift-checkout/index.ts` (new), `redeem-gift/index.ts`, `verify-gift/index.ts`, `stripe-webhook/index.ts` (routing only), `supabase/config.toml`
- **Frontend:** `src/lib/pro/gift.ts`, `src/pages/LolPremiumGift.tsx`, `src/pages/LolPremiumRedeem.tsx`, `src/components/premium/PremiumGiftEntry.tsx`, `src/pages/LolPremium.tsx`, `src/App.tsx`, `src/integrations/supabase/types.ts` (hand-synced; Lovable regenerates)
- **Tests:** `src/test/security/pt17GiftSql.test.ts` (24), `pt17GiftFlow.test.ts` (23), `pt17GiftContract.test.ts` (11), `giftDbFixture.ts`, `supabase/functions/_shared/private-annual-gift.test.ts` (12), `src/pages/LolPremiumGift.test.tsx` (17), +1 in `LolPremium.test.tsx`. pt14/pt15/pt16 assertions that pinned the old JS grant / webhook skip were updated to the new design.

## 5. Test results (2026-10-17)

- PT1.7 suites: SQL **24/24**, end-to-end flow **23/23** (real handlers + real SQL + fake Stripe), contract **11/11**, unit **12/12**, pages **17/17** (PT1.6b suites still 74/74; LolPremium 31/31). The SQL suite also reproduces the old defects on the pre-0004 chain: a stranger could redeem a friend's paid gift, Premium was not granted atomically, and the column REVOKE was ineffective.
- Mutation checks: disabling the SQL recipient check fails 5 tests; removing the quantity check fails its test.
- Wide regression (premium, billing, pt14–pt17, admin, admin-auth, App routes; 2,081 tests): **9 failures, identical to the `6b46e1c0` baseline.** These are pre-existing: Windows path-separator assumptions in pt14 and the admin-registry route tests, plus unrelated admin/legacy-route tests.
- `tsc -p tsconfig.app.json`: 2 errors, both pre-existing. Shared edge modules pass `tsc --strict`. ESLint: new files clean.
- `vite build` (esbuild-JSX scratch config with the rollup-wasm hook): **succeeds**; `LolPremiumGift` / `LolPremiumRedeem` chunks emitted.
- Browser (local dev server, signed out): the Premium page shows Gift Premium with "Redeem a gift" only; the gift and redeem pages show sign-in; the code moves from the URL into sessionStorage; `noindex`; no console errors. Signed-in and paid states are covered by component and flow tests only (no deployed function, no real sign-in).
- Deno is not installed here, so the Deno entry points were not type-checked by Deno.

## 6. Coverage of the requested cases

Unauthenticated, guest and unverified purchasers · unverified, wrong-email and guest recipients · successful payment and redemption · wrong price, currency, quantity, discount and metadata · unpaid/processing/cancelled payment · abandoned (expired), replaced and in-flight checkouts · duplicate and concurrent redemption (row lock; PGlite serialises, so true parallelism is argued, not demonstrated) · webhook retries and refund-before-completion ordering · partial/full refund and dispute open/won/lost before and after redemption · Stripe outage at redemption (fail closed) · 365-day expiry, stacking on a valid grant, replacing an expired one, permanent Premium left untouched · catalog monthly and diamonds gifts still redeem, now recipient-bound.

## 7. Decisions worth knowing

- Recipient binding now applies to **every** gift type, including any already-paid legacy gifts. Run `pt17_gift_verify.sql` A1 to see existing rows first.
- A dispute **keeps** a redeemed gift's Premium until it is lost; a full refund revokes immediately; a partial refund changes nothing.
- If the grant slot changed after redemption, a refund flags `revoked_needs_review` instead of guessing. A refunded **diamonds** gift is flagged, not clawed back.
- 365 days are added **after** any still-valid expiring grant, so the recipient never loses time. A recipient with never-expiring Premium is refused and the gift is kept for later.
- The private offer can't be bought through `create-checkout` (its Price is not in the public catalog). Only allowlisted buyers see the Buy option.
- Overlap: PT1.6b's custom one-time offer (claim links, `custom-offer-checkout`) is **already applied and deployed live**, but disabled. It remains a separate, unused path.

## 8. Outstanding blockers before the first real $50 purchase

1. **Owner / tax advisor:** decide the California tax treatment, then set `PRIVATE_ANNUAL_GIFT_TAX_MODE`. Not decided here; no tax advice is implied.
2. **Owner:** create the live one-time $50.00 USD Price (tax-inclusive if Stripe Tax is used).
3. ~~Review and merge~~ **DONE**: PR #67, `3d5cb057`.
4. ~~Apply 0004~~ **DONE** (owner-verified: ledger id 5, hash `1779ec0c…2926`, 5 SQL checks passed; re-confirmed read-only on 2026-10-17, §10). Do not reapply.
5. ~~Deploy Edge Functions~~ **DONE by Lovable Cloud** from `main`. `gift-checkout` and `redeem-gift` were fingerprinted as the new code. `verify-gift` and `stripe-webhook` can't be told apart from outside (§10).
6. **Owner, Stripe dashboard:** subscribe the webhook to `checkout.session.expired`, `checkout.session.async_payment_succeeded/failed`, `charge.refunded`, `charge.dispute.created/updated/closed` (in addition to `checkout.session.completed`).
7. **Stripe test-mode end-to-end. BLOCKED, owner decision needed (§10.3).** Production runs on the live Stripe key, so a test-mode purchase can't go through the production functions as they are.
8. Lovable Publish (frontend gift pages). The Buy button stays hidden while checkout is off, so publishing exposes only "Redeem a gift".
9. Only then: live price + live secrets + `PRIVATE_ANNUAL_GIFT_LIVE_APPROVED=true`, then the owner's real purchase with the prepaid Visa.

**Exact next task:** decide how to run the test-mode E2E (§10.3), together with the tax decision (step 1). The first customer purchase is **not ready** until step 7 passes.

## 9. Residual risks

- `redeem-gift` re-reads Stripe before redeeming. If a catalog gift's Price is later removed from `gift-catalog.ts`, its paid gifts would be reclassified `invalid`.
- No rate limit on the gift functions. Codes are 10 characters from a UUID and redemption is recipient-bound, so a guessed code is useless to anyone else.
- `admin_set_pro_grant` can still override a gift grant (admin power, unchanged).

## 10. Deployment verification (2026-10-17, read-only)

### 10.1 Deployment access

- This machine has **no Supabase CLI**, **no Supabase access token** (`~/.supabase` holds telemetry only; `SUPABASE_ACCESS_TOKEN` unset), **no Stripe CLI** and no Stripe key. No CLI deployment was attempted and none is authorized from here.
- The project (`kewgjwrzpzpeltwidvuc`) is **Lovable Cloud**. The supported operation is Lovable's own deployment: it deploys Edge Functions from `main` (cf. the "Deployed PT1.6b functions" commit `3e543625`). That has already happened for PT1.7. **No manual deployment is needed or was performed.**

### 10.2 What production serves now

All probes used the public anon key only: unauthenticated or anon-bearer requests that stop before any database write or Stripe call.

| Check | Result | Meaning |
|---|---|---|
| `gift-checkout` POST, no session | `200 {"available":false,"error":"Sign in to buy a gift","code":"ACCOUNT_REQUIRED"}` | **new function is live**; refuses signed-out callers |
| `redeem-gift` POST, anon bearer, `{}` | `401 {"error":"Not authenticated"}` | **new code** (the old code parsed the body first and returned `400 Missing code`) |
| `verify-gift` POST, no auth / anon bearer | `401 Missing authorization header` (gateway) / `401 {"error":"Unauthorized"}` | gateway JWT check still on; old and new look identical from outside |
| `stripe-webhook` POST, unsigned | `400 Missing stripe-signature header` | signature guard intact; old and new look identical from outside |
| `rpc/gift_redeem`, `rpc/private_gift_terms` as anon | `42501 permission denied` | 0004 functions present, service-role only |
| `rpc/redeem_gift_code` | `PGRST202` not found | the non-atomic claim is gone |
| `gifts` table as anon | `42501 permission denied for table gifts` | G5 closed (anon used to have SELECT) |
| `check-subscription`, no auth | `200 {"subscribed":false}` | unchanged |
| `create-checkout` `offer_availability` | `200 {"mode":"standard","available":["standard_monthly","standard_annual"]}` | **subscriptions unaffected**; standard offers live |
| `custom-offer-checkout`, anon bearer | `200 ACCOUNT_REQUIRED` | PT1.6b unchanged and still closed |

The gift sources on `main` are byte-identical to the reviewed `7c99892b` (`git diff 7c99892b 3d5cb057` is empty for every gift function and shared module).

**Not observable from here:** exact deployed function versions or timestamps (needs Lovable or the Supabase dashboard); Edge Function secrets, including that every `PRIVATE_ANNUAL_GIFT_*` flag is unset (the signed-out behaviour above is consistent with OFF); and the post-deploy `stripe-webhook` and `verify-gift` code paths, which need a signed Stripe event or a signed-in user.

### 10.3 Why the Stripe test-mode E2E is blocked, and the options

Production's `STRIPE_SECRET_KEY` is the **live** key (create-checkout sells live standard offers). Every gift function uses that one key, and `stripe-webhook` verifies one signing secret. A test-mode Checkout Session therefore can't be created or verified by the production functions, and swapping production to a test key would break live subscriptions. The two verified test accounts also need real inboxes to confirm their emails, and accounts are not created from this machine.

| Option | What it takes | Assessment |
|---|---|---|
| **A. Test-key lane for the private gift (recommended)** | Small code change + PR: `gift-checkout` uses `STRIPE_TEST_SECRET_KEY` when `PRIVATE_ANNUAL_GIFT_STRIPE_MODE=test`; the gift row records the mode; `stripe-webhook` tries the live secret, then `STRIPE_TEST_WEBHOOK_SECRET`, and reads Stripe with the key matching `event.livemode`; `redeem-gift`/`verify-gift` reconcile with the gift's recorded mode. Subscriptions keep using the live key and secret only. | Full E2E on the real production stack with zero live-money risk. The test gift's Premium lands on the owner's test accounts. After it passes, flip the mode to `live` |
| B. Separate staging project | A second Supabase/Lovable project with test keys | New infrastructure; not available today |
| C. Live-mode check with a real card | — | **Ruled out** (never use a real card for testing) |

### 10.4 Precise remaining steps (after the test-mode run passes)

1. **Tax (owner + adviser):** decide California treatment for this digital subscription gift. Then set `PRIVATE_ANNUAL_GIFT_TAX_MODE=approved_not_taxable` (no tax is due) or `stripe_tax_inclusive` (Stripe Tax registered and active for CA).
2. **Stripe live Price (owner, live dashboard):** Product "Mogzy Premium gift — 12 months". Price: **one-time**, **50.00 USD**, `tax_behavior` **inclusive** (required for `stripe_tax_inclusive`; harmless otherwise). Record the `price_…` id.
3. **Webhook (owner, live dashboard):** on the existing `stripe-webhook` endpoint, add `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`. Keep the existing subscription events.
4. **Secrets (owner, Lovable Cloud):** `STRIPE_PRIVATE_ANNUAL_GIFT_PRICE_ID=<step 2>`, `PRIVATE_ANNUAL_GIFT_TAX_MODE=<step 1>`, `PRIVATE_ANNUAL_GIFT_BUYER_USER_IDS=<owner's user id>`. Leave `PRIVATE_ANNUAL_GIFT_CHECKOUT_ENABLED` and `PRIVATE_ANNUAL_GIFT_LIVE_APPROVED` unset until step 6.
5. **Publish (Lovable):** the Gift Premium entry and the `/lol/premium/gift` and `/lol/premium/redeem` pages. Buying stays invisible while checkout is off.
6. **Live activation (owner, at purchase time):** set `PRIVATE_ANNUAL_GIFT_CHECKOUT_ENABLED=true` and `PRIVATE_ANNUAL_GIFT_LIVE_APPROVED=true`. Sign in as the owner (verified email), open `/lol/premium/gift`, enter the friend's email, and confirm the review shows **$50.00 total, one-time, never renews**. Pay with the prepaid Visa. Wait for "Gift confirmed" and send the code/link. The friend signs in with that verified email and redeems: **365 days** of Premium.
7. **Afterwards:** unset `PRIVATE_ANNUAL_GIFT_CHECKOUT_ENABLED` (single sale), and run `supabase/verification/pt17_gift_verify.sql` A1 to see the row.
