import { describe, expect, it } from "vitest";
import { DAMAGE_REVEAL_TIMELINE } from "./animationConfig";
import {
  damageComponentsFor,
  damageRevealPlan,
  damageRevealPlanTotalMs,
  damageRevealShownTotal,
  damageRevealStageOffsets,
  damageRevealStages,
  damageRevealStepStarts,
  damageRevealStepTotalMs,
  damageTotalFor,
  type DamageRevealStage,
} from "./damageReveal";
import { STAT_CHECK_RULES, calculateRoundDamage, type CategoryResult, type Side } from "./statCheckEngine";

/**
 * Damage always comes from the engine here, never from a hand-written literal:
 * these fixtures feed real CategoryResults through calculateRoundDamage, so a
 * rules change would break these tests rather than silently drift the
 * presentation away from what the board actually did.
 */
function lane(winner: Side | "tie", decisive: boolean): CategoryResult {
  return { winner, decisive } as CategoryResult;
}

const SWEEP_DECISIVE_X2 = calculateRoundDamage([
  lane("player", true),
  lane("player", true),
  lane("player", false),
]);
const PLAIN_BOARD_WIN = calculateRoundDamage([lane("player", false), lane("player", false), lane("bot", false)]);
const TWO_WAY = calculateRoundDamage([lane("player", true), lane("player", false), lane("bot", true)]);
const NO_DAMAGE = calculateRoundDamage([lane("player", false), lane("bot", false), lane("tie", false)]);
const TIED_BOARD_BOTH_DECISIVE = calculateRoundDamage([
  lane("player", true),
  lane("bot", true),
  lane("tie", false),
]);

describe("damage component decomposition", () => {
  it("splits the engine's folded board figure into board win and sweep", () => {
    // The engine reports playerBoardDamage = board + sweep as one number.
    expect(SWEEP_DECISIVE_X2.playerBoardDamage).toBe(
      STAT_CHECK_RULES.boardDamage + STAT_CHECK_RULES.sweepBonusDamage,
    );
    expect(damageComponentsFor(SWEEP_DECISIVE_X2, "player")).toEqual([
      { kind: "board", amount: 2, runningTotal: 2 },
      { kind: "sweep", amount: 1, runningTotal: 3 },
      { kind: "decisive", amount: 2, runningTotal: 5 },
    ]);
  });

  it("counts up 2 -> 3 -> 5 and lands on the authoritative total", () => {
    const components = damageComponentsFor(SWEEP_DECISIVE_X2, "player");
    expect(components.map((component) => component.runningTotal)).toEqual([2, 3, 5]);
    expect(components[components.length - 1].runningTotal).toBe(damageTotalFor(SWEEP_DECISIVE_X2, "player"));
    expect(damageTotalFor(SWEEP_DECISIVE_X2, "player")).toBe(SWEEP_DECISIVE_X2.player);
  });

  it("skips components the round did not produce", () => {
    // 2 lanes won, no sweep, nothing decisive: board win only.
    expect(damageComponentsFor(PLAIN_BOARD_WIN, "player")).toEqual([
      { kind: "board", amount: 2, runningTotal: 2 },
    ]);
    // The losing side of a plain board win deals nothing at all.
    expect(damageComponentsFor(PLAIN_BOARD_WIN, "bot")).toEqual([]);
  });

  it("presents retaliation as decisive-only, with no phantom board win", () => {
    expect(TWO_WAY.botBoardDamage).toBe(0);
    expect(damageComponentsFor(TWO_WAY, "bot")).toEqual([{ kind: "decisive", amount: 1, runningTotal: 1 }]);
  });

  it("never invents damage: every component sum matches the engine", () => {
    for (const damage of [SWEEP_DECISIVE_X2, PLAIN_BOARD_WIN, TWO_WAY, NO_DAMAGE, TIED_BOARD_BOTH_DECISIVE]) {
      for (const side of ["player", "bot"] as const) {
        const sum = damageComponentsFor(damage, side).reduce((total, component) => total + component.amount, 0);
        expect(sum).toBe(damageTotalFor(damage, side));
      }
    }
  });
});

describe("damage reveal plan", () => {
  it("resolves the board winner first, then retaliation against the other side", () => {
    const plan = damageRevealPlan(TWO_WAY);
    expect(plan.map((step) => step.side)).toEqual(["player", "bot"]);
    expect(plan.map((step) => step.target)).toEqual(["bot", "player"]);
    expect(plan.map((step) => step.total)).toEqual([TWO_WAY.player, TWO_WAY.bot]);
  });

  it("leads with the board winner even when the opponent is the board winner", () => {
    const botWins = calculateRoundDamage([lane("bot", true), lane("bot", false), lane("player", true)]);
    const plan = damageRevealPlan(botWins);
    expect(plan.map((step) => step.side)).toEqual(["bot", "player"]);
    expect(plan[0].target).toBe("player");
  });

  it("produces no step for a side that dealt nothing", () => {
    const plan = damageRevealPlan(PLAIN_BOARD_WIN);
    expect(plan).toHaveLength(1);
    expect(plan[0].side).toBe("player");
  });

  it("produces no presentation at all for a round with no damage", () => {
    expect(damageRevealPlan(NO_DAMAGE)).toEqual([]);
    expect(damageRevealPlanTotalMs(damageRevealPlan(NO_DAMAGE))).toBe(0);
  });

  it("orders a tied board deterministically by total, player first on a draw", () => {
    // Tied board: no board damage on either side, one decisive lane each, so
    // the two retaliations are equal and the player leads by the tie-break.
    expect(TIED_BOARD_BOTH_DECISIVE.boardWinner).toBe("tie");
    expect(TIED_BOARD_BOTH_DECISIVE.playerBoardDamage).toBe(0);
    expect(TIED_BOARD_BOTH_DECISIVE.botBoardDamage).toBe(0);
    expect(damageRevealPlan(TIED_BOARD_BOTH_DECISIVE).map((step) => step.side)).toEqual(["player", "bot"]);

    // The larger total leads when a tied board is not symmetrical. Today's
    // three-lane rules cannot reach an asymmetric tie, so this pins the
    // ordering rule itself rather than a board the engine can generate.
    const botAhead = { ...TIED_BOARD_BOTH_DECISIVE, bot: 2, botDecisiveDamage: 2 };
    expect(damageRevealPlan(botAhead).map((step) => step.side)).toEqual(["bot", "player"]);
  });
});

describe("damage reveal staging", () => {
  const step = damageRevealPlan(SWEEP_DECISIVE_X2)[0];

  it("stages only the components the step actually has", () => {
    expect(damageRevealStages(step)).toEqual([
      "enter",
      "board",
      "sweep",
      "decisive",
      "total",
      "impact",
      "health",
      "settled",
    ]);
    const retaliation = damageRevealPlan(TWO_WAY)[1];
    expect(damageRevealStages(retaliation)).toEqual(["enter", "decisive", "total", "impact", "health", "settled"]);
  });

  it("advances strictly forward with no two stages sharing an offset", () => {
    const offsets = damageRevealStageOffsets(step).map(([, at]) => at);
    for (let i = 1; i < offsets.length; i++) expect(offsets[i]).toBeGreaterThan(offsets[i - 1]);
  });

  it("derives every offset from the centralized timeline", () => {
    const t = DAMAGE_REVEAL_TIMELINE;
    const offsets = Object.fromEntries(damageRevealStageOffsets(step)) as Record<DamageRevealStage, number>;
    expect(offsets.enter).toBe(0);
    expect(offsets.board).toBe(t.enterMs);
    expect(offsets.sweep).toBe(t.enterMs + t.componentMs);
    expect(offsets.decisive).toBe(t.enterMs + t.componentMs * 2);
    expect(offsets.total).toBe(t.enterMs + t.componentMs * 3);
    expect(offsets.impact).toBe(offsets.total + t.totalHoldMs);
    expect(offsets.health).toBe(offsets.impact + t.impactMs);
    expect(offsets.settled).toBe(offsets.health + t.healthMs);
    expect(damageRevealStepTotalMs(step)).toBe(offsets.settled + t.clearMs);
  });

  it("runs the two directions one after another, never together", () => {
    const plan = damageRevealPlan(TWO_WAY);
    const starts = damageRevealStepStarts(plan);
    expect(starts[0]).toBe(0);
    expect(starts[1]).toBe(damageRevealStepTotalMs(plan[0]) + DAMAGE_REVEAL_TIMELINE.betweenSidesMs);
    expect(damageRevealPlanTotalMs(plan)).toBe(starts[1] + damageRevealStepTotalMs(plan[1]));
  });

  it("holds the running total at each stage and the full total from the strike on", () => {
    expect(damageRevealShownTotal(step, "enter")).toBe(0);
    expect(damageRevealShownTotal(step, "board")).toBe(2);
    expect(damageRevealShownTotal(step, "sweep")).toBe(3);
    expect(damageRevealShownTotal(step, "decisive")).toBe(5);
    for (const stage of ["total", "impact", "health", "settled"] as const) {
      expect(damageRevealShownTotal(step, stage)).toBe(step.total);
    }
  });
});
