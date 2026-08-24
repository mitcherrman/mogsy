// ---------------------------------------------------------------------------
// THE DAILY ADAPTER — run state → `ArenaViewModel` (ARENA1 Step 5).
//
// The mode half of the arena, exactly as `QuizRankedMatch` is Ranked's and
// `tutorialArenaView` is the Tutorial's. It holds everything true of the DAILY
// and of nothing else — that a card has one scored attempt and unlimited
// learning ones, that a Meta Reflex window is opened by a press, that the plan
// is finite, that a resolved card is held until the player moves on — and it
// produces the same view model the other two produce, which `CanonicalArena`
// draws without being able to tell them apart.
//
// WHAT IT MUST NEVER DO
// ─────────────────────
// Render. There is no JSX in this file and no arena part is imported into it:
// the two nodes the Daily genuinely contributes — the right-hand target panel
// and its own controls — are composed by the page and handed in through the
// arena's existing rail and guidance slots.
//
// Nor does it decide a game fact. Every number below is a pass-through of the
// authoritative run projection. Which card is current, which options are gone,
// whether the score is locked, what the score is: all read, never mirrored.
//
// WHAT IT DELIBERATELY DOES NOT PRODUCE
// ─────────────────────────────────────
// A second combatant. `right` is a PANEL, not a duelist: there is no opponent,
// no rating, no bot, no presence line and no speed comparison anywhere in this
// file, and the arena is perfectly happy with a flank that is a panel because
// Step 3 built the seam for exactly this.
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";
import { rendererForSegment } from "@/lib/ranked-core/modules/registry";
import { projectRoundTimeline } from "@/lib/ranked-core/roundTimeline";
import type {
  ArenaRail, ArenaTerminalView, ArenaViewModel,
} from "@/lib/ranked-core/arenaView";
import type {
  CombatantView, InteractionPermissions, ResolvedCombatantView, RoundTimelineView,
} from "@/lib/ranked-core/viewTypes";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import type { SurfaceReveal } from "@/lib/question-surface/contract";
import { answerOptionId } from "@/lib/ranked-core/adapters/adaptToViews";
import type { DcCard, DcResolvedCard, DcRun, DcToday } from "@/lib/daily-challenge/contracts";
import {
  DAILY_PLAYER_ID, DcBeat, DcCardPhase, beatStatusText, canAnswer, cardPhase,
  dailyOutcomes, dailySegmentKinds, feedbackForCard, projectReveal,
  publicRoundFromCard, roundHistoryFromRun,
} from "./dailyChallengeViews";

/** Everything the page knows, in one bag, so the projection stays pure. */
export interface DailyArenaInput {
  run: DcRun;
  today: DcToday | null;
  /** The card the STAGE is showing — the held one, else the run's current. */
  card: DcCard | null;
  /** True while that card is a resolved one being HELD for reading. */
  held: boolean;
  beat: DcBeat | null;
  busy: boolean;
  error: string | null;
  /** The live scored window, already projected. Null whenever none is open. */
  timer: ReturnType<typeof import("./dailyChallengeViews").projectTimer>;
  skewMs: number;
  displayName: string | null;
  /** The Daily's own right-hand panel, composed by the page. */
  targetPanel: ReactNode;
  /** One click IS the answer: the backend option index. */
  onAnswer: (optionIndex: number) => void;
}

/**
 * YOU — the left flank, as a combatant.
 *
 * Not a metaphor stretched to fit. The panel asks four questions and a solo
 * run answers three of them honestly:
 *
 *   who is this          the player's name, in the neutral role treatment. No
 *                        role is claimed, because the Daily freezes none, and
 *                        the crest draws its neutral emblem in exactly the box
 *                        a role would have taken.
 *   the primary meter    the run's SCORE against the day's frozen maximum. It
 *                        fills the same bar, at the same thresholds, and it is
 *                        labelled what it is (see `meterLabel`) rather than
 *                        being passed off as health.
 *   the recent record    one row per settled card — the verdict and what it
 *                        awarded. Under retry-until-correct this is the only
 *                        thing that distinguishes a day, so it is the part of
 *                        the column that matters most here.
 *
 * The fourth — the level/XP layer — a Daily does not have, and
 * `progressionEnabled: false` removes it outright rather than drawing an empty
 * track. That is the same answer R1 Ranked gives.
 */
function dailyCombatant(
  { run, displayName, busy }:
  { run: DcRun; displayName: string | null; busy: boolean },
): CombatantView {
  return {
    playerId: DAILY_PLAYER_ID,
    name: displayName ?? "Challenger",
    tag: "Solo run",
    // No role is FROZEN by a Daily, and one must never be invented. The role
    // vocabulary is still the right one: it is what a modern match speaks, and
    // the crest's neutral emblem is its answer for "no role", which is exactly
    // this participant's situation.
    roleId: null,
    identityMode: "role",
    side: "player",
    classId: "",
    hp: run.score,
    maxHp: run.maxScore > 0 ? run.maxScore : null,
    meterLabel: "Score",
    xp: 0,
    level: 1,
    nextLevelThreshold: null,
    currentLevelThreshold: null,
    // "Answer locked" while a submission is in flight; the reveal verdict
    // replaces the chip entirely while a resolved card is held.
    hasSubmitted: busy,
    abilityWindow: null,
    hasAbilitySelected: null,
  };
}

/** The reveal beat's verdict for the held card, or null. */
function heldVerdict(card: DcCard | null, held: boolean):
{ outcome: ResolvedCombatantView["outcome"]; awarded: number; sequence: number } | null {
  if (!held || !card || card.resolved !== true) return null;
  const resolved = card as DcResolvedCard;
  return {
    outcome: resolved.firstAttemptCorrect ? "correct"
      : resolved.scoreOutcome === "timeout" ? "timed_out" : "incorrect",
    awarded: resolved.awardedScore,
    sequence: resolved.sequence,
  };
}

/** Interaction, decided by the CARD's server-stated phase and nothing else. */
function dailyPermissions(
  phase: DcCardPhase | null, held: boolean, busy: boolean,
): InteractionPermissions {
  const open = !held && !busy && canAnswer(phase);
  return {
    ...NO_INTERACTIONS,
    canSelectAnswer: open,
    // One click IS the submission — the production Ranked interaction. There
    // is no change-your-mind state to permit, in either mode.
    canChangeAnswer: false,
  };
}

/** A short descriptor of the card itself. Never a second player. */
function cardNote(card: DcCard | null): string | null {
  if (!card) return null;
  const kind = card.kind === "meta_reflex" ? "Meta Reflex" : card.tier;
  const label = kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : null;
  return label ? `${label} · ${card.points} pts` : `${card.points} pts`;
}

/** The status line: an error, the beat that just played, else the phase. */
function statusFor(input: DailyArenaInput, phase: DcCardPhase | null): string {
  if (input.error) return input.error;
  if (input.busy) return "Sending…";
  const beat = input.beat && input.card && input.beat.sequence === input.card.sequence
    ? input.beat : null;
  if (beat) return beatStatusText(beat);
  switch (phase) {
    case "learning":
      return "Scored attempt spent — keep solving to clear the card.";
    case "reflex_ready":
      return "Read the card. The clock starts when you do.";
    case "reflex_timed":
      return "Answer before the window closes.";
    case "resolved":
      return "Card resolved — read the explanation, then continue.";
    case "open":
      return "Choose an answer to lock it in.";
    default:
      return "";
  }
}

export function dailyArenaView(input: DailyArenaInput): ArenaViewModel {
  const { run, card, held } = input;
  const phase = cardPhase(card);
  const publicRound = publicRoundFromCard(card, run);
  const renderer = rendererForSegment(publicRound.segment);
  const question = renderer ? renderer.projectQuestion(publicRound) : null;
  const verdict = heldVerdict(card, held);

  /**
   * THE CARD, as RG3's feedback model — the one channel the shared surface
   * reads a verdict, a struck set and a disclosure gate from.
   *
   * The same disclosure gate the other two modes pass through, and it is the
   * ADAPTER's, not this file's: the answer is published only from a resolved
   * card, `disclosureAllowed` is the backend's `resolved` and never its
   * `score_locked`, and a first miss therefore strikes an option and reveals
   * nothing.
   *
   * ARENA1 Step 5 originally answered this with a `SurfaceReveal.verdict`
   * override, so the feedback box could say "Learned" instead of shouting
   * "Incorrect" at a player who had just got the card right. RG3 reached
   * `main` first with a fuller model of the same problem — verdict, score
   * lock, retry availability and disclosure as one sealed statement about one
   * card, with `VerdictLine` written for this mode by name — so the override
   * is gone and this rides the production channel. The wording of a
   * solved-after-a-miss card is RG3's ("INCORRECT", for the SCORED attempt,
   * beside the score-locked note); see the handoff, it is a live product
   * question and not something this integration should decide silently.
   */
  const feedback = feedbackForCard(card);
  /**
   * WHAT THIS MODE CALLS THE RESOLUTION.
   *
   * Copy, not correctness — `feedback` above already carries every fact, and
   * this changes only the headline and its colour.
   *
   * NEVER "Incorrect". A card the player has just solved IS solved; what it
   * did not do is score, and there is no version of this mode in which the
   * moment a learner finally gets a card right is shouted at them in red.
   */
  const surfaceVerdict = card && card.resolved === true
    ? (() => {
      const view = projectReveal(card as DcResolvedCard);
      return view.firstAttemptCorrect
        ? { label: "Solved first try", tone: "positive" as const }
        : {
          label: view.timedOut ? "Learned after the window closed" : "Learned",
          tone: "neutral" as const,
        };
    })()
    : null;

  const left: ArenaRail = {
    kind: "combatant",
    combatant: dailyCombatant(input),
    damage: roundHistoryFromRun(run),
    /**
     * THE SHOUTED VERDICT FIRES ONLY ON A SCORED CARD.
     *
     * In Ranked this plate accompanies damage: it resolves the round that just
     * moved an HP bar. The Daily's meter is score, and only a first-attempt
     * correct card moves it — so that is the card with a beat to shout, and
     * "CORRECT · 100 DMG" is exactly what happened.
     *
     * The other two resolutions are NOT silent; they are delivered in the
     * mode's own words, in the mode's own slots — the status line and the
     * answer surface's verdict. What they are not is announced as "INCORRECT",
     * in red, in the player's own column, at the moment they finally solved
     * the card. The ledger row and the timeline mark below still record the
     * first attempt exactly as it went: those are records, not shouts.
     */
    outcome: verdict?.outcome === "correct" ? "correct" : null,
    damageDealt: verdict?.outcome === "correct" ? verdict.awarded : null,
    // The mascot reacts to every resolution — motion, not a word.
    reaction: verdict
      ? { action: verdict.outcome === "correct" ? "attack" : "hit",
        actionId: verdict.sequence }
      : null,
  };

  /**
   * THE FINITE PLAN, on the canonical strip.
   *
   * Every input is a server fact. The LENGTH is the run's own `card_count`
   * (never a constant — a Daily is 11 to 15 cards); the KINDS are today's
   * frozen structure, dropped wholesale when a resumed run's challenge version
   * disagrees with it; the VERDICTS are the settled cards' own first-attempt
   * outcomes. Nothing here derives a character from an ordinal, which is the
   * standing rule of this projection and the reason a future card shows only
   * that it exists.
   */
  const timeline: RoundTimelineView = projectRoundTimeline({
    roundNumber: card?.sequence ?? run.currentSequence,
    completedRounds: run.resolvedCount,
    segmentRoundNumber: null,
    matchOver: run.status === "completed" && !held,
    settlements: [],
    viewerSlot: "p1",
    totalRounds: run.cardCount,
    observedKinds: dailySegmentKinds(
      input.today?.challenge.structure ?? null,
      input.today?.challenge.challengeVersion ?? null,
      run.challengeVersion),
    outcomes: dailyOutcomes(run),
  });

  const permissions = dailyPermissions(phase, held, input.busy);

  return {
    header: {
      eyebrow: "Daily Challenge",
      title: card ? `Card ${card.sequence} of ${run.cardCount}`
        : run.status === "completed" ? "Challenge complete" : "Preparing the next card…",
      transitionNote: null,
      // The two neutral note slots, carrying the day and the card. Neither
      // says anything about a second player, because there is not one.
      playtestNote: input.today?.challenge.theme ?? null,
      presenceNote: cardNote(card),
      // A card with no open window has no clock, and a finished run has none
      // either. Nothing here counts down a card the player is free to take
      // their time over — only the Meta Reflex window does.
      timer: input.timer,
      timerLabel: "Meta Reflex window",
      // Ranked's defaults describe a shared round and an opponent to wait for.
      // Neither exists here.
      timerNotes: {
        duration: (duration) => `of ${duration} to answer`,
        expired: "Window closed — solve it untimed.",
      },
    },
    // There is no PvP settlement, so there is no settled-round plate and no
    // block transcript. A card's outcome resolves in the left column's verdict
    // row and on its own answer tablets, which is where it belongs.
    roundBeat: null,
    segmentBeat: null,
    left,
    right: { kind: "panel", node: input.targetPanel },
    surface: {
      renderer,
      publicRound,
      segmentState: null,
      // One click IS the answer, so there is never a pending selection to hold.
      selection: null,
      permissions,
      actions: { submitChallenge: () => {}, busy: input.busy, error: input.error },
      skewMs: input.skewMs,
      // The Daily judges without always disclosing, so its whole answer state
      // rides `feedback`. `reveal` is the two-state channel Ranked uses.
      reveal: null,
      feedback,
      surfaceVerdict,
      onSelect: (selection) => {
        const option = question?.options.find((o) => o.id === selection);
        if (option) input.onAnswer(option.index);
      },
      ownsSubmission: false,
      inputOpen: permissions.canSelectAnswer,
      hasContent: question !== null,
      // THE RETRY SEAM (ARENA1 Step 2B), finally reaching a caller. A struck
      // option keeps its place and its letter, leaves the tab order, and every
      // sibling stays live — on the canonical tablets, not a copy of them.
      // The explanation IS what the retry loop exists to deliver, and the
      // competitive variant suppresses it. This is the one field the Daily
      // overrides, through the surface's own documented override mechanism.
      surfaceSettings: { showExplanation: true },
    },
    progression: null,
    abilityHud: null,
    status: { text: statusFor(input, phase), isError: input.error !== null },
    // A solo run is not a thing you concede: there is no opponent to concede
    // TO, and abandoning a Daily simply leaves it unfinished for the day.
    hudAction: null,
    timeline,
    /**
     * Deliberately FALSE — for the same reason the Tutorial's is.
     *
     * `revealHold` is Ranked's ~1.5s "damage is landing" beat, and it dims the
     * question to 60% for its duration. The Daily's resolved card is not a beat
     * to sit through: it is the explanation, being read, for as long as the
     * player wants. Dimming it would obscure the one thing the mode is for.
     * Interaction is withheld through the permissions above instead, which is
     * the authority for it in every mode.
     */
    revealHold: false,
    progressionEnabled: false,
  };
}

/**
 * THE FINISHED DAY.
 *
 * Mounted through the arena's terminal surface, so the shell, the skin, the
 * frame and the mascot are the production ones — and the Daily's own numbers
 * ride in the frame's existing `summary` slot rather than replacing it.
 *
 * `result` is "victory" because a completed Daily IS the good ending: every
 * card was solved. The PvP words it would otherwise print are all overridden —
 * the eyebrow names the day, the heading says what happened — so nothing on
 * screen claims a match was won against anybody. And `opponent` is absent, so
 * the frame draws ONE column.
 */
export function dailyTerminalView(
  input: Omit<DailyArenaInput, "targetPanel" | "onAnswer"> & { summary: ReactNode;
    onHome: () => void },
): ArenaTerminalView {
  return {
    result: "victory",
    player: dailyCombatant(input),
    opponent: null,
    eyebrow: `Daily Challenge · ${input.run.challengeDate}`,
    heading: "Challenge complete",
    subheading: undefined,
    summary: input.summary,
    progressionEnabled: false,
    primaryAction: { label: "Back to Leaguecraft", onClick: input.onHome },
    // No PvP settlement exists, so there is no final reveal panel. The day's
    // own breakdown is the summary above.
    reveal: null,
  };
}
