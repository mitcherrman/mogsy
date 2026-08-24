// ---------------------------------------------------------------------------
// Tutorial → canonical Ranked view projection.
//
// ARENA1 Step 4: the tutorial renders `CanonicalArena`, the same component
// production Ranked renders, so these projections now produce the SAME shapes
// Ranked's controller produces — including a `PublicRoundView` for the
// canonical question surface. Nothing here draws anything.
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
  ResolvedRoundView,
  TimerView,
} from "@/lib/ranked-core/viewTypes";
import { restrictPermissions } from "@/lib/ranked-core/permissions";
import { answerOptionId } from "@/lib/ranked-core/adapters/adaptToViews";
import { LEGACY_SEGMENT } from "@/lib/ranked-public/contracts";
import type { PublicRoundView } from "@/lib/ranked-public/contracts";
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
  TutorialRoundId,
} from "./fixtures";
import { unlockedAbilityIds } from "./tutorialMachine";
import { RevealedRoundResult, RoundState, TutorialState, TutorialTrack } from "./types";

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

/**
 * R1: a no-progression match has a single level, so there is no NEXT
 * threshold to fill toward — exactly what a real R1 match projects. The
 * legacy track keeps the authored (0, 30, 66) ladder.
 */
const thresholdNext = (level: number, track: TutorialTrack): number | null =>
  track === "r1" || level >= MAX_LEVEL ? null : LEVEL_THRESHOLDS[level];

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
    nextLevelThreshold: thresholdNext(
      state[side === "player" ? "player" : "opponent"].level, state.track),
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

/**
 * THE TUTORIAL'S ROUND, IN THE ARENA'S OWN INPUT SHAPE.
 *
 * The arena's centre column is driven by a module renderer resolved from a
 * `PublicRoundView`'s segment (`rendererForSegment`), and the tutorial's rounds
 * are ordinary one-challenge quiz segments — so this projects one, declares
 * `LEGACY_SEGMENT` (which IS `quiz.v1`), and the canonical registry resolves
 * the same `quiz.v1` viewport Ranked gets. The tutorial therefore inherits the
 * scenario band, the answer tablets, option media, the metadata lookup and the
 * reveal behaviour without naming any of them.
 *
 * It is a projection, not a payload: nothing here is parsed from or sent to a
 * backend, and the ids are visibly tutorial-owned.
 */
export function publicRoundFromTutorial(state: TutorialState): PublicRoundView {
  // Before the first round exists (the timer lesson) the arena still needs a
  // segment to resolve a renderer from, or it would show its unsupported-module
  // fail-closed panel for a tutorial that supports its own questions perfectly
  // well. The first scripted round's question is the honest stand-in; whether
  // the question stage DRAWS is a separate decision, made by the adapter.
  const round = state.round;
  const questionIndex = round
    ? round.questionIndex
    : TUTORIAL_ROUNDS[TUTORIAL_ROUND_ORDER[state.track][0]].questionIndex;
  const q = TUTORIAL_QUESTIONS[questionIndex];
  const combatants = combatantViewsFromTutorial(state);
  return {
    schemaVersion: "tutorial.local.v1",
    serverTime: "",
    matchId: TUTORIAL_MATCH_ID,
    matchStatus: state.matchOver ? "completed" : "active",
    matchOver: state.matchOver,
    winnerId: state.matchOver ? TUTORIAL_PLAYER_ID : null,
    completionReason: state.matchOver ? "knockout" : null,
    completedRounds: state.settled.length,
    players: [combatants.player, combatants.opponent].map((c) => ({
      playerId: c.playerId,
      classId: c.classId,
      hp: c.hp,
      maxHp: c.maxHp,
      totalXp: c.xp,
      level: c.level,
      hasSubmitted: c.hasSubmitted,
      abilitySelectionPhase: c.abilityWindow,
      hasAbilitySelected: c.hasAbilitySelected,
      role: null,
    })),
    activeRound: null,
    nextRoundDurationSeconds: state.timer.duration,
    // The ONE field the canonical quiz viewport reads. Pre-reveal and
    // correctness-free, exactly like the real thing: the tutorial's answer key
    // lives in its fixtures and reaches the surface only through `reveal`.
    question: {
      questionId: `tutorial-q${questionIndex}`,
      prompt: q.prompt,
      options: [...q.choices],
      category: "Training",
      presentation: null,
      optionMedia: null,
    },
    segment: LEGACY_SEGMENT,
    segmentState: null,
    progressionPendingPlayers: [],
    progressionEnabled: state.track !== "r1",
    presence: null,
    playtest: null,
  };
}

/** The viewer's pending answer, as the arena's surface selection. */
export function selectionFromRound(round: RoundState | null): string | null {
  if (!round || round.playerAnswerIndex === null || round.playerAnswerIndex < 0) {
    return null;
  }
  return answerOptionId(round.playerAnswerIndex);
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
 * ANSWER-GRID PERMISSIONS — the one-click sequence Ranked ships.
 *
 * Ranked's own projection is `projectPermissions("selecting", inputOpen,
 * submitting)`: the grid is live while the round is open and dead once it is
 * locked, and there is no review or confirm state on either side of it. This
 * says the same thing in the tutorial's vocabulary.
 *
 * A coach nudge does NOT close the grid — closing it would strand a learner
 * who has just been told to pick again with nothing to pick. It leaves the
 * tablets live and carries its reason, which the arena's status line shows.
 */
export function permissionsFromTutorial(
  state: TutorialState,
  interactive: boolean,
): InteractionPermissions {
  const round = state.round;
  if (!round || !interactive || round.phase !== "selecting") return NO_INTERACTIONS;
  const base: InteractionPermissions = {
    canSelectAnswer: true,
    canChangeAnswer: true,
    canSelectAbility: true,
    canReviewSubmission: false,
    canConfirmSubmission: false,
    canAdvance: false,
  };
  if (round.coachNudge === null) return base;
  return restrictPermissions(base, {
    disabledReasons: { answer: coachNoteFor(round.coachNudge) },
  });
}

/** The coaching sentence for a refused submission. */
export function coachNoteFor(nudge: "answer" | "ability"): string {
  return nudge === "answer"
    ? "Training tip: that answer won't land this lesson — pick again."
    : "Training tip: this lesson needs a different ability armed — arm it, then answer.";
}

/**
 * ABILITY-TRAY PERMISSIONS — gated INDEPENDENTLY of the answer, exactly as
 * Ranked gates its own tray: the tray is live for as long as the round's
 * selection window is open, and dead the moment the answer locks it.
 */
export function abilityPermissionsFromTutorial(
  state: TutorialState,
  interactive: boolean,
): InteractionPermissions {
  const round = state.round;
  if (!round || !interactive || round.phase !== "selecting") {
    return restrictPermissions(NO_INTERACTIONS, {
      disabledReasons: { ability: round ? "Ability locked for this round." : undefined },
    });
  }
  return { ...NO_INTERACTIONS, canSelectAbility: true };
}

/**
 * Build the canonical resolved-round settlement from a round's REVEALED
 * result plus its authored fixture. Called only post-reveal — every value is
 * an authored pass-through (damage, mitigation defaults to zero unless the
 * fixture authored it; nothing is computed from formulas).
 */
/**
 * ROUND ORDER PER TRACK — the tutorial's own answer to "which round is this?".
 *
 * Needed because the R1 track skips the four ability lessons: its victory
 * round is the FOURTH round the learner plays, not the eighth. The previous
 * derivation (`"ABCDEFGH".indexOf(roundId) + 1`) could not see that at all —
 * `H_R1` is not a letter of that string, so it produced round 0.
 */
export const TUTORIAL_ROUND_ORDER: Record<TutorialTrack, readonly TutorialRoundId[]> = {
  legacy: ["A", "B", "C", "D", "E", "F", "G", "H"],
  r1: ["A", "B", "C", "H_R1"],
};

/** 1-based round number of a round on a track, or 0 if it is not on it. */
export function tutorialRoundNumber(
  roundId: TutorialRoundId, track: TutorialTrack = "legacy",
): number {
  return TUTORIAL_ROUND_ORDER[track].indexOf(roundId) + 1;
}

/** How many rounds the whole scripted match runs to on this track. */
export function tutorialRoundCount(track: TutorialTrack): number {
  return TUTORIAL_ROUND_ORDER[track].length;
}

export function resolvedRoundViewFromResult(
  result: RevealedRoundResult,
  fixture: ResolvedRoundFixture = TUTORIAL_ROUNDS[result.roundId],
  track: TutorialTrack = "legacy",
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
    roundNumber: tutorialRoundNumber(result.roundId, track),
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
    // ARENA1 Step 4: the fixtures now AUTHOR the correct choice (see
    // `ResolvedRoundFixture.correctAnswer`), so the canonical answer tablets
    // resolve at reveal exactly as they do in Ranked.
    //
    // The QUIZ1 Phase 11 rule this replaces still holds and is the reason the
    // field is authored rather than derived: an index inferred from
    // `playerCorrect` would highlight whatever the learner happened to click,
    // and round E deliberately guides them into a wrong one.
    correctOptionIndex: fixture.correctAnswer,
    // The tutorial is a scripted fixture, not a served question: it has no
    // reviewed candidate behind it and therefore no frozen rationale to
    // quote. Null, never invented text.
    questionExplanation: null,
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

/**
 * Every settled round of this run, as canonical settlements.
 *
 * The same array Ranked's controller keeps as its damage log, and it feeds the
 * same two consumers: each duelist rail's recent-round ledger, and the round
 * timeline. Derived from the machine's own reveals, so a round appears here if
 * and only if it actually resolved.
 */
export function settlementsFromTutorial(state: TutorialState): ResolvedRoundView[] {
  return state.settled.map((result) =>
    resolvedRoundViewFromResult(result, TUTORIAL_ROUNDS[result.roundId], state.track));
}

export const TUTORIAL_NAMES_BY_ID: Record<string, string> = {
  [TUTORIAL_PLAYER_ID]: TUTORIAL_PLAYER.name,
  [TUTORIAL_GOLEM_ID]: TUTORIAL_OPPONENT.name,
};
