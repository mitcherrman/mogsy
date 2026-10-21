/**
 * PT5.3 — the engine's automatic start: `ARM { start: "auto" }` → `countdown`
 * (no press can start it) → `AUTO_START { roundId, t }` → `running` at exactly
 * `t`, then the PT2 machine unchanged (one stop, MIN_RUN_MS, voids, the bound).
 */
import { describe, expect, it } from "vitest";

import {
  INITIAL_TIMING_STATE,
  MAX_ELAPSED_MS,
  MIN_RUN_MS,
  acceptsPress,
  reduceTiming,
  type TimingEvent,
  type TimingState,
} from "./timingEngine";

const ROUND = "pt_0123456789abcdef0123456789abcdef";
const OTHER = "pt_ffffffffffffffffffffffffffffffff";

const run = (events: TimingEvent[], from: TimingState = INITIAL_TIMING_STATE): TimingState => events.reduce(reduceTiming, from);
const counting = () => run([{ type: "ARM", roundId: ROUND, start: "auto" }]);
const started = (t = 4_000) => reduceTiming(counting(), { type: "AUTO_START", roundId: ROUND, t });

describe("PT5.3 automatic start", () => {
  it("ARM with start: auto counts the round in; the default ARM is unchanged", () => {
    expect(counting()).toEqual({ phase: "countdown", roundId: ROUND, t0: null, elapsedMs: null, interruptReason: null });
    expect(run([{ type: "ARM", roundId: ROUND }]).phase).toBe("armed");
    expect(run([{ type: "ARM", roundId: ROUND, start: "press" }]).phase).toBe("armed");
  });

  it("refuses every press while counting in (the same object comes back)", () => {
    const s = counting();
    for (const t of [0, 1, 999.5, 2_999, 3_000, 10_000]) expect(reduceTiming(s, { type: "PRESS", t })).toBe(s);
    expect(acceptsPress("countdown")).toBe(false);
  });

  it("AUTO_START records the executed start timestamp exactly as given", () => {
    expect(started(4_016.25)).toEqual({ phase: "running", roundId: ROUND, t0: 4_016.25, elapsedMs: null, interruptReason: null });
  });

  it("ignores a start for another round, a repeated start, and a start that is not a real reading", () => {
    const s = counting();
    expect(reduceTiming(s, { type: "AUTO_START", roundId: OTHER, t: 4_000 })).toBe(s);
    for (const t of [Number.NaN, Number.POSITIVE_INFINITY, -1]) expect(reduceTiming(s, { type: "AUTO_START", roundId: ROUND, t })).toBe(s);
    const r = started();
    expect(reduceTiming(r, { type: "AUTO_START", roundId: ROUND, t: 9_000 })).toBe(r);
  });

  it("never starts a press-armed round, nor an idle, stopped or voided one", () => {
    const armed = run([{ type: "ARM", roundId: ROUND }]);
    expect(reduceTiming(armed, { type: "AUTO_START", roundId: ROUND, t: 1 })).toBe(armed);
    expect(reduceTiming(INITIAL_TIMING_STATE, { type: "AUTO_START", roundId: ROUND, t: 1 })).toBe(INITIAL_TIMING_STATE);
    const stopped = reduceTiming(started(1_000), { type: "PRESS", t: 6_000 });
    expect(reduceTiming(stopped, { type: "AUTO_START", roundId: ROUND, t: 7_000 })).toBe(stopped);
    const voided = reduceTiming(started(), { type: "HIDDEN" });
    expect(reduceTiming(voided, { type: "AUTO_START", roundId: ROUND, t: 7_000 })).toBe(voided);
  });

  it("after the start, ONE press stops it with the exact interval from the start", () => {
    const s = reduceTiming(started(4_000), { type: "PRESS", t: 9_437.4 });
    expect(s).toEqual({ phase: "stopped", roundId: ROUND, t0: 4_000, elapsedMs: 5_437, interruptReason: null });
  });

  it("a press that bled over from the count-in (inside MIN_RUN_MS of the start) is swallowed; the next one stops", () => {
    const r = started(4_000);
    expect(reduceTiming(r, { type: "PRESS", t: 4_000 + MIN_RUN_MS - 1 })).toBe(r);
    expect(reduceTiming(r, { type: "PRESS", t: 4_000 + MIN_RUN_MS }).phase).toBe("stopped");
  });

  it("hiding the page while counting in voids nothing (nothing was measured); once running it voids", () => {
    const s = counting();
    expect(reduceTiming(s, { type: "HIDDEN" })).toBe(s);
    expect(reduceTiming(s, { type: "PAGEHIDE" })).toBe(s);
    expect(reduceTiming(started(), { type: "HIDDEN" })).toMatchObject({ phase: "interrupted", interruptReason: "hidden" });
  });

  it("keeps the PT2 bound and the broken-timeline rule after an automatic start", () => {
    expect(reduceTiming(started(1_000), { type: "PRESS", t: 1_000 + MAX_ELAPSED_MS + 1 })).toMatchObject({ phase: "interrupted", interruptReason: "timeout" });
    expect(reduceTiming(started(5_000), { type: "PRESS", t: 4_000 })).toMatchObject({ phase: "interrupted", interruptReason: "clock" });
  });

  it("re-arming (a new round, a re-deal) clears a count-in or a running start", () => {
    expect(reduceTiming(counting(), { type: "ARM", roundId: OTHER, start: "auto" })).toMatchObject({ phase: "countdown", roundId: OTHER });
    expect(reduceTiming(started(), { type: "ARM", roundId: OTHER, start: "auto" })).toMatchObject({ phase: "countdown", roundId: OTHER, t0: null });
    expect(reduceTiming(counting(), { type: "RESET" })).toBe(INITIAL_TIMING_STATE);
  });
});
