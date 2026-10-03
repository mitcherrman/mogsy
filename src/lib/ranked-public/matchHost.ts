/**
 * JLIB-HOST — WHO HOSTS A RANKED MATCH, as the backend persisted it.
 *
 * `ranked_matches.host` is written once, when the match is created, from the
 * backend's one host vocabulary. It is exposed, under the one field name
 * `host`, on:
 *
 * * `GET /api/ranked/active-match` → `active_match.host`
 * * `GET /api/ranked/matches/{id}` → `payload.host`
 * * `POST /api/ranked/matches/{id}/resume` → `payload.public.payload.host`
 * * `GET /api/ranked/history` → `payload.entries[].host`
 *
 * `null` is an ordinary (or legacy, pre-provenance) Ranked match. It is never
 * read as `direct`: the backend does not infer one, and neither does this.
 *
 * The value is kept VERBATIM. A host this client does not know yet is still
 * the backend's answer and is preserved rather than coerced to `null`; every
 * caller compares against one of the named constants below, so an unknown
 * host simply matches none of them and behaves as an ordinary match.
 */

export const MATCH_HOST = {
  journeyLibrary: "journey_library",
  dailyChallenge: "daily_challenge",
  studyHall: "study_hall",
  playtest: "playtest",
  direct: "direct",
} as const;

export type KnownRankedMatchHost = (typeof MATCH_HOST)[keyof typeof MATCH_HOST];

/** A persisted host. `string & {}` keeps an unknown value without losing the
 *  known names to `string`. */
export type RankedMatchHost = KnownRankedMatchHost | (string & {});

/** The wire value, or `null` for absent, null, empty or non-string. */
export function readMatchHost(value: unknown): RankedMatchHost | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * The player-facing name of a host whose matches are labelled as such, or
 * `null`. Only the Journey Library is named today: every other host (and an
 * ordinary `null` match) keeps the label it had before hosts were exposed.
 * The raw host id is never shown.
 */
const HOST_LABELS: Partial<Record<KnownRankedMatchHost, string>> = {
  [MATCH_HOST.journeyLibrary]: "Journey Library",
};

export function matchHostLabel(host: RankedMatchHost | null | undefined): string | null {
  return typeof host === "string" && Object.prototype.hasOwnProperty.call(HOST_LABELS, host)
    ? HOST_LABELS[host as KnownRankedMatchHost] ?? null
    : null;
}
