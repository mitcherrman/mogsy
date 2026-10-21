/**
 * UX-4/UX-5 — the E2 series snapshot `dynasty.combat_v2.series.snapshot.e2`, as
 * served by the backend's `routes/dynasty_series.py` (`/api/admin/dynasty/v2`,
 * commit b022b21a; revision 2 = bb5bc111, documented in
 * `docs/roguelike/WORLDS_DYNASTY_E2_API.md` §7).
 *
 * Revision 2 is additive under the same schema id: `schema_revision: 2`,
 * `current_game.objective_results` (every settled encounter with all three
 * answers' feedback), `games[].objectives[].questions`, the owner-scoped
 * `GET /series` discovery listing and `when_unfinished_exists` on create.
 * Rev-1 snapshots (no `schema_revision`) still parse; the rev-2 parts are
 * then simply absent.
 *
 * Revision 3 (UX-6) is an E3A management series (backend bc928207): the same
 * schema id with `schema_revision: 3`, a top-level `management` block
 * (`e3acontracts.ts`), the phases `preparation` and `tactics`, the actions
 * `commit_preparation` and `choose_tactic`, and lineup players. E2 series stay
 * revision 2 and are read exactly as before.
 *
 * Only the fields the live transport reads are typed. `current_game` is the E1
 * game snapshot (`E1Snapshot`) with E2's objective block in place of E1's.
 * `readE2Snapshot` refuses anything that is not this schema, so a drifted
 * response fails loudly instead of rendering half a game.
 */
import type { E3aLineupExtras, E3aManagement, E3aScenario } from "./e3acontracts";
import { readE3aManagement } from "./e3acontracts";
import type { E1Effect, E1ObjectiveCategory, E1ObjectiveOutcome, E1OutcomeLabel, E1Role, E1SettleHow, E1Side, E1Snapshot, E1Stage } from "./contracts";

export const E2_SERIES_SCHEMA = "dynasty.combat_v2.series.snapshot.e2" as const;
export const E2_SERIES_LIST_SCHEMA = "dynasty.combat_v2.series.list.e2" as const;
export const E2_API = "/api/admin/dynasty/v2";

export type E2Phase = "lineup" | "game" | "objective" | "completed" | "preparation" | "tactics";
export type E2ActionKind = "lock_lineup" | "advance" | "open_objective" | "answer_objective" | "commit_preparation" | "choose_tactic";
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
/** Rev 2: one settled encounter of the shown game, immutable once sealed (API §7.1). */
export interface E2ObjectiveResult extends E2Encounter {
  state: "settled";
  grade: NonNullable<E2Encounter["grade"]>;
  /** the E1 event in `current_game.events[]` the grade became (read effects there) */
  event_instance_id: string;
  /** `seq` of the `objective_result` beat in `current_game.beats[]` */
  result_beat_seq: number;
  ends_game: boolean;
  retention: "current_game";
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
export type E2Game = Omit<E1Snapshot, "objective"> & { game_index: number; objective: E2Objective | null; objective_results?: E2ObjectiveResult[] };

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
  /** E3A: the squad players fielded and the management inputs at the start of this game */
  players?: { you: Record<E1Role, string>; opponent: Record<E1Role, string> };
  management_at_start?: unknown;
}
export interface E2Consumed { source: string; effect_id: string; game: number; consumed_for_game: number; duration_games: number; for: E1Side; team_id: string; player_id: string | null; kind: string; value: number; note: string }

export interface E2SeriesSnapshot {
  schema: typeof E2_SERIES_SCHEMA;
  /** 2 from the rev-2 backend; absent on rev 1 */
  schema_revision?: number;
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
  lineup: ({ game: number; suggested: E2Lineup; opponent: E2Lineup; champion_pool: E2Champion[]; rule: string } & Partial<E3aLineupExtras>) | null;
  current_game: E2Game | null;
  between_games: { last: Record<string, unknown> | null; active_conditions: unknown[]; consumed: E2Consumed[]; applies_to_next_game: Record<string, unknown>; note: string };
  result: { winner: E1Side; score: { you: number; opponent: number }; games: { game: number; winner: E1Side; how: E1SettleHow }[] } | null;
  next: { kind: E2ActionKind; payload: Record<string, unknown> } | null;
  /** revision 3 (E3A series) only */
  management?: E3aManagement;
  /** action responses only */
  applied?: boolean;
  duplicate?: boolean;
  /** create responses only */
  created?: boolean;
}

/** Rev 2: a row of `GET /series` (light, from the row cache; no seed, no question content). */
export interface E2SeriesListRow {
  series_id: string;
  start_key: string;
  status: "active";
  phase: E2Phase;
  seq: number;
  score: { you: number; opponent: number };
  games_started: number;
  qualification_policy: string;
  user_preset: string;
  opponent_preset: string;
  /** E3A series only */
  management_rules?: string;
  entry_scenario?: E3aScenario;
  created_at: string;
  updated_at: string;
}
export interface E2SeriesList {
  schema: typeof E2_SERIES_LIST_SCHEMA;
  scope: "owner";
  status: "active";
  count: number;
  order: string;
  /** `multiple` never names a series: the owner must choose */
  resume: { series_id: string | null; reason: "none" | "single" | "multiple" };
  series: E2SeriesListRow[];
}

export interface E2ActionRequest { expected_seq: number; action_id: string; kind: E2ActionKind; payload: Record<string, unknown> }

export class E2ContractError extends Error {
  constructor(message: string) { super(message); this.name = "E2ContractError"; }
}

const PHASES: ReadonlySet<string> = new Set(["lineup", "game", "objective", "completed", "preparation", "tactics"]);
const E3A_PHASES: ReadonlySet<string> = new Set(["preparation", "tactics"]);

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
  if (s.schema_revision !== undefined && typeof s.schema_revision !== "number") throw new E2ContractError("schema_revision is not a number");
  if ((s.schema_revision ?? 1) >= 2 && s.current_game && !Array.isArray(s.current_game.objective_results)) throw new E2ContractError("rev 2 current_game without objective_results");
  // Revision 3: an E3A management series. The management block must be whole; its phases need it.
  const managed = (s.schema_revision ?? 1) >= 3;
  if (managed !== (s.management !== undefined)) throw new E2ContractError(managed ? "rev 3 without management" : "management on a pre-rev-3 snapshot");
  if (!managed && E3A_PHASES.has(String(s.phase))) throw new E2ContractError(`phase ${s.phase} on a series without management`);
  if (managed) {
    try { readE3aManagement(s.management); } catch (e) { throw new E2ContractError(e instanceof Error ? e.message : "unreadable management"); }
    if (s.phase === "tactics" && !s.current_game) throw new E2ContractError("phase tactics without the settled game");
    if (s.phase === "lineup" && (!s.lineup?.players_by_role || !s.lineup.suggested_players || !s.lineup.preview)) throw new E2ContractError("E3A lineup without players_by_role/suggested_players/preview");
  }
  return s as E2SeriesSnapshot;
}

/** Revision of a snapshot (1 when the field is absent). */
export const revisionOf = (s: E2SeriesSnapshot): number => s.schema_revision ?? 1;
/** UX-6 gate (E3A API §5.1): the management UI renders only for revision ≥ 3 with a management block. */
export const isManaged = (s: E2SeriesSnapshot): boolean => revisionOf(s) >= 3 && !!s.management;

/** Accept only a rev-2 discovery listing whose `resume` agrees with its rows. */
export function readE2SeriesList(body: unknown): E2SeriesList {
  const l = body as Partial<E2SeriesList> | null;
  if (!l || typeof l !== "object") throw new E2ContractError("not an object");
  if (l.schema !== E2_SERIES_LIST_SCHEMA) throw new E2ContractError(`unexpected schema ${String(l.schema)}`);
  if (!Array.isArray(l.series) || !l.resume || typeof l.count !== "number" || l.count !== l.series.length) throw new E2ContractError("series/resume/count missing");
  const want = l.count === 0 ? "none" : l.count === 1 ? "single" : "multiple";
  if (l.resume.reason !== want) throw new E2ContractError(`resume.reason ${String(l.resume.reason)} for ${l.count} series`);
  if (want === "single" && l.resume.series_id !== l.series[0].series_id) throw new E2ContractError("resume.series_id does not match the single row");
  if (want !== "single" && l.resume.series_id !== null) throw new E2ContractError("resume.series_id must be null unless single");
  return l as E2SeriesList;
}

export type { E1Effect };
