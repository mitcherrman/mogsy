import { describe, expect, it } from "vitest";

import type { DocAbility } from "./api";
import { rangeAbsenceNote, rangeComponentLabel, rangeRows } from "./range";

/**
 * CHAMPDATA Pass 12. Before this pass these pages rendered exactly one line,
 * `Range: {rankText(ability.range)}`, from a Data Dragon column. Every case
 * below is a real ability whose old rendering was wrong, and each names the
 * string a visitor to /lol/docs/champions/:slug actually used to see.
 */

function ability(partial: Partial<DocAbility>): DocAbility {
  return {
    slot: "R",
    name: null,
    description: null,
    cooldown: null,
    cost: null,
    range: null,
    range_detail: null,
    ranks: null,
    source_id: null,
    formulas: [],
    ...partial,
  } as DocAbility;
}

describe("rangeRows", () => {
  it("renders the four distances Hecarim R actually has, not one 50000", () => {
    // The page used to read "Range: 50000 / 50000 / 50000".
    const rows = rangeRows(ability({
      range: null,
      range_detail: {
        modelled: "components_only",
        targeting: "Location",
        is_global: false,
        cast_range_note: "minimum-maximum band, not a rank ladder",
        components: [
          { type: "CAST_RANGE", value: "300 - 1000", note: "Minimum and maximum dash distance", is_global: false },
          { type: "TRAVEL_RANGE", value: "1510", note: null, is_global: false },
          { type: "EFFECT_RADIUS", value: "315", note: "Fear radius around dash end", is_global: false },
          { type: "WIDTH", value: "80 • 480", note: null, is_global: false },
        ],
        authority: { host: "wiki.leagueoflegends.com", source_url: "u", revision_id: 1 },
      },
    }));
    expect(rows.map((r) => `${r.label}: ${r.text}`)).toEqual([
      "Cast range: 300 - 1000",
      "Travel range: 1510",
      "Effect radius: 315",
      "Width: 80 • 480",
    ]);
    expect(rows[0].note).toBe("Minimum and maximum dash distance");
  });

  it("shows a globally cast ability as Global, never as a large number", () => {
    // The page used to read "Range: 30000 / 30000 / 30000".
    const rows = rangeRows(ability({
      range: null,
      range_detail: {
        modelled: "global",
        targeting: "Location",
        is_global: true,
        cast_range_note: "global",
        components: [
          { type: "CAST_RANGE", value: "Global", note: null, is_global: true },
          { type: "EFFECT_RADIUS", value: "580", note: null, is_global: false },
        ],
        authority: null,
      },
    }));
    expect(rows[0]).toEqual({ label: "Cast range", text: "Global", note: null });
    expect(rows.some((r) => /\d{4,}/.test(r.text))).toBe(false);
  });

  it("prefers the served per-rank ladder over the component string", () => {
    // Zac E: the page used to read "Range: 300" at every rank.
    const rows = rangeRows(ability({
      slot: "E",
      range: { raw: "1200 / 1350 / 1500 / 1650 / 1800", by_rank: [1200, 1350, 1500, 1650, 1800] },
      range_detail: {
        modelled: "cast_range",
        targeting: "Direction",
        is_global: false,
        cast_range_note: "ability progression across ranks",
        components: [
          { type: "CAST_RANGE", value: "1200 / 1350 / 1500 / 1650 / 1800", note: null, is_global: false },
          { type: "EFFECT_RADIUS", value: "265", note: null, is_global: false },
        ],
        authority: null,
      },
    }));
    expect(rows).toEqual([
      { label: "Cast range", text: "1200 / 1350 / 1500 / 1650 / 1800", note: null },
      { label: "Effect radius", text: "265", note: null },
    ]);
  });

  it("renders nothing for an ability with no published range", () => {
    // Master Yi W: the page used to read "Range: 20".
    const a = ability({
      slot: "W",
      range: null,
      range_detail: {
        modelled: "no_range_published", targeting: "Auto", is_global: false,
        cast_range_note: "no cast range published", components: [], authority: null,
      },
    });
    expect(rangeRows(a)).toEqual([]);
    expect(rangeAbsenceNote(a)).toBe("Self-cast — this ability has no range.");
  });

  it("renders nothing when the backend has no range_detail at all", () => {
    // A payload from a deploy that predates Pass 12, or a champion the
    // authority does not carry: show no range rather than inventing one.
    const a = ability({ range: null, range_detail: null });
    expect(rangeRows(a)).toEqual([]);
    expect(rangeAbsenceNote(a)).toBeNull();
  });

  it("does not repeat the machine reason beside a cast range it already shows", () => {
    const a = ability({
      slot: "E",
      range: null,
      range_detail: {
        modelled: "components_only", targeting: "Location", is_global: false,
        cast_range_note: "scales on level",
        components: [{ type: "CAST_RANGE", value: "550 – 700 (based on level)", note: null, is_global: false }],
        authority: null,
      },
    });
    expect(rangeAbsenceNote(a)).toBeNull();
  });

  it("says so when the authority publishes distances but no cast range", () => {
    // Ahri W: the page used to read "Range: 700". Fox-Fire is not aimed.
    const a = ability({
      slot: "W",
      range: null,
      range_detail: {
        modelled: "components_only", targeting: "Auto", is_global: false,
        cast_range_note: "no cast range published",
        components: [{ type: "EFFECT_RADIUS", value: "150 • 550 • 725", note: null, is_global: false }],
        authority: null,
      },
    });
    expect(rangeRows(a)).toEqual([
      { label: "Effect radius", text: "150 • 550 • 725", note: null },
    ]);
    expect(rangeAbsenceNote(a)).toBe("No cast range — this ability is not aimed at a point.");
  });
});

describe("rangeComponentLabel", () => {
  it("names every type the backend vocabulary defines", () => {
    for (const [type, label] of [
      ["CAST_RANGE", "Cast range"],
      ["TRAVEL_RANGE", "Travel range"],
      ["EFFECT_RADIUS", "Effect radius"],
      ["INNER_RADIUS", "Inner radius"],
      ["COLLISION_RADIUS", "Collision radius"],
      ["TETHER_RADIUS", "Tether radius"],
      ["DETECTION_RADIUS", "Detection radius"],
      ["WIDTH", "Width"],
      ["ATTACK_RANGE_MODIFIER", "Attack range"],
    ] as const) {
      expect(rangeComponentLabel(type)).toBe(label);
    }
  });

  it("degrades a type it has never seen into readable text rather than throwing", () => {
    expect(rangeComponentLabel("SOME_NEW_RADIUS")).toBe("some new radius");
  });
});
