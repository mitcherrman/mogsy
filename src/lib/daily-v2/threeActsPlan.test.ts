import { describe, expect, it } from "vitest";
import type { RoundTimelineView, TimelineNode } from "@/lib/ranked-core/viewTypes";
import { projectSetTimeline, readThreeActsPlan, windowSetTimeline } from "./threeActsPlan";
import { THREE_ACTS_COMPOSITION } from "./__fixtures__/threeActsComposition";


function timeline(current: number | null, settled: number, outcomes: Record<number, TimelineNode["outcome"]> = {}): RoundTimelineView {
  const nodes: TimelineNode[] = Array.from({ length: 19 }, (_, i) => {
    const rn = i + 1;
    const state = rn === current ? "current" : rn <= settled ? "resolved" : "upcoming";
    return { roundNumber: rn, index: i, visible: true, state, segmentKind: null,
      outcome: outcomes[rn] ?? null, tag: null, topic: null } as TimelineNode;
  });
  return { visibleNodes: 19, anchorIndex: 0, windowStart: 1, currentIndex: current === null ? null : current - 1,
    currentRoundNumber: current, anchored: false, nodes };
}

describe("readThreeActsPlan", () => {
  it("reads the server shape", () => {
    const plan = readThreeActsPlan(THREE_ACTS_COMPOSITION)!;
    expect(plan.segments).toBe(19);
    expect(plan.answers).toBe(21);
    expect(plan.units.map((u) => u.kind)).toEqual(["set", "set", "meta_reflex", "set", "set", "set", "set"]);
  });

  it("is null for every other composition (V1, Time Trial, Survival, absent)", () => {
    expect(readThreeActsPlan({ recipe_id: "daily-standard-v1", modules: 10, units: ["splash"] })).toBeNull();
    expect(readThreeActsPlan(null)).toBeNull();
    expect(readThreeActsPlan(undefined)).toBeNull();
  });

  it("refuses a plan that breaks its own counts", () => {
    expect(() => readThreeActsPlan({ ...THREE_ACTS_COMPOSITION, segments: 18 })).toThrow(/segments/);
    expect(() => readThreeActsPlan({ ...THREE_ACTS_COMPOSITION, answers: 22 })).toThrow(/answers/);
    const units = THREE_ACTS_COMPOSITION.units.map((u) => ({ ...u }));
    (units[0] as { bands: string[] }).bands = ["H", "M", "E"];
    expect(() => readThreeActsPlan({ ...THREE_ACTS_COMPOSITION, units })).toThrow(/bands/);
  });
});

describe("projectSetTimeline", () => {
  const plan = readThreeActsPlan(THREE_ACTS_COMPOSITION)!;

  it("groups 19 rounds into 6 sets of 3 and one sprint", () => {
    const view = projectSetTimeline(timeline(1, 0), plan);
    expect(view.groups.map((g) => g.label)).toEqual(["E1", "E2", "MR", "M1", "M2", "L1", "L2"]);
    expect(view.groups.map((g) => g.steps.map((s) => s.roundNumber))).toEqual([
      [1, 2, 3], [4, 5, 6], [7], [8, 9, 10], [11, 12, 13], [14, 15, 16], [17, 18, 19]]);
    expect(view.groups[0].steps.map((s) => s.band)).toEqual(["E", "M", "H"]);
    expect(view.groups[2].steps[0].band).toBeNull();
  });

  it("reads states and verdicts only from the round timeline", () => {
    const view = projectSetTimeline(timeline(8, 7, { 1: "correct", 2: "incorrect", 3: "timed-out" }), plan);
    expect(view.currentGroupIndex).toBe(3);
    expect(view.groups.slice(0, 3).map((g) => g.state)).toEqual(["done", "done", "done"]);
    expect(view.groups[3].state).toBe("current");
    expect(view.groups[0].steps.map((s) => s.outcome)).toEqual(["correct", "incorrect", "timed-out"]);
    expect(view.groups[1].steps.map((s) => s.outcome)).toEqual([null, null, null]);
    expect(view.groups.slice(4).every((g) => g.state === "upcoming")).toBe(true);
  });

  it("has no current group once the match is over", () => {
    const view = projectSetTimeline(timeline(null, 19), plan);
    expect(view.currentGroupIndex).toBeNull();
    expect(view.groups.every((g) => g.state === "done")).toBe(true);
  });
});

describe("windowSetTimeline (phone)", () => {
  const plan = readThreeActsPlan(THREE_ACTS_COMPOSITION)!;
  const labels = (current: number | null, settled: number) =>
    windowSetTimeline(projectSetTimeline(timeline(current, settled), plan), 3).groups.map((g) => g.label);

  it("keeps three whole sets around the current one, clamped at the ends", () => {
    expect(labels(1, 0)).toEqual(["E1", "E2", "MR"]);
    expect(labels(7, 6)).toEqual(["E2", "MR", "M1"]);
    expect(labels(12, 11)).toEqual(["M1", "M2", "L1"]);
    expect(labels(19, 18)).toEqual(["M2", "L1", "L2"]);
    expect(labels(null, 19)).toEqual(["M2", "L1", "L2"]);
  });

  it("re-indexes the current group inside the window", () => {
    const view = windowSetTimeline(projectSetTimeline(timeline(12, 11), plan), 3);
    expect(view.groups[view.currentGroupIndex!].label).toBe("M2");
  });
});
