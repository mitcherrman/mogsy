/**
 * RP1 Step 3 — the two settled-result lines, in points vocabulary.
 *
 * The header plate is the one place a settled Ranked round still SHOUTED a
 * damage number ("12 DAMAGE", "NO DAMAGE"), and the block plate the one place
 * a settled five-card block did ("… · 7 DMG"). In a points match that figure
 * is the award travelling through the engine's damage channel, so both lines
 * state the award instead — and on an hp match both are unchanged.
 */
import { describe, expect, it } from "vitest";
import { resultConsequence } from "./RoundResultBeat";
import { segmentScoreline } from "./SegmentResultBeat";
import type { ResolvedCombatantView } from "@/lib/ranked-core/viewTypes";
import type { SegmentSettlementView } from "@/lib/ranked-public/contracts";
import type { PointsFeedbackView } from "@/lib/ranked-core/pointsFeedback";

const award = (base: number, speedPoints = 0, label = "CORRECT"): PointsFeedbackView => ({
  baseLabel: label,
  basePoints: base,
  speed: speedPoints > 0
    ? { label: label.includes("/") ? "FINISHED FIRST" : "FIRST", points: speedPoints }
    : null,
  pointsAwarded: base + speedPoints,
  scoreAfter: base + speedPoints,
});

const viewer = {
  finalDamageDealt: 12, finalDamageReceived: 0, shieldAbsorbed: 0,
} as unknown as ResolvedCombatantView;

describe("the round plate's consequence line", () => {
  it("carries the SPEED bonus in a points match — the base is the loud line", () => {
    expect(resultConsequence(viewer, award(2, 1))).toBe("FIRST +1");
  });

  it("says nothing at all when no bonus was earned", () => {
    expect(resultConsequence(viewer, award(2))).toBe("");
    expect(resultConsequence(viewer, award(0, 0, "INCORRECT"))).toBe("");
  });

  it("is the unchanged damage line when there is no award (hp)", () => {
    expect(resultConsequence(viewer)).toBe("12 DAMAGE");
    expect(resultConsequence({
      ...viewer, finalDamageDealt: 0,
    } as ResolvedCombatantView)).toBe("NO DAMAGE");
  });

  /**
   * POINT1 — THE SURVIVING DAMAGE HEADER.
   *
   * `feedback` alone was the guard, and it is projected per settlement: a
   * points settlement that published no `module_points` fell through to the
   * clauses above and shouted "12 DAMAGE" over a live Meta Reflex block. The
   * mode's own answer makes them unreachable instead.
   */
  it("states NOTHING rather than damage on a points match with no award", () => {
    expect(resultConsequence(viewer, null, true)).toBe("");
    expect(resultConsequence({
      ...viewer, finalDamageDealt: 0, finalDamageReceived: 3,
    } as ResolvedCombatantView, null, true)).toBe("");
    expect(resultConsequence({
      ...viewer, finalDamageDealt: 2, finalDamageReceived: 3,
    } as ResolvedCombatantView, null, true)).toBe("");
  });

  it("keeps the award when there IS one, points match or not", () => {
    expect(resultConsequence(viewer, award(2, 1), true)).toBe("FIRST +1");
  });
});

describe("the block plate's scoreline", () => {
  const settlement = {
    reveal: {
      challengeCount: 5,
      players: { you: { correct: 5 }, them: { correct: 3 } },
    },
    damageByPlayerId: { you: 7 },
  } as unknown as SegmentSettlementView;

  it("keeps both card counts and states base and bonus separately", () => {
    expect(segmentScoreline(settlement, "you", "them", award(5, 1, "5 / 5")))
      .toBe("YOU 5/5 · OPP 3/5 · +5 · FINISHED FIRST +1");
  });

  it("states a base of zero rather than implying a loss of anything", () => {
    expect(segmentScoreline(settlement, "you", "them", award(0, 0, "0 / 5")))
      .toBe("YOU 5/5 · OPP 3/5 · +0");
  });

  it("is the unchanged DMG scoreline on an hp match", () => {
    expect(segmentScoreline(settlement, "you", "them"))
      .toBe("YOU 5/5 · OPP 3/5 · 7 DMG");
  });

  /** The same guard as the round plate's, for the same reason. */
  it("drops the DMG clause on a points match with no award", () => {
    expect(segmentScoreline(settlement, "you", "them", null, true))
      .toBe("YOU 5/5 · OPP 3/5");
  });
});
