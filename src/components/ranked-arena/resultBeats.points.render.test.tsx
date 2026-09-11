/**
 * RP1 Step 4 — the settled-module plate, as the player reads it.
 *
 * Two lines, and which fact goes on which line is the design: the base award
 * is the loud one because knowing the answer is what the game rewards, and the
 * speed premium is the quiet one under it because being quick is a bonus on
 * top of knowing. A plate that merged them into "+3" would teach neither.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RoundResultBeat } from "./RoundResultBeat";
import { SegmentResultBeat } from "./SegmentResultBeat";
import type {
  ResolvedCombatantView, ResolvedRoundView,
} from "@/lib/ranked-core/viewTypes";
import type {
  SegmentRevealPlayer, SegmentSettlementView,
} from "@/lib/ranked-public/contracts";
import type { PointsFeedbackView } from "@/lib/ranked-core/pointsFeedback";

afterEach(cleanup);

const feedback = (
  baseLabel: string, basePoints: number,
  speed: { label: string; points: number } | null = null,
): PointsFeedbackView => ({
  baseLabel, basePoints, speed,
  pointsAwarded: basePoints + (speed?.points ?? 0),
  scoreAfter: 0,
});

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
const settlement = (
  p1: Partial<ResolvedCombatantView>, p2: Partial<ResolvedCombatantView> = {},
): ResolvedRoundView => ({
  matchId: "m1", roundNumber: 5, questionId: null, endReason: "both_answered",
  pressureApplied: false, sharedNextRoundDurationSeconds: 30,
  sharedTimerDeltaSeconds: 0, winner: null, matchOver: false,
  completionReason: null, summary: "", correctOptionIndex: null,
  questionExplanation: null, modulePoints: null,
  players: { p1: player("userA", p1), p2: player("userB", p2) },
});

const verdict = () => screen.getByTestId("ranked-last-result-verdict");
const consequence = () => screen.getByTestId("ranked-last-result-consequence");

describe("a standard module's plate", () => {
  it("correct, not first: CORRECT +2 and an empty bonus line", () => {
    render(<RoundResultBeat viewerSlot="p1" settlement={settlement({}, {})}
      feedback={feedback("CORRECT", 2)} />);
    expect(verdict()).toHaveTextContent("CORRECT +2");
    expect(consequence().textContent).toBe("");
    // Nothing about the HP duel survives in a points plate.
    expect(screen.getByTestId("ranked-last-result").textContent ?? "")
      .not.toMatch(/damage|dmg|hp/i);
  });

  it("correct and first: CORRECT +2 over FIRST +1", () => {
    render(<RoundResultBeat viewerSlot="p1" settlement={settlement({}, {})}
      feedback={feedback("CORRECT", 2, { label: "FIRST", points: 1 })} />);
    expect(verdict()).toHaveTextContent("CORRECT +2");
    expect(consequence()).toHaveTextContent("FIRST +1");
  });

  it("a hard question, first: CORRECT +3 over FIRST +1", () => {
    render(<RoundResultBeat viewerSlot="p1" settlement={settlement({}, {})}
      feedback={feedback("CORRECT", 3, { label: "FIRST", points: 1 })} />);
    expect(verdict()).toHaveTextContent("CORRECT +3");
    expect(consequence()).toHaveTextContent("FIRST +1");
  });

  it("wrong: INCORRECT +0, with no bonus line and no damage framing", () => {
    render(<RoundResultBeat viewerSlot="p1"
      settlement={settlement({ outcome: "incorrect" }, { outcome: "correct" })}
      feedback={feedback("INCORRECT", 0)} />);
    expect(verdict()).toHaveTextContent("INCORRECT +0");
    expect(consequence().textContent).toBe("");
  });

  it("keeps the hp plate untouched when there is no award", () => {
    render(<RoundResultBeat viewerSlot="p1" settlement={settlement(
      { outcome: "correct", finalDamageDealt: 14 },
      { outcome: "incorrect", finalDamageReceived: 14 })} />);
    expect(consequence()).toHaveTextContent("14 DAMAGE");
  });
});

// ── a slice ───────────────────────────────────────────────────────────────

function revealPlayer(over: Partial<SegmentRevealPlayer> = {}): SegmentRevealPlayer {
  return {
    segmentResult: "win", correct: 5, incorrect: 0, unanswered: 0,
    totalResponseMs: 4000, perChallengeMs: [800, 800, 800, 800, 800],
    choices: [], perfect: true, speedBonus: 1, damageDealt: 7, ...over,
  };
}
const block = (you: Partial<SegmentRevealPlayer> = {}): SegmentSettlementView => ({
  reveal: {
    moduleId: "item_cost_duel", moduleVersion: 4, challengeCount: 5,
    challenges: [], masteryChallenges: [], items: {},
    players: { userA: revealPlayer(you), userB: revealPlayer({ correct: 3 }) },
  },
  damageByPlayerId: { userA: 7, userB: 3 },
  abilitiesByPlayerId: {},
} as unknown as SegmentSettlementView);

const renderBlock = (
  fb: PointsFeedbackView | null, you: Partial<SegmentRevealPlayer> = {},
) => render(
  <SegmentResultBeat settlement={block(you)} viewerUserId="userA"
    opponentUserId="userB" roundNumber={5} feedback={fb}
    detailsOpen={false} onToggleDetails={() => {}} />);

describe("a slice's plate", () => {
  it("5/5 and slower: 5 / 5 +5, and NO bonus line", () => {
    renderBlock(feedback("5 / 5", 5));
    expect(verdict()).toHaveTextContent("5 / 5 +5");
    expect(consequence().textContent).toBe("");
  });

  it("5/5 and first: 5 / 5 +5 over FINISHED FIRST +1", () => {
    renderBlock(feedback("5 / 5", 5, { label: "FINISHED FIRST", points: 1 }));
    expect(verdict()).toHaveTextContent("5 / 5 +5");
    expect(consequence()).toHaveTextContent("FINISHED FIRST +1");
  });

  it("4/5 and first: 4 / 5 +4, with NO speed line — the mandatory case", () => {
    renderBlock(feedback("4 / 5", 4), { correct: 4, perfect: false, speedBonus: 0 });
    expect(verdict()).toHaveTextContent("4 / 5 +4");
    expect(consequence().textContent).toBe("");
  });

  it("shows NO perfect reward, even on a perfect first-finished block", () => {
    renderBlock(feedback("5 / 5", 5, { label: "FINISHED FIRST", points: 1 }));
    const plate = screen.getByTestId("ranked-last-result");
    expect(plate.textContent?.toLowerCase() ?? "").not.toContain("perfect");
    expect(screen.queryByTestId("segment-bonus-chips")).toBeNull();
    expect(screen.queryByTestId("segment-bonus-perfect")).toBeNull();
  });

  it("does not call a scored module won or lost", () => {
    renderBlock(feedback("3 / 5", 3), { correct: 3, segmentResult: "loss" });
    expect(verdict()).toHaveTextContent("3 / 5 +3");
    expect(verdict().textContent ?? "").not.toMatch(/loss|win/i);
  });

  it("keeps the hp block plate — word, scoreline and chips — untouched", () => {
    renderBlock(null);
    expect(verdict()).toHaveTextContent("Win");
    expect(consequence()).toHaveTextContent("YOU 5/5 · OPP 3/5 · 7 DMG");
    expect(screen.getByTestId("segment-bonus-perfect")).toBeInTheDocument();
  });
});
