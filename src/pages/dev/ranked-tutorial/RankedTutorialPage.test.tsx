import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
  vi.unstubAllGlobals();
  localSet.mockRestore();
  sessionSet.mockRestore();
  fetchSpy.mockClear();
});

describe("RankedTutorialPage", () => {
  it("renders the Training Match shell on the welcome step", () => {
    render(<RankedTutorialPage />);
    expect(screen.getByRole("heading", { name: "Training Match" })).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Training Golem panel" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("tutorial-progress")).toHaveTextContent("Step 1 of 18");
    expect(screen.getByTestId("timer-paused-note")).toHaveTextContent(
      "Timer paused for training",
    );
  });

  it("labels HP and XP separately for both combatants", () => {
    render(<RankedTutorialPage />);
    const meters = screen.getAllByRole("meter");
    expect(meters).toHaveLength(2); // one HP meter per combatant
    expect(meters[0]).toHaveAttribute("aria-valuenow", "170");
    expect(screen.getByTestId("player-xp-value")).toHaveTextContent("0 xp");
    expect(screen.getByTestId("opponent-xp-value")).toHaveTextContent("0 xp");
  });

  it("exposes an aria-live instructional region", () => {
    render(<RankedTutorialPage />);
    const live = screen.getByTestId("instruction-live");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveTextContent("Welcome to Ranked training");
  });

  it("Begin Training is keyboard operable and advances to the timer step", () => {
    render(<RankedTutorialPage />);
    const begin = screen.getByTestId("begin-training");
    begin.focus();
    expect(begin).toHaveFocus();
    // Native <button>: Enter/Space produce a click event.
    fireEvent.click(begin);
    expect(screen.getByText("One shared timer")).toBeInTheDocument();
    expect(screen.getByTestId("tutorial-progress")).toHaveTextContent("Step 2 of 18");
    // Timer remains paused during the explanation state.
    expect(screen.getByTestId("timer-paused-note")).toBeInTheDocument();
    expect(screen.getByTestId("timer-seconds")).toHaveTextContent("30s");
  });

  it("Restart returns to the welcome step", () => {
    render(<RankedTutorialPage />);
    fireEvent.click(screen.getByTestId("begin-training"));
    expect(screen.getByText("One shared timer")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("restart-tutorial"));
    expect(screen.getByText("Welcome to Ranked training")).toBeInTheDocument();
    expect(screen.getByTestId("tutorial-progress")).toHaveTextContent("Step 1 of 18");
  });

  it("never calls fetch or writes local/session storage", () => {
    render(<RankedTutorialPage />);
    fireEvent.click(screen.getByTestId("begin-training"));
    fireEvent.click(screen.getByTestId("continue-step"));
    fireEvent.click(screen.getByTestId("restart-tutorial"));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localSet).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();
  });
});
