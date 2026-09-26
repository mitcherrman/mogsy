import { describe, expect, it } from "vitest";
import { ACTIVE_IDLE_TIMEOUT_MS, ActiveTimeAccumulator } from "./sessionIntelligence";

describe("ActiveTimeAccumulator", () => {
  it("counts visible focused time instead of first-to-last wall clock", () => {
    const clock = new ActiveTimeAccumulator(0, true);
    clock.advance(10_000);
    clock.setEligible(10_000, false);
    clock.advance(50_000);
    clock.setEligible(50_000, true);
    clock.advance(55_000);
    expect(clock.activeMs).toBe(15_000);
    expect(clock.lastActiveAt).toBe(55_000);
  });

  it("caps an uninterrupted interval at the documented idle threshold", () => {
    const clock = new ActiveTimeAccumulator(0, true);
    clock.advance(ACTIVE_IDLE_TIMEOUT_MS + 120_000);
    expect(clock.activeMs).toBe(ACTIVE_IDLE_TIMEOUT_MS);
    expect(clock.lastActiveAt).toBe(ACTIVE_IDLE_TIMEOUT_MS);
  });

  it("trusted interaction resumes accumulation after idle", () => {
    const clock = new ActiveTimeAccumulator(0, true);
    clock.advance(ACTIVE_IDLE_TIMEOUT_MS + 10_000);
    clock.trustedInteraction(ACTIVE_IDLE_TIMEOUT_MS + 10_000, true);
    clock.advance(ACTIVE_IDLE_TIMEOUT_MS + 15_000);
    expect(clock.activeMs).toBe(ACTIVE_IDLE_TIMEOUT_MS + 5_000);
  });

  it("focus or visibility alone does not resume an idle session", () => {
    const clock = new ActiveTimeAccumulator(0, true);
    clock.advance(ACTIVE_IDLE_TIMEOUT_MS + 10_000);
    clock.setEligible(ACTIVE_IDLE_TIMEOUT_MS + 10_000, false);
    clock.setEligible(ACTIVE_IDLE_TIMEOUT_MS + 20_000, true);
    clock.advance(ACTIVE_IDLE_TIMEOUT_MS + 25_000);
    expect(clock.activeMs).toBe(ACTIVE_IDLE_TIMEOUT_MS);
  });

  it("never moves a restored cumulative total backwards", () => {
    const clock = new ActiveTimeAccumulator(1_000, true, {
      activeMs: 42_000,
      lastActiveAt: new Date(500).toISOString(),
    });
    clock.advance(2_000);
    expect(clock.activeMs).toBe(43_000);
  });

  it("merges a larger checkpoint from another same-browser tab", () => {
    const clock = new ActiveTimeAccumulator(0, true);
    clock.advance(1_000);
    clock.mergeStored({ activeMs: 8_000, lastActiveAt: new Date(7_000).toISOString() });
    expect(clock.activeMs).toBe(8_000);
    expect(clock.lastActiveAt).toBe(7_000);
  });
});
