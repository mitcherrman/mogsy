import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { readPublicRound } from "@/lib/ranked-public/contracts";
import type { SegmentStateView } from "@/lib/ranked-public/contracts";
import {
  icdChallengeState, icdSegmentMeta, icdSegmentState, publicRoundV2,
} from "@/lib/ranked-public/fixtures";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import { itemCostDuelModule, secondsRemaining } from "./itemCostDuelModule";
import type { ModuleSegmentActions } from "./types";

const NOW = Date.parse("2026-07-18T12:00:00+00:00");

function parse(rawState: unknown, meta = icdSegmentMeta()) {
  const body = publicRoundV2();
  (body.payload as Record<string, unknown>).segment = meta;
  (body.payload as Record<string, unknown>).segment_state = rawState;
  return readPublicRound(body);
}

function actions(over: Partial<ModuleSegmentActions> = {}): ModuleSegmentActions {
  return {
    draftAbility: vi.fn(), confirmAbility: vi.fn(), submitChallenge: vi.fn(),
    busy: false, error: null, ...over,
  };
}

function renderModule(state: SegmentStateView | null, acts = actions()) {
  const pub = publicRoundV2();
  const parsed = readPublicRound(pub);
  const view = render(
    <itemCostDuelModule.Viewport
      publicRound={parsed}
      selection={null}
      permissions={NO_INTERACTIONS}
      onSelect={vi.fn()}
      segmentState={state}
      actions={acts}
      skewMs={0}
    />,
  );
  return { ...view, acts };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});

describe("secondsRemaining", () => {
  it("counts down from the SERVER deadline, skew-adjusted", () => {
    expect(secondsRemaining("2026-07-18T12:00:05+00:00", NOW, 0)).toBe(5);
    // A client clock 2s ahead of the server must not shorten the window.
    expect(secondsRemaining("2026-07-18T12:00:05+00:00", NOW, -2000)).toBe(7);
    expect(secondsRemaining("2026-07-18T12:00:05+00:00", NOW + 9000, 0)).toBe(0);
    expect(secondsRemaining(null, NOW, 0)).toBeNull();
  });
});

describe("Item Cost Duel — ability phase", () => {
  it("shows the title, instruction, countdown and the options", () => {
    renderModule(parse(icdSegmentState()).segmentState);
    expect(screen.getByText("Item Cost Duel")).toBeInTheDocument();
    expect(screen.getByTestId("icd-countdown")).toHaveTextContent("5s");
    expect(screen.getByTestId("icd-ability-__none__")).toBeInTheDocument();
    expect(screen.getByTestId("icd-ability-tank.fortify")).toBeInTheDocument();
  });

  it("drafts an ability and can change it before confirming", () => {
    const { acts } = renderModule(parse(icdSegmentState()).segmentState);
    fireEvent.click(screen.getByTestId("icd-ability-tank.fortify"));
    expect(acts.draftAbility).toHaveBeenCalledWith("tank.fortify");
    expect(screen.getByTestId("icd-ability-tank.fortify"))
      .toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByTestId("icd-ability-__none__"));
    expect(acts.draftAbility).toHaveBeenLastCalledWith(null);
    expect(screen.getByTestId("icd-ability-__none__"))
      .toHaveAttribute("aria-pressed", "true");
  });

  it("treats No Ability as an explicit, selectable choice", () => {
    const { acts } = renderModule(parse(icdSegmentState()).segmentState);
    fireEvent.click(screen.getByTestId("icd-ability-__none__"));
    expect(acts.draftAbility).toHaveBeenCalledWith(null);
    expect(acts.draftAbility).not.toHaveBeenCalledWith("__none__");
  });

  it("confirms through the authoritative action", () => {
    const { acts } = renderModule(parse(icdSegmentState()).segmentState);
    fireEvent.click(screen.getByTestId("icd-confirm-ability"));
    expect(acts.confirmAbility).toHaveBeenCalledOnce();
  });

  it("locks every control once the server reports the selection confirmed", () => {
    renderModule(parse(icdSegmentState({
      own_ability: {
        selected_ability_id: "tank.fortify", confirmed: true,
        available_ability_ids: ["tank.fortify"], unavailable_ability_ids: {},
      },
    })).segmentState);
    expect(screen.getByTestId("icd-confirm-ability")).toBeDisabled();
    expect(screen.getByTestId("icd-ability-tank.fortify")).toBeDisabled();
    expect(screen.getByTestId("icd-ability-__none__")).toBeDisabled();
    expect(screen.getByTestId("icd-ability-status")).toHaveTextContent("Locked");
  });

  it("shows an unavailable ability with the server's reason", () => {
    renderModule(parse(icdSegmentState({
      own_ability: {
        selected_ability_id: null, confirmed: false,
        available_ability_ids: ["mage.arcane_charge"],
        unavailable_ability_ids: {
          "mage.insight": "Mage Insight has no effect in this segment",
        },
      },
    })).segmentState);
    const list = screen.getByTestId("icd-unavailable-abilities");
    expect(within(list).getByText(/no effect in this segment/i)).toBeInTheDocument();
    // ...and it is NOT offered as a choice.
    expect(screen.queryByTestId("icd-ability-mage.insight")).toBeNull();
  });

  it("reports opponent readiness without revealing the choice", () => {
    renderModule(parse(icdSegmentState({
      opponent_ability_confirmed: true,
    })).segmentState);
    expect(screen.getByTestId("icd-opponent-ready"))
      .toHaveTextContent("Opponent is ready.");
    expect(document.body.textContent).not.toMatch(/arcane|overload|insight/i);
  });

  it("restores the drafted selection after a refresh", () => {
    renderModule(parse(icdSegmentState({
      own_ability: {
        selected_ability_id: "tank.fortify", confirmed: false,
        available_ability_ids: ["tank.fortify"], unavailable_ability_ids: {},
      },
    })).segmentState);
    expect(screen.getByTestId("icd-ability-tank.fortify"))
      .toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("icd-confirm-ability")).toBeEnabled();
  });
});

describe("Item Cost Duel — challenge phase", () => {
  it("shows progress, the pair, and the shared timer", () => {
    renderModule(parse(icdChallengeState(1)).segmentState);
    expect(screen.getByTestId("icd-progress")).toHaveTextContent("Challenge 2 of 5");
    expect(screen.getByTestId("icd-item-Item 2")).toBeInTheDocument();
    expect(screen.getByTestId("icd-item-Item 3")).toBeInTheDocument();
    expect(screen.getByTestId("icd-countdown")).toHaveTextContent("30s");
  });

  it("submits the chosen item id at the server's index", () => {
    const { acts } = renderModule(parse(icdChallengeState(1)).segmentState);
    fireEvent.click(screen.getByTestId("icd-item-Item 3"));
    expect(acts.submitChallenge).toHaveBeenCalledWith(1, "Item 3");
  });

  it("disables both cards immediately after a submission", () => {
    renderModule(parse(icdChallengeState(1)).segmentState);
    fireEvent.click(screen.getByTestId("icd-item-Item 3"));
    expect(screen.getByTestId("icd-item-Item 2")).toBeDisabled();
    expect(screen.getByTestId("icd-item-Item 3")).toBeDisabled();
  });

  it("does NOT advance its own index — only the server moves it", () => {
    const { rerender, acts } = renderModule(parse(icdChallengeState(1)).segmentState);
    fireEvent.click(screen.getByTestId("icd-item-Item 3"));
    // The action fired, but the view is still on challenge 2 until the next
    // authoritative snapshot says otherwise.
    expect(screen.getByTestId("icd-progress")).toHaveTextContent("Challenge 2 of 5");
    rerender(
      <itemCostDuelModule.Viewport
        publicRound={readPublicRound(publicRoundV2())} selection={null}
        permissions={NO_INTERACTIONS} onSelect={vi.fn()}
        segmentState={parse(icdChallengeState(2)).segmentState}
        actions={acts} skewMs={0} />,
    );
    expect(screen.getByTestId("icd-progress")).toHaveTextContent("Challenge 3 of 5");
    expect(screen.getByTestId("icd-item-Item 4")).toBeEnabled();
  });

  it("restores the exact challenge after a refresh at index 4", () => {
    renderModule(parse(icdChallengeState(4)).segmentState);
    expect(screen.getByTestId("icd-progress")).toHaveTextContent("Challenge 5 of 5");
    expect(screen.getByTestId("icd-item-Item 8")).toBeEnabled();
  });

  it("shows the opponent's completion count and nothing more", () => {
    renderModule(parse(icdChallengeState(1, {
      opponent_challenges_completed: 3,
    })).segmentState);
    expect(screen.getByTestId("icd-opponent-progress"))
      .toHaveTextContent("Opponent: 3 of 5 done");
  });

  it("reflects the shortened deadline when pressure applies", () => {
    renderModule(parse(icdChallengeState(2, {
      pressure_applied: true,
      challenge_deadline: "2026-07-18T12:00:27+00:00",
    })).segmentState);
    expect(screen.getByTestId("icd-pressure")).toBeInTheDocument();
    expect(screen.getByTestId("icd-countdown")).toHaveTextContent("27s");
  });

  it("shows a waiting state once the owner has finished all five", () => {
    renderModule(parse(icdChallengeState(5, {
      opponent_challenges_completed: 2,
    })).segmentState);
    expect(screen.getByTestId("icd-waiting")).toBeInTheDocument();
    expect(screen.getByText(/Waiting for the opponent \(2 of 5 done\)/))
      .toBeInTheDocument();
    expect(screen.queryByTestId("icd-challenge-phase")).toBeNull();
  });

  it("never renders a cost, a correct answer, or any correctness", () => {
    renderModule(parse(icdChallengeState(2)).segmentState);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\d+\s*g\b/);       // no gold cost
    expect(text).not.toMatch(/correct|incorrect|✓|✗/i);
  });

  it("surfaces an action error", () => {
    renderModule(parse(icdChallengeState(1)).segmentState,
      actions({ error: "too many requests; slow down" }));
    expect(screen.getByTestId("icd-error")).toHaveTextContent("too many requests");
    expect(screen.getByTestId("icd-error")).toHaveAttribute("role", "alert");
  });

  it("shows a loading state rather than a broken board with no state", () => {
    renderModule(null);
    expect(screen.getByTestId("icd-loading")).toBeInTheDocument();
  });
});

describe("Item Cost Duel — accessibility basics", () => {
  it("uses real buttons, so every control is keyboard reachable", () => {
    renderModule(parse(icdChallengeState(0)).segmentState);
    for (const id of ["icd-item-Item 0", "icd-item-Item 1"]) {
      expect(screen.getByTestId(id).tagName).toBe("BUTTON");
    }
  });

  it("conveys selection state programmatically, not only visually", () => {
    renderModule(parse(icdSegmentState()).segmentState);
    const none = screen.getByTestId("icd-ability-__none__");
    const fortify = screen.getByTestId("icd-ability-tank.fortify");
    // No Ability reads as selected while the server holds no draft, because
    // that IS the outcome of letting the window expire — showing nothing
    // selected would misrepresent what happens if the player does nothing.
    expect(none).toHaveAttribute("aria-pressed", "true");
    expect(fortify).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(fortify);
    expect(fortify).toHaveAttribute("aria-pressed", "true");
    expect(none).toHaveAttribute("aria-pressed", "false");
  });

  it("gives every item image meaningful alt text", () => {
    renderModule(parse(icdChallengeState(0)).segmentState);
    expect(screen.getByAltText("Item 0 item icon")).toBeInTheDocument();
    expect(screen.getByAltText("Item 1 item icon")).toBeInTheDocument();
  });

  it("does not announce the countdown every second", () => {
    renderModule(parse(icdChallengeState(0)).segmentState);
    const countdown = screen.getByTestId("icd-countdown");
    expect(countdown).not.toHaveAttribute("aria-live");
  });

  it("summarises the pending state for the shell review panel", () => {
    const ability = parse(icdSegmentState());
    expect(itemCostDuelModule.summaryLabel(ability, null))
      .toBe("Choosing an ability");
    const challenge = parse(icdChallengeState(2));
    expect(itemCostDuelModule.summaryLabel(challenge, null))
      .toBe("Challenge 3 of 5");
  });

  it("projects no question view — it is not a question module", () => {
    expect(itemCostDuelModule.projectQuestion(
      readPublicRound(publicRoundV2()))).toBeNull();
  });
});
