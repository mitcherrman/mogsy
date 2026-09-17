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
 *
 * `structure` is MAA1 Phase 5 — one Summoner's Rift STRUCTURE (a turret, an
 * inhibitor, the Nexus), resolved by the backend from `quiz.structure_assets`
 * and emitted as `assets.subject.type === "structure"`. There is exactly one
 * turret subject, not four tiers: the approved wiki has one current turret
 * render and the tier is stated by the PROMPT. Nothing here may re-tier it.
 */
export type SubjectKind =
  | "champion"
  | "item"
  | "rune"
  | "spell"
  | "objective"
  | "minion"
  | "structure"
  | "jungle_pet"
  | "none";

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
  /**
   * Fallback label only — the backend's literal `"Ability W"`. Kept because a
   * payload frozen before the per-side names still sends it and the card still
   * has to draw something.
   */
  abilityName?: string;
  /**
   * The canonical name of that shared slot on each side. A PAIR, because the
   * slot is what the two kits share and the name is what they do not: Aatrox W
   * is Infernal Chains, Akali W is Twilight Shroud. Drawn together or not at
   * all, so the card can never name one side's ability and not the other's.
   */
  abilityNameA?: string;
  abilityNameB?: string;
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

/**
 * Parsed payload for an ENVIRONMENT subject — a Summoner's Rift entity that is
 * neither a champion, an item, a rune nor a spell: today the four lane-minion
 * classes, and any `objective` the backend resolves a portrait for.
 *
 * ONE SHAPE, BECAUSE IT IS ONE QUESTION SHAPE
 * "This round is about this piece of the map." Exactly the argument the
 * summoner-spell reader already makes for its two backend types: the card is
 * chosen by what the premise IS, not by which generator family wrote it.
 *
 * Carries identity and NOTHING measured. Every one of these families asks for
 * a number the picture must not state — a melee minion's starting health, how
 * many minions a cannon wave holds — so there is deliberately no field a value
 * could arrive in. The single-unit portrait rule from MAA1 Phase 4 survives
 * intact: `kindLabel` names the CLASS, and nothing here may assemble a wave.
 */
export type EnvironmentSubject = {
  /** Backend subject id, e.g. "caster" / "siege". Identity only. */
  id?: string;
  /** Display name, e.g. "Caster Minion". */
  name: string;
  /** The subject's own portrait, resolved through the shared asset resolver. */
  icon?: string | null;
  /**
   * Which environment family this is — drives the caption's kind line only.
   *
   * A FAMILY, never an entity. `structure` covers the turret, the inhibitor
   * and the Nexus with one value precisely so this file never learns their
   * names: the backend owns entity identity and the art path it resolves to,
   * and a `kind === "nexus"` branch here would be the frontend re-deciding
   * something it is not the authority on.
   */
  kind: "minion" | "objective" | "structure" | "jungle_pet";
  /**
   * JPM1 — a jungle companion's FORM (`base` / `evolved`). Identity the
   * backend resolved from the JSA1 unlock stage; the art path already encodes
   * it, so this only drives the caption. Absent for every other kind.
   */
  form?: "base" | "evolved";
};

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
  | { card: "environment"; key: string; environment: EnvironmentSubject }
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
