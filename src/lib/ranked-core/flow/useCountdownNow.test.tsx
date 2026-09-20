/**
 * RFX1 Phase 2B3 — THE COUNTDOWN TICKS LIKE A CLOCK.
 *
 * The old clock sampled `Date.now()` during render on a `setInterval` whose
 * phase was an accident of mount, while polls re-rendered in between and
 * flipped digits early. Every test here is about the replacement's one
 * property: a visible number changes at the DEADLINE's own second boundary,
 * and at no other time.
 */
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCountdownNow } from "./useCountdownNow";
import { remainingSeconds } from "../timerMath";

const DEADLINE = new Date("2026-09-20T12:00:30.000Z");

/** Every displayed value, in order, with the instant it appeared. */
function Probe({ skewMs = 0, extra = 0 }: { skewMs?: number; extra?: number }) {
  const now = useCountdownNow(DEADLINE.toISOString(), skewMs);
  // `extra` is a prop that changes for reasons of its own — a poll landing, a
  // parent rerendering. It must be unable to move the digit.
  void extra;
  return <span data-testid="v">{remainingSeconds(DEADLINE.toISOString(), skewMs, now)}</span>;
}

let samples: { value: string; at: number }[];

function record(container: HTMLElement) {
  const v = container.querySelector("[data-testid=v]")!.textContent!;
  if (samples.length === 0 || samples[samples.length - 1].value !== v) {
    samples.push({ value: v, at: Date.now() });
  }
}

/** Advance `ms` in small steps, sampling the rendered digit as we go. */
async function run(container: HTMLElement, ms: number, step = 25) {
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    await act(async () => { await vi.advanceTimersByTimeAsync(step); });
    record(container);
  }
}

beforeEach(() => {
  samples = [];
  vi.useFakeTimers();
  // Start deliberately OFF a whole second, so a mount-anchored cadence and a
  // deadline-anchored one cannot be confused for each other.
  vi.setSystemTime(new Date(DEADLINE.getTime() - 30_000 - 437));
});
afterEach(() => { vi.useRealTimers(); });

describe("RFX1 2B3 — second-boundary countdown", () => {
  it("produces a stable 30 → 29 → 28 … sequence, one real second each", async () => {
    const { container } = render(<Probe />);
    record(container);
    await run(container, 11_000);

    const values = samples.map((s) => s.value);
    expect(values.slice(0, 12)).toEqual(
      ["31", "30", "29", "28", "27", "26", "25", "24", "23", "22", "21", "20"]);
    // The FIRST sample is the partial second the client mounted into (437 ms
    // of "31" remained). Every transition after it is a whole second.
    const gaps: number[] = [];
    for (let i = 2; i < samples.length; i += 1) gaps.push(samples[i].at - samples[i - 1].at);
    expect(Math.min(...gaps)).toBe(1000);
    expect(Math.max(...gaps)).toBe(1000);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    expect(avg).toBe(1000);
  });

  it("puts the transitions on DEADLINE boundaries, not on mount + k·1000", async () => {
    const { container } = render(<Probe />);
    record(container);
    await run(container, 6_000);
    // A mount-anchored interval would put every change at mount + k*1000,
    // i.e. 437 ms off the deadline. Each change is at deadline − k*1000.
    for (const s of samples.slice(1)) {
      const offset = (DEADLINE.getTime() - s.at) % 1000;
      // Distance to the NEAREST deadline boundary: within one sampling step
      // of it (the schedule overshoots by a frame on purpose). A
      // mount-anchored cadence would sit 437 ms away from every one of them.
      const toBoundary = Math.min(offset, 1000 - offset);
      expect(toBoundary).toBeLessThanOrEqual(25);
    }
  });

  it("a rerender for another reason cannot move the digit", async () => {
    const { container, rerender } = render(<Probe extra={0} />);
    record(container);
    await run(container, 1_500);
    const before = container.querySelector("[data-testid=v]")!.textContent;
    const at = samples[samples.length - 1].at;
    for (let i = 1; i <= 20; i += 1) {
      rerender(<Probe extra={i} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    }
    // 200 ms and twenty renders later the number has not moved, and when it
    // does move it is still on the boundary.
    expect(container.querySelector("[data-testid=v]")!.textContent).toBe(before);
    await run(container, 1_500);
    const next = samples[samples.length - 1];
    expect((next.at - at) % 1000).toBe(0);
  });

  it("re-anchors on a tiny server resync without a duplicate tick", async () => {
    const { container, rerender } = render(<Probe skewMs={0} />);
    record(container);
    await run(container, 2_100);
    const beforeCount = samples.length;
    // The kind of correction an ordinary poll produces: a few milliseconds.
    rerender(<Probe skewMs={7} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    record(container);
    expect(samples.length).toBe(beforeCount);  // no extra visible transition
    await run(container, 3_000);
    const gaps: number[] = [];
    for (let i = beforeCount; i < samples.length; i += 1) {
      gaps.push(samples[i].at - samples[i - 1].at);
    }
    // The boundaries moved by the correction, and by exactly that much.
    for (const g of gaps) expect(Math.abs(g - 1000)).toBeLessThanOrEqual(7 + 25);
  });

  it("snaps to the correct value after a backgrounded tab, animating nothing", async () => {
    const { container } = render(<Probe />);
    record(container);
    await run(container, 1_500);
    // Simulate the tab going away: no timers run at all for 6 seconds.
    vi.setSystemTime(Date.now() + 6_000);
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    const shown = container.querySelector("[data-testid=v]")!.textContent;
    const truth = remainingSeconds(DEADLINE.toISOString(), 0, Date.now());
    // One jump to the truth. The six missed seconds are NOT replayed — the
    // sample list gained one entry, not six.
    expect(Number(shown)).toBe(truth);
    expect(samples[samples.length - 1].value).not.toBe(shown);
    record(container);
    expect(samples.filter((s) => s.value === shown)).toHaveLength(1);
  });

  it("holds at 0 and never renders a negative second", async () => {
    vi.setSystemTime(DEADLINE.getTime() - 2_400);
    const { container } = render(<Probe />);
    record(container);
    await run(container, 6_000);
    const values = samples.map((s) => s.value);
    expect(values).toEqual(["3", "2", "1", "0"]);
    // The last number the player sees before zero occupies its own second.
    const one = samples.find((s) => s.value === "1")!;
    const zero = samples.find((s) => s.value === "0")!;
    expect(zero.at - one.at).toBe(1000);
    // And zero is the terminal state: nothing further is scheduled.
    expect(container.querySelector("[data-testid=v]")!.textContent).toBe("0");
  });
});
