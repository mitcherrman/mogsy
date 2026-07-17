// ---------------------------------------------------------------------------
// Ranked TUTORIAL — pure state machine.
//
// Deterministic reducer over the authored step table and resolved round
// fixtures. No I/O, no real timers, no randomness, no persistence, no
// production Ranked state. Invalid or unpermitted events always return the
// state unchanged. Combat results are APPLIED from authored fixtures —
// never computed here.
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
  TANK_STARTING_HP,
  TUTORIAL_ROUNDS,
  TutorialRoundId,
  levelForXp,
} from "./fixtures";

/** Which instructional round (if any) a step interacts with. */
const STEP_ROUND: Partial<Record<TutorialStepId, TutorialRoundId>> = {
  answer_selection: "A",
  answer_locked: "A",
  simultaneous_reveal: "A",
  damage_intro: "A",
  both_correct_demo: "B",
  failure_demo: "C",
};

/** Timer warning threshold (seconds remaining) for the aria-live warning. */
export const TIMER_WARNING_SECONDS = 5;

const pausedTimer = () => ({
  remaining: ROUND_SECONDS,
  running: false,
  pressureCutApplied: false,
  warningAnnounced: false,
});

/** Fresh training-match state. Both combatants are full-HP Level 1 Tanks. */
export const initialTutorialState = (): TutorialState => ({
  stepId: "welcome",
  player: { hp: TANK_STARTING_HP, maxHp: TANK_STARTING_HP, xp: 0, level: 1 },
  opponent: { hp: TANK_STARTING_HP, maxHp: TANK_STARTING_HP, xp: 0, level: 1 },
  round: null,
  timer: pausedTimer(),
  lastAnnouncement: null,
});

const freshRound = (roundId: TutorialRoundId): RoundState => ({
  roundId,
  questionIndex: TUTORIAL_ROUNDS[roundId].questionIndex,
  phase: "selecting",
  playerAnswerIndex: null,
  playerAbilityId: null,
  coachNudge: false,
  opponentStatus: "thinking",
  result: null,
});

/**
 * Build the revealed result from an authored fixture. This is the ONLY place
 * fixture outcomes enter machine state, and it happens in the same
 * transition that flips the phase to "revealed".
 */
const revealFromFixture = (f: ResolvedRoundFixture): RevealedRoundResult => {
  // The machine derives the post-round level from the verified thresholds —
  // fixtures are validated against that derivation in tests.
  const levelAfter = levelForXp(f.playerXpAfter);
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
    playerHpAfter: f.playerHpAfter,
    opponentHpBefore: f.opponentHpBefore,
    opponentHpAfter: f.opponentHpAfter,
    playerXpAwarded: f.playerXpAwarded,
    opponentXpAwarded: f.opponentXpAwarded,
    playerLeveledUpTo: levelAfter > f.playerLevelBefore ? levelAfter : null,
    resultCopy: f.resultCopy,
  };
};

/** Apply an authored fixture's outcome to both combatants (never computed). */
const applyFixture = (state: TutorialState, f: ResolvedRoundFixture): TutorialState => {
  const result = revealFromFixture(f);
  const announceLevel = result.playerLeveledUpTo
    ? ` You reached Level ${result.playerLeveledUpTo}!`
    : "";
  return {
    ...state,
    player: {
      ...state.player,
      hp: f.playerHpAfter,
      xp: f.playerXpAfter,
      level: levelForXp(f.playerXpAfter),
    },
    opponent: {
      ...state.opponent,
      hp: f.opponentHpAfter,
      xp: f.opponentXpAfter,
      level: levelForXp(f.opponentXpAfter),
    },
    round: state.round
      ? { ...state.round, phase: "revealed", result }
      : state.round,
    timer: { ...state.timer, running: false },
    lastAnnouncement:
      `Reveal: ${f.resultCopy} Your HP ${f.playerHpBefore} to ${f.playerHpAfter}; ` +
      `Golem HP ${f.opponentHpBefore} to ${f.opponentHpAfter}. ` +
      `You gained ${f.playerXpAwarded} XP.${announceLevel}`,
  };
};

/** Entry effects when a step becomes active. */
const enterStep = (state: TutorialState, stepId: TutorialStepId): TutorialState => {
  const step = STEPS[stepId];
  const roundId = STEP_ROUND[stepId];
  let next: TutorialState = { ...state, stepId };

  // Starting a NEW interactive round resets the round scratch + timer.
  if (roundId && (!state.round || state.round.roundId !== roundId)) {
    next = {
      ...next,
      round: freshRound(roundId),
      timer: {
        remaining: TUTORIAL_ROUNDS[roundId].timerStart,
        running: step.timerMode === "running",
        pressureCutApplied: false,
        warningAnnounced: false,
      },
    };
  } else if (!roundId) {
    // Non-round steps keep results visible but never run the timer.
    next = { ...next, timer: { ...next.timer, running: false } };
  } else {
    next = {
      ...next,
      timer: { ...next.timer, running: step.timerMode === "running" && next.round?.phase !== "revealed" && next.round?.phase !== "locked" },
    };
  }
  return next;
};

const advance = (state: TutorialState): TutorialState => {
  const next = nextStepId(state.stepId);
  return next ? enterStep(state, next) : state;
};

/** Round A reveal happens on the answer_locked → simultaneous_reveal edge. */
const continueFrom = (state: TutorialState): TutorialState => {
  if (state.stepId === "answer_locked") {
    return applyFixture(advance(state), TUTORIAL_ROUNDS.A);
  }
  // Round B resolves inside its own step: locked --CONTINUE--> revealed.
  if (state.stepId === "both_correct_demo" && state.round?.phase === "locked") {
    return applyFixture(state, TUTORIAL_ROUNDS.B);
  }
  // Advancing out of B/C requires the round to be resolved first.
  if (
    (state.stepId === "both_correct_demo" || state.stepId === "failure_demo") &&
    state.round?.phase !== "revealed"
  ) {
    return state;
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
    case "CONTINUE":
      return event.type === "BEGIN_TRAINING" ? advance(state) : continueFrom(state);

    case "TICK": {
      if (!state.timer.running || !round || !fixture) return state;
      let t = { ...state.timer, remaining: Math.max(0, state.timer.remaining - 1) };
      let r = round;
      let announcement = state.lastAnnouncement;

      // Scripted Golem submission (Round B): first answer of the round →
      // one-time 5-second pressure cut on the shared timer.
      if (
        fixture.opponentAnsweredAt !== null &&
        r.opponentStatus === "thinking" &&
        t.remaining <= fixture.opponentAnsweredAt
      ) {
        r = { ...r, opponentStatus: "submitted" };
        if (!t.pressureCutApplied) {
          t = {
            ...t,
            remaining: Math.max(0, t.remaining - FIRST_ANSWER_CUT_SECONDS),
            pressureCutApplied: true,
          };
          announcement =
            "The Golem locked in first — the shared timer just lost 5 seconds.";
        }
      }
      if (!t.warningAnnounced && t.remaining <= TIMER_WARNING_SECONDS && t.remaining > 0) {
        t = { ...t, warningAnnounced: true };
        announcement = `${t.remaining} seconds left — training still won't fail you.`;
      }
      // Training never times the player out: at zero the timer simply rests.
      if (t.remaining === 0) t = { ...t, running: false };
      return { ...state, timer: t, round: r, lastAnnouncement: announcement };
    }

    case "SELECT_ANSWER": {
      if (!round || round.phase !== "selecting") return state;
      return {
        ...state,
        round: { ...round, playerAnswerIndex: event.answerIndex, coachNudge: false },
      };
    }

    case "SELECT_ABILITY": {
      if (!round || round.phase !== "selecting") return state;
      return { ...state, round: { ...round, playerAbilityId: event.abilityId } };
    }

    case "LOCK_SUBMISSION": {
      // "Lock Answer & Ability": requires an answer; moves into review.
      if (!round || round.phase !== "selecting" || round.playerAnswerIndex === null)
        return state;
      return {
        ...state,
        round: {
          ...round,
          phase: "reviewing",
          // Non-failable training: if the pick isn't the authored answer,
          // review shows a coaching nudge instead of ever revealing results.
          coachNudge: fixture !== null && round.playerAnswerIndex !== fixture.playerAnswer,
        },
        lastAnnouncement: "Review your submission, then confirm to lock it in.",
      };
    }

    case "EDIT_SUBMISSION": {
      if (!round || round.phase !== "reviewing") return state;
      return {
        ...state,
        round: { ...round, phase: "selecting", coachNudge: false },
        lastAnnouncement: "Back to answer selection.",
      };
    }

    case "CONFIRM_LOCK": {
      if (!round || !fixture || round.phase !== "reviewing") return state;
      // Scripted rounds are non-failable: confirmation waits until the
      // coached (authored) answer is selected.
      if (round.playerAnswerIndex !== fixture.playerAnswer) return state;

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
      // Round B: lock in place; reveal follows via CONTINUE.
      return {
        ...state,
        round: { ...round, phase: "locked" },
        timer: { ...state.timer, running: false },
        lastAnnouncement: "Answer locked. Continue to the reveal.",
      };
    }

    case "SIMULATE_TIMEOUT": {
      // Round C: fast-forward the countdown; both sides time out; apply the
      // authored no-damage fixture in the same transition.
      if (!round || round.roundId !== "C" || round.phase === "revealed") return state;
      const timedOut: TutorialState = {
        ...state,
        round: { ...round, opponentStatus: "timed_out" },
        timer: { ...state.timer, remaining: 0, running: false },
      };
      return applyFixture(timedOut, TUTORIAL_ROUNDS.C);
    }

    default:
      // Typed-but-not-yet-wired events (Level 2 choice etc. — E2.4).
      return state;
  }
};

// --- Visible projection ------------------------------------------------------

/**
 * Everything the page needs to render. Contains NO answer keys, NO opponent
 * script, and NO future round results — the opponent's answer and all
 * outcome data appear only inside `round.result`, which exists only after
 * the reveal transition.
 */
export interface TutorialVisibleState {
  step: TutorialStepDefinition;
  stepNumber: number; // 1-based
  totalSteps: number;
  player: TutorialState["player"];
  opponent: TutorialState["opponent"];
  round: TutorialState["round"];
  timer: TutorialState["timer"];
  timerMode: TutorialStepDefinition["timerMode"];
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
