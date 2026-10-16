# PT1.6b — Custom one-time $50 / 12-month Premium: handoff

**Branch:** `billing/custom-one-time-50-completion` (base `ddd0f69f`, the Lovable "Added custom one-time offer" commit = `origin/main` on 2026-10-16).
**Status:** code complete and tested locally. **Not deployed, not applied, not live.** Live checkout is gated off in code (§5).

## 1. What the offer is

One customer, one private link, **$50.00 USD total**, **12 calendar months** of Premium, paid once, **never auto-renews**. Premium is the same single product every other offer grants. It's stored as a `pro_grant_kind = 'purchase'` grant with a real expiry, so it lapses on its own with no cron and no Stripe subscription.

## 2. Verified state of production (2026-10-16, read-only)

| Check | Method | Result |
|---|---|---|
| 0002 applied | anon PostgREST `?limit=0` + non-executing RPC probes; Lovable-generated `types.ts` | both tables exist; all five 0002 functions exist |
| 0002 function grants | anon GET RPC with bogus args (read-only transaction) | `42501 permission denied` for all five + `apply_pro_grant` |
| 0002 table grants | anon `GET /custom_offer_claims?limit=0` | **HTTP 200**: anon holds table SELECT (RLS hides rows) → defect D2 confirmed |
| OWN1 owner gate live | `types.ts` lists `assert_owner`, `is_owner`, `is_owner_fresh_aal2` | present |

These were not observable without the owner (no DB credential on this machine): function bodies as applied, row counts, the drizzle migrations table. Run `supabase/verification/pt16b_custom_offer_verify.sql` (read-only, rolls back; dry-run tested on PGlite) before and after applying 0003.

## 3. Defects in the applied 0002 (fixed by 0003, not by editing 0002)

| # | Defect | Consequence |
|---|---|---|
| D1 | Every audit insert writes `admin_audit_log.actor_user_id = NULL` into a `NOT NULL` column | `record_custom_offer_purchase` / `refund_…` **always fail**: a paid customer never gets Premium and Stripe retries for days. Reproduced on PGlite in the test suite. |
| D2 | Tables inherit default anon/authenticated privileges (incl. TRUNCATE, which RLS doesn't cover) | confirmed live (anon SELECT 200) |
| D3 | Recorder takes amount and end date as parameters and checks neither | any caller-side bug grants arbitrary Premium |
| D4 | Refund clears the grant even when the purchase stacked on an earlier gift | destroys the gift |
| D5 | `restore_custom_offer_claim` unbinds the customer | an abandoned checkout makes a customer-specific link claimable by anyone |
| D6 | Nothing stops two open sessions or two paid purchases per claim | double charge / double grant |
| D7 | Minting used `is_owner()` (trusted) | weaker than `admin_set_pro_grant` (fresh MFA) |

## 4. Design decisions

- **Terms are server constants in two places, pinned together by a test:** SQL `public.custom_offer_terms()` and TS `CUSTOM_OFFER_TERMS`. Activation compares what Stripe **captured** (`PaymentIntent.amount_received`/`currency`) with the SQL terms. Anything else is held as `review` and never granted.
- **The browser sends `{action, token}` and nothing else.** No price, amount, quantity, coupon or return URL is read, and a static test pins this.
- **Stripe Price is env-configured and verified at checkout:** active, one-time, `unit_amount = 5000`, `usd`. With Stripe Tax on, it must be `tax_behavior = inclusive` so the total stays $50. No promotion codes, no discounts, quantity 1, card only (so "completed" means "paid"). Async-payment events are still handled.
- **Claim token:** `mgy1_` + 192 random bits. Only its SHA-256 is stored. It's shown to the owner once and carried in the URL **fragment** (`/lol/premium/claim#…`), so it never reaches a server log or a Referer. sessionStorage keeps it across the Stripe round trip.
- **Customer-specific:** the first account to start checkout is bound permanently. The owner can also pin the target account (`_for_user_id`). Guests (anonymous auth) are refused in both the edge function and SQL.
- **One payable session per claim:** an open session is reused. One near expiry (<2 min) is expired via the Stripe API and replaced. Attaching a new session is compare-and-set, and the loser expires its own session. A second paid session for a claim lands in `review`, enforced by a unique partial index.
- **Abandoned/failed recovery:** `checkout.session.expired` and `async_payment_failed` release the session but **keep the customer binding**, so the same customer can retry.
- **Activation is payment-confirmed and idempotent:** it runs only from a signature-verified webhook, only when `payment_status = paid` and the re-read PaymentIntent is `succeeded`. It's keyed on the Checkout Session id, so redelivery returns `duplicate`.
- **12 calendar months**, using Postgres `+ make_interval(months => 12)`. It **stacks after** a still-valid expiring grant (e.g. a gift), so nothing the customer holds is lost.
- **Refunds:** a **full** refund or a **lost dispute** revokes the grant and restores whatever grant it stacked on. A partial refund is recorded and changes nothing. If the grant slot changed after activation (e.g. a gift was redeemed on top), it's flagged `revoked_needs_review` rather than guessed. Refunds of other payments (diamonds, gifts) return `not_found` and are ignored.
- **Preserve subscriptions:** checkout refuses an account with an active/trialing Stripe subscription (`is_pro`) or permanent Premium. `create-checkout`, `check-subscription`, `redeem-gift` and the gift catalog are unchanged. The webhook routes custom-offer sessions before the existing gift/subscription checks, which are byte-identical.
- **Ledger:** lifecycle events go to `custom_offer_events` (service-role only), not `admin_audit_log` (D1).
- **Review closes the claim:** a payment held for review blocks a second payment until the owner resolves it.

## 5. Live-activation gates (all fail closed)

`custom-offer-checkout` creates no session unless **all** hold:
1. `CUSTOM_OFFER_CHECKOUT_ENABLED=true`
2. `STRIPE_PRICE_CUSTOM_ONE_TIME_50=price_…` and that price passes validation
3. a `STRIPE_SECRET_KEY` is present
4. with a **live** key (`sk_live_`/`rk_live_`): `CUSTOM_OFFER_LIVE_APPROVED=true`. **Do not set this** until tax compliance and end-to-end verification are signed off.

Optional: `CUSTOM_OFFER_AUTOMATIC_TAX=true` turns on Stripe Tax (requires a tax-inclusive price).

## 6. Files

| File | Role |
|---|---|
| `drizzle/migrations/0003_pt1_6b_custom_offer_completion.sql` (+ `meta/_journal.json`, `meta/0003_snapshot.json`) | fixes D1–D7. 13 functions, 1 ledger table, in-transaction self-assertions |
| `supabase/functions/_shared/custom-offer.ts` | terms, config gate, token, price validation, session params |
| `supabase/functions/_shared/custom-offer-checkout.ts` | status/checkout decision logic (injected Stripe/RPC) |
| `supabase/functions/_shared/custom-offer-webhook.ts` | activation, release, refund, dispute handling |
| `supabase/functions/custom-offer-checkout/index.ts`, `supabase/config.toml` | new edge function (`verify_jwt = false`, authenticates itself) |
| `supabase/functions/stripe-webhook/index.ts` | routes the custom-offer events; nothing else changed |
| `src/lib/pro/customOffer.ts`, `src/pages/LolPremiumClaim.tsx`, `src/App.tsx` | `/lol/premium/claim` (noindex) |
| `src/pages/admin/AdminCustomOffers.tsx`, `src/lib/admin/admin-registry.ts` | `/admin/custom-offers` owner tool |
| `src/lib/pro/entitlement.ts`, `src/pages/LolPremium.tsx` | `'purchase'` grant kind; "paid once, does not renew" copy |
| `src/integrations/supabase/types.ts` | hand-synced to 0003 (Lovable will regenerate) |
| `supabase/verification/pt16b_custom_offer_verify.sql` | owner's read-only before/after check |

## 7. Tests

New: `src/test/security/pt16CustomOfferSql.test.ts` (29: real PT1.4 → 0002 → 0003 on PGlite as anon/authenticated/owner/service_role, including the D1 repro), `pt16CustomOfferFlow.test.ts` (9: real handlers + real SQL + fake Stripe, end to end), `pt16CustomOfferContract.test.ts` (11 static), `supabase/functions/_shared/custom-offer.test.ts` (25), `src/pages/LolPremiumClaim.test.tsx` (11), `src/pages/admin/AdminCustomOffers.test.tsx` (4), plus one new case in `LolPremium.test.tsx`. Mutation check: removing one REVOKE makes 0003 abort itself.

Regression (premium, pt14/15, admin, admin-auth, entitlement, App route suites; 1,962+ tests): **no new failures vs a detached `ddd0f69f` baseline.** The same 9 failures exist on base. They're Windows path-separator assumptions in `pt14` and the admin-registry route tests, plus unrelated admin/legacy-route tests. `tsc -p tsconfig.app.json`: 2 errors, both pre-existing. Shared edge modules pass `tsc --strict`. Deno is not installed here, so the two `index.ts` entry points were not type-checked by Deno.

## 8. Remaining work, in order

1. **Owner: tax decision.** Is $50 tax-inclusive? Is Stripe Tax registration needed in the customer's jurisdiction? This decides `CUSTOM_OFFER_AUTOMATIC_TAX` and the price's `tax_behavior`. **Blocks live.**
2. Apply 0003 via Lovable. Run the verification bundle before and after: section B must be all true.
3. Deploy the `custom-offer-checkout` (new) and `stripe-webhook` (updated) edge functions **after** 0003.
4. Stripe dashboard: subscribe the existing webhook endpoint to `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `charge.refunded`, `charge.dispute.closed`.
5. **Test mode E2E:** create a $50 one-time test price, set test secrets plus `CUSTOM_OFFER_CHECKOUT_ENABLED=true`, mint a link, pay with `4242…`, confirm Premium; then refund it, let a session expire, and try a second account.
6. Lovable Publish the frontend.
7. Only then: create the live price, set the live env, set `CUSTOM_OFFER_LIVE_APPROVED=true`, and mint the customer's link.

## 9. Known limits / residual risk

- `redeem-gift` does a non-atomic read-modify-write of the grant slot (pre-existing). A gift redeemed in the same instant as an activation could overwrite it. That's rare, and the purchase row keeps the facts for a manual fix.
- An owner revoke while a checkout is open (≤31 min) can't expire the Stripe session from the browser. A payment that completes anyway is held as `review` (`claim_revoked`).
- No rate limit on `custom-offer-checkout` status/checkout. Tokens are 192-bit, so guessing isn't feasible.
- Not in this branch: email receipt or an expiry reminder (Stripe sends the receipt).
- Observed, not touched: Lovable commit `96d0bb7d` removed 865 lines from `public/sitemap.xml` on main.
