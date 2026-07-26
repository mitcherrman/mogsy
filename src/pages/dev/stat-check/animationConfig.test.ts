import { describe, expect, it } from "vitest";
import {
  DAMAGE_REVEAL_TIMELINE,
  LANE_PLAQUE_TIMELINE,
  REVEAL_TIMELINE,
  STAT_CHECK_ANIMATION_SPEEDS,
  STAT_CHECK_DEFAULT_ANIMATION_SPEED,
  animationDuration,
  durationAtSpeed,
  isStatCheckAnimationSpeed,
  laneRevealTotalMs,
  lanePlaqueStageOffsets,
  laneStartOffsets,
} from "./animationConfig";

describe("Stat Check animation timing config", () => {
  it("keeps 1x at the authored duration", () => {
    expect(durationAtSpeed(400, 1)).toBe(400);
    expect(animationDuration(400, false, 1)).toBe(400);
  });

  it("defaults gameplay to 1.5x while keeping every slower speed selectable", () => {
    expect(STAT_CHECK_DEFAULT_ANIMATION_SPEED).toBe(1.5);
    expect(STAT_CHECK_ANIMATION_SPEEDS).toContain(STAT_CHECK_DEFAULT_ANIMATION_SPEED);
    expect([...STAT_CHECK_ANIMATION_SPEEDS]).toEqual([0.25, 0.5, 1, 1.5]);
  });

  it("makes lower displayed speed slower", () => {
    expect(durationAtSpeed(400, 0.5)).toBe(800);
    expect(durationAtSpeed(400, 0.25)).toBe(1600);
  });

  it("allows optional faster inspection speed", () => {
    expect(durationAtSpeed(600, 1.5)).toBe(400);
  });

  it("lets reduced motion override speed scaling", () => {
    expect(animationDuration(400, true, 0.25)).toBe(1);
  });

  it("guards restored persisted speed values", () => {
    expect(isStatCheckAnimationSpeed(0.25)).toBe(true);
    expect(isStatCheckAnimationSpeed(0.75)).toBe(false);
  });
});

describe("lane handoff", () => {
  it("reserves only cleanup time after a lane settles, with no idle hold", () => {
    // The trailing window exists to let the value-emphasis transition unwind.
    // Anything beyond that transition would be visible dead air between lanes.
    expect(LANE_PLAQUE_TIMELINE.settleMs).toBeGreaterThanOrEqual(LANE_PLAQUE_TIMELINE.valueTransitionMs);
    const deadTime = LANE_PLAQUE_TIMELINE.settleMs - LANE_PLAQUE_TIMELINE.valueTransitionMs;
    expect(deadTime).toBeLessThanOrEqual(20);
  });

  it("starts each lane the moment the previous one has finished cleaning up", () => {
    const [first, second, third] = laneStartOffsets();
    const lane = laneRevealTotalMs();
    expect(first).toBe(0);
    expect(second).toBe(lane);
    expect(third).toBe(lane * 2);
    // Strictly sequential: a lane's own scenes all fall inside its own window.
    expect(lanePlaqueStageOffsets().settled).toBeLessThan(lane);
  });

  it("derives the whole reveal from the lane length so retiming stays coherent", () => {
    const lane = laneRevealTotalMs();
    expect(REVEAL_TIMELINE.resolveLane2 - REVEAL_TIMELINE.resolveLane1).toBe(lane);
    expect(REVEAL_TIMELINE.resolveLane3 - REVEAL_TIMELINE.resolveLane2).toBe(lane);
    // Board damage waits for the third lane to finish, not merely to start.
    expect(REVEAL_TIMELINE.boardResult).toBe(REVEAL_TIMELINE.resolveLane3 + lane);
  });

  it("keeps cleanup inside the settle window at every speed", () => {
    expect(durationAtSpeed(laneRevealTotalMs(), 1.5)).toBeLessThan(laneRevealTotalMs());
    // The badge transition is driven by the same speed-scaled value, so the
    // next lane can never start on top of the previous lane's cleanup.
    for (const speed of STAT_CHECK_ANIMATION_SPEEDS) {
      expect(durationAtSpeed(LANE_PLAQUE_TIMELINE.settleMs, speed)).toBeGreaterThanOrEqual(
        durationAtSpeed(LANE_PLAQUE_TIMELINE.valueTransitionMs, speed),
      );
    }
  });
});

describe("damage presentation timing", () => {
  it("keeps every beat in one centralized block", () => {
    for (const value of Object.values(DAMAGE_REVEAL_TIMELINE)) {
      expect(value).toBeGreaterThan(0);
    }
  });

  it("measures the tail beats from the end of the presentation", () => {
    expect(REVEAL_TIMELINE.damageTailMs).toBeLessThan(REVEAL_TIMELINE.resolvedTailMs);
  });

  it("scales with the speed control and collapses under reduced motion", () => {
    expect(durationAtSpeed(DAMAGE_REVEAL_TIMELINE.componentMs, 1.5)).toBe(
      Math.round(DAMAGE_REVEAL_TIMELINE.componentMs / 1.5),
    );
    expect(animationDuration(DAMAGE_REVEAL_TIMELINE.impactMs, true, 1.5)).toBe(1);
  });
});
