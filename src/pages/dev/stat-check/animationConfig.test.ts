import { describe, expect, it } from "vitest";
import {
  DAMAGE_REVEAL_TIMELINE,
  LANE_PLAQUE_TIMELINE,
  REVEAL_TIMELINE,
  STAT_CHECK_ANIMATION_SPEEDS,
  STAT_CHECK_DEFAULT_ANIMATION_SPEED,
  animationDuration,
  boardResultOffset,
  durationAtSpeed,
  isStatCheckAnimationSpeed,
  laneResolveOffsets,
  laneRevealTotalMs,
  lanePlaqueStageOffsets,
  lanePostComparisonMs,
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
    const [first, second, third] = laneStartOffsets([true, true, true]);
    const lane = laneRevealTotalMs(true);
    expect(first).toBe(0);
    expect(second).toBe(lane);
    expect(third).toBe(lane * 2);
    // Strictly sequential: a lane's own scenes all fall inside its own window.
    expect(lanePlaqueStageOffsets(true).settled).toBeLessThan(lane);
  });

  it("derives the whole reveal from the lane lengths so retiming stays coherent", () => {
    const decisive = [true, true, true];
    const lane = laneRevealTotalMs(true);
    const [one, two, three] = laneResolveOffsets(decisive);
    expect(one).toBe(REVEAL_TIMELINE.resolveLane1);
    expect(two - one).toBe(lane);
    expect(three - two).toBe(lane);
    // Board damage waits for the third lane to finish, not merely to start.
    expect(boardResultOffset(decisive)).toBe(three + lane);
  });

  it("pulls every later beat forward when an earlier lane resolves fast", () => {
    const allDecisive = [true, true, true];
    const firstNonDecisive = [false, true, true];
    const [, second, third] = laneResolveOffsets(firstNonDecisive);
    const [, slowSecond, slowThird] = laneResolveOffsets(allDecisive);
    expect(second).toBeLessThan(slowSecond);
    expect(third).toBeLessThan(slowThird);
    expect(boardResultOffset(firstNonDecisive)).toBeLessThan(boardResultOffset(allDecisive));
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

describe("non-decisive lane pacing", () => {
  it("keeps the decisive lane's full sequence untouched", () => {
    const t = LANE_PLAQUE_TIMELINE;
    const offsets = lanePlaqueStageOffsets(true);
    // The accepted sequence, beat for beat: the slice, the packet and the
    // impact all still own their authored time.
    expect(offsets.zero - offsets.slice).toBe(t.sliceMs);
    expect(offsets.bonus - offsets.transfer).toBe(t.transferMs);
    expect(offsets.settled - offsets.bonus).toBe(t.impactMs);
    expect(laneRevealTotalMs(true)).toBe(offsets.settled + t.settleMs);
  });

  it("drops the slice, packet and impact holds from a lane that earns no bonus", () => {
    const offsets = lanePlaqueStageOffsets(false);
    // Nothing to cut, nothing in flight, nothing to land.
    expect(offsets.zero).toBe(offsets.slice);
    expect(offsets.bonus).toBe(offsets.transfer);
    expect(offsets.settled).toBe(offsets.bonus);
  });

  it("still reads the comparison, the winner and +0 before handing off", () => {
    const t = LANE_PLAQUE_TIMELINE;
    const offsets = lanePlaqueStageOffsets(false);
    // Everything up to and including the winner emphasis is identical.
    expect(offsets.category).toBe(lanePlaqueStageOffsets(true).category);
    expect(offsets.values).toBe(lanePlaqueStageOffsets(true).values);
    expect(offsets.winner).toBe(lanePlaqueStageOffsets(true).winner);
    // +0 still gets its blink and its own read before the lane leaves.
    expect(offsets.transfer - offsets.zero).toBe(t.blinkMs + t.zeroHoldMs);
  });

  it("cuts post-comparison time by 40-50% for a lane with no bonus", () => {
    const decisive = lanePostComparisonMs(true);
    const nonDecisive = lanePostComparisonMs(false);
    const reduction = 1 - nonDecisive / decisive;
    expect(reduction).toBeGreaterThanOrEqual(0.4);
    expect(reduction).toBeLessThanOrEqual(0.5);
  });

  it("leaves no dead hold after +0 beyond the cleanup window", () => {
    const t = LANE_PLAQUE_TIMELINE;
    const offsets = lanePlaqueStageOffsets(false);
    // From +0 settling to the lane handing off is cleanup only.
    expect(laneRevealTotalMs(false) - offsets.settled).toBe(t.settleMs);
    expect(t.settleMs - t.valueTransitionMs).toBeLessThanOrEqual(20);
  });

  it("finishes a non-decisive lane strictly sooner than a decisive one", () => {
    expect(laneRevealTotalMs(false)).toBeLessThan(laneRevealTotalMs(true));
  });

  it("keeps lanes strictly ordered and non-overlapping for every outcome mix", () => {
    const mixes: boolean[][] = [
      [true, true, true],
      [false, false, false],
      [true, false, true],
      [false, true, false],
      [false, false, true],
    ];
    for (const mix of mixes) {
      const starts = laneStartOffsets(mix);
      for (let lane = 0; lane < 3; lane += 1) {
        // A lane's own scenes all finish inside its own window...
        const own = lanePlaqueStageOffsets(mix[lane]).settled;
        expect(own).toBeLessThan(laneRevealTotalMs(mix[lane]));
        // ...and the next lane starts only once this one has fully cleaned up.
        const endsAt = starts[lane] + laneRevealTotalMs(mix[lane]);
        if (lane < 2) expect(starts[lane + 1]).toBe(endsAt);
      }
      expect(starts[0]).toBeLessThan(starts[1]);
      expect(starts[1]).toBeLessThan(starts[2]);
      expect(boardResultOffset(mix)).toBe(
        REVEAL_TIMELINE.resolveLane1 + starts[2] + laneRevealTotalMs(mix[2]),
      );
    }
  });

  it("scales both the decisive and the non-decisive timeline with the speed control", () => {
    for (const speed of STAT_CHECK_ANIMATION_SPEEDS) {
      for (const decisive of [true, false]) {
        expect(durationAtSpeed(laneRevealTotalMs(decisive), speed)).toBe(
          Math.round(laneRevealTotalMs(decisive) / speed),
        );
      }
      // The gap between the two outcomes shrinks with speed but never inverts.
      expect(durationAtSpeed(laneRevealTotalMs(false), speed)).toBeLessThan(
        durationAtSpeed(laneRevealTotalMs(true), speed),
      );
    }
  });

  it("collapses to the reduced-motion instant for either outcome", () => {
    expect(animationDuration(laneRevealTotalMs(true), true, 1.5)).toBe(1);
    expect(animationDuration(laneRevealTotalMs(false), true, 1.5)).toBe(1);
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
    expect(durationAtSpeed(DAMAGE_REVEAL_TIMELINE.boardMs, 1.5)).toBe(
      Math.round(DAMAGE_REVEAL_TIMELINE.boardMs / 1.5),
    );
    expect(animationDuration(DAMAGE_REVEAL_TIMELINE.impactMs, true, 1.5)).toBe(1);
  });
});
