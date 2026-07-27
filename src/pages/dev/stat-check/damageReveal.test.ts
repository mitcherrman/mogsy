import { describe, expect, it } from "vitest";
import { DAMAGE_REVEAL_TIMELINE } from "./animationConfig";
import {
  DAMAGE_LANE_STAGES,
  damageBoardResultFor,
  damageLaneAmountsFor,
  damageRevealBoardShown,
  damageRevealPlan,
  damageRevealPlanTotalMs,
  damageRevealShownTotal,
  damageRevealStageOffsets,
  damageRevealStages,
  damageRevealStepStarts,
  damageRevealStepTotalMs,
  damageRevealSweepVisible,
  damageRevealedLanes,
  damageSweptFor,
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

/** A round: its authoritative lanes, in board order, and its damage. */
function round(results: CategoryResult[]) {
  return { results, damage: calculateRoundDamage(results) };
}

/** 3–0 sweep, decisive on the left and right lanes: board 3, +1 +0 +1 = 5. */
const SWEEP = round([lane("player", true), lane("player", false), lane("player", true)]);
/** 2–1 board win, decisive on the left and right lanes: board 2, +1 +0 +1 = 4. */
const BOARD_WIN_TWO_DECISIVE = round([lane("player", true), lane("bot", false), lane("player", true)]);
/** 2–1 board win, nothing decisive: board 2, +0 +0 +0 = 2. */
const PLAIN_BOARD_WIN = round([lane("player", false), lane("player", false), lane("bot", false)]);
/** Player takes the board and one decisive; the bot counters from lane 3. */
const TWO_WAY = round([lane("player", true), lane("player", false), lane("bot", true)]);
const NO_DAMAGE = round([lane("player", false), lane("bot", false), lane("tie", false)]);
const TIED_BOARD_BOTH_DECISIVE = round([lane("player", true), lane("bot", true), lane("tie", false)]);

describe("board result and sweep", () => {
  it("reads the board award with the sweep already folded in", () => {
    expect(damageBoardResultFor(BOARD_WIN_TWO_DECISIVE.damage, "player")).toBe(STAT_CHECK_RULES.boardDamage);
    expect(damageBoardResultFor(SWEEP.damage, "player")).toBe(
      STAT_CHECK_RULES.boardDamage + STAT_CHECK_RULES.sweepBonusDamage,
    );
  });

  it("recognises a sweep only when the board award carries the bonus", () => {
    expect(damageSweptFor(SWEEP.damage, "player")).toBe(true);
    expect(damageSweptFor(BOARD_WIN_TWO_DECISIVE.damage, "player")).toBe(false);
    expect(damageSweptFor(PLAIN_BOARD_WIN.damage, "player")).toBe(false);
    // The side that lost the board never swept it.
    expect(damageSweptFor(SWEEP.damage, "bot")).toBe(false);
  });

  it("starts the winner's subtotal at 2 for a board win and 3 for a sweep", () => {
    expect(damageRevealPlan(BOARD_WIN_TWO_DECISIVE.damage, BOARD_WIN_TWO_DECISIVE.results)[0].boardResult).toBe(2);
    expect(damageRevealPlan(SWEEP.damage, SWEEP.results)[0].boardResult).toBe(3);
  });

  it("shows no board result on a retaliation", () => {
    const retaliation = damageRevealPlan(TWO_WAY.damage, TWO_WAY.results)[1];
    expect(retaliation.kind).toBe("counter");
    expect(retaliation.boardResult).toBe(0);
    expect(retaliation.sweep).toBe(false);
    expect(damageRevealBoardShown(retaliation, "lane-1")).toBe(false);
  });

  it("never presents either side of a tied board as the round winner", () => {
    expect(TIED_BOARD_BOTH_DECISIVE.damage.boardWinner).toBe("tie");
    const plan = damageRevealPlan(TIED_BOARD_BOTH_DECISIVE.damage, TIED_BOARD_BOTH_DECISIVE.results);
    expect(plan.map((step) => step.kind)).toEqual(["counter", "counter"]);
    expect(plan.map((step) => step.boardResult)).toEqual([0, 0]);
  });
});

describe("lane decisive bonuses", () => {
  it("reports all three lanes in strict board order, including zeros", () => {
    expect(damageLaneAmountsFor(SWEEP.results, "player")).toEqual([1, 0, 1]);
    expect(damageLaneAmountsFor(PLAIN_BOARD_WIN.results, "player")).toEqual([0, 0, 0]);
  });

  it("pays a lane only to the side that actually won it decisively", () => {
    // Lane 3 is a decisive bot win: it pays the bot, never the player.
    expect(damageLaneAmountsFor(TWO_WAY.results, "player")).toEqual([1, 0, 0]);
    expect(damageLaneAmountsFor(TWO_WAY.results, "bot")).toEqual([0, 0, 1]);
  });

  it("pays nothing for a tie", () => {
    expect(damageLaneAmountsFor([lane("tie", false), lane("tie", false), lane("tie", false)], "player")).toEqual([
      0, 0, 0,
    ]);
  });

  it("carries all three lanes on every step, with the board order fixed", () => {
    const step = damageRevealPlan(SWEEP.damage, SWEEP.results)[0];
    expect(step.laneBonuses).toHaveLength(3);
    expect(step.laneBonuses.map((bonus) => bonus.lane)).toEqual([0, 1, 2]);
    expect(step.laneBonuses.map((bonus) => bonus.stage)).toEqual([...DAMAGE_LANE_STAGES]);
    expect(step.laneBonuses.map((bonus) => bonus.amount)).toEqual([1, 0, 1]);
  });

  it("runs the subtotal up from the board result, lane by lane", () => {
    // Board 3, then +1, +0, +1 -> 4, 4, 5.
    const step = damageRevealPlan(SWEEP.damage, SWEEP.results)[0];
    expect(step.laneBonuses.map((bonus) => bonus.runningTotal)).toEqual([4, 4, 5]);
    expect(step.total).toBe(5);
  });

  it("runs a retaliation's subtotal up from zero", () => {
    const retaliation = damageRevealPlan(TWO_WAY.damage, TWO_WAY.results)[1];
    expect(retaliation.laneBonuses.map((bonus) => bonus.amount)).toEqual([0, 0, 1]);
    expect(retaliation.laneBonuses.map((bonus) => bonus.runningTotal)).toEqual([0, 0, 1]);
    expect(retaliation.total).toBe(1);
  });
});

describe("tally arithmetic against the engine", () => {
  const ROUNDS = [SWEEP, BOARD_WIN_TWO_DECISIVE, PLAIN_BOARD_WIN, TWO_WAY, NO_DAMAGE, TIED_BOARD_BOTH_DECISIVE];

  it("always totals board result plus lane bonuses, and matches the authoritative damage", () => {
    for (const { damage, results } of ROUNDS) {
      for (const step of damageRevealPlan(damage, results)) {
        const sum = step.boardResult + step.laneBonuses.reduce((total, bonus) => total + bonus.amount, 0);
        expect(sum).toBe(step.total);
        expect(step.total).toBe(damageTotalFor(damage, step.side));
      }
    }
  });

  it("matches the spec's worked examples", () => {
    const normal = damageRevealPlan(BOARD_WIN_TWO_DECISIVE.damage, BOARD_WIN_TWO_DECISIVE.results)[0];
    expect([normal.boardResult, normal.laneBonuses.map((b) => b.amount), normal.total]).toEqual([2, [1, 0, 1], 4]);
    const swept = damageRevealPlan(SWEEP.damage, SWEEP.results)[0];
    expect([swept.boardResult, swept.laneBonuses.map((b) => b.amount), swept.total]).toEqual([3, [1, 0, 1], 5]);
  });

  it("throws rather than display a total that disagrees with the health bars", () => {
    // A damage figure the board-result + lane decomposition cannot account for.
    const tampered = { ...SWEEP.damage, player: SWEEP.damage.player + 1 };
    expect(() => damageRevealPlan(tampered, SWEEP.results)).toThrow(/disagrees with authoritative/);
  });
});

describe("damage reveal plan", () => {
  it("resolves the board winner first, then retaliation against the other side", () => {
    const plan = damageRevealPlan(TWO_WAY.damage, TWO_WAY.results);
    expect(plan.map((step) => step.side)).toEqual(["player", "bot"]);
    expect(plan.map((step) => step.kind)).toEqual(["winner", "counter"]);
    expect(plan.map((step) => step.target)).toEqual(["bot", "player"]);
    expect(plan.map((step) => step.total)).toEqual([TWO_WAY.damage.player, TWO_WAY.damage.bot]);
  });

  it("leads with the board winner even when the opponent is the board winner", () => {
    const botWins = round([lane("bot", true), lane("bot", false), lane("player", true)]);
    const plan = damageRevealPlan(botWins.damage, botWins.results);
    expect(plan.map((step) => step.side)).toEqual(["bot", "player"]);
    expect(plan[0].kind).toBe("winner");
    expect(plan[0].target).toBe("player");
  });

  it("produces no step for a side that dealt nothing", () => {
    const plan = damageRevealPlan(PLAIN_BOARD_WIN.damage, PLAIN_BOARD_WIN.results);
    expect(plan).toHaveLength(1);
    expect(plan[0].side).toBe("player");
  });

  it("produces no presentation at all for a round with no damage", () => {
    expect(damageRevealPlan(NO_DAMAGE.damage, NO_DAMAGE.results)).toEqual([]);
    expect(damageRevealPlanTotalMs(damageRevealPlan(NO_DAMAGE.damage, NO_DAMAGE.results))).toBe(0);
  });

  it("orders a tied board deterministically by total, player first on a draw", () => {
    expect(damageRevealPlan(TIED_BOARD_BOTH_DECISIVE.damage, TIED_BOARD_BOTH_DECISIVE.results).map((s) => s.side)).toEqual(
      ["player", "bot"],
    );
    // The larger total leads when a tied board is not symmetrical. Today's
    // three-lane rules cannot reach an asymmetric tie, so this pins the
    // ordering rule itself rather than a board the engine can generate.
    const botAhead = round([lane("player", true), lane("bot", true), lane("tie", false)]);
    const plan = damageRevealPlan(
      { ...botAhead.damage, bot: 2, botDecisiveDamage: 2 },
      [lane("player", true), lane("bot", true), lane("bot", true)],
    );
    expect(plan.map((step) => step.side)).toEqual(["bot", "player"]);
  });
});

describe("damage reveal staging", () => {
  const step = damageRevealPlan(SWEEP.damage, SWEEP.results)[0];

  it("opens on the identity, then the board result, then the three lanes in order", () => {
    expect(damageRevealStages(step)).toEqual([
      "enter",
      "board",
      "lane-1",
      "lane-2",
      "lane-3",
      "total",
      "impact",
      "health",
      "settled",
    ]);
  });

  it("skips the board stage entirely on a retaliation", () => {
    const retaliation = damageRevealPlan(TWO_WAY.damage, TWO_WAY.results)[1];
    expect(damageRevealStages(retaliation)).toEqual([
      "enter",
      "lane-1",
      "lane-2",
      "lane-3",
      "total",
      "impact",
      "health",
      "settled",
    ]);
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
    // This step sweeps, so the board result holds for the SWEEP notification.
    expect(offsets["lane-1"]).toBe(t.enterMs + t.boardMs + t.sweepNoticeMs);
    expect(offsets["lane-2"]).toBe(offsets["lane-1"] + t.laneBonusMs); // +1 lane
    expect(offsets["lane-3"]).toBe(offsets["lane-2"] + t.laneZeroMs); // +0 lane
    expect(offsets.total).toBe(offsets["lane-3"] + t.laneBonusMs); // +1 lane
    expect(offsets.impact).toBe(offsets.total + t.totalHoldMs);
    expect(offsets.health).toBe(offsets.impact + t.impactMs);
    expect(offsets.settled).toBe(offsets.health + t.healthMs);
    expect(damageRevealStepTotalMs(step)).toBe(offsets.settled + t.clearMs);
  });

  it("holds a +0 lane for materially less time than a +1 lane", () => {
    const t = DAMAGE_REVEAL_TIMELINE;
    expect(t.laneZeroMs).toBeLessThan(t.laneBonusMs);
    const offsets = Object.fromEntries(damageRevealStageOffsets(step)) as Record<DamageRevealStage, number>;
    expect(offsets["lane-3"] - offsets["lane-2"]).toBeLessThan(offsets["lane-2"] - offsets["lane-1"]);
  });

  it("does not spend the sweep hold on a plain board win", () => {
    const t = DAMAGE_REVEAL_TIMELINE;
    const plain = damageRevealPlan(BOARD_WIN_TWO_DECISIVE.damage, BOARD_WIN_TWO_DECISIVE.results)[0];
    const offsets = Object.fromEntries(damageRevealStageOffsets(plain)) as Record<DamageRevealStage, number>;
    expect(offsets["lane-1"]).toBe(t.enterMs + t.boardMs);
    expect(damageRevealStepTotalMs(plain)).toBeLessThan(damageRevealStepTotalMs(step));
  });

  it("runs the two directions one after another, never together", () => {
    const plan = damageRevealPlan(TWO_WAY.damage, TWO_WAY.results);
    const starts = damageRevealStepStarts(plan);
    expect(starts[0]).toBe(0);
    expect(starts[1]).toBe(damageRevealStepTotalMs(plan[0]) + DAMAGE_REVEAL_TIMELINE.betweenSidesMs);
    expect(damageRevealPlanTotalMs(plan)).toBe(starts[1] + damageRevealStepTotalMs(plan[1]));
  });
});

describe("what the centre shows at each stage", () => {
  const step = damageRevealPlan(SWEEP.damage, SWEEP.results)[0];

  it("shows nothing, then the board result, then the running subtotal, then the total", () => {
    expect(damageRevealShownTotal(step, "enter")).toBe(0);
    expect(damageRevealShownTotal(step, "board")).toBe(3);
    expect(damageRevealShownTotal(step, "lane-1")).toBe(4);
    expect(damageRevealShownTotal(step, "lane-2")).toBe(4);
    expect(damageRevealShownTotal(step, "lane-3")).toBe(5);
    for (const stage of ["total", "impact", "health", "settled"] as const) {
      expect(damageRevealShownTotal(step, stage)).toBe(step.total);
    }
  });

  it("reveals the lanes cumulatively, left to right", () => {
    expect(damageRevealedLanes(step, "enter")).toEqual([]);
    expect(damageRevealedLanes(step, "board")).toEqual([]);
    expect(damageRevealedLanes(step, "lane-1").map((b) => b.lane)).toEqual([0]);
    expect(damageRevealedLanes(step, "lane-2").map((b) => b.lane)).toEqual([0, 1]);
    expect(damageRevealedLanes(step, "lane-3").map((b) => b.lane)).toEqual([0, 1, 2]);
    expect(damageRevealedLanes(step, "total").map((b) => b.lane)).toEqual([0, 1, 2]);
  });

  it("keeps the board result on screen from the moment it lands", () => {
    expect(damageRevealBoardShown(step, "enter")).toBe(false);
    for (const stage of ["board", "lane-1", "lane-2", "lane-3", "total", "impact", "health", "settled"] as const) {
      expect(damageRevealBoardShown(step, stage)).toBe(true);
    }
  });
});

describe("SWEEP notification trigger", () => {
  it("shows only for an authoritative 3-0, and only while the board result is up", () => {
    const swept = damageRevealPlan(SWEEP.damage, SWEEP.results)[0];
    expect(damageRevealSweepVisible(swept, "board")).toBe(true);
    for (const stage of ["idle", "enter", "lane-1", "lane-2", "lane-3", "total", "impact", "health", "settled"] as const) {
      expect(damageRevealSweepVisible(swept, stage)).toBe(false);
    }
  });

  it("never shows for a 2-1 board win, however many decisive bonuses it earned", () => {
    const normal = damageRevealPlan(BOARD_WIN_TWO_DECISIVE.damage, BOARD_WIN_TWO_DECISIVE.results)[0];
    expect(normal.sweep).toBe(false);
    // Two decisive bonuses on this board: a bonus alone must never trigger it.
    expect(normal.laneBonuses.filter((bonus) => bonus.amount > 0)).toHaveLength(2);
    for (const stage of ["board", "lane-1", "lane-2", "lane-3", "total"] as const) {
      expect(damageRevealSweepVisible(normal, stage)).toBe(false);
    }
  });

  it("never shows for a retaliation", () => {
    const retaliation = damageRevealPlan(TWO_WAY.damage, TWO_WAY.results)[1];
    for (const stage of ["board", "lane-1", "lane-3", "total"] as const) {
      expect(damageRevealSweepVisible(retaliation, stage)).toBe(false);
    }
  });

  it("is derived purely from the step and stage, so it owns no replayable state", () => {
    // Same inputs, same answer, any number of times: nothing latches.
    const swept = damageRevealPlan(SWEEP.damage, SWEEP.results)[0];
    const again = damageRevealPlan(SWEEP.damage, SWEEP.results)[0];
    expect(damageRevealSweepVisible(swept, "board")).toBe(damageRevealSweepVisible(again, "board"));
    expect(damageRevealSweepVisible(swept, "total")).toBe(damageRevealSweepVisible(again, "total"));
  });
});
