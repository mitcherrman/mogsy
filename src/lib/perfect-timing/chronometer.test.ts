import { describe, expect, it } from "vitest";
import { formatSeconds } from "@/components/perfect-timing/presentation";
import {
  CHRONO_TICK_LATE_MS,
  formatLocked,
  formatRunning,
  observeSecond,
  runningMs,
  sweepDegrees,
  type SecondBeat,
  type SecondWatch,
} from "./chronometer";

/** Feed a sequence of frame times for one round; collect the beats. */
function beatsFor(times: number[], roundId = "r1", watch: SecondWatch | null = null): SecondBeat[] {
  const out: SecondBeat[] = [];
  let w = watch;
  for (const ms of times) {
    const next = observeSecond(w, { roundId, ms });
    w = next.watch;
    if (next.beat) out.push(next.beat);
  }
  return out;
}

describe("chronometer — readout", () => {
  it("starts at zero and never reads negative", () => {
    expect(formatRunning(0)).toBe("0.00");
    expect(runningMs(1000, 1000)).toBe(0);
    expect(runningMs(1000, 990)).toBe(0); // a frame stamped before the cast
    expect(runningMs(1000, Number.NaN)).toBe(0);
  });

  it("counts UP from the engine's t0 and truncates to the hundredth", () => {
    expect(formatRunning(runningMs(1000, 1000 + 5439.9))).toBe("5.43");
    expect(formatRunning(9.99)).toBe("0.00");
    expect(formatRunning(10)).toBe("0.01");
    expect(formatRunning(59_999)).toBe("59.99");
    expect(formatRunning(123_456)).toBe("123.45");
  });

  it("freezes on the engine's submitted integer exactly as the reveal prints it", () => {
    for (const ms of [250, 1000, 4545, 5435, 5437, 6830, 599_999]) {
      expect(`${formatLocked(ms)} s`).toBe(formatSeconds(ms));
    }
  });

  it("sweeps one revolution per minute, whatever the round", () => {
    expect(sweepDegrees(0)).toBe(0);
    expect(sweepDegrees(15_000)).toBe(90);
    expect(sweepDegrees(60_000)).toBe(0);
    expect(sweepDegrees(75_000)).toBe(90);
  });
});

describe("chronometer — the once-a-second beat", () => {
  it("beats exactly once per whole elapsed second at 60 FPS, never at zero", () => {
    const frames = Array.from({ length: Math.ceil(5_500 / 16.7) }, (_, i) => i * 16.7);
    const beats = beatsFor(frames);
    expect(beats.map((b) => b.second)).toEqual([1, 2, 3, 4, 5]);
  });

  it("gives every beat an identity unique to its round and second", () => {
    const a = beatsFor([1_001, 2_001], "round-A");
    const b = beatsFor([1_001, 2_001], "round-B");
    expect(a.map((x) => x.eventId)).toEqual(["perfect-timing:round-A:tick:1", "perfect-timing:round-A:tick:2"]);
    expect(b.map((x) => x.eventId)).toEqual(["perfect-timing:round-B:tick:1", "perfect-timing:round-B:tick:2"]);
  });

  it("marks every fifth second — a fixed milestone, the same for every round", () => {
    const beats = beatsFor(Array.from({ length: 11 }, (_, i) => i * 1000 + 5));
    expect(beats.filter((b) => b.mark).map((b) => b.second)).toEqual([5, 10]);
  });

  it("skips a second seen late instead of playing it late, and never bursts to catch up", () => {
    // On time at 1 s; a 3.4 s stall lands the next frame at 4.6 s; then on time at 5 s.
    const beats = beatsFor([1_004, 1_020, 4_600, 5_010]);
    expect(beats.map((b) => b.second)).toEqual([1, 5]);
    // Exactly at the lateness bound still counts; one past it does not.
    expect(beatsFor([1_000 + CHRONO_TICK_LATE_MS]).length).toBe(1);
    expect(beatsFor([1_000 + CHRONO_TICK_LATE_MS + 1]).length).toBe(0);
  });

  it("does not repeat a second when the same frame time is observed twice (re-render, StrictMode)", () => {
    expect(beatsFor([1_001, 1_001, 1_002, 1_500]).map((b) => b.second)).toEqual([1]);
  });

  it("starts a fresh count for a new round", () => {
    let w: SecondWatch | null = null;
    w = observeSecond(w, { roundId: "r1", ms: 3_005 }).watch;
    const next = observeSecond(w, { roundId: "r2", ms: 1_003 });
    expect(next.beat?.eventId).toBe("perfect-timing:r2:tick:1");
  });

  it("cannot carry the secret: two rounds with different targets beat identically", () => {
    // The beat's only inputs are the round id and the elapsed time. Whatever
    // the dealt cooldown is (5.5 s here, 120 s there), the schedule is the same.
    const frames = Array.from({ length: 400 }, (_, i) => i * 16.7);
    const strip = (bs: SecondBeat[]) => bs.map(({ second, mark }) => ({ second, mark }));
    expect(strip(beatsFor(frames, "ezreal-q-5500"))).toEqual(strip(beatsFor(frames, "ryze-r-120000")));
    expect(observeSecond.length).toBe(2);
  });
});
