/**
 * Family layout SELECTION (RA7).
 *
 * The selector is the fail-closed boundary of this phase: whatever it returns
 * null for keeps the presentation it has today. So this suite is mostly about
 * refusal — incomplete premises, ambiguous premises, old payloads — and about
 * the two properties that make the decision safe to make at all: it never reads
 * the answer, and it never reads the prompt.
 */
import { describe, expect, it } from "vitest";
import { selectFamilyLayout } from "./familyLayout";
import {
  ITEM_HISTORY_SCENARIO,
  LEGACY_DAMAGE_SCENARIO,
  MAGIC_DAMAGE_SCENARIO,
  PASSIVE_DAMAGE_SCENARIO,
  PHYSICAL_DAMAGE_SCENARIO,
  PURCHASE_HISTORY_SCENARIO,
  SELL_SWAP_SCENARIO,
  STATIC_INVENTORY_SCENARIO,
} from "./familyLayoutFixtures";
import type { QuizQuestion } from "@/lib/quiz/api";

/** Deep-clone a fixture and hand its `assets` block to a mutator. */
function withAssets(
  source: QuizQuestion,
  mutate: (assets: Record<string, any>) => void,
): QuizQuestion {
  const clone = JSON.parse(JSON.stringify(source)) as QuizQuestion;
  mutate((clone.metadata as Record<string, any>).assets);
  return clone;
}

describe("combat family selection", () => {
  it("selects the combat layout for a plain magic-damage premise", () => {
    const layout = selectFamilyLayout(MAGIC_DAMAGE_SCENARIO);
    expect(layout?.kind).toBe("combat");
    if (layout?.kind !== "combat") return;
    expect(layout.attacker.name).toBe("Ahri");
    expect(layout.target.name).toBe("Garen");
    expect(layout.ability?.name).toBe("Charm");
    expect(layout.facts).toEqual({
      damageType: "magic", rawDamage: 500, targetResist: 90,
    });
  });

  it("carries both sides of a stated resistance change", () => {
    const layout = selectFamilyLayout(PHYSICAL_DAMAGE_SCENARIO);
    if (layout?.kind !== "combat") throw new Error("expected combat layout");
    expect(layout.facts.targetResist).toBe(60);
    expect(layout.facts.targetResistAfter).toBe(100);
    expect(layout.targetItems.map((i) => i.name)).toEqual(["Chain Vest"]);
  });

  it("selects combat without an ability when the premise states a passive", () => {
    const layout = selectFamilyLayout(PASSIVE_DAMAGE_SCENARIO);
    if (layout?.kind !== "combat") throw new Error("expected combat layout");
    expect(layout.ability).toBeNull();
    expect(layout.attacker.name).toBe("Jhin");
    expect(layout.target.name).toBe("Ahri");
  });

  it("does not attribute an ability the payload gives to the other side", () => {
    const source = withAssets(MAGIC_DAMAGE_SCENARIO, (assets) => {
      assets.entities.abilities[0].role = "target";
    });
    const layout = selectFamilyLayout(source);
    if (layout?.kind !== "combat") throw new Error("expected combat layout");
    expect(layout.ability).toBeNull();
  });

  it("does not attribute an ability owned by a different champion", () => {
    const source = withAssets(MAGIC_DAMAGE_SCENARIO, (assets) => {
      assets.entities.abilities[0].champion = "Garen";
    });
    const layout = selectFamilyLayout(source);
    if (layout?.kind !== "combat") throw new Error("expected combat layout");
    expect(layout.ability).toBeNull();
  });
});

describe("combat family refusal", () => {
  it("falls back when the payload predates premise facts", () => {
    expect(selectFamilyLayout(LEGACY_DAMAGE_SCENARIO)).toBeNull();
  });

  it("falls back when the attacker is missing", () => {
    const source = withAssets(MAGIC_DAMAGE_SCENARIO, (assets) => {
      assets.entities.champions = assets.entities.champions.filter(
        (c: any) => c.role !== "attacker",
      );
    });
    expect(selectFamilyLayout(source)).toBeNull();
  });

  it("falls back when the target is missing", () => {
    const source = withAssets(MAGIC_DAMAGE_SCENARIO, (assets) => {
      assets.entities.champions = assets.entities.champions.filter(
        (c: any) => c.role !== "target",
      );
    });
    expect(selectFamilyLayout(source)).toBeNull();
  });

  it("falls back when a side is ambiguous", () => {
    const source = withAssets(MAGIC_DAMAGE_SCENARIO, (assets) => {
      assets.entities.champions.push({
        ...assets.entities.champions[1], id: "Ornn", name: "Ornn",
      });
    });
    expect(selectFamilyLayout(source)).toBeNull();
  });

  it("falls back when the defensive value is missing", () => {
    const source = withAssets(MAGIC_DAMAGE_SCENARIO, (assets) => {
      delete assets.premise_facts.target_resist;
    });
    expect(selectFamilyLayout(source)).toBeNull();
  });

  it("falls back when the raw damage is missing", () => {
    const source = withAssets(MAGIC_DAMAGE_SCENARIO, (assets) => {
      delete assets.premise_facts.raw_damage;
    });
    expect(selectFamilyLayout(source)).toBeNull();
  });

  it("falls back when the damage type is missing or unknown", () => {
    for (const damage_type of [undefined, "true", "", 7]) {
      const source = withAssets(MAGIC_DAMAGE_SCENARIO, (assets) => {
        assets.premise_facts.damage_type = damage_type;
      });
      expect(selectFamilyLayout(source)).toBeNull();
    }
  });

  it("falls back for a non-finite quantity rather than rendering NaN", () => {
    const source = withAssets(MAGIC_DAMAGE_SCENARIO, (assets) => {
      assets.premise_facts.raw_damage = "500";
    });
    expect(selectFamilyLayout(source)).toBeNull();
  });
});

describe("lifecycle family selection", () => {
  it("groups a sell-swap into kept, bought and sold", () => {
    const layout = selectFamilyLayout(SELL_SWAP_SCENARIO);
    if (layout?.kind !== "lifecycle") throw new Error("expected lifecycle layout");
    expect(layout.champion?.name).toBe("Ornn");
    expect(layout.groups.map((g) => g.status)).toEqual([
      "retained", "purchased", "sold",
    ]);
    expect(layout.groups.map((g) => g.entries.map((e) => e.item.name))).toEqual([
      ["Sunfire Aegis"], ["Abyssal Mask"], ["Doran's Shield"],
    ]);
  });

  it("groups a purchase history into starting and bought, preserving order", () => {
    const layout = selectFamilyLayout(PURCHASE_HISTORY_SCENARIO);
    if (layout?.kind !== "lifecycle") throw new Error("expected lifecycle layout");
    expect(layout.groups.map((g) => g.status)).toEqual(["starting", "purchased"]);
    expect(layout.groups[0].entries.map((e) => e.item.name)).toEqual([
      "Doran's Blade", "Health Potion",
    ]);
    expect(layout.groups[1].entries.map((e) => e.item.name)).toEqual([
      "Phage", "Kindlegem",
    ]);
  });

  it("is deterministic: stage order never depends on payload order", () => {
    const reversed = withAssets(PURCHASE_HISTORY_SCENARIO, (assets) => {
      assets.entities.items.reverse();
    });
    const layout = selectFamilyLayout(reversed);
    if (layout?.kind !== "lifecycle") throw new Error("expected lifecycle layout");
    expect(layout.groups.map((g) => g.status)).toEqual(["starting", "purchased"]);
  });

  it("collapses one item's history onto a single entry in its final stage", () => {
    const layout = selectFamilyLayout(ITEM_HISTORY_SCENARIO);
    if (layout?.kind !== "lifecycle") throw new Error("expected lifecycle layout");
    const all = layout.groups.flatMap((g) => g.entries);
    expect(all.filter((e) => e.item.name === "Doran's Shield")).toHaveLength(1);
    const sold = layout.groups.find((g) => g.status === "sold")!;
    expect(sold.entries[0].statuses).toEqual(["starting", "sold"]);
    expect(layout.groups.find((g) => g.status === "starting")).toBeUndefined();
  });
});

describe("lifecycle family refusal", () => {
  it("falls back for a static inventory with no stated transaction", () => {
    expect(selectFamilyLayout(STATIC_INVENTORY_SCENARIO)).toBeNull();
  });

  it("falls back when any item states no stage", () => {
    const source = withAssets(SELL_SWAP_SCENARIO, (assets) => {
      delete assets.entities.items[0].status;
    });
    expect(selectFamilyLayout(source)).toBeNull();
  });

  it("falls back when an item's stage is not one this build understands", () => {
    const source = withAssets(SELL_SWAP_SCENARIO, (assets) => {
      assets.entities.items[0].status = "pawned";
    });
    // The entity reader drops an unrecognised status, so the item arrives with
    // none — which is the same refusal as above, reached honestly.
    expect(selectFamilyLayout(source)).toBeNull();
  });

  it("never redraws a two-sided premise as a transaction", () => {
    // A damage payload with no facts still has target items with statuses; it
    // must fall back rather than become a shopping timeline.
    const source = withAssets(PHYSICAL_DAMAGE_SCENARIO, (assets) => {
      delete assets.premise_facts;
    });
    expect(selectFamilyLayout(source)).toBeNull();
  });
});

describe("selection is independent of everything unsafe", () => {
  it("returns null for absent, empty and entity-less payloads", () => {
    expect(selectFamilyLayout(null)).toBeNull();
    expect(selectFamilyLayout(undefined)).toBeNull();
    expect(selectFamilyLayout({
      id: "x", category: "", question_text: "", format: "multiple_choice",
      choices: [], metadata: {},
    } as QuizQuestion)).toBeNull();
  });

  it("ignores the prompt text entirely", () => {
    const mute = { ...MAGIC_DAMAGE_SCENARIO, question_text: "" };
    expect(selectFamilyLayout(mute)).toEqual(selectFamilyLayout(MAGIC_DAMAGE_SCENARIO));
  });

  it("ignores the category string entirely", () => {
    const recategorised = { ...SELL_SWAP_SCENARIO, category: "champions" };
    expect(selectFamilyLayout(recategorised))
      .toEqual(selectFamilyLayout(SELL_SWAP_SCENARIO));
  });

  it("ignores the options and their order", () => {
    const shuffled = {
      ...MAGIC_DAMAGE_SCENARIO,
      choices: [...(MAGIC_DAMAGE_SCENARIO.choices ?? [])].reverse(),
    };
    expect(selectFamilyLayout(shuffled)).toEqual(selectFamilyLayout(MAGIC_DAMAGE_SCENARIO));
  });
});
