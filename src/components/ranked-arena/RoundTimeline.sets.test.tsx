/**
 * Daily three acts (V2) — the ONE arena strip, drawn by set when the timeline
 * view carries the server's set plan.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RoundTimelineView, TimelineNode } from "@/lib/ranked-core/viewTypes";
import { windowTimelineView } from "@/lib/ranked-core/roundTimeline";
import { projectSetTimeline, readThreeActsPlan } from "@/lib/daily-v2/threeActsPlan";
import { THREE_ACTS_COMPOSITION } from "@/lib/daily-v2/__fixtures__/threeActsComposition";
import { RoundTimeline } from "./RoundTimeline";

const plan = readThreeActsPlan(THREE_ACTS_COMPOSITION)!;

function timeline(current: number | null, settled: number,
                  outcomes: Record<number, TimelineNode["outcome"]> = {}): RoundTimelineView {
  const nodes = Array.from({ length: 19 }, (_, i) => {
    const rn = i + 1;
    const state = rn === current ? "current" : rn <= settled ? "resolved" : "upcoming";
    return { roundNumber: rn, index: i, visible: true, state, segmentKind: null,
      outcome: outcomes[rn] ?? null, tag: null, topic: null } as TimelineNode;
  });
  const view: RoundTimelineView = { visibleNodes: 19, anchorIndex: 0, windowStart: 1,
    currentIndex: current === null ? null : current - 1, currentRoundNumber: current, anchored: false, nodes };
  return { ...view, sets: projectSetTimeline(view, plan) };
}

describe("RoundTimeline — three-act sets", () => {
  it("draws seven groups, not nineteen nodes", () => {
    render(<RoundTimeline timeline={timeline(5, 4, { 1: "correct", 2: "correct", 3: "incorrect", 4: "timed-out" })} />);
    const strip = screen.getByTestId("ranked-round-timeline");
    expect(strip.dataset.variant).toBe("sets");
    expect(within(strip).getAllByRole("listitem")).toHaveLength(7);
    expect(strip.dataset.currentGroup).toBe("1");
    const current = screen.getByTestId("daily-set-early.2");
    expect(current.getAttribute("aria-current")).toBe("step");
    expect(current.getAttribute("aria-label")).toBe("Early, set 2: easy timed out, medium current, hard upcoming");
    expect(screen.getByTestId("daily-set-early.1").getAttribute("aria-label"))
      .toBe("Early, set 1: easy correct, medium correct, hard incorrect");
    expect(screen.getByTestId("daily-set-step-3").dataset.outcome).toBe("incorrect");
    expect(screen.getByTestId("daily-set-mr-2").getAttribute("aria-label"))
      .toBe("Meta Reflex sprint, 3 cards: upcoming");
  });

  it("the phone's five-node window keeps three whole sets", () => {
    render(<RoundTimeline testIdPrefix="mobile-" timeline={windowTimelineView(timeline(9, 8), 5)} />);
    const items = within(screen.getByTestId("mobile-ranked-round-timeline")).getAllByRole("listitem");
    expect(items.map((i) => i.dataset.state)).toEqual(["done", "current", "upcoming"]);
    expect(screen.getByTestId("mobile-daily-set-mid.1").dataset.state).toBe("current");
  });

  it("is a progression strip only: no score, points or question text", () => {
    render(<RoundTimeline timeline={timeline(null, 19, { 1: "correct" })} />);
    expect(screen.getByTestId("ranked-round-timeline").textContent).toBe("E1E2MRM1M2L1L2");
  });

  it("without a plan the strip is the unchanged round strip", () => {
    const { sets: _sets, ...plain } = timeline(5, 4);
    render(<RoundTimeline timeline={plain} />);
    expect(screen.getByTestId("ranked-round-timeline").dataset.variant).toBeUndefined();
    expect(screen.queryByTestId("daily-set-early.1")).toBeNull();
  });
});
