/**
 * Item-build recipe derivation for content screenshots — normalized across
 * the whole item-build question family:
 *
 *  mode                     source metadata shape                        visual
 *  ───────────────────────  ───────────────────────────────────────────  ─────────────────────────────
 *  missing_component        question_type=item_build_path,               [final]
 *                           recipe_type=missing_component,               [c1] + [c2] + [c3] + [?]
 *                           known_component_icons, missing_component_*
 *  components_of_item       item_id/item_name +                          [completed item]
 *                           component_item_id/component_item_name        [?]        (bare slot)
 *  builds_into              component_item_* + parent_item_*             [source] → [?]
 *  final_from_components    question_type=item_final_from_components,    [c1] + [c2] → [?]
 *                           recipe_components, final_item_*
 *
 * The `?` slot fills with the correct item/component on reveal.
 *
 * LEAKAGE GUARD: the spoiler fields (missing_component_*, component_item_name
 * in components_of_item, parent_item_*, final_item_*) identify the correct
 * answer. They are read internally ONLY to validate that the metadata agrees
 * with the question's actual correct choice (fail-closed against
 * miscategorized data), and are never emitted into the derived model before
 * reveal — the question-state output carries no spoiler name, id, or icon.
 *
 * Derivation is conservative: any missing/malformed/contradictory field →
 * null → the caller falls back to the plain item-icon layout.
 *
 * Pure module — unit-testable, no DOM.
 */
import type { RenderQuestion } from "./types";

export type RecipeTile = { name: string; icon: string | null };

export type RecipeMode =
  | "missing_component"
  | "components_of_item"
  | "builds_into"
  | "final_from_components";

export type RecipeVisualData = {
  mode: RecipeMode;
  /** Optional headline item above the relation row (never answer-bearing). */
  header: RecipeTile | null;
  /** Known tiles in the relation row, joined by `+`. */
  row: RecipeTile[];
  /** How the trailing slot attaches to the row: `+`, `→`, or bare. */
  slotJoin: "plus" | "arrow" | "bare";
  /** The revealed correct tile, or null in the question state. */
  missing: RecipeTile | null;
};

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v : undefined;

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

const norm = (s: string) => s.trim().toLowerCase();

/** Standard backend icon path for an item id. */
const itemIcon = (id: number | undefined): string | null =>
  id !== undefined ? `assets/items/${id}.png` : null;

/**
 * The metadata's answer field must agree with the question's actual correct
 * choice — otherwise the metadata is stale/miscategorized and we fall back
 * rather than risk revealing the wrong item.
 */
function matchesCorrectChoice(question: RenderQuestion, answerName: string): boolean {
  const correct = question.choices[question.correct_index];
  return !!correct && norm(correct.label) === norm(answerName);
}

function deriveMissingComponent(
  question: RenderQuestion,
  meta: Record<string, unknown>,
  revealed: boolean,
): RecipeVisualData | null {
  const itemName = str(meta.item_name);
  const icon = str(meta.asset_path) ?? str(question.image_path);
  if (!itemName || !icon) return null;

  const rawComponents = meta.known_component_icons;
  if (!Array.isArray(rawComponents) || rawComponents.length === 0) return null;
  const iconByName = new Map<string, string>();
  for (const c of rawComponents) {
    if (!c || typeof c !== "object") return null;
    const name = str((c as Record<string, unknown>).name);
    const cIcon = str((c as Record<string, unknown>).icon);
    if (!name || !cIcon) return null;
    iconByName.set(name, cIcon);
  }
  // known_components carries recipe MULTIPLICITY (e.g. Navori's 2x Dagger —
  // the same name appears once per copy) while the icon list is deduped by
  // name. Build the row from the multiset so duplicate components render as
  // duplicate tiles; fall back to icon-list order for legacy metadata
  // without a known_components field.
  const knownNames = Array.isArray(meta.known_components)
    ? meta.known_components.filter((n): n is string => typeof n === "string")
    : [];
  const row: RecipeTile[] = [];
  if (knownNames.length > 0) {
    for (const name of knownNames) {
      const cIcon = iconByName.get(name);
      if (!cIcon) return null;
      row.push({ name, icon: cIcon });
    }
  } else {
    for (const [name, cIcon] of iconByName) row.push({ name, icon: cIcon });
  }

  const answerName = str(meta.missing_component_item_name);
  const answerIcon = str(meta.missing_component_icon);
  if (!answerName || !answerIcon) return null;
  if (!matchesCorrectChoice(question, answerName)) return null;

  return {
    mode: "missing_component",
    header: { name: itemName, icon },
    row,
    slotJoin: "plus",
    missing: revealed ? { name: answerName, icon: answerIcon } : null,
  };
}

function deriveComponentsOfItem(
  question: RenderQuestion,
  meta: Record<string, unknown>,
  revealed: boolean,
): RecipeVisualData | null {
  const itemName = str(meta.item_name);
  const icon = str(meta.asset_path) ?? itemIcon(num(meta.item_id)) ?? str(question.image_path);
  if (!itemName || !icon) return null;

  const answerName = str(meta.component_item_name);
  const answerId = num(meta.component_item_id);
  if (!answerName || answerId === undefined) return null;
  if (!matchesCorrectChoice(question, answerName)) return null;

  return {
    mode: "components_of_item",
    header: { name: itemName, icon },
    row: [],
    slotJoin: "bare",
    // Prefer the explicit wiki-backed icon shipped in metadata; the id
    // convention path is a legacy fallback only.
    missing: revealed
      ? { name: answerName, icon: str(meta.component_item_icon) ?? itemIcon(answerId) }
      : null,
  };
}

function deriveBuildsInto(
  question: RenderQuestion,
  meta: Record<string, unknown>,
  revealed: boolean,
): RecipeVisualData | null {
  const sourceName = str(meta.component_item_name);
  const sourceIcon =
    str(meta.asset_path) ?? itemIcon(num(meta.component_item_id)) ?? str(question.image_path);
  if (!sourceName || !sourceIcon) return null;

  const answerName = str(meta.parent_item_name);
  const answerId = num(meta.parent_item_id);
  if (!answerName || answerId === undefined) return null;
  if (!matchesCorrectChoice(question, answerName)) return null;

  return {
    mode: "builds_into",
    header: null,
    row: [{ name: sourceName, icon: sourceIcon }],
    slotJoin: "arrow",
    missing: revealed
      ? { name: answerName, icon: str(meta.parent_item_icon) ?? itemIcon(answerId) }
      : null,
  };
}

function deriveFinalFromComponents(
  question: RenderQuestion,
  meta: Record<string, unknown>,
  revealed: boolean,
): RecipeVisualData | null {
  const names = meta.recipe_components;
  if (!Array.isArray(names) || names.length === 0) return null;

  // Only the question subject carries an icon; other components render as
  // name-only tiles rather than fabricating icon paths from names.
  const assets = meta.assets as Record<string, unknown> | undefined;
  const subject = assets?.subject as Record<string, unknown> | undefined;
  const subjectName = str(subject?.name);
  const subjectIcon = str(subject?.icon) ?? str(meta.asset_path);

  // Explicit wiki-backed per-component icons (duplicates preserved by list
  // order); legacy metadata without them falls back to subject-icon-only.
  const iconEntries = Array.isArray(meta.recipe_component_icons)
    ? (meta.recipe_component_icons as unknown[])
    : [];
  const iconByName = new Map<string, string>();
  for (const entry of iconEntries) {
    if (!entry || typeof entry !== "object") continue;
    const name = str((entry as Record<string, unknown>).name);
    const icon = str((entry as Record<string, unknown>).icon);
    if (name && icon) iconByName.set(norm(name), icon);
  }

  const row: RecipeTile[] = [];
  for (const n of names) {
    const name = str(n);
    if (!name) return null;
    const isSubject = subjectName !== undefined && norm(name) === norm(subjectName);
    const icon = iconByName.get(norm(name)) ?? (isSubject ? subjectIcon ?? null : null);
    row.push({ name, icon });
  }

  const answerName = str(meta.final_item_name);
  const answerId = num(meta.final_item_id);
  if (!answerName || answerId === undefined) return null;
  if (!matchesCorrectChoice(question, answerName)) return null;

  return {
    mode: "final_from_components",
    header: null,
    row,
    slotJoin: "arrow",
    missing: revealed
      ? { name: answerName, icon: str(meta.final_item_icon) ?? itemIcon(answerId) }
      : null,
  };
}

/**
 * Derive the recipe visual for an item-build-family question, or null when
 * the question is not recipe-shaped (caller then uses the default layout).
 */
export function deriveRecipe(
  question: RenderQuestion,
  revealed: boolean,
): RecipeVisualData | null {
  const meta = question.metadata;
  if (!meta) return null;
  const invalid = question.correct_index < 0 || question.correct_index >= question.choices.length;
  if (invalid) return null;

  if (meta.question_type === "item_build_path" && meta.recipe_type === "missing_component") {
    return deriveMissingComponent(question, meta, revealed);
  }
  if (
    meta.question_type === "item_final_from_components" &&
    meta.recipe_type === "final_from_components"
  ) {
    return deriveFinalFromComponents(question, meta, revealed);
  }
  if (meta.question_type !== undefined) return null;

  // Untyped legacy shapes, distinguished by their key sets:
  //   builds_into:        component_item_* + parent_item_* (no item_name)
  //   components_of_item: item_* + component_item_* (no parent_item_*)
  const hasParent = meta.parent_item_name !== undefined || meta.parent_item_id !== undefined;
  const hasComponent =
    meta.component_item_name !== undefined || meta.component_item_id !== undefined;
  const hasItem = meta.item_name !== undefined || meta.item_id !== undefined;

  if (hasParent && hasComponent && !hasItem) {
    return deriveBuildsInto(question, meta, revealed);
  }
  if (hasItem && hasComponent && !hasParent) {
    return deriveComponentsOfItem(question, meta, revealed);
  }
  return null;
}
