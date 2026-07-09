/**
 * Shared visual constants + small helpers for the video components.
 * Inline-style based (no Tailwind) so rendering is fully deterministic
 * and needs zero webpack/tailwind config inside Remotion.
 *
 * Palette mirrors the app's hextech look (deep navy + gold + cyan).
 */

export const COLORS = {
  bg0: "#060b16",
  bg1: "#0b1526",
  panel: "rgba(13, 24, 44, 0.92)",
  panelBorder: "rgba(200, 170, 110, 0.35)",
  gold: "#c8aa6e",
  goldBright: "#f0e6d2",
  cyan: "#0ac8b9",
  text: "#f0e6d2",
  textDim: "rgba(240, 230, 210, 0.65)",
  correct: "#22c55e",
  correctBg: "rgba(34, 197, 94, 0.18)",
  wrongDim: "rgba(240, 230, 210, 0.28)",
};

export const FONT_STACK =
  "'Segoe UI', 'Helvetica Neue', Arial, system-ui, sans-serif";

export const CHOICE_LETTERS = ["A", "B", "C", "D", "E", "F"];

/** Human label for a category slug: "item_build_paths" → "Item Build Paths". */
export function categoryLabel(category?: string): string {
  if (!category) return "";
  return category
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export function difficultyLabel(difficulty?: number): string {
  if (!difficulty) return "";
  if (difficulty <= 1) return "Easy";
  if (difficulty === 2) return "Medium";
  if (difficulty === 3) return "Hard";
  return "Expert";
}

/** Subject line under the category badge (champion / item / ability). */
export function subjectLabel(q: {
  champion_name?: string;
  item_name?: string;
  ability_name?: string;
}): string {
  const parts = [q.champion_name, q.ability_name, q.item_name].filter(Boolean);
  return parts.join(" — ");
}
