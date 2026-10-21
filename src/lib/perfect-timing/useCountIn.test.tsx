/**
 * PT5.3 — the count-in: the pure schedule, and `useCountIn` driven by a
 * hand-cranked frame clock. Proves the beats follow real elapsed time (a
 * stalled frame skips, never replays), the start is executed at the FIRST frame
 * at or past 3 s with the clock read at that moment (not the frame's own
 * timestamp, not the scheduled 3,000), exactly once, and that a hold, a new
 * round, a hidden page and an unmount cancel it — a hidden page re-counts from 3.
 */
import { StrictMode, useState } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COUNT_IN_BEATS, COUNT_IN_MS, COUNT_IN_STEP_MS, countInBeatAt, countInDue, countInIsFinal, countInPassId } from "./countIn";
import { installFakeFrames, type FakeFrames } from "./fakeFrames.testutil";
import { useCountIn, type CountInView } from "./useCountIn";

describe("countIn (pure)", () => {
  it("is 3, 2, 1 over three one-second beats, then due", () => {
    expect(COUNT_IN_BEATS).toEqual([3, 2, 1]);
    expect(COUNT_IN_STEP_MS).toBe(1_000);
    expect(COUNT_IN_MS).toBe(3_000);
    expect([0, 999.9, 1_000, 1_999, 2_000, 2_999.9].map(countInBeatAt)).toEqual([3, 3, 2, 2, 1, 1]);
    expect([3_000, 3_016, 9_000].map(countInBeatAt)).toEqual([null, null, null]);
    expect([2_999.9, 3_000, 3_400].map(countInDue)).toEqual([false, true, true]);
    expect(countInBeatAt(Number.NaN)).toBeNull();
    expect(countInDue(Number.NaN)).toBe(false);
    expect(countInBeatAt(-5)).toBe(3);
  });

  it("only 1 is the final beat; pass ids are per round and pass", () => {
    expect(COUNT_IN_BEATS.map(countInIsFinal)).toEqual([false, false, true]);
    expect(countInPassId("pt_a", 2)).toBe("pt_a:2");
  });
});

let ff: FakeFrames;
let view: CountInView;
let setActive: (v: boolean) => void;
let setRound: (v: string | null) => void;
const onStart = vi.fn();

function Harness({ initial = "pt_a" }: { initial?: string | null }) {
  const [active, a] = useState(true);
  const [roundId, r] = useState<string | null>(initial);
  setActive = a;
  setRound = r;
  view = useCountIn({ roundId, active, onStart });
  return <span data-testid="beat">{view.beat ?? "-"}</span>;
}
const setVisibility = (v: DocumentVisibilityState) => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
const fire = (type: string, target: EventTarget = document) => act(() => { target.dispatchEvent(new Event(type)); });

beforeEach(() => {
  ff = installFakeFrames(1_000);
  onStart.mockReset();
  setVisibility("visible");
});
afterEach(() => {
  cleanup();
  ff.restore();
  setVisibility("visible");
});

describe("useCountIn", () => {
  it("shows 3 before the first paint, then 2 and 1 as real time passes, and starts once at the first frame past 3 s", () => {
    render(<Harness />);
    expect(view.beat).toBe(3);
    expect(view.passId).toBe("pt_a:1");
    ff.frame(1_500);
    expect(view.beat).toBe(3);
    ff.frame(2_000);
    expect(view.beat).toBe(2);
    ff.frame(3_000);
    expect(view.beat).toBe(1);
    ff.frame(3_990);
    expect(onStart).not.toHaveBeenCalled();
    ff.frame(4_007);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith("pt_a", 4_007);
    // Nothing more is scheduled: no second start, ever.
    expect(ff.pending()).toBe(0);
    ff.frame(9_000);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("records the clock read at execution, not the frame's own (earlier) timestamp or the scheduled time", () => {
    render(<Harness />);
    ff.frame(2_000);
    ff.frame(3_000);
    // The frame callback is handed 4,010, but the start runs later in that task: the clock reads 4,031.
    const perf = vi.mocked(performance.now);
    perf.mockImplementation(() => 4_031);
    ff.frame(4_010);
    expect(onStart).toHaveBeenCalledWith("pt_a", 4_031);
  });

  it("a stalled frame shows the current beat and skips the passed one; a long stall starts late, at the real time", () => {
    render(<Harness />);
    ff.frame(3_200); // 2.2 s in: beat 2 was never shown
    expect(view.beat).toBe(1);
    ff.frame(4_850); // the start was due at 4,000; it is executed now
    expect(onStart).toHaveBeenCalledWith("pt_a", 4_850);
  });

  it("going inactive (a hold) cancels: no beat, no start; active again counts in from 3 as a new pass", () => {
    render(<Harness />);
    ff.frame(2_500);
    expect(view.beat).toBe(2);
    act(() => setActive(false));
    expect(view).toEqual({ beat: null, passId: null });
    expect(ff.pending()).toBe(0);
    ff.frame(9_000);
    expect(onStart).not.toHaveBeenCalled();
    act(() => setActive(true));
    expect(view).toEqual({ beat: 3, passId: "pt_a:2" });
    ff.frame(10_000);
    expect(view.beat).toBe(2);
    ff.frame(12_000);
    expect(onStart).toHaveBeenCalledWith("pt_a", 12_000);
  });

  it("a hidden page cancels at once and re-counts from 3 when visible again; it never starts while hidden", () => {
    render(<Harness />);
    ff.frame(3_100);
    expect(view.beat).toBe(1);
    setVisibility("hidden");
    fire("visibilitychange");
    expect(view.beat).toBeNull();
    expect(ff.pending()).toBe(0);
    setVisibility("visible");
    ff.setNow(20_000);
    fire("visibilitychange");
    expect(view).toEqual({ beat: 3, passId: "pt_a:2" });
    ff.frame(22_999);
    expect(onStart).not.toHaveBeenCalled();
    ff.frame(23_000);
    expect(onStart).toHaveBeenCalledWith("pt_a", 23_000);
  });

  it("a frame that lands while the page is hidden (before the event) never starts the round", () => {
    render(<Harness />);
    ff.frame(3_500);
    setVisibility("hidden");
    ff.frame(4_100);
    expect(onStart).not.toHaveBeenCalled();
  });

  it("pagehide cancels; pageshow counts in again", () => {
    render(<Harness />);
    fire("pagehide", window);
    expect(view.beat).toBeNull();
    ff.setNow(5_000);
    fire("pageshow", window);
    expect(view).toEqual({ beat: 3, passId: "pt_a:2" });
  });

  it("a new round restarts the count-in for that round; the old round can never start", () => {
    render(<Harness />);
    ff.frame(3_500);
    act(() => setRound("pt_b"));
    expect(view).toEqual({ beat: 3, passId: "pt_b:2" });
    ff.frame(4_100); // the OLD round's start time has passed: nothing
    expect(onStart).not.toHaveBeenCalled();
    ff.frame(6_500); // 3 s after the new round began counting at 3,500
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith("pt_b", 6_500);
  });

  it("unmount cancels: nothing starts after it", () => {
    const { unmount } = render(<Harness />);
    ff.frame(3_500);
    unmount();
    expect(ff.pending()).toBe(0);
    ff.frame(5_000);
    expect(onStart).not.toHaveBeenCalled();
  });

  it("no round, nothing counts", () => {
    render(<Harness initial={null} />);
    expect(view).toEqual({ beat: null, passId: null });
    expect(ff.pending()).toBe(0);
  });

  it("StrictMode: one start", () => {
    render(<StrictMode><Harness /></StrictMode>);
    expect(view.beat).toBe(3);
    ff.frame(2_000);
    ff.frame(3_000);
    ff.frame(4_000);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("commits the start inside the frame (flushSync): the host's state is already rendered when the frame ends", () => {
    let started: number | null = null;
    function Host() {
      const [t, setT] = useState<number | null>(null);
      started = t;
      useCountIn({ roundId: "pt_a", active: t === null, onStart: (_id, at) => setT(at) });
      return null;
    }
    render(<Host />);
    ff.frame(4_000);
    expect(started).toBe(4_000);
  });
});
