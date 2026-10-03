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
 * WHERE THE ORIGIN COMES FROM (JLIB-HOST)
 * ──────────────────────────────────────
 * The canonical answer is the match's PERSISTED backend host (`matchHost`),
 * which every recovery read now carries: active-match discovery, the match
 * state and the resume. It survives a reload, a new tab and a cleared history.
 *
 * The Library's launch also puts `origin: "journey_library"` in ROUTER STATE
 * beside the handoff `matchId`. That is only an immediate-navigation hint: it
 * lets the arena's first frame say "Journey Library" before the first snapshot
 * lands. Once the match reports a host, the host decides — including when it
 * contradicts the hint (`resolveMatchOrigin`). An origin is a presentation
 * hint only: it changes the result screen's primary action, the route's back
 * link and the arena eyebrow, and nothing else.
 *
 * The ids ARE host values. There is no second vocabulary: an origin exists for
 * a host whose matches return somewhere other than the Ranked lobby.
 */

import {
  MATCH_HOST,
  matchHostLabel,
  type RankedMatchHost,
} from "@/lib/ranked-public/matchHost";

export type RankedMatchOriginId = typeof MATCH_HOST.journeyLibrary;

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
  [MATCH_HOST.journeyLibrary]: {
    id: MATCH_HOST.journeyLibrary,
    label: matchHostLabel(MATCH_HOST.journeyLibrary)!,
    href: JOURNEY_LIBRARY_ROUTE,
    returnLabel: "Back to Journey Library",
    navLabel: "Journeys",
  },
};

/** The origin a persisted host implies; every other host (Daily, Study Hall,
 *  Playtest, direct, unknown) and `null` have none. */
export function originForHost(
  host: RankedMatchHost | null | undefined,
): RankedMatchOrigin | null {
  return typeof host === "string" && Object.prototype.hasOwnProperty.call(RANKED_MATCH_ORIGINS, host)
    ? RANKED_MATCH_ORIGINS[host as RankedMatchOriginId]
    : null;
}

/** Read an origin off router state; anything unrecognised is no origin. */
export function readMatchOrigin(state: unknown): RankedMatchOrigin | null {
  if (!state || typeof state !== "object") return null;
  const id = (state as { origin?: unknown }).origin;
  return typeof id === "string" ? originForHost(id) : null;
}

/**
 * THE PRECEDENCE RULE. A host the backend REPORTED (a string or `null`) wins,
 * even over a contradicting router-state hint. Only when the match has not
 * reported one — no snapshot yet, or a backend predating the field
 * (`undefined`) — does the hint stand.
 */
export function resolveMatchOrigin(
  persistedHost: RankedMatchHost | null | undefined,
  hint: RankedMatchOrigin | null,
): RankedMatchOrigin | null {
  return persistedHost === undefined ? hint : originForHost(persistedHost);
}
