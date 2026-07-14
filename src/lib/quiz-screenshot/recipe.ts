/**
 * Item-build recipe derivation for content screenshots.
 *
 * Backend item_build_path questions carry structured recipe metadata:
 *   question_type: "item_build_path", recipe_type: "missing_component",
 *   item_name/asset_path (final item), known_component_icons[{name, icon}],
 *   missing_component_item_name / missing_component_icon.
 *
 * LEAKAGE GUARD: missing_component_* identify the correct answer. This module
 * only reads them when `revealed` is true; in the question state the missing
 * slot is a placeholder with no name and no icon. Derivation is conservative:
 * any missing/malformed field → null → the caller falls back to the plain
 * item-icon layout.
 *
 * Pure module — unit-testable, no DOM.
 */
import type { RenderQuestion } from "./types";

export type RecipeIcon = { name: string; icon: string };

export type RecipeVisualData = {
  itemName: string;
  itemIcon: string;
  components: RecipeIcon[];
  /** The revealed missing component, or null in the question state. */
  missing: RecipeIcon | null;
};

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v : undefined;

/**
 * Derive the recipe visual for an item-build question, or null when the
 * question is not recipe-shaped (caller then uses the default layout).
 */
export function deriveRecipe(
  question: RenderQuestion,
  revealed: boolean,
): RecipeVisualData | null {
  const meta = question.metadata;
  if (!meta) return null;
  if (meta.question_type !== "item_build_path") return null;
  if (meta.recipe_type !== "missing_component") return null;

  const itemName = str(meta.item_name);
  const itemIcon = str(meta.asset_path) ?? str(question.image_path);
  if (!itemName || !itemIcon) return null;

  const rawComponents = meta.known_component_icons;
  if (!Array.isArray(rawComponents) || rawComponents.length === 0) return null;
  const components: RecipeIcon[] = [];
  for (const c of rawComponents) {
    if (!c || typeof c !== "object") return null;
    const name = str((c as Record<string, unknown>).name);
    const icon = str((c as Record<string, unknown>).icon);
    if (!name || !icon) return null;
    components.push({ name, icon });
  }

  let missing: RecipeIcon | null = null;
  if (revealed) {
    // Only touched post-reveal: these fields name the correct answer.
    const name = str(meta.missing_component_item_name);
    const icon = str(meta.missing_component_icon);
    if (!name || !icon) return null; // reveal without reveal data → fall back
    missing = { name, icon };
  }

  return { itemName, itemIcon, components, missing };
}
