// ---------------------------------------------------------------------------
// OF4-FIX2 — the Order Forge lock's inline reveal, on the presented segment.
//
// Against a bot (or an opponent who locked first) the viewer's lock POST
// settles the segment and opens the next round in one transaction, so no
// polled snapshot ever carries the viewer's own `own_challenge_reveals`. The
// server returns that reveal INLINE in the lock response instead, and the
// arena, frozen on the pre-lock snapshot through the reveal hold, needs it on
// that snapshot for the Order Forge cards to reveal at all.
//
// This only places the server's reveal where the server would have put it.
// It reads nothing from it, grades nothing, and never edits a snapshot: it
// returns the same state object, or a shallow copy with one more entry.
// ---------------------------------------------------------------------------

import { ORDER_FORGE_MODULE_ID, type MasteryChallengeReveal, type SegmentStateView }
  from "@/lib/ranked-public/contracts";

export interface OrderForgeLockRevealRef {
  matchId: string;
  segmentNumber: number;
  reveal: MasteryChallengeReveal;
}

/**
 * `state` with the lock's inline reveal attached, when and only when:
 *   * it is an Order Forge segment state,
 *   * the reveal belongs to THIS match and THIS segment number, and
 *   * the snapshot does not already carry its own reveal for that challenge
 *     (a polled snapshot that has one is the authority; it is never doubled).
 * Otherwise `state` itself, so identity is preserved for memoised consumers.
 */
export function withInlineOrderForgeReveal(
  state: SegmentStateView | null,
  lock: OrderForgeLockRevealRef | null,
  matchId: string | null,
): SegmentStateView | null {
  if (!state || !lock || !matchId) return state;
  if (state.moduleId !== ORDER_FORGE_MODULE_ID || !lock.reveal.orderForge) return state;
  if (lock.matchId !== matchId || lock.segmentNumber !== state.segmentNumber) return state;
  const index = lock.reveal.challengeIndex;
  if (state.ownChallengeReveals.some((r) => r.challengeIndex === index)) return state;
  return { ...state, ownChallengeReveals: [...state.ownChallengeReveals, lock.reveal] };
}
