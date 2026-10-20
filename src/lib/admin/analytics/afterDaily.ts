/**
 * What browsers did after the Daily Challenge, and whether they came back.
 *
 * Built ONLY from the visitor journeys (explicit visitor/session correlation,
 * server-confirmed rounds), so it inherits their boundaries:
 *  · a "browser" is a stored browser id, not a person; a cleared cache, a
 *    second device or a private window is a different browser;
 *  · only rounds the server attributed to the Daily (host + Daily run id) count
 *    as Daily activity;
 *  · there is no event for a finished whole Daily, so "after Daily" is anchored
 *    on each browser's LAST recorded Daily stage activity, not on completion.
 *
 * NEXT GAME: the first game start of a different product recorded after that
 * anchor, in the range. "None recorded" means none was observed, not that the
 * visitor left: a browser with no later event may simply have been idle.
 *
 * RETURN: a later browser session that starts on a later UTC day than the
 * anchor. Only browsers with at least a full day of follow-up inside the range
 * are eligible, so late-range Daily players are never counted as non-returners.
 */
import type { VisitorJourney } from "./visitorJourney";

const DAY_MS = 24 * 60 * 60 * 1000;

export type NextPlayId =
  | "more_challenges" | "role_challenge" | "ranked_vs_player" | "ranked_vs_bot"
  | "practice_quiz" | "other_game" | "none";

export const NEXT_PLAY_LABELS: Readonly<Record<NextPlayId, string>> = {
  more_challenges: "More Challenges",
  role_challenge: "Role Challenge",
  ranked_vs_player: "Ranked against another player",
  ranked_vs_bot: "Ranked against a bot",
  practice_quiz: "Practice Quiz",
  other_game: "Another game (playtest, journey, study hall or unrecognised)",
  none: "No later game recorded in range",
};

export interface AfterDailySummary {
  /** Browsers with at least one recorded Daily stage start or completion. */
  dailyBrowsers: number;
  next: Record<NextPlayId, number>;
  /** Daily browsers with at least one full UTC day of follow-up inside the range. */
  followUpEligible: number;
  /** Of those, browsers with a later session starting on a later UTC day. */
  returned: number;
}

const utcDay = (ms: number) => Math.floor(ms / DAY_MS);

function nextPlayOf(category: string | undefined): NextPlayId {
  switch (category) {
    case "more_challenges": case "role_challenge":
    case "ranked_vs_player": case "ranked_vs_bot": case "practice_quiz":
      return category;
    default:
      return "other_game";
  }
}

export function computeAfterDaily(journeys: VisitorJourney[], rangeEnd: number): AfterDailySummary {
  const next = Object.fromEntries(
    (Object.keys(NEXT_PLAY_LABELS) as NextPlayId[]).map((k) => [k, 0]),
  ) as Record<NextPlayId, number>;
  let dailyBrowsers = 0;
  let eligible = 0;
  let returned = 0;
  for (const j of journeys) {
    const dailyTimes = j.actions
      .filter((a) => a.category === "daily_stage" && (a.kind === "game_start" || a.kind === "stage_end"))
      .map((a) => Date.parse(a.at))
      .filter(Number.isFinite);
    if (!dailyTimes.length) continue;
    dailyBrowsers += 1;
    const anchor = Math.max(...dailyTimes);

    const later = j.actions
      .filter((a) => a.kind === "game_start" && Date.parse(a.at) > anchor)
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
    next[later ? nextPlayOf(later.category) : "none"] += 1;

    if (rangeEnd - anchor >= DAY_MS && utcDay(rangeEnd) > utcDay(anchor)) {
      eligible += 1;
      const back = j.actions.some((a) => a.kind === "session"
        && utcDay(Date.parse(a.at)) > utcDay(anchor));
      if (back) returned += 1;
    }
  }
  return { dailyBrowsers, next, followUpEligible: eligible, returned };
}
