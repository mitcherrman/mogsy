import { describe, expect, it } from "vitest";

import {
  countdownBeat,
  countdownIntensity,
  countdownVisualBeat,
  observeCountdown,
  observeServerTimeout,
  type CountdownSample,
  type CountdownWatch,
  type TimeoutWatch,
} from "./countdownFeedback";

const sample = (remainingSeconds: number | null, over: Partial<CountdownSample> = {}): CountdownSample => ({
  clockKey: "m1:r3", remainingSeconds, running: true, armed: true, ...over,
});

/** Feed a sequence of displayed seconds; return the beats that sounded. */
function run(seconds: Array<number | null>, over: Partial<CountdownSample> = {},
             start: CountdownWatch | null = null) {
  let watch = start;
  const ticks: string[] = [];
  for (const s of seconds) {
    const next = observeCountdown(watch, sample(s, over));
    watch = next.watch;
    if (next.tick) ticks.push(`${next.tick.second}:${next.tick.intensity}`);
  }
  return { ticks, watch };
}

describe("F10 — which seconds are beats", () => {
  it("5, 4, 3, 2, 1 only, with 1 the strongest", () => {
    expect([6, 5, 4, 3, 2, 1, 0, -1, null].map((s) => countdownBeat(s)))
      .toEqual([null, 5, 4, 3, 2, 1, null, null, null]);
    expect([5, 4, 3, 2, 1].map((s) => countdownIntensity(s as 1)))
      .toEqual(["warn", "warn", "strong", "strong", "final"]);
  });

  it("a paused clock draws no beat", () => {
    expect(countdownVisualBeat({ remainingSeconds: 3, paused: false })).toBe(3);
    expect(countdownVisualBeat({ remainingSeconds: 3, paused: true })).toBeNull();
    expect(countdownVisualBeat(null)).toBeNull();
  });
});

describe("F10 — one beat per genuine second", () => {
  it("a full countdown sounds each of the last five seconds once, escalating", () => {
    expect(run([30, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]).ticks)
      .toEqual(["5:warn", "4:warn", "3:strong", "2:strong", "1:final"]);
  });

  it("re-observing the same second (poll jitter, re-render) never re-sounds", () => {
    expect(run([7, 6, 5, 5, 5, 4, 4, 3]).ticks).toEqual(["5:warn", "4:warn", "3:strong"]);
  });

  it("the first sample is a baseline: mounting or reconnecting at 3 is history", () => {
    expect(run([3, 2, 1]).ticks).toEqual(["2:strong", "1:final"]);
    // A remount (fresh watch) right after a beat cannot replay it.
    expect(run([2]).ticks).toEqual([]);
  });

  it("a long task or a backgrounded tab sounds ONLY the current second, never a burst", () => {
    expect(run([9, 5, 1]).ticks).toEqual(["5:warn", "1:final"]);
    expect(run([12, 2]).ticks).toEqual(["2:strong"]);
  });

  it("zero and an expired historical clock are silent", () => {
    expect(run([0, 0]).ticks).toEqual([]);
    expect(run([2, 0]).ticks).toEqual([]);
  });

  it("a paused clock (a pooled Journey budget held through a reveal) is silent, and resuming does not re-sound", () => {
    const paused = run([6, 5, 4], { running: false });
    expect(paused.ticks).toEqual([]);
    // The budget resumes at 4: the same clock, already at 4 — nothing new.
    expect(run([4, 3], {}, paused.watch).ticks).toEqual(["3:strong"]);
  });

  it("a viewer whose answer is in or in flight is not urged on", () => {
    expect(run([6, 5, 4, 3], { armed: false }).ticks).toEqual([]);
  });

  it("a new clock (the next round or Journey child) starts with a baseline", () => {
    const first = run([6, 5]);
    const next = observeCountdown(first.watch, sample(30, { clockKey: "m1:r4" }));
    expect(next.tick).toBeNull();
    // A new clock that is somehow already at 4 on its first sample does not sound.
    expect(observeCountdown(first.watch, sample(4, { clockKey: "m1:r4" })).tick).toBeNull();
  });

  it("a skew correction that moves the digit back UP re-emits the same id (the engine plays an id once)", () => {
    let watch: CountdownWatch | null = null;
    const ids: string[] = [];
    for (const s of [5, 4, 5, 4, 3]) {
      const next = observeCountdown(watch, sample(s));
      watch = next.watch;
      if (next.tick) ids.push(next.tick.eventId);
    }
    expect(ids).toEqual([
      "quiz-countdown:m1:r3:4", "quiz-countdown:m1:r3:4", "quiz-countdown:m1:r3:3",
    ]);
    expect(new Set(ids).size).toBe(2);
  });

  it("per-card clocks have per-card ids", () => {
    const card = (n: number, s: number, w: CountdownWatch | null) =>
      observeCountdown(w, sample(s, { clockKey: `m1:mastery_slice.3#10:card:${n}` }));
    const a = card(0, 4, card(0, 5, null).watch);
    expect(a.tick?.eventId).toBe("quiz-countdown:m1:mastery_slice.3#10:card:0:4");
    const b = card(1, 4, card(1, 5, card(1, 30, a.watch).watch).watch);
    expect(b.tick?.eventId).toBe("quiz-countdown:m1:mastery_slice.3#10:card:1:4");
  });
});

describe("F12 — TIME'S UP only from the server, once", () => {
  const step = (w: TimeoutWatch | null, settledKey: string | null, serverTimedOut: boolean) =>
    observeServerTimeout(w, { settledKey, serverTimedOut });

  it("announces a server timeout that arrives while watching, exactly once", () => {
    const base = step(null, null, false);
    const live = step(base.watch, "r3", true);
    expect(live.announce).toEqual({ eventId: "quiz-timeout:r3" });
    expect(step(live.watch, "r3", true).announce).toBeNull();
  });

  it("a historical timeout on mount (reload, reconnect, History) is a baseline", () => {
    const resumed = step(null, "r3", true);
    expect(resumed.announce).toBeNull();
    expect(step(resumed.watch, "r3", true).announce).toBeNull();
    expect(step(resumed.watch, "r4", true).announce).toEqual({ eventId: "quiz-timeout:r4" });
  });

  it("anything but the server's timeout is silent", () => {
    const base = step(null, null, false);
    expect(step(base.watch, "r3", false).announce).toBeNull();
    expect(step(base.watch, null, true).announce).toBeNull();
  });
});
