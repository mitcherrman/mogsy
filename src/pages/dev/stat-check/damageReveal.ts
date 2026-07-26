import { DAMAGE_REVEAL_TIMELINE } from "./animationConfig";
import { STAT_CHECK_RULES, type RoundDamage, type Side } from "./statCheckEngine";

/**
 * Presentation model for the centre damage reveal.
 *
 * This module decides only how the round's damage is *told*: it consumes the
 * authoritative RoundDamage the engine (or the server) already produced and
 * decomposes it into the components that produced it. It never adds, caps, or
 * recalculates damage — every function here is a pure read of RoundDamage, and
 * `damageComponentsFor` is asserted against the authoritative side total.
 */

/** Stages the centre presentation moves through for ONE direction of damage. */
export type DamageRevealStage =
  | "idle"
  | "enter"
  | "board"
  | "sweep"
  | "decisive"
  | "total"
  | "impact"
  | "health"
  | "settled";

/** The three ways Stat Check produces damage, in the order they are told. */
export type DamageComponentKind = "board" | "sweep" | "decisive";

export const DAMAGE_COMPONENT_ORDER = ["board", "sweep", "decisive"] as const satisfies readonly DamageComponentKind[];

/** Board-facing wording for a component; the number stays primary. */
export const DAMAGE_COMPONENT_LABELS: Record<DamageComponentKind, string> = {
  board: "Board win",
  sweep: "Sweep",
  decisive: "Decisive",
};

export type DamageComponent = {
  kind: DamageComponentKind;
  /** How much this component contributed. Always > 0 — zeros are skipped. */
  amount: number;
  /** The centre number after this component has been added. */
  runningTotal: number;
};

/** One direction of damage: `side` deals `total` to `target`. */
export type DamageRevealStep = {
  side: Side;
  target: Side;
  components: DamageComponent[];
  total: number;
};

/**
 * Decompose one side's authoritative damage into its sources.
 *
 * The engine folds the sweep bonus into `*BoardDamage`, so the board component
 * is the flat board award and the sweep component is whatever that figure
 * carries above it. Zero components are omitted entirely.
 */
export function damageComponentsFor(damage: RoundDamage, side: Side): DamageComponent[] {
  const boardTotal = side === "player" ? damage.playerBoardDamage : damage.botBoardDamage;
  const decisive = side === "player" ? damage.playerDecisiveDamage : damage.botDecisiveDamage;
  const board = boardTotal > 0 ? Math.min(STAT_CHECK_RULES.boardDamage, boardTotal) : 0;
  const sweep = Math.max(0, boardTotal - board);

  const components: DamageComponent[] = [];
  let runningTotal = 0;
  for (const [kind, amount] of [
    ["board", board],
    ["sweep", sweep],
    ["decisive", decisive],
  ] as const) {
    if (amount <= 0) continue;
    runningTotal += amount;
    components.push({ kind, amount, runningTotal });
  }
  return components;
}

/** Authoritative total this side dealt, read straight off RoundDamage. */
export function damageTotalFor(damage: RoundDamage, side: Side): number {
  return side === "player" ? damage.player : damage.bot;
}

/**
 * The round's damage presentations, in resolution order.
 *
 * The board winner strikes first and the other side's retaliation (decisive
 * bonuses it still earned) follows. On a tied board neither side won it, so
 * the larger total leads, with the player as a deterministic tie-break — the
 * ordering never depends on anything outside RoundDamage. Sides that dealt
 * nothing produce no step at all.
 */
export function damageRevealPlan(damage: RoundDamage): DamageRevealStep[] {
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
    .map((side) => ({
      side,
      target: side === "player" ? ("bot" as Side) : ("player" as Side),
      components: damageComponentsFor(damage, side),
      total: damageTotalFor(damage, side),
    }));
}

/** Ordered stages for one step, containing only the components it actually has. */
export function damageRevealStages(step: DamageRevealStep): DamageRevealStage[] {
  return ["enter", ...step.components.map((component) => component.kind), "total", "impact", "health", "settled"];
}

/**
 * Offsets, relative to a step's own start, at which each of its stages begins.
 * Keyed by stage so the scheduler never has to know the component layout.
 */
export function damageRevealStageOffsets(step: DamageRevealStep): Array<[DamageRevealStage, number]> {
  const t = DAMAGE_REVEAL_TIMELINE;
  const offsets: Array<[DamageRevealStage, number]> = [["enter", 0]];
  let at = t.enterMs;
  for (const component of step.components) {
    offsets.push([component.kind, at]);
    at += t.componentMs;
  }
  offsets.push(["total", at]);
  at += t.totalHoldMs;
  offsets.push(["impact", at]);
  at += t.impactMs;
  offsets.push(["health", at]);
  at += t.healthMs;
  offsets.push(["settled", at]);
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

/** The number the centre shows at a given stage of a step. */
export function damageRevealShownTotal(step: DamageRevealStep, stage: DamageRevealStage): number {
  if (stage === "idle" || stage === "enter") return 0;
  const component = step.components.find((entry) => entry.kind === stage);
  if (component) return component.runningTotal;
  return step.total;
}

/** True once the target's health bar may show its post-damage value. */
export function damageRevealHealthApplied(stage: DamageRevealStage): boolean {
  return stage === "health" || stage === "settled";
}
