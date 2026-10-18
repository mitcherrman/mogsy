# PT1.7 — $50 annual Premium gift: handoff

**Objective.** The owner buys 12 months of Premium as a gift for a friend in California, for exactly **$50.00 USD total**, paid once, never renewed. The friend redeems it with their own verified account and gets **365 days of Premium from the redemption date**.

**Branch:** `billing/annual-gift-50`, cut from `origin/main` `6b46e1c0`. **Status: implemented and tested locally. Nothing has been applied, deployed, published or enabled. No card has been charged.**

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
3. **Owner:** review and merge this branch.
4. Apply 0004 via Lovable. Run `supabase/verification/pt17_gift_verify.sql` before (check A1/A2) and after (section B all true).
5. Deploy edge functions **after** 0004: `redeem-gift`, `verify-gift`, `stripe-webhook`, `gift-checkout` (new). Until `redeem-gift` is redeployed, gift redemption fails closed. No live UI uses it today.
6. Stripe dashboard: subscribe the webhook to `checkout.session.expired`, `checkout.session.async_payment_succeeded/failed`, `charge.refunded`, `charge.dispute.created/updated/closed` (in addition to `checkout.session.completed`).
7. **Stripe test-mode end-to-end:** test key + test $50 price + `PRIVATE_ANNUAL_GIFT_CHECKOUT_ENABLED` + `TAX_MODE` + buyer allowlist. Buy with card 4242…, confirm the gift is paid, redeem from a second verified account, then refund and confirm the revocation.
8. Lovable Publish.
9. Only then: live price + live secrets + `PRIVATE_ANNUAL_GIFT_LIVE_APPROVED=true`, then the owner's real purchase with the prepaid Visa.

**Exact next task:** step 1 (owner tax decision). After that, step 7 (Stripe test-mode E2E) is the gate that proves payment and entitlement on real infrastructure. The first customer purchase is **not ready** until step 7 passes.

## 9. Residual risks

- `redeem-gift` re-reads Stripe before redeeming. If a catalog gift's Price is later removed from `gift-catalog.ts`, its paid gifts would be reclassified `invalid`.
- No rate limit on the gift functions. Codes are 10 characters from a UUID and redemption is recipient-bound, so a guessed code is useless to anyone else.
- `admin_set_pro_grant` can still override a gift grant (admin power, unchanged).
