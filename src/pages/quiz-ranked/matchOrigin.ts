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

/**
 * UGMP — the owner's Playtests hub. NOT a host: an admin preset match persists
 * host `playtest`, which the public guided Playtest (/quiz/playtest) shares. So
 * no host ever implies this origin; it is a router-state REFINEMENT of
 * `playtest` that the hub's launch puts beside the match id, and it stands only
 * while the persisted host is `playtest` (or not reported yet). A reload loses
 * it, and the match falls back to the ordinary result actions.
 */
export const ADMIN_PLAYTESTS_ORIGIN_ID = "admin_playtests";
export const ADMIN_PLAYTESTS_ROUTE = "/admin/leaguecraft?section=ranked&view=playtests";

type HostOriginId = typeof MATCH_HOST.journeyLibrary | typeof MATCH_HOST.roleChallenge;
export type RankedMatchOriginId = HostOriginId | typeof ADMIN_PLAYTESTS_ORIGIN_ID;

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
/** RC8: back to the hub with the centre parchment on Role Challenge. */
export const ROLE_CHALLENGE_ROUTE = "/quiz?mode=role";

export const ADMIN_PLAYTESTS_ORIGIN: RankedMatchOrigin = {
  id: ADMIN_PLAYTESTS_ORIGIN_ID,
  label: "Ranked Playtest",
  href: ADMIN_PLAYTESTS_ROUTE,
  returnLabel: "Back to Playtests",
  navLabel: "Playtests",
};

/** The origins a persisted host implies. */
export const RANKED_MATCH_ORIGINS: Record<HostOriginId, RankedMatchOrigin> = {
  [MATCH_HOST.journeyLibrary]: {
    id: MATCH_HOST.journeyLibrary,
    label: matchHostLabel(MATCH_HOST.journeyLibrary)!,
    href: JOURNEY_LIBRARY_ROUTE,
    returnLabel: "Back to Journey Library",
    navLabel: "Journeys",
  },
  [MATCH_HOST.roleChallenge]: {
    id: MATCH_HOST.roleChallenge,
    label: matchHostLabel(MATCH_HOST.roleChallenge)!,
    href: ROLE_CHALLENGE_ROUTE,
    returnLabel: "Back to Role Challenge",
    navLabel: "Role Challenge",
  },
};

/** The origin a persisted host implies; other hosts (Daily, Study Hall,
 *  Playtest, direct, unknown) and `null` have none. */
export function originForHost(
  host: RankedMatchHost | null | undefined,
): RankedMatchOrigin | null {
  return typeof host === "string" && Object.prototype.hasOwnProperty.call(RANKED_MATCH_ORIGINS, host)
    ? RANKED_MATCH_ORIGINS[host as HostOriginId]
    : null;
}

/** Read an origin off router state; anything unrecognised is no origin. */
export function readMatchOrigin(state: unknown): RankedMatchOrigin | null {
  if (!state || typeof state !== "object") return null;
  const id = (state as { origin?: unknown }).origin;
  if (id === ADMIN_PLAYTESTS_ORIGIN_ID) return ADMIN_PLAYTESTS_ORIGIN;
  return typeof id === "string" ? originForHost(id) : null;
}

/**
 * THE PRECEDENCE RULE. A host the backend REPORTED (a string or `null`) wins,
 * even over a contradicting router-state hint. Only when the match has not
 * reported one — no snapshot yet, or a backend predating the field
 * (`undefined`) — does the hint stand. The one exception is a refinement, not
 * a contradiction: the admin Playtests hint survives a reported `playtest`.
 */
export function resolveMatchOrigin(
  persistedHost: RankedMatchHost | null | undefined,
  hint: RankedMatchOrigin | null,
): RankedMatchOrigin | null {
  if (persistedHost === undefined) return hint;
  if (hint?.id === ADMIN_PLAYTESTS_ORIGIN_ID && persistedHost === MATCH_HOST.playtest) return hint;
  return originForHost(persistedHost);
}
