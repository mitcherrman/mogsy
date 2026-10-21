/**
 * UX-6 — the E3A management block of an E3A series snapshot
 * (`dynasty.combat_v2.management.snapshot.e3a`, backend commit bc928207 on
 * `roguelike/wd-v2-e3a-management`; contract `docs/roguelike/WORLDS_DYNASTY_E3A_API.md`).
 *
 * An E3A series reports `schema_revision: 3` under the same e2 snapshot schema
 * and carries `management`, the phases `preparation` and `tactics`, and lineup
 * players. An e2 series is unchanged (revision 2, no `management`).
 *
 * The client renders this block and sends the action in `next`, or one built
 * from an option the server marked `eligible`. It never computes fatigue,
 * power, cohesion or eligibility: every number below is the server's.
 */
import type { E1Component, E1Role, E1Side, E1Stage } from "./contracts";

export const MANAGEMENT_SCHEMA = "dynasty.combat_v2.management.snapshot.e3a" as const;
export const MANAGEMENT_RULES_E3A = "dynasty.combat_v2.management.rules.e3a" as const;
/** The create field `entry_scenario` (API §1; the server has no listing route for them). */
export const ENTRY_SCENARIOS = ["congested_schedule", "fresh"] as const;
export type E3aScenario = (typeof ENTRY_SCENARIOS)[number];
export const SCENARIO_TITLE: Record<E3aScenario, string> = {
  congested_schedule: "Congested schedule",
  fresh: "Fresh squad",
};

export type E3aScope = "permanent" | "series" | "game" | "temporary";
export type E3aActivityKind = "rest" | "scrim" | "champion_practice" | "vod_review";
export type E3aTacticChoice = "breather" | "quick_review" | "none";

/** One entry of `commit_preparation.payload.activities`, with exactly the fields the activity takes. */
export type E3aActivity =
  | { activity: "rest" }
  | { activity: "scrim" }
  | { activity: "champion_practice"; player_id: string; champion: string }
  | { activity: "vod_review"; focus_stage: E1Stage };

export interface E3aTrait { trait: string; value: number; games_remaining: number; source: string }
export interface E3aModifier { source: string; value: number; stages: E1Stage[]; origin?: string; scope?: E3aScope }
export interface E3aProficiency { champion: string; value: number; practiced_by: string | null }
export type E3aStagePower = Record<E1Stage, number>;

/** §3.1 a squad player row (both teams; `proficiency` and `substitute_cohesion_cost` are yours only). */
export interface E3aPlayerRow {
  player_id: string;
  name: string;
  role: E1Role;
  core: boolean;
  stage_ratings: [number, number, number];
  fatigue: number;
  fatigue_power: number;
  traits: E3aTrait[];
  conditions: Record<string, number>;
  modifiers_if_starting: E3aModifier[];
  net_management_power: E3aStagePower;
  proficiency?: E3aProficiency[];
  substitute_cohesion_cost?: number;
}

/** §3.2 one change-ledger entry. */
export interface E3aLedgerEntry {
  n: number;
  at: string;
  source: string;
  target: string;
  team: string;
  variable: string;
  /** null when the variable did not exist before (a trait gained) or ended (an expiry); traits count games remaining */
  before: number | null;
  after: number | null;
  delta: number | null;
  /** traits: the positional power the trait grants */
  value?: number;
  champion?: string;
  scope: E3aScope;
  reason: string;
  requested?: number;
  clamped?: boolean;
}

/** One active effect (exactly one scope). */
export interface E3aEffect {
  scope: E3aScope;
  kind: string;
  for: E1Side | null;
  target: string;
  value: number;
  source?: string;
  stage?: E1Stage | null;
  champion?: string;
  for_game?: number | null;
  games_remaining?: number;
  power?: number;
  combat?: string;
  decay?: string;
  evidence_type?: string;
}

export interface E3aPrepOption {
  activity: E3aActivityKind;
  title: string;
  cost_slots: number;
  effects: string[];
  opportunity_cost: string;
  fields: string[];
  eligible: boolean;
  unavailable_reason: string | null;
}
export interface E3aTacticOption {
  choice: E3aTacticChoice;
  title: string;
  effects: string[];
  scope: E3aScope | null;
  focus_stage?: E1Stage;
  eligible: boolean;
  unavailable_reason: string | null;
  opportunity_cost: string;
}
export interface E3aDecisions {
  phase: string;
  preparation: {
    slots: number;
    /** preparation phase only */
    options?: E3aPrepOption[];
    idle_day?: string;
    rule?: string;
    /** after the plan is applied */
    committed?: { activities: E3aActivity[]; idle_days: number; slots: number } | null;
  };
  /** tactics phase only */
  tactics?: { after_game: number; options: E3aTacticOption[] };
  tactics_taken: { after_game: number; choice: E3aTacticChoice }[];
}

/** §3.3 the explanation of the roster the server built for a game. */
export interface E3aCombatPlayer {
  player_id: string;
  name: string;
  role: E1Role;
  core: boolean;
  champion: string;
  on_pool: boolean;
  fatigue: number;
  modifiers: E3aModifier[];
  net_management_power: E3aStagePower;
  proficiency: number;
  proficiency_power: number;
  stage_ratings: [number, number, number];
  traits: E3aTrait[];
  evidence_type: string;
}
export interface E3aCohesion { base: number; effective: number; substitute_cost: number; substitutes: number; team_power: number }
export interface E3aCombatTeam { cohesion: E3aCohesion; managed: boolean; players: E3aCombatPlayer[]; team_modifiers: E3aModifier[] }
export interface E3aCombatInputs {
  game?: number;
  players?: { you: Record<E1Role, string>; opponent: Record<E1Role, string> };
  you: E3aCombatTeam;
  opponent: E3aCombatTeam;
  how_to_read?: string;
}

export interface E3aCarryOut {
  note: string;
  permanent: { cohesion: number; practiced_proficiency: { player_id: string; champion: string; proficiency: number; source: string }[] };
  temporary: {
    fatigue: { player_id: string; now: number; after_series_break: number }[];
    traits: { player_id: string; trait: string; games_remaining: number }[];
    conditions: E3aEffect[];
  };
  expire_with_series: E3aEffect[];
}

export interface E3aScenarioRecord { key: string; title: string; core_fatigue: number; reserve_fatigue: number; cohesion: number; opponent_fatigue: number; opponent_cohesion: number }

export interface E3aManagement {
  schema: typeof MANAGEMENT_SCHEMA;
  digest: string;
  rules: { version: string; digest: string; calibration: string; values: Record<string, number | string> };
  squad: { squad_id: string; digest: string; label: string };
  entry_scenario: E3aScenarioRecord;
  scopes: { scope: E3aScope; meaning: string }[];
  you: { cohesion: number; players: E3aPlayerRow[] };
  opponent: { cohesion: number; managed: false; players: E3aPlayerRow[] };
  effects: E3aEffect[];
  recent_changes: { groups: string[]; entries: E3aLedgerEntry[] };
  ledger: E3aLedgerEntry[];
  decisions: E3aDecisions;
  combat_inputs: E3aCombatInputs | null;
  carry_over: { from_entry: E3aLedgerEntry[]; carry_out: E3aCarryOut };
}

/** The E3A additions to the `lineup` step (§3.1). */
export interface E3aLineupExtras {
  players_by_role: Record<E1Role, E3aPlayerRow[]>;
  suggested_players: Record<E1Role, string>;
  /** the exact combat inputs of the SUGGESTED five on the SUGGESTED champions (no preview for other lineups: owner decision U6) */
  preview: E3aCombatInputs;
}

// ───────────────────────────────────────────── presentation helpers (no rules)

export const STAGES: E1Stage[] = ["early", "mid", "late"];

/** A contest component that came from management state (API §3.3). */
export const isManagementComponent = (c: E1Component): boolean =>
  c.evidence_type === "management_state" || c.source.startsWith("modifier:e3a.");

/** What a `modifier:e3a.*` / `e3a.*` source names (parsed from the server's own source id). */
export function parseManagementSource(source: string): { kind: string; player_id: string | null; stage: E1Stage | null } {
  const s = source.replace(/^modifier:/, "").replace(/^e3a\./, "");
  const [kind, ...rest] = s.split(":");
  if (kind === "vod_review" || kind === "quick_review") return { kind, player_id: null, stage: (rest[0] as E1Stage) ?? null };
  if (kind === "cap") return { kind, player_id: rest[0] ?? null, stage: (rest[1] as E1Stage) ?? null };
  return { kind, player_id: rest[0] ?? null, stage: null };
}

/** Copy for a management source kind. Names only: every value shown next to it is the server's. */
export const SOURCE_TITLE: Record<string, string> = {
  fatigue: "Fatigue",
  confidence: "Confidence",
  overconfidence: "Overconfidence",
  "trait.in_form": "In form",
  "trait.rattled": "Rattled",
  cap: "Management cap",
  vod_review: "VOD review",
  quick_review: "Quick review",
};
export const sourceTitle = (source: string): string => SOURCE_TITLE[parseManagementSource(source).kind] ?? source;

export const ACTIVITY_SCENE: Record<E3aActivityKind | "idle", "hq" | "practice" | "warroom"> = {
  rest: "hq", idle: "hq", scrim: "practice", champion_practice: "practice", vod_review: "warroom",
};

export const VARIABLE_TITLE = (v: string): string =>
  v === "fatigue" ? "Fatigue" : v === "cohesion" ? "Cohesion"
    : v.startsWith("proficiency.") ? `Proficiency · ${champTitle(v.slice(12))}`
    : v.startsWith("trait.") ? `Trait · ${v.slice(6).replace("_", " ")}`
    : v.startsWith("team_power.") ? `Team power · ${v.slice(11)}` : v;

/** `syn_c1_artillery` → `SYN Artillery` (the catalog name when no profile is cached). */
export const champTitle = (key: string): string =>
  `SYN ${key.replace(/^syn_c\d+_/, "").replace(/(^|_)(\w)/g, (_, s: string, c: string) => `${s ? " " : ""}${c.toUpperCase()}`)}`;

/** Ledger values: cohesion and proficiency are hundredths on the server (`before`/`after`); fatigue is 0..100. */
export const ledgerValue = (variable: string, v: number | null): string => v === null ? "—" :
  variable === "cohesion" || variable.startsWith("proficiency.") ? (v / 100).toFixed(2)
    : variable.startsWith("team_power.") || variable.startsWith("trait.") ? (v > 0 ? `+${v}` : `${v}`) : String(v);

export const signed = (v: number, digits = 1): string => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(digits)}`;

/** Find a squad player row by id (yours or the opponent's). */
export function playerRow(m: E3aManagement, pid: string | null | undefined): E3aPlayerRow | undefined {
  if (!pid) return undefined;
  return m.you.players.find((p) => p.player_id === pid) ?? m.opponent.players.find((p) => p.player_id === pid);
}
export const playerName = (m: E3aManagement, pid: string | null | undefined): string =>
  playerRow(m, pid)?.name ?? (pid === "t_user" ? "Your team" : pid === "t_opp" ? "Opponent" : pid ?? "");

export class E3aContractError extends Error {
  constructor(message: string) { super(message); this.name = "E3aContractError"; }
}

/** Accept only a management block with the parts the UI reads. */
export function readE3aManagement(body: unknown): E3aManagement {
  const m = body as Partial<E3aManagement> | null;
  if (!m || typeof m !== "object") throw new E3aContractError("management is not an object");
  if (m.schema !== MANAGEMENT_SCHEMA) throw new E3aContractError(`unexpected management schema ${String(m.schema)}`);
  if (!m.you?.players?.length || !m.opponent?.players || !Array.isArray(m.effects) || !Array.isArray(m.ledger)) throw new E3aContractError("management squads/effects/ledger missing");
  if (!m.decisions?.preparation || !m.recent_changes || !m.carry_over || !Array.isArray(m.scopes)) throw new E3aContractError("management decisions/recent_changes/carry_over missing");
  if (m.decisions.phase === "preparation" && !Array.isArray(m.decisions.preparation.options)) throw new E3aContractError("preparation without options");
  if (m.decisions.phase === "tactics" && !m.decisions.tactics) throw new E3aContractError("tactics without options");
  return m as E3aManagement;
}
