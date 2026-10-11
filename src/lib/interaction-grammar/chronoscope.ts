/**
 * MIG — CHRONOSCOPE (SCRUB): the pure parts of the instrument.
 *
 * Position, snapping, pointer and keyboard arithmetic, and the reveal clock.
 * No React, no DOM, no domain: a "checkpoint" is an index on a rail and
 * nothing here knows what a checkpoint holds. Grading lives with the host's
 * authority and is never done here (a source test pins that nothing in this
 * file reads a reveal).
 */
import type { ChronoscopePublic } from "./types";

export const CHRONOSCOPE_MIN_CHECKPOINTS = 2;

export function assertChronoscopeContent(content: ChronoscopePublic<unknown>): void {
  const n = content.checkpoints.length;
  if (n < CHRONOSCOPE_MIN_CHECKPOINTS) {
    throw new Error(`Chronoscope: needs at least ${CHRONOSCOPE_MIN_CHECKPOINTS} checkpoints, got ${n}`);
  }
  const tokens = new Set(content.checkpoints.map((c) => c.token));
  if (tokens.size !== n) throw new Error("Chronoscope: checkpoint tokens must be distinct");
  for (const mark of content.railMarks ?? []) {
    if (!Number.isInteger(mark.index) || mark.index < 0 || mark.index >= n) {
      throw new Error(`Chronoscope: rail mark index ${mark.index} is off the rail`);
    }
  }
}

// ------------------------------------------------------------------- position

/** A fractional rail position, clamped to [0, n - 1]. */
export function clampPosition(position: number, count: number): number {
  if (!Number.isFinite(position)) return 0;
  return Math.min(count - 1, Math.max(0, position));
}

/** The detent a fractional position magnetises to on release. */
export function snapPosition(position: number, count: number): number {
  return Math.round(clampPosition(position, count));
}

/** The two checkpoints a fractional position lies between and how far along. */
export function frameAt(position: number, count: number): { from: number; to: number; t: number } {
  const p = clampPosition(position, count);
  const from = Math.floor(p);
  const to = Math.min(count - 1, from + 1);
  const t = from === to ? 0 : p - from;
  return { from, to, t };
}

/** Where the `index`-th detent sits across the rail's travel, 0..1. */
export function detentFraction(index: number, count: number): number {
  return count <= 1 ? 0 : index / (count - 1);
}

/**
 * The rail geometry: the detents sit on a track inset from both ends of the
 * rail box by `insetPx`, so the reticle never hangs past the stone.
 */
export interface RailGeometry {
  left: number;
  width: number;
  insetPx: number;
}

/** A pointer x (client coordinates) → the fractional position under it. */
export function positionFromPointer(clientX: number, rail: RailGeometry, count: number): number {
  const travel = Math.max(1, rail.width - 2 * rail.insetPx);
  const fraction = (clientX - rail.left - rail.insetPx) / travel;
  return clampPosition(fraction * (count - 1), count);
}

// ------------------------------------------------------------------- keyboard

/**
 * The checkpoint a key moves the reticle to, or null for a key the rail does
 * not own. Arrows step one checkpoint; PageUp / PageDown step `pageStep`;
 * Home / End jump to the ends. Up / Right advance, Down / Left retreat.
 */
export function stepIndexForKey(
  key: string, index: number, count: number, pageStep: number,
): number | null {
  const last = count - 1;
  switch (key) {
    case "ArrowRight": case "ArrowUp": return Math.min(last, index + 1);
    case "ArrowLeft": case "ArrowDown": return Math.max(0, index - 1);
    case "PageUp": return Math.min(last, index + pageStep);
    case "PageDown": return Math.max(0, index - pageStep);
    case "Home": return 0;
    case "End": return last;
    default: return null;
  }
}

// --------------------------------------------------------------- reveal clock

/**
 * The reveal is a bounded choreography on ONE clock:
 *
 *   clamp     the lock marker closes on the chosen detent, the instrument
 *             charges;
 *   traverse  (only when the lock was wrong) the reticle travels from the
 *             chosen detent to the canonical one through every checkpoint
 *             between them;
 *   settle    the canonical detent lights, the lens holds the canonical state;
 *   proof     the reading plate becomes the before → after proof.
 *
 * `budgetMs` scales every stage: the prototype host plays the full 1500 ms
 * study; a Ranked host that can only rely on its 900 ms minimum hold passes
 * that and the SAME shape plays faster (pinned in tests). Reduced motion has
 * no clock: the first frame is the settled, proven frame.
 */
export type ChronoscopeStage = "clamp" | "traverse" | "settle" | "proof" | "done";

export interface ChronoscopePlanInput {
  reduced: boolean;
  /** |canonical index − locked index|. 0 for a correct lock. */
  distance: number;
  /** Total choreography length. Default 1500. */
  budgetMs?: number;
}

export interface ChronoscopePlan {
  instant: boolean;
  stages: readonly { stage: Exclude<ChronoscopeStage, "done">; start: number; end: number }[];
  totalMs: number;
}

export const CHRONOSCOPE_BUDGET_MS = 1500;

/** Stage shares of the budget. Traverse takes what is left after the others. */
const SHARE = { clamp: 0.18, settle: 0.2, proof: 0.22 } as const;

export function planChronoscopeReveal({ reduced, distance, budgetMs = CHRONOSCOPE_BUDGET_MS }: ChronoscopePlanInput): ChronoscopePlan {
  if (reduced) return { instant: true, stages: [], totalMs: 0 };
  const budget = Math.max(300, budgetMs);
  const clamp = Math.round(budget * SHARE.clamp);
  const settle = Math.round(budget * SHARE.settle);
  const proof = Math.round(budget * SHARE.proof);
  const traverse = distance > 0 ? budget - clamp - settle - proof : 0;
  const stages: { stage: Exclude<ChronoscopeStage, "done">; start: number; end: number }[] = [];
  let at = 0;
  const push = (stage: Exclude<ChronoscopeStage, "done">, ms: number) => {
    if (ms <= 0) return;
    stages.push({ stage, start: at, end: at + ms });
    at += ms;
  };
  push("clamp", clamp);
  push("traverse", traverse);
  push("settle", settle);
  push("proof", proof);
  return { instant: false, stages, totalMs: at };
}

export function stageAt(plan: ChronoscopePlan, elapsedMs: number): ChronoscopeStage {
  if (plan.instant || elapsedMs >= plan.totalMs) return "done";
  const active = plan.stages.find((s) => elapsedMs >= s.start && elapsedMs < s.end);
  return active ? active.stage : "done";
}

/** The traverse window, or null when the plan has none. */
export function traverseWindow(plan: ChronoscopePlan): { start: number; end: number } | null {
  const s = plan.stages.find((x) => x.stage === "traverse");
  return s ? { start: s.start, end: s.end } : null;
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * The reticle's fractional position `elapsedMs` into the reveal: parked on
 * the locked detent through the clamp, eased along the rail during the
 * traverse, and parked on the canonical detent after it.
 */
export function revealPosition(
  plan: ChronoscopePlan, elapsedMs: number, lockedIndex: number, canonicalIndex: number,
): number {
  const w = traverseWindow(plan);
  if (plan.instant || !w || elapsedMs >= w.end) return canonicalIndex;
  if (elapsedMs <= w.start) return lockedIndex;
  const t = easeInOutCubic((elapsedMs - w.start) / (w.end - w.start));
  return lockedIndex + (canonicalIndex - lockedIndex) * t;
}

/** True once the canonical detent is on show (settle and later). */
export const showsCanonical = (stage: ChronoscopeStage) => stage === "settle" || stage === "proof" || stage === "done";
/** True once the proof has replaced the live reading. */
export const showsProof = (stage: ChronoscopeStage) => stage === "proof" || stage === "done";
