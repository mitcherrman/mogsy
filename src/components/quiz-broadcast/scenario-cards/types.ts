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
  /** effect is optional per-item flavor text (e.g. "+15 Ability Haste") */
  itemIcons: { name: string; icon: string | null; effect?: string }[];
  totalAbilityHaste?: number;
};

/** Parsed payload for item analysis questions. */
export type ItemAnalysisSubject = {
  name: string;
  icon?: string | null;
  cost?: number;
  /** Raw stat codes from metadata.stats (e.g. "AD", "ABILITY_HASTE"). */
  statCodes: string[];
  /** Single known stat from exact-stat questions ("15" + "Ability Haste"). */
  statValue?: { value: string; label: string };
  buildsInto?: string;
  /**
   * Build-path questions: components named in the question (safe pre-reveal).
   * icon is a resolved URL when metadata carries known_component_icons;
   * absent icons fall back to a monogram tile in the Recipe Tree.
   */
  knownComponents: { name: string; icon: string | null }[];
  /** Build-path questions: the ANSWER — render only when revealed. */
  missingComponent?: { name: string; icon: string | null };
};

/** One entry in a ScenarioSection — item, rune, dragon, buff, patch, etc. */
export type ScenarioEntryData = {
  icon?: string | null;
  title: string;
  subtitle?: string;
  badge?: string;
  highlight?: boolean;
};

/** A labeled group of scenario entries. Sections with no entries don't render. */
export type ScenarioSectionData = {
  title: string;
  entries: ScenarioEntryData[];
};

/** Discriminated union produced by selectScenario — one variant per card. */
export type ScenarioSelection =
  | { card: "combat_calculation"; key: string; combat: CombatCooldownSubject }
  | { card: "item_analysis"; key: string; item: ItemAnalysisSubject }
  | { card: "champion_profile"; key: string; champion: string }
  | { card: "collectible"; key: string; iconUrl: string; label?: string; kind: SubjectKind }
  | { card: "placeholder"; key: string; kind: SubjectKind; category: string }
  | { card: "empty"; key: string };

export type ScenarioCardProps = {
  question: QuizQuestion;
  revealActive: boolean;
  correctAnswer: string | null;
};
