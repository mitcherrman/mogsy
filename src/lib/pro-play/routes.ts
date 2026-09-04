/**
 * Canonical route identity for the Pro Play area.
 *
 * These live apart from the hub component for the same reason the Premium
 * routes do (`@/lib/premium-routes`): the router needs the paths, and
 * importing them from `ProPlayHub.tsx` would pull that page — and everything
 * it imports — into the main bundle, undoing its lazy split.
 *
 * Naming rule: **Pro Play is the esports content area at `/lol/pro-play`;
 * Premium is the paid subscription at `/lol/premium`.** They are unrelated
 * products that unfortunately share a word. See
 * `docs/naming-premium-vs-pro-play.md`.
 */

/** The Pro Play hub — the landing page for the area. */
export const PRO_PLAY_ROUTE = "/lol/pro-play";
export const PRO_PLAY_QUIZ_ROUTE = "/lol/pro-play/quiz";
export const PRO_PLAY_GRAPHS_ROUTE = "/lol/pro-play/graphs";

/**
 * The LIVE1 match centre. It shipped first at `/esports/live`, outside this
 * area and linked from nowhere; that URL now redirects here so the match
 * centre sits inside the Pro Play IA it belongs to.
 */
export const PRO_PLAY_LIVE_ROUTE = "/lol/pro-play/live";

/** The pre-Pro-Play URL for the match centre, kept as a redirect. */
export const LEGACY_ESPORTS_LIVE_ROUTE = "/esports/live";
