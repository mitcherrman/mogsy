/**
 * NUM-LAB — the stand-in authority for the numeric prototypes.
 *
 * NOT AN AUTHORITY. Every subject and value below is SYNTHETIC: invented lab
 * fixtures used to playtest the interaction, deliberately NOT named after any
 * champion, item or ability, so nothing here can be mistaken for (or leak into)
 * a game fact. Real values need the backend work listed in
 * NUMERIC_MODES_PLAYTEST_HANDOFF.md.
 *
 * It does what the server would: it keeps each round's answer in a closure the
 * primitive never receives, and grades the locked response into a
 * `NumericReveal`. It grades TWO ways so a playtest can compare them:
 *
 *   * `band`     — the lab rule under test: |guess − answer| ≤ max(floor, ratio × answer).
 *   * `baseline` — the rule production numeric Mastery steps use today
 *                  (`mastery/questions/precision.py`, mastery-precision-1.1.0):
 *                  both values quantized ROUND_HALF_UP to the display precision
 *                  must be EQUAL. No tolerance.
 */
import type {
  CombatEstimatePublic, NumericResponse, NumericReveal, NumericScale, NumericVerdict, StatDropPublic,
} from "@/lib/interaction-grammar/numericModes";
import { stepDecimals } from "@/lib/interaction-grammar/numericModes";

export const LAB_SOURCE = "Synthetic lab fixture · not a game fact · not authoritatively graded";

export interface BandRule {
  /** Relative half-width, e.g. 0.1 = ±10% of the answer. */
  ratio: number;
  /** Absolute minimum half-width, in the scale's unit. */
  floor: number;
}

interface Secret {
  value: number;
  /** Display precision for the baseline rule and every formatted string. */
  decimals: number;
  rule: BandRule;
  evidence: string;
}

export type LabRound =
  | { id: string; title: string; mode: "stat-drop"; content: StatDropPublic }
  | { id: string; title: string; mode: "combat-estimate"; content: CombatEstimatePublic };

/** What the host shows next to the reveal: the baseline rule's verdict on the same guess. */
export interface BaselineComparison {
  baselineCorrect: boolean;
  bandCorrect: boolean;
  /** The plain sentence for the lab footer. */
  summary: string;
}

// ---------------------------------------------------------------- fixtures

const HEALTH: NumericScale = { min: 400, max: 800, step: 5, unitLabel: "HP" };
const COOLDOWN: NumericScale = { min: 0, max: 30, step: 0.5, unitLabel: "s" };
const RANGE: NumericScale = { min: 100, max: 700, step: 25, unitLabel: "units" };
const DAMAGE: NumericScale = { min: 0, max: 2000, step: 1, unitLabel: "damage" };

type Fixture = { round: LabRound; secret: Secret };

const FIXTURES: readonly Fixture[] = [
  {
    round: { id: "sd-health", title: "Base health", mode: "stat-drop", content: {
      prompt: "Drop the marker on this subject's base health.",
      metricLabel: "Base health", context: "Level 1 · synthetic",
      subject: { label: "Fixture subject Alpha", sublabel: "Lab bruiser", monogram: "α" },
      scale: HEALTH } },
    secret: { value: 645, decimals: 0, rule: { ratio: 0.05, floor: 10 }, evidence: "Alpha's fixture base health is 645 HP." },
  },
  {
    round: { id: "sd-cooldown", title: "Ability cooldown", mode: "stat-drop", content: {
      prompt: "Drop the marker on this ability's cooldown.",
      metricLabel: "Ability cooldown", context: "Rank 3 · synthetic",
      subject: { label: "Fixture ability Beta-E", sublabel: "Lab dash", monogram: "βE" },
      scale: COOLDOWN } },
    secret: { value: 12.5, decimals: 1, rule: { ratio: 0.1, floor: 0.5 }, evidence: "Beta-E's fixture cooldown at rank 3 is 12.5 seconds." },
  },
  {
    round: { id: "sd-range", title: "Attack range (exact-only)", mode: "stat-drop", content: {
      prompt: "Drop the marker on this subject's attack range.",
      metricLabel: "Attack range", context: "synthetic",
      subject: { label: "Fixture subject Gamma", sublabel: "Lab marksman", monogram: "γ" },
      scale: RANGE } },
    secret: { value: 550, decimals: 0, rule: { ratio: 0, floor: 0 }, evidence: "Gamma's fixture attack range is 550 units. Exact-only round." },
  },
  {
    round: { id: "ce-ability", title: "Ability hit", mode: "combat-estimate", content: {
      prompt: "How much damage does this hit deal after armor?",
      metricLabel: "Post-mitigation damage", context: "Physical · synthetic",
      attacker: { label: "Fixture Delta", lines: ["Level 9", "180 total AD", "No items with passives"], monogram: "δ" },
      target: { label: "Fixture Epsilon", lines: ["Level 9", "80 armor", "No shields"], monogram: "ε" },
      action: "One cast of Delta-Q at rank 3 (fixture formula: 140 + 100% total AD).",
      scale: DAMAGE } },
    // 320 raw × 100/(100+80) = 177.78 → 178.
    secret: { value: 178, decimals: 0, rule: { ratio: 0.1, floor: 5 },
      evidence: "320 raw physical damage × 100 / (100 + 80 armor) = 177.8, shown as 178." },
  },
  {
    round: { id: "ce-auto", title: "Basic attack", mode: "combat-estimate", content: {
      prompt: "How much damage does one basic attack deal after armor?",
      metricLabel: "Post-mitigation damage", context: "Physical · no crit · synthetic",
      attacker: { label: "Fixture Zeta", lines: ["Level 13", "240 total AD", "0% crit chance"], monogram: "ζ" },
      target: { label: "Fixture Eta", lines: ["Level 13", "150 armor", "No shields"], monogram: "η" },
      action: "One basic attack.",
      scale: DAMAGE } },
    // 240 × 100/250 = 96.
    secret: { value: 96, decimals: 0, rule: { ratio: 0.1, floor: 5 },
      evidence: "240 physical damage × 100 / (100 + 150 armor) = 96." },
  },
];

// ----------------------------------------------------------------- grading

function fmt(n: number, decimals: number, unit: string): string {
  const s = n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return unit ? `${s} ${unit}` : s;
}

/** ROUND_HALF_UP at `decimals` places (away from zero on .5), as precision.py does. */
export function quantizeHalfUp(n: number, decimals: number): number {
  const f = 10 ** decimals;
  const scaled = Math.abs(n) * f;
  const r = Math.floor(scaled + 0.5 + 1e-9) / f;
  return Math.sign(n) * r;
}

export function bandFor(value: number, rule: BandRule): { low: number; high: number } {
  const half = Math.max(rule.floor, rule.ratio * Math.abs(value));
  return { low: value - half, high: value + half };
}

export function gradeNumeric(secret: Secret, scale: NumericScale, response: NumericResponse): {
  reveal: NumericReveal; baseline: BaselineComparison;
} {
  const guess = response.selected;
  const unit = scale.unitLabel;
  const d = Math.max(secret.decimals, stepDecimals(scale.step));
  const exact = quantizeHalfUp(guess, secret.decimals) === quantizeHalfUp(secret.value, secret.decimals);
  const halfWidth = Math.max(secret.rule.floor, secret.rule.ratio * Math.abs(secret.value));
  const band = halfWidth > 0 ? bandFor(secret.value, secret.rule) : null;
  const within = band !== null && guess >= band.low - 1e-9 && guess <= band.high + 1e-9;
  const verdict: NumericVerdict = exact ? "exact" : within ? "within" : "outside";
  const delta = guess - secret.value;
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "±";
  const rel = secret.value !== 0 ? ` · ${sign}${Math.abs((delta / secret.value) * 100).toFixed(1)}%` : "";
  const bandCorrect = verdict !== "outside";
  const ruleText = secret.rule.ratio > 0
    ? `±${Math.round(secret.rule.ratio * 100)}% (at least ±${fmt(secret.rule.floor, d, unit)})`
    : `±${fmt(secret.rule.floor, d, unit)}`;
  return {
    reveal: {
      submitted: guess,
      submittedDisplay: fmt(guess, d, unit),
      canonicalValue: secret.value,
      canonicalDisplay: fmt(secret.value, secret.decimals, unit),
      band: band ? { ...band, display: `${fmt(band.low, d, unit)} – ${fmt(band.high, d, unit)} (${ruleText})` } : null,
      verdict,
      deltaDisplay: `${sign}${fmt(Math.abs(delta), d, unit)}${rel}`,
      isCorrect: bandCorrect,
      evidence: secret.evidence,
      source: LAB_SOURCE,
    },
    baseline: {
      baselineCorrect: exact,
      bandCorrect,
      summary: `Baseline (production exact-cell rule): ${exact ? "correct" : "wrong"} · Lab band rule: ${bandCorrect ? "correct" : "wrong"}`
        + (exact !== bandCorrect ? " — the rules DISAGREE on this guess." : "."),
    },
  };
}

/**
 * The lab's authority instance. Answers stay inside this closure; the host
 * receives public rounds and, after a lock, a reveal.
 */
export function createLabAuthority() {
  const secrets = new Map(FIXTURES.map((f) => [f.round.id, f.secret] as const));
  return {
    rounds: FIXTURES.map((f) => f.round) as readonly LabRound[],
    grade(round: LabRound, response: NumericResponse) {
      const secret = secrets.get(round.id);
      if (!secret) throw new Error(`unknown lab round ${round.id}`);
      return gradeNumeric(secret, round.content.scale, response);
    },
    /** For pre-arranged capture states only: a guess that is exact / inside / outside the band. */
    sampleGuess(round: LabRound, kind: "exact" | "within" | "outside"): number {
      const s = secrets.get(round.id)!;
      const { step, min, max } = round.content.scale;
      if (kind === "exact") return s.value;
      const half = Math.max(s.rule.floor, s.rule.ratio * s.value);
      const target = kind === "within" ? s.value + Math.max(step, half / 2) : s.value + half * 2 + step * 3;
      const snapped = min + Math.round((Math.min(max, target) - min) / step) * step;
      return Number(snapped.toFixed(stepDecimals(step)));
    },
  };
}
