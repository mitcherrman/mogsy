import { describe, expect, it } from "vitest";
import { capabilityBadge, normalizeItemsResponse, normalizeRunesResponse } from "./api";

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

describe("universal ranked roster capability (2026-10-20)", () => {
  it("passes item capability, id and exclusivity through to the selector", () => {
    const [item] = normalizeItemsResponse({
      items: [{
        item_name: "Black Spear",
        item_id: 3599,
        item_type: "starter",
        cost: null,
        capability: "noncombat",
        capability_label: "No combat effect in this simulator",
        champion_exclusive: ["Kalista", "Sylas"],
        simulation_warnings: ["Oathsworn Bond has no combat effect here."],
      }],
    });
    expect(item).toMatchObject({
      name: "Black Spear",
      item_id: 3599,
      capability: "noncombat",
      champion_exclusive: ["Kalista", "Sylas"],
    });
  });

  it("passes rune capability and warnings through", () => {
    const [rune] = normalizeRunesResponse({
      runes: [{
        rune_name: "Glacial Augment",
        rune_key: "GLACIAL_AUGMENT",
        tree_name: "Inspiration",
        rune_type: "keystone",
        capability: "not_implemented",
        simulation_warnings: ["Not simulated: the icy-zone slow is not applied."],
      }],
    });
    expect(rune).toMatchObject({
      name: "Glacial Augment",
      tree: "Inspiration",
      capability: "not_implemented",
      simulation_warnings: ["Not simulated: the icy-zone slow is not applied."],
    });
  });

  it("badges everything that is not fully modeled, and nothing else", () => {
    expect(capabilityBadge("fully_modeled")).toBeNull();
    expect(capabilityBadge(undefined)).toBeNull();
    expect(capabilityBadge("partially_modeled")).toBe("Partial");
    expect(capabilityBadge("not_implemented")).toBe("Not simulated");
    expect(capabilityBadge("noncombat")).toBe("No combat effect");
  });
});
