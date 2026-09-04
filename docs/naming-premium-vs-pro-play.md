# Naming: Premium is the subscription, Pro is Pro Play

**Decided 2026-09-04. This is the convention going forward; treat it as
binding for all new copy, routes and surfaces.**

## The two things that used to share a word

| Thing | Name | Route |
|---|---|---|
| The paid subscription | **Mogzy Premium** | **`/lol/premium`** |
| The esports feature | **Pro Play** | `/lol/pro-play`, `/lol/pro-play/quiz`, `/lol/pro-play/graphs` |
| The public esports wiki | **Pro Data** | `/lol/docs/pro/*` |

"Pro" on its own now means professional play. It never means "paying
customer". `Premium Play` is not a thing and must never be written.

## Routes

* Canonical subscription route: **`/lol/premium`**.
* `/lol/pro` and `/pro` are **legacy redirects only** — see
  `src/lib/premium-routes.ts` (`LEGACY_PREMIUM_ROUTES`) and
  `src/pages/LegacyPremiumRedirect.tsx`. They carry the query string and hash
  through, because Stripe returns the buyer with `?success=true` /
  `?canceled=true`.
* There is exactly one subscription page. `/shop` is the Swipe-side **store**
  (diamonds, power-ups, gifting) that also sells the same subscription; it is
  not a second product page.

## Copy

Use: `Premium`, `Mogzy Premium`, `Upgrade to Premium`, `Premium member`,
`Premium features`, `Premium-only`.

Do not use for the subscription: `Mogzy Pro`, `Mogsy Pro`, `Upgrade to Pro`,
`Pro subscription`, `Pro member`, `Go Pro`.

The brand spelling is **Mogzy** (matching `mogzy.lol`). The older `Mogsy`
spelling was retired from subscription copy in the same pass.

## Identifiers that deliberately keep `pro`

These mirror something persisted or external. Renaming them would be a data
migration, not a naming change, and buys nothing the UI does not already say:

| Identifier | Why it stays |
|---|---|
| `profiles.is_pro` | Postgres column; written by the two Stripe edge functions |
| `profiles.pro_grant_kind` / `_expires_at` / `_reason` / `_granted_at` / `_granted_by` | Postgres columns (PT1.4) |
| `pro_entitlement_is_effective`, `pro_grant_is_valid`, `my_pro_entitlement`, `apply_pro_grant`, `record_pro_commercial_state` | Postgres functions |
| `gifts.gift_type` values `pro_monthly`, `pro_annual` | persisted rows + Stripe gift prices |
| `invite_links.grant_pro`, `custom_links.grant_pro` | Postgres columns |
| `app_settings` keys `pro_pricing`, `shop_ad_config.type: "pro"` | persisted config read by both the UI and `create-checkout` |
| `VITE_STRIPE_PRO_*`, `VITE_STRIPE_LOL_PRO_*`, `VITE_STRIPE_GIFT_PRO_*` | deployment configuration + live Stripe Price IDs |
| `src/lib/pro/entitlement.ts`, `isPro`, `isEffectivePro`, `describeProSource`, `proStatus` | the frontend accessors for the columns above; they read `is_pro` |
| `src/lib/pro/checkout.ts` exports (`startLolProCheckout`, `LOL_PRO_*`) | same module family; also rewritten wholesale by PT1.5, so renaming here would only create merge conflict |
| `services/pro_status.py`, `ProLookupError` (backend) | the backend half of the same entitlement read |
| tutorial step id `ads_pro_explanation`, `data-testid="ads-pro-panel"` | the tutorial machine's `STEP_ORDER` key |
| admin directory filter key `pro` | the filter's URL/state value; its **label** is "Premium" |

Rule of thumb: **if the string crosses into Postgres, Stripe, or a stored
setting, it keeps `pro`. If a human reads it, it says Premium.**
