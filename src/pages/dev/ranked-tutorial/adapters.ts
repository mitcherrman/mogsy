// ---------------------------------------------------------------------------
// Tutorial → canonical Ranked view projection.
//
// Pure functions from TutorialState + authored fixtures into the neutral
// ranked-core view contracts consumed by the shared arena components. All
// resolved numbers are AUTHORED fixture pass-throughs — nothing here (or
// anywhere in the tutorial) recomputes production combat formulas. Hidden
// information stays hidden: pre-reveal projections carry only neutral
// opponent status, and the resolved settlement is built exclusively from a
// round's revealed result.
// ---------------------------------------------------------------------------

import {
  AbilityView,
  CombatantView,
  InteractionPermissions,
  NO_INTERACTIONS,
  QuestionView,
  ResolvedRoundView,
  SubmissionView,
  TimerView,
} from "@/lib/ranked-core/viewTypes";
import {
  permissionsForSubmissionPhase,
  restrictPermissions,
} from "@/lib/ranked-core/permissions";
import { STEPS } from "./tutorialSteps";
import {
  LEVEL_THRESHOLDS,
  MAX_LEVEL,
  ResolvedRoundFixture,
  TANK_LEVEL_TWO_OPTIONS,
  TANK_STARTER,
  TUTORIAL_OPPONENT,
  TUTORIAL_PLAYER,
  TUTORIAL_QUESTIONS,
  TUTORIAL_ROUNDS,
  TutorialAbility,
} from "./fixtures";
import { unlockedAbilityIds } from "./tutorialMachine";
import { RevealedRoundResult, RoundState, TutorialState } from "./types";

/** Stable tutorial-only ids — clearly never a real backend match/player id. */
export const TUTORIAL_PLAYER_ID = "tutorial-player";
export const TUTORIAL_GOLEM_ID = "tutorial-golem";
export const TUTORIAL_MATCH_ID = "tutorial-training-match";

const ALL_ABILITIES: TutorialAbility[] = [TANK_STARTER, ...TANK_LEVEL_TWO_OPTIONS];

export const abilityName = (id: string | null): string =>
  id === null
    ? "No active ability"
    : ALL_ABILITIES.find((a) => a.id === id)?.name ?? id;

const thresholdFloor = (level: number): number | null =>
  LEVEL_THRESHOLDS[level - 1] ?? null;

const thresholdNext = (level: number): number | null =>
  level >= MAX_LEVEL ? null : LEVEL_THRESHOLDS[level];

/** Steps whose round hosts the ability window (Fortify lesson onward). */
const abilityWindowActive = (state: TutorialState): boolean => {
  const roundId = state.round?.roundId;
  return roundId === "D" || roundId === "E" || roundId === "F" || roundId === "G" || roundId === "H";
};

export function combatantViewsFromTutorial(state: TutorialState): {
  player: CombatantView;
  opponent: CombatantView;
} {
  const round = state.round;
  const playerLocked = round?.phase === "locked" || round?.phase === "revealed";
  const windowOpen = abilityWindowActive(state);
  const base = (side: "player" | "opponent"): Omit<CombatantView,
    "playerId" | "name" | "tag" | "hp" | "xp" | "level" | "hasSubmitted" | "hasAbilitySelected"
  > => ({
    side,
    classId: "tank",
    maxHp: state[side === "player" ? "player" : "opponent"].maxHp,
    nextLevelThreshold: thresholdNext(state[side === "player" ? "player" : "opponent"].level),
    currentLevelThreshold: thresholdFloor(state[side === "player" ? "player" : "opponent"].level),
    abilityWindow: windowOpen ? (playerLocked ? "locked" : "open") : null,
  });
  return {
    player: {
      ...base("player"),
      playerId: TUTORIAL_PLAYER_ID,
      name: TUTORIAL_PLAYER.name,
      tag: `Tank · ${TUTORIAL_PLAYER.tag}`,
      hp: state.player.hp,
      xp: state.player.xp,
      level: state.player.level,
      hasSubmitted: playerLocked,
      hasAbilitySelected: round ? round.playerAbilityId !== null : null,
    },
    opponent: {
      ...base("opponent"),
      playerId: TUTORIAL_GOLEM_ID,
      name: TUTORIAL_OPPONENT.name,
      tag: `Tank · ${TUTORIAL_OPPONENT.tag}`,
      hp: state.opponent.hp,
      xp: state.opponent.xp,
      level: state.opponent.level,
      hasSubmitted: round?.opponentStatus === "submitted",
      // Neutral only — the Golem's ability CONTENT never appears pre-reveal.
      hasAbilitySelected: null,
    },
  };
}

export function questionViewFromRound(round: RoundState): QuestionView {
  const q = TUTORIAL_QUESTIONS[round.questionIndex];
  return {
    questionId: `tutorial-q${round.questionIndex}`,
    prompt: q.prompt,
    options: q.choices.map((label, index) => ({ id: String(index), index, label })),
    category: "Training",
  };
}

export function submissionViewFromRound(round: RoundState): SubmissionView {
  return {
    selectedOptionId:
      round.playerAnswerIndex === null ? null : String(round.playerAnswerIndex),
    selectedAbilityId: round.playerAbilityId,
    phase:
      round.phase === "selecting"
        ? "selecting"
        : round.phase === "reviewing"
          ? "reviewing"
          : "locked",
  };
}

export function abilityViewsFromTutorial(state: TutorialState): AbilityView[] {
  const unlocked = unlockedAbilityIds(state);
  const round = state.round;
  const locked = round?.phase === "locked" || round?.phase === "revealed";
  return ALL_ABILITIES.map((a) => {
    const isUnlocked = unlocked.includes(a.id);
    const remaining = state.charges[a.id] ?? 0;
    const exhausted = isUnlocked && remaining <= 0;
    let unavailableReason: string | undefined;
    if (!isUnlocked) {
      unavailableReason = state.chosenLevelTwoAbilityId
        ? "Not chosen — unlocks automatically at Level 3"
        : "Unlocks with the Level 2 choice";
    } else if (exhausted) {
      unavailableReason = "No charges left";
    }
    return {
      id: a.id,
      name: a.name,
      description: a.description,
      unlocked: isUnlocked,
      remainingCharges: remaining,
      selected: round?.playerAbilityId === a.id,
      locked,
      exhausted,
      unavailableReason,
    };
  });
}

export function timerViewFromTutorial(state: TutorialState): TimerView {
  const step = STEPS[state.stepId];
  const notices: string[] = [];
  if (state.timer.duration > 30) {
    notices.push(`+5s: Fortify bonus (${state.timer.duration}s start)`);
  }
  if (state.timer.pressureCutApplied && state.timer.running) {
    notices.push("−5s: first answer is in");
  }
  return {
    durationSeconds: state.timer.duration,
    remainingSeconds: state.timer.remaining,
    paused: !state.timer.running && step.timerMode !== "running",
    urgent: state.timer.running && state.timer.remaining <= 5,
    modifierNotices: notices,
  };
}

/**
 * Interaction permissions: the canonical submission sequencing, restricted
 * by the tutorial director (coach nudges block confirmation with a reason;
 * non-interactive steps expose no interactions at all).
 */
export function permissionsFromTutorial(
  state: TutorialState,
  interactive: boolean,
): InteractionPermissions {
  const round = state.round;
  if (!round || !interactive || round.phase === "revealed") return NO_INTERACTIONS;
  const base = permissionsForSubmissionPhase(submissionViewFromRound(round).phase, true);
  if (round.coachNudge === "answer") {
    return restrictPermissions(base, {
      canConfirmSubmission: false,
      disabledReasons: {
        confirm: "Training tip: that answer won't land this lesson — edit and pick again.",
      },
    });
  }
  if (round.coachNudge === "ability") {
    return restrictPermissions(base, {
      canConfirmSubmission: false,
      disabledReasons: {
        confirm: "Training tip: this lesson needs a different ability setup — edit before locking.",
      },
    });
  }
  return base;
}

/**
 * Build the canonical resolved-round settlement from a round's REVEALED
 * result plus its authored fixture. Called only post-reveal — every value is
 * an authored pass-through (damage, mitigation defaults to zero unless the
 * fixture authored it; nothing is computed from formulas).
 */
export function resolvedRoundViewFromResult(
  result: RevealedRoundResult,
  fixture: ResolvedRoundFixture = TUTORIAL_ROUNDS[result.roundId],
): ResolvedRoundView {
  const playerOutcome = result.playerTimedOut
    ? "timed_out"
    : result.playerCorrect
      ? "correct"
      : "incorrect";
  const opponentOutcome = result.opponentTimedOut
    ? "timed_out"
    : result.opponentCorrect
      ? "correct"
      : "incorrect";
  const levelUpEvents = result.playerLeveledUpTo
    ? [
        {
          previousLevel: fixture.playerLevelBefore,
          newLevel: result.playerLeveledUpTo,
          totalXpAfter: fixture.playerXpAfter,
          thresholdsCrossed: LEVEL_THRESHOLDS.filter(
            (t) => t > (thresholdFloor(fixture.playerLevelBefore) ?? 0) && fixture.playerXpAfter >= t,
          ) as number[],
        },
      ]
    : [];
  const matchOver = result.opponentHpAfter <= 0;
  return {
    matchId: TUTORIAL_MATCH_ID,
    roundNumber: "ABCDEFGH".indexOf(result.roundId) + 1,
    questionId: `tutorial-q${fixture.questionIndex}`,
    endReason:
      result.playerTimedOut && result.opponentTimedOut ? "deadline_expired" : "both_answered",
    pressureApplied: fixture.pressureCutApplied,
    players: {
      p1: {
        playerId: TUTORIAL_PLAYER_ID,
        outcome: playerOutcome,
        submittedAt: null,
        answeredFirst: false,
        timedOut: result.playerTimedOut,
        abilityId: result.revealedAbilityId,
        abilityName: abilityName(result.revealedAbilityId),
        baseDamageDealt: result.playerDamage,
        outgoingBonus: 0,
        finalDamageDealt: result.playerDamage,
        shieldAbsorbed: 0,
        incomingReduction: 0,
        finalDamageReceived: result.opponentDamage,
        hpBefore: result.playerHpBefore,
        hpAfter: result.playerHpAfter,
        reachedZeroHp: result.playerHpAfter <= 0,
        xpGained: result.playerXpAwarded,
        totalXpAfter: fixture.playerXpAfter,
        levelBefore: fixture.playerLevelBefore,
        levelAfter: result.playerLeveledUpTo ?? fixture.playerLevelBefore,
        leveledUp: result.playerLeveledUpTo !== null,
        levelUpEvents,
        chargeConsumed: result.chargeConsumed,
        consumedAbilityId: result.chargeConsumed ? result.revealedAbilityId : null,
        remainingChargesAfterRound:
          result.revealedAbilityId !== null && result.chargesAfter !== null
            ? { [result.revealedAbilityId]: result.chargesAfter }
            : {},
        effectsGained: result.effectTriggered && result.effectSummary ? [result.effectSummary] : [],
        effectsConsumed: [],
        consecutiveCorrect: 0,
        combatLabUnlockDeltaSeconds: 0,
      },
      p2: {
        playerId: TUTORIAL_GOLEM_ID,
        outcome: opponentOutcome,
        submittedAt: null,
        answeredFirst: fixture.opponentAnsweredAt !== null,
        timedOut: result.opponentTimedOut,
        abilityId: null,
        abilityName: "No active ability",
        baseDamageDealt: result.opponentDamage,
        outgoingBonus: 0,
        finalDamageDealt: result.opponentDamage,
        shieldAbsorbed: 0,
        incomingReduction: 0,
        finalDamageReceived: result.playerDamage,
        hpBefore: result.opponentHpBefore,
        hpAfter: result.opponentHpAfter,
        reachedZeroHp: result.opponentHpAfter <= 0,
        xpGained: result.opponentXpAwarded,
        totalXpAfter: fixture.opponentXpAfter,
        levelBefore: fixture.opponentXpBefore >= 30 ? 2 : 1,
        levelAfter: fixture.opponentXpAfter >= 66 ? 3 : fixture.opponentXpAfter >= 30 ? 2 : 1,
        leveledUp: false,
        levelUpEvents: [],
        chargeConsumed: false,
        consumedAbilityId: null,
        remainingChargesAfterRound: {},
        effectsGained: [],
        effectsConsumed: [],
        consecutiveCorrect: 0,
        combatLabUnlockDeltaSeconds: 0,
      },
    },
    sharedNextRoundDurationSeconds: fixture.nextRoundDurationAfterAbility,
    sharedTimerDeltaSeconds: fixture.nextRoundDurationAfterAbility - 30,
    matchOver,
    winner: matchOver ? "p1" : null,
    completionReason: matchOver ? "knockout" : null,
    summary: result.resultCopy,
  };
}

/** Revealed answer labels by player id, for the canonical RevealPanel. */
export function revealedAnswersByPlayerId(
  round: RoundState,
): Record<string, string | null> {
  const result = round.result;
  const q = TUTORIAL_QUESTIONS[round.questionIndex];
  if (!result) return {};
  return {
    [TUTORIAL_PLAYER_ID]:
      result.playerAnswer === null ? null : q.choices[result.playerAnswer] ?? null,
    [TUTORIAL_GOLEM_ID]:
      result.opponentAnswer === null ? null : q.choices[result.opponentAnswer] ?? null,
  };
}

export const TUTORIAL_NAMES_BY_ID: Record<string, string> = {
  [TUTORIAL_PLAYER_ID]: TUTORIAL_PLAYER.name,
  [TUTORIAL_GOLEM_ID]: TUTORIAL_OPPONENT.name,
};
