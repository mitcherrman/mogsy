/**
 * Phase 2 compact-layout contracts for the settlement banners:
 *  - the banner is a fixed-minimum-height row (settlement detail never joins
 *    the active-round height budget on its own);
 *  - Details expands the unchanged full panel and collapses again whenever a
 *    NEW settlement arrives.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RevealBanner } from "./RevealBanner";
import type { ResolvedRoundView, ResolvedCombatantView } from "@/lib/ranked-core/viewTypes";

function player(id: string, over: Partial<ResolvedCombatantView> = {}): ResolvedCombatantView {
  return {
    playerId: id, outcome: "correct", submittedAt: null, answeredFirst: false,
    timedOut: false, abilityId: null, abilityName: "No Ability",
    baseDamageDealt: 20, outgoingBonus: 0, finalDamageDealt: 20,
    finalDamageReceived: 0, shieldAbsorbed: 0, incomingReduction: 0,
    hpBefore: 170, hpAfter: 170, reachedZeroHp: false,
    xpGained: 12, totalXpAfter: 12,
    levelBefore: 1, levelAfter: 1, leveledUp: false, levelUpEvents: [],
    chargeConsumed: false, consumedAbilityId: null,
    remainingChargesAfterRound: {}, effectsGained: [], effectsConsumed: [],
    consecutiveCorrect: 0, combatLabUnlockDeltaSeconds: 0, ...over,
  };
}

function settlement(round: number): ResolvedRoundView {
  return {
    matchId: "m1", roundNumber: round, questionId: null,
    endReason: "both_answered", pressureApplied: false,
    sharedNextRoundDurationSeconds: 30, sharedTimerDeltaSeconds: 0,
    winner: "p1", matchOver: false, completionReason: null, summary: "", correctOptionIndex: null,
    players: {
      p1: player("userA"),
      p2: player("userB", { outcome: "timed_out", timedOut: true, finalDamageDealt: 0 }),
    },
  };
}

const NAMES = { userA: "You", userB: "Opponent" };

describe("RevealBanner", () => {
  it("renders a reserved-height summary row with both sides, details collapsed", () => {
    render(<RevealBanner settlement={settlement(3)} viewerSlot="p1" namesByPlayerId={NAMES} />);
    expect(screen.getByTestId("reveal-headline")).toHaveTextContent("Round 3 resolved");
    expect(screen.getByTestId("reveal-side-userA")).toHaveTextContent("You");
    expect(screen.getByTestId("reveal-side-userB")).toHaveTextContent("Opponent");
    // Reserved minimum height on the summary row — the banner cannot grow the
    // active-round budget by content changes.
    const row = screen.getByTestId("reveal-headline").parentElement!;
    expect(row.className).toContain("min-h-");
    // Full breakdown is opt-in.
    expect(screen.queryByTestId("reveal-panel-details")).toBeNull();
  });

  it("expands to the full unchanged panel, and collapses on a NEW settlement", () => {
    const { rerender } = render(
      <RevealBanner settlement={settlement(3)} viewerSlot="p1" namesByPlayerId={NAMES} />,
    );
    fireEvent.click(screen.getByTestId("reveal-details-toggle"));
    expect(screen.getByTestId("reveal-panel-details")).toBeInTheDocument();
    expect(screen.getByTestId("reveal-userB")).toBeInTheDocument();

    // Next round settles → banner returns to the compact row on its own.
    rerender(
      <RevealBanner settlement={settlement(4)} viewerSlot="p1" namesByPlayerId={NAMES} />,
    );
    expect(screen.getByTestId("reveal-headline")).toHaveTextContent("Round 4 resolved");
    expect(screen.queryByTestId("reveal-panel-details")).toBeNull();
  });
});
