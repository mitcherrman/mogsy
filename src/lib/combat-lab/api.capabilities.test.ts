import { describe, expect, it } from "vitest";
import { normalizeItemsResponse, normalizeRunesResponse } from "./api";

describe("Combat Lab capability metadata", () => {
  it("preserves partial Gunblade warnings for the item selector", () => {
    const [item] = normalizeItemsResponse({
      items: [{
        item_name: "Hextech Gunblade",
        item_type: "Legendary",
        cost: 3000,
        simulation_warnings: ["Target range is not verified."],
      }],
    });
    expect(item).toMatchObject({
      name: "Hextech Gunblade",
      gold: 3000,
      simulation_warnings: ["Target range is not verified."],
    });
  });

  it("normalizes only executable runes supplied by the backend", () => {
    const runes = normalizeRunesResponse({
      runes: [
        { rune_name: "Electrocute", tree_name: "Domination" },
        { rune_name: "Conqueror", tree_name: "Precision" },
      ],
      known_unsupported_runes: ["Phase Rush", "Glacial Augment"],
    });
    expect(runes.map((r) => r.name)).toEqual(["Electrocute", "Conqueror"]);
    expect(runes[0].tree).toBe("Domination");
  });

  it("does not present unsupported rune records as a grouped list", () => {
    const runes = normalizeRunesResponse({
      runes: [{ rune_name: "Arcane Comet", tree_name: null }],
      known_unsupported_runes: ["Unsealed Spellbook"],
    });
    expect(runes).toHaveLength(1);
    expect(runes[0].name).toBe("Arcane Comet");
  });
});
