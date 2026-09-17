/**
 * THE RANKED ADAPTER — the mode half of the arena (ARENA1 Step 3).
 *
 * This file used to be the arena as well as the mode. The renderer moved to
 * `components/ranked-arena/CanonicalArena`, unchanged; what stayed is
 * everything that is TRUE OF RANKED AND OF NOTHING ELSE:
 *
 *   * the live-match controller (`useRankedMatch`) — polling, skew, submission,
 *     the reveal hold, presence, terminal states;
 *   * the projections that turn one Ranked snapshot into neutral view models;
 *   * the surface-lag rule that keeps the question mounted across a round
 *     boundary;
 *   * the accumulated record of what each round's segment WAS, which the
 *     timeline is derived from;
 *   * Ranked's own copy — "vs Bot", "waiting for opponent…", "Back to Quiz".
 *
 * The result is one `ArenaViewModel` per render. Reveal/HP/XP/damage are all
 * authoritative pass-through; no combat value is computed here, and none is
 * computed in the arena either.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArenaShell } from "@/components/ranked-arena/ArenaShell";
import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import {
  DiscoveryReveal, discoveryRevealHasContent,
} from "@/components/ranked-arena/DiscoveryReveal";
import { ForfeitControl } from "@/components/ranked-arena/ForfeitControl";
import { msUntilAnswerable } from "@/lib/ranked-core/timerMath";
import { RankedRulesScroll } from "@/components/ranked-rules/RankedRulesScroll";
import { rendererForSegment } from "@/lib/ranked-core/modules/registry";
import { abilityDescription, abilityName } from "@/lib/ranked-core/abilityDisplay";
import { SubmissionPhase } from "@/lib/ranked-core/viewTypes";
import type { ResolvedRoundView } from "@/lib/ranked-core/viewTypes";
import type {
  ArenaRail, ArenaTerminalView, ArenaViewModel,
} from "@/lib/ranked-core/arenaView";
import type { PublicRoundView } from "@/lib/ranked-public/contracts";
// ARENA1 Step 5: the settlement projections moved down into `ranked-core`.
// Ranked calls the same functions it always did, from where they now live.
import {
  projectMascotReactions, projectRevealDamage, projectRevealOutcomes,
  projectRoundHistory, projectSurfaceReveal,
} from "@/lib/ranked-core/settlementViews";
import { projectCardBeat } from "@/lib/ranked-core/cardBeat";
import {
  centralCardResult, centralResult, liveModuleTitle,
} from "@/lib/ranked-core/centralStage";
import type { AwardEvent } from "@/components/ranked-arena/AwardPops";
import {
  projectRevealFeedback, projectSettlementFeedback,
} from "@/lib/ranked-core/pointsFeedback";
import {
  EMPTY_FINAL_MODULE_WATCH, observeFinalModuleEntry, projectDuelMascotReactions,
  type FinalModuleWatch,
} from "@/lib/ranked-core/duelMascot";
import {
  duelEventOf, duelProgressSuffix, duelStandingLabel, projectDuelState, type DuelStanding,
} from "@/lib/ranked-core/duelState";
import { RankedScoreline } from "./RankedScoreline";
import { GameResultsBody } from "@/components/game-results/GameResultsBody";
import { ResultContestants } from "@/components/game-results/ResultContestants";
import { buildRankedResults } from "./rankedResultsModel";
import { useMatchTimeline } from "./useMatchTimeline";
import { useRankedMatchHistory } from "./useRankedMatchHistory";
import {
  abilityTrayIsUseful, isPointsMatch, moduleProgressLabel,
  opponentLabelFor, opponentPresenceLabel, projectAbilities,
  projectAbilityPermissions, projectCombatants,
  projectPermissions, projectTimer,
} from "./rankedViews";
import {
  EMPTY_OBSERVED_ROUND_KINDS, observeRoundKinds, projectRoundTimeline,
  type ObservedRoundKinds,
} from "@/lib/ranked-core/roundTimeline";
import { useMatchDiscoveries } from "./useMatchDiscoveries";
import { useRankedMatch } from "./useRankedMatch";
import { useRankedAudioBoundary } from "@/components/audio/useRankedAudioBoundary";

/** RD1 — the opponent's column reads the viewer's standing from the other side. */
const OPPOSITE_STANDING: Record<DuelStanding, DuelStanding> = {
  leading: "trailing", tied: "tied", trailing: "leading",
};

/** Identity of the module/segment a snapshot belongs to. */
function segmentKey(round: PublicRoundView): string {
  return `${round.segment.moduleId}.${round.segment.moduleVersion}#${round.segment.segmentNumber ?? "-"}`;
}

/**
 * Display names keyed off the SETTLEMENT's own player ids rather than the
 * controller's `opponentUserId`. The two are guaranteed to agree now that the
 * id mapping is derived from the snapshot being adapted, but keying off the
 * settlement means a mismatch can never render an empty opponent title again
 * (RevealPanel falls back to the raw player id, which used to be "").
 */
/**
 * `p1` is ALWAYS the viewer in this client (see `useRankedMatch`'s
 * `p1PlayerId: viewerUserId` mapping), so the slots are the two sides of the
 * arena and not a server ordering.
 *
 * RB2: the other side takes the same label the duelist columns take, so the
 * reveal panel and the combatant panels cannot disagree about what the
 * opponent is called on a bot match.
 */
function revealNames(settlement: ResolvedRoundView,
                     otherLabel: string): Record<string, string> {
  return {
    [settlement.players.p1.playerId]: "You",
    [settlement.players.p2.playerId]: otherLabel,
  };
}

/**
 * RB2 — where the player goes when the duel is over.
 *
 * `/quiz?play=1` is the lobby with the match-entry record already open (see
 * `PLAY_RETURN_PARAM` in `pages/Quiz`), which is the SAME arrival the route
 * already produces for a menuless visitor. Playing again is therefore the
 * existing entry path with one navigation removed, not a rematch endpoint —
 * there is no second creation call, and a bot player re-arms the same switch
 * on the same record a human player uses to queue.
 *
 * A full document load rather than a router push, matching what this screen
 * has always done: a finished match is exactly the moment it is cheapest to
 * drop every piece of arena state on the floor.
 */
const AGAIN_HREF = "/quiz?play=1";
const LOBBY_HREF = "/quiz";

export interface QuizRankedMatchProps {
  matchId: string;
  viewerUserId: string;
  /**
   * RB3.2 — is this match being ENTERED or RECOVERED?
   *
   * Both words are load-bearing. It decides whether the controller makes the
   * recovery round trip at all (see `useRankedMatch`), and it decides what the
   * pre-first-snapshot placeholder SAYS. Until now that placeholder read
   * "Recovering match…" for every arrival, including the overwhelmingly
   * common one — a match created a second ago that has nothing to recover —
   * which told a player their brand-new duel was being salvaged.
   *
   * Defaults to `"recovered"`, the conservative reading: a caller that does
   * not know how it got here is treated as one that lost its place.
   */
  entry?: "fresh" | "recovered";
  /**
   * RB3 — hold the match while a SESSION PRESET has an informational page on
   * screen. Forwarded verbatim to `useRankedMatch`, which stops driving the
   * server so no round opens and no clock starts. False for every ordinary
   * match, human or bot, and this component is otherwise unchanged.
   */
  paused?: boolean;
  /**
   * RB3 — where the canonical result screen's primary action goes when this
   * match belongs to a session preset.
   *
   * The result screen itself is NOT replaced: RB2 made the bot end screen a
   * real Ranked completion and a playtester reads exactly that. This only
   * changes what the button after it says and does, so the player steps from
   * their result into the playtest's closing page instead of back to the
   * lobby. Absent — every ordinary match — and RB2's actions stand untouched.
   */
  onSessionComplete?: () => void;
  /**
   * RB3 — report the two facts a session preset needs, and nothing else.
   *
   * `completedSegments` is the SERVER's settled-segment count, straight off
   * the snapshot; `matchOver` is the match's own terminal flag. A preset
   * derives its whole position from these, which is why the guided sequence
   * survives a refresh: they come back from the server, not from memory.
   *
   * A reporting seam, deliberately not a control one — nothing a listener does
   * here can change what this component renders.
   */
  onProgress?: (completedSegments: number, matchOver: boolean) => void;
  /**
   * The route's own chrome, rendered in the shell's header slot.
   *
   * A PROP rather than something this file writes, because the row contains a
   * router `Link` and the arena is not a routed thing — every test that mounts
   * a match would otherwise need a Router to render a title bar it does not
   * assert. The route supplies it; the arena renders it.
   */
  chrome?: ReactNode;
}

/**
 * THE RANKED ROUTE'S RENDERED SURFACE — the arena, plus Ranked's own scroll.
 *
 * `RankedRulesScroll` is a sibling of the arena and never a child of it: it is
 * a `position: fixed` control that enters no layout, so it cannot move, clip
 * or remount a question, and the arena stays the one thing that draws a match.
 * It is mounted here rather than on the route because the explanation is
 * Ranked's copy about Ranked's scoring, which is exactly the kind of thing
 * this file already owns ("vs Bot", "waiting for opponent…", "Back to Quiz").
 */
export function QuizRankedMatch(props: QuizRankedMatchProps) {
  return (
    <>
      <RankedMatchArena {...props} />
      <RankedRulesScroll />
    </>
  );
}

function RankedMatchArena({ matchId, viewerUserId, chrome,
                            entry = "recovered",
                            paused = false, onSessionComplete,
                            onProgress }: QuizRankedMatchProps) {
  const m = useRankedMatch(matchId, viewerUserId, { paused, entry });
  // RB3 — the reporting seam. An effect rather than a render-time call so a
  // listener's own state update cannot re-enter this render, and keyed on the
  // two values so a poll that changed neither notifies nothing.
  const completedSegments = m.publicRound?.completedRounds ?? null;
  const isOver = m.phase === "match_over";
  useEffect(() => {
    if (onProgress && completedSegments !== null) {
      onProgress(completedSegments, isOver);
    }
  }, [onProgress, completedSegments, isOver]);
  // The mode soundtrack, for as long as there is a live match to score.
  const modeSoundtrackActive = m.publicRound !== null
    && m.phase !== "match_over"
    && m.phase !== "fatal"
    && m.contractError === null;
  useRankedAudioBoundary(matchId, modeSoundtrackActive);
  /**
   * PT1.3 — the permanent questions this match added to the player's
   * collection. Called at the TOP of the component (hooks cannot live behind
   * the early returns below) and gated to the terminal phase, so a live match
   * never spends the request. One read, never polled: the discoveries were
   * committed with the submissions that caused them, so a settled match's
   * answer is final.
   */
  const discoveries = useMatchDiscoveries(matchId, m.phase === "match_over");
  /**
   * RP1 Step 4 — THE RATING MOVEMENT THIS MATCH APPLIED, or nothing.
   *
   * The live result projection carries `rating_application_status` but no
   * delta; the account's own history row is where the applied number lives, so
   * that is what is read — the same endpoint and the same parsed contract the
   * lobby's history widget already uses, gated to the terminal phase so a live
   * match never spends the request.
   *
   * NOTHING IS FABRICATED. A bot or otherwise unrated match, a rating that has
   * not been applied yet, a history read that fails or lags — all of them end
   * with `ratingDelta: null` and the scoreline simply has no rating chip. The
   * one number this can show is a number the backend applied.
   */
  /**
   * The finished match's MODULES — one read of the existing review endpoint,
   * gated to the terminal phase exactly like the two reads above it, so a live
   * match never spends the request. See `useMatchTimeline`.
   */
  const matchReview = useMatchTimeline(matchId, m.phase === "match_over");
  const history = useRankedMatchHistory(5, { enabled: m.phase === "match_over" });
  const historyRow = history.entries.find((e) => e.matchId === matchId) ?? null;
  const ratingDelta = historyRow?.ratingDelta ?? null;
  /** The standing this match left the account on, when the row stated one. A
   *  rating AFTER is a fact; the TIER it falls in is not — the client holds no
   *  thresholds, so no tier is derived from it anywhere. */
  const ratingAfter = historyRow?.ratingAfter ?? null;
  const [tick, setTick] = useState(0);
  const [pendingLevel2, setPendingLevel2] = useState<string | null>(null);

  /**
   * The snapshot the QUESTION SURFACE renders from — deliberately laggier than
   * the live one.
   *
   * Two things used to unmount the whole question subtree (killing the scenario
   * card's Ken Burns loop and replaying every answer's entrance stagger):
   * `activeRound` going briefly null between rounds, and the next round
   * arriving in the same frame as the previous round's settlement. Holding the
   * last usable snapshot fixes both — the subtree stays mounted and simply
   * keeps showing the round the player was just looking at.
   *
   * Everything else on screen (HP, XP, timer, presence) still reads the LIVE
   * snapshot, so damage lands on the meters while the reveal is being read.
   */
  const [renderedRound, setRenderedRound] = useState<PublicRoundView | null>(null);
  const live = m.publicRound;
  const canAdvanceSurface = live !== null && !m.revealHold && (
    // A real round is open, or this is the first snapshot we have ever seen, or
    // the segment itself changed (a phased segment legitimately has no engine
    // round, so waiting for one would pin the surface to the wrong module).
    live.activeRound !== null
    || renderedRound === null
    || segmentKey(live) !== segmentKey(renderedRound)
  );
  if (canAdvanceSurface && live !== renderedRound) setRenderedRound(live);
  const surfaceRound = renderedRound ?? live;

  // 1s render tick so the skew-anchored timer counts down between polls.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const combatants = useMemo(
    () => (m.publicRound ? projectCombatants(m.publicRound, viewerUserId) : null),
    [m.publicRound, viewerUserId]);
  /**
   * Phase 11 — the two side columns' recent-damage trails, and their reveal
   * verdicts.
   *
   * The verdicts are gated on `revealHold`, which is exactly the beat the
   * arena already withholds interaction for: both columns resolve together,
   * for the same ~1.5s, and then return to their neutral status. Nothing here
   * decides anything — outcome, damage dealt and HP after are all read off the
   * authoritative settlement.
   */
  const roundHistory = useMemo(() => ({
    player: combatants
      ? projectRoundHistory(m.damageLog, combatants.player.playerId) : [],
    opponent: combatants
      ? projectRoundHistory(m.damageLog, combatants.opponent.playerId) : [],
  }), [m.damageLog, combatants]);
  const revealOutcomes = useMemo(
    () => projectRevealOutcomes(m.lastResolved, m.revealHold),
    [m.lastResolved, m.revealHold]);
  const revealDamage = useMemo(
    () => projectRevealDamage(m.lastResolved, m.revealHold),
    [m.lastResolved, m.revealHold]);
  /**
   * RP1 — the settled module's award per player, and WHY, for the same reveal
   * beat.
   *
   * Read off the settlement's own `module_points`, which the backend publishes
   * only for a module it scored. It is therefore empty on an hp match without
   * this file asking, and a points rail shows an award exactly when the
   * backend banked one. The block transcript rides along so a slice's base
   * line can be its own count ("4 / 5") rather than a single verdict word.
   */
  const revealFeedback = useMemo(
    () => projectRevealFeedback(m.lastResolved, m.revealHold,
      m.lastSegmentSettlement
        ? { settlement: m.lastSegmentSettlement, roundNumber: m.lastSegmentRoundNumber }
        : null),
    [m.lastResolved, m.revealHold, m.lastSegmentSettlement, m.lastSegmentRoundNumber]);
  /**
   * POINT1 — the SAME awards, ungated, for the header's result plate.
   *
   * The plate stays after its beat as the previous-module summary; the rails
   * do not. Gating it on `revealHold` therefore let it decay into the legacy
   * damage line ~1.5s after every settlement. Nothing else differs.
   */
  const headerFeedback = useMemo(
    () => projectSettlementFeedback(m.lastResolved,
      m.lastSegmentSettlement
        ? { settlement: m.lastSegmentSettlement, roundNumber: m.lastSegmentRoundNumber }
        : null),
    [m.lastResolved, m.lastSegmentSettlement, m.lastSegmentRoundNumber]);
  /**
   * RM1 Pass 2B — THE TRANSIENT PAYOUTS, one per column.
   *
   * Two streams reach a banner's pop layer through one prop, and they are
   * distinguished by the id each carries, never by a mode branch:
   *
   *   * `card:<round>:<index>` — ONE card of a Meta Reflex block, viewer only
   *     (see below);
   *   * `award:<playerId>:<round>` — the module's settlement, both columns.
   *
   * ─────────────────────────────────────────────────────────────────────
   * WHAT THE BACKEND ACTUALLY PUBLISHES DURING A BLOCK — the audit
   * ─────────────────────────────────────────────────────────────────────
   * A Meta Reflex block settles ONCE. `feed_engine_outcomes` runs at the
   * block's resolution, so neither player's authoritative SCORE moves while
   * the block is in play: the score the columns show is correct throughout
   * and simply does not change until the module settles.
   *
   * What IS live is `segmentState.ownCardReveals` — the viewer's own cards,
   * with a server-decided outcome each. That is the only per-card correctness
   * this client has, and it is the viewer's alone: the opponent publishes
   * `opponentChallengesCompleted` and `opponentFinished`, i.e. PROGRESS and
   * never correctness. So the opponent gets no per-card pops, because the only
   * way to draw them would be to invent the one fact the backend withholds.
   *
   * ─────────────────────────────────────────────────────────────────────
   * WHY THE PER-CARD `+1` CANNOT DOUBLE-COUNT THE BLOCK'S BASE
   * ─────────────────────────────────────────────────────────────────────
   * `slice_points` is `points = correct_count` (plus the bonus only when
   * perfect AND first), so one correct card is worth exactly one base point
   * and five `+1`s sum to the block's base. The settlement would then pop that
   * same base again — the same points, twice.
   *
   * So the settlement's base pop is suppressed for a column that has ALREADY
   * been paid it out card by card, and the suppression is RECONCILED rather
   * than assumed: it applies only when the number of cards this client
   * actually popped equals the base the backend published. If they disagree —
   * a reconnect mid-block, a module whose scoring this client does not model —
   * the authoritative base pops instead. There is no path on which a wrong
   * number is shown, and none on which one number is shown twice.
   */
  const cardPopsRef = useRef<{ round: number; count: number } | null>(null);
  const cardPopKeyRef = useRef<string | null>(null);
  const settlementAwards = useMemo((): Record<string, AwardEvent> => {
    const round = m.lastResolved?.roundNumber ?? null;
    if (round === null) return {};
    const out: Record<string, AwardEvent> = {};
    for (const [playerId, fb] of Object.entries(revealFeedback)) {
      const popped = cardPopsRef.current;
      out[playerId] = {
        id: `award:${playerId}:${round}`,
        basePoints: fb.basePoints,
        // The SERVER's bonus figure, already zero for everything that did not
        // earn one. No timing comparison is made anywhere in this client.
        speedBonusPoints: fb.speed?.points ?? 0,
        baseAlreadyShown: playerId === viewerUserId
          && popped !== null && popped.round === round
          && popped.count === fb.basePoints,
      };
    }
    return out;
  }, [revealFeedback, m.lastResolved, viewerUserId]);

  // AI1 Phase 2 — the two duelist mascots' reactions to the settled round.
  // Same settlement, same reveal gate as the verdicts above: the attacker's
  // mascot lunges and the damaged mascot recoils on the beat the round
  // resolves. Nothing here is timed or simulated.
  // RP1 Step 4 — a points match reacts to ITS OWN SCORE, never to the
  // opponent's. `projectMascotReactions` reads the settlement's damage fields,
  // which in a points match are the award travelling through the engine's
  // damage channel — so scoring two points made the opponent's mascot recoil
  // as though it had been hurt. Step 3 silenced that; this replaces it with a
  // cheer the mascot already knew how to perform.
  const pointsMatch = m.publicRound !== null && isPointsMatch(m.publicRound);
  /**
   * RD1 — THE DUEL'S STANDING, projected once for every surface that shows it.
   *
   * Persistent facts (who leads, by how much, how far through) come from the
   * live snapshot's settled totals and frozen scoring block, so they render
   * straight away after a reconnect. The lead-change and speed-bonus EVENTS
   * come from `lastResolved` behind the same `revealHold` gate the verdicts,
   * awards and mascots use — and resume and backfill never open that gate, so
   * a rehydrated settlement can never replay one. Null on an hp match.
   */
  const duelState = useMemo(() => projectDuelState({
    publicRound: m.publicRound, viewerUserId,
    settlement: m.lastResolved, revealing: m.revealHold,
  }), [m.publicRound, viewerUserId, m.lastResolved, m.revealHold]);
  /**
   * RD2 — has THIS client watched the match cross into its final module?
   *
   * Render-time reconciliation with an identity-preserving fold, the same
   * shape `observeRoundKinds` uses below. The first snapshot only seeds the
   * watch, so a refresh or reconnect into module 10 records no entry and the
   * lock-in reaction cannot play for a player who did not see the crossing.
   */
  const [finalWatch, setFinalWatch] = useState<FinalModuleWatch>(EMPTY_FINAL_MODULE_WATCH);
  const nextFinalWatch = observeFinalModuleEntry(finalWatch,
    m.publicRound?.scoring?.model === "points"
      ? {
        moduleNumber: m.publicRound.scoring.moduleNumber,
        matchLength: m.publicRound.scoring.matchLength,
        matchOver: m.publicRound.matchOver,
      }
      : null);
  if (nextFinalWatch !== finalWatch) setFinalWatch(nextFinalWatch);
  // RD2 — a points match's mascots react to their OWN competitive state
  // (lead taken, speed bonus, points scored, final module), never to the other
  // side's; see `duelMascot.ts`. An hp match keeps its damage reactions.
  const opponentPlayerId = m.publicRound?.players
    .find((p) => p.playerId !== viewerUserId)?.playerId ?? null;
  const mascotReactions = useMemo(
    () => (pointsMatch
      ? projectDuelMascotReactions({
        settlement: m.lastResolved, revealing: m.revealHold,
        viewerId: viewerUserId, opponentId: opponentPlayerId,
        finalEntry: nextFinalWatch.entry,
      })
      : projectMascotReactions(m.lastResolved, m.revealHold)),
    [pointsMatch, m.lastResolved, m.revealHold, viewerUserId, opponentPlayerId,
      nextFinalWatch.entry]);
  /**
   * RG — WHAT THE SERVER HAS SAID EACH ROUND'S SEGMENT IS.
   *
   * Accumulated across the match rather than read from one field, because both
   * sources are momentary: the live snapshot speaks only for the round in
   * play, and `lastSegmentSettlement` only for the most recent block. Neither
   * survives the next round — so without this, a Meta Reflex block would lose
   * its mark on the timeline the instant the match moved past it, which is
   * exactly the opposite of preserving it as the node travels into history.
   *
   * Render-time reconciliation with an identity-preserving fold, the same
   * shape the transcript's disclosure reset above uses: `observeRoundKinds`
   * returns the SAME object when the snapshot said nothing new, so the common
   * poll stores nothing and re-renders nothing.
   *
   * Every entry is something the server stated. Nothing is inferred from an
   * ordinal, a category, or the product's pacing schedule.
   */
  const [observedKinds, setObservedKinds] =
    useState<ObservedRoundKinds>(EMPTY_OBSERVED_ROUND_KINDS);
  // The segment's OWN ordinal, not the live round's: a phased block legiti-
  // mately describes a round the engine has not opened yet.
  const segmentRoundNumber = m.publicRound
    ? m.publicRound.segment.segmentNumber
      ?? m.publicRound.activeRound?.roundNumber ?? null
    : null;
  const nextObservedKinds = observeRoundKinds(observedKinds, {
    matchId,
    segment: m.publicRound?.segment ?? null,
    segmentRoundNumber,
    // The transcript's own module version decides what the block WAS — an
    // `item_cost_duel` segment below v4 is not a Meta Reflex block — so this
    // is the same rule the renderer registry dispatches on, not a looser one.
    settledReveal: m.lastSegmentSettlement?.reveal ?? null,
    settledRoundNumber: m.lastSegmentRoundNumber,
    // RG2 — the live question's own topic, for the round it names. Momentary
    // in exactly the way the segment is: it describes the round in play and
    // nothing else, so it is folded into the same record rather than read
    // fresh at render. A round the client never saw live keeps no topic and
    // draws the neutral token, which is the truthful rendering of "this client
    // was not here".
    questionTopic: m.publicRound?.question?.topic ?? null,
    questionRoundNumber: segmentRoundNumber,
  });
  if (nextObservedKinds !== observedKinds) setObservedKinds(nextObservedKinds);

  /**
   * RG — the BOTTOM region's progression strip.
   *
   * Derived entirely outside JSX (see `roundTimeline.ts`), from state the
   * arena already holds: the sticky round number, the authoritative settled
   * count, the observed segment record above, and the SAME bounded settlement
   * ledger the two duelist columns read. Nothing new is fetched and nothing is
   * recomputed.
   */
  const timeline = useMemo(() => (m.publicRound ? projectRoundTimeline({
    roundNumber: m.roundNumber,
    completedRounds: m.publicRound.completedRounds,
    segmentRoundNumber,
    matchOver: m.publicRound.matchOver,
    observedKinds: nextObservedKinds.byRound,
    observedTopics: nextObservedKinds.topics,
    settlements: m.damageLog,
    // The arena maps the viewer to p1 everywhere (see `idMappingFromRound`),
    // which is the same slot the top result beat reads.
    viewerSlot: "p1",
  }) : null),
  [m.publicRound, m.roundNumber, m.damageLog, segmentRoundNumber, nextObservedKinds]);
  // The active segment's module renderer. A v2 payload or a legacy round has
  // no discriminator and resolves to quiz.v1 — the module those rounds were
  // created under — so behaviour is unchanged. null = unknown module.
  const renderer = useMemo(
    () => (surfaceRound ? rendererForSegment(surfaceRound.segment) : null),
    [surfaceRound]);
  const question = useMemo(
    () => (surfaceRound && renderer ? renderer.projectQuestion(surfaceRound) : null),
    [surfaceRound, renderer]);
  const abilities = useMemo(
    () => (m.privatePlayer ? projectAbilities(m.privatePlayer, m.selectedAbilityId) : []),
    [m.privatePlayer, m.selectedAbilityId]);
  const timer = m.publicRound ? projectTimer(m.publicRound, m.skewMs, Date.now()) : null;
  // QUIZ1 Phase 11 — the post-settlement answer-tablet reveal. The whole
  // disclosure gate lives in `projectSurfaceReveal`; this only supplies the
  // round the surface is actually showing, which is deliberately NOT the live
  // round during the reveal beat.
  const surfaceRoundNumber = surfaceRound?.activeRound?.roundNumber ?? null;
  // RG3 adds the viewer's own settled side, so the reveal carries the VERDICT
  // and the round's frozen evidence alongside the correct tablet. The gate is
  // unchanged — all three ride the same three conditions inside the projector.
  const reveal = useMemo(
    () => projectSurfaceReveal(m.lastResolved, surfaceRoundNumber, question,
      m.lastResolved?.players.p1 ?? null),
    [m.lastResolved, surfaceRoundNumber, question]);
  // A module that owns its own ability window and submission renders those
  // itself; the shell must not also show the quiz confirm strip or ability
  // tray. This is a capability the module declares — not a mode branch here.
  const moduleOwnsSubmission = renderer?.ownsSubmission === true;
  const segmentActions = useMemo(() => ({
    submitChallenge: m.submitSegmentChallenge,
    busy: m.submitting,
    error: m.actionError,
  }), [m.submitSegmentChallenge, m.submitting, m.actionError]);
  void tick;

  // ── Ranked-only failure states ─────────────────────────────────────────
  //
  // Neither is an arena. They are what the ROUTE shows when there is no match
  // to render, and both describe a transport problem in Ranked's own words, so
  // they stay here — rendered in the same canonical shell the arena uses.
  if (m.phase === "fatal") {
    return (
      <ArenaShell size="wide" header={chrome}>
        <section data-testid="ranked-fatal" className="rounded-lg border border-destructive bg-card p-4">
          <h3 className="font-semibold text-destructive">Match ended</h3>
          <p className="text-sm">{m.error}</p>
        </section>
      </ArenaShell>
    );
  }
  if (m.contractError) {
    // The failure mode this replaces: a payload this client could not read was
    // swallowed as a transient error and retried forever, so the first Meta
    // Reflex block simply froze with nothing on screen and nothing in the log.
    // The match itself is intact server-side — only this client is out of date
    // — so the state says so, offers a retry, and shows the reader's own field
    // complaint. The message names a contract path, never a payload value.
    return (
      <ArenaShell size="wide" header={chrome}>
        <section data-testid="ranked-contract-error"
          className="ranked-panel space-y-2 border border-destructive/60 p-4">
          <h3 className="font-semibold text-destructive">This match needs a newer client</h3>
          <p className="text-sm text-muted-foreground">
            Your browser could not read the latest match data. Your match is safe —
            reload the page to pick it up where it left off.
          </p>
          <p className="font-mono text-xs text-muted-foreground" data-testid="ranked-contract-detail">
            {m.contractError}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={m.retry} data-testid="ranked-contract-retry"
              className="rounded border border-border px-3 py-1.5 text-sm font-semibold">
              Try again
            </button>
            <button type="button" onClick={() => window.location.reload()}
              className="rounded border border-border px-3 py-1.5 text-sm font-semibold">
              Reload
            </button>
          </div>
        </section>
      </ArenaShell>
    );
  }

  // Nothing to draw yet. The arena owns the placeholder so the shell, the skin
  // and the geometry are the same ones the match will land in.
  if (!m.publicRound || !combatants) {
    // The arena has no snapshot yet. WHY it has none is the whole difference:
    // a fresh entry is one request away from its first round, and a recovery
    // is rebuilding a match this client had lost. Same panel, same geometry,
    // honest sentence.
    return (
      <CanonicalArena view={null} chrome={chrome}
        recovering={entry === "fresh"
          ? { eyebrow: "Ranked Duel", message: "Entering the arena…" }
          : { eyebrow: "Ranked Duel", message: "Recovering match…" }} />
    );
  }

  /**
   * R1 — the ONE signal that decides whether legacy ability/progression UI may
   * render, read off THIS match's own frozen projection.
   *
   * Deliberately not derived from role, class, XP, the feature flag, or
   * whether a Level 2 choice happens to be pending: all five are wrong for an
   * in-flight or historical match. A pre-R1 match reports `true` forever and
   * keeps every control it has always had — including for a player who
   * reconnects into one that is waiting on a Level 2 choice. A backend that
   * does not send the field at all also reads `true` (see the contract's
   * compatibility-safe parse), so shipping this client ahead of the backend
   * hides nothing.
   */
  const progressionEnabled = m.publicRound.progressionEnabled;
  /**
   * RB2 — is the opponent server-controlled?
   *
   * Read off the match's own frozen projection, the same field the live
   * header has always used for its "· vs Bot" note. It is the ONE bot signal
   * this component consults, and everything downstream of it is a LABEL: the
   * match host, the arena, the question renderers, the scoring, the
   * settlement and this terminal frame are the same code either way.
   */
  const isBotMatch = m.publicRound.playtest?.isBotMatch === true;
  /** What the other duelist is called. See `opponentLabelFor`. */
  const otherLabel = opponentLabelFor(m.publicRound);

  if (m.phase === "match_over") {
    const reason = m.result?.terminalReason ?? "combat";
    const won = m.result?.winnerUserId === viewerUserId;
    const draw = m.result?.outcome === "draw";
    /**
     * RP1 — THE FINAL SCORELINE, which is the result row's and not the live
     * projection's.
     *
     * `result.scoring.final_scores` is the engine's committed total at the
     * instant the match completed, seeded with every participant, so it covers
     * a match that ended before a module settled (a forfeit) where the live
     * snapshot's own number may never have moved. It is applied to the SAME
     * `score` field the rails read, so the terminal frame's two columns show
     * points for exactly the matches the arena did — no second code path, and
     * no change to `MatchOverFrame` itself.
     *
     * The WINNER is still `m.result.outcome` / `winnerUserId` below. Nothing
     * here compares the two numbers.
     */
    const finalScores = m.result?.scoring?.finalScores ?? null;
    const withFinalScore = (c: typeof combatants.player) => (
      finalScores && finalScores[c.playerId] !== undefined
        ? { ...c, score: finalScores[c.playerId] } : c);
    const result: "victory" | "defeat" | "draw" =
      draw ? "draw" : won ? "victory" : "defeat";
    /**
     * THE SHARED RESULT MODEL, built from authorities this controller already
     * holds. See `buildRankedResults` — nothing is decided there either.
     */
    const results = buildRankedResults({
      player: withFinalScore(combatants.player),
      opponent: withFinalScore(combatants.opponent),
      result,
      finalScores,
      modulesPlayed: m.result?.scoring?.modulesPlayed ?? null,
      subheading: reason === "forfeit"
        ? (won ? `${otherLabel} forfeited.` : "You forfeited.")
        : reason === "no_contest" ? "No contest — both players left." : null,
      isBotMatch,
      ratingDelta,
      ratingAfter,
      progressionEnabled,
      review: matchReview,
      roundHistory: roundHistory.player,
      discoveries: discoveries.view,
      opponentLabel: otherLabel,
    });
    /**
     * RB2/RB3 — playing again is the PRIMARY action and leaving is the quiet
     * one, with REVIEW between them. A session preset still owns what comes
     * after its own result; the exit stays where it was so a player who wants
     * out is never trapped.
     *
     * They live on the model rather than on the frame's own action row,
     * because `ResultActions` is what states the product's three-weight
     * ordering and every mode now gets the same one.
     */
    results.actions = {
      primary: onSessionComplete
        ? { label: "Continue", onClick: onSessionComplete }
        : {
          label: "Play Again",
          onClick: () => { window.location.assign(AGAIN_HREF); },
        },
      // Into the Record's History pane, which is where this match's full
      // question-by-question timeline — answers included — already lives.
      secondary: {
        label: "Review Match",
        onClick: () => { window.location.assign("/quiz#history"); },
      },
      tertiary: {
        label: "Back to Leaguecraft",
        onClick: () => { window.location.assign(LOBBY_HREF); },
      },
    };
    // PT1.3's reveal keeps its position under the progression it follows: it
    // is the mode's own reward content, so it rides the model's REVIEW slot.
    results.review = discoveryRevealHasContent(discoveries.view)
      ? (<DiscoveryReveal view={discoveries.view}
          onReview={() => { window.location.assign("/quiz#review"); }} />)
      : undefined;

    const terminal: ArenaTerminalView = {
      result,
      player: withFinalScore(combatants.player),
      opponent: withFinalScore(combatants.opponent),
      /**
       * RP1 Step 4 — a scored match ends on a SCORELINE, and says so directly
       * under the result word.
       */
      scoreline: finalScores ? (
        <RankedScoreline
          you={finalScores[combatants.player.playerId] ?? 0}
          opponent={finalScores[combatants.opponent.playerId] ?? null}
          result={result}
          modulesPlayed={m.result?.scoring?.modulesPlayed ?? null}
          ratingDelta={ratingDelta} />
      ) : undefined,
      /**
       * The two duelist COLUMNS, replaced by one row.
       *
       * The scoreline directly above already prints both numbers, so the strip
       * carries identity only — see `ResultContestants`.
       */
      identity: results.contestants ? (
        <ResultContestants you={results.contestants.you}
          opponent={results.contestants.opponent ?? null}
          showScores={finalScores === null} />
      ) : undefined,
      /** RB2 — the one thing the end screen says differently about a bot. */
      eyebrow: isBotMatch ? "Match Complete · Unrated" : undefined,
      subheading: results.subheading ?? undefined,
      progressionEnabled,
      /**
       * Performance, progression, Mogzy's report, the ten modules, the
       * discovery reveal and the three actions — the shared body every mode
       * renders, in the frame's existing summary slot.
       */
      summary: <GameResultsBody model={results} />,
      /**
       * NO SETTLEMENT PANEL.
       *
       * This used to mount `RevealPanel`, which prints "Damage dealt",
       * "Mitigation" and "HP 170 → 150" — the vocabulary of the hp match
       * Ranked has not been since RP1. On a points match those fields are the
       * engine's internal transport for the award, so the panel was restating
       * the module's points under the wrong name, for ONE round, on a screen
       * that said nothing about the other nine. The module timeline above says
       * the true thing about all ten.
       */
      reveal: null,
    };
    return <CanonicalArena view={null} terminal={terminal} chrome={chrome} />;
  }

  const opponentLabel = opponentPresenceLabel(m.presence);
  // "vs Bot" or "vs Opponent" — `opponentLabelFor` is the one place that
  // decides which, and it is deliberately the only distinction available:
  // Ranked's live projection redacts participant identity by design, so there
  // is no display name to prefer here and none is invented.
  const opponentVersusLabel = m.publicRound
    ? `vs ${opponentLabelFor(m.publicRound)}` : null;
  // R3: the answer grid is open only while the round is unanswered. One click
  // submits, so there is no `reviewing` phase and no `canChangeAnswer` state.
  // The reveal beat withholds interactivity from the NEXT round while the last
  // one is being introduced. Presentation only: the server already opened the
  // next round and its clock is already running (the timer above keeps ticking
  // truthfully) — this just refuses to accept a click for ~1.5s so damage, XP
  // and any level-up are readable instead of flashing past.
  // ANSWERING BEGINS AT THE SERVER'S BOUNDARY, not when the round arrives.
  // A round is created in the future while the client is still playing the
  // previous result and this module's title; until `started_at` the question
  // may be on screen and preparing, but it is not answerable — and the
  // backend agrees, because `DuelRound.submit_answer` refuses a receipt
  // earlier than the round's own start. Closing input here is what stops the
  // client offering something the server would reject.
  const answerablePending = m.publicRound?.activeRound
    ? msUntilAnswerable(m.publicRound.activeRound.startedAt, m.skewMs, Date.now()) > 0
    : false;
  const inputOpen = m.phase === "active" && !m.revealHold && !answerablePending;
  const subPhase: SubmissionPhase = m.phase === "locked" ? "locked" : "selecting";
  const permissions = projectPermissions(subPhase, inputOpen, m.submitting);
  // The ability tray is gated INDEPENDENTLY of the answer: it stays live for as
  // long as the server says the viewer's selection window is open, which
  // includes the whole wait for the opponent.
  const abilityPermissions = projectAbilityPermissions(
    m.privatePlayer, m.roundLive, m.abilityBusy);
  // Visibility is a CONTENT question ("does this player have anything to arm?"),
  // deliberately NOT an availability question. Gating the tray's existence on
  // `canSelectAbility` unmounted it every time the window closed — between
  // rounds, and for the whole of a level-2 choice — which removed ~140px from
  // the middle of the HUD and slid the status panel up under the cursor. The
  // tray now stays mounted and renders its own disabled state (AbilityTray
  // already surfaces `disabledReasons.ability` for exactly this).
  // R1: a no-progression match has no ability layer for the normal player, so
  // the tray, its hotkeys, its charge indicators and its "Clear ability"
  // control are all absent. The tray was ALREADY conditional (see
  // `abilityTrayIsUseful`), so its absence reclaims the row rather than
  // reserving an empty one — no blank track is left behind.
  const showAbilityTray = progressionEnabled && !moduleOwnsSubmission
    && m.privatePlayer !== null
    && abilityTrayIsUseful(abilities, m.selectedAbilityId);

  // Stable round header. `activeRound` briefly reports null between rounds; the
  // sticky `roundNumber` keeps the last shown round so the header never blanks
  // to "Round —". During that gap (input phases only) we show an intentional
  // "Preparing next round…" transition instead of a malformed header/empty timer.
  const roundLabel = m.roundNumber !== null ? `Round ${m.roundNumber}` : "Preparing match…";
  // Null on every hp match; "Module 6 / 10" on a v2 points match.
  const moduleLabel = moduleProgressLabel(m.publicRound);
  // A phased segment in its ability window legitimately has no engine round
  // and therefore no shared timer — that is the phase, not a transition gap.
  const inTransition = !timer && m.phase !== "progression" && !m.segmentState;

  // The Level 2 overlay is gated on the SAME signal. `phase === "progression"`
  // is already structurally unreachable on an R1 match (a match frozen with a
  // single level threshold can never put a player in
  // `progression_pending_players`), so this is defence in depth — but it is
  // the check that keeps the two answers from ever disagreeing.
  const isProgression = m.phase === "progression" && progressionEnabled;

  /**
   * POINT1 — the per-card result of a block in flight. Hoisted out of the view
   * object because RM1 Pass 2B reads it twice: the arena's result slot, and the
   * viewer's per-card payout below.
   */
  const cardBeat = projectCardBeat(surfaceRound?.segmentState ?? null,
    surfaceRound?.activeRound?.roundNumber ?? null);

  /**
   * RM1 Pass 2B — ONE card of a Meta Reflex block, for the viewer's column.
   *
   * A correct card only: a `+0` pop for a wrong card is noise in a surface
   * whose whole job is to make a payout feel like one. Server-decided — the
   * outcome comes from `ownCardReveals`, never from comparing the viewer's
   * choice here.
   */
  const cardAward: AwardEvent | null =
    cardBeat && cardBeat.outcome === "correct" && cardBeat.roundNumber !== null
      ? {
        id: `card:${cardBeat.roundNumber}:${cardBeat.challengeIndex}`,
        basePoints: 1, speedBonusPoints: 0,
      }
      : null;
  // Recorded at render, deliberately: the pop layer plays an id exactly once,
  // so counting the DISTINCT ids handed to it counts what it actually showed.
  // This is the number the settlement's suppression is reconciled against.
  if (cardAward && cardPopKeyRef.current !== cardAward.id) {
    cardPopKeyRef.current = cardAward.id;
    const round = cardBeat!.roundNumber!;
    const seen = cardPopsRef.current;
    cardPopsRef.current = seen && seen.round === round
      ? { round, count: seen.count + 1 } : { round, count: 1 };
  }

  /** Ranked fills both flanks with a duelist. */
  const rail = (which: "player" | "opponent"): ArenaRail => {
    const c = combatants[which];
    return {
      kind: "combatant",
      combatant: c,
      // RM1 Pass 2 — Ranked's duelists are BANNERS. Named here, by the mode
      // that owns the flank, so no other caller of the arena is affected.
      presentation: "banner",
      damage: roundHistory[which],
      outcome: revealOutcomes[c.playerId] ?? null,
      damageDealt: revealDamage[c.playerId] ?? null,
      // RP1 — present only while a points module's settlement is being
      // revealed, which is what makes the verdict row say "CORRECT +2" (and,
      // when the server awarded one, a speed chip) instead of a damage figure,
      // without either side learning a mode flag.
      feedback: revealFeedback[c.playerId] ?? null,
      reaction: mascotReactions[c.playerId] ?? null,
      // RM1 Pass 2B — the transient payout. The viewer's column takes a live
      // card's `+1` while a block is running and the module's award otherwise;
      // the opponent's only ever takes the module's award, because per-card
      // correctness is not published for the other seat.
      award: (which === "player" ? cardAward : null)
        ?? settlementAwards[c.playerId] ?? null,
      // RD1 — the same standing seen from each side. The opponent's column is
      // the viewer's standing reversed, not a second comparison.
      standing: duelState
        ? (which === "player" ? duelState.standing : OPPOSITE_STANDING[duelState.standing])
        : null,
      leadPulseId: duelState?.leadChange
        && duelState.leadChange.newLeader === (which === "player" ? "viewer" : "opponent")
        ? duelState.leadChange.eventId : null,
    };
  };

  const view: ArenaViewModel = {
    // FB1-4. See dailyArenaView for the same two words: the arena does the
    // publishing, the mode only says who it is.
    report: { mode: "Ranked", category: "Ranked" },
    header: {
      // LINE 1 of the left block. The opponent moved to its own line below, so
      // the mode's name is no longer carrying a second fact on its back.
      eyebrow: "Ranked Duel",
      // RP1 — a points match names its MODULE and its length, both read off
      // the backend's scoring block; an hp match keeps "Round N", because it
      // has no length and a "/ 10" here would be this client inventing one.
      title: moduleLabel ?? roundLabel,
      // RD1 — `FINAL 3` / `FINAL` beside the module count, from the frozen
      // length and the module in play. Nothing about rounds or phases: the
      // format publishes none.
      titleSuffix: duelProgressSuffix(duelState),
      // RD1 — the viewer's standing on the clock's secondary line.
      standing: duelState
        ? { label: duelStandingLabel(duelState), standing: duelState.standing } : null,
      // RD1 — what this settlement just did to the duel, for the result face.
      // Only on a SETTLEMENT's face: a Meta Reflex card's face outranks it and
      // is about one card, not about the standing.
      duelEvent: cardBeat ? null : duelEventOf(duelState),
      transitionNote: inTransition ? "Preparing next round…" : null,
      // RETIRED. The placeholder-bank notice was a build-state label from when
      // the Ranked bank was still standing in for itself. It is a fact about the
      // CONTENT PIPELINE, not about the match, it is the only thing in the
      // strip a player can do nothing with, and it held a third line open on
      // the header's right side for the whole match. Ranked publishes none;
      // the slot itself stays, because the Daily Challenge uses it for its
      // theme (`dailyArenaView`) and that IS match news.
      playtestNote: null,
      // LINE 2 — WHO THIS IS AGAINST, and the abnormal presence states when
      // there are any. `opponentPresenceLabel` is null for a healthy match now,
      // so the identity line shows; when the opponent drops it takes over,
      // because at that point the state IS the more important fact about them.
      presenceNote: opponentLabel ?? opponentVersusLabel,
      timer,
      timerLabel: "Shared round timer",
      /**
       * RM1 Pass 2B — THE VIEWER'S RESULT, in the header's focal display.
       *
       * Built from `revealFeedback`, the REVEAL-GATED award, so it exists for
       * exactly the settlement beat and cannot decay into a stale result over
       * a live question the way the header's old plate did.
       *
       * The figure is the BASE. The speed bonus is not folded into it, for the
       * same reason the history bubble does not fold it in: `+3` erases which
       * half the player earned, and the bonus gets its own transient mark in
       * the column that won it.
       */
      //
      // POINT1's precedence, unchanged and now applied to the display instead
      // of to a plate: a CARD of a block in flight outranks the previous
      // module's settlement, because that settlement is the stale thing on
      // screen for the whole of a live block.
      centralResult: centralCardResult(cardBeat)
        ?? centralResult(revealFeedback[viewerUserId] ?? null,
          revealOutcomes[viewerUserId] ?? null),
      // The round NOW IN PLAY, by its existing name. There is no way to name
      // the next one first — the backend publishes nothing about a question it
      // has not generated, which is the same fact that makes every future node
      // on the round rail neutral — so this face runs as the new round arrives.
      moduleTitle: liveModuleTitle(m.publicRound),
      moduleEventId: m.roundNumber,
    },
    roundBeat: m.lastResolved ? {
      settlement: m.lastResolved,
      viewerSlot: "p1",
      // The viewer's own award, by id, from the SAME settlement the plate is
      // describing. Null on an hp match, which leaves the plate's damage
      // consequence line exactly as it has always been.
      feedback: headerFeedback[viewerUserId] ?? null,
      // POINT1 — the mode's own answer, so the plate's damage clauses are
      // unreachable on a points match rather than merely unlikely.
      pointsMatch,
    } : null,
    segmentBeat: m.lastSegmentSettlement ? {
      settlement: m.lastSegmentSettlement,
      roundNumber: m.lastSegmentRoundNumber,
      feedback: m.lastResolved?.roundNumber === m.lastSegmentRoundNumber
        ? headerFeedback[viewerUserId] ?? null : null,
      pointsMatch,
      viewerUserId,
      opponentUserId: m.opponentUserId,
    } : null,
    /**
     * POINT1 — the per-card result of a block in flight, in the arena's ONE
     * result slot. Read off the live segment state, so it is the same card the
     * viewport is holding, and it is why the module draws no plate of its own.
     */
    cardBeat,
    left: rail("player"),
    right: rail("opponent"),
    surface: {
      renderer,
      publicRound: surfaceRound!,
      segmentState: surfaceRound!.segmentState,
      selection: m.selectedOptionId,
      permissions,
      actions: segmentActions,
      skewMs: m.skewMs,
      reveal,
      // R3: selecting an option IS answering. The index comes from the
      // projected question so the arena never guesses it from the option id.
      onSelect: (sel) => {
        const option = question?.options.find((o) => o.id === sel);
        if (option) m.answer(option.id, option.index);
      },
      ownsSubmission: moduleOwnsSubmission,
      inputOpen,
      hasContent: question !== null || moduleOwnsSubmission,
    },
    progression: isProgression ? {
      options: (m.privatePlayer?.ownAbilities.level2Options ?? []).map((id) => ({
        id, name: abilityName(id), description: abilityDescription(id),
      })),
      pendingOptionId: pendingLevel2,
      busy: m.submitting,
      onSelectOption: (id) => {
        if (m.submitting || pendingLevel2 !== null) return;  // double-click safe
        setPendingLevel2(id);
        m.chooseLevelTwo(id);
      },
    } : null,
    abilityHud: showAbilityTray ? {
      abilities,
      selectedAbilityId: m.selectedAbilityId,
      permissions: abilityPermissions,
      onSelectAbility: m.selectAbility,
      noAbilityLabel: "Clear ability",
    } : null,
    status: {
      // THE IDLE LINE IS GONE. It was an instruction for a board that already
      // says it: the tablets are the only
      // interactive thing on screen and clicking one submits it. It occupied
      // the status row for the whole of every round a player was thinking —
      // which is most of the match — to tell them what they were already
      // doing. What is left is the row's real job: the transient states.
      // Empty string, not a removed row: the box stays reserved, so a
      // submission or an error still appears without moving the arena.
      text: m.actionError ? m.actionError
        : m.submitting ? "Submitting…"
          : m.phase === "locked" ? "Answer locked — waiting for opponent…"
            : "",
      isError: m.actionError !== null,
    },
    // RG1 — the arena's quiet control. Ranked's is Forfeit Match: the ONE
    // intent signal Ranked has, since a route change, a closed tab, a reload
    // and a dead network are indistinguishable at the server. The arena places
    // it (end of the status row, or its own slim row on a module-owned round)
    // and never learns what it means.
    hudAction: (
      <ForfeitControl onForfeit={m.forfeit} disabled={m.submitting}
        className="shrink-0 pt-0.5" />
    ),
    timeline,
    revealHold: m.revealHold,
    progressionEnabled,
  };

  return <CanonicalArena view={view} chrome={chrome} />;
}
