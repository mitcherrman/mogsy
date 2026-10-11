import { describe, expect, it } from "vitest";
import {
  DEFAULT_FOCAL,
  SPLASH_FOCAL,
  SPLASH_H,
  SPLASH_W,
  anchorFor,
  artSideFor,
  focalFor,
  objectPositionFor,
  toObjectPosition,
} from "./focal";

describe("splash focal metadata", () => {
  it("covers every champion in the 26.19 and 26.20 decks with sane fractions", () => {
    const needed = [
      "Ambessa", "Ashe", "Cassiopeia", "Diana", "Kennen", "Kindred", "K'Sante", "Lillia", "Lucian", "Mordekaiser",
      "Neeko", "Smolder", "Swain", "Tahm Kench", "Vayne", "Yunara", "Bard", "Garen", "Lee Sin", "Thresh", "Bel'Veth",
      "Locke", "Aatrox", "Aphelios", "Aurora", "Draven", "Elise", "Fiora", "Vi",
    ];
    for (const key of needed) expect(SPLASH_FOCAL[key], key).toBeDefined();
    for (const [key, f] of Object.entries(SPLASH_FOCAL)) {
      expect(f.x, key).toBeGreaterThan(0.05);
      expect(f.x, key).toBeLessThan(0.95);
      expect(f.y, key).toBeGreaterThan(0.05);
      expect(f.y, key).toBeLessThan(0.7);
    }
  });

  it("falls back to a centred focal for unknown art", () => {
    expect(focalFor("Nobody")).toEqual(DEFAULT_FOCAL);
    expect(focalFor(null)).toEqual(DEFAULT_FOCAL);
    expect(artSideFor(DEFAULT_FOCAL)).toBe("left");
  });

  it("mirrors the card for right-set champions and keeps left-set ones", () => {
    expect(artSideFor(focalFor("Swain"))).toBe("right");
    expect(artSideFor(focalFor("Diana"))).toBe("right");
    expect(artSideFor(focalFor("Cassiopeia"))).toBe("right");
    expect(artSideFor(focalFor("K'Sante"))).toBe("left");
    expect(artSideFor(focalFor("Neeko"))).toBe("left");
  });

  it("places the face on the anchor when the crop allows, else as close as cover permits", () => {
    const box = { width: 1000, height: 760 };
    // Swain (face at 67%) on a right-side card: anchor 64% of the box is reachable.
    const swain = objectPositionFor(focalFor("Swain"), anchorFor("right"), box);
    const scale = Math.max(box.width / SPLASH_W, box.height / SPLASH_H);
    const w = SPLASH_W * scale;
    const landed = focalFor("Swain").x * w - swain.x * (w - box.width);
    expect(landed / box.width).toBeCloseTo(0.64, 2);
    // Vayne (82%) on a right card is reachable too; on a hypothetical left card it would clamp at 100%.
    expect(objectPositionFor(focalFor("Vayne"), anchorFor("left"), box).x).toBe(1);
    // A box the image fits exactly leaves no overflow to distribute.
    expect(objectPositionFor(focalFor("Swain"), anchorFor("left"), { width: SPLASH_W, height: SPLASH_H })).toEqual({ x: 0.5, y: 0.5 });
    expect(objectPositionFor(focalFor("Swain"), anchorFor("left"), { width: 0, height: 0 })).toEqual({ x: 0.5, y: 0.5 });
  });

  it("formats object-position", () => {
    expect(toObjectPosition({ x: 0.5, y: 0.25 })).toBe("50.00% 25.00%");
  });
});
