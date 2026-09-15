/**
 * RM1 Pass 2B — what the header's centre is told to show.
 *
 * Pure projections. The rule they exist to hold is the same one the history
 * bubble holds: the figure is the BASE, and the speed bonus is never folded
 * into it.
 */
import { describe, expect, it } from "vitest";
import { centralCardResult, centralResult, liveModuleTitle } from "./centralStage";
import type { PointsFeedbackView } from "./pointsFeedback";

const feedback = (over: Partial<PointsFeedbackView> = {}): PointsFeedbackView => ({
  baseLabel: "CORRECT", basePoints: 2, speed: null,
  pointsAwarded: 2, scoreAfter: 8, ...over,
});

describe("the viewer's result", () => {
  it("states a standard correct award", () => {
    expect(centralResult(feedback(), "correct"))
      .toEqual({ verdict: "CORRECT", points: "+2 POINTS" });
  });

  it("NEVER folds the speed bonus into the figure", () => {
    // Three points were banked. The display says +2, and the bonus gets its
    // own transient mark in the column that won it.
    const view = centralResult(
      feedback({ speed: { label: "FIRST", points: 1 }, pointsAwarded: 3 }), "correct");
    expect(view).toEqual({ verdict: "CORRECT", points: "+2 POINTS" });
  });

  it("says POINT, singular, for exactly one", () => {
    expect(centralResult(feedback({ baseLabel: "CORRECT", basePoints: 1 }), "correct")?.points)
      .toBe("+1 POINT");
  });

  it("states a wrong answer and a timeout in the same shape", () => {
    expect(centralResult(feedback({ baseLabel: "INCORRECT", basePoints: 0 }), "incorrect"))
      .toEqual({ verdict: "INCORRECT", points: "+0 POINTS" });
    expect(centralResult(feedback({ baseLabel: "TIMED OUT", basePoints: 0 }), "timed_out"))
      .toEqual({ verdict: "TIMED OUT", points: "+0 POINTS" });
  });

  it("lets a slice's own count BE the verdict", () => {
    // A block has no single correct/incorrect; "4 / 5" is the verdict there.
    expect(centralResult(feedback({ baseLabel: "4 / 5", basePoints: 4 }), "correct"))
      .toEqual({ verdict: "4 / 5", points: "+4 POINTS" });
  });

  it("is null without an award, so it cannot outlive the beat", () => {
    // `centralResult` is fed the REVEAL-GATED feedback, which is null outside
    // the beat — the display returns to the clock rather than decaying into a
    // stale result over a live question.
    expect(centralResult(null, "correct")).toBeNull();
    expect(centralResult(undefined, null)).toBeNull();
  });
});

describe("one card of a block", () => {
  it("states a correct card as +1 POINT and a wrong one as +0", () => {
    expect(centralCardResult({ outcome: "correct" }))
      .toEqual({ verdict: "CORRECT", points: "+1 POINT" });
    expect(centralCardResult({ outcome: "incorrect" }))
      .toEqual({ verdict: "INCORRECT", points: "+0 POINTS" });
    expect(centralCardResult({ outcome: "timeout" }))
      .toEqual({ verdict: "TIMED OUT", points: "+0 POINTS" });
  });

  it("is null when no card is being revealed", () => {
    expect(centralCardResult(null)).toBeNull();
  });
});

describe("what the module is called", () => {
  const round = (over: Record<string, unknown>) => ({
    segment: { moduleId: null, moduleVersion: null, segmentNumber: 1 },
    question: null, ...over,
  }) as never;

  it("names a Meta Reflex block by its module, not its category", () => {
    expect(liveModuleTitle(round({
      segment: { moduleId: "item_cost_duel", moduleVersion: 4, segmentNumber: 1 },
    }))).toBe("Meta Reflex");
  });

  it("does NOT call a pre-v4 item_cost_duel a Meta Reflex block", () => {
    // The same test the timeline's node dispatch uses. A looser one would
    // mislabel every match frozen before the mixed version.
    expect(liveModuleTitle(round({
      segment: { moduleId: "item_cost_duel", moduleVersion: 2, segmentNumber: 1 },
    }))).not.toBe("Meta Reflex");
  });

  it("names a slice Mastery", () => {
    expect(liveModuleTitle(round({
      segment: { moduleId: "mastery_slice", moduleVersion: 1, segmentNumber: 1 },
    }))).toBe("Mastery");
  });

  it("otherwise uses the question's published CATEGORY", () => {
    // A subject, never the entity the question happens to name.
    expect(liveModuleTitle(round({
      question: { topic: { category: "items", tier: null, iconHint: null } },
    }))).toBeTruthy();
  });

  it("is null when the round published no topic, so the face is skipped", () => {
    expect(liveModuleTitle(round({}))).toBeNull();
    expect(liveModuleTitle(null)).toBeNull();
  });
});
