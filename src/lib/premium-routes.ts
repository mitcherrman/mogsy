/**
 * Canonical route identity for the paid subscription, "Mogzy Premium".
 *
 * It lives apart from the redirect component so both can be imported without
 * dragging React in, and so the component file exports a component only.
 *
 * Naming rule for this codebase: **Premium is the paid subscription; Pro is
 * Pro Play**, the esports feature at /lol/pro-play. Identifiers that mirror a
 * persisted name — the Stripe entitlement column on `profiles`, the
 * `pro_grant_*` columns, `gifts.gift_type` — keep their `pro` spelling;
 * routes and user-facing copy do not. Full table:
 * `docs/naming-premium-vs-pro-play.md`.
 */

/** Where the subscription page lives. */
export const PREMIUM_ROUTE = "/lol/premium";

/**
 * Legacy subscription URLs, redirect-only. `/lol/pro` was the route until the
 * Premium rename; `/pro` was never a route (it fell through to the `/:slug`
 * custom-link handler) but is the shorthand people type.
 */
export const LEGACY_PREMIUM_ROUTES = ["/lol/pro", "/pro"] as const;
