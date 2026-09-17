import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CombatantView } from "@/lib/ranked-core/viewTypes";
import { MobileDuelStrip } from "./MobileDuelStrip";

const combatant = (overrides: Partial<CombatantView> = {}): CombatantView => ({
  playerId: "alice", name: "Alice", tag: "Tank", side: "player", classId: "tank",
  hp: 120, maxHp: 170, xp: 16, level: 1, nextLevelThreshold: 30, currentLevelThreshold: 0,
  hasSubmitted: false, abilityWindow: "open", hasAbilitySelected: false,
  ...overrides,
});

const rail = (c: CombatantView, outcome: "correct" | "incorrect" | null = null) => ({
  kind: "combatant" as const, combatant: c, damage: [], outcome, damageDealt: null,
  presentation: "banner" as const,
});

describe("MobileDuelStrip (RMOB1)", () => {
  it("draws both duelists from the same views the banners read", () => {
    render(<MobileDuelStrip progressionEnabled
      left={rail(combatant())}
      right={rail(combatant({ playerId: "bob", name: "Bob", side: "opponent", hp: 50, hasSubmitted: true }))} />);
    expect(screen.getByTestId("mobile-name-alice")).toHaveTextContent("Alice");
    expect(screen.getByTestId("mobile-name-bob")).toHaveTextContent("Bob");
    expect(screen.getByTestId("mobile-hp-alice")).toHaveTextContent("120");
    expect(screen.getByTestId("mobile-status-alice")).toHaveTextContent("Thinking…");
    expect(screen.getByTestId("mobile-status-bob")).toHaveTextContent("Locked in");
    // Short status on half a phone: the ability window adds nothing until armed.
    expect(screen.getByTestId("mobile-status-alice")).not.toHaveTextContent(/pick/i);
  });

  it("shows a score, not an HP bar, on a points match, and the verdict on reveal", () => {
    render(<MobileDuelStrip progressionEnabled={false}
      left={rail(combatant({ score: 14 }), "correct")}
      right={rail(combatant({ playerId: "bob", name: "Bob", side: "opponent", score: 9 }), "incorrect")} />);
    expect(screen.getByTestId("mobile-score-alice")).toHaveTextContent("14");
    expect(screen.queryByTestId("mobile-hp-alice")).toBeNull();
    expect(screen.getByTestId("mobile-status-alice")).toHaveTextContent("Correct");
    expect(screen.getByTestId("mobile-status-bob")).toHaveTextContent("Incorrect");
    expect(screen.queryByText(/Lv/)).toBeNull();
  });
});
