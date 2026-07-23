import { describe, expect, it } from "vitest";
import { animationDuration, durationAtSpeed, isStatCheckAnimationSpeed } from "./animationConfig";

describe("Stat Check animation timing config", () => {
  it("keeps default speed at authored duration", () => {
    expect(durationAtSpeed(400, 1)).toBe(400);
    expect(animationDuration(400, false, 1)).toBe(400);
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
