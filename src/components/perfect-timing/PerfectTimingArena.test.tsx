import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PtStageModel } from "@/lib/perfect-timing/viewModel";
import { DEMO_HUD, DEMO_REVEALS, DEMO_ROUNDS, demoPress } from "./__stories__/demoViewModels";

const play = vi.fn();
vi.mock("@/lib/audio/useSfx", () => ({
  useSfx: () => ({ play, stop: () => {}, preload: () => {} }),
}));

import { PerfectTimingArena } from "./PerfectTimingArena";

const model = (over: Partial<PtStageModel> = {}): PtStageModel => ({
  round: DEMO_ROUNDS[1],
  phase: "armed",
  press: demoPress("Cast the ability"),
  reveal: null,
  onNext: () => {},
  hud: DEMO_HUD,
  ...over,
});

beforeEach(() => { play.mockClear(); });
afterEach(() => { vi.clearAllMocks(); });

describe("PerfectTimingArena — the stage and the reveal, no Ranked chrome", () => {
  it("draws the stage without mounting the Ranked arena", () => {
    render(<PerfectTimingArena model={model()} />);
    expect(screen.queryByTestId("quiz-ranked")).toBeNull();
    expect(document.querySelector(".ranked-question-stage")).toBeNull();
    expect(screen.getByTestId("pt-stage")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cast the ability" })).toBeInTheDocument();
  });

  it("carries no prototype, owner-lab or playtest copy, no flanks and no header note", () => {
    render(<PerfectTimingArena model={model()} />);
    expect(document.body.textContent).not.toMatch(/prototype|owner lab|playtest|not tamper|0 ability haste|hidden clock/i);
    expect(screen.queryByTestId("pt-flank-run")).toBeNull();
    expect(screen.queryByTestId("pt-flank-archive")).toBeNull();
    expect(screen.queryByTestId("ranked-round-transition")).toBeNull();
  });

  it("shows no clock anywhere and nothing periodic while running", () => {
    const { rerender } = render(<PerfectTimingArena model={model({ phase: "armed" })} />);
    expect(screen.queryByTestId("timer-value")).toBeNull();
    rerender(<PerfectTimingArena model={model({ phase: "running", press: demoPress("The ability is back up") })} />);
    expect(screen.queryByTestId("timer-value")).toBeNull();
    expect(screen.getByTestId("pt-stage").querySelectorAll(".animate-pulse")).toHaveLength(0);
  });

  it("swaps the seal for the reveal once a reveal exists, keeping the champion hero", () => {
    render(<PerfectTimingArena model={model({ phase: "revealed", reveal: DEMO_REVEALS.early, press: demoPress("seal", true) })} />);
    expect(screen.queryByTestId("pt-press-surface")).toBeNull();
    expect(screen.getByTestId("pt-reveal")).toBeInTheDocument();
    expect(screen.getByTestId("pt-round-plate")).toHaveAttribute("data-compact", "true");
    expect(screen.getByTestId("pt-champion")).toHaveTextContent("Archivist (demo)");
    expect(screen.getByTestId("pt-reveal-stage")).toHaveAttribute("data-tier", "perfect");
    expect(screen.getByTestId("pt-next")).toHaveTextContent("Next round");
  });

  it("hands focus to the next round's seal after a reveal, so the keyboard loop closes", () => {
    const { rerender } = render(<PerfectTimingArena model={model({ phase: "revealed", reveal: DEMO_REVEALS.early, press: demoPress("seal", true) })} />);
    expect(document.activeElement).not.toBe(screen.queryByTestId("pt-press-surface"));
    rerender(<PerfectTimingArena model={model({ round: DEMO_ROUNDS[2], phase: "armed" })} />);
    expect(document.activeElement).toBe(screen.getByTestId("pt-press-surface"));
  });

  it("does not steal focus when a round is armed from the first deal", () => {
    const { rerender } = render(<PerfectTimingArena model={model({ phase: "loading", round: null })} />);
    rerender(<PerfectTimingArena model={model({ phase: "armed" })} />);
    expect(document.activeElement).not.toBe(screen.getByTestId("pt-press-surface"));
  });

  it("labels the last round's way on as the results", () => {
    render(<PerfectTimingArena model={model({ round: DEMO_ROUNDS[4], phase: "revealed", reveal: DEMO_REVEALS.miss, press: demoPress("seal", true) })} />);
    expect(screen.getByTestId("pt-next")).toHaveTextContent("See results");
  });

  it("draws recovery actions under the status line and flags the stage for the seal to make room", () => {
    render(<PerfectTimingArena model={model({ phase: "error", press: demoPress("seal", true) })}
      actions={<button type="button">Try again</button>} />);
    expect(screen.getByTestId("pt-actions")).toContainElement(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByTestId("pt-stage")).toHaveAttribute("data-actions", "true");
  });
});

describe("PerfectTimingArena — sound", () => {
  it("plays the existing cues on the phase edges and nothing while running", () => {
    const { rerender } = render(<PerfectTimingArena model={model({ phase: "loading", round: null })} />);
    expect(play).not.toHaveBeenCalled();
    rerender(<PerfectTimingArena model={model({ phase: "armed" })} />);
    expect(play).toHaveBeenLastCalledWith("ranked.module.start", expect.objectContaining({ eventId: expect.stringContaining("pt_demo_02") }));
    rerender(<PerfectTimingArena model={model({ phase: "running" })} />);
    expect(play).toHaveBeenCalledTimes(1);
    rerender(<PerfectTimingArena model={model({ phase: "stopped" })} />);
    expect(play).toHaveBeenLastCalledWith("ranked.answer.lock", expect.anything());
    rerender(<PerfectTimingArena model={model({ phase: "submitting" })} />);
    expect(play).toHaveBeenCalledTimes(2);
    rerender(<PerfectTimingArena model={model({ phase: "revealed", reveal: DEMO_REVEALS.early })} />);
    expect(play).toHaveBeenLastCalledWith("ranked.answer.correct", expect.anything());
    expect(play).toHaveBeenCalledTimes(3);
  });

  it("plays the incorrect cue for a miss", () => {
    const { rerender } = render(<PerfectTimingArena model={model({ phase: "submitting" })} />);
    rerender(<PerfectTimingArena model={model({ phase: "revealed", reveal: DEMO_REVEALS.miss })} />);
    expect(play).toHaveBeenLastCalledWith("ranked.answer.incorrect", expect.anything());
  });

  it("re-arms with the start cue for a NEW round, not for a re-render of the same one", () => {
    const { rerender } = render(<PerfectTimingArena model={model({ phase: "armed" })} />);
    expect(play).toHaveBeenCalledTimes(1);
    rerender(<PerfectTimingArena model={model({ phase: "armed" })} />);
    expect(play).toHaveBeenCalledTimes(1);
    rerender(<PerfectTimingArena model={model({ phase: "armed", round: DEMO_ROUNDS[2] })} />);
    expect(play).toHaveBeenCalledTimes(2);
  });
});
