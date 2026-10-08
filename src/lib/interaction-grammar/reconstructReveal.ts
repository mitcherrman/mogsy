/**
 * MIG — RECONSTRUCT's reveal clock, as pure data.
 *
 * The reveal is three stages on one clock, and that clock is the ONLY clock: a
 * host never cuts it short (the OF4-FIX1 lesson: a hold shorter than the
 * choreography ate the reveal) and the primitive reports when it ends.
 *
 *   marks     0 – 450 ms   submitted picks stay put and gain ✓ / ✗
 *   settle  450 – 1050 ms  each wrong pick demotes to a small "your pick" and
 *                          the missing canonical part fills its socket
 *   evidence 1050 – 1500   host-supplied figures appear
 *
 * Skipped stages leave no gap: a fully correct build has no settle (marks, then
 * evidence at 450 – 900), a reveal with no evidence ends when settle does, and
 * reduced motion has no clock at all (`instant`: everything at t = 0).
 */

export type ReconstructStage = "marks" | "settle" | "evidence" | "done";

/** Cumulative ends of the full sequence, in ms from the moment the reveal starts. */
export const RECONSTRUCT_TIMING = {
  marksEnd: 450,
  settleEnd: 1050,
  evidenceEnd: 1500,
  /** Per-socket stagger and tween inside the settle window. */
  settleStagger: 100,
  settleTween: 240,
  marksTween: 200,
  evidenceTween: 300,
} as const;

export interface ReconstructPlanInput {
  reduced: boolean;
  /** Any socket marked wrong. When false there is no settle stage. */
  anyWrong: boolean;
  /** Any host evidence to show. When false there is no evidence stage. */
  hasEvidence: boolean;
}

export interface ReconstructPlan {
  /** True under reduced motion: the whole reveal is the settled frame at t = 0. */
  instant: boolean;
  stages: readonly { stage: Exclude<ReconstructStage, "done">; start: number; end: number }[];
  /** When `done` is reached. 0 for an instant plan. */
  totalMs: number;
}

export function planReveal({ reduced, anyWrong, hasEvidence }: ReconstructPlanInput): ReconstructPlan {
  if (reduced) return { instant: true, stages: [], totalMs: 0 };
  const T = RECONSTRUCT_TIMING;
  const stages: { stage: Exclude<ReconstructStage, "done">; start: number; end: number }[] = [
    { stage: "marks", start: 0, end: T.marksEnd },
  ];
  let at: number = T.marksEnd;
  if (anyWrong) {
    stages.push({ stage: "settle", start: at, end: T.settleEnd });
    at = T.settleEnd;
  }
  if (hasEvidence) {
    stages.push({ stage: "evidence", start: at, end: at + (T.evidenceEnd - T.settleEnd) });
    at += T.evidenceEnd - T.settleEnd;
  }
  return { instant: false, stages, totalMs: at };
}

/** The stage in force `elapsedMs` after the reveal began. */
export function stageAt(plan: ReconstructPlan, elapsedMs: number): ReconstructStage {
  if (plan.instant || elapsedMs >= plan.totalMs) return "done";
  const active = plan.stages.find((s) => elapsedMs >= s.start && elapsedMs < s.end);
  return active ? active.stage : "done";
}

/** True once the settled sockets are on show (every stage after marks). */
export const showsSettled = (stage: ReconstructStage) => stage !== "marks";
/** True once the host's evidence is on show. */
export const showsEvidence = (stage: ReconstructStage) => stage === "evidence" || stage === "done";

/**
 * Delay for the `index`-th wrong socket's settle tween, within the settle
 * window. The last of `RECONSTRUCT_MAX_SLOTS` finishes inside it (tested).
 */
export const settleDelayMs = (index: number) => index * RECONSTRUCT_TIMING.settleStagger;
