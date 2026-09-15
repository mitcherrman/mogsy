/**
 * RM1 Pass 2B — the header's focal display.
 *
 * The sequence under test is clock → result → next module's name → clock, and
 * the properties that matter are that it cannot skip, cannot replay, and
 * cannot show a `LOCKED IN` phase that does not exist.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { CentralStage } from "./CentralStage";
import { MODULE_TITLE_MS } from "@/lib/ranked-core/centralStage";
import type { TimerView } from "@/lib/ranked-core/viewTypes";

const timer = (over: Partial<TimerView> = {}): TimerView => ({
  durationSeconds: 30, remainingSeconds: 8, paused: false, urgent: false, ...over,
});

const stage = () => screen.getByTestId("timer-display").getAttribute("data-stage");

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("the clock face", () => {
  it("shows the remaining time and its duration", () => {
    render(<CentralStage timer={timer()} result={null} moduleTitle={null} moduleEventId={null} />);
    expect(stage()).toBe("timer");
    expect(screen.getByTestId("timer-value")).toHaveTextContent("0:08");
    expect(screen.getByTestId("timer-value")).toHaveAttribute("data-timer-state", "running");
  });

  it("marks urgent and expired states without changing the box", () => {
    const { rerender } = render(<CentralStage timer={timer({ remainingSeconds: 3, urgent: true })}
      result={null} moduleTitle={null} moduleEventId={null} />);
    expect(screen.getByTestId("timer-value")).toHaveAttribute("data-timer-state", "urgent");
    rerender(<CentralStage timer={timer({ remainingSeconds: 0 })}
      result={null} moduleTitle={null} moduleEventId={null} />);
    expect(screen.getByTestId("timer-value")).toHaveAttribute("data-timer-state", "zero");
    expect(screen.getByTestId("central-timer-expired")).toBeInTheDocument();
  });
});

describe("the result face", () => {
  const withResult = (verdict: string, points: string) => render(
    <CentralStage timer={timer()} result={{ verdict, points }}
      moduleTitle="Champion Abilities" moduleEventId={4} />);

  it("outranks the clock for the whole of the beat", () => {
    withResult("CORRECT", "+2 POINTS");
    expect(stage()).toBe("result");
    expect(screen.getByTestId("central-result-verdict")).toHaveTextContent("CORRECT");
    expect(screen.getByTestId("central-result-points")).toHaveTextContent("+2 POINTS");
    // The clock is not drawn underneath it — one face at a time.
    expect(screen.queryByTestId("timer-value")).toBeNull();
  });

  it("states an incorrect and a timed-out module in the same two lines", () => {
    withResult("INCORRECT", "+0 POINTS");
    expect(screen.getByTestId("central-result-verdict")).toHaveTextContent("INCORRECT");
    expect(screen.getByTestId("central-result-points")).toHaveTextContent("+0 POINTS");
    screen.getByTestId("timer-display");
  });

  it("announces the result as ONE sentence", () => {
    withResult("TIMED OUT", "+0 POINTS");
    expect(screen.getByRole("status")).toHaveAccessibleName("TIMED OUT, +0 POINTS");
  });

  it("has no LOCKED IN phase", () => {
    // Locking is a fact about a PLAYER and is stated by the duelist columns'
    // answer chips. The header's clock never becomes a lock indicator.
    render(<CentralStage timer={timer()} result={null} moduleTitle={null} moduleEventId={1} />);
    expect(screen.getByTestId("timer-display").textContent).not.toMatch(/locked/i);
  });
});

describe("the module-name face, and the sequence", () => {
  it("runs AFTER the result, then hands the centre back to the clock", () => {
    const props = { timer: timer(), moduleTitle: "Champion Abilities", moduleEventId: 4 };
    // The beat is running: the result holds the centre and the name waits.
    const { rerender } = render(
      <CentralStage {...props} result={{ verdict: "CORRECT", points: "+2 POINTS" }} />);
    expect(stage()).toBe("result");

    // The beat ends (the mode clears the gated award) and the next module has
    // opened, so its name takes its turn.
    act(() => { rerender(<CentralStage {...props} result={null} />); });
    expect(stage()).toBe("module");
    expect(screen.getByTestId("central-module-title")).toHaveTextContent("Champion Abilities");

    // ...and then the clock, which has been running on the server throughout.
    act(() => { vi.advanceTimersByTime(MODULE_TITLE_MS + 20); });
    expect(stage()).toBe("timer");
  });

  it("plays a module's name ONCE, however many polls land", () => {
    // The poll re-delivers the same round every second. A face keyed on
    // identity rather than on the round would restart on each one.
    const props = {
      timer: timer(), result: null, moduleTitle: "Items", moduleEventId: 7,
    };
    const { rerender } = render(<CentralStage {...props} />);
    act(() => { vi.advanceTimersByTime(MODULE_TITLE_MS + 20); });
    expect(stage()).toBe("timer");
    for (let i = 0; i < 5; i += 1) {
      act(() => { rerender(<CentralStage {...props} />); vi.advanceTimersByTime(30); });
    }
    expect(stage()).toBe("timer");
  });

  it("skips the face entirely when the round published no name", () => {
    // A generic word in a slot reserved for a name is worse than no slot.
    render(<CentralStage timer={timer()} result={null} moduleTitle={null} moduleEventId={3} />);
    expect(stage()).toBe("timer");
    expect(screen.queryByTestId("central-module-title")).toBeNull();
  });

  it("plays again for a genuinely new module", () => {
    const base = { timer: timer(), result: null };
    const { rerender } = render(
      <CentralStage {...base} moduleTitle="Items" moduleEventId={7} />);
    act(() => { vi.advanceTimersByTime(MODULE_TITLE_MS + 20); });
    expect(stage()).toBe("timer");
    act(() => {
      rerender(<CentralStage {...base} moduleTitle="Meta Reflex" moduleEventId={8} />);
    });
    expect(stage()).toBe("module");
    expect(screen.getByTestId("central-module-title")).toHaveTextContent("Meta Reflex");
  });
});
