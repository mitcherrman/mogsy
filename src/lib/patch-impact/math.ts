/**
 * Pure Patch Impact math. No rounding, no formatting (that belongs to the UI),
 * and never an Infinity or NaN: a zero baseline yields a null relative delta
 * with an explicit reason.
 *
 * The growth curve is NOT reimplemented here: `statAtLevel` /
 * `riotLevelMultiplier` come from League Docs, which mirror the backend engine.
 */
import { riotLevelMultiplier, statAtLevel } from "@/lib/league-docs/api";
import { V1_PROPERTIES, type V1Property } from "./families";
import type {
  LevelPoint,
  ParameterFact,
  ProjectionInputs,
  RelDeltaUnavailableReason,
} from "./types";

export { riotLevelMultiplier, statAtLevel };

export const IMPACT_MIN_LEVEL = 1;
export const IMPACT_MAX_LEVEL = 18;
export const IMPACT_CHECKPOINTS = [1, 6, 11, 18] as const;

/** Values closer than this are the same number (the report resolver's tolerance). */
export const VALUE_EPSILON = 1e-6;

/** True for an integer level in 1–18. */
export function isImpactLevel(level: unknown): level is number {
  return (
    typeof level === "number" &&
    Number.isInteger(level) &&
    level >= IMPACT_MIN_LEVEL &&
    level <= IMPACT_MAX_LEVEL
  );
}

/** Strict: throws on anything that is not an integer level in 1–18. */
export function assertImpactLevel(level: unknown): number {
  if (!isImpactLevel(level)) {
    throw new RangeError(`Impact level must be an integer from 1 to 18, got ${String(level)}`);
  }
  return level;
}

/** Forgiving, for UI input: rounds and clamps a finite number into 1–18. */
export function clampImpactLevel(level: number): number {
  if (!Number.isFinite(level)) {
    throw new RangeError(`Impact level must be a finite number, got ${String(level)}`);
  }
  return Math.min(IMPACT_MAX_LEVEL, Math.max(IMPACT_MIN_LEVEL, Math.round(level)));
}

export type RelativeDelta = {
  value: number | null;
  reason: RelDeltaUnavailableReason | null;
};

/** `(after − before) / before`, or an explicit unavailable reason when before is 0. */
export function relativeDelta(before: number, after: number): RelativeDelta {
  if (!Number.isFinite(before) || !Number.isFinite(after) || before === 0) {
    return { value: null, reason: "zero_baseline" };
  }
  const value = (after - before) / before;
  return Number.isFinite(value) ? { value, reason: null } : { value: null, reason: "zero_baseline" };
}

export function parameterFact(args: {
  property: V1Property;
  before: number;
  after: number;
}): ParameterFact {
  const spec = V1_PROPERTIES[args.property];
  const rel = relativeDelta(args.before, args.after);
  return {
    family: spec.family,
    half: spec.half,
    property: args.property,
    before: args.before,
    after: args.after,
    absDelta: args.after - args.before,
    relDelta: rel.value,
    relDeltaUnavailableReason: rel.reason,
    unit: spec.unit,
    provenance: "riot_line",
  };
}

function levelPoint(level: number, before: number, after: number): LevelPoint {
  const rel = relativeDelta(before, after);
  return {
    level,
    before,
    after,
    absDelta: after - before,
    relDelta: rel.value,
    relDeltaUnavailableReason: rel.reason,
  };
}

/** One level of a flat-stat projection. Throws on an invalid level. */
export function projectAtLevel(
  inputs: Pick<ProjectionInputs, "baseBefore" | "baseAfter" | "growthBefore" | "growthAfter">,
  level: number,
): LevelPoint {
  assertImpactLevel(level);
  return levelPoint(
    level,
    statAtLevel(inputs.baseBefore.value, inputs.growthBefore.value, level),
    statAtLevel(inputs.baseAfter.value, inputs.growthAfter.value, level),
  );
}

/** Exactly 18 points, L1..L18. */
export function projectFlatLevels(inputs: ProjectionInputs): LevelPoint[] {
  const points: LevelPoint[] = [];
  for (let level = IMPACT_MIN_LEVEL; level <= IMPACT_MAX_LEVEL; level++) {
    points.push(projectAtLevel(inputs, level));
  }
  return points;
}

/**
 * First level in 2..18 whose delta sign differs from the previous NON-ZERO sign.
 * Exact (and float-noise) zeros are skipped, so a growth-only change, whose L1
 * delta is 0 by construction, never reads as a crossover.
 */
export function crossoverLevel(levels: readonly LevelPoint[]): number | null {
  let previousSign = 0;
  for (const point of levels) {
    const sign = Math.abs(point.absDelta) <= 1e-9 ? 0 : Math.sign(point.absDelta);
    if (sign === 0) continue;
    if (previousSign !== 0 && sign !== previousSign) return point.level;
    previousSign = sign;
  }
  return null;
}
