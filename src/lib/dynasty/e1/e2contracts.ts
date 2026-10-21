/**
 * UX-4 — the E2 series snapshot `dynasty.combat_v2.series.snapshot.e2`, as
 * served by the backend's `routes/dynasty_series.py` (`/api/admin/dynasty/v2`,
 * commit b022b21a, documented in `docs/roguelike/WORLDS_DYNASTY_E2_API.md`).
 *
 * Only the fields the live transport reads are typed. `current_game` is the E1
 * game snapshot (`E1Snapshot`) with E2's objective block in place of E1's.
 * `readE2Snapshot` refuses anything that is not this schema, so a drifted
 * response fails loudly instead of rendering half a game.
 */
import type { E1Effect, E1ObjectiveCategory, E1ObjectiveOutcome, E1OutcomeLabel, E1Role, E1SettleHow, E1Side, E1Snapshot, E1Stage } from "./contracts";

export const E2_SERIES_SCHEMA = "dynasty.combat_v2.series.snapshot.e2" as const;
export const E2_API = "/api/admin/dynasty/v2";

export type E2Phase = "lineup" | "game" | "objective" | "completed";
export type E2ActionKind = "lock_lineup" | "advance" | "open_objective" | "answer_objective";
export type E2QualificationPolicy = "broad_mid_win" | "narrow_early_mid_combo";
export type E2Preset = "early" | "scaling" | "balanced" | "balanced2";

export interface E2Option { option_id: string; text: string }
export interface E2Question {
  question_id: string;
  index: number;
  state: "current" | "locked" | "answered";
  prompt?: string;
  category?: string;
  options?: E2Option[];
  presentation?: unknown;
  feedback?: { your_option_id: string; correct: boolean; correct_option_id: string };
}
export interface E2Encounter {
  state: "in_progress" | "settled";
  encounter_id: string;
  event_id: string;
  encounter_kind: string;
  stage: E1Stage;
  question_count: number;
  answered: number;
  current_question_id: string | null;
  questions: E2Question[];
  grade?: { correct_count: number; category: E1ObjectiveCategory; digest: string; grader_version: string };
}
/** E2's `current_game.objective`: E1's prompt with the hosted encounter. */
export interface E2Objective {
  state: "offered" | "in_progress" | "settled";
  encounter_id: string;
  event_id: string;
  title: string;
  stage: E1Stage;
  answering: E1Side;
  encounter_kind: string;
  question_count: number;
  closeout_on_perfect: boolean;
  qualification: string;
  outcomes: E1ObjectiveOutcome[];
  questions: E2Question[] | null;
  encounter?: E2Encounter;
  grading: { by: "server"; grader_version: string; question_set_id: string; note?: string };
  action: { kind: E2ActionKind; payload: Record<string, unknown> };
}
export type E2Game = Omit<E1Snapshot, "objective"> & { game_index: number; objective: E2Objective | null };

export interface E2Champion { key: string; name: string; composition: { class: string; capabilities: string[]; damage: string } | null; phase_ratings: [number, number, number] }
export interface E2Player { player_id: string; role: E1Role; name: string; phase_ratings: [number, number, number]; evidence_type: string }
export interface E2Team { team_id: string; name: string; preset: E2Preset; preset_title: string; players: E2Player[] }
export type E2Lineup = Record<E1Role, string>;
export interface E2GameSummary {
  game: number;
  phase: string;
  lineup: { you: E2Lineup; opponent: E2Lineup };
  settled: boolean;
  winner: E1Side | null;
  how: E1SettleHow | null;
  after_stage: E1Stage | null;
  stages: { stage: E1Stage; you_points: number; opponent_points: number; outcome_label: E1OutcomeLabel | null }[];
  objectives: { encounter_id: string; event_id: string; state: "in_progress" | "settled"; correct_count: number | null; category: E1ObjectiveCategory | null }[];
  conditions_at_start: Record<string, unknown>;
}
export interface E2Consumed { source: string; effect_id: string; game: number; consumed_for_game: number; duration_games: number; for: E1Side; team_id: string; player_id: string | null; kind: string; value: number; note: string }

export interface E2SeriesSnapshot {
  schema: typeof E2_SERIES_SCHEMA;
  label: string;
  series_id: string;
  start_key: string;
  status: "active" | "completed";
  seq: number;
  phase: E2Phase;
  pins: Record<string, string>;
  format: { best_of: number; wins_needed: number; draft_rule: string };
  score: { you: number; opponent: number };
  teams: { you: E2Team; opponent: E2Team };
  games: E2GameSummary[];
  lineup: { game: number; suggested: E2Lineup; opponent: E2Lineup; champion_pool: E2Champion[]; rule: string } | null;
  current_game: E2Game | null;
  between_games: { last: Record<string, unknown> | null; active_conditions: unknown[]; consumed: E2Consumed[]; applies_to_next_game: Record<string, unknown>; note: string };
  result: { winner: E1Side; score: { you: number; opponent: number }; games: { game: number; winner: E1Side; how: E1SettleHow }[] } | null;
  next: { kind: E2ActionKind; payload: Record<string, unknown> } | null;
  /** action responses only */
  applied?: boolean;
  duplicate?: boolean;
  /** create responses only */
  created?: boolean;
}

export interface E2ActionRequest { expected_seq: number; action_id: string; kind: E2ActionKind; payload: Record<string, unknown> }

export class E2ContractError extends Error {
  constructor(message: string) { super(message); this.name = "E2ContractError"; }
}

const PHASES: ReadonlySet<string> = new Set(["lineup", "game", "objective", "completed"]);

/** Accept only an e2 series snapshot whose phase-dependent parts are present. */
export function readE2Snapshot(body: unknown): E2SeriesSnapshot {
  const s = body as Partial<E2SeriesSnapshot> | null;
  if (!s || typeof s !== "object") throw new E2ContractError("not an object");
  if (s.schema !== E2_SERIES_SCHEMA) throw new E2ContractError(`unexpected schema ${String(s.schema)}`);
  if (typeof s.series_id !== "string" || typeof s.seq !== "number") throw new E2ContractError("series_id/seq missing");
  if (!PHASES.has(String(s.phase))) throw new E2ContractError(`unknown phase ${String(s.phase)}`);
  if (!s.teams?.you || !s.teams?.opponent || !Array.isArray(s.games) || !s.score) throw new E2ContractError("teams/games/score missing");
  if (s.phase === "lineup" && !s.lineup) throw new E2ContractError("phase lineup without lineup");
  if ((s.phase === "game" || s.phase === "objective") && !s.current_game) throw new E2ContractError(`phase ${s.phase} without current_game`);
  if (s.phase === "objective" && !s.current_game?.objective) throw new E2ContractError("phase objective without an objective");
  if (s.phase === "completed" && !s.result) throw new E2ContractError("completed without result");
  return s as E2SeriesSnapshot;
}

export type { E1Effect };
