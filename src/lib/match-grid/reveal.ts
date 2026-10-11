/**
 * MATCH GRID — the reveal clock. A plan, not a grader: which stage the board
 * is in at a given time since the reveal arrived. The host decides what is
 * correct; this decides only WHEN each already-decided fact is shown.
 *
 *   freeze  — the player's map is held still; the instrument wakes.
 *   marks   — stable threads brighten, fractured threads break.
 *   travel  — misplaced sigils cross to their canonical seal; new threads ink in.
 *   ledger  — the written classification settles into the well's footprint.
 *   done    — the host is told once.
 *
 * Reduced motion: `instant`, the first frame is the settled frame, every fact
 * still shown. The whole sequence lands inside the arena's reveal budget.
 */

export type RevealStage = "freeze" | "marks" | "travel" | "ledger" | "done";

export interface RevealPlan {
  instant: boolean;
  /** Stage start times in ms since the reveal arrived, ascending. */
  stages: readonly { stage: RevealStage; at: number }[];
  total: number;
}

export const REVEAL_TIMING = {
  freeze: 0,
  marks: 320,
  travel: 760,
  /** How long a travelling sigil takes to cross (CSS transition, keep in sync). */
  travelMs: 560,
  ledgerAfterTravel: 1340,
  ledgerWithoutTravel: 1000,
  tail: 160,
} as const;

export function planReveal(input: { reduced: boolean; hasTravel: boolean }): RevealPlan {
  if (input.reduced) {
    return { instant: true, stages: [{ stage: "done", at: 0 }], total: 0 };
  }
  const ledger = input.hasTravel ? REVEAL_TIMING.ledgerAfterTravel : REVEAL_TIMING.ledgerWithoutTravel;
  const stages: { stage: RevealStage; at: number }[] = [
    { stage: "freeze", at: REVEAL_TIMING.freeze },
    { stage: "marks", at: REVEAL_TIMING.marks },
  ];
  if (input.hasTravel) stages.push({ stage: "travel", at: REVEAL_TIMING.travel });
  stages.push({ stage: "ledger", at: ledger });
  const total = ledger + REVEAL_TIMING.tail;
  stages.push({ stage: "done", at: total });
  return { instant: false, stages, total };
}

/** The stage in force at `elapsed` ms. */
export function stageAt(plan: RevealPlan, elapsed: number): RevealStage {
  let current: RevealStage = plan.stages[0]?.stage ?? "done";
  for (const s of plan.stages) if (elapsed >= s.at) current = s.stage;
  return current;
}

const ORDER: readonly RevealStage[] = ["freeze", "marks", "travel", "ledger", "done"];

/** Whether `stage` has been reached (inclusive) at `current`. */
export function reached(current: RevealStage, stage: RevealStage): boolean {
  return ORDER.indexOf(current) >= ORDER.indexOf(stage);
}
