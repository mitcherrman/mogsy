/**
 * Patch Impact level graph: the pure data layer (PH4-B).
 *
 * PH2 is the only authority for every plotted value. This file turns an
 * already-computed `StatProjection` into chart rows and picks axis bounds from
 * those rows. It does NOT import the stat curve, the analyzer or the family
 * registry (a source-scan test enforces that), and it never derives a
 * before/after value, a delta or a crossover: each is copied from
 * `projection.levels[]` / `projection.crossoverLevel`.
 *
 * Allowed here: mapping rows, validating the shape, choosing axis bounds and
 * ticks (visual geometry from the supplied values), and labels.
 */
import type { LevelPoint, PatchImpactAnalysis, StatProjection } from "@/lib/patch-impact/types";
import { projectedStatLabel } from "../format";

/** One plotted level, exactly as PH2 supplied it. */
export type ImpactChartPoint = Readonly<{
  level: number;
  before: number;
  after: number;
  /** PH2's own `absDelta`, carried for the tooltip and the text table (never recomputed). */
  absDelta: number;
}>;

export type ImpactChartYAxis = Readonly<{
  /** Padded, tick-aligned bounds. */
  domain: readonly [number, number];
  ticks: readonly number[];
  /** True when the lower bound is 0; otherwise the axis is cropped and the UI says so. */
  fromZero: boolean;
}>;

export type ImpactChartModel = Readonly<{
  points: readonly ImpactChartPoint[];
  /** The projection's own checkpoints (1, 6, 11, 18). */
  xTicks: readonly number[];
  /** PH2's `crossoverLevel`, only if it names a plotted level; otherwise null. */
  crossoverLevel: number | null;
  y: ImpactChartYAxis;
  /** "base AD", "base health"… (the projected stat, before items and runes). */
  statLabel: string;
}>;

export type ImpactGraphEligibility =
  | { ok: true; projection: StatProjection }
  | { ok: false; reason: "no_analysis" | "unavailable" | "parameter_only" | "incomplete_levels" };

const LEVEL_COUNT = 18;

/** Exactly 18 rows in order L1..L18, every plotted number finite. */
export function hasPlottableLevels(levels: readonly LevelPoint[] | null | undefined): boolean {
  if (!levels || levels.length !== LEVEL_COUNT) return false;
  return levels.every(
    (point, index) =>
      point.level === index + 1 &&
      Number.isFinite(point.before) &&
      Number.isFinite(point.after) &&
      Number.isFinite(point.absDelta),
  );
}

/**
 * The graph eligibility contract. Only PH2's `projected` verdict, with a
 * complete 18-level projection, is graphable. Parameter-only changes
 * (attack speed, history gaps…), unavailable impacts, mechanics and text
 * changes are never graphed, and nothing here reconstructs a missing projection.
 */
export function impactGraphEligibility(
  analysis: PatchImpactAnalysis | null | undefined,
): ImpactGraphEligibility {
  if (!analysis) return { ok: false, reason: "no_analysis" };
  if (analysis.status === "unavailable") return { ok: false, reason: "unavailable" };
  if (analysis.status === "parameter_only") return { ok: false, reason: "parameter_only" };
  if (!hasPlottableLevels(analysis.projection.levels)) return { ok: false, reason: "incomplete_levels" };
  return { ok: true, projection: analysis.projection };
}

/* --------------------------------- y axis --------------------------------- */

/** A spread under this share of the largest value is "near flat": anchor the axis at 0. */
const NEAR_FLAT_SHARE = 0.25;
/** Headroom around the plotted values, as a share of the spread (or of the maximum when anchored). */
const PAD_SHARE = 0.08;
const MAX_TICKS = 7;

/** Round to the 10-decimal grid so tick values never carry float noise (0.1 × 3). */
const clean = (value: number) => Number(value.toFixed(10));

/** The smallest 1 / 2 / 5 × 10ᵏ step that is at least `raw`. */
function niceStep(raw: number): number {
  const exponent = Math.floor(Math.log10(raw));
  const base = 10 ** exponent;
  const fraction = raw / base;
  const multiple = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return clean(multiple * base);
}

function alignedAxis(low: number, high: number): { domain: [number, number]; ticks: number[] } {
  let step = niceStep(Math.max(high - low, 1e-9) / 4);
  for (;;) {
    const lo = clean(Math.floor(low / step) * step);
    const hi = clean(Math.ceil(high / step) * step);
    const count = Math.round((hi - lo) / step) + 1;
    if (count <= MAX_TICKS) {
      const ticks: number[] = [];
      for (let i = 0; i < count; i++) ticks.push(clean(lo + i * step));
      return { domain: [lo, hi], ticks };
    }
    step = niceStep(step * 1.01);
  }
}

/**
 * Honest vertical bounds for the supplied values.
 *
 * - Stats are non-negative. When the curve has real spread (≥ 25% of its top
 *   value, which is any champion's level curve) the axis crops to the data with
 *   8% headroom, floored at 0. The curve's own growth dominates the height, so a
 *   small change stays small instead of being blown up.
 * - When the plotted values are near-flat (spread < 25% of the top value), a
 *   cropped axis would let a +2 change fill the plot. The axis is then anchored
 *   at 0 so the picture cannot overstate it.
 * - Bounds snap to 1/2/5 × 10ᵏ ticks (never more than 7), so labels are exact.
 */
export function chartYAxis(values: readonly number[]): ImpactChartYAxis {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return { domain: [0, 1], ticks: [0, 0.5, 1], fromZero: true };
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const magnitude = Math.max(Math.abs(min), Math.abs(max));
  if (magnitude === 0) return { domain: [0, 1], ticks: [0, 0.5, 1], fromZero: true };

  const spread = max - min;
  let low: number;
  let high: number;
  if (min >= 0 && spread < NEAR_FLAT_SHARE * max) {
    low = 0;
    high = max + PAD_SHARE * max;
  } else {
    const pad = PAD_SHARE * spread;
    low = min >= 0 ? Math.max(0, min - pad) : min - pad;
    high = max + pad;
  }
  const axis = alignedAxis(low, high);
  return { domain: axis.domain, ticks: axis.ticks, fromZero: axis.domain[0] === 0 };
}

/* ---------------------------------- model --------------------------------- */

/** Chart data for an eligible projection; `null` when there is nothing honest to plot. */
export function buildImpactChartModel(projection: StatProjection | null | undefined): ImpactChartModel | null {
  if (!projection || !hasPlottableLevels(projection.levels)) return null;
  const points: ImpactChartPoint[] = projection.levels.map((point) => ({
    level: point.level,
    before: point.before,
    after: point.after,
    absDelta: point.absDelta,
  }));
  const crossover = projection.crossoverLevel;
  return {
    points,
    xTicks: projection.checkpoints,
    crossoverLevel: crossover !== null && points.some((point) => point.level === crossover) ? crossover : null,
    y: chartYAxis(points.flatMap((point) => [point.before, point.after])),
    statLabel: projectedStatLabel(projection.family),
  };
}
