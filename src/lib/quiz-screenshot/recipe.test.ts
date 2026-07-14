import { describe, expect, it } from "vitest";
import { deriveRecipe } from "./recipe";
import type { RenderQuestion } from "./types";

// Mirrors real backend metadata for question 117295.
const buildQuestion = (metaOverrides: Record<string, unknown> = {}): RenderQuestion => ({
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
      { name: "Blasting Wand", item_id: 221026, icon: "assets/items/221026.png" },
      { name: "Kindlegem", item_id: 223067, icon: "assets/items/223067.png" },
      { name: "Sheen", item_id: 223057, icon: "assets/items/223057.png" },
    ],
    missing_component_item_id: 1042,
    missing_component_item_name: "Dagger",
    missing_component_icon: "assets/items/1042.png",
    ...metaOverrides,
  },
});

describe("deriveRecipe — selection", () => {
  it("derives the recipe for a real item_build_path question", () => {
    const r = deriveRecipe(buildQuestion(), false);
    expect(r).not.toBeNull();
    expect(r!.itemName).toBe("Dusk and Dawn");
    expect(r!.itemIcon).toBe("assets/items/222510.png");
    expect(r!.components.map((c) => c.name)).toEqual(["Blasting Wand", "Kindlegem", "Sheen"]);
  });

  it("returns null for non-build questions (item-stat, no metadata, wrong types)", () => {
    expect(deriveRecipe(buildQuestion({ question_type: "item_stats" }), false)).toBeNull();
    expect(deriveRecipe(buildQuestion({ recipe_type: "components_list" }), false)).toBeNull();
    expect(
      deriveRecipe({ ...buildQuestion(), metadata: undefined }, false),
    ).toBeNull();
  });
});

describe("deriveRecipe — question-state leakage guard", () => {
  it("question state has a nameless, iconless missing slot", () => {
    const r = deriveRecipe(buildQuestion(), false);
    expect(r!.missing).toBeNull();
    const json = JSON.stringify(r);
    expect(json).not.toContain("Dagger");
    expect(json).not.toContain("1042");
  });
});

describe("deriveRecipe — reveal state", () => {
  it("fills the missing component when revealed", () => {
    const r = deriveRecipe(buildQuestion(), true);
    expect(r!.missing).toEqual({ name: "Dagger", icon: "assets/items/1042.png" });
  });

  it("falls back to null when reveal data is absent in reveal state", () => {
    expect(
      deriveRecipe(buildQuestion({ missing_component_icon: undefined }), true),
    ).toBeNull();
    expect(
      deriveRecipe(buildQuestion({ missing_component_item_name: "  " }), true),
    ).toBeNull();
  });
});

describe("deriveRecipe — malformed data fallback", () => {
  it("rejects empty or malformed component lists", () => {
    expect(deriveRecipe(buildQuestion({ known_component_icons: [] }), false)).toBeNull();
    expect(deriveRecipe(buildQuestion({ known_component_icons: "nope" }), false)).toBeNull();
    expect(
      deriveRecipe(buildQuestion({ known_component_icons: [{ name: "X" }] }), false),
    ).toBeNull();
    expect(
      deriveRecipe(buildQuestion({ known_component_icons: [null] }), false),
    ).toBeNull();
  });

  it("rejects missing item name/icon", () => {
    expect(deriveRecipe(buildQuestion({ item_name: "" }), false)).toBeNull();
    const q = buildQuestion({ asset_path: undefined });
    q.image_path = undefined;
    expect(deriveRecipe(q, false)).toBeNull();
  });

  it("uses question.image_path as icon fallback when asset_path is absent", () => {
    const r = deriveRecipe(buildQuestion({ asset_path: undefined }), false);
    expect(r!.itemIcon).toBe("assets/items/222510.png");
  });
});
