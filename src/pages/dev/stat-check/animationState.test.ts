import { describe, expect, it } from "vitest";
import {
  activeResolvedLane,
  allowsPreLockInteraction,
  animationStepReducer,
  revealedOpponentCount,
  stepAfterLane,
  stepBeforeDamage,
  type PresentationStep,
} from "./animationState";

describe("Stat Check presentation animation state", () => {
  it("steps through placement, return, reveal, damage, discard, and deal states", () => {
    let step: PresentationStep = "selecting";
    step = animationStepReducer(step, { type: "pickup" });
    expect(step).toBe("placement-pickup");
    step = animationStepReducer(step, { type: "hold" });
    expect(step).toBe("placement-hold");
    step = animationStepReducer(step, { type: "launch" });
    expect(step).toBe("placement-launch");
    step = animationStepReducer(step, { type: "travel" });
    expect(step).toBe("placement-travel");
    step = animationStepReducer(step, { type: "approach" });
    expect(step).toBe("placement-approach");
    step = animationStepReducer(step, { type: "impact" });
    expect(step).toBe("placement-impact");
    step = animationStepReducer(step, { type: "rebound" });
    expect(step).toBe("placement-rebound");
    step = animationStepReducer(step, { type: "settle" });
    expect(step).toBe("placement-settle");
    step = animationStepReducer(step, { type: "accept" });
    expect(step).toBe("placement-accepted");
    step = animationStepReducer(step, { type: "return" });
    expect(step).toBe("returning-card");
    step = animationStepReducer(step, { type: "lock" });
    expect(step).toBe("locking");
    step = animationStepReducer(step, { type: "opponent", lane: 1 });
    expect(step).toBe("opponent-reveal-1");
    step = animationStepReducer(step, { type: "resolve", lane: 3 });
    expect(step).toBe("resolve-lane-3");
    step = animationStepReducer(step, { type: "damage" });
    expect(step).toBe("damage");
    step = animationStepReducer(step, { type: "discard" });
    expect(step).toBe("discarding");
    step = animationStepReducer(step, { type: "deal" });
    expect(step).toBe("dealing");
  });

  it("counts revealed opponent cards in order", () => {
    expect(revealedOpponentCount("selecting")).toBe(0);
    expect(revealedOpponentCount("opponent-reveal-1")).toBe(1);
    expect(revealedOpponentCount("opponent-reveal-2")).toBe(2);
    expect(revealedOpponentCount("opponent-reveal-3")).toBe(3);
    expect(revealedOpponentCount("resolve-lane-1")).toBe(3);
  });

  it("tracks active and completed lane resolution", () => {
    expect(activeResolvedLane("resolve-lane-2")).toBe(1);
    expect(stepAfterLane("resolve-lane-2", 0)).toBe(true);
    expect(stepAfterLane("resolve-lane-2", 1)).toBe(false);
    expect(stepAfterLane("board-result", 2)).toBe(true);
  });

  it("keeps HP display on pre-damage values until damage phase", () => {
    expect(stepBeforeDamage("board-result")).toBe(true);
    expect(stepBeforeDamage("damage")).toBe(false);
  });

  it("cancels to selecting", () => {
    expect(animationStepReducer("damage", { type: "cancel" })).toBe("selecting");
  });

  it("keeps every hero-play phase interactive but blocks lock/reveal phases", () => {
    expect(allowsPreLockInteraction("selecting")).toBe(true);
    expect(allowsPreLockInteraction("placement-hold")).toBe(true);
    expect(allowsPreLockInteraction("placement-travel")).toBe(true);
    expect(allowsPreLockInteraction("placement-impact")).toBe(true);
    expect(allowsPreLockInteraction("placement-settle")).toBe(true);
    expect(allowsPreLockInteraction("returning-card")).toBe(true);
    expect(allowsPreLockInteraction("locking")).toBe(false);
    expect(allowsPreLockInteraction("opponent-reveal-1")).toBe(false);
  });
});
