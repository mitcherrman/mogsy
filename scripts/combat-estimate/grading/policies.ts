/**
 * CEG1 — Combat Estimate grading research: candidate policies, the instrument's
 * input contract, and offline player models. RESEARCH CODE, never imported by
 * the app: nothing here grades a live round, and no policy here is approved.
 *
 * Three kinds of number live in this file and are kept apart by name:
 *
 *   * AUTHORITY  — `exact` / `whole` read verbatim from CE1's frozen capture
 *                  of `combat_calculations.physical_ability_damage.v1`.
 *   * INSTRUMENT — what EstimateBeam can actually submit: a whole number in
 *                  `[0, max − 1]` (`estimate.ts` `clampEstimate`; the lab
 *                  authority refuses anything else).
 *   * MODELLED   — hypothetical answers a player with a given shortcut or
 *                  misconception would reach. Derived offline from the
 *                  capture's public premise and disclosed formula, anchored by
 *                  `reconstructAuthority` reproducing every captured answer.
 *                  They are player MODELS, not certified League calculations
 *                  and not player data.
 */

// ------------------------------------------------------------------ rounding

/** ROUND_HALF_UP to a whole number (the backend's display rounding; CE1 `roundHalfUp`). */
export function roundHalfUp(value: number): number {
  return Math.sign(value) * Math.floor(Math.abs(value) + 0.5);
}

// ---------------------------------------------------------------- instrument

export interface Scale { max: number; coarseStep: number }

export type Reach = "reachable" | "rounded" | "clamped-low" | "clamped-high";

/**
 * What the beam can submit for an intended real-valued estimate: the nearest
 * whole number (half up), clamped to `[0, max − 1]`. `reach` says whether the
 * intent was a whole number on the beam already, needed rounding, or fell off
 * either end (the beam cannot express it; the server would refuse it as typed).
 */
export function inputtable(intent: number, scale: Scale): { value: number; reach: Reach } {
  const whole = roundHalfUp(intent);
  if (whole < 0) return { value: 0, reach: "clamped-low" };
  if (whole > scale.max - 1) return { value: scale.max - 1, reach: "clamped-high" };
  return { value: whole, reach: whole === intent ? "reachable" : "rounded" };
}

// ------------------------------------------------------------------ policies

export interface Truth { exact: number; whole: number }

/** A binary policy: one server-owned decision from one whole-number estimate. */
export interface BinaryPolicy {
  id: string;
  family: "A-absolute" | "B-relative" | "C-hybrid";
  label: string;
  /** The accepted closed integer interval, or null when none is defined (zero truth under a pure relative rule). */
  band(truth: Truth): { lo: number; hi: number } | null;
}

export const isCorrect = (p: BinaryPolicy, truth: Truth, estimate: number): boolean => {
  const b = p.band(truth);
  return b !== null && estimate >= b.lo && estimate <= b.hi;
};

/** A — |estimate − whole| ≤ K damage. */
export const absolutePolicy = (k: number): BinaryPolicy => ({
  id: `A:abs${k}`, family: "A-absolute", label: `Absolute ±${k}`,
  band: ({ whole }) => ({ lo: whole - k, hi: whole + k }),
});

/**
 * B — |estimate − exact| ≤ p · exact, on the EXACT authority value (CE1's
 * relative-error convention). Undefined at a zero truth. The integer band it
 * induces is generally ASYMMETRIC around the whole answer.
 */
export const relativeExactPolicy = (p: number): BinaryPolicy => ({
  id: `B:rel${pct(p)}`, family: "B-relative", label: `Relative ${pct(p)}% (vs exact)`,
  band: ({ exact }) => (exact <= 0 ? null : { lo: Math.ceil(exact * (1 - p) - 1e-9), hi: Math.floor(exact * (1 + p) + 1e-9) }),
});

/**
 * C — the hybrid, as an INTEGER band on the displayed whole answer:
 * |estimate − whole| ≤ T, T = max(K, roundHalfUp(p · whole)). Symmetric in
 * points by construction; defined at zero (T = K); never narrower than K.
 */
export const hybridPolicy = (k: number, p: number): BinaryPolicy => ({
  id: `C:hyb${k}+${pct(p)}`, family: "C-hybrid", label: `Hybrid max(±${k}, ${pct(p)}%)`,
  band: ({ whole }) => {
    const t = hybridTolerance(k, p, whole);
    return { lo: whole - t, hi: whole + t };
  },
});

export const hybridTolerance = (k: number, p: number, whole: number): number => Math.max(k, roundHalfUp(p * Math.abs(whole)));

const pct = (p: number) => String(Math.round(p * 1000) / 10);

// ----------------------------------------------------------- D: smooth score

/**
 * D — a continuous accuracy score in [0, 1]: 1 at the exact value, falling
 * linearly to 0 at `zeroAt` relative error (vs exact). Educational: the
 * Ranked contract has no place for a fractional outcome (see the handoff).
 * A zero truth scores 1 only for a zero estimate.
 */
export function smoothScore(truth: Truth, estimate: number, zeroAt = 0.5): number {
  if (truth.exact <= 0) return estimate === 0 ? 1 : 0;
  const rel = Math.abs(estimate - truth.exact) / truth.exact;
  return Math.max(0, 1 - rel / zeroAt);
}

/** Symmetric log-ratio distance |ln(estimate / exact)| — treats ×1.25 and ×0.8 alike. */
export function logRatioError(truth: Truth, estimate: number): number | null {
  if (truth.exact <= 0 || estimate <= 0) return null;
  return Math.abs(Math.log(estimate / truth.exact));
}

// -------------------------------------------------- E: closest-player-wins

export type HeadToHead = "win" | "lose" | "draw" | "timeout";

/** E — the nearer estimate (absolute, vs exact) wins; equal distance draws; no estimate times out. */
export function closestWins(truth: Truth, a: number | null, b: number | null): [HeadToHead, HeadToHead] {
  if (a === null && b === null) return ["timeout", "timeout"];
  if (a === null) return ["timeout", "win"];
  if (b === null) return ["win", "timeout"];
  const da = Math.abs(a - truth.exact);
  const db = Math.abs(b - truth.exact);
  if (Math.abs(da - db) < 1e-9) return ["draw", "draw"];
  return da < db ? ["win", "lose"] : ["lose", "win"];
}

// ------------------------------------------- CE1 display (the reveal's text)

/** CE1 `gradeEstimate`'s relative text, reproduced to find display/grade cliffs. */
export function ce1RelativeText(truth: Truth, estimate: number): string | null {
  if (truth.exact <= 0) return null;
  const relative = Math.abs(estimate - truth.exact) / truth.exact;
  if (estimate === truth.whole) return "Exact";
  return relative < 0.0095 && relative > 0 ? `${(relative * 100).toFixed(1)}%` : `${Math.round(relative * 100)}%`;
}

// --------------------------------------------------------- player models

/** The subset of a captured scenario the models read. */
export interface ModelScenario {
  id: string;
  metric: "post_mitigation" | "raw";
  attacker: { stats: { attack_damage: number; bonus_attack_damage: number } };
  ability: { rank: number; disclosure: { flat_by_rank: number[]; ratios: [string, number][] } };
  target: { armor: number };
  penetration: { lethality: number; armor_pen_flat: number; armor_pen_percent: number };
  result: { raw_damage: number; effective_armor: number; post_mitigation_damage: number };
  answer: { exact: number; whole: number };
  scale: { max: number; coarse_step: number };
}

interface Knobs {
  rank?: number;
  ratioStat?: "as-disclosed" | "swapped";
  dropRatio?: boolean;
  roundStats?: boolean;
  /** how effective armor is formed */
  pen?: "correct" | "none" | "percent-as-flat";
  roundArmorTo?: number | null;
  /** how armor becomes a multiplier */
  armorModel?: "correct" | "linear-percent" | "none";
  roundMultiplierTo?: number | null;
  metric?: "asked" | "other";
}

const statValue = (s: ModelScenario, key: string, swapped: boolean, round: boolean): number => {
  const total = round ? Math.round(s.attacker.stats.attack_damage) : s.attacker.stats.attack_damage;
  const bonus = round ? Math.round(s.attacker.stats.bonus_attack_damage) : s.attacker.stats.bonus_attack_damage;
  if (key === "BO_AD") return swapped ? total : bonus;
  if (key === "AD") return swapped ? bonus : total;
  throw new Error(`model: unknown ratio stat ${key}`);
};

/** One player's arithmetic under the given knobs. With no knobs it must equal the authority. */
export function modelAnswer(s: ModelScenario, k: Knobs = {}): number | null {
  const rank = k.rank ?? s.ability.rank;
  const flat = s.ability.disclosure.flat_by_rank[rank - 1];
  if (flat === undefined) return null;
  const swapped = k.ratioStat === "swapped";
  const raw = flat + (k.dropRatio ? 0 : s.ability.disclosure.ratios.reduce((sum, [key, r]) => sum + r * statValue(s, key, swapped, !!k.roundStats), 0));
  const metric = k.metric === "other" ? (s.metric === "raw" ? "post_mitigation" : "raw") : s.metric;
  if (metric === "raw") return raw;
  const { armor } = s.target;
  const { lethality, armor_pen_flat: flatPen, armor_pen_percent: pctPen } = s.penetration;
  let eff: number;
  switch (k.pen ?? "correct") {
    case "none": eff = armor; break;
    case "percent-as-flat": eff = Math.max(0, armor - pctPen - lethality - flatPen); break;
    default: eff = Math.max(0, armor * (1 - pctPen / 100) - lethality - flatPen);
  }
  if (k.roundArmorTo) eff = Math.round(eff / k.roundArmorTo) * k.roundArmorTo;
  let mult: number;
  switch (k.armorModel ?? "correct") {
    case "none": mult = 1; break;
    case "linear-percent": mult = Math.max(0, 1 - eff / 100); break;
    default: mult = 100 / (100 + eff);
  }
  if (k.roundMultiplierTo) mult = Math.round(mult / k.roundMultiplierTo) * k.roundMultiplierTo;
  return raw * mult;
}

/**
 * The anchor: the authority's own numbers, rebuilt from the premise and the
 * disclosed formula. If this drifts from the capture, every modelled answer is
 * meaningless, so the tests pin it to 1e-9 on every certified scenario.
 */
export const reconstructAuthority = (s: ModelScenario): number => modelAnswer(s) as number;

export type ModelClass = "method-shortcut" | "rough-shortcut" | "misconception";

export interface ModelledAnswer { id: string; cls: ModelClass; label: string; value: number }

/**
 * The modelled answers for one scenario. Shortcuts keep the correct method and
 * lose precision; misconceptions get the mechanics wrong. A model that lands
 * within half a point of the truth is dropped (it does not discriminate there).
 */
export function modelledAnswers(s: ModelScenario): ModelledAnswer[] {
  const post = s.metric === "post_mitigation";
  const hasPen = s.penetration.lethality + s.penetration.armor_pen_flat + s.penetration.armor_pen_percent > 0;
  const specs: [string, ModelClass, string, Knobs, boolean][] = [
    ["int-stats", "method-shortcut", "AD / bonus AD rounded to whole numbers", { roundStats: true }, true],
    ["int-armor", "method-shortcut", "effective armor rounded to a whole number", { roundArmorTo: 1 }, post],
    ["mult-2dp", "method-shortcut", "armor multiplier rounded to 2 dp (0.72)", { roundMultiplierTo: 0.01 }, post],
    ["armor-5", "rough-shortcut", "effective armor rounded to the nearest 5", { roundArmorTo: 5 }, post],
    ["mult-0.05", "rough-shortcut", "armor multiplier rounded to the nearest 0.05", { roundMultiplierTo: 0.05 }, post],
    ["no-armor", "misconception", "forgot armor (answered raw damage)", { metric: "other" }, post],
    ["armored-raw", "misconception", "applied armor to a before-armor question", { metric: "other" }, !post],
    ["no-pen", "misconception", "forgot penetration / lethality", { pen: "none" }, post && hasPen],
    ["pct-as-flat", "misconception", "percent pen subtracted as flat", { pen: "percent-as-flat" }, post && s.penetration.armor_pen_percent > 0],
    ["linear-armor", "misconception", "armor as a straight percent cut (1 − armor/100)", { armorModel: "linear-percent" }, post],
    ["swap-ad", "misconception", "ratio on total AD ↔ bonus AD swapped", { ratioStat: "swapped" }, true],
    ["no-ratio", "misconception", "forgot the AD ratio (flat only)", { dropRatio: true }, true],
    ["rank-minus", "misconception", "rank one lower", { rank: s.ability.rank - 1 }, s.ability.rank > 1],
    ["rank-plus", "misconception", "rank one higher", { rank: s.ability.rank + 1 }, s.ability.rank < s.ability.disclosure.flat_by_rank.length],
  ];
  const out: ModelledAnswer[] = [];
  for (const [id, cls, label, knobs, applies] of specs) {
    if (!applies) continue;
    const value = modelAnswer(s, knobs);
    if (value === null || Math.abs(value - s.answer.exact) < 0.5) continue;
    out.push({ id, cls, label, value });
  }
  return out;
}

// ------------------------------------------------------------- baselines

/** Probability that a uniformly random beam value lands in the band. */
export function uniformGuessRate(p: BinaryPolicy, truth: Truth, scale: Scale): number {
  const b = p.band(truth);
  if (!b) return 0;
  const lo = Math.max(0, b.lo);
  const hi = Math.min(scale.max - 1, b.hi);
  return hi < lo ? 0 : (hi - lo + 1) / scale.max;
}
