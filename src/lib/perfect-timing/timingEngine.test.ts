import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  INITIAL_TIMING_STATE,
  MAX_ELAPSED_MS,
  MIN_RUN_MS,
  acceptsPress,
  reduceTiming,
  type ArmedTimingState,
  type RunningTimingState,
  type StoppedTimingState,
  type TimingEvent,
  type TimingState,
} from "./timingEngine";

const ROUND = "pt_0123456789abcdef0123456789abcdef";

function run(events: TimingEvent[], from: TimingState = INITIAL_TIMING_STATE): TimingState {
  return events.reduce(reduceTiming, from);
}

const armed = (): ArmedTimingState =>
  run([{ type: "ARM", roundId: ROUND }]) as ArmedTimingState;

const running = (t0 = 1000): RunningTimingState =>
  run([{ type: "ARM", roundId: ROUND }, { type: "PRESS", t: t0 }]) as RunningTimingState;

const stopped = (t0 = 1000, t1 = 8000): StoppedTimingState =>
  reduceTiming(running(t0), { type: "PRESS", t: t1 }) as StoppedTimingState;

describe("constants", () => {
  it("matches the frozen interface", () => {
    expect(MIN_RUN_MS).toBe(250);
    expect(MAX_ELAPSED_MS).toBe(600_000);
  });
});

describe("transition table", () => {
  it("starts idle and untouched", () => {
    expect(INITIAL_TIMING_STATE).toEqual({
      phase: "idle",
      roundId: null,
      t0: null,
      elapsedMs: null,
      interruptReason: null,
    });
    expect(Object.isFrozen(INITIAL_TIMING_STATE)).toBe(true);
  });

  it("ARM moves to armed from every phase", () => {
    const sources: TimingState[] = [
      INITIAL_TIMING_STATE,
      armed(),
      running(),
      stopped(),
      reduceTiming(running(), { type: "HIDDEN" }),
    ];
    for (const from of sources) {
      expect(reduceTiming(from, { type: "ARM", roundId: "next" })).toEqual({
        phase: "armed",
        roundId: "next",
        t0: null,
        elapsedMs: null,
        interruptReason: null,
      });
    }
  });

  it("ARM with an unusable round id is ignored", () => {
    const from = running();
    expect(reduceTiming(from, { type: "ARM", roundId: "" })).toBe(from);
    expect(reduceTiming(from, { type: "ARM", roundId: undefined as unknown as string })).toBe(from);
  });

  it("PRESS in armed starts the run at t0", () => {
    expect(reduceTiming(armed(), { type: "PRESS", t: 1234.5 })).toEqual({
      phase: "running",
      roundId: ROUND,
      t0: 1234.5,
      elapsedMs: null,
      interruptReason: null,
    });
  });

  it("PRESS in running at or after MIN_RUN_MS stops with the rounded interval", () => {
    expect(reduceTiming(running(1000), { type: "PRESS", t: 7830 })).toEqual({
      phase: "stopped",
      roundId: ROUND,
      t0: 1000,
      elapsedMs: 6830,
      interruptReason: null,
    });
  });

  it("PRESS in idle, stopped and interrupted is ignored (same object)", () => {
    const interruptedState = reduceTiming(running(), { type: "HIDDEN" });
    for (const from of [INITIAL_TIMING_STATE, stopped(), interruptedState]) {
      expect(reduceTiming(from, { type: "PRESS", t: 99_999 })).toBe(from);
    }
  });

  it("HIDDEN and PAGEHIDE interrupt a running attempt with their reason", () => {
    expect(reduceTiming(running(), { type: "HIDDEN" })).toEqual({
      phase: "interrupted",
      roundId: ROUND,
      t0: null,
      elapsedMs: null,
      interruptReason: "hidden",
    });
    expect(reduceTiming(running(), { type: "PAGEHIDE" })).toMatchObject({
      phase: "interrupted",
      interruptReason: "pagehide",
    });
  });

  it("HIDDEN and PAGEHIDE are ignored in every other phase", () => {
    const others: TimingState[] = [
      INITIAL_TIMING_STATE,
      armed(),
      stopped(),
      reduceTiming(running(), { type: "HIDDEN" }),
    ];
    for (const from of others) {
      expect(reduceTiming(from, { type: "HIDDEN" })).toBe(from);
      expect(reduceTiming(from, { type: "PAGEHIDE" })).toBe(from);
    }
  });

  it("a stopped measurement survives a later HIDDEN untouched", () => {
    const done = stopped();
    expect(reduceTiming(done, { type: "HIDDEN" })).toBe(done);
    expect(done.elapsedMs).toBe(7000);
  });

  it("RESET returns to the initial state from every phase", () => {
    for (const from of [armed(), running(), stopped(), INITIAL_TIMING_STATE]) {
      expect(reduceTiming(from, { type: "RESET" })).toBe(INITIAL_TIMING_STATE);
    }
  });
});

describe("double-tap guard", () => {
  it("ignores a stop 249 ms after the start and accepts 250 ms", () => {
    const early = reduceTiming(running(1000), { type: "PRESS", t: 1249 });
    expect(early.phase).toBe("running");
    expect(early).toEqual(running(1000));

    const onTime = reduceTiming(running(1000), { type: "PRESS", t: 1250 });
    expect(onTime).toMatchObject({ phase: "stopped", elapsedMs: 250 });
  });

  it("keeps the original t0 after an ignored stop", () => {
    const afterTap = reduceTiming(running(1000), { type: "PRESS", t: 1100 });
    expect(afterTap).toMatchObject({ phase: "running", t0: 1000 });
    expect(reduceTiming(afterTap, { type: "PRESS", t: 4000 })).toMatchObject({
      phase: "stopped",
      elapsedMs: 3000,
    });
  });

  it("a fractional gap that would round up to 250 is still ignored", () => {
    const from = running(1000);
    expect(reduceTiming(from, { type: "PRESS", t: 1249.5 })).toBe(from);
  });
});

describe("rounding and bounds", () => {
  it.each([
    [6999.5, 7000],
    [6999.49, 6999],
    [7000.4, 7000],
    [7000.5, 7001],
  ])("rounds %f ms to %i", (delta, expected) => {
    const state = reduceTiming(running(0), { type: "PRESS", t: delta });
    expect(state).toMatchObject({ phase: "stopped", elapsedMs: expected });
  });

  it("measures from a non-zero t0", () => {
    expect(stopped(123_456.25, 123_456.25 + 6999.5).elapsedMs).toBe(7000);
  });

  it("accepts exactly MAX_ELAPSED_MS (including .4 that rounds down to it)", () => {
    expect(reduceTiming(running(0), { type: "PRESS", t: MAX_ELAPSED_MS })).toMatchObject({
      phase: "stopped",
      elapsedMs: MAX_ELAPSED_MS,
    });
    expect(reduceTiming(running(0), { type: "PRESS", t: MAX_ELAPSED_MS + 0.4 })).toMatchObject({
      phase: "stopped",
      elapsedMs: MAX_ELAPSED_MS,
    });
  });

  it("voids an interval that rounds past MAX_ELAPSED_MS instead of clamping it", () => {
    const state = reduceTiming(running(0), { type: "PRESS", t: MAX_ELAPSED_MS + 0.5 });
    expect(state).toEqual({
      phase: "interrupted",
      roundId: ROUND,
      t0: null,
      elapsedMs: null,
      interruptReason: "timeout",
    });
  });
});

describe("clock validation", () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1])(
    "ignores a start timestamp of %s",
    (t) => {
      const from = armed();
      expect(reduceTiming(from, { type: "PRESS", t })).toBe(from);
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -5])(
    "ignores a stop timestamp of %s and keeps running",
    (t) => {
      const from = running();
      expect(reduceTiming(from, { type: "PRESS", t })).toBe(from);
    },
  );

  it("treats a stop before the start as an interruption with reason clock", () => {
    expect(reduceTiming(running(5000), { type: "PRESS", t: 4999 })).toEqual({
      phase: "interrupted",
      roundId: ROUND,
      t0: null,
      elapsedMs: null,
      interruptReason: "clock",
    });
  });

  it("accepts t = 0 as a start", () => {
    expect(reduceTiming(armed(), { type: "PRESS", t: 0 })).toMatchObject({ phase: "running", t0: 0 });
  });
});

describe("re-arming", () => {
  it("clears t0 and the previous measurement after stopped", () => {
    const done = stopped(1000, 8000);
    expect(done).toMatchObject({ t0: 1000, elapsedMs: 7000 });
    const next = reduceTiming(done, { type: "ARM", roundId: "next" });
    expect(next).toMatchObject({ phase: "armed", roundId: "next", t0: null, elapsedMs: null });
  });

  it("a fresh run after re-arming ignores the old t0", () => {
    const final = run(
      [
        { type: "ARM", roundId: "b" },
        { type: "PRESS", t: 20_000 },
        { type: "PRESS", t: 23_000 },
      ],
      stopped(1000, 8000),
    );
    expect(final).toMatchObject({ phase: "stopped", roundId: "b", t0: 20_000, elapsedMs: 3000 });
  });

  it("clears an interruption", () => {
    const voided = reduceTiming(running(), { type: "PAGEHIDE" });
    expect(reduceTiming(voided, { type: "ARM", roundId: "again" })).toMatchObject({
      phase: "armed",
      interruptReason: null,
    });
  });
});

describe("purity", () => {
  it("does not mutate its input state", () => {
    const from = running(1000);
    const snapshot = JSON.stringify(from);
    reduceTiming(from, { type: "PRESS", t: 9000 });
    reduceTiming(from, { type: "HIDDEN" });
    expect(JSON.stringify(from)).toBe(snapshot);
  });

  it("is deterministic for the same inputs", () => {
    const events: TimingEvent[] = [
      { type: "ARM", roundId: ROUND },
      { type: "PRESS", t: 10 },
      { type: "PRESS", t: 100 },
      { type: "PRESS", t: 7010.5 },
    ];
    expect(run(events)).toEqual(run(events));
  });

  it("acceptsPress is true only while armed or running", () => {
    expect(
      (["idle", "armed", "running", "stopped", "interrupted"] as const).map(acceptsPress),
    ).toEqual([false, true, true, false, false]);
  });

  it("uses no timer, animation frame or wall clock", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "timingEngine.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(source).not.toMatch(/setInterval|setTimeout|requestAnimationFrame|Date\.now|performance\.now/);
    expect(source).not.toMatch(/ranked-core/);
  });
});
