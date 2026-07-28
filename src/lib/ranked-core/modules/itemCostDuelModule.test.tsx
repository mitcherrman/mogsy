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
  return { submitChallenge: vi.fn(), busy: false, error: null, ...over };
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

describe("Item Cost Duel — R3: no ability interaction", () => {
  it("renders challenge 1 immediately when the segment opens", () => {
    // The authoritative segment now opens in the challenge phase, so the very
    // first thing the player sees is a pair of items.
    renderModule(parse(icdChallengeState(0)).segmentState);
    expect(screen.getByTestId("icd-challenge-phase")).toBeInTheDocument();
    expect(screen.getByTestId("icd-progress")).toHaveTextContent("Challenge 1 of 5");
    expect(screen.queryByTestId("icd-ability-phase")).toBeNull();
  });

  it("exposes no ability control of any kind", () => {
    renderModule(parse(icdChallengeState(0)).segmentState);
    expect(screen.queryByTestId("icd-confirm-ability")).toBeNull();
    expect(screen.queryByTestId("icd-ability-__none__")).toBeNull();
    expect(screen.queryByTestId("icd-ability-tank.fortify")).toBeNull();
    expect(screen.queryByTestId("icd-unavailable-abilities")).toBeNull();
    expect(screen.queryByTestId("icd-ability-status")).toBeNull();
    expect(screen.queryByTestId("icd-opponent-ready")).toBeNull();
  });

  it("never shows a 'choosing an ability' status", () => {
    renderModule(parse(icdChallengeState(0)).segmentState);
    expect(document.body.textContent).not.toMatch(/choosing an ability/i);
  });

  it("degrades a legacy ability phase to a neutral waiting state", () => {
    // A match created BEFORE R3 froze the old format and can still report the
    // ability phase. The client must not crash or offer removed controls — the
    // server expires the window on its own.
    renderModule(parse(icdSegmentState()).segmentState);
    expect(screen.getByTestId("icd-legacy-ability-phase")).toBeInTheDocument();
    expect(screen.getByText(/starting the challenges/i)).toBeInTheDocument();
    expect(screen.queryByTestId("icd-confirm-ability")).toBeNull();
    expect(screen.queryByTestId("icd-ability-tank.fortify")).toBeNull();
    // Still no opponent ability information of any kind.
    expect(document.body.textContent).not.toMatch(/arcane|overload|insight/i);
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

  it("conveys the picked item programmatically, not only visually", () => {
    renderModule(parse(icdChallengeState(0)).segmentState);
    const left = screen.getByTestId("icd-item-Item 0");
    const right = screen.getByTestId("icd-item-Item 1");
    expect(left).toHaveAttribute("aria-pressed", "false");
    expect(right).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(right);
    expect(right).toHaveAttribute("aria-pressed", "true");
    // ...and both lock at once, so a second activation cannot double-submit.
    expect(left).toBeDisabled();
    expect(right).toBeDisabled();
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

  it("summarises the pending state without any ability language", () => {
    const challenge = parse(icdChallengeState(2));
    expect(itemCostDuelModule.summaryLabel(challenge, null))
      .toBe("Challenge 3 of 5");
    // A legacy segment mid-transition reads as starting, never as choosing.
    expect(itemCostDuelModule.summaryLabel(parse(icdSegmentState()), null))
      .toBe("Starting…");
  });

  it("projects no question view — it is not a question module", () => {
    expect(itemCostDuelModule.projectQuestion(
      readPublicRound(publicRoundV2()))).toBeNull();
  });
});
