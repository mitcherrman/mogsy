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

  it("falls back to the class portrait only on a match with NO roles at all", () => {
    // A genuine pre-R1 match: no `identityMode`, no role, and the combat class
    // is the only identity the match has. Unchanged, deliberately.
    render(<CombatantPanel combatant={combatant({ roleId: null, tag: "Tank" })} />);
    expect(screen.queryByTestId("role-crest")).toBeNull();
    expect(screen.getByTestId("class-portrait")).toBeInTheDocument();
  });

  it("gives a role-less participant on a ROLE match the neutral crest, never a class", () => {
    // THE `TANK` DEFECT. A bot carries a legitimate `role: null` beside a human
    // who has a role; this column used to fall through to the legacy branch and
    // print its combat class, uppercased, in the role slot.
    render(<CombatantPanel progressionEnabled={false} combatant={combatant({
      playerId: "userB", name: "Opponent", side: "opponent",
      roleId: null, tag: undefined, classId: "tank", identityMode: "role",
    })} />);
    expect(screen.getByTestId("role-crest")).toHaveAttribute("data-role", "none");
    expect(screen.getByTestId("role-crest-neutral")).toBeInTheDocument();
    expect(screen.queryByTestId("class-portrait")).toBeNull();
    expect(screen.queryByTestId("role-crest-mascot")).toBeNull();
    // The neutral role LABEL, and no combat class anywhere on the column.
    expect(screen.getByTestId("identity-tag-userB")).toHaveTextContent("Duelist");
    expect(screen.queryByText(/tank/i)).toBeNull();
  });

  it.each(["tank", "mage", "marksman"])(
    "never presents the %s class as a role on a role match", (classId) => {
      render(<CombatantPanel progressionEnabled={false} combatant={combatant({
        roleId: null, tag: undefined, classId, identityMode: "role",
      })} />);
      expect(screen.getByTestId("identity-tag-userA")).toHaveTextContent("Duelist");
      expect(screen.queryByText(new RegExp(classId, "i"))).toBeNull();
    });

  it("mirrors the opponent column", () => {
    render(<CombatantPanel combatant={combatant({
      playerId: "userB", name: "Opponent", side: "opponent", roleId: "support",
      tag: "Support" })} />);
    expect(screen.getByTestId("role-crest")).toHaveAttribute("data-role", "support");
    // AI1 Phase 2 — the opponent still faces the arena centre, but the mirror
    // moved OFF the frame and onto the mascot. Mirroring the box would also
    // mirror its inset shadow and gradient, and would flip the mascot's own
    // action transforms so a forward lunge travelled backwards on this column.
    expect(screen.getByTestId("role-crest").className).not.toContain("-scale-x-100");
    expect(screen.getByTestId("role-crest-mascot")).toHaveAttribute("data-facing", "left");
  });
});

describe("recent-round ledger", () => {
  const ledger = [
    { roundNumber: 1, outcome: "incorrect" as const, dealt: 0, taken: 20,
      absorbed: 0, hpBefore: 170, hpAfter: 150, timeExpired: false },
    { roundNumber: 2, outcome: "correct" as const, dealt: 0, taken: 0,
      absorbed: 8, hpBefore: 150, hpAfter: 150, timeExpired: false },
    { roundNumber: 3, outcome: "correct" as const, dealt: 14, taken: 0,
      absorbed: 0, hpBefore: 150, hpAfter: 150, timeExpired: false },
  ];

  it("renders one row per settled round, newest first", () => {
    render(<CombatantPanel combatant={combatant()} damage={ledger} />);
    const rows = screen.getAllByTestId(/^ledger-row-userA-/);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual([
      "ledger-row-userA-3", "ledger-row-userA-2", "ledger-row-userA-1",
    ]);
    expect(rows[0]).toHaveAttribute("data-newest", "true");
    expect(rows[2]).toHaveAttribute("data-newest", "false");
  });

  it("names the outcome of every round, including one that cost nobody health", () => {
    render(<CombatantPanel combatant={combatant()} damage={ledger} />);
    expect(screen.getByTestId("ledger-row-userA-1")).toHaveAttribute("data-outcome", "incorrect");
    expect(screen.getByTestId("ledger-row-userA-1")).toHaveTextContent("Incorrect");
    expect(screen.getByTestId("ledger-row-userA-3")).toHaveTextContent("Correct");
  });

  it("distinguishes damage dealt, damage taken and damage absorbed", () => {
    render(<CombatantPanel combatant={combatant()} damage={ledger} />);
    expect(screen.getByTestId("ledger-row-userA-1")).toHaveTextContent("-20");
    expect(screen.getByTestId("ledger-row-userA-2")).toHaveTextContent("8");
    expect(screen.getByTestId("ledger-row-userA-3")).toHaveTextContent("14");
  });

  it("describes each round to a screen reader without relying on colour", () => {
    render(<CombatantPanel combatant={combatant()} damage={ledger} />);
    expect(screen.getByTestId("ledger-row-userA-1"))
      .toHaveTextContent(/Round 1: Incorrect, took 20\. HP 150\./);
  });

  it("surfaces no XP, level or ability information", () => {
    render(<CombatantPanel combatant={combatant()} progressionEnabled={false}
      damage={ledger} />);
    const region = screen.getByTestId("combat-ledger-userA");
    expect(region.textContent).not.toMatch(/xp|level|lv |abilit/i);
  });

  it("reserves the region before anything has happened, so the two columns match", () => {
    render(<CombatantPanel combatant={combatant()} damage={[]} />);
    const region = screen.getByTestId("combat-ledger-userA");
    expect(region.className).toContain("min-h-");
    expect(region).toHaveTextContent(/No rounds yet/i);
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
