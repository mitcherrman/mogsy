/**
 * HUB5 — the ONE identity factory for every question a Timmy fixture shows.
 *
 * A question has two identities, and they are not the same thing:
 *
 *  - its LEARNING identity — the canonical ref (`ranked:` / `quiz:` /
 *    `mastery:`), plus the exact key, family, concept, category, subject and
 *    content versions the backend freezes beside it. One per question.
 *  - its OCCURRENCE identity — a specific (match, round, challenge) at which it
 *    was asked. A learning identity may occur any number of times.
 *
 * This module owns the first. The Ranked record, every Daily stage, the Daily
 * Review replay, the Owned collection and the Missed bank all resolve their
 * questions HERE, so one question is one ref, one prompt and one answer on
 * every surface of the preview. Occurrences are built by the callers
 * (`dailyFixtureBuilder.ts`, `syntheticRankedHistory.ts`) and always point back
 * at an identity from this file.
 *
 * DEMO DATA. The League facts are plausible rather than patch-exact, exactly
 * as in `syntheticRankedHistory.ts`. Nothing here is served to a player.
 */
import {
  CATEGORY,
  CHAMPION,
  ITEM,
  RUNE,
  SPELL,
  SYNTHETIC_QUESTIONS,
  iconHintFor,
  topicFor,
  type Subject,
  type SyntheticQuestion,
} from "@/pages/dev/lobby-preview/syntheticRankedHistory";
import type { ReviewIconHint } from "@/lib/ranked-public/contracts";
import type { TimelineTopic } from "@/components/quiz/timeline/timelineNodeModel";
import { masteryRef, quizRef, rankedRef, reflexRef, refNamespace, type RefNamespace } from "./canonicalRefs";

export { masteryRef, quizRef, rankedRef, reflexRef, refNamespace, type RefNamespace };

/**
 * Content versions per namespace. HUB2 folds the (generator, source) version
 * set of a stage's questions into its compatibility key, so these are part of
 * each question's frozen identity, not decoration.
 *
 * Truthful provenance (HUB5.1): curated content — the reviewed Ranked export
 * and the quiz bank — has NO generator, so its generator version is null;
 * generated Mastery content names its generator. A composed Standard stage
 * and most Review stages therefore mix null and named generator versions.
 * HUB2.1 crashed on exactly that mix; HUB2.2 (`bb8ed334`) projects it, and the
 * golden now carries it unaltered.
 */
const VERSIONS: Record<RefNamespace, { generator: string | null; source: string }> = {
  ranked: { generator: null, source: "ranked-export-2026.09" },
  quiz: { generator: null, source: "quiz-bank-2026.09" },
  mastery: { generator: "mastery-gen-4", source: "mastery-set-12" },
  // HUB6.2 — Meta Reflex cards are generated (item-cost pairs) like Mastery.
  reflex: { generator: "meta-reflex-gen-3", source: "meta-reflex-cards-2026.09" },
};

/** The backend's frozen subject columns. A category-level question names no
 *  entity, so all three are null — never a borrowed entity. */
export interface FrozenSubject {
  kind: string | null;
  key: string | null;
  label: string | null;
}

export interface FixtureQuestionIdentity {
  namespace: RefNamespace;
  canonicalRef: string;
  /** Only `quiz:` refs carry an exact bank key; other namespaces are never
   *  parsed as quiz keys (spec §4). */
  exactKey: string | null;
  /** The quiz bank's numeric id — how a Practice attempt names the question. */
  quizQuestionId: number | null;
  family: string;
  concept: string;
  /** The frozen category: a display label for curated questions, the family
   *  slug for generated Mastery ones (as the backend freezes them). */
  category: string;
  subject: FrozenSubject;
  generatorVersion: string | null;
  sourceVersion: string;
  sourceArtifactId: string | null;
}

/** A single-answer question as a Ranked `quiz` round carries it. */
export interface QuizContent {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: Record<string, unknown> | null;
  iconHint: ReviewIconHint;
  topic: TimelineTopic;
}

/** One generated instance of a Mastery concept, as a `mastery_slice` round
 *  carries it. */
export interface MasteryContent {
  prompt: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  questionFamily: string;
}

function frozenSubject(subject: Subject): FrozenSubject {
  switch (subject.kind) {
    case "category":
      return { kind: null, key: null, label: null };
    default:
      return { kind: subject.kind, key: subject.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label: subject.name };
  }
}

// ───────────────────────────────────────────── ranked: the demo candidates

/** Learning metadata for the Ranked demo candidates, whose content lives in
 *  `SYNTHETIC_QUESTIONS`. */
const RANKED_LEARNING: Record<string, { family: string; concept: string }> = {
  "malphite-r-cooldown": { family: "ability_cooldown", concept: "malphite.r.cooldown" },
  "ahri-q-cost": { family: "ability_cost", concept: "ahri.q.cost" },
  "infinity-edge-ad": { family: "item_stat_lookup", concept: "item.3031.attack_damage" },
  "dorans-shield-cost": { family: "item_cost", concept: "item.1054.cost" },
  "moonstone-unique": { family: "item_unique_effect", concept: "item.6617.unique" },
  "flash-cooldown": { family: "summoner_cooldown", concept: "summoner.flash.cooldown" },
  "smite-charges": { family: "summoner_charges", concept: "summoner.smite.charges" },
  "conqueror-stacks": { family: "rune_mechanic", concept: "rune.conqueror.stacks" },
  "purchase-total": { family: "purchase_total", concept: "gold.purchase_total" },
  "baron-respawn": { family: "objective_timer", concept: "objective.baron.respawn" },
  "dragon-soul": { family: "objective_rule", concept: "objective.dragon.soul" },
  "ward-duration": { family: "vision_timer", concept: "vision.stealth_ward.duration" },
  "control-ward": { family: "vision_mechanic", concept: "vision.control_ward.effect" },
  "caster-count": { family: "wave_composition", concept: "wave.caster_count" },
  "slow-push": { family: "wave_management", concept: "wave.slow_push" },
  "blue-sentinel": { family: "jungle_buff", concept: "jungle.blue_buff" },
  "ability-haste": { family: "ability_haste_math", concept: "system.ability_haste" },
};

// ───────────────────────────────────────────── quiz: the shared quiz bank

interface QuizBankQuestion extends SyntheticQuestion {
  /** The bank's numeric id (`quiz_questions.id`). */
  bankId: number;
  family: string;
  concept: string;
}

const note = (text: string) => ({ scenario_note: text });

/**
 * The Practice bank questions Timmy meets. The same `quiz:` question can be
 * asked in Practice (and missed into the Missed bank) and drawn into a Ranked
 * or Daily round (and discovered into Owned) — which is exactly the cross-
 * surface identity this fixture exists to keep coherent.
 */
const QUIZ_BANK: readonly QuizBankQuestion[] = [
  // Champion Cooldowns
  { id: "annie-q-cooldown", bankId: 4101, category: "Champion Cooldowns", family: "ability_cooldown", concept: "annie.q.cooldown",
    prompt: "What is the cooldown of Annie's Disintegrate?", options: ["4 seconds", "5 seconds", "6 seconds", "3.5 seconds"], correctIndex: 0,
    explanation: note("Disintegrate is on a flat 4 second cooldown, and refunds its mana when it kills."), subject: CHAMPION("Annie") },
  { id: "ezreal-e-cooldown", bankId: 4102, category: "Champion Cooldowns", family: "ability_cooldown", concept: "ezreal.e.cooldown",
    prompt: "What is the cooldown of Ezreal's Arcane Shift at rank 1?", options: ["25 seconds", "28 seconds", "22 seconds", "19 seconds"], correctIndex: 0,
    explanation: note("Arcane Shift starts at 25 seconds and drops by 3 seconds per rank."), subject: CHAMPION("Ezreal") },
  // Item Exact Stats
  { id: "rabadon-ap", bankId: 4201, category: "Item Exact Stats", family: "item_stat_lookup", concept: "item.3089.ability_power",
    prompt: "How much ability power does Rabadon's Deathcap grant?", options: ["130", "120", "140", "100"], correctIndex: 0,
    explanation: note("Rabadon's Deathcap grants 130 ability power, then amplifies total ability power."), subject: ITEM("Rabadon's Deathcap", 3089) },
  { id: "sunfire-health", bankId: 4202, category: "Item Exact Stats", family: "item_stat_lookup", concept: "item.3068.health",
    prompt: "How much health does Sunfire Aegis grant?", options: ["350", "400", "450", "300"], correctIndex: 0,
    explanation: note("Sunfire Aegis grants 350 health alongside its armor."), subject: ITEM("Sunfire Aegis", 3068) },
  { id: "bork-attack-speed", bankId: 4203, category: "Item Exact Stats", family: "item_stat_lookup", concept: "item.3153.attack_speed",
    prompt: "How much attack speed does Blade of the Ruined King grant?", options: ["25%", "30%", "20%", "35%"], correctIndex: 0,
    explanation: note("Blade of the Ruined King grants 25% attack speed."), subject: ITEM("Blade of the Ruined King", 3153) },
  { id: "liandry-ap", bankId: 4204, category: "Item Exact Stats", family: "item_stat_lookup", concept: "item.6653.ability_power",
    prompt: "How much ability power does Liandry's Torment grant?", options: ["90", "80", "100", "70"], correctIndex: 0,
    explanation: note("Liandry's Torment grants 90 ability power alongside health."), subject: ITEM("Liandry's Torment", 6653) },
  { id: "warmog-health", bankId: 4205, category: "Item Exact Stats", family: "item_stat_lookup", concept: "item.3083.health",
    prompt: "How much health does Warmog's Armor grant?", options: ["1000", "800", "850", "1100"], correctIndex: 0,
    explanation: note("Warmog's Armor grants 1000 health — the most of any single item."), subject: ITEM("Warmog's Armor", 3083) },
  // Rune Recognition
  { id: "electrocute-hits", bankId: 4301, category: "Rune Recognition", family: "rune_mechanic", concept: "rune.electrocute.trigger",
    prompt: "How many separate attacks or abilities trigger Electrocute?", options: ["3", "2", "4", "5"], correctIndex: 0,
    explanation: note("Three separate attacks or abilities on one champion within 3 seconds."), subject: RUNE("Electrocute", "Electrocute") },
  { id: "first-strike-window", bankId: 4302, category: "Rune Recognition", family: "rune_mechanic", concept: "rune.first_strike.window",
    prompt: "How long is First Strike's bonus window after you strike first?", options: ["3 seconds", "5 seconds", "2 seconds", "4 seconds"], correctIndex: 0,
    explanation: note("First Strike grants its bonus damage and gold for 3 seconds."), subject: RUNE("First Strike", "First_Strike") },
  // Objectives & Timers
  { id: "dragon-first-spawn", bankId: 4401, category: "Objectives & Timers", family: "objective_timer", concept: "objective.dragon.first_spawn",
    prompt: "When does the first dragon spawn?", options: ["5:00", "6:00", "4:00", "8:00"], correctIndex: 0,
    explanation: note("The first dragon spawns at five minutes."), subject: CATEGORY },
  { id: "baron-first-spawn", bankId: 4402, category: "Objectives & Timers", family: "objective_timer", concept: "objective.baron.first_spawn",
    prompt: "When does Baron Nashor first spawn?", options: ["20:00", "25:00", "15:00", "22:00"], correctIndex: 0,
    explanation: note("Baron Nashor first spawns at twenty minutes."), subject: CATEGORY },
  { id: "inhibitor-respawn", bankId: 4403, category: "Objectives & Timers", family: "objective_timer", concept: "objective.inhibitor.respawn",
    prompt: "How long does a destroyed inhibitor take to respawn?", options: ["5 minutes", "4 minutes", "6 minutes", "3 minutes"], correctIndex: 0,
    explanation: note("An inhibitor respawns five minutes after it is destroyed."), subject: CATEGORY },
  { id: "turret-plates-fall", bankId: 4404, category: "Objectives & Timers", family: "objective_timer", concept: "objective.turret_plates.fall",
    prompt: "When do outer turret plates fall off?", options: ["14:00", "15:00", "12:00", "10:00"], correctIndex: 0,
    explanation: note("Turret plating falls at fourteen minutes."), subject: CATEGORY },
  // Wave Management
  { id: "cannon-cadence", bankId: 4501, category: "Wave Management", family: "wave_composition", concept: "wave.cannon_cadence",
    prompt: "Early in the game, how often does a cannon minion join the wave?", options: ["Every third wave", "Every wave", "Every second wave", "Every fourth wave"], correctIndex: 0,
    explanation: note("Every third wave carries a cannon until the cadence speeds up later."), subject: CATEGORY },
  { id: "first-minions", bankId: 4502, category: "Wave Management", family: "wave_composition", concept: "wave.first_arrival",
    prompt: "When do the first minions spawn?", options: ["0:30", "1:05", "0:45", "2:00"], correctIndex: 0,
    explanation: note("The first wave spawns thirty seconds into the game."), subject: CATEGORY },
  { id: "freeze-definition", bankId: 4503, category: "Wave Management", family: "wave_management", concept: "wave.freeze",
    prompt: "What does freezing a wave mean?", options: [
      "Holding the wave in place near your turret by last-hitting only",
      "Pushing the wave into the enemy turret as fast as possible",
      "Leaving the lane so both waves meet in the middle",
      "Killing the enemy cannon minion before any other minion",
    ], correctIndex: 0,
    explanation: note("A freeze keeps the wave just outside your turret by last-hitting only."), subject: CATEGORY },
  // Summoner Spells
  { id: "ignite-cooldown", bankId: 4601, category: "Summoner Spells", family: "summoner_cooldown", concept: "summoner.ignite.cooldown",
    prompt: "What is Ignite's base cooldown?", options: ["180 seconds", "210 seconds", "240 seconds", "150 seconds"], correctIndex: 0,
    explanation: note("Ignite is on a 180 second cooldown."), subject: SPELL("Ignite") },
  { id: "teleport-cooldown", bankId: 4602, category: "Summoner Spells", family: "summoner_cooldown", concept: "summoner.teleport.cooldown",
    prompt: "What is Teleport's cooldown at the start of the game?", options: ["360 seconds", "300 seconds", "420 seconds", "240 seconds"], correctIndex: 0,
    explanation: note("Teleport starts on a 360 second cooldown."), subject: SPELL("Teleport") },
  { id: "exhaust-duration", bankId: 4603, category: "Summoner Spells", family: "summoner_effect", concept: "summoner.exhaust.duration",
    prompt: "How long does Exhaust last?", options: ["3 seconds", "2.5 seconds", "2 seconds", "4 seconds"], correctIndex: 0,
    explanation: note("Exhaust slows and reduces damage for 3 seconds."), subject: SPELL("Exhaust") },
];

// ───────────────────────────────────────────── mastery: generated concepts

interface MasteryConcept {
  conceptId: string;
  family: string;
  subject: Subject;
  /** Generated instances of the concept. Different numbers, one concept —
   *  so a repeated `mastery:` ref is one learning identity asked twice. */
  variants: Array<{ prompt: string; options: string[]; correctAnswer: string; explanation: string }>;
}

const MASTERY_CONCEPTS: readonly MasteryConcept[] = [
  { conceptId: "annie-q-raw-damage", family: "raw_single_type_damage", subject: CHAMPION("Annie"), variants: [
    { prompt: "Disintegrate deals 80 (+75% AP) magic damage. With 100 AP, how much raw damage does it deal?",
      options: ["155", "180", "130", "175"], correctAnswer: "155", explanation: "80 + 0.75 × 100 = 155." },
    { prompt: "Disintegrate deals 80 (+75% AP) magic damage. With 160 AP, how much raw damage does it deal?",
      options: ["200", "190", "220", "180"], correctAnswer: "200", explanation: "80 + 0.75 × 160 = 200." },
  ] },
  { conceptId: "physical-post-mitigation", family: "post_mitigation_single_type_damage", subject: CATEGORY, variants: [
    { prompt: "A 200 physical damage hit lands on a target with 100 armor. How much damage is dealt?",
      options: ["100", "150", "120", "80"], correctAnswer: "100", explanation: "200 × 100 / (100 + 100) = 100." },
    { prompt: "A 300 physical damage hit lands on a target with 50 armor. How much damage is dealt?",
      options: ["200", "250", "150", "225"], correctAnswer: "200", explanation: "300 × 100 / (100 + 50) = 200." },
  ] },
  { conceptId: "lux-casts-before-oom", family: "casts_before_oom", subject: CHAMPION("Lux"), variants: [
    { prompt: "Lux has 500 mana and Light Binding costs 60. How many casts before she is out of mana?",
      options: ["8", "9", "7", "10"], correctAnswer: "8", explanation: "500 / 60 = 8.3, so 8 whole casts." },
    { prompt: "Lux has 740 mana and Lucent Singularity costs 70. How many casts before she is out of mana?",
      options: ["10", "11", "9", "12"], correctAnswer: "10", explanation: "740 / 70 = 10.6, so 10 whole casts." },
  ] },
  { conceptId: "ezreal-e-haste", family: "cooldown_with_haste", subject: CHAMPION("Ezreal"), variants: [
    { prompt: "Arcane Shift has a 25 second cooldown. With 25 ability haste, what is its cooldown?",
      options: ["20", "18.75", "22", "15"], correctAnswer: "20", explanation: "25 × 100 / (100 + 25) = 20." },
    { prompt: "Arcane Shift has a 25 second cooldown. With 50 ability haste, what is its cooldown?",
      options: ["16.7", "12.5", "18", "20"], correctAnswer: "16.7", explanation: "25 × 100 / (100 + 50) ≈ 16.7." },
  ] },
  { conceptId: "garen-health-remaining", family: "health_remaining", subject: CHAMPION("Garen"), variants: [
    { prompt: "Garen has 1200 health and takes 450 post-mitigation damage. How much health remains?",
      options: ["750", "650", "800", "700"], correctAnswer: "750", explanation: "1200 − 450 = 750." },
    { prompt: "Garen has 980 health and takes 615 post-mitigation damage. How much health remains?",
      options: ["365", "385", "335", "415"], correctAnswer: "365", explanation: "980 − 615 = 365." },
  ] },
];

// ───────────────────────────────────────────── reflex: Meta Reflex cards

/**
 * HUB6.2 — the Meta Reflex cards a full Standard stage deals: item-cost
 * pairs, as the Daily recipe's `item_cost_duel` block (five cards) serves
 * them. One card is one challenge of the round; its identity is the card.
 */
interface ReflexCard {
  key: string;
  left: { name: string; id: number; cost: number };
  right: { name: string; id: number; cost: number };
}

const item = (name: string, id: number, cost: number) => ({ name, id, cost });

const REFLEX_CARDS: readonly ReflexCard[] = [
  { key: "ie-vs-deathcap", left: item("Infinity Edge", 3031, 3400), right: item("Rabadon's Deathcap", 3089, 3600) },
  { key: "sunfire-vs-bork", left: item("Sunfire Aegis", 3068, 2700), right: item("Blade of the Ruined King", 3153, 3200) },
  { key: "liandry-vs-warmog", left: item("Liandry's Torment", 6653, 3000), right: item("Warmog's Armor", 3083, 3100) },
  { key: "zhonya-vs-moonstone", left: item("Zhonya's Hourglass", 3157, 3250), right: item("Moonstone Renewer", 6617, 2200) },
  { key: "dshield-vs-dblade", left: item("Doran's Shield", 1054, 450), right: item("Doran's Ring", 1056, 400) },
  { key: "sorcs-vs-swifties", left: item("Sorcerer's Shoes", 3020, 1100), right: item("Boots of Swiftness", 3009, 1000) },
  { key: "voidstaff-vs-lordd", left: item("Void Staff", 3135, 3000), right: item("Lord Dominik's Regards", 3036, 3100) },
  { key: "bc-vs-steraks", left: item("Black Cleaver", 3071, 3000), right: item("Sterak's Gage", 3053, 3200) },
  { key: "bt-vs-nashor", left: item("Bloodthirster", 3072, 3400), right: item("Nashor's Tooth", 3115, 3000) },
  { key: "pot-vs-boots", left: item("Health Potion", 2003, 50), right: item("Boots", 1001, 300) },
];

// Every card has one side that costs more — an equal pair has no answer, and
// the real module never deals one. A test holds this.

/** One Meta Reflex card as a `meta_reflex` review round carries it. */
export interface ReflexContent {
  prompt: string;
  left: { label: string; icon: string; value: number };
  right: { label: string; icon: string; value: number };
  correctSide: "left" | "right";
}

// ───────────────────────────────────────────── the factory

const RANKED_BY_REF = new Map<string, SyntheticQuestion>(
  Object.values(SYNTHETIC_QUESTIONS).map((q) => [rankedRef(q.id), q]),
);
const QUIZ_BY_REF = new Map<string, QuizBankQuestion>(QUIZ_BANK.map((q) => [quizRef(q.id), q]));
const MASTERY_BY_REF = new Map<string, MasteryConcept>(MASTERY_CONCEPTS.map((c) => [masteryRef(c.conceptId), c]));
const REFLEX_BY_REF = new Map<string, ReflexCard>(REFLEX_CARDS.map((c) => [reflexRef(c.key), c]));

const IDENTITIES = new Map<string, FixtureQuestionIdentity>();

function build(ref: string): FixtureQuestionIdentity {
  const namespace = refNamespace(ref);
  const versions = VERSIONS[namespace];
  if (namespace === "ranked") {
    const q = RANKED_BY_REF.get(ref);
    const learning = q && RANKED_LEARNING[q.id];
    if (!q || !learning) throw new Error(`unknown ranked fixture question: ${ref}`);
    return {
      namespace, canonicalRef: ref, exactKey: null, quizQuestionId: null,
      family: learning.family, concept: learning.concept, category: q.category,
      subject: frozenSubject(q.subject),
      generatorVersion: versions.generator, sourceVersion: versions.source, sourceArtifactId: null,
    };
  }
  if (namespace === "quiz") {
    const q = QUIZ_BY_REF.get(ref);
    if (!q) throw new Error(`unknown quiz fixture question: ${ref}`);
    return {
      namespace, canonicalRef: ref, exactKey: q.id, quizQuestionId: q.bankId,
      family: q.family, concept: q.concept, category: q.category,
      subject: frozenSubject(q.subject),
      generatorVersion: versions.generator, sourceVersion: versions.source, sourceArtifactId: null,
    };
  }
  if (namespace === "reflex") {
    const card = REFLEX_BY_REF.get(ref);
    if (!card) throw new Error(`unknown Meta Reflex fixture card: ${ref}`);
    return {
      namespace, canonicalRef: ref, exactKey: null, quizQuestionId: null,
      family: "item_cost_comparison", concept: `reflex.item_cost.${card.key}`, category: "Item Costs",
      subject: { kind: null, key: null, label: null },
      generatorVersion: versions.generator, sourceVersion: versions.source,
      sourceArtifactId: `artifact:reflex:${card.key}`,
    };
  }
  const c = MASTERY_BY_REF.get(ref);
  if (!c) throw new Error(`unknown mastery fixture concept: ${ref}`);
  return {
    namespace, canonicalRef: ref, exactKey: null, quizQuestionId: null,
    family: c.family, concept: c.conceptId, category: c.family,
    subject: frozenSubject(c.subject),
    generatorVersion: versions.generator, sourceVersion: versions.source,
    sourceArtifactId: `artifact:${c.conceptId}`,
  };
}

/** The learning identity behind a canonical ref. Throws for a ref no fixture
 *  question has — a typo cannot silently become a second identity. */
export function identityOf(ref: string): FixtureQuestionIdentity {
  let identity = IDENTITIES.get(ref);
  if (!identity) {
    identity = Object.freeze(build(ref));
    IDENTITIES.set(ref, identity);
  }
  return identity;
}

/** The content a single-answer (`quiz`) round shows for a `ranked:` or
 *  `quiz:` ref. */
export function quizContentOf(ref: string): QuizContent {
  const q = RANKED_BY_REF.get(ref) ?? QUIZ_BY_REF.get(ref);
  if (!q) throw new Error(`not a single-answer fixture question: ${ref}`);
  return {
    prompt: q.prompt,
    options: q.options,
    correctIndex: q.correctIndex,
    explanation: q.explanation,
    iconHint: iconHintFor(q),
    topic: topicFor(q),
  };
}

/** One generated instance of a `mastery:` concept. */
export function masteryContentOf(ref: string, variant: number): MasteryContent {
  const c = MASTERY_BY_REF.get(ref);
  const v = c?.variants[variant];
  if (!c || !v) throw new Error(`unknown mastery fixture instance: ${ref} #${variant}`);
  return { ...v, questionFamily: c.family };
}

/** One Meta Reflex card: which of two items costs more. */
export function reflexContentOf(ref: string): ReflexContent {
  const c = REFLEX_BY_REF.get(ref);
  if (!c) throw new Error(`unknown Meta Reflex fixture card: ${ref}`);
  const side = (x: ReflexCard["left"]) => ({ label: x.name, icon: `assets/items/${x.id}.png`, value: x.cost });
  return {
    prompt: "Which costs more?",
    left: side(c.left),
    right: side(c.right),
    correctSide: c.left.cost > c.right.cost ? "left" : "right",
  };
}

/** The quiz-bank question a Practice attempt names by numeric id. */
export function quizRefForBankId(bankId: number): string {
  const q = QUIZ_BANK.find((x) => x.bankId === bankId);
  if (!q) throw new Error(`unknown quiz bank id: ${bankId}`);
  return quizRef(q.id);
}

/** Every identity the factory can mint — for the coherence tests. */
export const ALL_FIXTURE_REFS: readonly string[] = Object.freeze([
  ...RANKED_BY_REF.keys(),
  ...QUIZ_BY_REF.keys(),
  ...MASTERY_BY_REF.keys(),
  ...REFLEX_BY_REF.keys(),
]);
