// ---------------------------------------------------------------------------
// The per-card result beat, projected from the segment state the server
// already publishes.
//
// PURE READ. It decides no outcome, holds no timer and counts nothing: the
// phase comes from `ownRevealingCardIndex` (server-derived from the block's
// own frozen reveal window) and the verdict from the matching entry in
// `ownCardReveals`, which is the server's word. A refresh mid-reveal
// reconstructs the identical beat from the identical rows.
// ---------------------------------------------------------------------------

import type { SegmentStateView, SettledCardReveal } from "@/lib/ranked-public/contracts";

/** One settled card, ready for the header's plate. */
export interface ArenaCardBeat {
  outcome: SettledCardReveal["outcome"];
  /** 1-based, for the plate's marker — "C3", the way a round reads "R3". */
  cardNumber: number;
  /** 0-based, the server's own index; the beat's remount key. */
  challengeIndex: number;
  /**
   * The round this card's BLOCK is being played in, or null.
   *
   * Carried so the header can tell a settled block from a settled EARLIER
   * block. `lastSegmentSettlement` persists across rounds, so without this the
   * previous block's scoreline outranked every card of the block now in play
   * and the per-card beat never reached the slot at all.
   */
  roundNumber: number | null;
}

/**
 * The card whose result is being SHOWN, or null.
 *
 * Two states produce one, and they are the two the block holds a card for:
 *
 *  * mid-reveal — `ownRevealingCardIndex` names a card that has settled while
 *    its successor has not opened (the backend refuses a submission to it);
 *  * the block is over — card five has no successor to wait on, so its result
 *    stands until the module's own settlement replaces it in the same slot.
 *
 * Live answering produces NOTHING. The card on screen has no verdict yet, and
 * the previous card's is over; a beat that lingered into the next card's
 * timer would be labelling the wrong card.
 */
export function projectCardBeat(
  state: SegmentStateView | null,
  roundNumber: number | null = null,
): ArenaCardBeat | null {
  if (!state) return null;
  const reveals = state.ownCardReveals;
  if (!reveals.length) return null;
  const settled = state.ownRevealingCardIndex !== null
    ? reveals.find((r) => r.challengeIndex === state.ownRevealingCardIndex) ?? null
    : state.ownFinished
      ? reveals[reveals.length - 1]
      : null;
  if (!settled) return null;
  return {
    outcome: settled.outcome,
    cardNumber: settled.challengeIndex + 1,
    challengeIndex: settled.challengeIndex,
    roundNumber,
  };
}
