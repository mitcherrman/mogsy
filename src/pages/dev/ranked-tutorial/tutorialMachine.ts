// ---------------------------------------------------------------------------
// Ranked TUTORIAL — pure state machine.
//
// Deterministic reducer over the authored step table and resolved round
// fixtures. No I/O, no real timers, no randomness, no persistence, no
// production Ranked state. Invalid or unpermitted events always return the
// state unchanged. Combat results are APPLIED from authored fixtures —
// never computed. The only rule the reducer applies itself is the VERIFIED
// armed-use commitment rule (one charge per armed ability at resolution),
// which is exactly what the tutorial teaches.
// ---------------------------------------------------------------------------

import {
  RevealedRoundResult,
  RoundState,
  TutorialEvent,
  TutorialState,
  TutorialStepDefinition,
  TutorialStepId,
} from "./types";
import { STEPS, STEP_ORDER, nextStepId, stepIndex } from "./tutorialSteps";
import {
  FIRST_ANSWER_CUT_SECONDS,
  LEVEL_THRESHOLDS,
  MAX_LEVEL,
  ResolvedRoundFixture,
  ROUND_SECONDS,
  TANK_LEVEL_TWO_OPTIONS,
  TANK_STARTER,
  TANK_STARTING_HP,
  TUTORIAL_ROUNDS,
  TutorialRoundId,
  levelForXp,
  tankLevelThreeUnlock,
} from "./fixtures";

/** Instructional rounds hosted by each step, in play order. */
const STEP_ROUNDS: Partial<Record<TutorialStepId, TutorialRoundId[]>> = {
  answer_selection: ["A"],
  answer_locked: ["A"],
  simultaneous_reveal: ["A"],
  damage_intro: ["A"],
  both_correct_demo: ["B"],
  failure_demo: ["C"],
  starter_ability_intro: ["D"],
  ability_resolution: ["E"],
  level_three_unlock: ["F", "G"],
  victory_round: ["H"],
};

/** Timer warning threshold (seconds remaining) for the aria-live warning. */
export const TIMER_WARNING_SECONDS = 5;

const initialCharges = (): Record<string, number> => ({
  [TANK_STARTER.id]: TANK_STARTER.charges,
  [TANK_LEVEL_TWO_OPTIONS[0].id]: TANK_LEVEL_TWO_OPTIONS[0].charges,
  [TANK_LEVEL_TWO_OPTIONS[1].id]: TANK_LEVEL_TWO_OPTIONS[1].charges,
});

/** Fresh training-match state. Both combatants are full-HP Level 1 Tanks. */
export const initialTutorialState = (): TutorialState => ({
  stepId: "welcome",
  player: { hp: TANK_STARTING_HP, maxHp: TANK_STARTING_HP, xp: 0, level: 1 },
  opponent: { hp: TANK_STARTING_HP, maxHp: TANK_STARTING_HP, xp: 0, level: 1 },
  round: null,
  timer: {
    remaining: ROUND_SECONDS,
    duration: ROUND_SECONDS,
    running: false,
    pressureCutApplied: false,
    warningAnnounced: false,
  },
  charges: initialCharges(),
  pendingLevelTwoChoiceId: null,
  chosenLevelTwoAbilityId: null,
  matchOver: false,
  lastAnnouncement: null,
});

/**
 * Abilities the player can currently arm: Fortify from Level 1, the
 * confirmed Level 2 choice, and — from Level 3 — the auto-unlocked
 * remaining normal ability. (Verified progression; no ultimate exists.)
 */
export const unlockedAbilityIds = (state: TutorialState): string[] => {
  const out = [TANK_STARTER.id];
  if (state.chosenLevelTwoAbilityId && state.player.level >= 2) {
    out.push(state.chosenLevelTwoAbilityId);
    if (state.player.level >= MAX_LEVEL) {
      const final = tankLevelThreeUnlock(state.chosenLevelTwoAbilityId);
      if (final) out.push(final.id);
    }
  }
  return out;
};

const freshRound = (roundId: TutorialRoundId): RoundState => ({
  roundId,
  questionIndex: TUTORIAL_ROUNDS[roundId].questionIndex,
  phase: "selecting",
  playerAnswerIndex: null,
  playerAbilityId: null,
  coachNudge: null,
  opponentStatus: "thinking",
  result: null,
});

const startRoundTimer = (roundId: TutorialRoundId, running: boolean) => {
  const f = TUTORIAL_ROUNDS[roundId];
  return {
    remaining: f.timerStart,
    duration: f.timerStart,
    running,
    pressureCutApplied: false,
    warningAnnounced: false,
  };
};

/**
 * Build the revealed result. This is the ONLY place fixture outcomes enter
 * machine state, in the same transition that flips the phase to "revealed".
 */
const revealFromFixture = (
  state: TutorialState,
  f: ResolvedRoundFixture,
  armedAbilityId: string | null,
): RevealedRoundResult => {
  const levelAfter = levelForXp(f.playerXpAfter);
  const leveledUpTo = levelAfter > f.playerLevelBefore ? levelAfter : null;
  const chargesBefore = armedAbilityId ? state.charges[armedAbilityId] ?? null : null;
  return {
    roundId: f.roundId,
    playerAnswer: f.playerTimedOut ? null : f.playerAnswer,
    opponentAnswer: f.opponentAnswer,
    playerCorrect: f.playerCorrect,
    opponentCorrect: f.opponentCorrect,
    playerTimedOut: f.playerTimedOut,
    opponentTimedOut: f.opponentTimedOut,
    playerDamage: f.playerDamage,
    opponentDamage: f.opponentDamage,
    playerHpBefore: f.playerHpBefore,
    playerHpAfter: Math.max(0, f.playerHpAfter),
    opponentHpBefore: f.opponentHpBefore,
    opponentHpAfter: Math.max(0, f.opponentHpAfter),
    playerXpAwarded: f.playerXpAwarded,
    opponentXpAwarded: f.opponentXpAwarded,
    playerLeveledUpTo: leveledUpTo,
    revealedAbilityId: armedAbilityId,
    chargeConsumed: armedAbilityId !== null,
    chargesBefore,
    chargesAfter: chargesBefore !== null ? Math.max(0, chargesBefore - 1) : null,
    effectTriggered: armedAbilityId === f.abilityId ? f.effectTriggered : false,
    effectSummary:
      armedAbilityId === null
        ? null
        : armedAbilityId === f.abilityId
          ? f.effectSummary
          : "Your armed ability committed one charge when the round resolved. (No effect demonstrated this round — training.)",
    levelThreeAutoUnlockedAbilityId:
      leveledUpTo === MAX_LEVEL && state.chosenLevelTwoAbilityId
        ? tankLevelThreeUnlock(state.chosenLevelTwoAbilityId)?.id ?? null
        : null,
    resultCopy: f.resultCopy,
  };
};

/**
 * Apply an authored fixture's outcome. HP/XP/damage come from the fixture
 * verbatim; the ONLY reducer-side rule is the verified commitment rule:
 * an armed ability loses exactly one charge at resolution.
 */
const applyFixture = (state: TutorialState, f: ResolvedRoundFixture): TutorialState => {
  if (!state.round || state.round.result) return state; // duplicate resolve rejected
  const armed = state.round.playerAbilityId;
  const result = revealFromFixture(state, f, armed);
  const charges = armed
    ? { ...state.charges, [armed]: Math.max(0, (state.charges[armed] ?? 0) - 1) }
    : state.charges;

  const bits: string[] = [
    `Reveal: ${f.resultCopy}`,
    `Your HP ${result.playerHpBefore} to ${result.playerHpAfter}; Golem HP ${result.opponentHpBefore} to ${result.opponentHpAfter}.`,
    `You gained ${f.playerXpAwarded} XP.`,
  ];
  if (armed) {
    bits.push(
      `One ${armed === TANK_STARTER.id ? "Fortify" : "ability"} charge was consumed: ${result.chargesBefore} to ${result.chargesAfter}.`,
    );
    bits.push(result.effectTriggered ? "The effect triggered." : "The effect did not trigger.");
  }
  if (result.playerLeveledUpTo) bits.push(`You reached Level ${result.playerLeveledUpTo}!`);
  if (result.levelThreeAutoUnlockedAbilityId)
    bits.push("Your final normal ability unlocked automatically.");
  if (result.opponentHpAfter === 0) bits.push("The Training Golem is at zero HP. Victory!");

  return {
    ...state,
    player: {
      ...state.player,
      hp: result.playerHpAfter,
      xp: f.playerXpAfter,
      level: levelForXp(f.playerXpAfter),
    },
    opponent: {
      ...state.opponent,
      hp: result.opponentHpAfter,
      xp: f.opponentXpAfter,
      level: levelForXp(f.opponentXpAfter),
    },
    charges,
    round: { ...state.round, phase: "revealed", result },
    timer: { ...state.timer, running: false },
    matchOver: state.matchOver || result.opponentHpAfter === 0,
    lastAnnouncement: bits.join(" "),
  };
};

/** Entry effects when a step becomes active. */
const enterStep = (state: TutorialState, stepId: TutorialStepId): TutorialState => {
  const step = STEPS[stepId];
  const rounds = STEP_ROUNDS[stepId];
  let next: TutorialState = { ...state, stepId };

  if (rounds && (!state.round || !rounds.includes(state.round.roundId))) {
    const first = rounds[0];
    next = {
      ...next,
      round: freshRound(first),
      timer: startRoundTimer(first, step.timerMode === "running"),
    };
  } else if (!rounds) {
    next = { ...next, timer: { ...next.timer, running: false } };
  } else {
    next = {
      ...next,
      timer: {
        ...next.timer,
        running:
          step.timerMode === "running" &&
          next.round?.phase !== "revealed" &&
          next.round?.phase !== "locked",
      },
    };
  }
  return next;
};

const advance = (state: TutorialState): TutorialState => {
  const next = nextStepId(state.stepId);
  return next ? enterStep(state, next) : state;
};

const continueFrom = (state: TutorialState): TutorialState => {
  const round = state.round;
  const rounds = STEP_ROUNDS[state.stepId];

  // Round A reveal happens on the answer_locked → simultaneous_reveal edge.
  if (state.stepId === "answer_locked") {
    return applyFixture(advance(state), TUTORIAL_ROUNDS.A);
  }
  // Level 2 step: advancing requires the confirmed permanent choice.
  if (state.stepId === "level_two_choice") {
    return state.chosenLevelTwoAbilityId ? advance(state) : state;
  }
  if (rounds && round && rounds.includes(round.roundId)) {
    // Locked in-step round → reveal it now.
    if (round.phase === "locked") {
      return applyFixture(state, TUTORIAL_ROUNDS[round.roundId]);
    }
    // Revealed → next round in this step, or advance out of it.
    if (round.phase === "revealed") {
      const i = rounds.indexOf(round.roundId);
      const nextRound = rounds[i + 1];
      if (nextRound) {
        return {
          ...state,
          round: freshRound(nextRound),
          timer: startRoundTimer(nextRound, STEPS[state.stepId].timerMode === "running"),
        };
      }
      return advance(state);
    }
    // Steps that host an unresolved interactive round can't be skipped
    // (Round A's selection step advances via CONFIRM_LOCK instead).
    if (state.stepId !== "answer_selection") return state;
  }
  return advance(state);
};

export const tutorialReducer = (
  state: TutorialState,
  event: TutorialEvent,
): TutorialState => {
  const step = STEPS[state.stepId];
  if (!step.permittedEvents.includes(event.type)) return state;
  const round = state.round;
  const fixture = round ? TUTORIAL_ROUNDS[round.roundId] : null;

  switch (event.type) {
    case "RESTART":
      return initialTutorialState();

    case "BEGIN_TRAINING":
      return advance(state);

    case "CONTINUE":
      return continueFrom(state);

    case "TICK": {
      if (!state.timer.running || !round || !fixture) return state;
      let t = state.timer;
      let r = round;
      let announcement = state.lastAnnouncement;

      // Scripted Golem submission fires BEFORE the decrement so an authored
      // "instant" answer (opponentAnsweredAt === timerStart) cuts the full
      // starting value: e.g. Fortify's 35 → 30, or Round B's 24 → 19.
      if (
        fixture.opponentAnsweredAt !== null &&
        r.opponentStatus === "thinking" &&
        t.remaining <= fixture.opponentAnsweredAt
      ) {
        r = { ...r, opponentStatus: "submitted" };
        t = {
          ...t,
          remaining: t.pressureCutApplied
            ? t.remaining
            : Math.max(0, t.remaining - FIRST_ANSWER_CUT_SECONDS),
          pressureCutApplied: true,
        };
        announcement =
          "The Golem locked in first — its first answer cut the shared timer by 5 seconds.";
        return { ...state, timer: t, round: r, lastAnnouncement: announcement };
      }

      t = { ...t, remaining: Math.max(0, t.remaining - 1) };
      if (!t.warningAnnounced && t.remaining <= TIMER_WARNING_SECONDS && t.remaining > 0) {
        t = { ...t, warningAnnounced: true };
        announcement = `${t.remaining} seconds left — training still won't fail you.`;
      }
      // Training never times the player out: at zero the timer simply rests.
      if (t.remaining === 0) t = { ...t, running: false };
      return { ...state, timer: t, lastAnnouncement: announcement };
    }

    case "SELECT_ANSWER": {
      if (!round || round.phase !== "selecting") return state;
      return {
        ...state,
        round: { ...round, playerAnswerIndex: event.answerIndex, coachNudge: null },
      };
    }

    case "SELECT_ABILITY": {
      if (!round || round.phase !== "selecting") return state;
      if (event.abilityId !== null) {
        // Only unlocked abilities with remaining charges can be armed.
        if (!unlockedAbilityIds(state).includes(event.abilityId)) return state;
        if ((state.charges[event.abilityId] ?? 0) <= 0) return state;
      }
      return {
        ...state,
        round: { ...round, playerAbilityId: event.abilityId, coachNudge: null },
        lastAnnouncement:
          event.abilityId === null
            ? "No ability selected. Selecting costs nothing until the round resolves."
            : `${event.abilityId === TANK_STARTER.id ? "Fortify" : "Ability"} armed. It stays hidden until reveal, and its charge is committed only when the round resolves.`,
      };
    }

    case "LOCK_SUBMISSION": {
      if (!round || !fixture || round.phase !== "selecting" || round.playerAnswerIndex === null)
        return state;
      const answerNudge = round.playerAnswerIndex !== fixture.playerAnswer;
      const abilityNudge =
        !fixture.allowAnyAbility && round.playerAbilityId !== fixture.abilityId;
      return {
        ...state,
        round: {
          ...round,
          phase: "reviewing",
          coachNudge: answerNudge ? "answer" : abilityNudge ? "ability" : null,
        },
        lastAnnouncement: "Review your submission, then confirm to lock it in.",
      };
    }

    case "EDIT_SUBMISSION": {
      if (!round || round.phase !== "reviewing") return state;
      return {
        ...state,
        round: { ...round, phase: "selecting", coachNudge: null },
        lastAnnouncement: "Back to answer selection.",
      };
    }

    case "CONFIRM_LOCK": {
      if (!round || !fixture || round.phase !== "reviewing") return state;
      if (round.coachNudge) return state; // non-failable coaching gate

      // Round A: the Golem locks its scripted answer once you confirm, and
      // the machine advances to the dedicated answer_locked step.
      if (round.roundId === "A") {
        const locked: TutorialState = {
          ...state,
          round: { ...round, phase: "locked", opponentStatus: "submitted" },
          timer: { ...state.timer, running: false },
          lastAnnouncement:
            "Answer locked. It stays hidden from the Golem until the reveal.",
        };
        return enterStep(locked, "answer_locked");
      }
      return {
        ...state,
        // The scripted Golem locks its own answer when you confirm (unless
        // this round scripts a Golem timeout).
        round: {
          ...round,
          phase: "locked",
          opponentStatus: fixture.opponentAnswer !== null ? "submitted" : round.opponentStatus,
        },
        timer: { ...state.timer, running: false },
        lastAnnouncement:
          round.playerAbilityId !== null
            ? "Answer and ability locked together. Both stay hidden until the reveal."
            : "Answer locked. Continue to the reveal.",
      };
    }

    case "SIMULATE_TIMEOUT": {
      if (!round || round.roundId !== "C" || round.phase === "revealed") return state;
      const timedOut: TutorialState = {
        ...state,
        round: { ...round, opponentStatus: "timed_out" },
        timer: { ...state.timer, remaining: 0, running: false },
      };
      return applyFixture(timedOut, TUTORIAL_ROUNDS.C);
    }

    case "CHOOSE_LEVEL_TWO": {
      if (state.stepId !== "level_two_choice" || state.chosenLevelTwoAbilityId) return state;
      const option = TANK_LEVEL_TWO_OPTIONS.find((a) => a.id === event.abilityId);
      if (!option) return state;
      return {
        ...state,
        pendingLevelTwoChoiceId: option.id,
        lastAnnouncement: `${option.name} selected. Confirm to make it permanent for this match.`,
      };
    }

    case "CONFIRM_LEVEL_TWO": {
      // Permanent: duplicate confirmations and later changes are rejected.
      if (
        state.stepId !== "level_two_choice" ||
        state.chosenLevelTwoAbilityId ||
        !state.pendingLevelTwoChoiceId
      )
        return state;
      const chosen = TANK_LEVEL_TWO_OPTIONS.find(
        (a) => a.id === state.pendingLevelTwoChoiceId,
      )!;
      const other = tankLevelThreeUnlock(chosen.id)!;
      return {
        ...state,
        chosenLevelTwoAbilityId: chosen.id,
        pendingLevelTwoChoiceId: null,
        lastAnnouncement:
          `Permanent choice confirmed: ${chosen.name} is unlocked for this match. ` +
          `${other.name} stays locked until Level 3 unlocks it automatically.`,
      };
    }

    default:
      return state;
  }
};

// --- Visible projection ------------------------------------------------------

export interface TutorialVisibleState {
  step: TutorialStepDefinition;
  stepNumber: number; // 1-based
  totalSteps: number;
  player: TutorialState["player"];
  opponent: TutorialState["opponent"];
  round: TutorialState["round"];
  timer: TutorialState["timer"];
  timerMode: TutorialStepDefinition["timerMode"];
  charges: TutorialState["charges"];
  unlockedAbilityIds: string[];
  pendingLevelTwoChoiceId: string | null;
  chosenLevelTwoAbilityId: string | null;
  matchOver: boolean;
  lastAnnouncement: string | null;
  isComplete: boolean;
}

export const visibleState = (state: TutorialState): TutorialVisibleState => {
  const step = STEPS[state.stepId];
  return {
    step,
    stepNumber: stepIndex(state.stepId) + 1,
    totalSteps: STEP_ORDER.length,
    player: state.player,
    opponent: state.opponent,
    round: state.round,
    timer: state.timer,
    timerMode: step.timerMode,
    charges: state.charges,
    unlockedAbilityIds: unlockedAbilityIds(state),
    pendingLevelTwoChoiceId: state.pendingLevelTwoChoiceId,
    chosenLevelTwoAbilityId: state.chosenLevelTwoAbilityId,
    matchOver: state.matchOver,
    lastAnnouncement: state.lastAnnouncement,
    isComplete: state.stepId === "complete",
  };
};

/** XP progress toward the next level as 0–100 (mirrors the Ranked panel). */
export const xpProgressPct = (xp: number, level: number): number => {
  const cur = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const next = LEVEL_THRESHOLDS[level];
  if (next === undefined || level >= MAX_LEVEL) return 100;
  return Math.min(100, Math.round(((xp - cur) / (next - cur)) * 100));
};

/** Next-level threshold for display, or null at max level. */
export const nextLevelThreshold = (level: number): number | null =>
  level >= MAX_LEVEL ? null : LEVEL_THRESHOLDS[level];
