/**
 * MasteryStatePanel — G4 progression display (inventory icons, gold, ranks,
 * target resistances) is gated so the Ahri chain (no progression fields) is
 * unchanged. Champion-icon fetch fails gracefully to a text badge in tests.
 */
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MasteryStatePanel } from "./MasteryStatePanel";
import { readStateView } from "../contracts/stateView";

const RECALL_STATE = {
  snapshot_id: "snap_recall",
  patch_key_digest: "patchkey_x",
  validation_status: "certified",
  label: "First recall — 900 gold",
  champion_a: {
    champion_id: "syndra",
    display_name: "Syndra",
    current_health: 710.5,
    max_health: null,
    resource_type: "mana",
    current_resource: 539,
    max_resource: null,
    active_effects: [],
    inventory_summary: ["Blasting Wand"],
    level: 3,
    ability_ranks: { Q: 2, E: 1 },
    ability_power: 45,
    gold: 900,
    armor: null,
    magic_resist: null,
    archetype: null,
    inventory_items: [{ name: "Blasting Wand", item_id: 1026 }],
  },
  champion_b: {
    champion_id: "target_standard_mage",
    display_name: "Standard level-6 mage target",
    current_health: 950,
    max_health: null,
    resource_type: null,
    current_resource: null,
    max_resource: null,
    active_effects: [],
    inventory_summary: [],
    level: 6,
    ability_ranks: {},
    ability_power: null,
    gold: null,
    armor: 30,
    magic_resist: 32,
    archetype: "mage",
    inventory_items: [],
  },
};

// An Ahri-style state omits all progression fields.
const AHRI_STATE = {
  snapshot_id: "snap_ahri",
  patch_key_digest: "patchkey_x",
  validation_status: "certified",
  label: "Initial state",
  champion_a: {
    champion_id: "ahri", display_name: "Ahri", current_health: 590, max_health: null,
    resource_type: "mana", current_resource: 400, max_resource: null,
    active_effects: [], inventory_summary: [],
  },
  champion_b: {
    champion_id: "syndra", display_name: "Syndra", current_health: 480, max_health: null,
    resource_type: "mana", current_resource: 400, max_resource: null,
    active_effects: [], inventory_summary: [],
  },
};

describe("MasteryStatePanel progression display", () => {
  afterEach(() => cleanup());

  it("parses additive fields and renders inventory, gold, ranks, and target resistances", () => {
    const view = readStateView(RECALL_STATE);
    expect(view.championA.gold).toBe(900);
    expect(view.championA.inventoryItems[0]).toEqual({ name: "Blasting Wand", itemId: 1026 });
    expect(view.championB.magicResist).toBe(32);

    render(<MasteryStatePanel state={view} />);
    expect(screen.getByTestId("mastery-progression-syndra")).toBeTruthy();
    expect(screen.getByTestId("mastery-gold-syndra").textContent).toContain("900");
    expect(screen.getByTestId("mastery-ranks-syndra").textContent).toContain("Q2");
    expect(screen.getByTestId("mastery-inventory-syndra").textContent).toContain("Blasting Wand");
    // target archetype/resistances render on champion_b's progression block
    expect(screen.getByTestId("mastery-progression-target_standard_mage").textContent).toContain("32");
    // With no assets provider the pure context resolver returns null, so the
    // shared portrait renders its text-badge fallback (never a broken image).
    expect(screen.getByTestId("mastery-portrait-fallback-syndra")).toBeTruthy();
  });

  it("does not render a progression block for a set without progression fields", () => {
    const view = readStateView(AHRI_STATE);
    render(<MasteryStatePanel state={view} />);
    expect(screen.queryByTestId("mastery-progression-ahri")).toBeNull();
    expect(screen.queryByTestId("mastery-progression-syndra")).toBeNull();
  });
});
