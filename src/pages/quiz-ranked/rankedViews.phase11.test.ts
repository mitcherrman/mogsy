/**
 * QUIZ1 Phase 11 — the damage trail and the reveal projections.
 *
 * Every value is a pass-through of the authoritative settlement; these tests
 * pin WHICH rounds appear (and which deliberately do not) and that nothing is
 * recomputed from HP.
 */
import { describe, expect, it } from "vitest";
import {
  projectDamageHistory, projectRevealDamage, projectRevealOutcomes,
} from "./rankedViews";
import type { ResolvedCombatantView, ResolvedRoundView } from "@/lib/ranked-core/viewTypes";

function player(id: string, over: Partial<ResolvedCombatantView> = {}): ResolvedCombatantView {
  return {
    playerId: id, outcome: "correct", submittedAt: null, answeredFirst: false,
    timedOut: false, abilityId: null, abilityName: "No Ability",
    baseDamageDealt: 0, outgoingBonus: 0, finalDamageDealt: 0,
    finalDamageReceived: 0, shieldAbsorbed: 0, incomingReduction: 0,
    hpBefore: 170, hpAfter: 170, reachedZeroHp: false,
    xpGained: 0, totalXpAfter: 0, levelBefore: 1, levelAfter: 1,
    leveledUp: false, levelUpEvents: [], chargeConsumed: false,
    consumedAbilityId: null, remainingChargesAfterRound: {},
    effectsGained: [], effectsConsumed: [], consecutiveCorrect: 0,
    combatLabUnlockDeltaSeconds: 0, ...over,
  };
}

function round(n: number, p1: Partial<ResolvedCombatantView>,
               p2: Partial<ResolvedCombatantView> = {}): ResolvedRoundView {
  return {
    matchId: "m1", roundNumber: n, questionId: null, endReason: "both_answered",
    pressureApplied: false, sharedNextRoundDurationSeconds: 30,
    sharedTimerDeltaSeconds: 0, matchOver: false, winner: null,
    completionReason: null, summary: "", correctOptionIndex: null,
    players: { p1: player("userA", p1), p2: player("userB", p2) },
  };
}

describe("projectDamageHistory", () => {
  it("keeps only rounds where this player's health actually moved", () => {
    const log = [
      round(1, { finalDamageReceived: 20, hpAfter: 150 }),
      round(2, {}),                                     // nobody took anything
      round(3, { finalDamageReceived: 14, hpAfter: 136 }),
    ];
    expect(projectDamageHistory(log, "userA").map((e) => e.roundNumber)).toEqual([1, 3]);
  });

  it("keeps a fully absorbed instance, which is NOT the same as no hit", () => {
    const log = [round(1, { finalDamageReceived: 0, shieldAbsorbed: 12 })];
    const [entry] = projectDamageHistory(log, "userA");
    expect(entry).toMatchObject({ kind: "blocked", amount: 12 });
  });

  it("reads the settlement's damage field, never hpBefore minus hpAfter", () => {
    // A round where HP moved by more than the damage instance (a floor, a
    // heal, a clamp). The trail must report the authoritative damage.
    const log = [round(1, { finalDamageReceived: 14, hpBefore: 20, hpAfter: 1 })];
    expect(projectDamageHistory(log, "userA")[0].amount).toBe(14);
  });

  it("is per-player: the opponent's trail is the opponent's HP", () => {
    const log = [round(1, { finalDamageReceived: 20 }, { finalDamageReceived: 5 })];
    expect(projectDamageHistory(log, "userB")[0].amount).toBe(5);
  });

  it("returns nothing for a player who is not in the log", () => {
    expect(projectDamageHistory([round(1, {})], "nobody")).toEqual([]);
  });
});

describe("reveal projections", () => {
  const settled = round(4, { outcome: "correct", finalDamageDealt: 10 },
                           { outcome: "timed_out", finalDamageDealt: 0 });

  it("resolves BOTH columns simultaneously during the reveal beat", () => {
    expect(projectRevealOutcomes(settled, true))
      .toEqual({ userA: "correct", userB: "timed_out" });
    expect(projectRevealDamage(settled, true)).toEqual({ userA: 10, userB: 0 });
  });

  it("shows nothing once the beat is over, so no verdict carries into the next question", () => {
    expect(projectRevealOutcomes(settled, false)).toEqual({});
    expect(projectRevealDamage(settled, false)).toEqual({});
  });

  it("shows nothing before the first settlement", () => {
    expect(projectRevealOutcomes(null, true)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// The answer-tablet disclosure gate.
// ---------------------------------------------------------------------------

import { projectSurfaceReveal } from "./rankedViews";
import type { QuestionView } from "@/lib/ranked-core/viewTypes";

const QUESTION: QuestionView = {
  questionId: "q1", prompt: "?", category: null,
  options: [
    { id: "o0", label: "A", index: 0 },
    { id: "o1", label: "B", index: 1 },
    { id: "o2", label: "C", index: 2 },
    { id: "o3", label: "D", index: 3 },
  ],
};

const settled = (n: number, index: number | null): ResolvedRoundView =>
  ({ ...round(n, {}), correctOptionIndex: index });

describe("projectSurfaceReveal", () => {
  it("resolves the tablets for the round that just settled", () => {
    expect(projectSurfaceReveal(settled(3, 2), 3, QUESTION))
      .toEqual({ revealed: true, correctOptionId: "o2" });
  });

  it("discloses nothing before any round has settled", () => {
    expect(projectSurfaceReveal(null, 3, QUESTION)).toBeNull();
  });

  it("NEVER resolves the tablets of a DIFFERENT round", () => {
    // The leak this shape exists to prevent: round 3's answer must not light
    // up round 4's tablets while the surface has already advanced.
    expect(projectSurfaceReveal(settled(3, 2), 4, QUESTION)).toBeNull();
  });

  it("discloses nothing when the backend sent no index (segment round, old backend)", () => {
    expect(projectSurfaceReveal(settled(3, null), 3, QUESTION)).toBeNull();
  });

  it("discloses nothing when the index does not name an option of this question", () => {
    expect(projectSurfaceReveal(settled(3, 9), 3, QUESTION)).toBeNull();
    expect(projectSurfaceReveal(settled(3, 2), 3, null)).toBeNull();
  });

  it("discloses nothing while the surface has no round at all", () => {
    expect(projectSurfaceReveal(settled(3, 2), null, QUESTION)).toBeNull();
  });
});
