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
//      pressure_shorten_seconds=5, applied once per round on the FIRST
//      answer from either player)
//    - XP/levels: duel_round_engine.py (correct 12 / incorrect 9 / timeout
//      8), duel_match_engine.py MatchConfig.level_thresholds=(0, 30, 66),
//      level 3 max
//    - Tank starting HP: duel_combat_integration.py
//      DEFAULT_CLASS_STARTING_HP (Tank 170)
//
//  TUTORIAL-AUTHORED — identities, questions, scripted opponent behavior,
//  resolved round outcomes, and instructional pacing. Training-room props,
//  deliberately easy, NOT Ranked balance constants or production content.
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

/** Level derived from total XP using the verified thresholds. */
export const levelForXp = (xp: number): number => {
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  return level;
};

/** Tank starting HP (production default arm). */
export const TANK_STARTING_HP = 170;

// --- TUTORIAL-AUTHORED: identities -------------------------------------------

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
}

// NOTE: answer keys deliberately live in the round fixtures below (authored
// data folded in only at coaching/reveal time), never on the question object
// that reaches visible state.
export const TUTORIAL_QUESTIONS: TutorialQuestion[] = [
  {
    prompt: "How many players fight on each team on Summoner's Rift?",
    choices: ["Three", "Five", "Seven", "Ten"],
  },
  {
    prompt: "Which lane runs through the middle of the map?",
    choices: ["Top lane", "Mid lane", "Bot lane", "The jungle"],
  },
  {
    prompt: "What do you earn by defeating minions?",
    choices: ["Gold", "Real money", "Nothing", "Skins"],
  },
];

// --- TUTORIAL-SCALED demo damage -------------------------------------------------
// Demonstration numbers only — the real damage formula is backend-owned and
// is NOT reproduced here. Copy must present these as training values.
export const TUTORIAL_DEMO_DAMAGE = {
  soloCorrect: 40,
  bothCorrect: 20,
  wash: 0,
} as const;

// --- TUTORIAL-AUTHORED: resolved round fixtures ----------------------------------
// The machine APPLIES these — it never computes combat results. XP awards use
// the verified authoritative values; damage is tutorial-scaled.

export type TutorialRoundId = "A" | "B" | "C";

export interface ResolvedRoundFixture {
  roundId: TutorialRoundId;
  questionIndex: number;
  /** Authored answer the coaching guides the player to lock. */
  playerAnswer: number;
  /** Scripted Golem behavior. null answer = timeout. */
  opponentAnswer: number | null;
  playerCorrect: boolean;
  opponentCorrect: boolean;
  playerTimedOut: boolean;
  opponentTimedOut: boolean;
  /** Tutorial-scaled damage each side DEALS. */
  playerDamage: number;
  opponentDamage: number;
  playerHpBefore: number;
  playerHpAfter: number;
  opponentHpBefore: number;
  opponentHpAfter: number;
  playerXpBefore: number;
  playerXpAwarded: number;
  playerXpAfter: number;
  opponentXpBefore: number;
  opponentXpAwarded: number;
  opponentXpAfter: number;
  playerLevelBefore: number;
  playerLevelAfter: number;
  timerStart: number;
  /** Seconds remaining when the Golem submits (null = it never answers). */
  opponentAnsweredAt: number | null;
  pressureCutApplied: boolean;
  abilityId: string | null;
  chargeConsumed: boolean;
  /** One-sentence result explanation, announced at reveal. */
  resultCopy: string;
}

export const TUTORIAL_ROUNDS: Record<TutorialRoundId, ResolvedRoundFixture> = {
  // Round A — player correct, Golem wrong. Teaches lock, hidden info,
  // simultaneous reveal, and solo-correct damage.
  A: {
    roundId: "A",
    questionIndex: 0,
    playerAnswer: 1, // "Five"
    opponentAnswer: 0, // "Three" — scripted wrong
    playerCorrect: true,
    opponentCorrect: false,
    playerTimedOut: false,
    opponentTimedOut: false,
    playerDamage: TUTORIAL_DEMO_DAMAGE.soloCorrect,
    opponentDamage: 0,
    playerHpBefore: 170,
    playerHpAfter: 170,
    opponentHpBefore: 170,
    opponentHpAfter: 130,
    playerXpBefore: 0,
    playerXpAwarded: XP.correct, // 12
    playerXpAfter: 12,
    opponentXpBefore: 0,
    opponentXpAwarded: XP.incorrect, // 9
    opponentXpAfter: 9,
    playerLevelBefore: 1,
    playerLevelAfter: 1,
    timerStart: ROUND_SECONDS,
    opponentAnsweredAt: null, // Golem locks only after you confirm in Round A
    pressureCutApplied: false,
    abilityId: null,
    chargeConsumed: false,
    resultCopy:
      "You were correct, so you dealt damage. The Golem missed and dealt none. (Training damage numbers are demonstrations, not Ranked balance.)",
  },
  // Round B — both correct; Golem answers first, triggering the −5s cut.
  B: {
    roundId: "B",
    questionIndex: 1,
    playerAnswer: 1, // "Mid lane"
    opponentAnswer: 1,
    playerCorrect: true,
    opponentCorrect: true,
    playerTimedOut: false,
    opponentTimedOut: false,
    playerDamage: TUTORIAL_DEMO_DAMAGE.bothCorrect,
    opponentDamage: TUTORIAL_DEMO_DAMAGE.bothCorrect,
    playerHpBefore: 170,
    playerHpAfter: 150,
    opponentHpBefore: 130,
    opponentHpAfter: 110,
    playerXpBefore: 12,
    playerXpAwarded: XP.correct, // 12
    playerXpAfter: 24,
    opponentXpBefore: 9,
    opponentXpAwarded: XP.correct, // 12
    opponentXpAfter: 21,
    playerLevelBefore: 1,
    playerLevelAfter: 1,
    timerStart: ROUND_SECONDS,
    opponentAnsweredAt: 24, // Golem submits at 24s remaining → cut to 19s
    pressureCutApplied: true,
    abilityId: null,
    chargeConsumed: false,
    resultCopy:
      "Both players were correct, so both dealt damage. Answering first doesn't stop your opponent's hit — it pressures their timer.",
  },
  // Round C — BOTH TIMEOUT (documented pattern choice): the clearest
  // demonstration of the timer running out plus the no-damage rule, with no
  // unrelated wrong-answer complexity.
  C: {
    roundId: "C",
    questionIndex: 2,
    playerAnswer: -1, // no submission — timeout
    opponentAnswer: null,
    playerCorrect: false,
    opponentCorrect: false,
    playerTimedOut: true,
    opponentTimedOut: true,
    playerDamage: TUTORIAL_DEMO_DAMAGE.wash,
    opponentDamage: TUTORIAL_DEMO_DAMAGE.wash,
    playerHpBefore: 150,
    playerHpAfter: 150,
    opponentHpBefore: 110,
    opponentHpAfter: 110,
    playerXpBefore: 24,
    playerXpAwarded: XP.timedOut, // 8
    playerXpAfter: 32, // crosses the Level 2 threshold of 30
    opponentXpBefore: 21,
    opponentXpAwarded: XP.timedOut, // 8
    opponentXpAfter: 29, // still Level 1 — useful contrast
    playerLevelBefore: 1,
    playerLevelAfter: 2, // derived: 32 >= 30
    timerStart: ROUND_SECONDS,
    opponentAnsweredAt: null,
    pressureCutApplied: false,
    abilityId: null,
    chargeConsumed: false,
    resultCopy:
      "Time ran out for both players: no damage either way, and both still earned XP. Failing a round is never the end.",
  },
};
