import { describe, expect, it } from "vitest";
import { computeClockSkewMs, remainingMs, remainingSeconds } from "./timerMath";

const DEADLINE = "2026-07-13T12:00:30.000Z";
const DEADLINE_EPOCH = Date.parse(DEADLINE);

describe("timerMath", () => {
  it("zero skew when local clock matches the server", () => {
    const now = DEADLINE_EPOCH - 20_000;
    expect(computeClockSkewMs(DEADLINE, 20_000, now)).toBe(0);
    expect(remainingMs(DEADLINE, 0, now)).toBe(20_000);
    expect(remainingSeconds(DEADLINE, 0, now)).toBe(20);
  });

  it("reconciles a fast local clock so display matches server remaining", () => {
    // Local clock runs 3s ahead: naive remaining would be 17s, server says 20s.
    const now = DEADLINE_EPOCH - 20_000 + 3_000;
    const skew = computeClockSkewMs(DEADLINE, 20_000, now);
    expect(skew).toBe(-3_000);
    expect(remainingMs(DEADLINE, skew, now)).toBe(20_000);
  });

  it("reconciles a slow local clock the same way", () => {
    const now = DEADLINE_EPOCH - 20_000 - 5_000;
    const skew = computeClockSkewMs(DEADLINE, 20_000, now);
    expect(skew).toBe(5_000);
    expect(remainingMs(DEADLINE, skew, now)).toBe(20_000);
  });

  it("clamps at zero after the deadline (never negative)", () => {
    const now = DEADLINE_EPOCH + 4_000;
    expect(remainingMs(DEADLINE, 0, now)).toBe(0);
    expect(remainingSeconds(DEADLINE, 0, now)).toBe(0);
  });

  it("null server remaining trusts the deadline (skew 0)", () => {
    const now = DEADLINE_EPOCH - 7_500;
    expect(computeClockSkewMs(DEADLINE, null, now)).toBe(0);
    expect(remainingSeconds(DEADLINE, 0, now)).toBe(8);
  });

  it("an unparseable deadline yields 0 remaining rather than NaN", () => {
    expect(computeClockSkewMs("not-a-date", 1_000, 0)).toBe(0);
    expect(remainingMs("not-a-date", 0, 0)).toBe(0);
  });
});
