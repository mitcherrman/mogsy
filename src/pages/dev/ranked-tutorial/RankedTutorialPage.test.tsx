import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RankedTutorialPage from "./RankedTutorialPage";
import { TUTORIAL_GOLEM_ID, TUTORIAL_PLAYER_ID } from "./adapters";

// The completion panel renders an ordinary route Link, so tests mount the
// page inside a memory router. No navigation is ever triggered by tests.
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/dev/ranked-tutorial"]}>
      <RankedTutorialPage />
    </MemoryRouter>,
  );

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
const pickAnswer = (label: string) =>
  fireEvent.click(screen.getByRole("button", { name: new RegExp(label) }));
const reviewAndConfirm = () => {
  fireEvent.click(screen.getByTestId("review-button"));
  fireEvent.click(screen.getByTestId("confirm-button"));
};

/** welcome → answer_selection */
const toRoundA = () => {
  begin();
  cont();
};

/** Completes Round A through the canonical reveal and on to Round B. */
const throughRoundA = () => {
  toRoundA();
  pickAnswer("Five");
  reviewAndConfirm();
  cont(); // simultaneous reveal
  cont(); // damage_intro
  cont(); // both_correct_demo
};

/** Renders and plays the entire training match to the match-over frame. */
const completeFullMatch = (choice: "tank.brace" | "tank.barrier" = "tank.brace") => {
  vi.useFakeTimers();
  renderPage();
  throughRoundA();
  act(() => {
    vi.advanceTimersByTime(7000); // 30 → 24, then the trigger tick → 19
  });
  pickAnswer("Mid lane");
  reviewAndConfirm();
  cont(); // reveal B
  cont(); // → failure_demo
  fireEvent.click(screen.getByTestId("simulate-timeout"));
  cont(); // → xp_intro
  cont(); // → starter_ability_intro (Round D)
  pickAnswer("Soak damage up front");
  fireEvent.click(screen.getByTestId("ability-tank.fortify"));
  reviewAndConfirm();
  cont(); // reveal D
  cont(); // → ability_resolution (Round E at 35s)
  act(() => {
    vi.advanceTimersByTime(1000); // Golem answers instantly: 35 → 30
  });
  pickAnswer("The shop");
  fireEvent.click(screen.getByTestId("ability-tank.fortify"));
  reviewAndConfirm();
  cont(); // reveal E
  cont(); // → level_two_choice
  fireEvent.click(screen.getByTestId(`level-option-${choice}`));
  fireEvent.click(screen.getByTestId("level-confirm"));
  cont(); // → level_three_unlock (Round F)
  pickAnswer("Blue");
  reviewAndConfirm();
  cont(); // reveal F
  cont(); // → Round G
  pickAnswer("Destroying the enemy Nexus");
  reviewAndConfirm();
  cont(); // reveal G
  cont(); // → victory_round (Round H)
  pickAnswer("Reducing your opponent's HP to zero");
  reviewAndConfirm();
  cont(); // reveal H
  cont(); // → match_over
};

/** From match_over to the completion panel. */
const throughEducation = () => {
  fireEvent.click(screen.getByTestId("match-over-primary")); // Continue
  fireEvent.click(screen.getByTestId("simulate-matchmaking"));
  cont(); // → reconnect_explanation
  fireEvent.click(screen.getByTestId("simulate-disconnect"));
  cont(); // → ads_pro_explanation
  cont(); // → complete
};

describe("shell on the canonical arena", () => {
  it("renders both canonical combatant panels and the paused shared timer", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Training Match" })).toBeInTheDocument();
    expect(screen.getByTestId(`combatant-${TUTORIAL_PLAYER_ID}`)).toBeInTheDocument();
    expect(screen.getByTestId(`combatant-${TUTORIAL_GOLEM_ID}`)).toHaveTextContent(
      "Training Golem",
    );
    expect(screen.getByTestId("tutorial-progress")).toHaveTextContent("Step 1 of 19");
    expect(screen.getByTestId("timer-paused")).toBeInTheDocument();
    expect(screen.getByTestId("timer-value")).toHaveTextContent("0:30");
  });

  it("shows canonical HP meters and XP-to-next-threshold text", () => {
    renderPage();
    const meters = screen.getAllByRole("meter");
    expect(meters).toHaveLength(2);
    expect(meters[0]).toHaveAttribute("aria-valuenow", "170");
    expect(screen.getByTestId(`xp-${TUTORIAL_PLAYER_ID}`)).toHaveTextContent("0 / 30 xp");
  });
});

describe("canonical answer interaction", () => {
  it("select → review → confirm; nothing submits silently", () => {
    renderPage();
    toRoundA();
    expect(screen.getByTestId("answer-grid")).toHaveAttribute("data-answers-state", "open");
    pickAnswer("Five");
    // Still selecting: no locked banner, no reveal.
    expect(screen.queryByTestId("locked-banner")).toBeNull();
    expect(screen.queryByTestId("reveal-panel")).toBeNull();
    fireEvent.click(screen.getByTestId("review-button"));
    expect(screen.getByTestId("review-answer")).toHaveTextContent("Five");
    expect(screen.getByTestId("review-ability")).toHaveTextContent("No ability");
    fireEvent.click(screen.getByTestId("confirm-button"));
    expect(screen.getByTestId("locked-banner")).toBeInTheDocument();
    expect(screen.getByTestId("locked-answer")).toHaveTextContent("Five");
  });

  it("a wrong pick gets a coach note and a disabled confirm; Edit recovers", () => {
    renderPage();
    toRoundA();
    pickAnswer("Three");
    fireEvent.click(screen.getByTestId("review-button"));
    expect(screen.getByTestId("submission-status")).toHaveTextContent("Training tip");
    expect(screen.getByTestId("confirm-button")).toBeDisabled();
    fireEvent.click(screen.getByTestId("edit-button"));
    pickAnswer("Five");
    fireEvent.click(screen.getByTestId("review-button"));
    expect(screen.getByTestId("confirm-button")).toBeEnabled();
  });

  it("opponent stays neutral pre-reveal; both sides appear together at reveal", () => {
    renderPage();
    toRoundA();
    pickAnswer("Five");
    reviewAndConfirm();
    // Neutral canonical status chips only — no answer content anywhere.
    expect(screen.getByTestId(`status-${TUTORIAL_GOLEM_ID}`)).toHaveTextContent(
      "Answer locked",
    );
    expect(screen.queryByTestId("reveal-panel")).toBeNull();
    cont(); // simultaneous reveal via canonical RevealPanel
    const reveal = screen.getByTestId("reveal-panel");
    expect(within(reveal).getByTestId(`answer-${TUTORIAL_PLAYER_ID}`)).toHaveTextContent(
      "Five",
    );
    expect(within(reveal).getByTestId(`answer-${TUTORIAL_GOLEM_ID}`)).toHaveTextContent(
      "Three",
    );
    expect(within(reveal).getByTestId(`outcome-${TUTORIAL_GOLEM_ID}`)).toHaveTextContent(
      "Incorrect",
    );
    expect(within(reveal).getByTestId(`reveal-hp-${TUTORIAL_GOLEM_ID}`)).toHaveTextContent(
      "170 → 130",
    );
  });
});

describe("Round B — pressure cut on the canonical timer", () => {
  it("shows and announces the one-time −5s cut when the Golem answers first", () => {
    vi.useFakeTimers();
    renderPage();
    throughRoundA();
    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(screen.getByTestId("timer-value")).toHaveTextContent("0:19");
    expect(screen.getByTestId("timer-notice")).toHaveTextContent("−5s");
    expect(screen.getByTestId("event-live")).toHaveTextContent(
      /cut the shared timer by 5 seconds/,
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("timer-value")).toHaveTextContent("0:18"); // no second cut
  });
});

describe("Fortify on the canonical ability tray", () => {
  it("arms via AbilityTray, reveals commitment facts through RevealPanel", () => {
    vi.useFakeTimers();
    renderPage();
    throughRoundA();
    act(() => {
      vi.advanceTimersByTime(7000);
    });
    pickAnswer("Mid lane");
    reviewAndConfirm();
    cont();
    cont(); // failure_demo
    fireEvent.click(screen.getByTestId("simulate-timeout"));
    cont(); // xp_intro
    cont(); // Round D
    const fortify = screen.getByTestId("ability-tank.fortify");
    expect(fortify).toHaveAttribute("data-ability-state", "available");
    expect(fortify).toHaveTextContent("3 charges left");
    expect(screen.getByTestId("ability-tank.brace")).toHaveAttribute(
      "data-ability-state",
      "locked-progression",
    );
    pickAnswer("Soak damage up front");
    fireEvent.click(fortify);
    expect(screen.getByTestId("ability-tank.fortify")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Selecting does not consume the charge.
    expect(screen.getByTestId("ability-tank.fortify")).toHaveTextContent("3 charges left");
    fireEvent.click(screen.getByTestId("review-button"));
    expect(screen.getByTestId("review-ability")).toHaveTextContent("Fortify");
    fireEvent.click(screen.getByTestId("confirm-button"));
    cont(); // reveal D
    const reveal = screen.getByTestId("reveal-panel");
    expect(within(reveal).getByTestId(`ability-${TUTORIAL_PLAYER_ID}`)).toHaveTextContent(
      "charge consumed",
    );
    expect(screen.getByTestId("event-live")).toHaveTextContent(/charge was consumed/);
    cont(); // Round E at 35s with Fortify notice
    expect(screen.getByTestId("timer-value")).toHaveTextContent("0:35");
    expect(screen.getByTestId("timer-notice")).toHaveTextContent("Fortify bonus");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("timer-value")).toHaveTextContent("0:30");
  });
});

describe("Level 2 and Level 3 on the canonical LevelUpPanel", () => {
  it("Brace branch reaches match over through level-option select + confirm", () => {
    completeFullMatch("tank.brace");
    expect(screen.getByTestId("match-over-frame")).toBeInTheDocument();
  });

  it("Barrier branch also reaches match over", () => {
    completeFullMatch("tank.barrier");
    expect(screen.getByTestId("match-over-frame")).toBeInTheDocument();
  });
});

describe("victory and match over on MatchOverFrame", () => {
  it("shows Victory, zero-HP Golem, tutorial summary, and no-mutation note", () => {
    completeFullMatch();
    expect(screen.getByTestId("match-over-heading")).toHaveTextContent("Victory!");
    const meters = screen.getAllByRole("meter");
    expect(meters.some((m) => m.getAttribute("aria-valuenow") === "0")).toBe(true);
    expect(screen.getByTestId("no-mutation-note")).toHaveTextContent(
      "did not affect your rating, history, or permanent progression",
    );
  });
});

describe("education panels and completion", () => {
  it("queue and recovery simulations still run; completion panel reached", () => {
    completeFullMatch();
    throughEducation();
    expect(
      within(screen.getByTestId("tutorial-complete-panel")).getByRole("heading", {
        name: "Tutorial complete",
      }),
    ).toHaveFocus();
    const link = screen.getByTestId("return-to-ranked");
    expect(link).toHaveAttribute("href", "/quiz");
  });

  it("Practice Again resets the canonical arena to the initial state", () => {
    completeFullMatch("tank.barrier");
    throughEducation();
    fireEvent.click(screen.getByTestId("practice-again"));
    expect(screen.getByText("Welcome to Ranked training")).toBeInTheDocument();
    expect(screen.getByTestId("tutorial-progress")).toHaveTextContent("Step 1 of 19");
    expect(screen.getByTestId(`xp-${TUTORIAL_PLAYER_ID}`)).toHaveTextContent("0 / 30 xp");
    const meters = screen.getAllByRole("meter");
    expect(meters[0]).toHaveAttribute("aria-valuenow", "170");
    expect(meters[1]).toHaveAttribute("aria-valuenow", "170");
  });

  it("never calls fetch or writes storage across the full canonical flow", () => {
    completeFullMatch();
    throughEducation();
    fireEvent.click(screen.getByTestId("practice-again"));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localSet).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();
  });
});

describe("accessibility", () => {
  it("moves focus to the instruction area after a step transition", () => {
    renderPage();
    begin();
    const live = screen.getByTestId("instruction-live");
    expect(document.activeElement?.contains(live)).toBe(true);
  });

  it("timer digits stay aria-live off; warnings go through the event region", () => {
    vi.useFakeTimers();
    renderPage();
    toRoundA();
    expect(screen.getByTestId("timer-value")).toHaveAttribute("aria-live", "off");
    act(() => {
      vi.advanceTimersByTime(26000); // 30 → 4, warning at ≤5
    });
    expect(screen.getByTestId("event-live")).toHaveTextContent(/seconds left/);
  });
});
