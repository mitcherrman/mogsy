/**
 * MIG — ESTIMATE: the pure parts of the beam instrument.
 *
 * Quantisation, clamping, the coarse/fine split, pointer and keyboard
 * arithmetic, the beam's engraving, the balance needle and the reveal clock.
 * No React, no DOM, no domain: a value is a whole number on a bounded scale
 * and nothing here knows what the scale measures or which number is right.
 * Grading lives with the host's authority and is never done here (a source
 * test pins that nothing in this file reads a reveal's verdict or truth).
 *
 * THE SCALE IS HONEST. `fractionOf` is one linear map: zero at the beam's
 * near end, `scale.max` at its far end. The poise the player sets and the
 * truth pointer the reveal drops are placed by the same map, so the distance
 * between them on screen is their distance in units.
 */
import type { EstimatePublic, EstimateScale } from "./types";

export function assertEstimateContent(content: EstimatePublic): void {
  const { max, coarseStep, figureEvery } = content.scale;
  if (!Number.isInteger(max) || max <= 0) throw new Error(`Estimate: scale.max must be a positive integer, got ${max}`);
  if (!Number.isInteger(coarseStep) || coarseStep < 2) throw new Error(`Estimate: coarseStep must be an integer ≥ 2, got ${coarseStep}`);
  if (max % coarseStep !== 0) throw new Error("Estimate: scale.max must be a multiple of coarseStep");
  if (max < 2 * coarseStep) throw new Error("Estimate: the beam needs at least two coarse notches");
  if (!Number.isInteger(figureEvery) || figureEvery <= 0 || figureEvery % coarseStep !== 0) {
    throw new Error("Estimate: figureEvery must be a positive multiple of coarseStep");
  }
  if (!content.certification || (content.certification.kind !== "certified" && content.certification.kind !== "synthetic")) {
    throw new Error("Estimate: content must state its certification");
  }
}

// -------------------------------------------------------------------- values

/** The largest value the instrument can set: one below the beam's end. */
export const estimateCeiling = (scale: EstimateScale): number => scale.max - 1;

/** A whole number on the scale: rounded, then clamped to `[0, max-1]`. */
export function clampEstimate(value: number, scale: EstimateScale): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(estimateCeiling(scale), Math.round(value)));
}

/** The coarse beam's notches: `0, step, 2·step … max − step`. */
export function coarseNotches(scale: EstimateScale): number[] {
  const out: number[] = [];
  for (let v = 0; v < scale.max; v += scale.coarseStep) out.push(v);
  return out;
}

/** A value as the coarse notch it sits on and the fine offset above it. */
export function splitEstimate(value: number, scale: EstimateScale): { coarse: number; fine: number } {
  const v = clampEstimate(value, scale);
  const coarse = Math.floor(v / scale.coarseStep) * scale.coarseStep;
  return { coarse, fine: v - coarse };
}

/** A coarse notch plus a fine offset, back on the scale. */
export function composeEstimate(coarse: number, fine: number, scale: EstimateScale): number {
  const notch = Math.max(0, Math.min(scale.max - scale.coarseStep, Math.round(coarse / scale.coarseStep) * scale.coarseStep));
  const offset = Math.max(0, Math.min(scale.coarseStep - 1, Math.round(fine)));
  return clampEstimate(notch + offset, scale);
}

// ------------------------------------------------------------------ geometry

/** The one linear map from a value to its position along the beam, 0..1. */
export const fractionOf = (value: number, scale: EstimateScale): number => Math.max(0, Math.min(1, value / scale.max));

/** The coarse notch nearest a position along the coarse beam. */
export function coarseFromFraction(fraction: number, scale: EstimateScale): number {
  const f = Math.max(0, Math.min(1, fraction));
  const notch = Math.round((f * scale.max) / scale.coarseStep) * scale.coarseStep;
  return Math.max(0, Math.min(scale.max - scale.coarseStep, notch));
}

/** The fine offset nearest a position along the fine beam (`0 .. step−1`). */
export function fineFromFraction(fraction: number, scale: EstimateScale): number {
  const f = Math.max(0, Math.min(1, fraction));
  return Math.max(0, Math.min(scale.coarseStep - 1, Math.round(f * (scale.coarseStep - 1))));
}

/** Where a fine offset sits along the fine beam, 0..1. */
export const fineFraction = (fine: number, scale: EstimateScale): number =>
  scale.coarseStep <= 1 ? 0 : Math.max(0, Math.min(1, fine / (scale.coarseStep - 1)));

// ------------------------------------------------------------------ keyboard

export const FINE_KEY_STEP = 1;
export const FINE_SHIFT_STEP = 10;

/**
 * The value a key moves the instrument to, or null for a key it does not own.
 * Arrows step one unit (Right / Up more, Left / Down less); with Shift they
 * step ten; PageUp / PageDown step one coarse notch; Home / End reach the ends.
 */
export function stepForKey(key: string, shift: boolean, value: number, scale: EstimateScale): number | null {
  const fine = shift ? FINE_SHIFT_STEP : FINE_KEY_STEP;
  const top = estimateCeiling(scale);
  switch (key) {
    case "ArrowRight": case "ArrowUp": return Math.min(top, value + fine);
    case "ArrowLeft": case "ArrowDown": return Math.max(0, value - fine);
    case "PageUp": return Math.min(top, value + scale.coarseStep);
    case "PageDown": return Math.max(0, value - scale.coarseStep);
    case "Home": return 0;
    case "End": return top;
    default: return null;
  }
}

// ----------------------------------------------------------------- engraving

export interface BeamFigure {
  value: number;
  /** Carries an engraved number. */
  labelled: boolean;
}

/** The coarse beam's ticks: one per notch, plus the far end; figures every `figureEvery`. */
export function beamFigures(scale: EstimateScale): BeamFigure[] {
  const out: BeamFigure[] = [];
  for (let v = 0; v <= scale.max; v += scale.coarseStep) out.push({ value: v, labelled: v % scale.figureEvery === 0 });
  return out;
}

/** The fine beam's ticks: every unit, figures every ten. */
export function fineFigures(scale: EstimateScale): BeamFigure[] {
  const out: BeamFigure[] = [];
  for (let v = 0; v < scale.coarseStep; v += 1) out.push({ value: v, labelled: v % 10 === 0 });
  return out;
}

/** A value for the engraved readout: thousands grouped with a narrow no-break space (U+202F). */
export function formatEstimate(value: number): string {
  const n = Math.round(value);
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  return `${sign}${a >= 1000 ? `${Math.floor(a / 1000)}\u202f${String(a % 1000).padStart(3, "0")}` : String(a)}`;
}

// -------------------------------------------------------------------- needle

/** The needle's furthest swing, in degrees, reached at `NEEDLE_FULL_RELATIVE`. */
export const NEEDLE_MAX_DEG = 42;
export const NEEDLE_FULL_RELATIVE = 0.5;

/**
 * The balance needle's angle for a revealed error: zero when exact, right
 * for over, left for under, swinging with the RELATIVE error and pinned at
 * ±`NEEDLE_MAX_DEG` from half the truth upward. A null relative (the truth is
 * zero) pins the needle on the verdict's side.
 */
export function needleAngle(verdict: "exact" | "under" | "over", relative: number | null): number {
  if (verdict === "exact") return 0;
  const magnitude = relative === null ? 1 : Math.min(1, Math.max(0, relative) / NEEDLE_FULL_RELATIVE);
  const deg = Math.round(magnitude * NEEDLE_MAX_DEG * 10) / 10;
  return verdict === "over" ? deg : -deg;
}

// --------------------------------------------------------------- reveal clock

/**
 * The reveal is a bounded choreography on ONE clock:
 *
 *   charge   the locked poise hardens and the beam powers;
 *   descend  the truth pointer drops onto the beam at the true value and the
 *            needle swings;
 *   band     the error band fills between the poise and the pointer, the
 *            readout turns over to the truth and the error plate lights;
 *   ledger   the authority's working is laid out row by row.
 *
 * `budgetMs` scales every stage. Reduced motion has no clock: the first frame
 * is the settled frame.
 */
export type EstimateStage = "charge" | "descend" | "band" | "ledger" | "done";

export interface EstimatePlan {
  instant: boolean;
  stages: readonly { stage: Exclude<EstimateStage, "done">; start: number; end: number }[];
  totalMs: number;
}

export const ESTIMATE_BUDGET_MS = 1800;
const SHARE = { charge: 0.12, descend: 0.3, band: 0.2, ledger: 0.38 } as const;

export function planEstimateReveal({ reduced, budgetMs = ESTIMATE_BUDGET_MS }: { reduced: boolean; budgetMs?: number }): EstimatePlan {
  if (reduced) return { instant: true, stages: [], totalMs: 0 };
  const budget = Math.max(400, budgetMs);
  const stages: { stage: Exclude<EstimateStage, "done">; start: number; end: number }[] = [];
  let at = 0;
  for (const stage of ["charge", "descend", "band", "ledger"] as const) {
    const ms = Math.round(budget * SHARE[stage]);
    stages.push({ stage, start: at, end: at + ms });
    at += ms;
  }
  return { instant: false, stages, totalMs: at };
}

export function stageAt(plan: EstimatePlan, elapsedMs: number): EstimateStage {
  if (plan.instant || elapsedMs >= plan.totalMs) return "done";
  const active = plan.stages.find((s) => elapsedMs >= s.start && elapsedMs < s.end);
  return active ? active.stage : "done";
}

const ORDER: EstimateStage[] = ["charge", "descend", "band", "ledger", "done"];
const atLeast = (stage: EstimateStage, floor: EstimateStage) => ORDER.indexOf(stage) >= ORDER.indexOf(floor);

/** The truth pointer is on (or descending onto) the beam. */
export const showsTruth = (stage: EstimateStage) => atLeast(stage, "descend");
/** The band, the verdict, the error plate and the truth readout are on. */
export const showsVerdict = (stage: EstimateStage) => atLeast(stage, "band");
/** The working ledger is on. */
export const showsLedger = (stage: EstimateStage) => atLeast(stage, "ledger");
