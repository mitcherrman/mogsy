import { describe, expect, it } from "vitest";
import { deriveRecipe } from "./recipe";
import type { RenderQuestion } from "./types";

// ── Fixtures mirror REAL backend metadata shapes ────────────────────────────

// question 117295 (Item Build Paths / item_build_path)
const buildPathQ = (metaOverrides: Record<string, unknown> = {}): RenderQuestion => ({
  id: 117295,
  question_text:
    "Dusk and Dawn builds from Blasting Wand, Kindlegem, and Sheen. Which component completes the recipe?",
  choices: [
    { label: "Dagger" },
    { label: "Recurve Bow" },
    { label: "Needlessly Large Rod" },
    { label: "Faerie Charm" },
  ],
  correct_index: 0,
  image_path: "assets/items/222510.png",
  metadata: {
    question_type: "item_build_path",
    recipe_type: "missing_component",
    item_name: "Dusk and Dawn",
    asset_path: "assets/items/222510.png",
    known_component_icons: [
      { name: "Blasting Wand", icon: "assets/items/221026.png" },
      { name: "Kindlegem", icon: "assets/items/223067.png" },
      { name: "Sheen", icon: "assets/items/223057.png" },
    ],
    missing_component_item_name: "Dagger",
    missing_component_icon: "assets/items/1042.png",
    ...metaOverrides,
  },
});

// question 112977 (Item Components — untyped)
const componentsQ = (metaOverrides: Record<string, unknown> = {}): RenderQuestion => ({
  id: 112977,
  question_text: "Which item is a component of Aether Wisp?",
  choices: [
    { label: "Bounty of Worlds" },
    { label: "Dark Seal" },
    { label: "Amplifying Tome" },
    { label: "Boots" },
  ],
  correct_index: 2,
  image_path: "assets/items/3113.png",
  metadata: {
    item_id: 3113,
    item_name: "Aether Wisp",
    component_item_id: 1052,
    component_item_name: "Amplifying Tome",
    asset_path: "assets/items/3113.png",
    ...metaOverrides,
  },
});

// question 113119 (Item Builds Into — untyped)
const buildsIntoQ = (metaOverrides: Record<string, unknown> = {}): RenderQuestion => ({
  id: 113119,
  question_text: "What can Aether Wisp build into?",
  choices: [
    { label: "Imperial Mandate" },
    { label: "Vigilant Wardstone" },
    { label: "Last Whisper" },
    { label: "Ardent Censer" },
  ],
  correct_index: 3,
  image_path: "assets/items/3113.png",
  metadata: {
    component_item_id: 3113,
    component_item_name: "Aether Wisp",
    parent_item_id: 323504,
    parent_item_name: "Ardent Censer",
    asset_path: "assets/items/3113.png",
    ...metaOverrides,
  },
});

// question 117150 (item_final_from_components)
const finalFromQ = (metaOverrides: Record<string, unknown> = {}): RenderQuestion => ({
  id: 117150,
  question_text: "What item do Serrated Dirk and The Brutalizer build into?",
  choices: [
    { label: "Shattered Armguard" },
    { label: "Bastionbreaker" },
    { label: "Wit's End" },
    { label: "Guinsoo's Rageblade" },
  ],
  correct_index: 1,
  metadata: {
    question_type: "item_final_from_components",
    recipe_type: "final_from_components",
    final_item_id: 2520,
    final_item_name: "Bastionbreaker",
    recipe_components: ["Serrated Dirk", "The Brutalizer"],
    asset_path: "assets/items/3134.png",
    assets: { subject: { type: "item", id: 3134, name: "Serrated Dirk", icon: "assets/items/3134.png" } },
    ...metaOverrides,
  },
});

// ── missing_component (regression: pre-existing behavior) ───────────────────

describe("deriveRecipe — missing_component (unchanged)", () => {
  it("derives header, plus-joined components, plus-joined slot", () => {
    const r = deriveRecipe(buildPathQ(), false)!;
    expect(r.mode).toBe("missing_component");
    expect(r.header).toEqual({ name: "Dusk and Dawn", icon: "assets/items/222510.png" });
    expect(r.row.map((t) => t.name)).toEqual(["Blasting Wand", "Kindlegem", "Sheen"]);
    expect(r.slotJoin).toBe("plus");
    expect(r.missing).toBeNull();
  });
  it("fills the missing component on reveal", () => {
    const r = deriveRecipe(buildPathQ(), true)!;
    expect(r.missing).toEqual({ name: "Dagger", icon: "assets/items/1042.png" });
  });
  it("question state leaks nothing", () => {
    const json = JSON.stringify(deriveRecipe(buildPathQ(), false));
    expect(json).not.toContain("Dagger");
    expect(json).not.toContain("1042");
  });
  it("falls back when metadata answer contradicts the correct choice", () => {
    expect(deriveRecipe(buildPathQ({ missing_component_item_name: "Recurve Bow" }), true)).toBeNull();
  });
});

// ── components_of_item ──────────────────────────────────────────────────────

describe("deriveRecipe — components_of_item", () => {
  it("maps completed item to the header with a bare slot", () => {
    const r = deriveRecipe(componentsQ(), false)!;
    expect(r.mode).toBe("components_of_item");
    expect(r.header).toEqual({ name: "Aether Wisp", icon: "assets/items/3113.png" });
    expect(r.row).toEqual([]);
    expect(r.slotJoin).toBe("bare");
    expect(r.missing).toBeNull();
  });
  it("question state carries no spoiler name, id, or icon", () => {
    const json = JSON.stringify(deriveRecipe(componentsQ(), false));
    expect(json).not.toContain("Amplifying Tome");
    expect(json).not.toContain("1052");
  });
  it("reveals the component with the id-derived icon", () => {
    const r = deriveRecipe(componentsQ(), true)!;
    expect(r.missing).toEqual({ name: "Amplifying Tome", icon: "assets/items/1052.png" });
  });
  it("fails closed on contradiction or missing fields", () => {
    expect(deriveRecipe(componentsQ({ component_item_name: "Dark Seal" }), false)).toBeNull();
    expect(deriveRecipe(componentsQ({ component_item_id: undefined }), false)).toBeNull();
    expect(deriveRecipe(componentsQ({ item_name: "" }), false)).toBeNull();
  });
});

// ── builds_into ─────────────────────────────────────────────────────────────

describe("deriveRecipe — builds_into", () => {
  it("maps source item into an arrow relation with no header", () => {
    const r = deriveRecipe(buildsIntoQ(), false)!;
    expect(r.mode).toBe("builds_into");
    expect(r.header).toBeNull();
    expect(r.row).toEqual([{ name: "Aether Wisp", icon: "assets/items/3113.png" }]);
    expect(r.slotJoin).toBe("arrow");
    expect(r.missing).toBeNull();
  });
  it("question state carries no spoiler (parent item)", () => {
    const json = JSON.stringify(deriveRecipe(buildsIntoQ(), false));
    expect(json).not.toContain("Ardent Censer");
    expect(json).not.toContain("323504");
  });
  it("reveals the parent item with the id-derived icon", () => {
    const r = deriveRecipe(buildsIntoQ(), true)!;
    expect(r.missing).toEqual({ name: "Ardent Censer", icon: "assets/items/323504.png" });
  });
  it("fails closed on contradiction or missing parent id", () => {
    expect(deriveRecipe(buildsIntoQ({ parent_item_name: "Last Whisper" }), true)).toBeNull();
    expect(deriveRecipe(buildsIntoQ({ parent_item_id: "nope" }), true)).toBeNull();
  });
  it("only one parent relation is ever emitted (the question's own)", () => {
    const r = deriveRecipe(buildsIntoQ(), true)!;
    expect(r.row).toHaveLength(1);
    expect(JSON.stringify(r)).not.toContain("Imperial Mandate");
  });
});

// ── final_from_components ───────────────────────────────────────────────────

describe("deriveRecipe — final_from_components", () => {
  it("maps components (subject gets the icon, others name-only) with an arrow slot", () => {
    const r = deriveRecipe(finalFromQ(), false)!;
    expect(r.mode).toBe("final_from_components");
    expect(r.header).toBeNull();
    expect(r.row).toEqual([
      { name: "Serrated Dirk", icon: "assets/items/3134.png" },
      { name: "The Brutalizer", icon: null },
    ]);
    expect(r.slotJoin).toBe("arrow");
    expect(r.missing).toBeNull();
  });
  it("question state carries no spoiler (final item)", () => {
    const json = JSON.stringify(deriveRecipe(finalFromQ(), false));
    expect(json).not.toContain("Bastionbreaker");
    expect(json).not.toContain("2520");
  });
  it("reveals the final item", () => {
    const r = deriveRecipe(finalFromQ(), true)!;
    expect(r.missing).toEqual({ name: "Bastionbreaker", icon: "assets/items/2520.png" });
  });
  it("fails closed on empty/malformed components or contradiction", () => {
    expect(deriveRecipe(finalFromQ({ recipe_components: [] }), false)).toBeNull();
    expect(deriveRecipe(finalFromQ({ recipe_components: ["ok", 42] }), false)).toBeNull();
    expect(deriveRecipe(finalFromQ({ final_item_name: "Wit's End" }), false)).toBeNull();
  });
});

// ── general fallbacks ───────────────────────────────────────────────────────

describe("deriveRecipe — unsupported shapes fall back", () => {
  it("returns null for item-stat questions (item_* without component_*)", () => {
    const q: RenderQuestion = {
      id: 112035,
      question_text: "What stat does Amplifying Tome give?",
      choices: [{ label: "Lethality" }, { label: "Ability Power" }],
      correct_index: 1,
      metadata: { item_name: "Amplifying Tome", asset_path: "assets/items/1052.png", stats: ["AP"] },
    };
    expect(deriveRecipe(q, false)).toBeNull();
    expect(deriveRecipe(q, true)).toBeNull();
  });
  it("returns null for unknown question_type values and missing metadata", () => {
    expect(deriveRecipe(componentsQ({ question_type: "something_else" }), false)).toBeNull();
    expect(deriveRecipe({ ...componentsQ(), metadata: undefined }, false)).toBeNull();
  });
  it("returns null when the correct_index is out of range", () => {
    expect(deriveRecipe({ ...componentsQ(), correct_index: 9 }, false)).toBeNull();
  });
  it("is deterministic: same input, same output ordering", () => {
    expect(deriveRecipe(finalFromQ(), true)).toEqual(deriveRecipe(finalFromQ(), true));
  });
});
