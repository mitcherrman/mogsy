import { useEffect, useMemo, useRef } from "react";

import type { SfxEvent } from "@/lib/audio/sfx-registry";
import { useSfx } from "@/lib/audio/useSfx";
import type { ResolvedRoundView } from "@/lib/ranked-core/viewTypes";
import type {
  MatchResultView, PublicRoundView, SegmentSettlementView, SettledCardReveal,
} from "@/lib/ranked-public/contracts";
import {
  MASTERY_SLICE_MODULE_ID, META_REFLEX_MIXED_VERSION, ORDER_FORGE_MODULE_ID,
} from "@/lib/ranked-public/contracts";

export interface RankedSfxEmission {
  event: SfxEvent;
  eventId: string;
}

export interface RankedSfxObservation {
  matchId: string;
  moduleKey: string | null;
  roundKey: string | null;
  ownSubmitted: boolean;
  opponentSubmitted: boolean;
  metaKey: string | null;
  metaOpponentCompleted: number;
  metaOwnFinished: boolean;
  metaOwnReveals: readonly Pick<SettledCardReveal, "challengeIndex" | "outcome">[];
  /**
   * SFX2 — a Mastery Journey segment's identity and the viewer's OWN published
   * per-child reveals (`ownChallengeReveals`, reached children only). Each new
   * reveal is one light verdict; the module award stays with the aggregate
   * settlement. `null` / empty for every non-Journey segment.
   */
  journeyKey?: string | null;
  journeyOwnReveals?: readonly { challengeIndex: number; isCorrect: boolean }[];
  /**
   * MISC W2D (F12) — the SERVER's per-card expiry flags for the viewer
   * (`own_timed_out_challenges`) on a card-clocked, non-Meta-Reflex segment,
   * keyed like `journeyKey`. A flag that turns true while watched is the one
   * authoritative "TIME'S UP" for that child; Meta Reflex states its expiries
   * in `metaOwnReveals[].outcome` instead. `null` when the wire has none.
   */
  cardTimeouts?: { key: string; flags: readonly boolean[] } | null;
  /**
   * MISC W2D (F12) — the settled SEGMENT says the viewer timed out
   * (`segment_reveal.players[viewer].segment_result: "timeout"`), for a
   * one-lock module that publishes no per-card flags (Order Forge,
   * Reconstruct, Scrub, Assembly). Read for the settled round only.
   */
  segmentSettledTimedOut?: boolean;
  /**
   * OF3-F2 - an Order Forge segment's number and the viewer's own verdict from
   * `ownChallengeReveals[0].orderForge.isCorrect` (null until that reveal is
   * published). `null` segment for every non-Order-Forge round.
   */
  orderForgeSegment?: number | null;
  orderForgeOwnVerdict?: boolean | null;
  /**
   * OF3-F2 - the SETTLED Order Forge segment's verdict for the viewer, read
   * from the authoritative `segment_reveal`. The fallback for a segment that
   * settled on the lock, so the in-viewport own reveal was never observed. A
   * segment's round number IS its segment number, so this carries the same id.
   */
  orderForgeSettled?: { segmentNumber: number; isCorrect: boolean } | null;
  settlementRound: number | null;
  settlementLive: boolean;
  ownSettlementOutcome: "correct" | "incorrect" | "timed_out" | null;
  ownAward: { pointsAwarded: number; speedBonusPoints: number } | null;
  terminal: boolean;
  terminalResult: "victory" | "defeat" | "draw" | null;
  /**
   * RFX1 2B3 — HAS THE PRESENTATION REACHED THE MOMENT THE OUTCOME IS
   * ANNOUNCED?
   *
   * The result sting used to fire on `terminal` alone, which is the raw
   * completion snapshot — and 2B3 made that strictly too early: the snapshot
   * is what CLAIMS the outro, and the beat itself does not present until the
   * result row and the final settlement have been fetched (`outro.ready`),
   * after the final round's own reveal hold. So the sound landed during the
   * last answer's verdict, under a still-live arena.
   *
   * The caller passes the presentation's own answer: the outro beat is on
   * screen, or the end screen has mounted. Both are included deliberately —
   * a match that ends with no outro at all (a completion this mount never saw
   * live) must not be able to STRAND the sound, and a match that has one
   * sounds at the beat rather than before it.
   */
  outcomeMoment: boolean;
}

export interface RankedSfxWatch extends RankedSfxObservation {
  sawLive: boolean;
  terminalSounded: boolean;
  /** OF3-F2 - the Order Forge segment whose verdict this watch has announced. */
  orderForgeVerdictSegment?: number | null;
}

/**
 * Observe one already-public Ranked projection. The first projection is only
 * a baseline: it may be hydration, recovery, or a completed-match reload, so
 * replaying anything from it would turn history into a fresh event.
 */
export function observeRankedSfx(
  previous: RankedSfxWatch | null,
  current: RankedSfxObservation,
): { watch: RankedSfxWatch; emissions: RankedSfxEmission[] } {
  if (!previous || previous.matchId !== current.matchId) {
    return {
      watch: {
        ...current,
        sawLive: !current.terminal,
        terminalSounded: false,
      },
      emissions: [],
    };
  }

  const emissions: RankedSfxEmission[] = [];
  const id = (suffix: string) => `ranked:${current.matchId}:${suffix}`;

  if (current.moduleKey && current.moduleKey !== previous.moduleKey && !current.terminal) {
    emissions.push({
      event: "ranked.module.start",
      eventId: id(`module:${current.moduleKey}:start`),
    });
  }

  const sameRound = current.roundKey !== null && current.roundKey === previous.roundKey;
  const opponentJustActed = current.opponentSubmitted
    && (!sameRound || !previous.opponentSubmitted);
  if (opponentJustActed && !current.ownSubmitted && !current.terminal && current.roundKey) {
    emissions.push({
      event: "ranked.opponent.submitted",
      eventId: id(`round:${current.roundKey}:opponent-submitted`),
    });
  }

  const metaOpponentAdvanced = current.metaKey !== null && (
    current.metaKey === previous.metaKey
      ? current.metaOpponentCompleted > previous.metaOpponentCompleted
      : current.metaOpponentCompleted > 0);
  if (current.metaKey && metaOpponentAdvanced
      && !current.metaOwnFinished && !current.terminal) {
    // Polling can legitimately skip multiple progress counts. One quiet cue
    // announces the newest public state instead of bursting missed history.
    emissions.push({
      event: "ranked.opponent.submitted",
      eventId: id(`segment:${current.metaKey}:opponent-progress:${current.metaOpponentCompleted}`),
    });
  }

  if (current.metaKey && !current.terminal) {
    const seen = new Set((current.metaKey === previous.metaKey
      ? previous.metaOwnReveals : []).map((reveal) => reveal.challengeIndex));
    // MISC W2D (F12) — the server's "timeout" for a card is its TIME'S UP.
    // ("unanswered" is a card the block ended before; it stays silent.)
    const newest = [...current.metaOwnReveals].reverse().find((reveal) =>
      !seen.has(reveal.challengeIndex)
      && (reveal.outcome === "correct" || reveal.outcome === "incorrect"
        || reveal.outcome === "timeout"));
    if (newest) {
      emissions.push({
        event: newest.outcome === "correct" ? "ranked.answer.correct"
          : newest.outcome === "timeout" ? "quiz.answer.timeout" : "ranked.answer.incorrect",
        eventId: id(`segment:${current.metaKey}:card:${newest.challengeIndex}:result`),
      });
    }
  }

  // MISC W2D (F12) — a child the SERVER flagged as expired is a timeout, not
  // a wrong answer. Same event id as its reveal's verdict, so whichever of the
  // flag and the reveal is observed first is the one cue for that child.
  const cardTimeouts = current.cardTimeouts ?? null;
  const timedOutChild = (key: string | null, index: number) =>
    cardTimeouts !== null && cardTimeouts.key === key && cardTimeouts.flags[index] === true;
  const journeyKey = current.journeyKey ?? null;
  let journeyAnnounced: number | null = null;
  if (journeyKey && !current.terminal) {
    const seen = new Set((journeyKey === previous.journeyKey
      ? previous.journeyOwnReveals ?? [] : []).map((reveal) => reveal.challengeIndex));
    // One verdict per update: a skipped poll announces only the newest child.
    const newest = [...(current.journeyOwnReveals ?? [])].reverse()
      .find((reveal) => !seen.has(reveal.challengeIndex));
    if (newest) {
      emissions.push({
        event: timedOutChild(journeyKey, newest.challengeIndex) ? "quiz.answer.timeout"
          : newest.isCorrect ? "ranked.answer.correct" : "ranked.answer.incorrect",
        eventId: id(`segment:${journeyKey}:child:${newest.challengeIndex}:result`),
      });
      journeyAnnounced = newest.challengeIndex;
    }
  }
  // An expiry with no reveal (a pooled Standard budget running out mid-card
  // publishes the flag and finishes the module). Only a flag that turned true
  // while watched — a baseline that already carries it is history.
  // Deliberately NOT gated on `terminal`: the snapshot that settles a
  // match-ending timeout is the moment it happened.
  if (cardTimeouts) {
    const before = previous.cardTimeouts?.key === cardTimeouts.key
      ? previous.cardTimeouts.flags : null;
    const revealed = new Set((cardTimeouts.key === journeyKey
      ? current.journeyOwnReveals ?? [] : []).map((reveal) => reveal.challengeIndex));
    let flipped: number | null = null;
    cardTimeouts.flags.forEach((flag, index) => {
      if (flag && before !== null && before[index] !== true && !revealed.has(index)) flipped = index;
    });
    if (flipped !== null && flipped !== journeyAnnounced) {
      emissions.push({
        event: "quiz.answer.timeout",
        eventId: id(`segment:${cardTimeouts.key}:child:${flipped}:result`),
      });
    }
  }

  // OF3-F2 - ONE verdict per Order Forge segment, under ONE event id. The
  // verdict is a single card (`card:0`), and both sources below name it with
  // the same id, so whichever path arrives second is dropped by the engine's
  // global eventId dedupe rather than by a second dedupe here.
  const orderForgeId = (segment: number) => id(`segment:${segment}:card:0:verdict`);
  const verdictEvent = (isCorrect: boolean): SfxEvent =>
    isCorrect ? "ranked.answer.correct" : "ranked.answer.incorrect";
  let orderForgeVerdictSegment = previous.orderForgeVerdictSegment ?? null;
  const orderForgeSegment = current.orderForgeSegment ?? null;
  if (orderForgeSegment !== null && !current.terminal
      && typeof current.orderForgeOwnVerdict === "boolean") {
    // Only a NEW reveal sounds: a baseline that already carries it is history.
    const seen = orderForgeSegment === (previous.orderForgeSegment ?? null)
      && typeof previous.orderForgeOwnVerdict === "boolean";
    if (!seen) {
      emissions.push({
        event: verdictEvent(current.orderForgeOwnVerdict),
        eventId: orderForgeId(orderForgeSegment),
      });
      orderForgeVerdictSegment = orderForgeSegment;
    }
  }
  let orderForgeFallbackSounded = false;
  if (current.orderForgeSettled
      && current.settlementRound !== null
      && current.settlementRound !== previous.settlementRound
      && current.settlementLive
      && !current.terminal) {
    const settled = current.orderForgeSettled;
    // Same id as the own-reveal path; emitted even when that path already
    // sounded so the engine's dedupe is the single guarantee of "once".
    emissions.push({
      event: verdictEvent(settled.isCorrect),
      eventId: orderForgeId(settled.segmentNumber),
    });
    orderForgeFallbackSounded = orderForgeVerdictSegment !== settled.segmentNumber;
    orderForgeVerdictSegment = settled.segmentNumber;
  }

  if (current.settlementRound !== null
      && current.settlementRound !== previous.settlementRound
      && current.settlementLive
      && !current.terminal) {
    const settlementId = id(`round:${current.settlementRound}`);
    if (current.ownSettlementOutcome === "correct") {
      emissions.push({ event: "ranked.answer.correct", eventId: `${settlementId}:result` });
    } else if (current.ownSettlementOutcome === "incorrect") {
      emissions.push({ event: "ranked.answer.incorrect", eventId: `${settlementId}:result` });
    } else if (current.ownSettlementOutcome === "timed_out" || current.segmentSettledTimedOut) {
      // MISC W2D (F12) — the settlement's own `timed_out` for the viewer is
      // the ONLY round-level TIME'S UP. A local zero never reaches here, and
      // an answer the server accepted settles as correct/incorrect instead.
      emissions.push({ event: "quiz.answer.timeout", eventId: `${settlementId}:result` });
    }
    // SFX2 — ONE CUE PER SETTLEMENT. A per-question verdict owns its own
    // settlement: the award (+180 ms) and speed accent (+400 ms) used to ride
    // behind it and turned every correct Standard answer into a five-note
    // rising phrase heavier than a module completion. The award phrase now
    // sounds only for an aggregate multi-card settlement (Journey / Meta
    // Reflex module completion), which carries no per-question verdict here.
    const verdictSounded = current.ownSettlementOutcome === "correct"
      || current.ownSettlementOutcome === "incorrect"
      || current.ownSettlementOutcome === "timed_out"
      || current.segmentSettledTimedOut === true;
    // OF3-F2 - a fallback verdict IS this settlement's cue; the award must not
    // stack behind it (see above). When the verdict came earlier from the own
    // reveal, the settlement keeps its ordinary award.
    if (!verdictSounded && !orderForgeFallbackSounded && current.ownAward && current.ownAward.pointsAwarded > 0) {
      emissions.push({ event: "ranked.points.awarded", eventId: `${settlementId}:award` });
      if (current.ownAward.speedBonusPoints > 0) {
        emissions.push({ event: "ranked.speed.bonus", eventId: `${settlementId}:speed-bonus` });
      }
    }
  }

  let terminalSounded = previous.terminalSounded;
  if (current.terminal && current.terminalResult && previous.sawLive && !terminalSounded
      && current.outcomeMoment) {
    emissions.push({
      event: `ranked.match.${current.terminalResult}` as SfxEvent,
      eventId: id(`match:${current.terminalResult}`),
    });
    terminalSounded = true;
  }

  return {
    watch: {
      ...current,
      sawLive: previous.sawLive || !current.terminal,
      terminalSounded,
      orderForgeVerdictSegment,
    },
    emissions,
  };
}

function moduleIdentity(round: PublicRoundView | null): string | null {
  if (!round || round.matchOver || !round.activeRound) return null;
  if (round.segmentState && round.segmentState.phase !== "challenges") return null;
  const number = round.segment.segmentNumber ?? round.activeRound.roundNumber;
  return `${round.segment.moduleId}.${round.segment.moduleVersion}#${number}`;
}

function roundIdentity(round: PublicRoundView): string | null {
  const number = round.segment.segmentNumber ?? round.activeRound?.roundNumber ?? null;
  return number === null ? null : `${round.segment.moduleId}.${round.segment.moduleVersion}#${number}`;
}

function terminalResult(
  result: MatchResultView | null,
  viewerUserId: string,
): RankedSfxObservation["terminalResult"] {
  if (!result) return null;
  if (result.outcome === "draw") return "draw";
  return result.winnerUserId === viewerUserId ? "victory" : "defeat";
}

/**
 * MISC W2D (F12) — did the settled segment time the viewer out? Only for a
 * module whose timeouts are not already stated card by card: a Journey
 * (`mastery_slice`) states each child's expiry in `own_timed_out_challenges`,
 * Meta Reflex in each card's own outcome, and announcing the segment as well
 * would sound TIME'S UP twice for one expiry.
 */
export function segmentSettledTimedOut(
  settlement: SegmentSettlementView | null,
  settlementRound: number | null,
  segmentRound: number | null,
  viewerUserId: string,
): boolean {
  if (!settlement || settlementRound === null || segmentRound !== settlementRound) return false;
  const moduleId = settlement.reveal.moduleId;
  if (moduleId === MASTERY_SLICE_MODULE_ID || moduleId === "item_cost_duel") return false;
  return settlement.reveal.players[viewerUserId]?.segmentResult === "timeout";
}

/**
 * The viewer's verdict from a settled Order Forge `segment_reveal`, or null
 * when the settlement is another module's, is not for the settled round, or
 * states neither a correct nor an incorrect sequence (a timeout is silent).
 */
function orderForgeSettledVerdict(
  settlement: SegmentSettlementView | null,
  settlementRound: number | null,
  segmentRound: number | null,
  viewerUserId: string,
): RankedSfxObservation["orderForgeSettled"] {
  if (!settlement || settlement.reveal.moduleId !== ORDER_FORGE_MODULE_ID
      || settlementRound === null || segmentRound !== settlementRound) return null;
  const own = settlement.reveal.players[viewerUserId];
  if (!own) return null;
  if (own.correct > 0) return { segmentNumber: settlementRound, isCorrect: true };
  if (own.incorrect > 0) return { segmentNumber: settlementRound, isCorrect: false };
  return null;
}

export interface UseRankedMatchSfxInput {
  matchId: string;
  viewerUserId: string;
  publicRound: PublicRoundView | null;
  surfaceRound: PublicRoundView | null;
  lastResolved: ResolvedRoundView | null;
  lastSegmentRoundNumber: number | null;
  /** OF3-F2 - the settled segment transcript, for the Order Forge verdict fallback. */
  lastSegmentSettlement?: SegmentSettlementView | null;
  revealHold: boolean;
  result: MatchResultView | null;
  /** RFX1 2B3 — see `RankedSfxObservation.outcomeMoment`. */
  outcomeMoment: boolean;
}

/**
 * The observation of one projection, as a pure function (MISC W2D: exported
 * so real captures can drive `observeRankedSfx` in tests exactly as the hook
 * does). Null with no public round.
 */
export function rankedSfxObservation(input: UseRankedMatchSfxInput): RankedSfxObservation | null {
  const round = input.publicRound;
  if (!round) return null;
  const own = round.players.find((player) => player.playerId === input.viewerUserId);
  const opponent = round.players.find((player) => player.playerId !== input.viewerUserId);
  const segment = round.segmentState;
  const isMeta = segment?.moduleId === "item_cost_duel"
    && segment.moduleVersion >= META_REFLEX_MIXED_VERSION;
  const metaKey = isMeta
    ? `${segment.moduleId}.${segment.moduleVersion}#${segment.segmentNumber}` : null;
  const settlement = input.lastResolved;
  const ownSettlement = settlement?.players.p1.playerId === input.viewerUserId
    ? settlement.players.p1
    : settlement?.players.p2.playerId === input.viewerUserId
      ? settlement.players.p2 : null;
  const award = settlement?.modulePoints?.[input.viewerUserId] ?? null;
  return {
    matchId: input.matchId,
    moduleKey: moduleIdentity(input.surfaceRound),
    roundKey: roundIdentity(round),
    ownSubmitted: own?.hasSubmitted ?? false,
    opponentSubmitted: opponent?.hasSubmitted ?? false,
    metaKey,
    metaOpponentCompleted: isMeta ? segment.opponentChallengesCompleted : 0,
    metaOwnFinished: isMeta ? segment.ownFinished : false,
    metaOwnReveals: isMeta ? segment.ownCardReveals : [],
    journeyKey: segment?.journey
      ? `${segment.moduleId}.${segment.moduleVersion}#${segment.segmentNumber}` : null,
    journeyOwnReveals: segment?.journey ? segment.ownChallengeReveals : [],
    cardTimeouts: segment && !isMeta && segment.ownTimedOutChallenges
      ? { key: `${segment.moduleId}.${segment.moduleVersion}#${segment.segmentNumber}`,
          flags: segment.ownTimedOutChallenges }
      : null,
    orderForgeSegment: segment?.moduleId === ORDER_FORGE_MODULE_ID
      ? segment.segmentNumber : null,
    orderForgeOwnVerdict: segment?.moduleId === ORDER_FORGE_MODULE_ID
      ? segment.ownChallengeReveals[0]?.orderForge?.isCorrect ?? null : null,
    segmentSettledTimedOut: segmentSettledTimedOut(
      input.lastSegmentSettlement ?? null, settlement?.roundNumber ?? null,
      input.lastSegmentRoundNumber, input.viewerUserId),
    orderForgeSettled: orderForgeSettledVerdict(
      input.lastSegmentSettlement ?? null, settlement?.roundNumber ?? null,
      input.lastSegmentRoundNumber, input.viewerUserId),
    settlementRound: settlement?.roundNumber ?? null,
    settlementLive: input.revealHold,
    // Multi-card modules publish their own per-card verdict stream. Their
    // aggregate settlement is score authority, not another answer verdict.
    ownSettlementOutcome: input.lastSegmentRoundNumber === settlement?.roundNumber
      ? null : ownSettlement?.outcome ?? null,
    ownAward: award ? {
      pointsAwarded: award.pointsAwarded,
      speedBonusPoints: award.speedBonusPoints,
    } : null,
    terminal: round.matchOver,
    terminalResult: terminalResult(input.result, input.viewerUserId),
    outcomeMoment: input.outcomeMoment,
  };
}

export function useRankedMatchSfx(input: UseRankedMatchSfxInput): void {
  const { play } = useSfx();
  const watchRef = useRef<RankedSfxWatch | null>(null);
  const observation = useMemo(() => rankedSfxObservation(input), [input]);

  useEffect(() => {
    if (!observation) return;
    const next = observeRankedSfx(watchRef.current, observation);
    watchRef.current = next.watch;
    for (const emission of next.emissions) {
      play(emission.event, { eventId: emission.eventId });
    }
  }, [observation, play]);
}
