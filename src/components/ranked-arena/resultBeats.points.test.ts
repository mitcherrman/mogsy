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

const viewer = {
  finalDamageDealt: 12, finalDamageReceived: 0, shieldAbsorbed: 0,
} as unknown as ResolvedCombatantView;

describe("the round plate's consequence line", () => {
  it("states the award in a points match", () => {
    expect(resultConsequence(viewer, 3)).toBe("+3 POINTS");
  });

  it("says NO POINTS for a module that awarded none — never a damage figure", () => {
    expect(resultConsequence(viewer, 0)).toBe("NO POINTS");
  });

  it("is the unchanged damage line when there is no award (hp)", () => {
    expect(resultConsequence(viewer)).toBe("12 DAMAGE");
    expect(resultConsequence({
      ...viewer, finalDamageDealt: 0,
    } as ResolvedCombatantView)).toBe("NO DAMAGE");
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

  it("keeps both card counts and states the award", () => {
    expect(segmentScoreline(settlement, "you", "them", 6))
      .toBe("YOU 5/5 · OPP 3/5 · +6 PTS");
  });

  it("omits the award clause rather than printing +0", () => {
    expect(segmentScoreline(settlement, "you", "them", 0))
      .toBe("YOU 5/5 · OPP 3/5");
  });

  it("is the unchanged DMG scoreline on an hp match", () => {
    expect(segmentScoreline(settlement, "you", "them"))
      .toBe("YOU 5/5 · OPP 3/5 · 7 DMG");
  });
});
