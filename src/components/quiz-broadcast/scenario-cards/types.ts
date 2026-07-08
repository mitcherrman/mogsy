import type { QuizQuestion } from "@/lib/quiz/api";

/** Legacy subject classification kinds (classifySubject output). */
export type SubjectKind = "champion" | "item" | "rune" | "spell" | "objective" | "none";

export type ClassifiedSubject = {
  kind: SubjectKind;
  label?: string;
  iconUrl?: string;
};

/**
 * Scenario types selectable via metadata.presentation.scenario_type.
 * Only champion_profile, combat_calculation, and the default/placeholder
 * path are implemented today; the rest are reserved for future cards.
 */
export type ScenarioType =
  | "champion_profile"
  | "ability"
  | "item"
  | "rune"
  | "summoner_spell"
  | "objective"
  | "combat_calculation"
  | "combat_simulation"
  | "patch"
  | "esports"
  | "lore"
  | "comparison"
  | "default";

/** Parsed payload for combat cooldown calculation questions. */
export type CombatCooldownSubject = {
  champion: string;
  abilitySlot?: string;
  abilityName?: string;
  level?: number;
  abilityRank?: number;
  championIcon?: string | null;
  championSplash?: string | null;
  abilityIcon?: string | null;
  itemIcons: { name: string; icon: string | null }[];
};

/** Discriminated union produced by selectScenario — one variant per card. */
export type ScenarioSelection =
  | { card: "combat_calculation"; key: string; combat: CombatCooldownSubject }
  | { card: "champion_profile"; key: string; champion: string }
  | { card: "collectible"; key: string; iconUrl: string; label?: string; kind: SubjectKind }
  | { card: "placeholder"; key: string; kind: SubjectKind; category: string }
  | { card: "empty"; key: string };

export type ScenarioCardProps = {
  question: QuizQuestion;
  revealActive: boolean;
  correctAnswer: string | null;
};
