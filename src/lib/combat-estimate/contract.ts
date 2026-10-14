/**
 * CE1 — COMBAT ESTIMATE: the content contract over the frozen authority capture.
 *
 * Three boundaries, kept apart on purpose:
 *
 *   * PUBLIC  (`CombatEstimateScenario`) — the attacker, the ability, the
 *     target and the stated stats a player may see before the reveal, plus the
 *     answer-independent scale. No field holds the answer, the raw damage, the
 *     effective armor or the multiplier.
 *   * PRIVATE (`CombatEstimateSecret`) — the authority's result and working.
 *     Lives with the host's stand-in server (`labAuthority.ts`) and reaches
 *     the player only as a reveal, after Lock.
 *   * REVEAL  (`gradeEstimate` → `EstimateReveal` + the working block) — the
 *     comparison the host decides and formats; the primitive draws it.
 *
 * The frontend NEVER recalculates canonical League combat. Every number in a
 * secret is read verbatim from the capture, which read it from the backend's
 * certified seam (`combat_calculations.physical_ability_damage.v1`). The only
 * arithmetic here is the player's error against that number.
 */
import { readJourneyWorking, type JourneyWorking } from "@/lib/journey/combatWorking";
import type { EstimateReveal, EstimateScale } from "@/lib/interaction-grammar/types";

export const CAPTURE_CONTRACT = "combat_estimate.capture.v1";

export type EstimateMetric = "post_mitigation" | "raw";

export interface CapturedItem { id: string; name: string; revision: string }

export interface CapturedScenario {
  id: string;
  kind: "certified";
  difficulty: "opening" | "middle" | "late";
  metric: EstimateMetric;
  attacker: {
    champion: string; level: number; items: CapturedItem[];
    stats: { attack_damage: number; bonus_attack_damage: number; ability_power: number; base_attack_damage: number };
  };
  ability: {
    slot: string; name: string; rank: number; max_rank: number; component: string | null;
    formula_text: string; tier: string;
    disclosure: { flat_by_rank: number[]; ratios: [string, number][] };
  };
  target: { champion: string; level: number; items: CapturedItem[]; armor: number };
  penetration: { lethality: number; armor_pen_flat: number; armor_pen_percent: number };
  result: {
    damage_type: string; raw_damage: number; target_armor: number; effective_armor: number;
    mitigation_multiplier: number; post_mitigation_damage: number;
  };
  answer: { metric: EstimateMetric; exact: number; whole: number };
  scale: { policy: string; max: number; coarse_step: number; figure_every: number; basis: string };
  working: unknown;
  formula_bindings: [string, unknown][];
  provenance: [string, unknown][];
  assumptions: string[];
}

export interface CombatAuthorityCapture {
  contract: string;
  tool: string;
  captured_at: string;
  backend: { repo: string; commit: string; checkout: string; dirty: boolean };
  database: { path: string; bytes: number; modified: string };
  authorities: Record<string, string | string[]>;
  scale_policy: { id: string; development_only: boolean; rule: string; basis: string };
  scenarios: CapturedScenario[];
  refused: { id: string; reason: string; detail: string }[];
}

// ------------------------------------------------------------------- reading

class Off extends Error {}
const num = (v: unknown): number => { if (typeof v !== "number" || !Number.isFinite(v)) throw new Off(); return v; };
const int = (v: unknown): number => { const n = num(v); if (!Number.isInteger(n)) throw new Off(); return n; };
const text = (v: unknown): string => { if (typeof v !== "string" || !v) throw new Off(); return v; };
const items = (v: unknown): CapturedItem[] => {
  if (!Array.isArray(v)) throw new Off();
  return v.map((i) => ({ id: text((i as CapturedItem).id), name: text((i as CapturedItem).name), revision: text((i as CapturedItem).revision) }));
};

/**
 * Validate one captured scenario. Throws on anything off-contract: a capture
 * that cannot be trusted is refused, never served with a guessed value.
 */
export function readCapturedScenario(raw: unknown): CapturedScenario {
  const s = raw as CapturedScenario;
  if (!s || typeof s !== "object") throw new Off();
  if (s.kind !== "certified") throw new Error(`capture: scenario ${String(s.id)} is not certified`);
  if (s.metric !== "post_mitigation" && s.metric !== "raw") throw new Error(`capture: ${s.id} has an unknown metric`);
  text(s.id); text(s.attacker.champion); int(s.attacker.level); items(s.attacker.items);
  num(s.attacker.stats.attack_damage); num(s.attacker.stats.bonus_attack_damage);
  text(s.ability.slot); text(s.ability.name); int(s.ability.rank); int(s.ability.max_rank);
  text(s.target.champion); int(s.target.level); items(s.target.items); num(s.target.armor);
  num(s.penetration.lethality); num(s.penetration.armor_pen_flat); num(s.penetration.armor_pen_percent);
  num(s.result.raw_damage); num(s.result.target_armor); num(s.result.effective_armor);
  num(s.result.mitigation_multiplier); num(s.result.post_mitigation_damage);
  if (s.result.damage_type !== "physical") throw new Error(`capture: ${s.id} is not physical damage`);
  if (s.answer.metric !== s.metric) throw new Error(`capture: ${s.id} answer metric disagrees`);
  const expected = s.metric === "raw" ? s.result.raw_damage : s.result.post_mitigation_damage;
  if (num(s.answer.exact) !== expected) throw new Error(`capture: ${s.id} answer is not the authority's number`);
  if (int(s.answer.whole) !== roundHalfUp(s.answer.exact)) throw new Error(`capture: ${s.id} whole answer is mis-rounded`);
  int(s.scale.max); int(s.scale.coarse_step); int(s.scale.figure_every); text(s.scale.policy);
  if (!(s.answer.exact >= 0 && s.answer.exact < s.scale.max)) throw new Error(`capture: ${s.id} answer is off the beam`);
  if (readJourneyWorking(s.working) === null) throw new Error(`capture: ${s.id} working block is off-contract`);
  if (!Array.isArray(s.assumptions) || s.assumptions.length === 0) throw new Error(`capture: ${s.id} states no assumptions`);
  // The seam's identity must be the one this contract was written against.
  const prov = new Map(s.provenance);
  if (prov.get("implementation") !== "combat_calculations.physical_ability_damage.v1") {
    throw new Error(`capture: ${s.id} was not produced by the certified seam`);
  }
  return s;
}

export function readCombatAuthorityCapture(raw: unknown): CombatAuthorityCapture {
  const c = raw as CombatAuthorityCapture;
  if (!c || c.contract !== CAPTURE_CONTRACT) throw new Error("capture: unknown contract");
  if (!/^[0-9a-f]{40}$/.test(c.backend?.commit ?? "")) throw new Error("capture: no backend commit");
  if (!c.scale_policy?.development_only) throw new Error("capture: the scale policy must be marked development-only");
  if (!Array.isArray(c.scenarios) || c.scenarios.length === 0) throw new Error("capture: no scenarios");
  const ids = new Set<string>();
  for (const s of c.scenarios) {
    readCapturedScenario(s);
    if (ids.has(s.id)) throw new Error(`capture: duplicate scenario ${s.id}`);
    ids.add(s.id);
  }
  return c;
}

/** ROUND_HALF_UP to a whole number — the backend's display rounding (`numeric_choices.display_value`). */
export function roundHalfUp(value: number): number {
  return Math.sign(value) * Math.floor(Math.abs(value) + 0.5);
}

// ----------------------------------------------------------------- the round

/** What the player may see before the reveal. */
export interface CombatEstimateScenario {
  id: string;
  metric: EstimateMetric;
  difficulty: CapturedScenario["difficulty"];
  attacker: {
    champion: string; level: number; items: { name: string }[];
    attackDamage: number; bonusAttackDamage: number; abilityPower: number;
  };
  ability: { slot: string; name: string; rank: number; maxRank: number; component: string | null };
  target: { champion: string; level: number; items: { name: string }[]; armor: number };
  penetration: { lethality: number; armorPenFlat: number; armorPenPercent: number };
  scale: EstimateScale;
  /** One sentence naming exactly what is estimated. */
  definition: string;
  assumptions: string[];
  certification: { kind: "certified"; label: string; backendCommit: string };
}

/** What only the host's authority holds until the reveal. */
export interface CombatEstimateSecret {
  id: string;
  metric: EstimateMetric;
  exact: number;
  whole: number;
  working: JourneyWorking;
  result: CapturedScenario["result"];
  provenance: ReadonlyMap<string, unknown>;
  formulaText: string;
  formulaTier: string;
}

export const metricLabel = (metric: EstimateMetric): string => (metric === "raw" ? "Raw damage" : "Final damage");

export function definitionOf(s: Pick<PublicCapturedScenario, "ability" | "metric" | "target">): string {
  const hit = s.ability.component ? `${s.ability.name} (${s.ability.component})` : s.ability.name;
  return s.metric === "raw"
    ? `One ${hit} hit at rank ${s.ability.rank}, before ${s.target.champion}'s armor — the ability's raw physical damage.`
    : `One ${hit} hit at rank ${s.ability.rank}, after ${s.target.champion}'s armor — physical damage actually dealt.`;
}

/**
 * NUM-REC2 — the PUBLIC projection of a captured scenario, exactly the fields
 * the owner lab's backend (`/api/admin/numeric-lab/combat-estimate/rounds`)
 * serves before Lock. It has no answer, result, working, provenance or
 * formula, so a host can build a round without ever holding the capture.
 */
export interface PublicCapturedScenario {
  id: string;
  kind: "certified";
  difficulty: CapturedScenario["difficulty"];
  metric: EstimateMetric;
  attacker: {
    champion: string; level: number; items: CapturedItem[];
    stats: { attack_damage: number; bonus_attack_damage: number; ability_power: number };
  };
  ability: { slot: string; name: string; rank: number; max_rank: number; component: string | null };
  target: { champion: string; level: number; items: CapturedItem[]; armor: number };
  penetration: CapturedScenario["penetration"];
  scale: CapturedScenario["scale"];
  assumptions: string[];
}

/** The private block the owner lab's backend releases after Lock. */
export interface ReleasedScenario {
  metric: EstimateMetric;
  exact: number;
  whole: number;
  result: CapturedScenario["result"];
  working: unknown;
  provenance: [string, unknown][];
  formula_text: string;
  tier: string;
}

/** The public round, from the public fields only. `splitScenario` and the owner lab share it. */
export function scenarioFromPublic(s: PublicCapturedScenario, backendCommit: string): CombatEstimateScenario {
  return {
    id: s.id, metric: s.metric, difficulty: s.difficulty,
    attacker: {
      champion: s.attacker.champion, level: s.attacker.level, items: s.attacker.items.map((i) => ({ name: i.name })),
      attackDamage: s.attacker.stats.attack_damage, bonusAttackDamage: s.attacker.stats.bonus_attack_damage,
      abilityPower: s.attacker.stats.ability_power,
    },
    ability: { slot: s.ability.slot, name: s.ability.name, rank: s.ability.rank, maxRank: s.ability.max_rank, component: s.ability.component },
    target: { champion: s.target.champion, level: s.target.level, items: s.target.items.map((i) => ({ name: i.name })), armor: s.target.armor },
    penetration: { lethality: s.penetration.lethality, armorPenFlat: s.penetration.armor_pen_flat, armorPenPercent: s.penetration.armor_pen_percent },
    scale: { max: s.scale.max, coarseStep: s.scale.coarse_step, figureEvery: s.scale.figure_every },
    definition: definitionOf(s),
    assumptions: [...s.assumptions],
    certification: { kind: "certified", label: `Combat authority · ${backendCommit.slice(0, 8)}`, backendCommit },
  };
}

/**
 * The secret, from a block the owner lab's backend released after Lock. Fails
 * closed exactly as the capture reader does: a released number that is not
 * the authority's, or a working block off-contract, is refused.
 */
export function secretFromRelease(id: string, r: ReleasedScenario): CombatEstimateSecret {
  const expected = r.metric === "raw" ? r.result.raw_damage : r.result.post_mitigation_damage;
  if (num(r.exact) !== expected) throw new Error(`release: ${id} answer is not the authority's number`);
  if (int(r.whole) !== roundHalfUp(r.exact)) throw new Error(`release: ${id} whole answer is mis-rounded`);
  const working = readJourneyWorking(r.working);
  if (!working) throw new Error(`release: ${id} working block is off-contract`);
  const provenance = new Map(r.provenance);
  if (provenance.get("implementation") !== "combat_calculations.physical_ability_damage.v1") {
    throw new Error(`release: ${id} was not produced by the certified seam`);
  }
  return {
    id, metric: r.metric, exact: r.exact, whole: r.whole, working, result: { ...r.result },
    provenance, formulaText: text(r.formula_text), formulaTier: text(r.tier),
  };
}

export function splitScenario(s: CapturedScenario, backendCommit: string): { scenario: CombatEstimateScenario; secret: CombatEstimateSecret } {
  const working = readJourneyWorking(s.working);
  if (!working) throw new Error(`capture: ${s.id} has no readable working`);
  const scenario = scenarioFromPublic(s, backendCommit);
  const secret: CombatEstimateSecret = {
    id: s.id, metric: s.metric, exact: s.answer.exact, whole: s.answer.whole, working,
    result: { ...s.result }, provenance: new Map(s.provenance), formulaText: s.ability.formula_text, formulaTier: s.ability.tier,
  };
  return { scenario, secret };
}

// ------------------------------------------------------------------- grading

/**
 * DEVELOPMENT-ONLY descriptive closeness bands, by RELATIVE error. They label
 * how near an estimate came; none of them is a pass mark. Relative bands are
 * the honest default to explore because they treat 50 and 1 000 damage alike
 * (a ±5 miss is 10% of 50 and 0.5% of 1 000); the handoff tabulates what each
 * band means in points at the demonstrated magnitudes. The owner decides the
 * real policy after playtest.
 */
export const DEV_CLOSENESS_BANDS: readonly { upTo: number; label: string }[] = [
  { upTo: 0, label: "Exact" },
  { upTo: 0.02, label: "Within 2%" },
  { upTo: 0.05, label: "Within 5%" },
  { upTo: 0.1, label: "Within 10%" },
  { upTo: 0.2, label: "Within 20%" },
  { upTo: 0.35, label: "Within 35%" },
];

export function devClosenessLabel(relative: number | null): string {
  if (relative === null) return "No relative error";
  for (const band of DEV_CLOSENESS_BANDS) if (relative <= band.upTo + 1e-12) return band.label;
  return "Wide of the mark";
}

const signText = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

/** The exact authority value, trimmed to four places, or null when it is already whole. */
export function exactText(exact: number, whole: number): string | null {
  if (exact === whole) return null;
  return String(Number(exact.toFixed(4)));
}

/**
 * The host's comparison of a locked estimate with the authority's answer.
 *
 * The signed and absolute errors are whole-number differences against the
 * whole-number answer (the number the game shows); the relative error is
 * taken against the EXACT authority value, so it is not inflated by the
 * display rounding. A zero truth has no relative error.
 */
export function gradeEstimate(secret: CombatEstimateSecret, estimate: number, sourceLabel: string): EstimateReveal {
  if (!Number.isInteger(estimate) || estimate < 0) throw new Error("gradeEstimate: the estimate must be a whole number ≥ 0");
  const signed = estimate - secret.whole;
  const absolute = Math.abs(signed);
  const relative = secret.exact > 0 ? Math.abs(estimate - secret.exact) / secret.exact : null;
  const verdict: EstimateReveal["verdict"] = signed === 0 ? "exact" : signed < 0 ? "under" : "over";
  const pct = relative === null ? null : relative < 0.0095 && relative > 0 ? `${(relative * 100).toFixed(1)}%` : `${Math.round(relative * 100)}%`;
  const relativeText = relative === null ? null : verdict === "exact" ? "Exact" : `${pct} ${verdict}`;
  return {
    lockedValue: estimate,
    truth: { value: secret.whole, valueText: String(secret.whole), exactText: exactText(secret.exact, secret.whole), label: metricLabel(secret.metric) },
    verdict,
    error: { signed, signedText: signText(signed), absolute, absoluteText: String(absolute), relative, relativeText },
    closeness: { label: verdict === "exact" ? "Exact" : devClosenessLabel(relative), development: true },
    note: null,
    source: { label: sourceLabel },
  };
}
