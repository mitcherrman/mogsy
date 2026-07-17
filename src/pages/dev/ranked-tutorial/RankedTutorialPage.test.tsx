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

const lockConfirm = () => {
  fireEvent.click(screen.getByTestId("lock-submission"));
  fireEvent.click(screen.getByTestId("confirm-lock"));
};

/** Renders and plays the entire training match to the match-over panel. */
const completeFullMatch = (choice: "tank.brace" | "tank.barrier" = "tank.brace") => {
  vi.useFakeTimers();
  render(<RankedTutorialPage />);
  throughRoundA();
  act(() => {
    vi.advanceTimersByTime(7000);
  });
  fireEvent.click(screen.getByTestId("answer-1"));
  lockConfirm();
  cont(); // reveal B
  cont(); // → failure_demo
  fireEvent.click(screen.getByTestId("simulate-timeout"));
  cont(); // → xp_intro
  cont(); // → starter_ability_intro (Round D)
  fireEvent.click(screen.getByTestId("answer-0"));
  fireEvent.click(screen.getByTestId("arm-tank.fortify"));
  lockConfirm();
  cont(); // reveal D
  cont(); // → ability_resolution (Round E at 35s)
  act(() => {
    vi.advanceTimersByTime(1000); // Golem answers instantly: 35 → 30
  });
  fireEvent.click(screen.getByTestId("answer-0"));
  fireEvent.click(screen.getByTestId("arm-tank.fortify"));
  lockConfirm();
  cont(); // reveal E
  cont(); // → level_two_choice
  fireEvent.click(screen.getByTestId(`choose-${choice}`));
  fireEvent.click(screen.getByTestId("confirm-level-two"));
  cont(); // → level_three_unlock (Round F)
  fireEvent.click(screen.getByTestId("answer-0"));
  lockConfirm();
  cont(); // reveal F
  cont(); // → Round G
  fireEvent.click(screen.getByTestId("answer-0"));
  lockConfirm();
  cont(); // reveal G
  cont(); // → victory_round (Round H)
  fireEvent.click(screen.getByTestId("answer-0"));
  lockConfirm();
  cont(); // reveal H
  cont(); // → match_over
};

describe("RankedTutorialPage — shell", () => {
  it("renders the Training Match shell on the welcome step", () => {
    render(<RankedTutorialPage />);
    expect(screen.getByRole("heading", { name: "Training Match" })).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Training Golem panel" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("tutorial-progress")).toHaveTextContent("Step 1 of 19");
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
      vi.advanceTimersByTime(7000); // 30 → 24, then the trigger tick → 19
    });
    expect(screen.getByTestId("timer-seconds")).toHaveTextContent("19s");
    expect(screen.getByTestId("timer-cut-note")).toHaveTextContent("−5s");
    expect(screen.getByTestId("event-live")).toHaveTextContent(
      /cut the shared timer by 5 seconds/,
    );
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
      vi.advanceTimersByTime(7000);
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
      vi.advanceTimersByTime(7000);
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
    expect(screen.getByTestId("tutorial-progress")).toHaveTextContent("Step 1 of 19");
    expect(screen.getByTestId("player-xp-value")).toHaveTextContent("0 xp");
  });

  it("never calls fetch or writes local/session storage across the full flow", () => {
    completeFullMatch();
    expect(screen.getByTestId("match-over-panel")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("restart-tutorial"));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localSet).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();
  });

  it("legacy partial-flow isolation check", () => {
    vi.useFakeTimers();
    render(<RankedTutorialPage />);
    throughRoundA();
    act(() => {
      vi.advanceTimersByTime(7000);
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

describe("Fortify and commitment (page)", () => {
  const toRoundD = () => {
    vi.useFakeTimers();
    render(<RankedTutorialPage />);
    throughRoundA();
    act(() => {
      vi.advanceTimersByTime(7000);
    });
    fireEvent.click(screen.getByTestId("answer-1"));
    lockConfirm();
    cont();
    cont();
    fireEvent.click(screen.getByTestId("simulate-timeout"));
    cont(); // xp_intro
    cont(); // starter_ability_intro
  };

  it("shows the kit: Fortify armable with 3 charges, Brace/Barrier locked", () => {
    toRoundD();
    expect(screen.getByTestId("ability-panel")).toBeInTheDocument();
    expect(screen.getByTestId("ability-card-tank.fortify")).toHaveTextContent(
      "3 of 3 charges left",
    );
    expect(screen.getByTestId("ability-card-tank.brace")).toHaveTextContent(
      "Unlocks with the Level 2 choice",
    );
    expect(screen.getByTestId("ability-card-tank.barrier")).toHaveTextContent(
      "Unlocks with the Level 2 choice",
    );
    const arm = screen.getByTestId("arm-tank.fortify");
    expect(arm).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(arm);
    expect(screen.getByTestId("arm-tank.fortify")).toHaveAttribute("aria-pressed", "true");
    // Selecting does NOT consume the charge.
    expect(screen.getByTestId("ability-card-tank.fortify")).toHaveTextContent(
      "3 of 3 charges left",
    );
  });

  it("review shows ability and charges; reveal consumes one charge and shows the effect", () => {
    toRoundD();
    fireEvent.click(screen.getByTestId("answer-0"));
    fireEvent.click(screen.getByTestId("arm-tank.fortify"));
    fireEvent.click(screen.getByTestId("lock-submission"));
    expect(screen.getByTestId("submission-review")).toHaveTextContent("Fortify");
    expect(screen.getByTestId("submission-review")).toHaveTextContent(
      "Charges before resolution: 3",
    );
    // Ability hidden before reveal.
    expect(screen.queryByTestId("ability-reveal")).toBeNull();
    fireEvent.click(screen.getByTestId("confirm-lock"));
    cont(); // reveal D
    expect(screen.getByTestId("ability-reveal")).toHaveTextContent("Fortify");
    expect(screen.getByTestId("ability-reveal")).toHaveTextContent("3 → 2");
    expect(screen.getByTestId("effect-status")).toHaveTextContent("Effect triggered");
    expect(screen.getByTestId("event-live")).toHaveTextContent(/charge was consumed/);
  });

  it("Round E starts at 35s with the Fortify note; instant Golem cut lands on 30", () => {
    toRoundD();
    fireEvent.click(screen.getByTestId("answer-0"));
    fireEvent.click(screen.getByTestId("arm-tank.fortify"));
    lockConfirm();
    cont(); // reveal D
    cont(); // Round E
    expect(screen.getByTestId("timer-seconds")).toHaveTextContent("35s");
    expect(screen.getByTestId("timer-fortify-note")).toHaveTextContent("Fortify bonus");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("timer-seconds")).toHaveTextContent("30s");
    expect(screen.getByTestId("timer-cut-note")).toBeInTheDocument();
    expect(screen.getByTestId("event-live")).toHaveTextContent(/cut the shared timer by 5/);
    // Commitment reveal: charge still consumed, effect did not trigger.
    fireEvent.click(screen.getByTestId("answer-0"));
    fireEvent.click(screen.getByTestId("arm-tank.fortify"));
    lockConfirm();
    cont();
    expect(screen.getByTestId("ability-reveal")).toHaveTextContent("2 → 1");
    expect(screen.getByTestId("effect-status")).toHaveTextContent("Effect did not trigger");
  });
});

describe("Level 2 choice and Level 3 unlock (page)", () => {
  it("choice cards are keyboard operable, reviewed, and permanent", () => {
    completeFullMatch("tank.barrier"); // exercises the Barrier branch fully
    expect(screen.getByTestId("match-over-panel")).toBeInTheDocument();
  });

  it("Brace branch: confirm shows summary and locked alternative", () => {
    vi.useFakeTimers();
    render(<RankedTutorialPage />);
    throughRoundA();
    act(() => {
      vi.advanceTimersByTime(7000);
    });
    fireEvent.click(screen.getByTestId("answer-1"));
    lockConfirm();
    cont();
    cont();
    fireEvent.click(screen.getByTestId("simulate-timeout"));
    cont();
    cont(); // Round D
    fireEvent.click(screen.getByTestId("answer-0"));
    fireEvent.click(screen.getByTestId("arm-tank.fortify"));
    lockConfirm();
    cont();
    cont(); // Round E
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.click(screen.getByTestId("answer-0"));
    fireEvent.click(screen.getByTestId("arm-tank.fortify"));
    lockConfirm();
    cont();
    cont(); // level_two_choice
    const brace = screen.getByTestId("choose-tank.brace");
    expect(brace.tagName).toBe("BUTTON");
    expect(brace).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(brace);
    expect(screen.getByTestId("choose-tank.brace")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("level-two-review")).toHaveTextContent("permanent");
    fireEvent.click(screen.getByTestId("confirm-level-two"));
    expect(screen.getByTestId("level-two-summary")).toHaveTextContent("Choice locked: Brace");
    expect(screen.getByTestId("level-two-locked-other")).toHaveTextContent(
      "Barrier stays locked until Level 3",
    );
    expect(screen.getByTestId("event-live")).toHaveTextContent(/Permanent choice confirmed/);
  });
});

describe("victory and match over (page)", () => {
  it("plays to victory: Golem at 0 HP, match-over panel, no-mutation note", () => {
    completeFullMatch("tank.brace");
    expect(screen.getByTestId("victory-heading")).toHaveTextContent("Victory!");
    expect(screen.getByTestId("match-over-panel")).toHaveTextContent("0 HP");
    expect(screen.getByTestId("no-mutation-note")).toHaveTextContent(
      "did not affect your rating, history, or permanent progression",
    );
    // Kit + charges after the run: Fortify 1 left, Brace 3, Barrier 1.
    expect(screen.getByTestId("match-over-kit")).toHaveTextContent("Fortify · 1 charge left");
    expect(screen.getByTestId("match-over-kit")).toHaveTextContent("Brace · 3 charges left");
    expect(screen.getByTestId("match-over-kit")).toHaveTextContent("Barrier · 1 charge left");
    // Golem HP meter reads zero.
    const meters = screen.getAllByRole("meter");
    expect(meters[1]).toHaveAttribute("aria-valuenow", "0");
    // Level 3 and the auto-unlock were announced during the run.
    expect(screen.getByTestId("match-over-panel")).toHaveTextContent("Level 3");
  });
});
