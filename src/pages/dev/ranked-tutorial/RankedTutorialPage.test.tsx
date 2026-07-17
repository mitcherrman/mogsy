import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import RankedTutorialPage from "./RankedTutorialPage";

// Isolation guards: the tutorial must never touch the network or storage.
const fetchSpy = vi.fn(() => {
  throw new Error("Tutorial must not call fetch");
});

let localSet: ReturnType<typeof vi.spyOn>;
let sessionSet: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
  localSet = vi.spyOn(Storage.prototype, "setItem");
  sessionSet = vi.spyOn(window.sessionStorage, "setItem");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localSet.mockRestore();
  sessionSet.mockRestore();
  fetchSpy.mockClear();
});

// --- Walk helpers (fireEvent.click on native buttons = keyboard operable) ----

const begin = () => fireEvent.click(screen.getByTestId("begin-training"));
const cont = () => fireEvent.click(screen.getByTestId("continue-step"));

/** welcome → answer_selection */
const toRoundA = () => {
  begin();
  cont();
};

/** Completes Round A: select correct answer, lock, confirm, reveal, damage. */
const throughRoundA = () => {
  toRoundA();
  fireEvent.click(screen.getByTestId("answer-1"));
  fireEvent.click(screen.getByTestId("lock-submission"));
  fireEvent.click(screen.getByTestId("confirm-lock"));
  cont(); // reveal
  cont(); // damage_intro
  cont(); // both_correct_demo
};

describe("RankedTutorialPage — shell", () => {
  it("renders the Training Match shell on the welcome step", () => {
    render(<RankedTutorialPage />);
    expect(screen.getByRole("heading", { name: "Training Match" })).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Training Golem panel" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("tutorial-progress")).toHaveTextContent("Step 1 of 18");
    expect(screen.getByTestId("timer-paused-note")).toBeInTheDocument();
  });

  it("labels HP and XP separately with next-level threshold", () => {
    render(<RankedTutorialPage />);
    const meters = screen.getAllByRole("meter");
    expect(meters).toHaveLength(2);
    expect(meters[0]).toHaveAttribute("aria-valuenow", "170");
    expect(screen.getByTestId("player-xp-value")).toHaveTextContent(
      "0 xp · next level at 30",
    );
  });
});

describe("answer interaction", () => {
  it("answer buttons are keyboard-operable native buttons with aria-pressed", () => {
    render(<RankedTutorialPage />);
    toRoundA();
    const btn = screen.getByTestId("answer-1");
    expect(btn.tagName).toBe("BUTTON");
    btn.focus();
    expect(btn).toHaveFocus();
    expect(btn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("ability-none")).toHaveAttribute("aria-pressed", "true");
  });

  it("selecting an answer does not silently submit — lock and confirm required", () => {
    render(<RankedTutorialPage />);
    toRoundA();
    fireEvent.click(screen.getByTestId("answer-1"));
    // Still selecting: no locked banner, no review, no reveal.
    expect(screen.queryByTestId("locked-banner")).toBeNull();
    expect(screen.queryByTestId("reveal-panel")).toBeNull();
    fireEvent.click(screen.getByTestId("lock-submission"));
    expect(screen.getByTestId("submission-review")).toBeInTheDocument();
    expect(screen.queryByTestId("locked-banner")).toBeNull();
    fireEvent.click(screen.getByTestId("confirm-lock"));
    expect(screen.getByTestId("locked-banner")).toBeInTheDocument();
  });

  it("controls are disabled after lock", () => {
    render(<RankedTutorialPage />);
    toRoundA();
    fireEvent.click(screen.getByTestId("answer-1"));
    fireEvent.click(screen.getByTestId("lock-submission"));
    fireEvent.click(screen.getByTestId("confirm-lock"));
    expect(screen.getByTestId("answer-0")).toBeDisabled();
    expect(screen.getByTestId("answer-1")).toBeDisabled();
    expect(screen.getByTestId("ability-none")).toBeDisabled();
  });

  it("opponent answer is absent before reveal; both appear together at reveal", () => {
    render(<RankedTutorialPage />);
    toRoundA();
    fireEvent.click(screen.getByTestId("answer-1"));
    fireEvent.click(screen.getByTestId("lock-submission"));
    fireEvent.click(screen.getByTestId("confirm-lock"));
    // Neutral status only — no reveal panel, no opponent answer text.
    expect(screen.getByTestId("opponent-status")).toHaveTextContent("Answer submitted");
    expect(screen.queryByTestId("reveal-panel")).toBeNull();
    cont(); // simultaneous reveal
    const reveal = screen.getByTestId("reveal-panel");
    expect(within(reveal).getByTestId("reveal-player")).toHaveTextContent("Five");
    expect(within(reveal).getByTestId("reveal-opponent")).toHaveTextContent("Three");
    expect(within(reveal).getByTestId("reveal-opponent")).toHaveTextContent("Incorrect");
  });

  it("HP and XP changes are communicated in text after Round A", () => {
    render(<RankedTutorialPage />);
    toRoundA();
    fireEvent.click(screen.getByTestId("answer-1"));
    fireEvent.click(screen.getByTestId("lock-submission"));
    fireEvent.click(screen.getByTestId("confirm-lock"));
    cont();
    expect(screen.getByTestId("reveal-player")).toHaveTextContent("Dealt 40 damage");
    expect(screen.getByTestId("reveal-opponent")).toHaveTextContent("HP 170 → 130");
    expect(screen.getByTestId("event-live")).toHaveTextContent(/Golem HP 170 to 130/);
    expect(screen.getByTestId("event-live")).toHaveTextContent(/gained 12 XP/);
    // Panels reflect the applied fixture.
    expect(screen.getByTestId("player-xp-value")).toHaveTextContent("12 xp");
  });
});

describe("Round B — pressure cut", () => {
  it("shows and announces the one-time −5s cut when the Golem answers first", () => {
    vi.useFakeTimers();
    render(<RankedTutorialPage />);
    throughRoundA();
    act(() => {
      vi.advanceTimersByTime(6000); // 30 → 24 → golem submits → 19
    });
    expect(screen.getByTestId("timer-seconds")).toHaveTextContent("19s");
    expect(screen.getByTestId("timer-cut-note")).toHaveTextContent("−5s");
    expect(screen.getByTestId("event-live")).toHaveTextContent(/lost 5 seconds/);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("timer-seconds")).toHaveTextContent("18s"); // no second cut
  });

  it("completes with both-correct copy after lock, confirm, and reveal", () => {
    vi.useFakeTimers();
    render(<RankedTutorialPage />);
    throughRoundA();
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    fireEvent.click(screen.getByTestId("answer-1"));
    fireEvent.click(screen.getByTestId("lock-submission"));
    fireEvent.click(screen.getByTestId("confirm-lock"));
    cont(); // reveal
    expect(screen.getByTestId("result-copy")).toHaveTextContent(
      "Both players were correct, so both dealt damage.",
    );
    expect(screen.getByTestId("reveal-player")).toHaveTextContent("HP 170 → 150");
    expect(screen.getByTestId("reveal-opponent")).toHaveTextContent("HP 130 → 110");
  });
});

describe("Round C — timeout demonstration", () => {
  const toRoundC = () => {
    vi.useFakeTimers();
    render(<RankedTutorialPage />);
    throughRoundA();
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    fireEvent.click(screen.getByTestId("answer-1"));
    fireEvent.click(screen.getByTestId("lock-submission"));
    fireEvent.click(screen.getByTestId("confirm-lock"));
    cont(); // reveal B
    cont(); // → failure_demo
  };

  it("does not require 30 real seconds — one click fast-forwards", () => {
    toRoundC();
    // No timer advancement at all: the demo is instantaneous.
    fireEvent.click(screen.getByTestId("simulate-timeout"));
    expect(screen.getByTestId("timer-seconds")).toHaveTextContent("0s");
    const reveal = screen.getByTestId("reveal-panel");
    expect(within(reveal).getByTestId("reveal-player")).toHaveTextContent(
      "No answer (timed out)",
    );
    expect(within(reveal).getByTestId("reveal-opponent")).toHaveTextContent(
      "No answer (timed out)",
    );
    // No damage; HP unchanged.
    expect(within(reveal).getByTestId("reveal-player")).toHaveTextContent("HP 150 → 150");
    expect(within(reveal).getByTestId("reveal-opponent")).toHaveTextContent("HP 110 → 110");
  });

  it("announces Level 2 and shows the level-up badge", () => {
    toRoundC();
    fireEvent.click(screen.getByTestId("simulate-timeout"));
    expect(screen.getByTestId("level-up-badge")).toHaveTextContent("Level 2 reached!");
    expect(screen.getByTestId("event-live")).toHaveTextContent(/Level 2/);
    cont(); // → xp_intro
    expect(screen.getByTestId("player-xp-value")).toHaveTextContent(
      "32 xp · next level at 66",
    );
  });
});

describe("accessibility and isolation", () => {
  it("moves focus to the instruction area after a step transition", () => {
    render(<RankedTutorialPage />);
    begin();
    const live = screen.getByTestId("instruction-live");
    // The focus wrapper contains the instruction panel.
    expect(document.activeElement?.contains(live)).toBe(true);
  });

  it("restart works from mid-round and resets everything", () => {
    render(<RankedTutorialPage />);
    toRoundA();
    fireEvent.click(screen.getByTestId("answer-1"));
    fireEvent.click(screen.getByTestId("lock-submission"));
    fireEvent.click(screen.getByTestId("restart-tutorial"));
    expect(screen.getByText("Welcome to Ranked training")).toBeInTheDocument();
    expect(screen.getByTestId("tutorial-progress")).toHaveTextContent("Step 1 of 18");
    expect(screen.getByTestId("player-xp-value")).toHaveTextContent("0 xp");
  });

  it("never calls fetch or writes local/session storage across the full flow", () => {
    vi.useFakeTimers();
    render(<RankedTutorialPage />);
    throughRoundA();
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    fireEvent.click(screen.getByTestId("answer-1"));
    fireEvent.click(screen.getByTestId("lock-submission"));
    fireEvent.click(screen.getByTestId("confirm-lock"));
    cont();
    cont();
    fireEvent.click(screen.getByTestId("simulate-timeout"));
    cont();
    fireEvent.click(screen.getByTestId("restart-tutorial"));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localSet).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();
  });
});
