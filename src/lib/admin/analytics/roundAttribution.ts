/**
 * Which product a recorded game round belongs to — from server evidence only.
 *
 * Every product below runs the SAME canonical Ranked engine on Railway, so the
 * event NAME (`ranked_started` / `ranked_completed`) says nothing about the
 * product. What distinguishes them is what the server froze on the match and
 * copied into the event's metadata:
 *
 *   host            direct | daily_challenge | role_challenge | bonus_game |
 *                   playtest | journey_library | study_hall
 *   parent_*        the Daily run / Role Challenge run, where one exists
 *   session_preset  `bonus.<public mode id>` for a More Challenges mode
 *   opponent_type   "bot" | "human"          is_bot_match   boolean
 *
 * Rules that keep this honest:
 *  · A browser-reported row (`source_system = "web"`) is never attributed.
 *  · A route (`/quiz/daily-challenge`) is a location, never an attribution.
 *  · Daily needs host AND a Daily parent id; a missing parent stays unknown.
 *  · "direct" is not "player versus player". It is the engine's default host
 *    and also what the backend infers when a match has no stored host. Genuine
 *    player-versus-player requires the opponent to be recorded as human AND the
 *    match as not a bot match. A bot opponent is labelled as one.
 *  · Anything not matching a rule is `unknown`, with the reason in its label.
 */
import type { AnalyticsEventRecord } from "./metrics";
import { PUBLIC_MODE_TITLES, isPublicModeId } from "@/lib/public-modes/contracts";

export type RoundCategory =
  | "daily_stage"
  | "more_challenges"
  | "role_challenge"
  | "ranked_vs_player"
  | "ranked_vs_bot"
  | "playtest"
  | "journey_library"
  | "study_hall"
  | "unknown";

export interface RoundAttribution {
  category: RoundCategory;
  /** A short literal noun phrase, e.g. "Daily Challenge stage 2 (Time Trial)". */
  label: string;
  /** 1-based, only for a Daily stage with an explicit integer parent index. */
  stage?: number;
  stageKind?: string;
  /** Public mode id, only for More Challenges with a recognised preset. */
  modeId?: string;
}

const STAGE_KIND_LABELS: Readonly<Record<string, string>> = {
  standard: "main set",
  time_trial: "Time Trial",
  survival: "Survival",
  weak_areas: "Weak Areas",
  review: "Review",
};

const BONUS_PREFIX = "bonus.";

const str = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

/** Whether this row is a server-confirmed participant round. */
export function isServerRound(e: AnalyticsEventRecord): boolean {
  return e.source_system === "railway"
    && e.source_entity_type === "ranked_participant"
    && Boolean(e.source_entity_id)
    && (e.event_name === "ranked_started" || e.event_name === "ranked_completed");
}

export function attributeRound(e: AnalyticsEventRecord): RoundAttribution {
  if (!isServerRound(e)) {
    return { category: "unknown", label: "game round (browser report, unconfirmed)" };
  }
  const m = e.metadata ?? {};
  const host = str(m.host);

  if (host === "daily_challenge") {
    if (m.parent_activity_type !== "daily_challenge" || !str(m.parent_activity_id)) {
      return { category: "unknown", label: "game round (Daily host without a Daily run id)" };
    }
    const index = m.parent_stage_index;
    const stage = typeof index === "number" && Number.isInteger(index) && index >= 0 ? index + 1 : undefined;
    const kindRaw = str(m.parent_stage_kind);
    const kind = kindRaw && STAGE_KIND_LABELS[kindRaw] ? kindRaw : undefined;
    const detail = [stage ? `stage ${stage}` : null, kind ? `(${STAGE_KIND_LABELS[kind]})` : null]
      .filter(Boolean).join(" ");
    return { category: "daily_stage", label: `Daily Challenge ${detail || "stage (position not recorded)"}`, stage, stageKind: kind };
  }

  if (host === "bonus_game") {
    const preset = str(m.session_preset);
    const id = preset && preset.startsWith(BONUS_PREFIX) ? preset.slice(BONUS_PREFIX.length) : null;
    if (id && isPublicModeId(id)) {
      return { category: "more_challenges", label: `More Challenges · ${PUBLIC_MODE_TITLES[id]}`, modeId: id };
    }
    return { category: "more_challenges", label: "More Challenges (mode not recorded)" };
  }

  if (host === "role_challenge") {
    return { category: "role_challenge", label: "Role Challenge" };
  }

  if (host === "playtest") return { category: "playtest", label: "facilitated Playtest round" };
  if (host === "journey_library") return { category: "journey_library", label: "Journey Library round" };
  if (host === "study_hall") return { category: "study_hall", label: "Study Hall drill" };

  if (host === "direct") {
    const bot = m.is_bot_match === true && m.opponent_type === "bot";
    const player = m.is_bot_match === false && m.opponent_type === "human";
    if (bot) return { category: "ranked_vs_bot", label: "Ranked match against a bot (unrated)" };
    if (player) return { category: "ranked_vs_player", label: "Ranked match against another player" };
    return { category: "unknown", label: "Ranked-engine match (opponent type not recorded)" };
  }

  return { category: "unknown", label: "game round (host not recorded)" };
}
