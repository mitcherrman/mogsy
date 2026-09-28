/**
 * HUB6.3E — the Premium analytics room's inks, printed on the parchment.
 *
 * OUTCOMES are the question rail's own inks (`HistoryQuestionTimeline`), so a
 * donut slice and the icons it lights are the same colour — and every one
 * carries a second, non-colour mark: correct is solid with a ✓, incorrect is
 * hatched with a ×, a timeout is dotted with a clock.
 *
 * PUBLIC CATEGORIES get one fixed ink each, by KEY (colour follows the
 * category, never its rank in a chart). Validated with the dataviz
 * validator against the parchment (#e6d4ac), in RG2's display order:
 * lightness band, chroma floor and normal-vision separation pass; the worst
 * adjacent colour-blind pair (Runes ↔ Champion Stats, deutan ΔE 6.4) and
 * three hues under 3:1 contrast are legal only with secondary encoding — so
 * every category slice is gapped, named in its legend with its count, and
 * described in its tooltip. `general` (RG2's unclassified fallback) is a
 * deliberate neutral.
 */
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import type { QuestionResult } from "@/components/quiz/workspace/historyViewModel";

export const RESULT_INK: Record<QuestionResult, string> = {
  correct: "#2c7a4b",
  incorrect: "#a3372a",
  timeout: "#44607c",
};

export const RESULT_WORD: Record<QuestionResult, string> = {
  correct: "Correct",
  incorrect: "Incorrect",
  timeout: "Timed out",
};

export const RESULTS: readonly QuestionResult[] = ["correct", "incorrect", "timeout"];

/** RG2's display order (`quiz.public_category.PUBLIC_CATEGORIES`), then the
 *  Meta Reflex module and the unclassified fallback. */
export const CATEGORY_ORDER: readonly string[] = [
  "objectives", "wave-management", "summoner-spells", "itemization", "abilities",
  "vision", "champion-stats", "runes", "scenarios", "fundamentals", "meta-reflex", "general",
];

const CATEGORY_INK: Readonly<Record<string, string>> = {
  objectives: "#b0461a",
  "wave-management": "#2766b0",
  "summoner-spells": "#a67c00",
  itemization: "#7a3fb0",
  abilities: "#00897b",
  vision: "#5b4fc9",
  "champion-stats": "#5f7a10",
  runes: "#c0395e",
  scenarios: "#1d6f9c",
  fundamentals: "#c66a12",
  "meta-reflex": "#9c2f7a",
  general: "#8a8070",
};

export function categoryInk(key: string): string {
  return CATEGORY_INK[key] ?? CATEGORY_INK.general;
}

/** Sort key for a public category (unknown keys after the known ones). */
export function categoryRank(key: string): number {
  const i = CATEGORY_ORDER.indexOf(key);
  return i < 0 ? CATEGORY_ORDER.length : i;
}

/** RG2 labels its unclassified fallback "Question"; as a chart group that
 *  reads as a typo, so the key's own word stands in. Every other label is
 *  the server's. */
export function categoryName(key: string, label: string): string {
  return key === "general" ? "General" : label;
}

/** The parchment's own surfaces for chart furniture. */
export const CHART = {
  frame: "rgba(96, 68, 28, 0.28)",
  grid: "rgba(96, 68, 28, 0.14)",
  track: "rgba(96, 68, 28, 0.13)",
  paper: "#efe2c2",
  gold: "#b4862a",
  goldLight: "#f1d893",
  ink: LEAGUECRAFT_INK.brass,
  current: LEAGUECRAFT_INK.accent,
} as const;

/** SVG pattern ids for the outcome textures (defined once per chart). */
export function outcomeFill(result: QuestionResult, idPrefix: string): string {
  return result === "correct" ? RESULT_INK.correct : `url(#${idPrefix}-${result})`;
}
