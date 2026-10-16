/**
 * ROG1-D1 — presentation helpers over a backend Dynasty snapshot.
 *
 * Everything here REARRANGES numbers the backend sent; nothing decides an
 * outcome. Totals are the backend's own `probability.power_a/power_b`; the
 * roll explanation restates the backend's single outcome rule
 * (`decide(roll, threshold, roll_side)`: `roll_side` wins iff
 * `roll < threshold`) so the page can draw it, and the tests assert it agrees
 * with the backend's recorded `winner` on every captured lane.
 */
import type { RankedRole } from "@/lib/ranked-public/roles";
import type {
  ChampionEntry, DynastyMatch, DynastyPlayer, DynastyRole, DynastySnapshot, LaneBattle,
  PowerComponent, RollRecord, Side, TeamBattle,
} from "./contracts";
import { DYNASTY_ROLES } from "./contracts";

/** The backend's role ids onto Mogzy's canonical role art (`RoleEmblem`). */
export const RANKED_ROLE_OF: Record<DynastyRole, RankedRole> = {
  top: "top", jng: "jungle", mid: "mid", bot: "adc", sup: "support",
};

export const ROLE_LABEL: Record<DynastyRole, string> = {
  top: "Top", jng: "Jungle", mid: "Mid", bot: "Bot", sup: "Support",
};

export const USER_SIDE: Side = "a";

export const pct = (p: number, digits = 0): string => `${(p * 100).toFixed(digits)}%`;
export const signed = (v: number, digits = 1): string => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}`;
export const fixed = (v: number, digits = 1): string => v.toFixed(digits);

/** `syn_champ_08` → the catalog's name when the run has shown it, else the key. */
export function championName(key: string | undefined, catalog: readonly ChampionEntry[] | undefined): string {
  if (!key) return "—";
  return catalog?.find((c) => c.key === key)?.name ?? key;
}

type KnownRelics = readonly { relic_id: string; name: string }[];

/**
 * The opponent's relics arrive as bare ids (`{relic_id, target_role}`); the
 * backend sends names only for the owner's offer and equipped relic. Use a
 * backend name when the run has shown one, otherwise title-case the id
 * (`team_spirit` → `Team Spirit`) instead of printing snake_case.
 */
export function relicLabel(
  relic: { relic_id: string; target_role: DynastyRole | null },
  known: KnownRelics = [],
): string {
  const name = known.find((k) => k.relic_id === relic.relic_id)?.name
    ?? relic.relic_id.split("_").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  return relic.target_role ? `${name} (${ROLE_LABEL[relic.target_role]})` : name;
}

/** Backend labels and re-roll sources cite relics as `relic:<id>`; show the relic's name instead. */
export function readableRelicRefs(text: string, known: KnownRelics = []): string {
  return text.replace(/relic:([a-z0-9_]+)/g, (_, id: string) => relicLabel({ relic_id: id, target_role: null }, known));
}

const readableComponents = (cs: readonly PowerComponent[], known: KnownRelics): PowerComponent[] =>
  cs.map((c) => ({ ...c, label: readableRelicRefs(c.label, known) }));

/** Remember champion names across phases: the backend sends the catalog only in the lineup phase. */
export function mergeChampionCatalog(known: readonly ChampionEntry[], snap: DynastySnapshot | null): ChampionEntry[] {
  if (!snap?.champion_catalog?.length) return [...known];
  const byKey = new Map(known.map((c) => [c.key, c]));
  for (const c of snap.champion_catalog) byKey.set(c.key, c);
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function sortedPool(p: DynastyPlayer) {
  return [...p.pool].sort((a, b) => b.proficiency - a.proficiency || a.champion_key.localeCompare(b.champion_key));
}

export function proficiencyFor(p: DynastyPlayer | undefined, championKey: string | undefined): number | null {
  if (!p || !championKey) return null;
  return p.pool.find((e) => e.champion_key === championKey)?.proficiency ?? null;
}

/** Plain facts about shared orgs/regions on a set of players. Not a synergy score. */
export function sharedAffiliations(players: readonly DynastyPlayer[]) {
  const count = (field: "org" | "region") => {
    const m = new Map<string, number>();
    for (const p of players) if (p[field]) m.set(p[field]!, (m.get(p[field]!) ?? 0) + 1);
    return [...m.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
  };
  return { orgs: count("org"), regions: count("region") };
}

export function draftedPlayers(snap: DynastySnapshot): DynastyPlayer[] {
  const starters = DYNASTY_ROLES.map((r) => snap.roster.starters[r]).filter(Boolean) as DynastyPlayer[];
  return [...starters, ...snap.roster.substitutes];
}

// ───────────────────────────────────────────────────────────── rolls

export interface RollWindow {
  /** The part of [0, 1) in which the draw makes the USER (side a) win. */
  userFrom: number;
  userTo: number;
  roll: number;
  userWon: boolean;
}

/**
 * Where the user's winning window sits for one recorded draw. Restates the
 * backend rule: `roll_side` wins iff `roll < roll_threshold`.
 */
export function rollWindow(r: { roll: number; roll_side: Side; roll_threshold: number }): RollWindow {
  const userIsRollSide = r.roll_side === USER_SIDE;
  const userFrom = userIsRollSide ? 0 : r.roll_threshold;
  const userTo = userIsRollSide ? r.roll_threshold : 1;
  const rollSideWins = r.roll < r.roll_threshold;
  return { userFrom, userTo, roll: r.roll, userWon: userIsRollSide ? rollSideWins : !rollSideWins };
}

// ───────────────────────────────────────────────────────────── match view

export interface LaneView {
  role: DynastyRole;
  you: { player: string; champion: string; power: number; components: PowerComponent[] };
  them: { player: string; champion: string; power: number; components: PowerComponent[] };
  /** Pre-roll chance the user wins this lane (clamped, as the backend applied it). */
  youChance: number;
  clamped: boolean;
  rawYouChance: number;
  difference: number;
  scale: number;
  youWon: boolean;
  upset: boolean;
  history: (RollRecord & { window: RollWindow })[];
  rerolled: boolean;
}

export interface TeamView {
  you: { power: number; components: PowerComponent[] };
  them: { power: number; components: PowerComponent[] };
  youChance: number;
  clamped: boolean;
  rawYouChance: number;
  difference: number;
  scale: number;
  youWon: boolean;
  upset: boolean;
  window: RollWindow;
  lanesWon: { you: number; them: number };
}

export interface MatchView {
  outcome: "won" | "lost";
  points: { you: number; them: number; total: number };
  lanes: LaneView[];
  team: TeamView;
  opponentName: string;
  opponentLabel: string;
  opponentRelics: string[];
  rerollClaims: DynastyMatch["result"]["reroll_claims"];
  ruleset: string;
}

function laneView(l: LaneBattle, known: KnownRelics): LaneView {
  const p = l.probability;
  const youWon = l.winner === USER_SIDE;
  return {
    role: l.role,
    you: { player: l.player_a, champion: l.champion_a, power: p.power_a, components: readableComponents(l.power_a.components, known) },
    them: { player: l.player_b, champion: l.champion_b, power: p.power_b, components: readableComponents(l.power_b.components, known) },
    youChance: p.probability_a,
    clamped: p.clamped,
    rawYouChance: p.raw_probability_a,
    difference: p.difference,
    scale: p.scale,
    youWon,
    upset: (youWon && p.probability_a < 0.5) || (!youWon && p.probability_a > 0.5),
    history: l.history.map((h) => ({ ...h, source: h.source == null ? h.source : readableRelicRefs(h.source, known), window: rollWindow(h) })),
    rerolled: l.history.length > 1,
  };
}

function teamView(t: TeamBattle, known: KnownRelics): TeamView {
  const p = t.probability;
  const youWon = t.winner === USER_SIDE;
  return {
    you: { power: p.power_a, components: readableComponents(t.power_a.components, known) },
    them: { power: p.power_b, components: readableComponents(t.power_b.components, known) },
    youChance: p.probability_a,
    clamped: p.clamped,
    rawYouChance: p.raw_probability_a,
    difference: p.difference,
    scale: p.scale,
    youWon,
    upset: (youWon && p.probability_a < 0.5) || (!youWon && p.probability_a > 0.5),
    window: rollWindow(t),
    lanesWon: { you: t.lanes_won_a, them: t.lanes_won_b },
  };
}

export function matchView(m: DynastyMatch, knownRelics: KnownRelics = []): MatchView {
  const order = (r: DynastyRole) => DYNASTY_ROLES.indexOf(r);
  return {
    outcome: m.outcome,
    points: { you: m.points.user, them: m.points.opponent, total: m.result.total_points },
    lanes: [...m.result.lanes].sort((a, b) => order(a.role) - order(b.role)).map((l) => laneView(l, knownRelics)),
    team: teamView(m.result.team_battle, knownRelics),
    opponentName: m.opponent.name,
    opponentLabel: m.opponent.label,
    opponentRelics: m.opponent.relics.map((r) => relicLabel(r, knownRelics)),
    rerollClaims: m.result.reroll_claims.map((c) => ({ ...c, source: readableRelicRefs(c.source, knownRelics) })),
    ruleset: m.result.ruleset_version,
  };
}

/** Group team-battle components for display: weighted lanes, momentum, synergy, everything else. */
export function groupTeamComponents(components: readonly PowerComponent[]) {
  const lanes = components.filter((c) => c.source.startsWith("lane:"));
  const momentum = components.filter((c) => c.source === "momentum");
  const synergy = components.filter((c) => c.source.startsWith("synergy:"));
  const other = components.filter((c) => !lanes.includes(c) && !momentum.includes(c) && !synergy.includes(c));
  const sum = (cs: readonly PowerComponent[]) => cs.reduce((s, c) => s + c.value, 0);
  return [
    { key: "lanes", title: "Weighted lane power", items: lanes, total: sum(lanes) },
    { key: "momentum", title: "Lane momentum", items: momentum, total: sum(momentum) },
    { key: "synergy", title: "Synergy", items: synergy, total: sum(synergy) },
    { key: "other", title: "Relics and modifiers", items: other, total: sum(other) },
  ].filter((g) => g.items.length > 0);
}
