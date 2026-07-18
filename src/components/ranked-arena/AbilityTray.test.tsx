import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  AbilityView,
  InteractionPermissions,
  NO_INTERACTIONS,
} from "@/lib/ranked-core/viewTypes";
import { AbilityTray } from "./AbilityTray";

const ability = (overrides: Partial<AbilityView> = {}): AbilityView => ({
  id: "tank.fortify",
  name: "Fortify",
  description: "After answering correctly, gain extra time on the next question.",
  unlocked: true,
  remainingCharges: 2,
  selected: false,
  locked: false,
  exhausted: false,
  ...overrides,
});

const OPEN: InteractionPermissions = { ...NO_INTERACTIONS, canSelectAbility: true };

describe("AbilityTray", () => {
  it("renders supplied abilities with charges and emits the backend id", () => {
    const onSelect = vi.fn();
    render(
      <AbilityTray
        abilities={[ability()]}
        selectedAbilityId={null}
        permissions={OPEN}
        onSelectAbility={onSelect}
      />,
    );
    const button = screen.getByTestId("ability-tank.fortify");
    expect(button).toHaveTextContent("Fortify");
    expect(button).toHaveTextContent("2 charges left");
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith("tank.fortify");
  });

  it("is roster-neutral: renders any class's abilities purely from props", () => {
    render(
      <AbilityTray
        abilities={[
          ability({ id: "mage.overload", name: "Overload", remainingCharges: 3 }),
          ability({ id: "boss.smash", name: "Smash", remainingCharges: null }),
        ]}
        selectedAbilityId={null}
        permissions={OPEN}
        onSelectAbility={() => {}}
      />,
    );
    expect(screen.getByTestId("ability-mage.overload")).toBeInTheDocument();
    expect(screen.getByTestId("ability-boss.smash")).toBeInTheDocument();
    // Uncharged policy (null) shows no charge badge rather than inventing 0.
    expect(screen.getByTestId("ability-boss.smash")).not.toHaveTextContent(/charge/i);
  });

  it("marks the armed ability via aria-pressed and state attribute", () => {
    render(
      <AbilityTray
        abilities={[ability({ selected: true })]}
        selectedAbilityId="tank.fortify"
        permissions={OPEN}
        onSelectAbility={() => {}}
      />,
    );
    const button = screen.getByTestId("ability-tank.fortify");
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveAttribute("data-ability-state", "selected");
  });

  it("supports the explicit no-ability option and emits null", () => {
    const onSelect = vi.fn();
    render(
      <AbilityTray
        abilities={[ability({ selected: false })]}
        selectedAbilityId={null}
        permissions={OPEN}
        onSelectAbility={onSelect}
      />,
    );
    const none = screen.getByTestId("ability-none");
    expect(none).toHaveAttribute("aria-pressed", "true"); // null = no-ability selected
    fireEvent.click(none);
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("disables exhausted, progression-locked, and round-locked abilities with reasons", () => {
    const onSelect = vi.fn();
    render(
      <AbilityTray
        abilities={[
          ability({
            id: "a.exhausted",
            exhausted: true,
            remainingCharges: 0,
            unavailableReason: "No charges remaining this match.",
          }),
          ability({
            id: "a.locked",
            unlocked: false,
            remainingCharges: null,
            unavailableReason: "Locked — unlocks with level progression.",
          }),
          ability({ id: "a.window", locked: true, unavailableReason: "Submission locked for this round." }),
        ]}
        selectedAbilityId={null}
        permissions={OPEN}
        onSelectAbility={onSelect}
      />,
    );
    expect(screen.getByTestId("ability-a.exhausted")).toBeDisabled();
    expect(screen.getByTestId("ability-a.exhausted")).toHaveAttribute("data-ability-state", "exhausted");
    expect(screen.getByTestId("ability-a.locked")).toBeDisabled();
    expect(screen.getByTestId("ability-a.locked")).toHaveAttribute(
      "data-ability-state",
      "locked-progression",
    );
    expect(screen.getByTestId("ability-a.window")).toBeDisabled();
    expect(screen.getByText("No charges remaining this match.")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("ability-a.exhausted"));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("permission gating disables everything, including no-ability", () => {
    const onSelect = vi.fn();
    render(
      <AbilityTray
        abilities={[ability()]}
        selectedAbilityId={null}
        permissions={{ ...NO_INTERACTIONS, disabledReasons: { ability: "Abilities come later." } }}
        onSelectAbility={onSelect}
      />,
    );
    expect(screen.getByTestId("ability-tank.fortify")).toBeDisabled();
    expect(screen.getByTestId("ability-none")).toBeDisabled();
    expect(screen.getByTestId("ability-tray-reason")).toHaveTextContent("Abilities come later.");
    fireEvent.click(screen.getByTestId("ability-none"));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("abilities are native buttons (keyboard-operable)", () => {
    render(
      <AbilityTray
        abilities={[ability()]}
        selectedAbilityId={null}
        permissions={OPEN}
        onSelectAbility={() => {}}
      />,
    );
    expect(screen.getByTestId("ability-tank.fortify").tagName).toBe("BUTTON");
    expect(screen.getByTestId("ability-none").tagName).toBe("BUTTON");
  });

  it("renders only the viewer's own abilities — no opponent content exists", () => {
    const { container } = render(
      <AbilityTray
        abilities={[ability()]}
        selectedAbilityId={null}
        permissions={OPEN}
        onSelectAbility={() => {}}
      />,
    );
    expect(container.innerHTML).not.toMatch(/opponent/i);
  });
});
