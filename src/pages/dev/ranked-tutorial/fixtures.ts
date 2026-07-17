// ---------------------------------------------------------------------------
// Ranked TUTORIAL fixtures — deterministic, authored, tutorial-owned.
//
// Two kinds of values live here and are labeled accordingly:
//
//  VERIFIED CONTRACT — copied from the backend Ranked engine (the source of
//  truth), verified read-only in League_Combat_Simulator:
//    - Tank roster/progression: duel_class_engine.py (build_default_catalog,
//      ClassProgression.level2_choice_options / level3_auto_unlock_id)
//    - Charges: duel_class_engine.py _init_charges (+ armed-use commitment
//      rule in duel_modifier_engine.py)
//    - Timer: duel_round_engine.py DuelConfig (round_duration_seconds=30,
//      pressure_shorten_seconds=5, applied once per round)
//    - XP/levels: duel_round_engine.py (12/9/8), duel_match_engine.py
//      MatchConfig.level_thresholds=(0, 30, 66), level 3 max
//    - Tank starting HP: duel_combat_integration.py
//      DEFAULT_CLASS_STARTING_HP (Tank 170)
//
//  TUTORIAL-AUTHORED — identities, questions, scripted opponent behavior,
//  and instructional pacing. These are training-room props, deliberately
//  easy, and are NOT Ranked balance constants or production question data.
//
// The backend labels several of the verified numbers "provisional balance
// fixtures" — if balance changes upstream, this file must be re-verified.
// ---------------------------------------------------------------------------

// --- VERIFIED CONTRACT: Tank roster & progression ---------------------------

export interface TutorialAbility {
  /** Real production ability id (verified). */
  id: string;
  name: string;
  description: string;
  /** Charges per match (verified; Barrier is once-per-match). */
  charges: number;
}

/** Level 1 starter — every Tank begins with this. */
export const TANK_STARTER: TutorialAbility = {
  id: "tank.fortify",
  name: "Fortify",
  description:
    "After the Tank answers correctly, gain five additional seconds on the next question.",
  charges: 3,
};

/** The two Level 2 choice options, in backend declaration order. */
export const TANK_LEVEL_TWO_OPTIONS: readonly [TutorialAbility, TutorialAbility] = [
  {
    id: "tank.brace",
    name: "Brace",
    description:
      "Reduce incoming damage this round if you answer incorrectly while your opponent answers correctly.",
    charges: 3,
  },
  {
    id: "tank.barrier",
    name: "Barrier",
    description: "Raise a one-time shield that persists until it absorbs damage.",
    charges: 1,
  },
];

/** Level 3 always auto-unlocks the Level 2 option the player did NOT choose. */
export const tankLevelThreeUnlock = (
  chosenLevelTwoAbilityId: string,
): TutorialAbility | undefined =>
  TANK_LEVEL_TWO_OPTIONS.find((a) => a.id !== chosenLevelTwoAbilityId);

// --- VERIFIED CONTRACT: timer, XP, levels, HP --------------------------------

/** Shared round timer (seconds). */
export const ROUND_SECONDS = 30;
/** First answer (either player) shortens the shared timer once by this much. */
export const FIRST_ANSWER_CUT_SECONDS = 5;

/** Per-round XP: correct / incorrect-but-submitted / timeout. */
export const XP = { correct: 12, incorrect: 9, timedOut: 8 } as const;

/** Cumulative XP to REACH each level (index 0 = level 1). Level 3 is max. */
export const LEVEL_THRESHOLDS = [0, 30, 66] as const;
export const MAX_LEVEL = LEVEL_THRESHOLDS.length; // 3

/** Tank starting HP (production default arm). */
export const TANK_STARTING_HP = 170;

// --- TUTORIAL-AUTHORED: identities -------------------------------------------

/**
 * Training-room identities. The opponent is an openly scripted training
 * dummy — copy should never present it as a real matched player.
 */
export const TUTORIAL_PLAYER = { name: "You", tag: "Tank in training" } as const;
export const TUTORIAL_OPPONENT = {
  name: "Training Golem",
  tag: "Scripted sparring partner",
} as const;

// --- TUTORIAL-AUTHORED: questions ---------------------------------------------
// Deliberately easy, written for the tutorial only. Not production content.

export interface TutorialQuestion {
  prompt: string;
  choices: string[];
  /** Authored answer key. NEVER copied into visible machine state. */
  correctIndex: number;
}

export const TUTORIAL_QUESTIONS: TutorialQuestion[] = [
  {
    prompt: "How many players fight on each team on Summoner's Rift?",
    choices: ["Three", "Five", "Seven", "Ten"],
    correctIndex: 1,
  },
  {
    prompt: "What color is the enemy Nexus explosion when you win?",
    choices: ["It never explodes", "Blue only", "It explodes — you win!", "Grey"],
    correctIndex: 2,
  },
  {
    prompt: "Which lane runs through the middle of the map?",
    choices: ["Top lane", "Mid lane", "Bot lane", "The jungle"],
    correctIndex: 1,
  },
  {
    prompt: "What do you earn by defeating minions?",
    choices: ["Gold", "Real money", "Nothing", "Skins"],
    correctIndex: 0,
  },
  {
    prompt: "Which of these is a Tank's job in a team fight?",
    choices: ["Hide in base", "Soak damage up front", "Farm jungle only", "AFK"],
    correctIndex: 1,
  },
];

// --- TUTORIAL-AUTHORED: opponent script ----------------------------------------
// Deterministic plan for the Training Golem, keyed by demo round. Kept out of
// TutorialState — the machine folds a scripted result in only at reveal time.

export interface OpponentScriptEntry {
  /** Index into TUTORIAL_QUESTIONS. */
  questionIndex: number;
  answerIndex: number;
  correct: boolean;
  /** Seconds remaining on the shared timer when the Golem "answers". */
  answersAtRemaining: number;
  abilityId: string | null;
}

export const OPPONENT_SCRIPT: Record<string, OpponentScriptEntry> = {
  // Golem answers wrong so the player's first correct answer deals damage.
  damage_intro: {
    questionIndex: 0,
    answerIndex: 0,
    correct: false,
    answersAtRemaining: 12,
    abilityId: null,
  },
  // Golem answers fast and correct to demonstrate the −5s cut + speed rule.
  both_correct_demo: {
    questionIndex: 2,
    answerIndex: 1,
    correct: true,
    answersAtRemaining: 24,
    abilityId: null,
  },
  // Golem also fails, demonstrating the both-miss wash.
  failure_demo: {
    questionIndex: 3,
    answerIndex: 2,
    correct: false,
    answersAtRemaining: 6,
    abilityId: null,
  },
  // Final round: Golem misses, the player lands the winning hit.
  victory_round: {
    questionIndex: 4,
    answerIndex: 0,
    correct: false,
    answersAtRemaining: 10,
    abilityId: null,
  },
};

// --- TUTORIAL-SCALED demo values ------------------------------------------------
// Damage numbers shown in demos are TUTORIAL-SCALED illustrations (the real
// damage formula is backend-owned and not reproduced here). Instructional
// copy must present them as training numbers, not Ranked balance.
export const TUTORIAL_DEMO_DAMAGE = {
  soloCorrect: 40,
  bothCorrectFaster: 20,
  wash: 0,
} as const;
