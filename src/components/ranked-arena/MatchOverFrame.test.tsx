import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CombatantView } from "@/lib/ranked-core/viewTypes";
import { MatchOverFrame } from "./MatchOverFrame";

const combatant = (overrides: Partial<CombatantView> = {}): CombatantView => ({
  playerId: "alice",
  name: "Alice",
  side: "player",
  classId: "tank",
  hp: 40,
  maxHp: 170,
  xp: 70,
  level: 3,
  nextLevelThreshold: null,
  currentLevelThreshold: 66,
  hasSubmitted: false,
  abilityWindow: null,
  hasAbilitySelected: null,
  ...overrides,
});

const opponent = combatant({ playerId: "bob", name: "Bob", side: "opponent", hp: 0 });

describe("MatchOverFrame", () => {
  it("renders victory with both final combatant summaries", () => {
    render(<MatchOverFrame result="victory" player={combatant()} opponent={opponent} />);
    expect(screen.getByTestId("match-over-frame")).toHaveAttribute("data-result", "victory");
    expect(screen.getByTestId("match-over-heading")).toHaveTextContent("Victory");
    expect(screen.getByRole("region", { name: /alice panel/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /bob panel/i })).toBeInTheDocument();
  });

  it("renders defeat and draw with controller copy overrides", () => {
    const { rerender } = render(
      <MatchOverFrame result="defeat" player={combatant()} opponent={opponent} />,
    );
    expect(screen.getByTestId("match-over-heading")).toHaveTextContent("Defeat");
    rerender(
      <MatchOverFrame
        result="draw"
        heading="Double knockout!"
        subheading="simultaneous_knockout"
        player={combatant()}
        opponent={opponent}
      />,
    );
    expect(screen.getByTestId("match-over-heading")).toHaveTextContent("Double knockout!");
    expect(screen.getByTestId("match-over-subheading")).toHaveTextContent("simultaneous_knockout");
  });

  it("summary slot and actions are optional and controller-driven", () => {
    const primary = vi.fn();
    const secondary = vi.fn();
    const { rerender } = render(
      <MatchOverFrame result="victory" player={combatant()} opponent={opponent} />,
    );
    expect(screen.queryByTestId("match-over-summary")).toBeNull();
    expect(screen.queryByTestId("match-over-primary")).toBeNull();
    rerender(
      <MatchOverFrame
        result="victory"
        player={combatant()}
        opponent={opponent}
        summary={<div>7 rounds</div>}
        primaryAction={{ label: "Play again", onClick: primary }}
        secondaryAction={{ label: "Back to hub", onClick: secondary }}
      />,
    );
    expect(screen.getByTestId("match-over-summary")).toHaveTextContent("7 rounds");
    fireEvent.click(screen.getByTestId("match-over-primary"));
    expect(primary).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("match-over-secondary"));
    expect(secondary).toHaveBeenCalledTimes(1);
  });

  it("disabled actions do not fire", () => {
    const primary = vi.fn();
    render(
      <MatchOverFrame
        result="victory"
        player={combatant()}
        opponent={opponent}
        primaryAction={{ label: "Play again", onClick: primary, disabled: true }}
      />,
    );
    fireEvent.click(screen.getByTestId("match-over-primary"));
    expect(primary).not.toHaveBeenCalled();
  });

  it("embeds no rating, persistence, or tutorial assumptions", () => {
    const { container } = render(
      <MatchOverFrame result="victory" player={combatant()} opponent={opponent} />,
    );
    expect(container.innerHTML).not.toMatch(/rating|rank up|placement|tutorial|training/i);
  });
});
