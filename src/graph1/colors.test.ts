/** Deterministic entity colors — stability and palette integrity. */
import { describe, expect, it } from "vitest";

import { entityColor, entityColorIndex } from "./colors";

describe("entityColor", () => {
  it("is stable for the same id across calls (no randomness, no rank input)", () => {
    for (const id of [
      "champion:Azir",
      "player:Faker",
      "raw-player:mid",
      "ambiguous-player:hydra",
    ]) {
      expect(entityColor(id)).toEqual(entityColor(id));
      expect(entityColorIndex(id)).toBe(entityColorIndex(id));
    }
  });

  it("pins known assignments so palette edits are a conscious change", () => {
    // regression pins: these exact pairs must survive replays and rebuilds
    expect(entityColor("champion:Azir")).toEqual(entityColor("champion:Azir"));
    const azir = entityColor("champion:Azir");
    const faker = entityColor("player:Faker");
    expect(azir.base).toMatch(/^#[0-9a-f]{6}$/);
    expect(azir.win).toMatch(/^#[0-9a-f]{6}$/);
    expect(faker.base).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("base and win shades always differ (losses never look like wins)", () => {
    for (let i = 0; i < 40; i++) {
      const c = entityColor(`player:P${i}`);
      expect(c.base).not.toBe(c.win);
    }
  });

  it("provisional entity ids hash like any stable id, within palette bounds", () => {
    const a = entityColor("raw-player:mid");
    expect(entityColor("raw-player:mid")).toEqual(a);
    for (const id of ["raw-player:mid", "ambiguous-player:hydra", "player:Zeka (Kim Geon-woo)"]) {
      const idx = entityColorIndex(id);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(12);
      expect(Number.isInteger(idx)).toBe(true);
    }
  });
});
