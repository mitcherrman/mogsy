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

// A Jarvan-style PHYSICAL state carries the attack-damage model + target armor.
const JARVAN_STATE = {
  snapshot_id: "snap_jarvan_l6",
  patch_key_digest: "patchkey_x",
  validation_status: "certified",
  label: "Level 6 — Cataclysm vs a standard bruiser",
  champion_a: {
    champion_id: "jarvan",
    display_name: "Jarvan IV",
    current_health: 1160,
    max_health: null,
    resource_type: "mana",
    current_resource: 500,
    max_resource: null,
    active_effects: [],
    inventory_summary: ["Pickaxe"],
    level: 6,
    ability_ranks: { Q: 3, R: 1 },
    ability_power: null,
    base_attack_damage: 75.85,
    bonus_attack_damage: 25,
    total_attack_damage: 100.85,
    gold: 25,
    armor: null,
    magic_resist: null,
    archetype: null,
    inventory_items: [{ name: "Pickaxe", item_id: 1037 }],
  },
  champion_b: {
    champion_id: "target_standard_bruiser",
    display_name: "Standard level-6 bruiser target",
    current_health: 1200,
    max_health: null,
    resource_type: null,
    current_resource: null,
    max_resource: null,
    active_effects: [],
    inventory_summary: [],
    level: 6,
    ability_ranks: {},
    ability_power: null,
    base_attack_damage: null,
    bonus_attack_damage: null,
    total_attack_damage: null,
    gold: null,
    armor: 55,
    magic_resist: 40,
    archetype: "bruiser",
    inventory_items: [],
  },
};

// A Maokai-style state: a DAMAGED standardized target with a certified maximum
// health, so current/maximum/missing health are all displayable.
const MAOKAI_STATE = {
  snapshot_id: "snap_maokai_l6",
  patch_key_digest: "patchkey_x",
  validation_status: "certified",
  label: "Level 6 — after the hit resolves",
  champion_a: {
    champion_id: "maokai",
    display_name: "Maokai",
    current_health: 1210,
    max_health: null,
    resource_type: "mana",
    current_resource: 590,
    max_resource: null,
    active_effects: [],
    inventory_summary: ["Blasting Wand"],
    level: 6,
    ability_ranks: { Q: 3, R: 1 },
    ability_power: 45,
    base_attack_damage: null,
    bonus_attack_damage: null,
    total_attack_damage: null,
    gold: 50,
    armor: null,
    magic_resist: null,
    archetype: null,
    inventory_items: [{ name: "Blasting Wand", item_id: 1026 }],
  },
  champion_b: {
    champion_id: "target_standard_tank",
    display_name: "Standard level-6 tank target",
    current_health: 1202.76,
    max_health: 1350,
    resource_type: null,
    current_resource: null,
    max_resource: null,
    active_effects: [],
    inventory_summary: [],
    level: 6,
    ability_ranks: {},
    ability_power: null,
    base_attack_damage: null,
    bonus_attack_damage: null,
    total_attack_damage: null,
    gold: null,
    armor: 75,
    magic_resist: 45,
    archetype: "tank",
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

  it("renders the physical attack-damage model (base/bonus/total) and target armor", () => {
    const view = readStateView(JARVAN_STATE);
    expect(view.championA.baseAttackDamage).toBe(75.85);
    expect(view.championA.bonusAttackDamage).toBe(25);
    expect(view.championA.totalAttackDamage).toBe(100.85);
    expect(view.championA.abilityPower).toBeNull();
    expect(view.championB.armor).toBe(55);

    render(<MasteryStatePanel state={view} />);
    const ad = screen.getByTestId("mastery-ad-jarvan");
    // total AD rounded, with the base+bonus breakdown.
    expect(ad.textContent).toContain("101");
    expect(ad.textContent).toContain("76");
    expect(ad.textContent).toContain("25");
    // no AP stat for a physical-only champion.
    expect(screen.getByTestId("mastery-progression-jarvan").textContent).not.toContain("AP");
    // target armor renders on champion_b's block.
    expect(screen.getByTestId("mastery-progression-target_standard_bruiser").textContent).toContain("55");
  });

  it("renders target current/maximum/missing health for a health-scaling set", () => {
    const view = readStateView(MAOKAI_STATE);
    expect(view.championB.currentHealth).toBe(1202.76);
    expect(view.championB.maxHealth).toBe(1350);

    render(<MasteryStatePanel state={view} />);
    // current / maximum health both visible on the target's HP readout
    const hp = screen.getByTestId("mastery-hp-target_standard_tank");
    expect(hp.textContent).toContain("1202.76");
    expect(hp.textContent).toContain("1350");
    // missing health (value + percentage) is surfaced
    const missing = screen.getByTestId("mastery-missing-hp-target_standard_tank");
    expect(missing.textContent).toContain("147"); // 1350 - 1202.76
    expect(missing.textContent).toContain("11%"); // ~10.9% missing
    // a full-health champion shows no missing-HP readout
    expect(screen.queryByTestId("mastery-missing-hp-maokai")).toBeNull();
    // magic champion keeps AP and shows no AD stat
    expect(screen.queryByTestId("mastery-ad-maokai")).toBeNull();
  });

  it("does not render a progression block for a set without progression fields", () => {
    const view = readStateView(AHRI_STATE);
    render(<MasteryStatePanel state={view} />);
    expect(screen.queryByTestId("mastery-progression-ahri")).toBeNull();
    expect(screen.queryByTestId("mastery-progression-syndra")).toBeNull();
  });
});

describe("ability haste (J3 cooldown sets)", () => {
  function stateWith(abilityHaste: number | null, inventory: string[] = []) {
    return JSON.parse(JSON.stringify({
      ...RECALL_STATE,
      champion_a: {
        ...RECALL_STATE.champion_a,
        champion_id: "lux",
        display_name: "Lux",
        ability_haste: abilityHaste,
        inventory_summary: inventory,
        inventory_items: inventory.map((n) => ({ name: n, item_id: 3108 })),
      },
    }));
  }

  it("shows Haste when a set grants ability haste", () => {
    render(<MasteryStatePanel state={readStateView(stateWith(10, ["Fiendish Codex"]))} heading="After" />);
    const badge = screen.getByTestId("mastery-haste-lux");
    expect(badge).toHaveTextContent("Haste");
    expect(badge).toHaveTextContent("10");
  });

  it("hides Haste before any haste item is bought", () => {
    render(<MasteryStatePanel state={readStateView(stateWith(0))} heading="Before" />);
    expect(screen.queryByTestId("mastery-haste-lux")).toBeNull();
  });

  it("hides Haste for sets that never expose it", () => {
    render(<MasteryStatePanel state={readStateView(stateWith(null))} heading="Before" />);
    expect(screen.queryByTestId("mastery-haste-lux")).toBeNull();
  });
});
