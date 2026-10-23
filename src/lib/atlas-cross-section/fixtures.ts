/**
 * ATL-CS-UX-001 — DEMO DATA.
 *
 * Subjects, ability/stat sheets and a small question corpus for the fixture
 * adapter. Every number here is illustrative. Champion and item identities
 * are real (so the existing asset store can draw them); their values, the
 * question prompts, counts, discovery flags and attempts are invented for the
 * prototype and are labelled DEMO DATA wherever they are shown.
 *
 * The corpus is shaped to exercise every state the contract names: certified
 * and uncertified families, answer-role edges that must never surface
 * publicly, held/retired records, level- and rank-scoped applicability, a
 * demo account's discoveries and a demo Premium review history.
 */
import type { AbilitySlot, Applicability, EdgeRole, SubjectRef, Topic } from "./types";

export const DEMO_DATA_LABEL = "DEMO DATA";

/* ------------------------------------------------------------------------- */
/* Subjects                                                                  */
/* ------------------------------------------------------------------------- */

export interface ChampionSubject {
  kind: "champion";
  id: string;
  name: string;
  title: string;
  role: string;
  resource: "mana" | "energy" | "none";
  hue: number;
  /** DEMO base stats at level 1 and per-level growth. */
  base: { hp: number; hpGrowth: number; mana: number; manaGrowth: number; ad: number; adGrowth: number; armor: number; armorGrowth: number; ms: number; range: number };
  abilities: ChampionAbility[];
}

export interface ChampionAbility {
  slot: AbilitySlot;
  name: string;
  /** Per-rank arrays (DEMO). Passives carry no rank arrays. */
  cooldown: number[] | null;
  cost: number[] | null;
  baseDamage: number[] | null;
  ratio: { stat: "AP" | "AD"; value: number } | null;
  range: number | null;
  topics: Topic[];
}

export interface ItemSubject {
  kind: "item";
  id: string;
  name: string;
  tier: "legendary" | "mythic-era" | "basic";
  hue: number;
  /** DEMO stat lines. */
  stats: { label: string; value: number; unit?: string; topic: Topic }[];
  passive: { name: string; summary: string } | null;
  cost: number;
  tags: ("ap" | "ad" | "crit" | "armor" | "pen")[];
}

export type Subject = ChampionSubject | ItemSubject;

export const CHAMPIONS: ChampionSubject[] = [
  {
    kind: "champion",
    id: "Ahri",
    name: "Ahri",
    title: "the Nine-Tailed Fox",
    role: "Mid · Mage",
    resource: "mana",
    hue: 330,
    base: { hp: 590, hpGrowth: 104, mana: 418, manaGrowth: 25, ad: 53, adGrowth: 3, armor: 21, armorGrowth: 4.7, ms: 330, range: 550 },
    abilities: [
      { slot: "P", name: "Essence Theft", cooldown: null, cost: null, baseDamage: null, ratio: null, range: null, topics: ["defenses", "scaling"] },
      { slot: "Q", name: "Orb of Deception", cooldown: [7, 7, 7, 7, 7], cost: [55, 65, 75, 85, 95], baseDamage: [40, 65, 90, 115, 140], ratio: { stat: "AP", value: 0.5 }, range: 880, topics: ["damage", "mana", "cooldown", "range"] },
      { slot: "W", name: "Fox-Fire", cooldown: [9, 8, 7, 6, 5], cost: [30, 30, 30, 30, 30], baseDamage: [50, 75, 100, 125, 150], ratio: { stat: "AP", value: 0.3 }, range: 700, topics: ["damage", "cooldown", "movement"] },
      { slot: "E", name: "Charm", cooldown: [14, 14, 14, 14, 14], cost: [60, 60, 60, 60, 60], baseDamage: [80, 120, 160, 200, 240], ratio: { stat: "AP", value: 0.6 }, range: 1000, topics: ["damage", "range", "cooldown"] },
      { slot: "R", name: "Spirit Rush", cooldown: [130, 105, 80], cost: [100, 100, 100], baseDamage: [60, 90, 120], ratio: { stat: "AP", value: 0.35 }, range: 450, topics: ["movement", "damage", "cooldown"] },
    ],
  },
  {
    kind: "champion",
    id: "Syndra",
    name: "Syndra",
    title: "the Dark Sovereign",
    role: "Mid · Mage",
    resource: "mana",
    hue: 268,
    base: { hp: 563, hpGrowth: 104, mana: 480, manaGrowth: 40, ad: 54, adGrowth: 3, armor: 22, armorGrowth: 4.7, ms: 330, range: 550 },
    abilities: [
      { slot: "P", name: "Transcendent", cooldown: null, cost: null, baseDamage: null, ratio: null, range: null, topics: ["scaling"] },
      { slot: "Q", name: "Dark Sphere", cooldown: [7, 6.5, 6, 5.5, 5], cost: [40, 50, 60, 70, 80], baseDamage: [70, 105, 140, 175, 210], ratio: { stat: "AP", value: 0.65 }, range: 800, topics: ["damage", "mana", "cooldown", "range"] },
      { slot: "W", name: "Force of Will", cooldown: [12, 11, 10, 9, 8], cost: [60, 65, 70, 75, 80], baseDamage: [70, 110, 150, 190, 230], ratio: { stat: "AP", value: 0.7 }, range: 925, topics: ["damage", "mana", "cooldown"] },
      { slot: "E", name: "Scatter the Weak", cooldown: [18, 17, 16, 15, 14], cost: [50, 50, 50, 50, 50], baseDamage: [75, 115, 155, 195, 235], ratio: { stat: "AP", value: 0.45 }, range: 700, topics: ["damage", "cooldown", "movement"] },
      { slot: "R", name: "Unleashed Power", cooldown: [120, 100, 80], cost: [100, 100, 100], baseDamage: [90, 140, 190], ratio: { stat: "AP", value: 0.17 }, range: 675, topics: ["damage", "scaling", "cooldown"] },
    ],
  },
  {
    kind: "champion",
    id: "Lux",
    name: "Lux",
    title: "the Lady of Luminosity",
    role: "Mid / Support · Mage",
    resource: "mana",
    hue: 48,
    base: { hp: 560, hpGrowth: 99, mana: 480, manaGrowth: 23.5, ad: 54, adGrowth: 3.3, armor: 21, armorGrowth: 4.7, ms: 330, range: 550 },
    abilities: [
      { slot: "P", name: "Illumination", cooldown: null, cost: null, baseDamage: null, ratio: null, range: null, topics: ["damage", "scaling"] },
      { slot: "Q", name: "Light Binding", cooldown: [11, 11, 11, 11, 11], cost: [50, 55, 60, 65, 70], baseDamage: [80, 120, 160, 200, 240], ratio: { stat: "AP", value: 0.6 }, range: 1175, topics: ["damage", "range", "mana"] },
      { slot: "W", name: "Prismatic Barrier", cooldown: [13, 12.5, 12, 11.5, 11], cost: [60, 60, 60, 60, 60], baseDamage: null, ratio: { stat: "AP", value: 0.35 }, range: 1075, topics: ["defenses", "cooldown"] },
      { slot: "E", name: "Lucent Singularity", cooldown: [10, 9.5, 9, 8.5, 8], cost: [70, 80, 90, 100, 110], baseDamage: [65, 115, 165, 215, 265], ratio: { stat: "AP", value: 0.8 }, range: 1100, topics: ["damage", "vision", "movement", "mana"] },
      { slot: "R", name: "Final Spark", cooldown: [60, 50, 40], cost: [100, 100, 100], baseDamage: [300, 400, 500], ratio: { stat: "AP", value: 1.0 }, range: 3340, topics: ["damage", "range", "cooldown"] },
    ],
  },
  {
    kind: "champion",
    id: "Jinx",
    name: "Jinx",
    title: "the Loose Cannon",
    role: "Bot · Marksman",
    resource: "mana",
    hue: 196,
    base: { hp: 630, hpGrowth: 105, mana: 260, manaGrowth: 50, ad: 59, adGrowth: 3.15, armor: 26, armorGrowth: 4.7, ms: 325, range: 525 },
    abilities: [
      { slot: "P", name: "Get Excited!", cooldown: null, cost: null, baseDamage: null, ratio: null, range: null, topics: ["movement", "scaling"] },
      { slot: "Q", name: "Switcheroo!", cooldown: [0.9, 0.9, 0.9, 0.9, 0.9], cost: [20, 20, 20, 20, 20], baseDamage: null, ratio: { stat: "AD", value: 0.1 }, range: 600, topics: ["range", "mana", "damage"] },
      { slot: "W", name: "Zap!", cooldown: [8, 7, 6, 5, 4], cost: [50, 50, 50, 50, 50], baseDamage: [10, 60, 110, 160, 210], ratio: { stat: "AD", value: 1.6 }, range: 1450, topics: ["damage", "range", "movement", "cooldown"] },
      { slot: "E", name: "Flame Chompers!", cooldown: [24, 20.5, 17, 13.5, 10], cost: [70, 70, 70, 70, 70], baseDamage: [70, 120, 170, 220, 270], ratio: { stat: "AP", value: 1.0 }, range: 925, topics: ["damage", "cooldown", "vision"] },
      { slot: "R", name: "Super Mega Death Rocket!", cooldown: [85, 65, 45], cost: [100, 100, 100], baseDamage: [300, 450, 600], ratio: { stat: "AD", value: 1.65 }, range: 25000, topics: ["damage", "range", "cooldown"] },
    ],
  },
];

export const ITEMS: ItemSubject[] = [
  { kind: "item", id: "3089", name: "Rabadon's Deathcap", tier: "legendary", hue: 300, cost: 3500, tags: ["ap"], stats: [{ label: "Ability power", value: 130, topic: "scaling" }], passive: { name: "Magical Opus", summary: "Increases total ability power by a percentage (DEMO summary)." } },
  { kind: "item", id: "3157", name: "Zhonya's Hourglass", tier: "legendary", hue: 42, cost: 3250, tags: ["ap", "armor"], stats: [{ label: "Ability power", value: 105, topic: "scaling" }, { label: "Armor", value: 50, topic: "defenses" }, { label: "Ability haste", value: 10, topic: "cooldown" }], passive: { name: "Time Stop", summary: "Active: become untargetable and invulnerable briefly (DEMO summary)." } },
  { kind: "item", id: "6655", name: "Luden's Companion", tier: "legendary", hue: 210, cost: 2900, tags: ["ap", "pen"], stats: [{ label: "Ability power", value: 95, topic: "scaling" }, { label: "Mana", value: 600, topic: "mana" }, { label: "Ability haste", value: 20, topic: "cooldown" }], passive: { name: "Load", summary: "Charges that empower the next ability hit (DEMO summary)." } },
  { kind: "item", id: "3135", name: "Void Staff", tier: "legendary", hue: 275, cost: 3000, tags: ["ap", "pen"], stats: [{ label: "Ability power", value: 95, topic: "scaling" }, { label: "Magic penetration", value: 40, unit: "%", topic: "damage" }], passive: null },
  { kind: "item", id: "3031", name: "Infinity Edge", tier: "legendary", hue: 20, cost: 3450, tags: ["ad", "crit"], stats: [{ label: "Attack damage", value: 65, topic: "damage" }, { label: "Critical strike chance", value: 25, unit: "%", topic: "damage" }], passive: { name: "Perfection", summary: "Bonus critical strike damage (DEMO summary)." } },
  { kind: "item", id: "6672", name: "Kraken Slayer", tier: "legendary", hue: 180, cost: 3100, tags: ["ad"], stats: [{ label: "Attack damage", value: 45, topic: "damage" }, { label: "Attack speed", value: 40, unit: "%", topic: "damage" }, { label: "Move speed", value: 7, unit: "%", topic: "movement" }], passive: { name: "Bring It Down", summary: "Every third attack deals bonus damage (DEMO summary)." } },
];

export const SUBJECTS: Subject[] = [...CHAMPIONS, ...ITEMS];

export function findSubject(ref: SubjectRef | null): Subject | null {
  if (!ref) return null;
  return SUBJECTS.find((s) => s.kind === ref.kind && s.id === ref.id) ?? null;
}

export function subjectName(ref: SubjectRef | null): string {
  return findSubject(ref)?.name ?? ref?.id ?? "";
}

/** DEMO level scaling: linear base + growth × (level − 1). */
export function statAtLevel(base: number, growth: number, level: number): number {
  return Math.round((base + growth * (Math.max(1, Math.min(18, level)) - 1)) * 10) / 10;
}

/* ------------------------------------------------------------------------- */
/* Question corpus                                                           */
/* ------------------------------------------------------------------------- */

export type FamilyId = "ability-numbers" | "comparison" | "scenario" | "item-identity" | "lore-trivia" | "answer-key-family";

export interface FamilyInfo {
  id: FamilyId;
  label: string;
  /** Premise-safety certification of the family's subject edges. */
  certified: boolean;
  note: string;
}

export const FAMILIES: FamilyInfo[] = [
  { id: "ability-numbers", label: "Ability numbers", certified: true, note: "Prompt names the champion and ability; values are the answer." },
  { id: "comparison", label: "Comparison", certified: true, note: "Prompt names both operands." },
  { id: "scenario", label: "Scenario", certified: true, note: "Prompt sets a scene with named champions and items." },
  { id: "item-identity", label: "Item identity", certified: true, note: "Prompt names the item; its stat is the answer." },
  { id: "lore-trivia", label: "Lore trivia", certified: false, note: "Edges not yet certified premise-safe; fails closed outside admin inventory." },
  { id: "answer-key-family", label: "Answer-keyed", certified: false, note: "The subject IS the answer; never exposed as a public edge." },
];

export interface QuestionEdge {
  subject: SubjectRef;
  role: EdgeRole;
}

export interface DemoQuestion {
  handle: string;
  prompt: string;
  family: FamilyId;
  edges: QuestionEdge[];
  topics: Topic[];
  abilitySlot: AbilitySlot | null;
  championLevel: Applicability;
  abilityRank: Applicability;
  serveState: "serveable" | "hold" | "retired";
  sourceStatus: "current" | "frozen" | "unavailable";
  /** Demo account's Ranked discoveries. */
  discoveredByDemoUser: boolean;
  /** Demo Premium reviewer's missed attempts. */
  demoAttempt: { attempted_at: string; outcome: "missed" | "correct" } | null;
}

const ahri: SubjectRef = { kind: "champion", id: "Ahri" };
const syndra: SubjectRef = { kind: "champion", id: "Syndra" };
const lux: SubjectRef = { kind: "champion", id: "Lux" };
const jinx: SubjectRef = { kind: "champion", id: "Jinx" };
const deathcap: SubjectRef = { kind: "item", id: "3089" };
const zhonya: SubjectRef = { kind: "item", id: "3157" };
const ludens: SubjectRef = { kind: "item", id: "6655" };
const voidstaff: SubjectRef = { kind: "item", id: "3135" };
const ie: SubjectRef = { kind: "item", id: "3031" };
const kraken: SubjectRef = { kind: "item", id: "6672" };

const agnostic: Applicability = { kind: "agnostic" };
const rank = (value: number): Applicability => ({ kind: "specific", value });
const level = (min: number, max: number): Applicability => ({ kind: "interval", min, max });

let seq = 0;
function q(partial: Omit<DemoQuestion, "handle" | "serveState" | "sourceStatus" | "discoveredByDemoUser" | "demoAttempt"> & Partial<Pick<DemoQuestion, "serveState" | "sourceStatus" | "discoveredByDemoUser" | "demoAttempt">>): DemoQuestion {
  seq += 1;
  return {
    handle: `demo-q-${String(seq).padStart(3, "0")}`,
    serveState: "serveable",
    sourceStatus: "current",
    discoveredByDemoUser: false,
    demoAttempt: null,
    ...partial,
  };
}

export const QUESTIONS: DemoQuestion[] = [
  // Ahri — ability numbers
  q({ prompt: "What is the mana cost of Ahri's Orb of Deception at rank 1?", family: "ability-numbers", edges: [{ subject: ahri, role: "premise_subject" }], topics: ["mana"], abilitySlot: "Q", championLevel: agnostic, abilityRank: rank(1), discoveredByDemoUser: true }),
  q({ prompt: "By how much does Orb of Deception's mana cost rise per rank?", family: "ability-numbers", edges: [{ subject: ahri, role: "premise_subject" }], topics: ["mana", "scaling"], abilitySlot: "Q", championLevel: agnostic, abilityRank: agnostic }),
  q({ prompt: "What is the cooldown of Ahri's Charm at rank 5?", family: "ability-numbers", edges: [{ subject: ahri, role: "premise_subject" }], topics: ["cooldown"], abilitySlot: "E", championLevel: agnostic, abilityRank: rank(5), discoveredByDemoUser: true, demoAttempt: { attempted_at: "2026-10-18T19:12:00Z", outcome: "missed" } }),
  q({ prompt: "How much mana does Ahri's Fox-Fire cost?", family: "ability-numbers", edges: [{ subject: ahri, role: "premise_subject" }], topics: ["mana"], abilitySlot: "W", championLevel: agnostic, abilityRank: agnostic }),
  q({ prompt: "What is the base cooldown of Spirit Rush at rank 2?", family: "ability-numbers", edges: [{ subject: ahri, role: "premise_subject" }], topics: ["cooldown"], abilitySlot: "R", championLevel: level(11, 18), abilityRank: rank(2), demoAttempt: { attempted_at: "2026-10-20T02:40:00Z", outcome: "missed" } }),
  q({ prompt: "What is the cast range of Ahri's Charm?", family: "ability-numbers", edges: [{ subject: ahri, role: "premise_subject" }], topics: ["range"], abilitySlot: "E", championLevel: agnostic, abilityRank: agnostic, discoveredByDemoUser: true }),
  q({ prompt: "What AP ratio does Orb of Deception carry on each pass?", family: "ability-numbers", edges: [{ subject: ahri, role: "premise_subject" }], topics: ["damage", "scaling"], abilitySlot: "Q", championLevel: agnostic, abilityRank: agnostic }),
  q({ prompt: "How much mana does Ahri have at level 9?", family: "ability-numbers", edges: [{ subject: ahri, role: "premise_subject" }], topics: ["mana", "scaling"], abilitySlot: null, championLevel: { kind: "specific", value: 9 }, abilityRank: agnostic }),
  q({ prompt: "Which Ahri ability grants movement speed on cast?", family: "ability-numbers", edges: [{ subject: ahri, role: "premise_subject" }], topics: ["movement"], abilitySlot: null, championLevel: agnostic, abilityRank: agnostic, serveState: "hold" }),
  // Syndra — ability numbers
  q({ prompt: "What is the mana cost of Syndra's Dark Sphere at rank 3?", family: "ability-numbers", edges: [{ subject: syndra, role: "premise_subject" }], topics: ["mana"], abilitySlot: "Q", championLevel: agnostic, abilityRank: rank(3), discoveredByDemoUser: true }),
  q({ prompt: "What is the cooldown of Dark Sphere at max rank?", family: "ability-numbers", edges: [{ subject: syndra, role: "premise_subject" }], topics: ["cooldown"], abilitySlot: "Q", championLevel: agnostic, abilityRank: rank(5) }),
  q({ prompt: "How far can Syndra's Force of Will throw a sphere?", family: "ability-numbers", edges: [{ subject: syndra, role: "premise_subject" }], topics: ["range"], abilitySlot: "W", championLevel: agnostic, abilityRank: agnostic, demoAttempt: { attempted_at: "2026-10-21T21:05:00Z", outcome: "missed" } }),
  q({ prompt: "What is the cooldown of Scatter the Weak at rank 1?", family: "ability-numbers", edges: [{ subject: syndra, role: "premise_subject" }], topics: ["cooldown"], abilitySlot: "E", championLevel: agnostic, abilityRank: rank(1) }),
  q({ prompt: "How much mana does Syndra gain per level?", family: "ability-numbers", edges: [{ subject: syndra, role: "premise_subject" }], topics: ["mana", "scaling"], abilitySlot: null, championLevel: agnostic, abilityRank: agnostic }),
  // Comparisons (both operands named in the prompt)
  q({ prompt: "Which costs more mana at rank 1: Ahri's Orb of Deception or Syndra's Dark Sphere?", family: "comparison", edges: [{ subject: ahri, role: "comparison_operand" }, { subject: syndra, role: "comparison_operand" }], topics: ["mana"], abilitySlot: "Q", championLevel: agnostic, abilityRank: rank(1), discoveredByDemoUser: true }),
  q({ prompt: "Which has the shorter cooldown at rank 5: Dark Sphere or Orb of Deception?", family: "comparison", edges: [{ subject: ahri, role: "comparison_operand" }, { subject: syndra, role: "comparison_operand" }], topics: ["cooldown"], abilitySlot: "Q", championLevel: agnostic, abilityRank: rank(5), demoAttempt: { attempted_at: "2026-10-19T04:22:00Z", outcome: "missed" } }),
  q({ prompt: "Whose Q reaches further: Ahri's or Syndra's?", family: "comparison", edges: [{ subject: ahri, role: "comparison_operand" }, { subject: syndra, role: "comparison_operand" }], topics: ["range"], abilitySlot: "Q", championLevel: agnostic, abilityRank: agnostic }),
  q({ prompt: "At level 6, who has more base mana: Ahri or Syndra?", family: "comparison", edges: [{ subject: ahri, role: "comparison_operand" }, { subject: syndra, role: "comparison_operand" }], topics: ["mana", "scaling"], abilitySlot: null, championLevel: { kind: "specific", value: 6 }, abilityRank: agnostic }),
  q({ prompt: "Which ultimate has the longer base cooldown at rank 1: Spirit Rush or Final Spark?", family: "comparison", edges: [{ subject: ahri, role: "comparison_operand" }, { subject: lux, role: "comparison_operand" }], topics: ["cooldown"], abilitySlot: "R", championLevel: agnostic, abilityRank: rank(1) }),
  q({ prompt: "Which Q costs more mana at rank 1: Lux's Light Binding or Syndra's Dark Sphere?", family: "comparison", edges: [{ subject: lux, role: "comparison_operand" }, { subject: syndra, role: "comparison_operand" }], topics: ["mana"], abilitySlot: "Q", championLevel: agnostic, abilityRank: rank(1) }),
  q({ prompt: "Which item grants more ability power: Rabadon's Deathcap or Void Staff?", family: "comparison", edges: [{ subject: deathcap, role: "comparison_operand" }, { subject: voidstaff, role: "comparison_operand" }], topics: ["scaling"], abilitySlot: null, championLevel: agnostic, abilityRank: agnostic, discoveredByDemoUser: true }),
  q({ prompt: "Which costs more gold: Infinity Edge or Kraken Slayer?", family: "comparison", edges: [{ subject: ie, role: "comparison_operand" }, { subject: kraken, role: "comparison_operand" }], topics: ["cost"], abilitySlot: null, championLevel: agnostic, abilityRank: agnostic }),
  // Scenarios (champion + item named in the prompt)
  q({ prompt: "Syndra holds Zhonya's Hourglass. Which stat on the item lowers her Dark Sphere cooldown?", family: "scenario", edges: [{ subject: syndra, role: "premise_subject" }, { subject: zhonya, role: "scenario_context" }], topics: ["cooldown"], abilitySlot: "Q", championLevel: agnostic, abilityRank: agnostic }),
  q({ prompt: "Ahri buys Luden's Companion first. How much mana does the item add?", family: "scenario", edges: [{ subject: ahri, role: "premise_subject" }, { subject: ludens, role: "scenario_context" }], topics: ["mana"], abilitySlot: null, championLevel: agnostic, abilityRank: agnostic, discoveredByDemoUser: true }),
  q({ prompt: "Jinx with Infinity Edge: which Jinx ability scales with critical strike chance?", family: "scenario", edges: [{ subject: jinx, role: "premise_subject" }, { subject: ie, role: "scenario_context" }], topics: ["damage", "scaling"], abilitySlot: null, championLevel: agnostic, abilityRank: agnostic }),
  // Item identity
  q({ prompt: "How much ability power does Rabadon's Deathcap grant?", family: "item-identity", edges: [{ subject: deathcap, role: "premise_subject" }], topics: ["scaling"], abilitySlot: null, championLevel: agnostic, abilityRank: agnostic, discoveredByDemoUser: true }),
  q({ prompt: "How much armor does Zhonya's Hourglass grant?", family: "item-identity", edges: [{ subject: zhonya, role: "premise_subject" }], topics: ["defenses"], abilitySlot: null, championLevel: agnostic, abilityRank: agnostic }),
  q({ prompt: "How much mana does Luden's Companion grant?", family: "item-identity", edges: [{ subject: ludens, role: "premise_subject" }], topics: ["mana"], abilitySlot: null, championLevel: agnostic, abilityRank: agnostic }),
  q({ prompt: "What percentage of magic penetration does Void Staff grant?", family: "item-identity", edges: [{ subject: voidstaff, role: "premise_subject" }], topics: ["damage"], abilitySlot: null, championLevel: agnostic, abilityRank: agnostic, demoAttempt: { attempted_at: "2026-10-17T11:00:00Z", outcome: "missed" } }),
  q({ prompt: "What is the total gold cost of Zhonya's Hourglass?", family: "item-identity", edges: [{ subject: zhonya, role: "premise_subject" }], topics: ["cost"], abilitySlot: null, championLevel: agnostic, abilityRank: agnostic, sourceStatus: "frozen" }),
  // Uncertified families: visible ONLY in admin inventory.
  q({ prompt: "Which region does Ahri call home?", family: "lore-trivia", edges: [{ subject: ahri, role: "unverified" }], topics: [], abilitySlot: null, championLevel: agnostic, abilityRank: agnostic }),
  q({ prompt: "Which champion's ultimate is named Unleashed Power?", family: "answer-key-family", edges: [{ subject: syndra, role: "answer_subject" }], topics: ["cooldown"], abilitySlot: "R", championLevel: agnostic, abilityRank: agnostic }),
  q({ prompt: "Which item is nicknamed 'Deathcap'?", family: "answer-key-family", edges: [{ subject: deathcap, role: "answer_subject" }], topics: [], abilitySlot: null, championLevel: agnostic, abilityRank: agnostic, serveState: "retired" }),
];

/** A clearly labelled starting investigation for the empty screen. */
export const FEATURED_INVESTIGATION = {
  label: "Featured demo investigation",
  description: "Ahri against Syndra, Syndra holding Zhonya's Hourglass, Questions view on the mana topic.",
  a: ahri,
  b: syndra,
  b1ItemId: "3157",
  topics: ["mana"] as Topic[],
};
