import type { QuizQuestion } from "@/lib/quiz/api";
import type { QuestionMediaEntities } from "./questionMediaEntities";

/**
 * Legacy subject classification kinds (classifySubject output).
 *
 * `minion` is MAA1 Phase 4 — one lane-minion CLASS (melee, caster, cannon,
 * super), never a wave and never a count. The backend resolves it from
 * `quiz.minion_assets` and emits `assets.subject.type === "minion"` with a
 * single-unit 128x128 portrait; several of these questions ask how many
 * minions a wave holds, so the art must stay a class portrait and nothing
 * here may assemble one into a group.
 */
export type SubjectKind = "champion" | "item" | "rune" | "spell" | "objective" | "minion" | "none";

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

/**
 * Parsed payload for a MATCHUP question — two champions compared.
 *
 * Deliberately carries the metric's NAME and never its values: a comparison
 * question's answer is which side is higher, so the card must be able to say
 * what is being compared without being able to say who wins.
 */
export type MatchupSubject = {
  championA: string;
  championB: string;
  championASplash?: string | null;
  championBSplash?: string | null;
  /** Shared slot when the premise compares one ability across both kits. */
  abilitySlot?: string;
  abilityName?: string;
  abilityIcon?: string | null;
  /** Human label for the compared metric, e.g. "Cooldown". Never a value. */
  metricLabel?: string;
  level?: number;
  abilityRank?: number;
  badge?: string;
};

/**
 * Parsed payload for an SSM slice phase — a summoner spell under haste.
 *
 * Carries the premise only: which spell, which haste sources, and the haste
 * total the prompt already states. Never a cooldown, because every phase's
 * answer is one.
 */
/**
 * A summoner spell as the SUBJECT of a Ranked question.
 *
 * One shape for two families, because they are one kind of question — "this
 * round is about this summoner spell" — differing only in what else the
 * premise states:
 *
 *   `summoner_spell_haste`   (SSM slice)   spell + haste sources + total
 *   `summoner_spell_subject` (quiz.v1)     the spell alone
 *
 * `sources` and `totalHaste` are therefore OPTIONAL rather than a second type.
 * A spell-only question is not a degraded haste question; it is the same card
 * with nothing further to state, which is exactly what the SSM slice's own
 * base-cooldown phase already renders — its answer IS the base cooldown, so it
 * arrives with no sources either.
 */
export type SummonerSpellSubject = {
  spell: string;
  spellIcon?: string | null;
  sources?: { name: string; icon: string | null; kind: "rune" | "item" }[];
  totalHaste?: number;
  badge?: string;
};

/** Back-compatible alias for the SSM-era name. */
export type SummonerSpellHasteSubject = SummonerSpellSubject;

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
  /**
   * Optional override for the card's type chip (RA3-MEDIA-P5). This is the only
   * shipped card that draws a champion, an ability and an item row at once, so
   * premise families beyond combat calculation reuse it — and would otherwise
   * be labeled "Combat Calculation". A LABEL only: it selects no card and
   * changes no layout. Undefined for every payload frozen before P5.
   */
  badge?: string;
  /**
   * The full normalized premise entity set, when the payload carries one
   * (RA3-MEDIA-P4). The fields above describe what THIS card draws — one
   * champion, one item row, one ability; `entities` is everything the question
   * states, role-tagged, including the entities this card's shape cannot
   * express (the target champion, the target's items). `null` for every payload
   * frozen before that phase.
   */
  entities?: QuestionMediaEntities | null;
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
  | { card: "matchup"; key: string; matchup: MatchupSubject }
  | { card: "summoner_spell"; key: string; spell: SummonerSpellSubject }
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
