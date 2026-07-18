import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  InteractionPermissions,
  LevelUpOptionView,
  NO_INTERACTIONS,
} from "@/lib/ranked-core/viewTypes";
import { LevelUpPanel } from "./LevelUpPanel";

// Deliberately non-Tank options: the panel must be class-neutral.
const OPTIONS: LevelUpOptionView[] = [
  { id: "mage.overload", name: "Overload", description: "Commit to being correct." },
  { id: "mage.insight", name: "Insight", description: "Modify Combat Lab availability." },
];

const CHOOSE: InteractionPermissions = {
  ...NO_INTERACTIONS,
  canSelectAbility: true,
  canConfirmSubmission: true,
};

describe("LevelUpPanel — level 2 choice", () => {
  it("renders options entirely from props and emits selection intents", () => {
    const onSelect = vi.fn();
    render(
      <LevelUpPanel
        event={{ kind: "level2-choice", options: OPTIONS, pendingOptionId: null, confirmedOptionId: null }}
        permissions={CHOOSE}
        onSelectOption={onSelect}
      />,
    );
    expect(screen.getByTestId("level-option-mage.overload")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("level-option-mage.insight"));
    expect(onSelect).toHaveBeenCalledWith("mage.insight");
  });

  it("confirm requires a pending option and emits the confirm intent", () => {
    const onConfirm = vi.fn();
    const { rerender } = render(
      <LevelUpPanel
        event={{ kind: "level2-choice", options: OPTIONS, pendingOptionId: null, confirmedOptionId: null }}
        permissions={CHOOSE}
        onConfirmOption={onConfirm}
      />,
    );
    expect(screen.getByTestId("level-confirm")).toBeDisabled();
    rerender(
      <LevelUpPanel
        event={{ kind: "level2-choice", options: OPTIONS, pendingOptionId: "mage.overload", confirmedOptionId: null }}
        permissions={CHOOSE}
        onConfirmOption={onConfirm}
      />,
    );
    const confirm = screen.getByTestId("level-confirm");
    expect(confirm).toHaveTextContent(/permanent/i);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("states when the choice gates the next round", () => {
    render(
      <LevelUpPanel
        event={{ kind: "level2-choice", options: OPTIONS, pendingOptionId: null, confirmedOptionId: null }}
        permissions={CHOOSE}
        gatesNextRound
      />,
    );
    expect(screen.getByText(/next round starts after you choose/i)).toBeInTheDocument();
  });

  it("confirmed choice shows a locked permanent summary without controls", () => {
    render(
      <LevelUpPanel
        event={{
          kind: "level2-choice",
          options: OPTIONS,
          pendingOptionId: null,
          confirmedOptionId: "mage.overload",
        }}
        permissions={NO_INTERACTIONS}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/chosen: overload/i);
    expect(screen.queryByTestId("level-confirm")).toBeNull();
  });

  it("denied permissions disable options and confirm, with a reason", () => {
    const onSelect = vi.fn();
    render(
      <LevelUpPanel
        event={{ kind: "level2-choice", options: OPTIONS, pendingOptionId: "mage.overload", confirmedOptionId: null }}
        permissions={{ ...NO_INTERACTIONS, disabledReasons: { levelUpChoice: "Wait for the reveal." } }}
        onSelectOption={onSelect}
      />,
    );
    expect(screen.getByTestId("level-option-mage.overload")).toBeDisabled();
    expect(screen.getByTestId("level-confirm")).toBeDisabled();
    expect(screen.getByText("Wait for the reveal.")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("level-option-mage.overload"));
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("LevelUpPanel — level 3 unlock", () => {
  it("presents the automatic unlock without any controls", () => {
    render(
      <LevelUpPanel
        event={{
          kind: "level3-unlock",
          ability: { id: "marksman.focus", name: "Focus", description: "Reward streaks." },
        }}
        permissions={NO_INTERACTIONS}
      />,
    );
    const panel = screen.getByTestId("level-up-panel");
    expect(panel).toHaveAttribute("data-kind", "level3-unlock");
    expect(panel).toHaveTextContent(/focus unlocked automatically/i);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
