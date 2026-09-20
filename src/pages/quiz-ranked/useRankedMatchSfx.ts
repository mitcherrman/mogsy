import { useEffect, useMemo, useRef } from "react";

import type { SfxEvent } from "@/lib/audio/sfx-registry";
import { useSfx } from "@/lib/audio/useSfx";
import type { ResolvedRoundView } from "@/lib/ranked-core/viewTypes";
import type {
  MatchResultView, PublicRoundView, SettledCardReveal,
} from "@/lib/ranked-public/contracts";
import { META_REFLEX_MIXED_VERSION } from "@/lib/ranked-public/contracts";

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
    const newest = [...current.metaOwnReveals].reverse().find((reveal) =>
      !seen.has(reveal.challengeIndex)
      && (reveal.outcome === "correct" || reveal.outcome === "incorrect"));
    if (newest) {
      emissions.push({
        event: newest.outcome === "correct"
          ? "ranked.answer.correct" : "ranked.answer.incorrect",
        eventId: id(`segment:${current.metaKey}:card:${newest.challengeIndex}:result`),
      });
    }
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
    }
    if (current.ownAward && current.ownAward.pointsAwarded > 0) {
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

export interface UseRankedMatchSfxInput {
  matchId: string;
  viewerUserId: string;
  publicRound: PublicRoundView | null;
  surfaceRound: PublicRoundView | null;
  lastResolved: ResolvedRoundView | null;
  lastSegmentRoundNumber: number | null;
  revealHold: boolean;
  result: MatchResultView | null;
  /** RFX1 2B3 — see `RankedSfxObservation.outcomeMoment`. */
  outcomeMoment: boolean;
}

export function useRankedMatchSfx(input: UseRankedMatchSfxInput): void {
  const { play } = useSfx();
  const watchRef = useRef<RankedSfxWatch | null>(null);
  const observation = useMemo((): RankedSfxObservation | null => {
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
  }, [input]);

  useEffect(() => {
    if (!observation) return;
    const next = observeRankedSfx(watchRef.current, observation);
    watchRef.current = next.watch;
    for (const emission of next.emissions) {
      play(emission.event, { eventId: emission.eventId });
    }
  }, [observation, play]);
}
