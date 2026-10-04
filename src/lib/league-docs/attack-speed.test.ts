// Pins frontend attack-speed projection to the backend authority
// (champion_stat_profile.calculate_champion_attack_speed_at_level).
import { describe, expect, it } from "vitest";

import { ATTACK_SPEED_GROWTH_FROM_BASE, attackSpeedAtLevel, riotLevelMultiplier } from "./api";

describe("attackSpeedAtLevel — Jhin growth-from-base exception", () => {
  it("only Jhin is a growth-from-base champion", () => {
    expect([...ATTACK_SPEED_GROWTH_FROM_BASE]).toEqual(["Jhin"]);
  });

  it("matches the backend Jhin values at levels 1, 2 and 18", () => {
    const jhin = (level: number) => attackSpeedAtLevel(0.625, 3, level, 0, "Jhin");
    expect(jhin(1)).toBeCloseTo(0.625, 10);
    expect(jhin(2)).toBeCloseTo(0.625 * (1 + 0.03 * 0.72), 10);
    expect(jhin(18)).toBeCloseTo(0.94375, 10);
    expect(riotLevelMultiplier(18)).toBeCloseTo(17, 10);
  });

  it("keeps a real 0.0 ratio flat for any other champion", () => {
    for (const level of [1, 2, 18]) {
      expect(attackSpeedAtLevel(0.625, 3, level, 0, "Notjhin")).toBe(0.625);
      expect(attackSpeedAtLevel(0.625, 3, level, 0)).toBe(0.625);
    }
  });

  it("still scales growth by the ratio when base != ratio", () => {
    // Ashe-like: base 0.658, ratio 0.625, growth 3.33%
    expect(attackSpeedAtLevel(0.658, 3.33, 18, 0.625, "Ashe")).toBeCloseTo(0.658 + (0.625 * 3.33 * 17) / 100, 10);
  });

  it("falls back to base when the ratio is missing", () => {
    expect(attackSpeedAtLevel(0.7, 2, 18, null, "Ashe")).toBeCloseTo(0.7 + (0.7 * 2 * 17) / 100, 10);
    expect(attackSpeedAtLevel(0.7, 2, 18)).toBeCloseTo(0.7 + (0.7 * 2 * 17) / 100, 10);
  });
});
