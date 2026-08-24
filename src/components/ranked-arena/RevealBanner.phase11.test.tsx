/**
 * QUIZ1 Phase 11 — the result headline.
 *
 * The old banner said "You Correct · Opponent Timed out" in one 12px line.
 * These pin the promoted verdict AND that the opponent's outcome is still
 * present in the banner (§10) rather than moved out of it.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RevealBanner, resultHeadline } from "./RevealBanner";
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

function settlement(p1: Partial<ResolvedCombatantView>,
                    p2: Partial<ResolvedCombatantView>): ResolvedRoundView {
  return {
    matchId: "m1", roundNumber: 3, questionId: null, endReason: "both_answered",
    pressureApplied: false, sharedNextRoundDurationSeconds: 30,
    sharedTimerDeltaSeconds: 0, matchOver: false, winner: null,
    completionReason: null, summary: "", correctOptionIndex: null,
    questionExplanation: null,
    players: { p1: player("userA", p1), p2: player("userB", p2) },
  };
}

describe("resultHeadline", () => {
  it("names the shared verdict when both players reached the same outcome", () => {
    expect(resultHeadline(player("a"), player("b")).verdict).toBe("Both correct");
    expect(resultHeadline(player("a", { outcome: "incorrect" }),
                          player("b", { outcome: "incorrect" })).verdict)
      .toBe("Both incorrect");
    expect(resultHeadline(player("a", { outcome: "timed_out" }),
                          player("b", { outcome: "timed_out" })).verdict)
      .toBe("Both timed out");
  });

  it("names the VIEWER's verdict when the two differ", () => {
    expect(resultHeadline(player("a", { outcome: "incorrect" }),
                          player("b", { outcome: "correct" })).verdict)
      .toBe("Incorrect");
  });

  it("keeps damage dealt and damage taken separate, never netted", () => {
    const both = resultHeadline(
      player("a", { finalDamageDealt: 10, finalDamageReceived: 14 }), player("b"));
    expect(both.detail).toBe("10 damage dealt · 14 damage taken");
  });

  it("reports an absorbed hit rather than reading as an untouched round", () => {
    expect(resultHeadline(player("a", { shieldAbsorbed: 8 }), player("b")).detail)
      .toBe("8 absorbed");
  });

  it("has no damage clause on a round that cost nothing", () => {
    expect(resultHeadline(player("a"), player("b")).detail).toBeNull();
  });
});

describe("RevealBanner", () => {
  it("promotes the verdict and still shows BOTH sides in the banner", () => {
    render(<RevealBanner viewerSlot="p1"
      namesByPlayerId={{ userA: "You", userB: "Opponent" }}
      settlement={settlement(
        { outcome: "correct", finalDamageDealt: 10 },
        { outcome: "timed_out" })} />);
    const verdict = screen.getByTestId("reveal-verdict");
    expect(verdict).toHaveAttribute("data-outcome", "correct");
    expect(verdict).toHaveTextContent("Correct");
    expect(screen.getByTestId("reveal-verdict-detail")).toHaveTextContent("10 damage dealt");
    // §10: the opponent outcome must remain visible, not be replaced by the
    // headline.
    expect(screen.getByTestId("reveal-side-userB")).toHaveTextContent("Timed out");
    // Reserved height so a round with no damage clause does not move the row.
    expect(verdict.className).toContain("min-h-");
  });

  it("keeps the Details expansion", () => {
    render(<RevealBanner viewerSlot="p1" settlement={settlement({}, {})} />);
    expect(screen.getByTestId("reveal-details-toggle")).toBeInTheDocument();
  });
});
