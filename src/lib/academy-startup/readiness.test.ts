import { describe, expect, it } from "vitest";
import { CRITICAL_FONTS, FLOW_FRAMES, FrameFlow, evaluateReadiness } from "./readiness";

/**
 * ACADEMY STARTUP RC2 — the readiness contract is "every first-screen signal
 * has a final answer, then frames flow" — never "a promise resolved".
 */
describe("evaluateReadiness", () => {
  it("all ok: settled, nothing degraded", () => {
    expect(evaluateReadiness({ stage: "ok", "frame:leaguecraft": "ok", mogzy: "ok" })).toEqual({ settled: true, pending: [], degraded: [] });
  });

  it("a failed image SETTLES its signal: the reveal is degraded, never held by it", () => {
    expect(evaluateReadiness({ stage: "ok", "cover:archives": "error", mogzy: "ok" })).toEqual({
      settled: true, pending: [], degraded: ["cover:archives"],
    });
  });

  it("any pending signal holds, and is reported (sorted) for a cap to name", () => {
    const v = evaluateReadiness({ stage: "ok", patch: "pending", "font:lora": "pending", "cover:archives": "error" });
    expect(v.settled).toBe(false);
    expect(v.pending).toEqual(["font:lora", "patch"]);
    expect(v.degraded).toEqual(["cover:archives"]);
  });

  it("the display faces the first screen sets are all named", () => {
    expect(CRITICAL_FONTS.map((f) => f.family)).toEqual(["Cinzel", "Cinzel", "Space Mono", "Lora", "Inter"]);
  });
});

describe("FrameFlow — frames are flowing", () => {
  const feed = (flow: FrameFlow, times: number[]) => times.map((t) => flow.push(t));

  it("60 fps flows after FLOW_FRAMES intervals (~67 ms), not before", () => {
    const flow = new FrameFlow();
    const out = feed(flow, Array.from({ length: FLOW_FRAMES + 1 }, (_, i) => i * 16.7));
    expect(out.slice(0, FLOW_FRAMES)).toEqual(Array(FLOW_FRAMES).fill(false));
    expect(out[FLOW_FRAMES]).toBe(true);
  });

  it("an 800 ms GPU first-use stall restarts the count", () => {
    const flow = new FrameFlow();
    feed(flow, [0, 16, 33, 50]);
    expect(flow.push(850)).toBe(false); // the stall
    expect(feed(flow, [866, 883, 900])).toEqual([false, false, false]);
    expect(flow.push(916)).toBe(true);
  });

  it("Firefox's 33/17 ms alternation (~40 fps) still counts as flowing — frame rate is the quality tier's job", () => {
    const flow = new FrameFlow();
    expect(feed(flow, [0, 33, 50, 83, 100]).at(-1)).toBe(true);
  });

  it("a slow but steady device (~100 ms frames: software rendering, measured headless) flows in its own rhythm", () => {
    const flow = new FrameFlow();
    const out = feed(flow, Array.from({ length: 10 }, (_, i) => i * 100));
    expect(out.slice(0, 7).some(Boolean)).toBe(false); // the rhythm is learnt first
    expect(out[7]).toBe(true);
  });

  it("on that slow device, a stall well outside its rhythm (300 ms) still restarts the count", () => {
    const flow = new FrameFlow();
    feed(flow, [0, 100, 200, 300, 400, 500]);
    expect(flow.push(800)).toBe(false);
    expect(feed(flow, [900, 1000, 1100])).toEqual([false, false, false]);
    expect(flow.push(1200)).toBe(true);
  });

  it("nothing over 250 ms ever counts", () => {
    const flow = new FrameFlow();
    expect(feed(flow, Array.from({ length: 20 }, (_, i) => i * 260)).some(Boolean)).toBe(false);
  });

  it("frames before the signals settle teach the rhythm but never count", () => {
    const flow = new FrameFlow();
    for (let i = 0; i < 10; i++) expect(flow.push(i * 100, false)).toBe(false);
    expect([1000, 1100, 1200].map((t) => flow.push(t))).toEqual([false, false, false]);
    expect(flow.push(1300)).toBe(true);
  });

  it("reset() forgets the run", () => {
    const flow = new FrameFlow();
    feed(flow, [0, 16, 33, 50]);
    flow.reset();
    expect(flow.push(66)).toBe(false);
  });
});
