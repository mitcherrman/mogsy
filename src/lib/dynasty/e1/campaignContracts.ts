/**
 * UX-7 — the E3B campaign contract (`WORLDS_DYNASTY_E3B_CAMPAIGN_API.md`,
 * backend `roguelike/wd-v2-e3b-campaign` @ 80450127).
 *
 *   snapshot  `dynasty.combat_v2.campaign.snapshot.e3b`, `schema_revision >= 1`
 *   listing   `dynasty.combat_v2.campaign.list.e3b`
 *
 * Every campaign series is an ordinary E3A series at `schema_revision: 4` (the
 * e2 snapshot plus a top-level `campaign` block), played through the UX-6 series
 * transport unchanged. These types cover only what E3B adds.
 *
 * The client never computes progression: qualification, byes, eliminations,
 * opponents, carry, standouts and story all arrive in the snapshot and are
 * rendered as served. Readers refuse a drifted snapshot instead of guessing.
 */
import type { E1Role } from "./contracts";

export const CAMPAIGN_API = "/api/admin/dynasty/v2" as const;
export const CAMPAIGN_SCHEMA = "dynasty.combat_v2.campaign.snapshot.e3b" as const;
export const CAMPAIGN_LIST_SCHEMA = "dynasty.combat_v2.campaign.list.e3b" as const;

export type CampaignStatus = "active" | "completed" | "abandoned";
export type CampaignPhase = "series" | "series_result" | "completed" | "abandoned";
export type CampaignStage = "regular" | "playoffs" | "worlds";
export type MapStatus = "won" | "lost" | "current" | "upcoming" | "skipped_bye" | "not_reached" | "closed";
export type EndingKind = "champion" | "eliminated" | "abandoned";
export type StoryBeatKind = "previous_series" | "standout" | "fatigue_building" | "practice_payoff" | "objectives" | "rematch" | "stakes" | "ending";
export type CampaignPolicy = "broad_mid_win" | "narrow_early_mid_combo";

export interface Score { you: number; opponent: number }

export interface CampaignOpponent {
  opponent_id: string;
  name: string;
  tier: string;
  style?: string;
  preset?: string;
  ratings?: number[];
  cohesion?: number;
  evidence_type?: string;
}

export interface StageStanding { kind: "record" | "knockout"; wins: number; losses: number; played: number; qualify_wins?: number; bye_wins?: number }

export interface MapNode {
  round: string;
  title: string;
  stage: CampaignStage;
  knockout: boolean;
  status: MapStatus;
  series_index: number | null;
  opponent: CampaignOpponent | null;
  score: Score | null;
}

export interface FormatRound { round: string; title: string; prep_slots: number; stakes: string; opponent_pool?: string[]; rematch: string | null }
export interface FormatStage { stage: CampaignStage; title: string; kind: "record" | "knockout"; rounds: FormatRound[]; qualify_wins?: number; bye_wins?: number; bye_skips?: string }
export interface CarryRule { effect: string; scope: string; between_games: string; between_series: string; whole_run: string }
export interface CampaignFormat {
  format_id: string;
  title: string;
  calibration: string;
  best_of: number;
  length: { min_series: number; max_series: number; min_to_championship: number };
  stages: FormatStage[];
  bye: { extra_prep_slots: number; extra_recovery: number };
  carry_rules: CarryRule[];
}

export interface CurrentSeries {
  series_index: number;
  series_id: string;
  stage: CampaignStage;
  round: string;
  round_title: string;
  stakes: string;
  elimination_if_lost: boolean;
  bye: boolean;
  prep_slots: number;
  opponent: CampaignOpponent;
  series: { href: string; phase: string; status: string; seq: number; score: Score; games_played: number };
}

export interface Activity {
  activity: string;
  title: string;
  cost_slots: number;
  effects: string[];
  opportunity_cost: string;
  eligible: boolean;
  unavailable_reason: string | null;
  fields: string[];
}
export interface CampaignLocation { key: string; title: string; hosts: string; activities: Activity[] | string[]; series_actions: string[]; backstage_choices?: string[] }

export interface SeriesBreak { from_series: number; recovery: number; bye: boolean; reason: string }
export interface BetweenSeries {
  series_index: number;
  slots: number;
  bye: boolean;
  break: SeriesBreak | null;
  idle_day: string;
  locations: CampaignLocation[];
  commit: { kind: string; route: string; rule: string };
}

export interface Trait { trait: string; value: number; games_remaining: number }
export interface RosterPlayer {
  player_id: string;
  name: string;
  role: E1Role;
  core: boolean;
  stage_ratings?: number[];
  fatigue: number;
  fatigue_power: number;
  traits: (Trait | Record<string, unknown>)[];
  conditions?: Record<string, unknown>;
  practiced: { champion: string; value: number; source: string }[];
}
export interface CampaignRoster { as_of: "live" | "last_settled_series"; cohesion: number; players: RosterPlayer[]; series_index?: number; series_phase?: string }

export interface HistoryGame { game: number; winner: "you" | "opponent"; how: string; after_stage: string; players: Record<E1Role, string>; champions: Record<E1Role, string>; objectives: { category: string; correct_count: number; encounter_kind: string; event_id: string }[] }
export interface Standout { player_id: string; name: string; role: E1Role; series_index: number; contests_won: number; contests_played: number; share: number }
export interface HistoryEntry {
  series_index: number;
  series_id: string;
  stage: CampaignStage;
  round: string;
  round_title: string;
  opponent: CampaignOpponent;
  result: "won" | "lost";
  score: Score;
  games: HistoryGame[];
  decisions: { preparation: { activities: Record<string, unknown>[]; idle_days: number; slots: number } | null; tactics: { after_game: number; choice: string }[] };
  standout: Standout | null;
}

export interface Carried {
  series_index: number;
  prep_slots: number;
  cohesion: number;
  break: SeriesBreak;
  fatigue: { player_id: string; at_series_end: number; after_break: number }[];
  practiced: { player_id: string; champion: string; value: number; source: string }[];
  traits: { player_id: string; trait: string; value: number; games_remaining: number }[];
  conditions: { kind: string; player_id: string | null; value: number; games_remaining: number; source: string }[];
  expired_at_settlement: string[];
}
export interface Ending {
  kind: EndingKind;
  placement: string | null;
  text: string;
  series_index: number;
  stage: CampaignStage;
  round: string;
  round_title: string;
  opponent?: CampaignOpponent;
  opponent_id?: string;
  series_played: number;
  record: Partial<Record<CampaignStage, { wins: number; losses: number }>>;
  open_series_closed?: string;
}
export interface Transition {
  from_series: number;
  result: "won" | "lost";
  score: Score;
  standing: Partial<Record<CampaignStage, StageStanding>>;
  decided: { kind: "next_round"; round: string; byes: string[] } | { kind: "ending"; ending: Ending };
  carried: Carried | null;
}

export interface StoryBeat { kind: StoryBeatKind | string; series_index: number; text: string; evidence: Record<string, unknown> }
/** `rematch_of` lists the series indices of earlier meetings (verified live; the meetings themselves are in `rival`). */
export interface StoryStakes { series_index: number; round_title: string; stage: CampaignStage; bye: boolean; elimination_if_lost: boolean; rematch_of: number[]; stage_record: { wins: number; losses: number }; text: string }
export interface Story {
  label: string;
  beats: StoryBeat[];
  previous_series: { series_index: number; round_title: string; result: string; score: Score; opponent: CampaignOpponent; games: { game: number; winner: string; how: string }[] } | null;
  standouts: Standout[];
  fatigue_trend: { player_id: string; name: string; core: boolean; consecutive_rises: number; at_series_end: { series_index: number; fatigue: number }[] }[];
  champion_choices: { player_id: string; name: string; role: E1Role; champion: string; champion_name: string; games: number; wins: number; practiced: { series_index: number; source: string } | null; since_practice: { games: number; wins: number } | null }[];
  objectives: { encounters: number; questions: number; correct: number; perfect: number; by_series: { series_index: number; encounters: { game: number; category: string; correct_count: number }[] }[] } | null;
  /** `meetings` includes the open series, with `result`/`score` null until it is settled */
  rival: { kind: "rematch" | "beat_you"; opponent: CampaignOpponent; meetings: { series_index: number; round_title: string; result: string | null; score: Score | null }[] } | null;
  development: unknown[];
  stakes: StoryStakes | null;
}

export interface CampaignNext { kind: "play_series" | "settle_series"; series_id?: string; href?: string; series_phase?: string; payload?: { series_index: number }; note?: string }
export interface CampaignAction { kind: "abandon"; payload: { confirm: "abandon" }; note?: string }

export interface CampaignSnapshot {
  schema: typeof CAMPAIGN_SCHEMA;
  schema_revision: number;
  campaign_id: string;
  start_key: string;
  status: CampaignStatus;
  phase: CampaignPhase;
  seq: number;
  label: string;
  pins: Record<string, string>;
  format: CampaignFormat;
  standing: Partial<Record<CampaignStage, StageStanding>>;
  map: MapNode[];
  current_series: CurrentSeries | null;
  next_opponent: CampaignOpponent | null;
  between_series: BetweenSeries | null;
  locations: CampaignLocation[];
  /** null on a run that ended (abandoned) before any series was settled (verified live; not in the API doc) */
  roster: CampaignRoster | null;
  history: HistoryEntry[];
  last_transition: Transition | null;
  story: Story;
  ending: Ending | null;
  next: CampaignNext | null;
  actions: CampaignAction[];
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  /** action responses only */
  applied?: boolean;
  duplicate?: boolean;
  /** create responses only */
  created?: boolean;
}

/** A listing row. NOTE (verified live): `standing` is `{stage: [wins, losses]}` and `ending` is the kind string here. */
export interface CampaignRow {
  campaign_id: string;
  start_key: string;
  status: CampaignStatus;
  phase: CampaignPhase;
  seq: number;
  format_id: string;
  qualification_policy: string;
  standing: Partial<Record<CampaignStage, [number, number]>>;
  series_played: number;
  current_series: { series_index: number; round: string; opponent_id: string; series_id: string; series_phase: string; series_status: string } | null;
  ending: EndingKind | null;
  placement: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}
export interface CampaignList {
  schema: typeof CAMPAIGN_LIST_SCHEMA;
  scope: "owner";
  status: "active" | "all";
  count: number;
  campaigns: CampaignRow[];
  resume: { campaign_id: string | null; reason: "none" | "single" | "multiple" };
  order: string;
}

export class CampaignContractError extends Error { constructor(m: string) { super(m); this.name = "CampaignContractError"; } }

const PHASES: CampaignPhase[] = ["series", "series_result", "completed", "abandoned"];

/** Gate (UX-7 handoff §4.2): the campaign UI renders only this schema at revision ≥ 1, internally consistent. */
export function readCampaignSnapshot(json: unknown): CampaignSnapshot {
  const s = json as CampaignSnapshot | null;
  if (!s || typeof s !== "object") throw new CampaignContractError("campaign snapshot is not an object");
  if (s.schema !== CAMPAIGN_SCHEMA) throw new CampaignContractError(`unexpected campaign schema ${String(s.schema)}`);
  if (typeof s.schema_revision !== "number" || s.schema_revision < 1) throw new CampaignContractError("campaign schema_revision missing or < 1");
  if (typeof s.campaign_id !== "string" || typeof s.seq !== "number") throw new CampaignContractError("campaign id/seq missing");
  if (!PHASES.includes(s.phase)) throw new CampaignContractError(`unknown campaign phase ${String(s.phase)}`);
  if (!Array.isArray(s.map) || !Array.isArray(s.history) || !s.format || !s.story) throw new CampaignContractError("campaign snapshot is missing map/history/format/story");
  if ((s.phase === "series" || s.phase === "series_result" || s.history.length) && (!s.roster || !Array.isArray(s.roster.players))) throw new CampaignContractError("campaign snapshot without its roster");
  if (s.phase === "series" && (!s.current_series || s.next?.kind !== "play_series")) throw new CampaignContractError("phase series without an open series");
  if (s.phase === "series_result" && (!s.current_series || s.next?.kind !== "settle_series" || typeof s.next.payload?.series_index !== "number")) throw new CampaignContractError("phase series_result without a settle_series next");
  if ((s.phase === "completed" || s.phase === "abandoned") && (!s.ending || s.next !== null)) throw new CampaignContractError("an ended campaign without its ending");
  return s;
}

export function readCampaignList(json: unknown): CampaignList {
  const l = json as CampaignList | null;
  if (!l || l.schema !== CAMPAIGN_LIST_SCHEMA) throw new CampaignContractError(`unexpected campaign list schema ${String(l?.schema)}`);
  if (!Array.isArray(l.campaigns) || !l.resume || !["none", "single", "multiple"].includes(l.resume.reason)) throw new CampaignContractError("campaign list without campaigns/resume");
  if (l.resume.reason === "single" && typeof l.resume.campaign_id !== "string") throw new CampaignContractError("resume single without a campaign_id");
  return l;
}

// ── presentation only (names and tones; no rules)

export const STAGE_TITLE: Record<CampaignStage, string> = { regular: "Regional split", playoffs: "Regional playoffs", worlds: "Worlds" };
/** Each stage's identity: accent hue, room mood and stadium variant (presentation only). */
export const STAGE_IDENTITY: Record<CampaignStage, { accent: string; tone: "gold" | "cold"; kicker: string; ink: string }> = {
  regular: { accent: "#5cc8ea", tone: "cold", kicker: "Regional split", ink: "text-sky-200" },
  playoffs: { accent: "#ff9a5c", tone: "gold", kicker: "Knockout playoffs", ink: "text-orange-200" },
  worlds: { accent: "#b39cff", tone: "gold", kicker: "Worlds", ink: "text-violet-200" },
};
/** A stage the client does not know (a future format) keeps its served key and the split's look, instead of crashing. */
export const stageTitle = (s: string): string => STAGE_TITLE[s as CampaignStage] ?? s;
export const stageIdentity = (s: string) => STAGE_IDENTITY[s as CampaignStage] ?? STAGE_IDENTITY.regular;
export const MAP_STATUS_TEXT: Record<MapStatus, string> = {
  won: "Won", lost: "Lost", current: "Now", upcoming: "Ahead", skipped_bye: "Bye", not_reached: "Not reached", closed: "Closed",
};
/** "SYN Cobalt Vale" → "Cobalt Vale" (display only). */
export const oppShort = (name?: string | null) => (name ?? "").replace(/^SYN\s+/, "");
/** "syn_c1_duelist" → "Duelist" when the server sends no profile name. */
export const champName = (key: string) => key.replace(/^syn_c\d+_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
export const isActivityList = (a: Activity[] | string[]): a is Activity[] => a.length === 0 || typeof a[0] === "object";
