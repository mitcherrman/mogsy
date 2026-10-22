/**
 * ROG1-D1 — the Worlds Dynasty run contract, exactly as the ROG1-C1 backend
 * (League_Combat_Simulator PR #36, `routes/dynasty_run.py`) returns it.
 *
 * The backend is the only authority: it owns the seed, every offer, the
 * opponent and every roll. This module only READS its public projection
 * (`dynasty.run.engine.public_view` plus the service envelope). It is fail
 * closed: a response that does not look like a v1 snapshot is refused rather
 * than half-rendered, because a wrong `seq` or `phase` would let the page send
 * an action the server never offered.
 *
 * Nothing here computes a power, a probability or a winner.
 */

export const DYNASTY_ROLES = ["top", "jng", "mid", "bot", "sup"] as const;
export type DynastyRole = (typeof DYNASTY_ROLES)[number];

export const DYNASTY_PHASES = ["draft", "relic", "lineup", "completed"] as const;
export type DynastyPhase = (typeof DYNASTY_PHASES)[number];

export const DYNASTY_ACTIONS = [
  "draft_pick", "choose_relic", "pick_champion", "swap_substitute", "play_match",
] as const;
export type DynastyActionKind = (typeof DYNASTY_ACTIONS)[number];

export type Side = "a" | "b";

export interface PoolEntry { champion_key: string; proficiency: number }

export interface DynastyPlayer {
  player_id: string;
  name: string;
  role: DynastyRole;
  /** Catalog input to the sim. On the synthetic catalog it is invented. */
  rating: number;
  org: string | null;
  region: string | null;
  /** Display only: the sim never reads rarity. */
  rarity: string;
  /** Catalog id the player came from, e.g. `synthetic.v1`. */
  source: string;
  pool: PoolEntry[];
}

export interface DraftPickRecord { pick: number; slot: DynastyRole | "sub"; player_id: string }

export interface RelicCard {
  relic_id: string;
  name: string;
  rarity: string;
  description: string;
  targeted: boolean;
}

export interface ChampionEntry { key: string; name: string; tags: string[] }

export interface PowerComponent { source: string; label: string; value: number }
export interface PowerBreakdown { components: PowerComponent[] }

export interface ProbabilityBreakdown {
  power_a: number;
  power_b: number;
  difference: number;
  scale: number;
  raw_probability_a: number;
  probability_a: number;
  clamped: boolean;
}

export interface RollRecord {
  stage: "initial" | "reroll";
  roll: number;
  probability_a: number;
  winner: Side;
  roll_side: Side;
  roll_threshold: number;
  claimed_by: string | null;
  claimed_side: Side | null;
  source: string | null;
}

export interface LaneBattle {
  role: DynastyRole;
  player_a: string;
  player_b: string;
  champion_a: string;
  champion_b: string;
  power_a: PowerBreakdown;
  power_b: PowerBreakdown;
  probability: ProbabilityBreakdown;
  roll: number;
  winner: Side;
  history: RollRecord[];
}

export interface TeamBattle {
  power_a: PowerBreakdown;
  power_b: PowerBreakdown;
  probability: ProbabilityBreakdown;
  roll: number;
  winner: Side;
  lanes_won_a: number;
  lanes_won_b: number;
  roll_side: Side;
  roll_threshold: number;
}

export interface RerollClaim { team_id: string; role: DynastyRole; status: "applied" | "contested"; source: string }

export interface GameResult {
  ruleset_version: string;
  ruleset_digest: string;
  context: unknown[];
  team_a: string;
  team_b: string;
  lanes: LaneBattle[];
  team_battle: TeamBattle;
  points_a: number;
  points_b: number;
  winner: Side;
  reroll_claims: RerollClaim[];
  total_points: number;
  score_line: string;
}

export interface OpponentStarter { role: DynastyRole; player: DynastyPlayer; champion_key: string }

export interface DynastyMatch {
  context: unknown[];
  outcome: "won" | "lost";
  points: { user: number; opponent: number };
  relic_table_version: string;
  relic_table_digest: string;
  opponent: {
    team_id: string;
    name: string;
    label: string;
    starters: OpponentStarter[];
    relics: { relic_id: string; target_role: DynastyRole | null }[];
  };
  result: GameResult;
}

export interface EarnedModifier { source: string; kind: string; value: number; role: DynastyRole | null }

export interface DynastySnapshot {
  schema_version: 1;
  run_id: string;
  start_key: string;
  status: "active" | "completed";
  seq: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  phase: DynastyPhase;
  allowed_actions: DynastyActionKind[];
  pins: Record<string, string>;
  catalog: { id: string; label: string; synthetic: boolean };
  draft: {
    total_picks: number;
    pick_index: number | null;
    slot: DynastyRole | "sub" | null;
    offer: DynastyPlayer[];
    picks: DraftPickRecord[];
  };
  roster: { starters: Partial<Record<DynastyRole, DynastyPlayer>>; substitutes: DynastyPlayer[] };
  relic_offer: RelicCard[];
  relic: (RelicCard & { target_role: DynastyRole | null }) | null;
  champions: Partial<Record<DynastyRole, string>>;
  champion_catalog: ChampionEntry[];
  modifiers: EarnedModifier[];
  match: DynastyMatch | null;
  /** Present on create/resume (`POST /runs`). */
  created?: boolean;
  /** Present on action responses. */
  applied?: boolean;
  /** True when the server recognised a resent `action_id` and applied nothing. */
  duplicate?: boolean;
}

export class DynastyContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DynastyContractError";
  }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isRole = (v: unknown): v is DynastyRole => (DYNASTY_ROLES as readonly unknown[]).includes(v);
const isFiniteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function need(cond: unknown, what: string): asserts cond {
  if (!cond) throw new DynastyContractError(`Dynasty snapshot: ${what}`);
}

function checkPlayer(p: unknown, where: string): void {
  need(isObj(p), `${where} is not a player`);
  need(typeof p.player_id === "string" && typeof p.name === "string", `${where} has no id/name`);
  need(isRole(p.role), `${where} has an unknown role`);
  need(isFiniteNum(p.rating), `${where} has no rating`);
  need(Array.isArray(p.pool) && p.pool.every((e) =>
    isObj(e) && typeof e.champion_key === "string" && isFiniteNum(e.proficiency)), `${where} has a bad pool`);
}

function checkMatch(m: unknown): void {
  need(isObj(m), "match is not an object");
  need(m.outcome === "won" || m.outcome === "lost", "match outcome is unknown");
  const r = m.result;
  need(isObj(r) && Array.isArray(r.lanes) && r.lanes.length === 5, "match has no five lanes");
  // The page always shows the user as side A. The backend mirrors the game so
  // that holds; refuse to render a result where it would silently not.
  need(r.team_a === "user", "match result is not oriented with the user as side a");
  for (const lane of r.lanes as unknown[]) {
    need(isObj(lane) && isRole(lane.role), "lane has an unknown role");
    need(isObj(lane.probability) && isFiniteNum((lane.probability as Record<string, unknown>).probability_a),
      "lane has no probability");
    need(Array.isArray(lane.history) && lane.history.length >= 1, "lane has no roll history");
  }
  need(isObj(r.team_battle) && isObj((r.team_battle as Record<string, unknown>).probability), "team battle is missing");
  need(isObj(m.points) && isFiniteNum((m.points as Record<string, unknown>).user), "match points are missing");
}

/** Parse one snapshot, or throw {@link DynastyContractError}. */
export function readDynastySnapshot(json: unknown): DynastySnapshot {
  need(isObj(json), "not an object");
  need(json.schema_version === 1, `unsupported schema_version ${String(json.schema_version)}`);
  need(typeof json.run_id === "string" && json.run_id.length > 0, "missing run_id");
  need(Number.isInteger(json.seq) && (json.seq as number) >= 0, "missing seq");
  need((DYNASTY_PHASES as readonly unknown[]).includes(json.phase), `unknown phase ${String(json.phase)}`);
  need(Array.isArray(json.allowed_actions) && json.allowed_actions.every((a) =>
    (DYNASTY_ACTIONS as readonly unknown[]).includes(a)), "bad allowed_actions");
  need(isObj(json.catalog) && typeof json.catalog.label === "string", "missing catalog label");
  const draft = json.draft;
  need(isObj(draft) && Array.isArray(draft.offer) && Array.isArray(draft.picks), "missing draft");
  draft.offer.forEach((p, i) => checkPlayer(p, `draft offer ${i}`));
  const roster = json.roster;
  need(isObj(roster) && isObj(roster.starters) && Array.isArray(roster.substitutes), "missing roster");
  Object.entries(roster.starters).forEach(([role, p]) => {
    need(isRole(role), `starter slot ${role} is unknown`);
    checkPlayer(p, `starter ${role}`);
  });
  roster.substitutes.forEach((p, i) => checkPlayer(p, `substitute ${i}`));
  need(Array.isArray(json.relic_offer) && Array.isArray(json.champion_catalog), "missing offers");
  need(isObj(json.champions), "missing champions");
  need(Array.isArray(json.modifiers), "missing modifiers");
  if (json.phase === "draft") need(draft.offer.length > 0, "draft phase without an offer");
  if (json.phase === "relic") need(json.relic_offer.length > 0, "relic phase without an offer");
  if (json.phase === "completed") checkMatch(json.match);
  else need(json.match === null, "a match before the run completed");
  return json as unknown as DynastySnapshot;
}
