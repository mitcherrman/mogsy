/**
 * RMOB2 — the phone's 5-slot timeline WINDOW is a presentation slice of the
 * projected view: it moves which slots are on screen and decides nothing else.
 */
import { describe, expect, it } from "vitest";
import { projectRoundTimeline, windowTimelineView } from "@/lib/ranked-core/roundTimeline";

const finite = (round: number, { matchOver = false } = {}) => projectRoundTimeline({
  roundNumber: round, completedRounds: matchOver ? 10 : round - 1,
  segmentRoundNumber: null, settlements: [], viewerSlot: "p1",
  totalRounds: 10, matchOver,
});

const onScreen = (view: ReturnType<typeof windowTimelineView>) =>
  view.nodes.filter((n) => n.visible).map((n) => n.roundNumber);

describe("windowTimelineView", () => {
  it("shows five slots and clamps the window at the start", () => {
    const w = windowTimelineView(finite(1), 5);
    expect(w.visibleNodes).toBe(5);
    expect(onScreen(w)).toEqual([1, 2, 3, 4, 5]);
    expect(w.currentIndex).toBe(0);
  });

  it("centres the current round mid-match", () => {
    const w = windowTimelineView(finite(4), 5);
    expect(onScreen(w)).toEqual([2, 3, 4, 5, 6]);
    expect(w.currentIndex).toBe(2);
    expect(w.nodes.find((n) => n.index === w.currentIndex)?.roundNumber).toBe(4);
  });

  it("clamps the window at the end of the plan", () => {
    const w = windowTimelineView(finite(10), 5);
    expect(onScreen(w)).toEqual([6, 7, 8, 9, 10]);
    expect(w.currentIndex).toBe(4);
  });

  it("ends a finished match's window on its last resolved slot", () => {
    const w = windowTimelineView(finite(10, { matchOver: true }), 5);
    expect(w.currentIndex).toBeNull();
    expect(onScreen(w)).toEqual([6, 7, 8, 9, 10]);
  });

  it("carries every node's state through untouched", () => {
    const view = finite(6);
    const w = windowTimelineView(view, 5);
    for (const node of w.nodes) {
      const source = view.nodes.find((n) => n.roundNumber === node.roundNumber)!;
      expect(node.state).toBe(source.state);
      expect(node.outcome).toBe(source.outcome);
      expect(node.segmentKind).toBe(source.segmentKind);
    }
  });

  it("returns a view that already fits unchanged", () => {
    const view = finite(3);
    expect(windowTimelineView(view, 10)).toBe(view);
  });
});
