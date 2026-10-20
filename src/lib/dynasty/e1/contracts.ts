/**
 * UX-3 — typed contracts for the server-driven Dynasty BO5.
 *
 * Two kinds of type live here and they must not be confused:
 *
 *  VERIFIED  `E1Snapshot` and its parts mirror `dynasty.combat_v2.events.snapshot.e1`
 *            exactly as produced by backend commit 786dc81b
 *            (`dynasty/combat_v2/events/snapshot.py`, documented in
 *            `docs/roguelike/WORLDS_DYNASTY_EVENTS_E1_SNAPSHOT_API.md`). The
 *            recorded fixture `fixtures/ux3-bo5.json` is checked against them
 *            in `e1.contract.test.ts`.
 *
 *  PENDING   `SeriesView`, `ObjectiveSessionView` and the transport methods
 *            that carry them have NO backend implementation. Their shape follows
 *            the E2A proposal (`WORLDS_DYNASTY_EVENTS_E2A_OBJECTIVE_CONTRACT.md`
 *            §C8 objective states, §5 open/read/settle routes) and the E1 BO5
 *            convention (independent games, first to three). They are served by
 *            the in-browser contract double only. Every pending shape carries an
 *            `authority` marker so the UI can label it.
 */

export const E1_SNAPSHOT_SCHEMA = "dynasty.combat_v2.events.snapshot.e1" as const;

// ───────────────────────────────────────────── VERIFIED: E1 snapshot

export type E1Stage = "early" | "mid" | "late";
export type E1Side = "you" | "opponent";
export type E1Role = "top" | "jng" | "mid" | "bot" | "sup";
export type E1Phase =
  | "stage_open" | "pre_score" | "scoring" | "stage_published"
  | "post_stage" | "awaiting_objective" | "settled";
export type E1Beat =
  | "stage_open" | "event_revealed" | "contests" | "stage_tally" | "post_stage"
  | "objective_prompt" | "objective_result" | "slot_cancelled" | "no_eligible_event"
  | "stage_closed" | "settlement";
export type E1OutcomeLabel = "Losing" | "Kinda losing" | "Even" | "Kinda winning" | "Winning";
export type E1SettleHow = "double_winning_closeout" | "objective_closeout" | "late_decides";
export type E1ObjectiveCategory = "baron_ace_closeout" | "baron_with_trades" | "baron_heavy_losses" | "enemy_baron_team_wiped";

export interface E1Component { source: string; label: string; value: number; evidence_type: string }

export interface E1Contest {
  kind: "positional" | "team";
  role: E1Role | null;
  points: 1 | 2;
  you_label: string;
  opponent_label: string;
  p_you: number;
  roll: number;
  roll_for: E1Side;
  roll_threshold: number;
  winner: E1Side;
  upset: boolean;
  /** detail=true only */
  you_power?: number;
  opponent_power?: number;
  you_components?: E1Component[];
  opponent_components?: E1Component[];
}

export interface E1StageTally {
  stage: E1Stage;
  you_points: number;
  opponent_points: number;
  winner: E1Side;
  /** Early/Mid only; null for Late */
  outcome_label: E1OutcomeLabel | null;
  carry_in_you: number;
  carry_out_you: number;
  contests: E1Contest[];
}

export interface E1Effect {
  effect_id?: string;
  channel: "current_stage" | "next_stage" | "persistent" | "game";
  kind: string;
  for: E1Side;
  role: E1Role | null;
  player_id?: string | null;
  value_requested?: number;
  value_applied?: number;
  value?: number;
  capped?: boolean;
  target_stage?: E1Stage | null;
  duration_games: number;
  status?: "applied" | "scheduled" | "expired" | "pending" | "settled";
  note: string;
  evidence_type?: string;
}

export interface E1Event {
  order: number;
  instance_id: string;
  event_id: string;
  version: number;
  title: string;
  kind: "small" | "major";
  stage: E1Stage;
  checkpoint: "pre_score" | "post_stage";
  subject: E1Side;
  role: E1Role | null;
  resolution: "contest_role" | "contest_team" | "contest_stage_points" | "weighted" | "objective";
  probability_subject: number | null;
  outcome: { option_id: string; correct_count: number | null; category: E1ObjectiveCategory | null };
  narrative: string;
  explanation: { short: string; details: string[]; draws: [string, number][] };
  evidence_type: string;
  provenance: string;
  reveal: string;
  effects: E1Effect[];
}

export interface E1ObjectiveOutcome {
  correct_count: 0 | 1 | 2 | 3;
  category: E1ObjectiveCategory;
  intent: string;
  ends_game: boolean;
  effects: E1Effect[];
}

export interface E1Objective {
  state: "awaiting_answer";
  encounter_id: string;
  event_id: string;
  title: string;
  stage: E1Stage;
  answering: E1Side;
  encounter_kind: "baron_three_question";
  question_count: 3;
  closeout_on_perfect: boolean;
  qualification: string;
  /** null in E1: E2 hosts the real questions */
  questions: null;
  action: { type: string; encounter_id: string; fields: Record<string, string> };
  outcomes: E1ObjectiveOutcome[];
}

export interface E1BeatEntry { seq: number; beat: E1Beat; stage: E1Stage; ref: string | null; phase: E1Phase }

export interface E1Slot { stage: E1Stage; slot: "small" | "major"; checkpoint: string; state: string; event: string | null; reason: string | null }

export interface E1Settlement { winner: E1Side; how: E1SettleHow; after_stage: E1Stage; source_event: string | null }

export interface E1Snapshot {
  schema: typeof E1_SNAPSHOT_SCHEMA;
  label: string;
  provenance: string;
  pins: Record<string, string>;
  game: { you: string; you_name: string; opponent: string; opponent_name: string; viewer_is_user: boolean };
  phase: E1Phase;
  stage: E1Stage;
  seq: number;
  state_digest: string;
  next: { can_advance: boolean; needs: "objective_answer" | null };
  stages: E1StageTally[];
  events: E1Event[];
  objective: E1Objective | null;
  slots: E1Slot[];
  consequences: { note: string; pending: E1Effect[] };
  settlement: E1Settlement | null;
  beats: E1BeatEntry[];
}

// ───────────────────────────────────────────── recorded fixture (verified provenance)

export interface FixtureChampion { key: string; name: string; class: string; capabilities: string[]; damage: string; ratings: [number, number, number] }
export interface FixtureLineup { lineup_id: string; title: string; roles: E1Role[]; champions: FixtureChampion[]; player_ratings: [number, number, number] }

// ───────────────────────────────────────────── PENDING: series + objective hosting

/** Who would own this state in production. Shown in the UI next to pending data. */
export type Authority =
  | "e1_snapshot"          // verified backend read model
  | "pending_run2_series"  // no persisted Combat v2 series exists (RUN-2)
  | "pending_e2_objective" // no objective host exists (E2B)
  | "pending_e3_state";    // no between-game state engine exists (E3)

export interface SeriesGameView {
  index: number;
  lineup_id: string;
  winner: E1Side;
  how: E1SettleHow;
  after_stage: E1Stage;
  /** your points per published stage, in order */
  points: number[];
  labels: (E1OutcomeLabel | null)[];
  objective: { correct_count: number; category: E1ObjectiveCategory } | null;
  /** E1 typed persistent effects from this game: pending, applied to nothing (E3) */
  pending_consequences: E1Effect[];
  /** the between-game decision recorded after this game, if any */
  decision: string | null;
}

export type SeriesStatus = "prep" | "drafting" | "in_game" | "between_games" | "complete";

export interface SeriesView {
  authority: "pending_run2_series";
  series_id: string;
  /** monotonically increasing; every mutation must quote the current value */
  rev: number;
  status: SeriesStatus;
  best_of: 5;
  wins_needed: 3;
  wins: number;
  losses: number;
  /** 1-based index of the game being drafted or played; null when complete */
  current_game: number | null;
  current_lineup: string | null;
  games: SeriesGameView[];
  winner: E1Side | null;
  team: { team_id: string; name: string };
  opponent: { team_id: string; name: string; lineup: FixtureLineup };
  /** legal lineups for the current draft */
  legal_lineups: FixtureLineup[];
  plan: string | null;
  policy: { policy_id: string; catalog_id: string; status: string };
}

export type QuestionState = "pending" | "answering" | "locked" | "revealed_correct" | "revealed_incorrect" | "timed_out";

/** E2A §C8. Question content would come from the Ranked child match's public projection. */
export interface ObjectiveQuestionView {
  index: number;
  state: QuestionState;
  /** public view only: prompt and options, never a correct value */
  prompt: string | null;
  options: string[] | null;
  /** your choice once locked */
  chosen: number | null;
}

export interface ObjectiveSessionView {
  authority: "pending_e2_objective";
  encounter_id: string;
  state: "offered" | "launching" | "in_progress" | "graded" | "settled";
  child_match_id: string | null;
  question_index: number;
  questions: ObjectiveQuestionView[];
  graded: { correct_count: number; category: E1ObjectiveCategory } | null;
  content_label: string;
}

export interface SeriesEnvelope {
  series: SeriesView;
  /** latest E1 snapshot of the current (or just finished) game */
  game: E1Snapshot | null;
  objective: ObjectiveSessionView | null;
}

export type TransportErrorCode =
  | "STALE_REVISION"      // the caller quoted an old rev; envelope carries the fresh state
  | "ILLEGAL_LINEUP"
  | "NOT_ALLOWED"         // wrong phase for this action
  | "ENCOUNTER_MISMATCH"
  | "ALREADY_ANSWERED"
  | "UNSUPPORTED_OBJECTIVE"
  | "NETWORK"
  | "SERVER";

export class TransportError extends Error {
  constructor(public code: TransportErrorCode, message: string, public fresh?: SeriesEnvelope) {
    super(message);
    this.name = "TransportError";
  }
}

export const BETWEEN_GAME_DECISIONS = [
  { id: "keep_plan", kind: "tactical", title: "Keep the plan", blurb: "Draft the same lineup plan next game.", authoritative: true },
  { id: "switch_plan", kind: "tactical", title: "Change the plan", blurb: "Pick a different legal lineup in the next draft.", authoritative: true },
  { id: "recovery_rest", kind: "recovery", title: "Rest and reset", blurb: "Clear fatigue and confidence swings before the next game.", authoritative: false },
] as const;
export type BetweenGameDecisionId = (typeof BETWEEN_GAME_DECISIONS)[number]["id"];
