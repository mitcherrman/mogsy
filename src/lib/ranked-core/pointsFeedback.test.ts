/**
 * RP1 Step 4 — WHY THE SCORE MOVED.
 *
 * The product sentence these tests defend is "knowledge first, speed second":
 * the base award and the speed bonus are two facts and must never merge into
 * one figure. The other half is what is NOT here — RP1 pays nothing for
 * perfection alone, so no input to this projection can produce a perfect
 * reward, and an imperfect block can never show a speed line.
 */
import { describe, expect, it } from "vitest";
import {
  projectPointsFeedback, projectPointsMascotReactions, projectRevealFeedback,
} from "./pointsFeedback";
import type { ModulePointsAward } from "./backend/adaptBackendSettlement";
import type { ResolvedRoundView } from "./viewTypes";
import type { SegmentSettlementView } from "@/lib/ranked-public/contracts";

const award = (base: number, speed = 0, before = 0): ModulePointsAward => ({
  basePoints: base, speedBonusPoints: speed, pointsAwarded: base + speed,
  scoreBefore: before, scoreAfter: before + base + speed,
});

describe("a standard question", () => {
  it("correct but not first: CORRECT +2 and no speed line", () => {
    const v = projectPointsFeedback(award(2), { outcome: "correct" });
    expect([v.baseLabel, v.basePoints]).toEqual(["CORRECT", 2]);
    expect(v.speed).toBeNull();
  });

  it("correct and first: CORRECT +2 over FIRST +1", () => {
    const v = projectPointsFeedback(award(2, 1), { outcome: "correct" });
    expect([v.baseLabel, v.basePoints]).toEqual(["CORRECT", 2]);
    expect(v.speed).toEqual({ label: "FIRST", points: 1 });
    // The two never merge: the total is carried separately, and the lines
    // state the parts.
    expect(v.pointsAwarded).toBe(3);
  });

  it("a hard question first: CORRECT +3 over FIRST +1", () => {
    const v = projectPointsFeedback(award(3, 1), { outcome: "correct" });
    expect([v.baseLabel, v.basePoints]).toEqual(["CORRECT", 3]);
    expect(v.speed).toEqual({ label: "FIRST", points: 1 });
  });

  it("wrong: INCORRECT +0, and no bonus however fast it was", () => {
    const v = projectPointsFeedback(award(0), { outcome: "incorrect" });
    expect([v.baseLabel, v.basePoints]).toEqual(["INCORRECT", 0]);
    expect(v.speed).toBeNull();
  });

  it("timeout: TIMED OUT +0", () => {
    const v = projectPointsFeedback(award(0), { outcome: "timed_out" });
    expect([v.baseLabel, v.basePoints]).toEqual(["TIMED OUT", 0]);
    expect(v.speed).toBeNull();
  });
});

describe("a slice", () => {
  const slice = (correct: number) => ({ correct, challengeCount: 5 });

  it("5/5 and slower: 5 / 5 +5, no speed line", () => {
    const v = projectPointsFeedback(award(5), {
      outcome: "correct", slice: slice(5) });
    expect([v.baseLabel, v.basePoints]).toEqual(["5 / 5", 5]);
    expect(v.speed).toBeNull();
  });

  it("5/5 and first: 5 / 5 +5 over FINISHED FIRST +1", () => {
    const v = projectPointsFeedback(award(5, 1), {
      outcome: "correct", slice: slice(5) });
    expect([v.baseLabel, v.basePoints]).toEqual(["5 / 5", 5]);
    expect(v.speed).toEqual({ label: "FINISHED FIRST", points: 1 });
  });

  /**
   * THE MANDATORY ONE. An imperfect block earns no bonus however fast it was,
   * and this projection cannot produce one: the only thing it reads is the
   * server's own bonus figure, which is already zero here.
   */
  it("4/5 and first: 4 / 5 +4, and NO speed line", () => {
    const v = projectPointsFeedback(award(4), {
      outcome: "correct", slice: slice(4) });
    expect([v.baseLabel, v.basePoints]).toEqual(["4 / 5", 4]);
    expect(v.speed).toBeNull();
  });

  it("a partial block states what it banked, not what it lost", () => {
    const v = projectPointsFeedback(award(3), {
      outcome: "incorrect", slice: slice(3) });
    expect([v.baseLabel, v.basePoints]).toEqual(["3 / 5", 3]);
  });

  it("never names a perfect bonus, on any input", () => {
    for (const v of [
      projectPointsFeedback(award(5, 1), { outcome: "correct", slice: slice(5) }),
      projectPointsFeedback(award(5), { outcome: "correct", slice: slice(5) }),
      projectPointsFeedback(award(4), { outcome: "correct", slice: slice(4) }),
    ]) {
      expect(JSON.stringify(v).toLowerCase()).not.toContain("perfect");
    }
  });

  it("treats a one-card 'slice' as an ordinary question", () => {
    const v = projectPointsFeedback(award(2, 1), {
      outcome: "correct", slice: { correct: 1, challengeCount: 1 } });
    expect(v.baseLabel).toBe("CORRECT");
    expect(v.speed?.label).toBe("FIRST");
  });
});

// ── the reveal-beat projection ────────────────────────────────────────────

const settlement = (
  points: Record<string, ModulePointsAward> | null,
  roundNumber = 4,
): ResolvedRoundView => ({
  roundNumber,
  modulePoints: points,
  players: {
    p1: { playerId: "you", outcome: "correct" },
    p2: { playerId: "them", outcome: "incorrect" },
  },
} as unknown as ResolvedRoundView);

const segment = (correct: Record<string, number>): SegmentSettlementView => ({
  reveal: {
    challengeCount: 5,
    players: Object.fromEntries(
      Object.entries(correct).map(([pid, n]) => [pid, { correct: n }])),
  },
} as unknown as SegmentSettlementView);

describe("the reveal beat", () => {
  it("gives each player their own award", () => {
    const out = projectRevealFeedback(
      settlement({ you: award(2, 1), them: award(0) }), true);
    expect(out.you.baseLabel).toBe("CORRECT");
    expect(out.you.speed?.points).toBe(1);
    expect(out.them.baseLabel).toBe("INCORRECT");
    expect(out.them.speed).toBeNull();
  });

  it("is empty outside the beat, and on an hp settlement", () => {
    expect(projectRevealFeedback(settlement({ you: award(2) }), false)).toEqual({});
    expect(projectRevealFeedback(settlement(null), true)).toEqual({});
  });

  it("uses the block's own counts when the settled module was a slice", () => {
    const out = projectRevealFeedback(
      settlement({ you: award(4), them: award(2) }), true,
      { settlement: segment({ you: 4, them: 2 }), roundNumber: 4 });
    expect(out.you.baseLabel).toBe("4 / 5");
    expect(out.them.baseLabel).toBe("2 / 5");
  });

  it("ignores a block transcript from a DIFFERENT round", () => {
    const out = projectRevealFeedback(
      settlement({ you: award(2) }, 7), true,
      { settlement: segment({ you: 4 }), roundNumber: 4 });
    expect(out.you.baseLabel).toBe("CORRECT");
  });
});

describe("the mascots", () => {
  it("cheer for their OWN award, and nobody is hit", () => {
    const s = settlement({ you: award(2, 1), them: award(0) });
    const out = projectPointsMascotReactions(projectRevealFeedback(s, true), s);
    expect(out.you).toEqual({ action: "cheer", actionId: 4 });
    // The player who scored nothing does not react — and is never a victim of
    // the one who did.
    expect(out.them).toBeUndefined();
    expect(Object.values(out).map((r) => r.action)).not.toContain("hit");
  });

  it("say nothing outside the reveal beat", () => {
    const s = settlement({ you: award(2) });
    expect(projectPointsMascotReactions(projectRevealFeedback(s, false), s))
      .toEqual({});
  });
});
