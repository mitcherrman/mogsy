/**
 * RR1 — the header's record window fits every result it can show.
 *
 * The bug: the plate was sized to its content and centred in a fixed,
 * overflow-hidden 184px window, so "META REFLEX · 0 / 5 +0" (336px) was cut on
 * both sides and even INCORRECT/TIMED OUT lost their edges. jsdom lays nothing
 * out, so the geometry is pinned here as structure — the budgeted parts, the
 * window's unchanged classes and the scoped CSS — and the real pixel checks
 * live in the arena-fit e2e and the RR1 browser measurements.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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


const verdict = () => screen.getByTestId("ranked-last-result-verdict");
const consequence = () => screen.getByTestId("ranked-last-result-consequence");
const part = (name: string) =>
  screen.getByTestId("ranked-last-result").querySelector(`[data-beat-part="${name}"]`);

const renderBlock = (fb: PointsFeedbackView | null, you: Partial<SegmentRevealPlayer> = {}) =>
  render(<SegmentResultBeat settlement={block(you)} viewerUserId="userA"
    opponentUserId="userB" roundNumber={9} feedback={fb}
    detailsOpen={false} onToggleDetails={() => {}} />);

function expectBudgetedParts(marker: string) {
  expect(part("icon")).not.toBeNull();
  expect(part("text")).toHaveClass("min-w-0");
  expect(part("marker")).toHaveTextContent(marker);
  expect(part("marker")).toHaveClass("shrink-0");
}

describe("the record plate's content", () => {
  it("a normal correct result: CORRECT +2 with its icon and round marker", () => {
    render(<RoundResultBeat viewerSlot="p1" settlement={settlement({}, {})}
      feedback={feedback("CORRECT", 2, { label: "FIRST", points: 1 })} pointsMatch />);
    expect(verdict()).toHaveTextContent("CORRECT +2");
    expect(consequence()).toHaveTextContent("FIRST +1");
    expectBudgetedParts("R5");
  });

  it("a timeout: TIMED OUT +0 with its round marker", () => {
    render(<RoundResultBeat viewerSlot="p1"
      settlement={settlement({ outcome: "timed_out", timedOut: true }, {})}
      feedback={feedback("TIMED OUT", 0)} pointsMatch />);
    expect(verdict()).toHaveTextContent("TIMED OUT +0");
    expectBudgetedParts("R5");
  });

  it("a Meta Reflex 0 / 5: the count on the loud line, the module name on the quiet one", () => {
    renderBlock(feedback("0 / 5", 0), { correct: 0, segmentResult: "loss", perfect: false, speedBonus: 0 });
    // Exactly the count and award — the module name no longer rides this line.
    expect(verdict().textContent).toBe("0 / 5 +0");
    expect(consequence()).toHaveTextContent("Meta Reflex");
    expectBudgetedParts("R9");
    expect(screen.getByTestId("segment-details-toggle")).toBeInTheDocument();
    // The accessible sentence still names the module in full.
    expect(screen.getByTestId("ranked-last-result").getAttribute("aria-label"))
      .toMatch(/^Meta Reflex/);
  });

  it("the longest block result: 5 / 5 +5 over FINISHED FIRST +1", () => {
    renderBlock(feedback("5 / 5", 5, { label: "FINISHED FIRST", points: 1 }));
    expect(verdict().textContent).toBe("5 / 5 +5");
    expect(consequence()).toHaveTextContent("FINISHED FIRST +1");
    expectBudgetedParts("R9");
  });

  it("an hp block keeps its original inline title (not a points plate)", () => {
    renderBlock(null);
    expect(verdict()).toHaveTextContent(/Meta Reflex/);
  });
});

describe("the record window's geometry", () => {
  const arena = readFileSync(resolve(__dirname, "CanonicalArena.tsx"), "utf8");
  const css = readFileSync(resolve(__dirname, "../../index.css"), "utf8");

  it("keeps the window's fixed size, overflow and breakpoint unchanged", () => {
    const tag = /data-testid="ranked-record-window"\s+className="([^"]+)"/.exec(arena)?.[1] ?? "";
    const classes = tag.split(/\s+/).filter(Boolean);
    for (const c of ["ranked-record-window", "h-10", "w-[11.5rem]", "overflow-hidden",
      "min-[1500px]:w-[13rem]", "justify-center", "shrink-0"]) {
      expect(classes).toContain(c);
    }
  });

  it("sizes the plate to the window (with an inset for the entrance overshoot), never to its content", () => {
    const rule = /\.ranked-record-window \.ranked-result-beat \{\s*width: calc\(100% - 0\.5rem\);[^}]*\}/.exec(css)?.[0] ?? "";
    expect(rule).toMatch(/min-width: 0/);
    expect(rule).toMatch(/flex-shrink: 1/);
    // The fix lives inside the window: no rule resizes the window itself.
    expect(css).not.toMatch(/\.ranked-record-window \{[^}]*(width|height)\s*:/);
  });
});
