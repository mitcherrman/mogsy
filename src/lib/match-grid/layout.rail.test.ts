// MG-P3.1 — the ledger's RAIL arrangement: full-size targets, nothing scaled.
import { describe, expect, it } from "vitest";
import { compositionFor, computeLayout, minConstellationPitch, RAIL } from "./layout";

describe("rail geometry", () => {
  for (const k of [2, 3, 4, 5, 6]) {
    it(`${k} seals: 48px seals, 44px sigils, rows never overlap`, () => {
      const l = computeLayout({ width: RAIL.columnW, height: RAIL.rowH * k, groupCount: k, tier: "compact", rail: true });
      expect(l.composition).toBe("ledger");
      expect(l.sigil).toBeGreaterThanOrEqual(44);
      for (const s of l.seals) expect(2 * s.r).toBeGreaterThanOrEqual(44);
      for (let g = 1; g < k; g++) {
        // Seal discs and sigils of neighbouring rows keep a gap.
        expect(l.seals[g].y - l.seals[g - 1].y).toBeGreaterThanOrEqual(2 * l.seals[g].r + 4);
        expect(l.seals[g].y - l.seals[g - 1].y).toBeGreaterThanOrEqual(l.sigil + 4);
      }
    });
  }

  it("three seats per wire fit the wires' column, a caption apart, clear of the seal and its name", () => {
    const l = computeLayout({ width: RAIL.columnW, height: RAIL.rowH * 5, groupCount: 5, tier: "compact", rail: true });
    const seats = [0, 1, 2].map((i) => l.seat(0, i));
    expect(seats.every((p) => p.y === l.seals[0].y)).toBe(true);
    expect(seats[1].x - seats[0].x).toBeGreaterThanOrEqual(58);
    expect(seats[0].x - l.sigil / 2).toBeGreaterThan(l.seals[0].x + l.seals[0].r + 80);
    expect(seats[2].x + l.sigil / 2).toBeLessThanOrEqual(RAIL.columnW);
  });

  it("fits the real arena stage width (584px at 1280–1366 desktop)", () => {
    expect(RAIL.minWidth).toBeLessThanOrEqual(584);
  });

  it("is never chosen by the composition rule itself (only a host height budget selects it)", () => {
    expect(compositionFor(584, 5, "compact")).toBe("ledger");
    expect(compositionFor(685, 3, "compact")).toBe("constellation");
    expect(minConstellationPitch("compact")).toBeGreaterThan(584 / 4);
  });
});
