import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, act, fireEvent } from "@testing-library/react";
import RankedDuelPrototype from "./RankedDuelPrototype";
import { MOCK_QUESTIONS, REVEAL_DELAY_MS } from "./fixtures";

// Fake timers keep the 1s tick loop and reveal delay deterministic.
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const startMatch = () => {
  render(<RankedDuelPrototype />);
  fireEvent.click(screen.getByRole("button", { name: /start mock match/i }));
};

const q0 = MOCK_QUESTIONS[0];
const correctChoice = q0.choices[q0.correctIndex];
const wrongChoice = q0.choices[(q0.correctIndex + 1) % q0.choices.length];

// Radix Tabs only mounts the active tab's content, so activate the player's
// dev-controls tab before querying inside it.
const controls = (p: "p1" | "p2") => {
  const trigger = screen.getByRole("tab", { name: new RegExp(`player ${p === "p1" ? 1 : 2}`, "i") });
  fireEvent.mouseDown(trigger);
  fireEvent.click(trigger);
  return within(screen.getByTestId(`${p}-controls`));
};

describe("RankedDuelPrototype component", () => {
  it("shows setup then enters the duel with both players at level 1", () => {
    startMatch();
    expect(screen.getByTestId("question-prompt")).toHaveTextContent(q0.prompt);
    expect(screen.getAllByText("Lv 1")).toHaveLength(2);
  });

  it("keeps answer and ability choices out of the primary panels before reveal", () => {
    startMatch();

    // P1 submits an answer and locks an ability via the dev controls.
    fireEvent.click(controls("p1").getAllByRole("button", { name: new RegExp(correctChoice) })[0]);
    fireEvent.click(controls("p1").getByRole("button", { name: /bulwark/i }));
    fireEvent.click(controls("p1").getByRole("button", { name: /^lock ability$/i }));

    // Primary panel shows only neutral statuses — never the actual choices.
    const p1Status = within(screen.getByTestId("p1-status"));
    expect(p1Status.getByText(/submission complete/i)).toBeInTheDocument();
    expect(p1Status.queryByText(new RegExp(correctChoice))).toBeNull();
    expect(p1Status.queryByText(/bulwark/i)).toBeNull();
    expect(within(screen.getByTestId("p2-status")).getByText(/thinking/i)).toBeInTheDocument();
    expect(screen.queryByTestId("reveal-panel")).toBeNull();
  });

  it("reveals both players' answers and abilities together after both submit", () => {
    startMatch();

    fireEvent.click(controls("p1").getAllByRole("button", { name: new RegExp(correctChoice) })[0]);
    fireEvent.click(controls("p1").getByRole("button", { name: /bulwark/i }));
    fireEvent.click(controls("p1").getByRole("button", { name: /^lock ability$/i }));
    fireEvent.click(controls("p2").getAllByRole("button", { name: new RegExp(wrongChoice) })[0]);

    // Both answered -> awaiting_reveal immediately, then reveal after the delay.
    expect(screen.getByTestId("awaiting-reveal")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(REVEAL_DELAY_MS);
    });

    const reveal = screen.getByTestId("reveal-panel");
    const p1 = within(within(reveal).getByTestId("reveal-p1"));
    const p2 = within(within(reveal).getByTestId("reveal-p2"));
    expect(p1.getByText("Correct")).toBeInTheDocument();
    expect(p1.getByText(new RegExp(correctChoice))).toBeInTheDocument();
    expect(p1.getByText(/bulwark/i)).toBeInTheDocument();
    expect(p2.getByText("Incorrect")).toBeInTheDocument();
    expect(p2.getByText(new RegExp(wrongChoice))).toBeInTheDocument();
    expect(screen.getByTestId("combat-log")).toBeInTheDocument();
  });

  it("shortens the timer by 5s on the first submission and expires unanswered players", () => {
    startMatch();
    expect(screen.getByTestId("timer-seconds")).toHaveTextContent("20s");

    fireEvent.click(controls("p1").getAllByRole("button", { name: new RegExp(correctChoice) })[0]);
    expect(screen.getByTestId("timer-seconds")).toHaveTextContent("15s");

    // Let the shortened timer run out; p2 never answers.
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    act(() => {
      vi.advanceTimersByTime(REVEAL_DELAY_MS);
    });
    expect(
      within(screen.getByTestId("reveal-p2")).getAllByText(/timed out/i).length,
    ).toBeGreaterThan(0);
  });
});
