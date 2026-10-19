/**
 * PT5.2 — the Arcane Chronometer in jsdom, on a hand-cranked frame clock
 * (`installFakeFrames`): what it shows in every phase, that it counts from the
 * engine's own `t0`, freezes on the engine's own `elapsedMs`, stops its frame
 * loop whenever it should, and never re-renders React while it runs.
 */
import { Profiler, StrictMode } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_REDUCE_MOTION_CLASS } from "@/hooks/useReducedMotionPreference";
import { installFakeFrames, type FakeFrames } from "@/lib/perfect-timing/fakeFrames.testutil";
import type { PtClockReading, SecondBeat } from "@/lib/perfect-timing/chronometer";
import type { PtPhase } from "@/lib/perfect-timing/viewModel";
import { PerfectTimingStage } from "./PerfectTimingStage";
import { DEMO_ROUNDS, demoPress } from "./__stories__/demoViewModels";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.resolve(process.cwd(), "src/components/perfect-timing/perfectTiming.css"), "utf8");

const ROUND = DEMO_ROUNDS[1];
let ff: FakeFrames;

function stage(phase: PtPhase, clock: PtClockReading | null, onClockBeat?: (b: SecondBeat) => void, round = ROUND) {
  return <PerfectTimingStage key={round.roundId} round={round} phase={phase} press={demoPress("seal")} clock={clock} onClockBeat={onClockBeat} />;
}
const digits = () => screen.getByTestId("pt-chrono-digits").textContent;
const chrono = () => screen.getByTestId("pt-chrono");

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => { ff = installFakeFrames(1_000); });
afterEach(() => {
  cleanup();
  ff.restore();
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  document.documentElement.classList.remove(APP_REDUCE_MOTION_CLASS);
});

describe("ArcaneChronometer — the readout", () => {
  it("armed: shows 0.00 and runs no frame loop", () => {
    render(stage("armed", { t0: null, elapsedMs: null }));
    expect(digits()).toBe("0.00");
    expect(chrono()).toHaveAttribute("data-readout", "zero");
    expect(ff.pending()).toBe(0);
  });

  it("running: counts UP from the engine's t0, written before the first paint", () => {
    const { rerender } = render(stage("armed", { t0: null, elapsedMs: null }));
    ff.setNow(1_040);
    rerender(stage("running", { t0: 1_000, elapsedMs: null }));
    expect(digits()).toBe("0.04"); // no stale 0.00 frame after the cast
    ff.frame(1_000 + 1_234.5);
    expect(digits()).toBe("1.23");
    ff.frame(1_000 + 5_439.9);
    expect(digits()).toBe("5.43");
    expect(chrono()).toHaveAttribute("data-readout", "running");
  });

  it("stop: freezes at once on the ENGINE's submitted value and cancels the frame loop", () => {
    const { rerender } = render(stage("running", { t0: 1_000, elapsedMs: null }));
    ff.frame(6_400);
    expect(digits()).toBe("5.40");
    // The engine measured 5,437 ms between the two native input timestamps.
    rerender(stage("stopped", { t0: 1_000, elapsedMs: 5_437 }));
    expect(digits()).toBe("5.44");
    expect(chrono()).toHaveAttribute("data-readout", "locked");
    expect(ff.pending()).toBe(0);
    ff.frame(9_999);
    expect(digits()).toBe("5.44");
    // Submitting keeps the same frozen reading.
    rerender(stage("submitting", { t0: 1_000, elapsedMs: 5_437 }));
    expect(digits()).toBe("5.44");
  });

  it("the frozen reading is the engine's, not the frame loop's: the display never stands in for the measurement", () => {
    const { rerender } = render(stage("running", { t0: 1_000, elapsedMs: null }));
    ff.frame(9_000); // the loop last drew 8.00
    expect(digits()).toBe("8.00");
    rerender(stage("stopped", { t0: 1_000, elapsedMs: 5_000 }));
    expect(digits()).toBe("5.00");
  });

  it("next round: a new round starts from 0.00", () => {
    const { rerender } = render(stage("stopped", { t0: 1_000, elapsedMs: 4_210 }));
    expect(digits()).toBe("4.21");
    rerender(stage("armed", { t0: null, elapsedMs: null }, undefined, DEMO_ROUNDS[2]));
    expect(digits()).toBe("0.00");
  });

  it("interrupted: the reading stops where it was and is marked voided; no loop runs", () => {
    const { rerender } = render(stage("running", { t0: 1_000, elapsedMs: null }));
    ff.frame(3_345);
    rerender(stage("interrupted", { t0: null, elapsedMs: null }));
    expect(digits()).toBe("2.34");
    expect(chrono()).toHaveAttribute("data-readout", "halted");
    expect(chrono()).toHaveAttribute("data-phase", "interrupted");
    expect(screen.getByTestId("pt-seal-word")).toHaveTextContent("Voided");
    expect(ff.pending()).toBe(0);
  });

  it("a hidden page stops the loop immediately: nothing renders or beats after it", () => {
    const beats: number[] = [];
    render(stage("running", { t0: 1_000, elapsedMs: null }, (b) => beats.push(b.second)));
    ff.frame(1_990);
    act(() => setVisibility("hidden"));
    expect(ff.pending()).toBe(0);
    ff.frame(2_005);
    expect(digits()).toBe("0.99");
    expect(beats).toEqual([]);
  });

  it("unmount cancels the frame loop", () => {
    const { unmount } = render(stage("running", { t0: 1_000, elapsedMs: null }));
    expect(ff.pending()).toBe(1);
    unmount();
    expect(ff.pending()).toBe(0);
  });

  it("reserves a wider readout from 100 s without touching anything else", () => {
    render(stage("running", { t0: 1_000, elapsedMs: null }));
    ff.frame(1_000 + 99_990);
    expect(chrono()).toHaveAttribute("data-wide", "false");
    ff.frame(1_000 + 100_020);
    expect(digits()).toBe("100.02");
    expect(chrono()).toHaveAttribute("data-wide", "true");
  });

  it("does not re-render React while it runs (60 FPS lives in the DOM, not in state)", () => {
    let renders = 0;
    render(<Profiler id="pt" onRender={() => { renders += 1; }}>{stage("running", { t0: 1_000, elapsedMs: null })}</Profiler>);
    const before = renders;
    ff.run(1_000 + 2_990);
    ff.frame(1_000 + 3_000);
    expect(digits()).toBe("3.00");
    expect(renders).toBe(before);
  });
});

describe("ArcaneChronometer — the beat", () => {
  it("one beat per whole elapsed second at 60 FPS; a pulse attribute alternates; every fifth is a mark", () => {
    const beats: SecondBeat[] = [];
    render(stage("running", { t0: 1_000, elapsedMs: null }, (b) => beats.push(b)));
    ff.run(1_000 + 5_200);
    expect(beats.map((b) => b.second)).toEqual([1, 2, 3, 4, 5]);
    expect(beats.map((b) => b.eventId)).toEqual([1, 2, 3, 4, 5].map((n) => `perfect-timing:${ROUND.roundId}:tick:${n}`));
    expect(chrono()).toHaveAttribute("data-beat", "a"); // 5 is odd
    expect(chrono()).toHaveAttribute("data-mark", "true");
  });

  it("a stalled frame is never caught up: no burst, no late beat", () => {
    const beats: number[] = [];
    render(stage("running", { t0: 1_000, elapsedMs: null }, (b) => beats.push(b.second)));
    ff.frame(2_003);
    ff.frame(5_700); // 3.7 s stall
    ff.frame(6_008);
    expect(beats).toEqual([1, 5]);
  });

  it("StrictMode's double effects neither double the beat nor restart the count", () => {
    const beats: number[] = [];
    render(<StrictMode>{stage("running", { t0: 1_000, elapsedMs: null }, (b) => beats.push(b.second))}</StrictMode>);
    expect(ff.pending()).toBe(1);
    ff.run(1_000 + 3_100);
    expect(beats).toEqual([1, 2, 3]);
  });

  it("no beat after the stop, even if a frame was already queued", () => {
    const beats: number[] = [];
    const { rerender } = render(stage("running", { t0: 1_000, elapsedMs: null }, (b) => beats.push(b.second)));
    ff.frame(1_900);
    rerender(stage("stopped", { t0: 1_000, elapsedMs: 950 }));
    ff.frame(2_010);
    expect(beats).toEqual([]);
  });
});

describe("ArcaneChronometer — accessibility and motion", () => {
  it("is decoration to assistive technology: the seal's name is the engine's label, and no live region holds the digits", () => {
    render(stage("running", { t0: 1_000, elapsedMs: null }));
    const seal = screen.getByTestId("pt-press-surface");
    expect(seal).toHaveAccessibleName("seal");
    expect(chrono().closest("[aria-hidden]")).not.toBeNull();
    const status = screen.getByTestId("pt-status");
    const before = status.textContent;
    ff.run(1_000 + 2_500);
    expect(status.textContent).toBe(before);
    expect(status.textContent).not.toMatch(/\d/);
  });

  it("announces the lock once, with the engine's time", () => {
    render(stage("stopped", { t0: 1_000, elapsedMs: 5_437 }));
    expect(screen.getByTestId("pt-status")).toHaveTextContent("Locked at 5.44 s. Checking the archive.");
  });

  it("states CAST when armed and PRESS TO STOP while running", () => {
    const { rerender } = render(stage("armed", { t0: null, elapsedMs: null }));
    expect(screen.getByTestId("pt-seal-word")).toHaveTextContent("Cast");
    rerender(stage("running", { t0: 1_000, elapsedMs: null }));
    expect(screen.getByTestId("pt-seal-word")).toHaveTextContent("Press to stop");
  });

  it("reduced motion (Mogzy's switch): no animation flag, the digits still count", () => {
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    render(stage("running", { t0: 1_000, elapsedMs: null }));
    expect(chrono()).toHaveAttribute("data-animate", "false");
    ff.frame(3_500);
    expect(digits()).toBe("2.50");
  });

  it("the stylesheet loops nothing and turns every chronometer effect off under reduced motion", () => {
    const decls = css.match(/animation\s*:[^;]+;/g) ?? [];
    expect(decls.filter((d) => /infinite/.test(d))).toEqual([]);
    expect(css).toMatch(/\.pt-chrono\[data-animate="false"\] \* \{ animation: none !important; \}/);
    expect(css).toMatch(/\.pt-chrono\[data-animate="false"\] \.pt-chrono-sweep \{ display: none; \}/);
  });
});

describe("ArcaneChronometer — cannot carry the secret", () => {
  it("draws only from the engine's timestamps: the same elapsed time renders identically for any dealt round", () => {
    const snap = (round: (typeof DEMO_ROUNDS)[number]) => {
      const { unmount } = render(stage("running", { t0: 1_000, elapsedMs: null }, undefined, round));
      ff.frame(4_321);
      const el = chrono();
      const out = { digits: digits(), readout: el.dataset.readout, beat: el.dataset.beat, mark: el.dataset.mark,
        sweep: el.querySelector(".pt-chrono-sweep")?.getAttribute("transform") };
      unmount();
      ff.setNow(1_000);
      return out;
    };
    expect(snap(DEMO_ROUNDS[0])).toEqual(snap(DEMO_ROUNDS[4]));
  });

  it("puts no duration other than the elapsed reading into the chronometer", () => {
    render(stage("running", { t0: 1_000, elapsedMs: null }));
    ff.frame(2_500);
    const text = chrono().textContent ?? "";
    expect(text.match(/\d+(\.\d+)?/g)).toEqual(["1.50"]);
    vi.clearAllMocks();
  });
});
