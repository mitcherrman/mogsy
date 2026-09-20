/**
 * RFX1 Phase 2B3 — THE MATCH-COMPLETE PRESENTATION PAYLOAD.
 *
 * The outro's VISUAL DESIGN is deliberately not decided yet. What is decided
 * here is the contract: exactly which authoritative facts the eventual outro
 * may draw on, projected once, in one shape, from state the arena already
 * holds.
 *
 * It is deliberately MINIMAL. Every field below is something the terminal
 * frame already reads today from the same authority — there is no second
 * results object, nothing is recomputed, and no winner is derived by
 * comparing two scores (`outcome` / `winnerUserId` remain the only winner
 * rule, exactly as `MatchOverFrame` has it).
 *
 * What is NOT here, and why:
 *  * the timeline, the transcript and the discovery list — the end SCREEN's
 *    material, fetched on `match_over` and irrelevant to a 1.2 s beat;
 *  * the score ANIMATION's state — the rails own their own points animation
 *    and keep running underneath the beat; duplicating it here would be a
 *    second authority over the same numbers;
 *  * a rating TIER — the client holds no thresholds, so a rating after is a
 *    fact and the band it falls in is not (RP1's rule, unchanged).
 */
import type { MatchResultView, PublicRoundView } from "@/lib/ranked-public/contracts";

export interface MatchOutroView {
  /** `<matchId>:outro` — the deterministic identity the beat is keyed on. */
  id: string;
  matchId: string;
  /** From `outcome`/`winnerUserId` only. Never from comparing the scores. */
  result: "win" | "loss" | "draw";
  /** Why the match ended, as the result row states it. */
  terminalReason: string | null;
  /** The engine's committed totals, or null on a match that scored none. */
  viewerScore: number | null;
  opponentScore: number | null;
  viewerLabel: string;
  opponentLabel: string;
  /** The FROZEN seat roles, the same ones the rails and the intro card draw. */
  viewerRole: string | null;
  opponentRole: string | null;
  /** The last module the match played, for the beat that closes it. */
  finalRoundNumber: number | null;
  /** The standing change, when the history row already carries one. */
  ratingDelta: number | null;
}

export function projectMatchOutro(args: {
  id: string;
  matchId: string;
  viewerUserId: string;
  viewerLabel: string;
  opponentLabel: string;
  pub: PublicRoundView | null;
  result: MatchResultView | null;
  ratingDelta: number | null;
}): MatchOutroView {
  const { pub, result, viewerUserId } = args;
  const opponentId = pub?.players.find((p) => p.playerId !== viewerUserId)?.playerId ?? null;
  const scores = result?.scoring?.finalScores ?? null;
  const seat = (id: string | null) =>
    (id ? pub?.players.find((p) => p.playerId === id) ?? null : null);
  return {
    id: args.id,
    matchId: args.matchId,
    result: result === null ? "draw"
      : result.outcome === "draw" ? "draw"
        : result.winnerUserId === viewerUserId ? "win" : "loss",
    terminalReason: result?.terminalReason ?? null,
    viewerScore: scores ? scores[viewerUserId] ?? null : seat(viewerUserId)?.score ?? null,
    opponentScore: scores && opponentId ? scores[opponentId] ?? null
      : seat(opponentId)?.score ?? null,
    viewerLabel: args.viewerLabel,
    opponentLabel: args.opponentLabel,
    viewerRole: seat(viewerUserId)?.role ?? null,
    opponentRole: seat(opponentId)?.role ?? null,
    finalRoundNumber: result?.finalRoundNumber ?? null,
    ratingDelta: args.ratingDelta,
  };
}
