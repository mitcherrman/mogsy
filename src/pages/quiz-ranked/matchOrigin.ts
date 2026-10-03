/**
 * JLIB-FE — WHERE A STANDALONE RANKED MATCH WAS STARTED FROM.
 *
 * `/quiz/ranked` hosts every standalone match, and its result screen's
 * actions were written for the lobby: Play Again re-opens the Ranked queue,
 * Back to Leaguecraft returns to `/quiz`. A match the Journey Library started
 * (backend host `journey_library`) is the same canonical match, played by the
 * same arena, but the player came from `/quiz/journeys` and must be able to
 * get back there — and "Play Again" into the Ranked queue would be wrong.
 *
 * The origin travels in ROUTER STATE beside the handoff `matchId`, the same
 * channel the lobby already uses. It is a presentation hint only: it changes
 * the result screen's primary action, the route's back link and the arena
 * eyebrow, and nothing else. It survives a reload (browser history state) and
 * is absent after account-bound discovery, in which case the ordinary Ranked
 * actions apply — the backend does not expose the host on the match.
 */

export type RankedMatchOriginId = "journey_library";

export interface RankedMatchOrigin {
  id: RankedMatchOriginId;
  /** Player-facing name of the origin — never the internal host id. */
  label: string;
  /** Where the origin lives. */
  href: string;
  /** The result screen's primary action. */
  returnLabel: string;
  /**
   * The route's fixed back link. Short on purpose: that link shares the HUD
   * band with the result frame, and at 1440px only about "Back to Quiz" fits.
   */
  navLabel: string;
}

export const JOURNEY_LIBRARY_ROUTE = "/quiz/journeys";

export const RANKED_MATCH_ORIGINS: Record<RankedMatchOriginId, RankedMatchOrigin> = {
  journey_library: {
    id: "journey_library",
    label: "Journey Library",
    href: JOURNEY_LIBRARY_ROUTE,
    returnLabel: "Back to Journey Library",
    navLabel: "Journeys",
  },
};

/** Read an origin off router state; anything unrecognised is no origin. */
export function readMatchOrigin(state: unknown): RankedMatchOrigin | null {
  if (!state || typeof state !== "object") return null;
  const id = (state as { origin?: unknown }).origin;
  return typeof id === "string" && id in RANKED_MATCH_ORIGINS
    ? RANKED_MATCH_ORIGINS[id as RankedMatchOriginId]
    : null;
}
