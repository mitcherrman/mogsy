/**
 * RFX1 Phase 2A — THE RANKED PRESENTATION FLOW.
 *
 * AUTHORITATIVE GAME STATE IS NOT THE PRESENTED ROUND
 * ──────────────────────────────────────────────────
 * The backend resolves round N and opens round N+1 in ONE transaction, with
 * N+1's `started_at` set in the future by the server-owned presentation window
 * (`ranked_public/pacing.py`: result hold + module title). So the very snapshot
 * that tells this client "N resolved" already carries N+1. The controller
 * (`useRankedMatch`) keeps that snapshot as the authority; the arena keeps
 * PRESENTING round N until its reveal beat ends (`renderedRound` in
 * `QuizRankedMatch`). Everything below is a pure projection over those two
 * references plus the authoritative settlement — nothing is stored here and
 * no match state is cloned.
 *
 * PHASES (derived, never stored)
 *
 *   answering     the presented round is live and input is open
 *   waiting       the SERVER has the viewer's submission (`phase === "locked"`)
 *                 and nothing has settled yet
 *   revealing     a LIVE-captured settlement for the presented round is on
 *                 screen (`revealHold`, which only live capture ever sets)
 *   module-intro  the presented round is the new one, but its authoritative
 *                 `started_at` has not arrived — the server-owned lead-in
 *   match-outro   the match is authoritatively OVER, the final round's reveal
 *                 has played, and the end screen has not mounted yet
 *
 * RESULT CUES
 *
 * One authoritative settlement yields up to two cues. They are TWO
 * PRESENTATION BEATS over ONE fact: the opponent's verdict comes from the same
 * `/rounds/N/resolved` payload as the viewer's, and arrives in the same
 * instant. The stagger between them is a CSS animation delay on the overlay,
 * never a second state transition and never a second timer.
 *
 * Block modules (Meta Reflex, Mastery slice) publish no per-card opponent
 * correctness, only the settled block's aggregate, so the opponent cue for a
 * block is an aggregate (`correct / of`) — never "OPPONENT CORRECT".
 *
 * IDENTITY
 *
 * Every cue carries a deterministic id derived from the match, the round and
 * (for a card) the challenge index. The overlay is keyed on it, so a poll or a
 * re-render cannot restart it. Replays on refresh/reconnect are impossible for
 * rounds because `revealHold` is set ONLY by a live capture (resume restores
 * `lastResolved` without it), and for cards because the caller suppresses the
 * card that was already revealing when the mount first saw the match.
 */
import type { ArenaCardBeat } from "@/lib/ranked-core/cardBeat";
import type { ResolvedRoundView } from "@/lib/ranked-core/viewTypes";
import type { PublicRoundView, SegmentSettlementView } from "@/lib/ranked-public/contracts";
import { MODULE_TITLE_END_MARGIN_MS } from "../pacing";

export type RankedPresentationPhase =
  | "answering" | "waiting" | "revealing" | "module-intro"
  /**
   * RFX1 2B3 — the deliberate match-complete beat, after the final round's
   * own reveal and before the end screen. Authoritative completion drives it;
   * nothing here infers it.
   */
  | "match-outro";

export type RoundVerdict = "correct" | "incorrect" | "timed_out";

export type ViewerResultCue =
  | { kind: "round"; id: string; verdict: RoundVerdict }
  | { kind: "card"; id: string; verdict: RoundVerdict; cardNumber: number }
  | { kind: "block"; id: string; correct: number; of: number };

export type OpponentResultCue =
  | { kind: "round"; id: string; verdict: RoundVerdict }
  | { kind: "block"; id: string; correct: number; of: number };

export interface RankedResultFeedback {
  viewer: ViewerResultCue | null;
  opponent: OpponentResultCue | null;
}

export const resultEventId = (matchId: string, round: number, who: "user" | "opp") =>
  `${matchId}:r${round}:${who}`;

export const cardEventId = (matchId: string, round: number, challengeIndex: number) =>
  `${matchId}:r${round}:c${challengeIndex}:user`;

export function projectPresentationPhase(args: {
  revealing: boolean;
  locked: boolean;
  /** Authoritative `started_at` of the PRESENTED round, or null. */
  presentedStartedAt: string | null;
  skewMs: number;
  nowMs: number;
  /**
   * RFX1 2B1 — THE PRESENTATION CUTOFF. `module-intro` ends this many ms
   * BEFORE `started_at`, never at it: the arena must already be the live
   * question by the moment the player may act, with a margin for the intro
   * face's own exit. Defaults to `MODULE_TITLE_END_MARGIN_MS`.
   */
  cutoffMarginMs?: number;
  /**
   * RFX1 2B3 — the controller's `matchOutroId !== null`. Ranked after
   * `revealing` on purpose: the final round's own verdict beat plays FIRST,
   * and the match-complete beat follows it.
   */
  matchOutro?: boolean;
}): RankedPresentationPhase {
  if (args.revealing) return "revealing";
  if (args.matchOutro) return "match-outro";
  if (args.presentedStartedAt) {
    const start = Date.parse(args.presentedStartedAt);
    const margin = args.cutoffMarginMs ?? MODULE_TITLE_END_MARGIN_MS;
    if (!Number.isNaN(start) && start - args.nowMs - args.skewMs > margin) return "module-intro";
  }
  return args.locked ? "waiting" : "answering";
}

const cardVerdict = (outcome: ArenaCardBeat["outcome"]): RoundVerdict =>
  outcome === "correct" ? "correct"
    : outcome === "timeout" || outcome === "unanswered" ? "timed_out" : "incorrect";

/**
 * The cues to present now, or `{viewer: null, opponent: null}`.
 *
 * `revealing` must be the controller's `revealHold` (live capture only), and
 * `presentedRoundNumber` the round the SURFACE shows — a settlement for any
 * other round is not what the card is looking at, so it cues nothing.
 * `liveCard` is the per-card beat when, and only when, the caller observed it
 * begin during this mount.
 */
export function projectResultFeedback(args: {
  matchId: string;
  viewerId: string;
  opponentId: string | null;
  revealing: boolean;
  presentedRoundNumber: number | null;
  settlement: ResolvedRoundView | null;
  segment: { settlement: SegmentSettlementView; roundNumber: number | null } | null;
  liveCard: ArenaCardBeat | null;
}): RankedResultFeedback {
  const { matchId, settlement, segment } = args;
  const round = settlement?.roundNumber ?? null;
  if (args.revealing && settlement && round !== null && round === args.presentedRoundNumber) {
    const block = segment && segment.roundNumber === round ? segment.settlement.reveal : null;
    if (block) {
      const mine = block.players[args.viewerId] ?? null;
      const theirs = args.opponentId ? block.players[args.opponentId] ?? null : null;
      const of = block.challengeCount;
      return {
        viewer: mine ? { kind: "block", id: resultEventId(matchId, round, "user"), correct: mine.correct, of } : null,
        opponent: theirs ? { kind: "block", id: resultEventId(matchId, round, "opp"), correct: theirs.correct, of } : null,
      };
    }
    return {
      viewer: { kind: "round", id: resultEventId(matchId, round, "user"), verdict: settlement.players.p1.outcome },
      opponent: { kind: "round", id: resultEventId(matchId, round, "opp"), verdict: settlement.players.p2.outcome },
    };
  }
  const card = args.liveCard;
  if (card && card.roundNumber !== null) {
    return {
      viewer: {
        kind: "card", id: cardEventId(matchId, card.roundNumber, card.challengeIndex),
        verdict: cardVerdict(card.outcome), cardNumber: card.cardNumber,
      },
      // The backend publishes the opponent's PROGRESS during a block, never
      // their correctness. Nothing to say until the block settles.
      opponent: null,
    };
  }
  return { viewer: null, opponent: null };
}

/**
 * RFX1 Phase 2B SEAM — the round the server has already opened but the arena
 * is not presenting yet, or null.
 *
 * Non-null for exactly the reveal beat of a resolved round: that is the whole
 * window in which next-round media can be prepared before it is revealed
 * (Phase 1 §E, M2 — today it is requested only at the swap). Phase 2A exposes
 * it and does nothing with it; the preloader attaches here.
 */
export function upcomingRound(
  live: PublicRoundView | null, presented: PublicRoundView | null,
): PublicRoundView | null {
  if (!live || !presented || live === presented) return null;
  const a = live.activeRound?.roundNumber ?? null;
  const b = presented.activeRound?.roundNumber ?? null;
  return a !== null && a !== b ? live : null;
}
