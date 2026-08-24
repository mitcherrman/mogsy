// ---------------------------------------------------------------------------
// THE TUTORIAL ADAPTER — tutorial state → `ArenaViewModel` (ARENA1 Step 4).
//
// The mode half of the arena, exactly as `QuizRankedMatch` is Ranked's. It
// holds everything true of the TUTORIAL and of nothing else — the scripted
// lesson's idea of a round number, which steps are interactive, what the
// Golem's neutral status line says, when the ability layer is being taught —
// and it produces the same view model Ranked produces, which `CanonicalArena`
// draws without being able to tell the two apart.
//
// WHAT IT MUST NEVER DO
// ─────────────────────
// Render. There is no JSX in this file and there is no arena part imported
// into it: the tutorial's teaching CONTENT is composed by the page and handed
// to the arena through its one guidance slot. Nor does it compute a combat
// value — every number below is an authored fixture pass-through that already
// went through the machine.
// ---------------------------------------------------------------------------

import { rendererForSegment } from "@/lib/ranked-core/modules/registry";
import type {
  ArenaRail, ArenaViewModel,
} from "@/lib/ranked-core/arenaView";
import type {
  ResolvedRoundView, RoundTimelineView,
} from "@/lib/ranked-core/viewTypes";
import type { SurfaceReveal } from "@/lib/question-surface/contract";
// The canonical settlement projections. These are pure functions over an
// authoritative settlement — the SAME ones Ranked's controller calls and the
// same ones the arena inspector calls — so the tutorial's rails, its mascots
// and its timeline are produced by the production code path, not a copy of it.
import {
  projectMascotReactions, projectRevealDamage, projectRevealOutcomes,
  projectRoundHistory, projectSurfaceReveal,
} from "@/pages/quiz-ranked/rankedViews";
import { projectRoundTimeline } from "@/pages/quiz-ranked/roundTimeline";
import {
  abilityViewsFromTutorial, coachNoteFor, combatantViewsFromTutorial,
  permissionsFromTutorial, abilityPermissionsFromTutorial,
  publicRoundFromTutorial, resolvedRoundViewFromResult, selectionFromRound,
  settlementsFromTutorial, timerViewFromTutorial, tutorialRoundNumber,
  TUTORIAL_GOLEM_ID, TUTORIAL_PLAYER_ID,
} from "./adapters";
import { TUTORIAL_ROUNDS } from "./fixtures";
import type { TutorialEvent, TutorialState } from "./types";

/** What the tutorial director tells the adapter about the current step. */
export interface TutorialArenaPolicy {
  /** Is this step's round open for play at all? */
  roundInteractive: boolean;
  /** Does this track/step have an ability tray to show? */
  abilityTrayActive: boolean;
  /** Is the level-2 choice the focal control right now? */
  levelTwoChoiceOpen: boolean;
  /** Level-2 options, already in the arena's option shape. */
  levelTwoOptions: { id: string; name: string; description: string }[];
}

/** Neutral status line for the scripted opponent — never its choice. */
function golemPresence(state: TutorialState): string | null {
  const round = state.round;
  if (!round) return null;
  switch (round.opponentStatus) {
    case "submitted": return "Training Golem has locked in";
    case "timed_out": return "Training Golem ran out of time";
    default: return "Training Golem is thinking…";
  }
}

/** The settlement of the round on screen, or null before it resolves. */
export function currentSettlement(state: TutorialState): ResolvedRoundView | null {
  const result = state.round?.result ?? null;
  if (!result) return null;
  return resolvedRoundViewFromResult(
    result, TUTORIAL_ROUNDS[result.roundId], state.track);
}

/**
 * THE VIEW MODEL.
 *
 * `dispatch` is the only capability handed in: every interactive surface the
 * arena renders reports back into the machine, and the machine decides. In
 * particular the answer grid submits — ONE CLICK, the production Ranked
 * interaction — and a click the lesson cannot accept is refused by the machine
 * with a coaching nudge rather than filtered out here.
 */
export function tutorialArenaView(
  state: TutorialState,
  policy: TutorialArenaPolicy,
  dispatch: (event: TutorialEvent) => void,
): ArenaViewModel {
  const round = state.round;
  const combatants = combatantViewsFromTutorial(state);
  const publicRound = publicRoundFromTutorial(state);
  const renderer = rendererForSegment(publicRound.segment);
  const question = renderer ? renderer.projectQuestion(publicRound) : null;

  const settlement = currentSettlement(state);
  const revealed = round?.phase === "revealed";
  const roundNumber = round ? tutorialRoundNumber(round.roundId, state.track) : null;

  // The settled record, and the two things the arena derives from it.
  const settlements = settlementsFromTutorial(state);
  const history = {
    player: projectRoundHistory(settlements, TUTORIAL_PLAYER_ID),
    opponent: projectRoundHistory(settlements, TUTORIAL_GOLEM_ID),
  };

  /**
   * The reveal beat, held for as long as the LESSON holds it.
   *
   * Ranked gates its verdicts on `revealHold`, a ~1.5s presentation beat. The
   * tutorial's equivalent is the round's own `revealed` phase, which lasts
   * until the learner presses Continue — that IS the lesson. Passing it
   * through the same projections means the verdict row, the damage figure and
   * the mascot reaction are the production ones, simply held longer.
   */
  const outcomes = projectRevealOutcomes(settlement, revealed);
  const damage = projectRevealDamage(settlement, revealed);
  const reactions = projectMascotReactions(settlement, revealed);

  const rail = (which: "player" | "opponent"): ArenaRail => {
    const c = combatants[which];
    return {
      kind: "combatant",
      combatant: c,
      damage: history[which],
      outcome: outcomes[c.playerId] ?? null,
      damageDealt: damage[c.playerId] ?? null,
      reaction: reactions[c.playerId] ?? null,
    };
  };

  // The canonical answer-tablet reveal, from the canonical gate. Null until
  // the round has settled, and only ever for the round on screen.
  const reveal: SurfaceReveal | null =
    projectSurfaceReveal(settlement, roundNumber, question);

  const timeline: RoundTimelineView | null = projectRoundTimeline({
    roundNumber,
    completedRounds: state.settled.length,
    // A quiz segment's own ordinal IS the round's; the tutorial has no phased
    // segment for the two to disagree about.
    segmentRoundNumber: roundNumber,
    matchOver: state.matchOver,
    settlements,
    viewerSlot: "p1",
  });

  const inputOpen = policy.roundInteractive && round?.phase === "selecting";
  const abilities = abilityViewsFromTutorial(state);

  return {
    header: {
      eyebrow: "Ranked Training",
      // Ranked's own words for the same two states, because they are the same
      // two states: a round is in play, or one is about to be.
      title: state.matchOver
        ? "Training match complete"
        : roundNumber ? `Round ${roundNumber}` : "Preparing match…",
      transitionNote: null,
      // The two historical note slots, carrying the tutorial's two short
      // lines: what this match IS, and what the scripted opponent is doing.
      playtestNote: "Training · Scripted",
      presenceNote: golemPresence(state),
      // A finished match has no round clock. The lessons that follow the
      // victory (queue, recovery, ads) stay in the arena so the ledgers and the
      // timeline remain readable behind them — but leaving a paused 0:30 up
      // there would be the one thing on screen that is not true any more.
      timer: state.matchOver ? null : timerViewFromTutorial(state),
      timerLabel: "Shared round timer",
    },
    // The header's result plate — the same beat Ranked resolves a round in.
    roundBeat: revealed && settlement
      ? { settlement, viewerSlot: "p1" } : null,
    // The tutorial teaches no Meta Reflex block, so it settles none.
    segmentBeat: null,
    left: rail("player"),
    right: rail("opponent"),
    surface: {
      renderer,
      publicRound,
      segmentState: null,
      selection: selectionFromRound(round),
      permissions: permissionsFromTutorial(state, policy.roundInteractive),
      // Nothing here owns its own submission, so no module action is ever
      // called. Supplied because the contract has the field, not because a
      // tutorial round can round-trip anything.
      actions: { submitChallenge: () => {}, busy: false, error: null },
      skewMs: 0,
      reveal,
      // ONE CLICK IS THE SUBMISSION — the Ranked interaction, and the whole of
      // the tutorial's answer flow. The index comes from the projected
      // question so nothing here parses an option id.
      onSelect: (selection) => {
        const option = question?.options.find((o) => o.id === selection);
        if (option) dispatch({ type: "SUBMIT_ANSWER", answerIndex: option.index });
      },
      ownsSubmission: false,
      inputOpen: Boolean(inputOpen),
      // The question stage is drawn only while a round is genuinely in play.
      // The lessons with no round (the timer introduction, and everything
      // after the match ends) keep the arena and put their teaching in the
      // guidance slot instead of a question they cannot answer.
      hasContent: question !== null && round !== null && !state.matchOver,
    },
    progression: policy.levelTwoChoiceOpen ? {
      options: policy.levelTwoOptions,
      pendingOptionId:
        state.chosenLevelTwoAbilityId ?? state.pendingLevelTwoChoiceId,
      busy: false,
      /**
       * ONE CLICK, exactly as Ranked's level-2 choice is one click.
       *
       * The machine still models the pick and the permanent commitment as two
       * transitions — that is its own accounting, and its duplicate rejection
       * depends on it — but the LEARNER performs the interaction the real game
       * has. Teaching a confirm step Ranked does not have was the same mistake
       * the answer flow made.
       */
      onSelectOption: (optionId) => {
        if (state.chosenLevelTwoAbilityId) return;
        dispatch({ type: "CHOOSE_LEVEL_TWO", abilityId: optionId });
        dispatch({ type: "CONFIRM_LEVEL_TWO" });
      },
    } : null,
    abilityHud: policy.abilityTrayActive ? {
      abilities,
      selectedAbilityId: round?.playerAbilityId ?? null,
      permissions: abilityPermissionsFromTutorial(state, policy.roundInteractive),
      onSelectAbility: (abilityId) => dispatch({ type: "SELECT_ABILITY", abilityId }),
      noAbilityLabel: "Clear ability",
    } : null,
    status: {
      text: round?.coachNudge ? coachNoteFor(round.coachNudge)
        : revealed ? "Round resolved — read the reveal, then continue."
          : round?.phase === "locked"
            ? "Answer locked — waiting for the reveal."
            : inputOpen ? "Choose an answer to lock it in." : "",
      // A coaching nudge is guidance, not a failure. The tutorial never
      // reports one as an error, and nothing in it ever fails the player.
      isError: false,
    },
    // Nothing to forfeit: a practice run is not a thing you concede.
    hudAction: null,
    timeline,
    /**
     * Deliberately FALSE for the whole tutorial.
     *
     * `revealHold` is Ranked's ~1.5s "damage is landing, do not accept a click
     * yet" beat, and it dims the question to 60% for its duration. The
     * tutorial's reveal is not a beat to sit through — it is the thing being
     * read, and it lasts until the learner continues. Dimming it for minutes
     * would obscure the lesson. Interaction is withheld by the permissions
     * above instead, which is the authority for it in both modes.
     */
    revealHold: false,
    progressionEnabled: state.track !== "r1",
  };
}
