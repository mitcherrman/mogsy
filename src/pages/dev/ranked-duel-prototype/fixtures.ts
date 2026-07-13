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

export type AbilitySlot = "starter" | "normal" | "ultimate";

export interface PrototypeAbility {
  id: string;
  name: string;
  /** Flavor only — abilities have no combat effect in this prototype. */
  description: string;
  /** Level at which this mock ability slot unlocks. */
  unlockLevel: number;
  slot: AbilitySlot;
  /** Optional prototype disclaimer shown on ability cards. */
  disclaimer?: string;
}

export interface DuelClass {
  id: DuelClassId;
  name: string;
  identity: string;
  /** Presentation fixture only — demonstrates class HP differentiation. */
  startingHp: number;
  /** Level 1: every player begins with exactly this ability. */
  starterAbility: PrototypeAbility;
  /** Level 2: the player picks exactly ONE of these two normal abilities. */
  levelTwoChoices: [PrototypeAbility, PrototypeAbility];
  /** Level 3 (prototype max): unlocks automatically, never manually chosen. */
  ultimate: PrototypeAbility;
}

const MOCK_NOTE = "Prototype concept — no gameplay effect.";

export const DUEL_CLASSES: DuelClass[] = [
  {
    id: "tank",
    name: "Tank",
    identity: "Durable frontliner. Wins long matches by outlasting mistakes.",
    startingHp: 120,
    starterAbility: {
      id: "tank-starter",
      name: "Bulwark",
      description: "Brace behind your shield for a round.",
      unlockLevel: 1,
      slot: "starter",
      disclaimer: MOCK_NOTE,
    },
    levelTwoChoices: [
      {
        id: "tank-l2-taunt",
        name: "Taunt",
        description: "Pressure the enemy into a rushed answer.",
        unlockLevel: 2,
        slot: "normal",
        disclaimer: MOCK_NOTE,
      },
      {
        id: "tank-l2-slam",
        name: "Shield Slam",
        description: "Turn your defenses into a counterblow.",
        unlockLevel: 2,
        slot: "normal",
        disclaimer: MOCK_NOTE,
      },
    ],
    ultimate: {
      id: "tank-ult",
      name: "Unbreakable",
      description: "Become immovable for a decisive moment.",
      unlockLevel: 3,
      slot: "ultimate",
      disclaimer: MOCK_NOTE,
    },
  },
  {
    id: "mage",
    name: "Mage",
    identity: "Burst caster. Punishes wrong answers with heavy damage swings.",
    startingHp: 90,
    starterAbility: {
      id: "mage-starter",
      name: "Ignite Mind",
      description: "Sharpen your focus and amplify a round.",
      unlockLevel: 1,
      slot: "starter",
      disclaimer: MOCK_NOTE,
    },
    levelTwoChoices: [
      {
        id: "mage-l2-ward",
        name: "Frost Ward",
        description: "A defensive barrier of rime.",
        unlockLevel: 2,
        slot: "normal",
        disclaimer: MOCK_NOTE,
      },
      {
        id: "mage-l2-barrier",
        name: "Mana Barrier",
        description: "Convert reserves into protection.",
        unlockLevel: 2,
        slot: "normal",
        disclaimer: MOCK_NOTE,
      },
    ],
    ultimate: {
      id: "mage-ult",
      name: "Arcane Surge",
      description: "Unleash stored power all at once.",
      unlockLevel: 3,
      slot: "ultimate",
      disclaimer: MOCK_NOTE,
    },
  },
  {
    id: "marksman",
    name: "Marksman",
    identity: "Consistent damage. Rewards fast, accurate answer streaks.",
    startingHp: 95,
    starterAbility: {
      id: "mm-starter",
      name: "Steady Aim",
      description: "Reward consistent, careful answers.",
      unlockLevel: 1,
      slot: "starter",
      disclaimer: MOCK_NOTE,
    },
    levelTwoChoices: [
      {
        id: "mm-l2-quickdraw",
        name: "Quickdraw",
        description: "Lean into speed over caution.",
        unlockLevel: 2,
        slot: "normal",
        disclaimer: MOCK_NOTE,
      },
      {
        id: "mm-l2-focus",
        name: "Trueshot Focus",
        description: "Line up the perfect follow-up.",
        unlockLevel: 2,
        slot: "normal",
        disclaimer: MOCK_NOTE,
      },
    ],
    ultimate: {
      id: "mm-ult",
      name: "Headshot",
      description: "One decisive, unmissable strike.",
      unlockLevel: 3,
      slot: "ultimate",
      disclaimer: MOCK_NOTE,
    },
  },
];

export const getDuelClass = (id: DuelClassId): DuelClass =>
  DUEL_CLASSES.find((c) => c.id === id)!;

/** All four ability definitions of a class, in unlock order. */
export const allClassAbilities = (cls: DuelClass): PrototypeAbility[] => [
  cls.starterAbility,
  ...cls.levelTwoChoices,
  cls.ultimate,
];

export const findClassAbility = (
  cls: DuelClass,
  abilityId: string | null,
): PrototypeAbility | undefined =>
  abilityId ? allClassAbilities(cls).find((a) => a.id === abilityId) : undefined;

/**
 * Abilities a player can actually use in the question phase: the starter,
 * the confirmed Level 2 pick (the unchosen option stays unavailable for the
 * match), and the ultimate once Level 3 (prototype max) is reached.
 */
export const usableAbilities = (
  cls: DuelClass,
  level: number,
  chosenLevelTwoAbilityId: string | null,
): PrototypeAbility[] => {
  const out: PrototypeAbility[] = [cls.starterAbility];
  const chosen = cls.levelTwoChoices.find((a) => a.id === chosenLevelTwoAbilityId);
  if (chosen) out.push(chosen);
  if (level >= MAX_LEVEL) out.push(cls.ultimate);
  return out;
};

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

/**
 * Cumulative XP needed to REACH each level (index 0 = level 1).
 * Level 3 is the prototype maximum — there is deliberately no Level 4
 * threshold; XP keeps accumulating visually but nothing further unlocks.
 * Presentation fixture only.
 */
export const LEVEL_THRESHOLDS = [0, 40, 100];
export const MAX_LEVEL = LEVEL_THRESHOLDS.length; // 3

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
