/**
 * RP1 Step 3 — the duelist rail of a match that scores points.
 *
 * ONE branch decides all of this: a combatant that carries a `score`. These
 * tests fix what that branch produces (a number, a noun, an award-shaped
 * ledger and verdict) and — just as important — that a combatant WITHOUT one
 * renders the HP rail byte-for-byte as before.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CombatantPanel } from "./CombatantPanel";
import type {
  CombatantView, RoundHistoryEntry,
} from "@/lib/ranked-core/viewTypes";
import type { PointsFeedbackView } from "@/lib/ranked-core/pointsFeedback";

const feedback = (over: Partial<PointsFeedbackView> = {}): PointsFeedbackView => ({
  baseLabel: "CORRECT", basePoints: 3, speed: null, pointsAwarded: 3,
  scoreAfter: 12, ...over,
});

const base: CombatantView = {
  playerId: "you", name: "You", tag: "Top", roleId: "top", identityMode: "role",
  side: "player", classId: "tank", hp: 150, maxHp: 170, xp: 0, level: 1,
  nextLevelThreshold: null, currentLevelThreshold: null,
  hasSubmitted: false, abilityWindow: null, hasAbilitySelected: null,
};
const scored = (score: number): CombatantView => ({ ...base, score });

const row = (over: Partial<RoundHistoryEntry> = {}): RoundHistoryEntry => ({
  roundNumber: 1, outcome: "correct", dealt: 3, taken: 0, absorbed: 0,
  hpBefore: 170, hpAfter: 170, timeExpired: false, ...over,
});

describe("a scored rail", () => {
  it("prints the score large, under its own noun, with no fill bar", () => {
    render(<CombatantPanel combatant={scored(12)} progressionEnabled={false} />);
    const tally = screen.getByTestId("score-you");
    expect(tally).toHaveTextContent("12");
    expect(within(tally).getByText("POINTS")).toBeInTheDocument();
    expect(screen.queryByTestId("hp-you")).toBeNull();
    expect(screen.queryAllByRole("meter")).toHaveLength(0);
  });

  it("takes its noun from the mode when the mode has one", () => {
    render(<CombatantPanel combatant={{ ...scored(4), meterLabel: "SCORE" }}
      progressionEnabled={false} />);
    expect(within(screen.getByTestId("score-you")).getByText("SCORE"))
      .toBeInTheDocument();
  });

  it("states the module's award beside the verdict, not a damage figure", () => {
    render(<CombatantPanel combatant={scored(12)} progressionEnabled={false}
      outcome="correct" damageDealt={3} feedback={feedback()} />);
    expect(screen.getByTestId("outcome-points-you")).toHaveTextContent("+3");
    expect(screen.queryByTestId("outcome-damage-you")).toBeNull();
    // No bonus was awarded, so the rail carries no bonus chip at all.
    expect(screen.queryByTestId("outcome-speed-you")).toBeNull();
  });

  it("writes the ledger in points and says nothing about HP", () => {
    render(<CombatantPanel combatant={scored(12)} progressionEnabled={false}
      damage={[row({ pointsAwarded: 2 }), row({ roundNumber: 2, pointsAwarded: 0, outcome: "incorrect" })]} />);
    const ledger = screen.getByTestId("combat-ledger-you");
    expect(ledger).toHaveTextContent("+2");
    expect(ledger.textContent ?? "").not.toMatch(/\bHP\b/);
    expect(within(ledger).getByTestId("ledger-row-you-1"))
      .toHaveTextContent("Module 1");
  });
});

describe("an unscored rail is the HP rail it has always been", () => {
  it("keeps the meter, the maximum and the proportional bar", () => {
    render(<CombatantPanel combatant={base} progressionEnabled={false} />);
    const meter = screen.getByTestId("hp-you");
    expect(meter).toHaveTextContent("150");
    expect(meter).toHaveTextContent("/ 170");
    expect(within(meter).getByRole("meter")).toBeInTheDocument();
    expect(screen.queryByTestId("score-you")).toBeNull();
  });

  it("keeps the damage ledger and the DMG verdict", () => {
    render(<CombatantPanel combatant={base} progressionEnabled={false}
      outcome="correct" damageDealt={3} damage={[row()]} />);
    expect(screen.getByTestId("outcome-damage-you")).toHaveTextContent("3 DMG");
    expect(screen.getByTestId("combat-ledger-you")).toHaveTextContent("Correct");
  });
});
