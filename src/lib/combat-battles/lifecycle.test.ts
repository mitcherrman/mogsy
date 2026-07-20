import { describe, expect, it } from "vitest";
import {
  decisionReasonCopy, nextBoundary, outcomeCopy, STATUS_LABELS, winnerLabel, sideName,
} from "./lifecycle";

describe("decisionReasonCopy", () => {
  it("maps each backend reason to exact copy with champion names", () => {
    expect(decisionReasonCopy("only_left_reached_lethal", "Annie", "Brand"))
      .toBe("Only Annie reached lethal damage.");
    expect(decisionReasonCopy("both_lethal_right_fewer_actions", "Annie", "Brand"))
      .toBe("Both reached lethal; Brand required fewer actions.");
    expect(decisionReasonCopy("neither_lethal_left_more_pct", "Annie", "Brand"))
      .toBe("Neither reached lethal; Annie removed a greater percentage of health.");
    expect(decisionReasonCopy("neither_lethal_equal_pct_within_tolerance", "A", "B"))
      .toContain("draw");
  });
  it("falls back safely for an unknown reason (no crash, no subjective claim)", () => {
    expect(decisionReasonCopy("something_new", "A", "B")).toBe(
      "The deterministic comparison resolved this result.");
  });
});

describe("nextBoundary", () => {
  const t = { open_at: "2026-01-01T00:00:00Z", lock_at: "2026-01-02T00:00:00Z", reveal_at: "2026-01-03T00:00:00Z" };
  it("points at the correct next server timestamp per status", () => {
    expect(nextBoundary("scheduled", t)).toEqual({ label: "Predictions open in", at: t.open_at });
    expect(nextBoundary("open", t)).toEqual({ label: "Predictions lock in", at: t.lock_at });
    expect(nextBoundary("locked", t)).toEqual({ label: "Result reveals in", at: t.reveal_at });
    expect(nextBoundary("revealed", t)).toBeNull();
    expect(nextBoundary("void", t)).toBeNull();
  });
});

describe("outcomeCopy", () => {
  it("draw is a push with no score lost", () => {
    expect(outcomeCopy("push", 0)).toContain("push");
    expect(outcomeCopy("push", 0).toLowerCase()).toContain("no arena score");
  });
  it("void awards nothing", () => {
    expect(outcomeCopy("void", 0)).toContain("voided");
  });
  it("correct states the award", () => {
    expect(outcomeCopy("correct", 100)).toContain("+100");
  });
});

describe("labels", () => {
  it("winnerLabel handles draw", () => {
    expect(winnerLabel("draw", "Annie", "Brand")).toBe("Draw");
    expect(winnerLabel("left", "Annie", "Brand")).toBe("Annie");
  });
  it("sideName resolves", () => {
    expect(sideName("right", "Annie", "Brand")).toBe("Brand");
  });
  it("status labels use product language, not gambling terms", () => {
    expect(STATUS_LABELS.open).toBe("Open");
    expect(STATUS_LABELS.locked).toBe("Prediction locked");
    expect(STATUS_LABELS.revealed).toBe("Result revealed");
  });
});
