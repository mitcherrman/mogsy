import { DAMAGE_REVEAL_TIMELINE } from "./animationConfig";
import { STAT_CHECK_RULES, type CategoryResult, type RoundDamage, type Side } from "./statCheckEngine";

/**
 * Presentation model for the centre damage reveal.
 *
 * This module decides only how the round's damage is *told*: it consumes the
 * authoritative RoundDamage the engine (or the server) already produced, plus
 * the authoritative per-lane CategoryResults, and reconstructs the round in the
 * order the player just watched it — board result first, then the three lane
 * bonuses left → middle → right, then the total.
 *
 * It never adds, caps, or recalculates damage. Every figure here is a pure read
 * of RoundDamage / CategoryResult, and `damageRevealStep` asserts its own
 * arithmetic against the authoritative side total, so a rules change breaks the
 * tests rather than silently drifting the presentation.
 */

/** Stages the centre presentation moves through for ONE direction of damage. */
export type DamageRevealStage =
  | "idle"
  | "enter"
  | "board"
  | "lane-1"
  | "lane-2"
  | "lane-3"
  | "total"
  | "impact"
  | "health"
  | "settled";

/** The three lane stages, in strict board order. */
export const DAMAGE_LANE_STAGES = ["lane-1", "lane-2", "lane-3"] as const satisfies readonly DamageRevealStage[];

export type DamageLaneStage = (typeof DAMAGE_LANE_STAGES)[number];

export function isDamageLaneStage(stage: DamageRevealStage): stage is DamageLaneStage {
  return (DAMAGE_LANE_STAGES as readonly DamageRevealStage[]).includes(stage);
}

/**
 * How a direction of damage is headed.
 *
 * `winner` is the side that won the board and is therefore the round winner.
 * `counter` is the board-losing side's retaliation: it can still deal decisive
 * bonus damage, but it is never labelled as the round winner and never shows a
 * board-result number.
 */
export type DamageRevealKind = "winner" | "counter";

/** One lane's decisive bonus, as told in the tally. */
export type DamageLaneBonus = {
  /** 0 = left, 1 = middle, 2 = right. */
  lane: number;
  stage: DamageLaneStage;
  /** This lane's decisive award for the dealing side: 1 or 0. */
  amount: number;
  /** The centre number after this lane has been added. */
  runningTotal: number;
};

/** One direction of damage: `side` deals `total` to `target`. */
export type DamageRevealStep = {
  side: Side;
  target: Side;
  kind: DamageRevealKind;
  /**
   * The board award, sweep already folded in: 2 for a normal board win, 3 for a
   * 3–0 sweep, and 0 for a retaliation (which shows no board result at all).
   * This is the starting subtotal the lane bonuses are added to.
   */
  boardResult: number;
  /** True only for an authoritative 3–0 board sweep. */
  sweep: boolean;
  /** Always three entries, in strict left → middle → right board order. */
  laneBonuses: DamageLaneBonus[];
  total: number;
};

/**
 * The board award for a side, with the sweep bonus already folded in by the
 * engine. 2 on a normal board win, 3 on a sweep, 0 for the side that lost the
 * board (or a tied board, where neither side won it).
 */
export function damageBoardResultFor(damage: RoundDamage, side: Side): number {
  return side === "player" ? damage.playerBoardDamage : damage.botBoardDamage;
}

/** True only when this side's board award carries the 3–0 sweep bonus. */
export function damageSweptFor(damage: RoundDamage, side: Side): boolean {
  return damageBoardResultFor(damage, side) > STAT_CHECK_RULES.boardDamage;
}

/** Authoritative total this side dealt, read straight off RoundDamage. */
export function damageTotalFor(damage: RoundDamage, side: Side): number {
  return side === "player" ? damage.player : damage.bot;
}

/**
 * This side's decisive award per lane, in board order.
 *
 * Read straight off each lane's authoritative CategoryResult — a lane pays this
 * side only when this side won it AND the engine marked it decisive. Never
 * derived from any visual or animation state.
 */
export function damageLaneAmountsFor(results: readonly CategoryResult[], side: Side): number[] {
  return DAMAGE_LANE_STAGES.map((_stage, lane) => {
    const result = results[lane];
    if (!result) return 0;
    return result.winner === side && result.decisive ? STAT_CHECK_RULES.decisiveDamage : 0;
  });
}

/**
 * Build one direction's presentation.
 *
 * The running total starts at the board result and each lane is added onto it in
 * board order, which is exactly the arithmetic the plate shows. The assertion
 * ties that arithmetic to the authoritative side total: if the engine ever
 * awards damage from a source this decomposition does not know about, this
 * throws instead of quietly displaying a total that disagrees with the health
 * bars.
 */
export function damageRevealStep(damage: RoundDamage, results: readonly CategoryResult[], side: Side): DamageRevealStep {
  const isBoardWinner = damage.boardWinner === side;
  const boardResult = isBoardWinner ? damageBoardResultFor(damage, side) : 0;
  const total = damageTotalFor(damage, side);

  let runningTotal = boardResult;
  const laneBonuses = damageLaneAmountsFor(results, side).map((amount, lane): DamageLaneBonus => {
    runningTotal += amount;
    return { lane, stage: DAMAGE_LANE_STAGES[lane], amount, runningTotal };
  });

  if (runningTotal !== total) {
    throw new Error(
      `damageReveal: decomposition ${runningTotal} disagrees with authoritative ${side} damage ${total}`,
    );
  }

  return {
    side,
    target: side === "player" ? "bot" : "player",
    kind: isBoardWinner ? "winner" : "counter",
    boardResult,
    sweep: isBoardWinner && damageSweptFor(damage, side),
    laneBonuses,
    total,
  };
}

/**
 * The round's damage presentations, in resolution order.
 *
 * The board winner strikes first and the other side's retaliation follows. On a
 * tied board neither side won it, so the larger total leads with the player as a
 * deterministic tie-break — the ordering never depends on anything outside
 * RoundDamage. Sides that dealt nothing produce no step at all.
 */
export function damageRevealPlan(damage: RoundDamage, results: readonly CategoryResult[]): DamageRevealStep[] {
  const order: Side[] =
    damage.boardWinner === "player"
      ? ["player", "bot"]
      : damage.boardWinner === "bot"
        ? ["bot", "player"]
        : damage.player >= damage.bot
          ? ["player", "bot"]
          : ["bot", "player"];

  return order
    .filter((side) => damageTotalFor(damage, side) > 0)
    .map((side) => damageRevealStep(damage, results, side));
}

/**
 * Ordered stages for one step. A retaliation has no board result, so it skips
 * the board stage entirely and opens straight onto its lane bonuses.
 */
export function damageRevealStages(step: DamageRevealStep): DamageRevealStage[] {
  return [
    "enter",
    ...(step.kind === "winner" ? (["board"] as DamageRevealStage[]) : []),
    ...DAMAGE_LANE_STAGES,
    "total",
    "impact",
    "health",
    "settled",
  ];
}

/**
 * How long a given stage of a step holds. Lane holds depend on whether that
 * lane actually paid out: a `+1` lands with the decisive language, a `+0` is
 * subordinate and moves on. A sweep's board result holds longer, because the
 * floating SWEEP notification plays over it.
 */
export function damageRevealStageDurationMs(step: DamageRevealStep, stage: DamageRevealStage): number {
  const t = DAMAGE_REVEAL_TIMELINE;
  if (stage === "enter") return t.enterMs;
  if (stage === "board") return t.boardMs + (step.sweep ? t.sweepNoticeMs : 0);
  if (isDamageLaneStage(stage)) {
    const bonus = step.laneBonuses.find((entry) => entry.stage === stage);
    return bonus && bonus.amount > 0 ? t.laneBonusMs : t.laneZeroMs;
  }
  if (stage === "total") return t.totalHoldMs;
  if (stage === "impact") return t.impactMs;
  if (stage === "health") return t.healthMs;
  return 0;
}

/**
 * Offsets, relative to a step's own start, at which each of its stages begins.
 * Keyed by stage so the scheduler never has to know the layout.
 */
export function damageRevealStageOffsets(step: DamageRevealStep): Array<[DamageRevealStage, number]> {
  const offsets: Array<[DamageRevealStage, number]> = [];
  let at = 0;
  for (const stage of damageRevealStages(step)) {
    offsets.push([stage, at]);
    at += damageRevealStageDurationMs(step, stage);
  }
  return offsets;
}

/** Total time one direction occupies, including its trailing clear. */
export function damageRevealStepTotalMs(step: DamageRevealStep): number {
  const offsets = damageRevealStageOffsets(step);
  const settled = offsets[offsets.length - 1][1];
  return settled + DAMAGE_REVEAL_TIMELINE.clearMs;
}

/** Start offset of each step, relative to the start of the whole presentation. */
export function damageRevealStepStarts(plan: DamageRevealStep[]): number[] {
  const starts: number[] = [];
  let at = 0;
  for (const step of plan) {
    starts.push(at);
    at += damageRevealStepTotalMs(step) + DAMAGE_REVEAL_TIMELINE.betweenSidesMs;
  }
  return starts;
}

/**
 * Total time the whole presentation occupies. An empty plan (a round where
 * neither side dealt damage) costs nothing, so the reveal keeps its original
 * pacing on those rounds.
 */
export function damageRevealPlanTotalMs(plan: DamageRevealStep[]): number {
  if (plan.length === 0) return 0;
  const starts = damageRevealStepStarts(plan);
  return starts[plan.length - 1] + damageRevealStepTotalMs(plan[plan.length - 1]);
}

/**
 * The number the centre shows at a given stage. Before the board result lands
 * there is nothing to show; from the board result on it is the running subtotal;
 * once the lanes are in it is the authoritative total.
 */
export function damageRevealShownTotal(step: DamageRevealStep, stage: DamageRevealStage): number {
  if (stage === "idle" || stage === "enter") return 0;
  if (stage === "board") return step.boardResult;
  if (isDamageLaneStage(stage)) {
    const bonus = step.laneBonuses.find((entry) => entry.stage === stage);
    if (bonus) return bonus.runningTotal;
  }
  return step.total;
}

/** Lanes whose bonus has been revealed at this stage, in board order. */
export function damageRevealedLanes(step: DamageRevealStep, stage: DamageRevealStage): DamageLaneBonus[] {
  if (stage === "idle" || stage === "enter" || stage === "board") return [];
  if (isDamageLaneStage(stage)) {
    const index = DAMAGE_LANE_STAGES.indexOf(stage);
    return step.laneBonuses.slice(0, index + 1);
  }
  return step.laneBonuses;
}

/** True once the board-result number is on screen. */
export function damageRevealBoardShown(step: DamageRevealStep, stage: DamageRevealStage): boolean {
  return step.kind === "winner" && stage !== "idle" && stage !== "enter";
}

/**
 * True while the floating SWEEP notification is up: an authoritative 3–0 only,
 * and only during the board stage that established the `3`. It is derived
 * purely from the step and the current stage, so it owns no state of its own and
 * cannot replay on reconnect or recovery.
 */
export function damageRevealSweepVisible(step: DamageRevealStep, stage: DamageRevealStage): boolean {
  return step.sweep && stage === "board";
}

/** True once the target's health bar may show its post-damage value. */
export function damageRevealHealthApplied(stage: DamageRevealStage): boolean {
  return stage === "health" || stage === "settled";
}
