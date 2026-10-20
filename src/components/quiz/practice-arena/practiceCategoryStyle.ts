/**
 * Per-category badge styling for a Practice question, moved verbatim from
 * `Quiz.tsx` (PM1) so the arena's subject panel draws the same badges the
 * legacy question header did.
 *
 * The lookup normalizes the backend category string (snake_case or Title
 * Case) so categories like "Item Exact Stats", "Item Components", "Item Builds
 * Into", "Item Build Paths", "Champion Ability Cooldowns" and "Summoner Spell
 * Cooldowns" all get distinct, themed badges.
 */
import type { ComponentType } from "react";
import { BookOpen, BrainCircuit, GitBranch, Layers, Package, Swords, Timer, Wand2 } from "lucide-react";
import type { QuizQuestion } from "@/lib/quiz/api";

export type CategoryStyle = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  className: string;
};

const CATEGORY_STYLE_MAP: Record<string, CategoryStyle> = {
  item_exact_stats: {
    label: "Item Exact Stats",
    icon: Package,
    className: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  },
  item_components: {
    label: "Item Components",
    icon: Layers,
    className: "border-orange-400/40 bg-orange-400/10 text-orange-200",
  },
  item_builds_into: {
    label: "Item Builds Into",
    icon: GitBranch,
    className: "border-yellow-400/40 bg-yellow-400/10 text-yellow-200",
  },
  item_build_paths: {
    label: "Item Build Paths",
    icon: GitBranch,
    className: "border-yellow-500/40 bg-yellow-500/10 text-yellow-100",
  },
  champion_ability_cooldowns: {
    label: "Champion Cooldowns",
    icon: Timer,
    className: "border-cyan-400/40 bg-cyan-400/10 text-cyan-200",
  },
  summoner_spell_cooldowns: {
    label: "Summoner Cooldowns",
    icon: Timer,
    className: "border-sky-400/40 bg-sky-400/10 text-sky-200",
  },
  champion_abilities: {
    label: "Champion Abilities",
    icon: Wand2,
    className: "border-violet-400/40 bg-violet-400/10 text-violet-200",
  },
  summoner_spells: {
    label: "Summoner Spells",
    icon: Swords,
    className: "border-sky-400/40 bg-sky-400/10 text-sky-200",
  },
};

export function normalizeCategoryKey(category: string | undefined | null): string {
  return (category || "").toString().trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function getCategoryStyle(category: string | undefined | null): CategoryStyle {
  const key = normalizeCategoryKey(category);
  if (CATEGORY_STYLE_MAP[key]) return CATEGORY_STYLE_MAP[key];
  // Fallback partial matches for unknown but related categories.
  if (key.includes("cooldown")) {
    return { label: category || "Cooldowns", icon: Timer, className: "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" };
  }
  if (key.includes("item")) {
    return { label: category || "Items", icon: Package, className: "border-amber-400/40 bg-amber-400/10 text-amber-200" };
  }
  if (key.includes("rune")) {
    return { label: category || "Runes", icon: BookOpen, className: "border-purple-400/40 bg-purple-400/10 text-purple-200" };
  }
  if (key.includes("summoner") || key.includes("spell")) {
    return { label: category || "Summoner Spells", icon: Swords, className: "border-sky-400/40 bg-sky-400/10 text-sky-200" };
  }
  if (key.includes("ability") || key.includes("champion")) {
    return { label: category || "Champions", icon: Wand2, className: "border-violet-400/40 bg-violet-400/10 text-violet-200" };
  }
  return { label: category || "General", icon: BrainCircuit, className: "border-border bg-background/40 text-foreground/80" };
}

/** One badge the legacy header drew beside the category. */
export interface QuestionBadge {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }> | null;
  className: string;
}

/** The category badge plus the cooldown and exact-stat badges, as before. */
export function questionBadges(question: QuizQuestion): QuestionBadge[] {
  const style = getCategoryStyle(question.category);
  const meta = (question.metadata || {}) as Record<string, unknown>;
  const catKey = normalizeCategoryKey(question.category);
  const statLabel =
    typeof meta.stat_label === "string"
      ? meta.stat_label
      : typeof meta.stat_name === "string"
        ? meta.stat_name
        : undefined;
  const badges: QuestionBadge[] = [
    { key: "category", label: style.label, icon: style.icon, className: style.className },
  ];
  if (catKey.includes("cooldown")) {
    badges.push({
      key: "cooldown",
      label: "Cooldown",
      icon: Timer,
      className: "border-cyan-400/40 bg-cyan-400/10 text-cyan-200",
    });
  }
  if (catKey.includes("exact_stat") && statLabel) {
    badges.push({
      key: "stat",
      label: `Stat: ${statLabel}`,
      icon: null,
      className: "border-amber-400/40 bg-amber-400/10 text-amber-200",
    });
  }
  return badges;
}
