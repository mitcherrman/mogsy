/**
 * QUIZ1 Phase 11 — the duelist COLUMN.
 *
 * Four contracts, and the first is the one the owner reported live: a match
 * with no progression layer must not show one. "No empty placeholder should
 * remain" is asserted structurally (the nodes are absent), not by looking for
 * a blank string.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CombatantPanel } from "./CombatantPanel";
import type { CombatantView } from "@/lib/ranked-core/viewTypes";

function combatant(over: Partial<CombatantView> = {}): CombatantView {
  return {
    playerId: "userA", name: "You", tag: "Jungle", roleId: "jungle",
    side: "player", classId: "tank", hp: 120, maxHp: 170,
    xp: 0, level: 1, nextLevelThreshold: null, currentLevelThreshold: null,
    hasSubmitted: false, abilityWindow: "open", hasAbilitySelected: false,
    ...over,
  };
}

describe("progression-disabled columns", () => {
  it("removes the level badge, the XP meter and the ability chip outright", () => {
    render(<CombatantPanel combatant={combatant()} progressionEnabled={false} />);
    expect(screen.queryByTestId("xp-userA")).toBeNull();
    expect(screen.queryByText(/Lv\s*1/)).toBeNull();
    // The exact strings the owner saw live.
    expect(screen.queryByText(/xp/i)).toBeNull();
    expect(screen.queryByText(/\(max\)/)).toBeNull();
    expect(screen.queryByText(/Picking|Armed/)).toBeNull();
    // HP stays, loud.
    expect(screen.getByTestId("hp-userA")).toBeInTheDocument();
  });

  it("keeps every progression control for a pre-R1 match (the default)", () => {
    render(<CombatantPanel combatant={combatant()} />);
    expect(screen.getByTestId("xp-userA")).toBeInTheDocument();
    expect(screen.getByText(/Lv\s*1/)).toBeInTheDocument();
  });
});

describe("role identity", () => {
  it("shows the role crest and the role label, never the legacy class", () => {
    render(<CombatantPanel combatant={combatant()} progressionEnabled={false} />);
    expect(screen.getByTestId("role-crest")).toHaveAttribute("data-role", "jungle");
    expect(screen.getByTestId("identity-tag-userA")).toHaveTextContent("Jungle");
    expect(screen.queryByTestId("class-portrait")).toBeNull();
  });

  it("falls back to the class portrait when the match froze no role", () => {
    render(<CombatantPanel combatant={combatant({ roleId: null, tag: "TANK" })} />);
    expect(screen.queryByTestId("role-crest")).toBeNull();
    expect(screen.getByTestId("class-portrait")).toBeInTheDocument();
  });

  it("mirrors the opponent column", () => {
    render(<CombatantPanel combatant={combatant({
      playerId: "userB", name: "Opponent", side: "opponent", roleId: "support",
      tag: "Support" })} />);
    expect(screen.getByTestId("role-crest")).toHaveAttribute("data-role", "support");
    expect(screen.getByTestId("role-crest").className).toContain("-scale-x-100");
  });
});

describe("recent damage history", () => {
  it("renders a compact trail with the newest event emphasised", () => {
    render(<CombatantPanel combatant={combatant()} damage={[
      { roundNumber: 1, kind: "hit", amount: 20, hpAfter: 150 },
      { roundNumber: 2, kind: "blocked", amount: 8, hpAfter: 150 },
      { roundNumber: 3, kind: "hit", amount: 14, hpAfter: 136 },
    ]} />);
    expect(screen.getByTestId("damage-chip-userA-1")).toHaveTextContent("-20");
    expect(screen.getByTestId("damage-chip-userA-2")).toHaveAttribute("data-kind", "blocked");
    expect(screen.getByTestId("damage-chip-userA-3")).toHaveAttribute("data-newest", "true");
    expect(screen.getByTestId("damage-chip-userA-1")).toHaveAttribute("data-newest", "false");
  });

  it("reserves the row before anything has happened, so the two columns match", () => {
    render(<CombatantPanel combatant={combatant()} damage={[]} />);
    const trail = screen.getByTestId("damage-trail-userA");
    expect(trail.className).toContain("min-h-");
    expect(trail).toHaveTextContent(/No damage yet/i);
  });
});

describe("reveal states", () => {
  it.each([
    ["correct", "CORRECT"],
    ["incorrect", "INCORRECT"],
    ["timed_out", "TIMED OUT"],
  ] as const)("resolves the column for %s with an icon AND a word", (outcome, label) => {
    render(<CombatantPanel combatant={combatant()} outcome={outcome} />);
    const state = screen.getByTestId("outcome-userA");
    expect(state).toHaveAttribute("data-outcome", outcome);
    expect(state).toHaveTextContent(label);
    // The verdict REPLACES the neutral chips in the same reserved row.
    expect(screen.queryByTestId("status-userA")).toBeNull();
    expect(state.className).toContain("min-h-7");
  });

  it("names the damage that side dealt beside its verdict", () => {
    render(<CombatantPanel combatant={combatant()} outcome="correct" damageDealt={14} />);
    expect(screen.getByTestId("outcome-damage-userA")).toHaveTextContent("14 DMG");
  });

  it("shows no damage figure when that side dealt none", () => {
    render(<CombatantPanel combatant={combatant()} outcome="incorrect" damageDealt={0} />);
    expect(screen.queryByTestId("outcome-damage-userA")).toBeNull();
  });

  it("returns to the neutral status when no reveal is in progress", () => {
    render(<CombatantPanel combatant={combatant()} outcome={null} />);
    expect(screen.queryByTestId("outcome-userA")).toBeNull();
    expect(screen.getByTestId("status-userA")).toBeInTheDocument();
  });
});
