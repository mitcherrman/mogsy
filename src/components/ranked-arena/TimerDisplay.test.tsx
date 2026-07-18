import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimerView } from "@/lib/ranked-core/viewTypes";
import { TimerDisplay } from "./TimerDisplay";

const timer = (overrides: Partial<TimerView> = {}): TimerView => ({
  durationSeconds: 30,
  remainingSeconds: 18,
  paused: false,
  urgent: false,
  ...overrides,
});

describe("TimerDisplay", () => {
  it("renders the controlled remaining time with an accessible label", () => {
    render(<TimerDisplay timer={timer()} />);
    const value = screen.getByTestId("timer-value");
    expect(value).toHaveTextContent("0:18");
    expect(value).toHaveAttribute("aria-label", "Time remaining 0:18");
    expect(value).toHaveAttribute("data-timer-state", "running");
    // Ticking digits must not spam screen readers.
    expect(value).toHaveAttribute("aria-live", "off");
  });

  it("shows the paused state for externally paused timers", () => {
    render(<TimerDisplay timer={timer({ paused: true })} />);
    expect(screen.getByTestId("timer-paused")).toBeInTheDocument();
    expect(screen.getByTestId("timer-value")).toHaveAttribute("data-timer-state", "paused");
  });

  it("marks urgency without changing the value semantics", () => {
    render(<TimerDisplay timer={timer({ remainingSeconds: 4, urgent: true })} />);
    expect(screen.getByTestId("timer-value")).toHaveAttribute("data-timer-state", "urgent");
  });

  it("zero state clamps display and explains it is waiting on the backend", () => {
    render(<TimerDisplay timer={timer({ remainingSeconds: -3 })} />);
    expect(screen.getByTestId("timer-value")).toHaveTextContent("0:00");
    expect(screen.getByTestId("timer-value")).toHaveAttribute("data-timer-state", "zero");
    expect(screen.getByRole("status")).toHaveTextContent(/waiting for the round to resolve/i);
  });

  it("renders supplied modifier notices verbatim (no timer math)", () => {
    render(
      <TimerDisplay
        timer={timer({ modifierNotices: ["-5s first-answer pressure", "+5s Fortify"] })}
      />,
    );
    const notices = screen.getAllByTestId("timer-notice");
    expect(notices.map((n) => n.textContent)).toEqual([
      "-5s first-answer pressure",
      "+5s Fortify",
    ]);
  });
});
