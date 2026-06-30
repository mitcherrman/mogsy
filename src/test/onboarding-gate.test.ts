import { describe, it, expect, beforeEach } from "vitest";
import {
  incrementAnonymousActions,
  getAnonymousActionCount,
  resetGateState,
  hasSoftNudgeBeenSeen,
  markSoftNudgeSeen,
  markHubVisited,
  hasVisitedHub,
} from "@/lib/quiz/onboarding-gate";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("action count", () => {
  it("starts at 0", () => {
    expect(getAnonymousActionCount()).toBe(0);
  });

  it("increments and returns the new value", () => {
    expect(incrementAnonymousActions()).toBe(1);
    expect(incrementAnonymousActions()).toBe(2);
    expect(incrementAnonymousActions()).toBe(3);
  });

  it("persists across getAnonymousActionCount calls", () => {
    incrementAnonymousActions();
    incrementAnonymousActions();
    expect(getAnonymousActionCount()).toBe(2);
  });

  it("resetGateState clears the count", () => {
    incrementAnonymousActions();
    incrementAnonymousActions();
    resetGateState();
    expect(getAnonymousActionCount()).toBe(0);
  });
});

describe("soft nudge seen", () => {
  it("starts as not seen", () => {
    expect(hasSoftNudgeBeenSeen()).toBe(false);
  });

  it("is seen after markSoftNudgeSeen", () => {
    markSoftNudgeSeen();
    expect(hasSoftNudgeBeenSeen()).toBe(true);
  });

  it("resetGateState clears nudge seen flag", () => {
    markSoftNudgeSeen();
    resetGateState();
    expect(hasSoftNudgeBeenSeen()).toBe(false);
  });
});

describe("hub visited", () => {
  it("starts as not visited", () => {
    expect(hasVisitedHub()).toBe(false);
  });

  it("is visited after markHubVisited", () => {
    markHubVisited();
    expect(hasVisitedHub()).toBe(true);
  });
});

describe("gate threshold logic", () => {
  it("soft nudge fires at threshold", () => {
    const SOFT_THRESHOLD = 3;
    for (let i = 0; i < SOFT_THRESHOLD - 1; i++) {
      const count = incrementAnonymousActions();
      expect(count < SOFT_THRESHOLD).toBe(true);
    }
    const count = incrementAnonymousActions();
    expect(count >= SOFT_THRESHOLD).toBe(true);
  });

  it("hard gate fires at threshold", () => {
    const HARD_THRESHOLD = 5;
    for (let i = 0; i < HARD_THRESHOLD - 1; i++) {
      incrementAnonymousActions();
    }
    expect(getAnonymousActionCount() < HARD_THRESHOLD).toBe(true);
    incrementAnonymousActions();
    expect(getAnonymousActionCount() >= HARD_THRESHOLD).toBe(true);
  });

  it("nudge does not re-fire once seen", () => {
    markSoftNudgeSeen();
    // Simulate many actions — nudge should stay suppressed
    for (let i = 0; i < 10; i++) incrementAnonymousActions();
    expect(hasSoftNudgeBeenSeen()).toBe(true);
  });
});
