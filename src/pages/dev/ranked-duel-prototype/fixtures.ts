// ---------------------------------------------------------------------------
// Ranked 1v1 duel PROTOTYPE fixtures.
//
// Everything in this file is frontend presentation/mock data for the
// /dev/ranked-duel prototype. None of these numbers are final game balance,
// and none of these shapes are a proposed production API schema. The real
// round-resolution engine lives in the backend and is not integrated here.
// ---------------------------------------------------------------------------

export type PlayerId = "p1" | "p2";
export type DuelClassId = "tank" | "mage" | "marksman";

export interface PrototypeAbility {
  id: string;
  name: string;
  /** Level at which this mock ability slot unlocks. */
  unlockLevel: number;
  /** Flavor only — abilities have no combat effect in this prototype. */
  blurb: string;
}

export interface DuelClass {
  id: DuelClassId;
  name: string;
  identity: string;
  /** Presentation fixture only — demonstrates class HP differentiation. */
  startingHp: number;
  abilities: PrototypeAbility[]; // exactly 3 mock slots
}

export const DUEL_CLASSES: DuelClass[] = [
  {
    id: "tank",
    name: "Tank",
    identity: "Durable frontliner. Wins long matches by outlasting mistakes.",
    startingHp: 120,
    abilities: [
      { id: "tank-1", name: "Bulwark", unlockLevel: 1, blurb: "Mock: brace for a round." },
      { id: "tank-2", name: "Taunt", unlockLevel: 2, blurb: "Mock: pressure the enemy." },
      { id: "tank-3", name: "Unbreakable", unlockLevel: 3, blurb: "Mock: future ultimate slot." },
    ],
  },
  {
    id: "mage",
    name: "Mage",
    identity: "Burst caster. Punishes wrong answers with heavy damage swings.",
    startingHp: 90,
    abilities: [
      { id: "mage-1", name: "Ignite Mind", unlockLevel: 1, blurb: "Mock: amplify a round." },
      { id: "mage-2", name: "Frost Ward", unlockLevel: 2, blurb: "Mock: defensive option." },
      { id: "mage-3", name: "Arcane Surge", unlockLevel: 3, blurb: "Mock: future ultimate slot." },
    ],
  },
  {
    id: "marksman",
    name: "Marksman",
    identity: "Consistent damage. Rewards fast, accurate answer streaks.",
    startingHp: 95,
    abilities: [
      { id: "mm-1", name: "Steady Aim", unlockLevel: 1, blurb: "Mock: consistency bonus." },
      { id: "mm-2", name: "Quickdraw", unlockLevel: 2, blurb: "Mock: speed option." },
      { id: "mm-3", name: "Headshot", unlockLevel: 3, blurb: "Mock: future ultimate slot." },
    ],
  },
];

export const getDuelClass = (id: DuelClassId): DuelClass =>
  DUEL_CLASSES.find((c) => c.id === id)!;

// --- Timer fixtures ---------------------------------------------------------
/** Shared round timer, in whole seconds. */
export const ROUND_SECONDS = 20;
/** First answer submission cuts the shared timer by this many seconds, once. */
export const FIRST_ANSWER_CUT_SECONDS = 5;
/** Deterministic pause on `awaiting_reveal` before the reveal renders. */
export const REVEAL_DELAY_MS = 900;

// --- Damage fixtures (mock — NOT the backend formula) -----------------------
export const DAMAGE = {
  /** Only-correct player hits for full mock damage. */
  soloCorrect: 30,
  /** Both correct: the faster player hits for reduced mock damage. */
  bothCorrectFaster: 18,
  /** Both wrong / both timed out: a wash. */
  wash: 0,
} as const;

// --- XP fixtures (mock) ------------------------------------------------------
// XP is stable per round and intentionally close across outcomes so XP does
// not snowball — HP is the score, XP is gradual progression.
export const XP = {
  correct: 20,
  incorrect: 16,
  timedOut: 14,
} as const;

/** Cumulative XP needed to REACH each level (index 0 = level 1). */
export const LEVEL_THRESHOLDS = [0, 40, 100, 200];
/** Ultimate slot is presented as "future" — no finalized max-level system. */

export const levelForXp = (xp: number): number => {
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  return level;
};

// --- Mock identities & questions ---------------------------------------------
export const MOCK_PLAYERS: Record<PlayerId, { name: string; tag: string }> = {
  p1: { name: "BlueSideBravo", tag: "Challenger of Trivia" },
  p2: { name: "RedSideRaptor", tag: "Grandmaster Guesser" },
};

export interface MockQuestion {
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
}

export const MOCK_QUESTIONS: MockQuestion[] = [
  {
    prompt: "Which champion's passive is called 'Adaptive Defenses'?",
    choices: ["Camille", "Fiora", "Jax", "Riven"],
    correctIndex: 0,
    explanation: "Camille's passive shields her based on the attacker's damage type.",
  },
  {
    prompt: "What does Baron Nashor's buff empower besides champions?",
    choices: ["Turrets", "Nearby minions", "Wards", "Dragon"],
    correctIndex: 1,
    explanation: "Hand of Baron empowers nearby minions.",
  },
  {
    prompt: "Which item grants the 'Immolate' burn effect?",
    choices: ["Thornmail", "Sunfire Aegis", "Randuin's Omen", "Dead Man's Plate"],
    correctIndex: 1,
    explanation: "Sunfire Aegis carries the Immolate passive.",
  },
  {
    prompt: "At what level do champions unlock their ultimate (most champions)?",
    choices: ["Level 5", "Level 6", "Level 8", "Level 4"],
    correctIndex: 1,
    explanation: "Most ultimates unlock at level 6.",
  },
  {
    prompt: "Which dragon soul grants a shield when above 50% HP?",
    choices: ["Ocean", "Mountain", "Cloud", "Infernal"],
    correctIndex: 1,
    explanation: "Mountain Soul grants a recurring shield.",
  },
  {
    prompt: "What is the cooldown of Flash (without haste)?",
    choices: ["240s", "300s", "180s", "270s"],
    correctIndex: 1,
    explanation: "Flash has a 300 second cooldown.",
  },
];
