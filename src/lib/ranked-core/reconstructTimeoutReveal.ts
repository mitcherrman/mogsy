// ---------------------------------------------------------------------------
// RECONSTRUCT-R3C — the recipe for a player who timed out, after settlement.
//
// A Reconstruct board's reveal arrives as the viewer's own
// `own_challenge_reveals` entry, which the server publishes for a challenge
// the viewer ANSWERED (inline in the lock response, or on a later snapshot).
// A player who never locked has no such entry, so the board used to stay
// empty under a generic TIMED OUT stamp for the whole hold: the one player who
// most needed the recipe never saw it.
//
// The recipe is already theirs to see once the segment has settled: the
// resolved round's `segment_reveal` (the backend refuses to build one for an
// unsettled round) carries the canonical parts, the target's figures and the
// tray, plus each player's own verdict. This places that settlement's recipe
// on the presented segment, exactly where an answered reveal would sit, and
// marks it `timedOut` so the board draws it as the answer, never as picks.
//
// What it reads, and only that:
//   * the server's verdict for THIS viewer (`segment_result: "timeout"` or
//     `unanswered`, with no locked placement), never a local clock;
//   * the recipe fields every participant receives after settlement.
// It never reads the opponent's entry, grades nothing, and returns the same
// state object (identity preserved) whenever any condition does not hold.
// ---------------------------------------------------------------------------

import {
  RECONSTRUCT_MODULE_ID,
  type MasteryChallengeReveal, type SegmentSettlementView, type SegmentStateView,
} from "@/lib/ranked-public/contracts";

/** The only challenge a `reconstruct` v1 segment has. */
const CHALLENGE_INDEX = 0;

export interface SettledRoundRef {
  settlement: SegmentSettlementView | null;
  /** The round the settlement belongs to (`lastSegmentRoundNumber`). */
  roundNumber: number | null;
}

/**
 * The timed-out viewer's reveal, built from a settled Reconstruct round, or
 * null when the viewer did not time out (or the round is not Reconstruct).
 * Exported for tests; the host uses `withSettledTimeoutReveal`.
 */
export function settledTimeoutReveal(
  settlement: SegmentSettlementView | null,
  viewerUserId: string | null,
): MasteryChallengeReveal | null {
  if (!settlement || !viewerUserId) return null;
  const { reveal } = settlement;
  if (reveal.moduleId !== RECONSTRUCT_MODULE_ID || !reveal.reconstruct) return null;
  const own = reveal.players[viewerUserId];
  if (!own) return null;
  const timedOut = own.segmentResult === "timeout" || own.unanswered > 0;
  // A player with a locked build was graded on it: that build's reveal comes
  // from the server's own `own_challenge_reveals`, never from here.
  const locked = reveal.reconstruct.placements[viewerUserId];
  if (!timedOut || (locked !== null && locked !== undefined)) return null;
  const recipe = reveal.reconstruct;
  if (recipe.canonicalParts.length === 0) return null;
  return {
    challengeIndex: CHALLENGE_INDEX,
    isCorrect: false,
    playerAnswer: null, correctAnswer: null, explanation: null, answerOptions: [],
    reconstruct: {
      placement: [],
      isCorrect: false,
      slotCorrect: [],
      settledPlacement: [],
      canonicalParts: recipe.canonicalParts,
      target: recipe.target,
      pieces: recipe.pieces,
      timedOut: true,
    },
  };
}

/**
 * `state` with the settled timeout reveal attached, when and only when:
 *   * it is a Reconstruct segment state,
 *   * the settlement is for THIS segment (same round number),
 *   * the server settled the viewer as timed out with no locked build, and
 *   * the state carries no reveal of its own for the challenge (a served
 *     reveal is the authority; it is never doubled or replaced).
 * Otherwise `state` itself, so memoised consumers keep their identity.
 */
export function withSettledTimeoutReveal(
  state: SegmentStateView | null,
  settled: SettledRoundRef,
  viewerUserId: string | null,
): SegmentStateView | null {
  if (!state || state.moduleId !== RECONSTRUCT_MODULE_ID) return state;
  if (settled.roundNumber === null || settled.roundNumber !== state.segmentNumber) return state;
  if (state.ownChallengeReveals.some((r) => r.challengeIndex === CHALLENGE_INDEX)) return state;
  const reveal = settledTimeoutReveal(settled.settlement, viewerUserId);
  if (!reveal) return state;
  return { ...state, ownChallengeReveals: [...state.ownChallengeReveals, reveal] };
}
