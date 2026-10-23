// ---------------------------------------------------------------------------
// QRT1 — a Journey answer's reveal, from the submit response.
//
// The server starts a child's reveal the instant it ACCEPTS the answer: the
// next child opens `reveal_window_ms` later, on the server's clock, whether or
// not this client has drawn anything. The Mastery renderer used to learn of the
// reveal only from the poll the accepted submit triggers, so every millisecond
// of that round trip (and of any poll already in flight ahead of it) came out
// of the reveal the player saw — on a live stack, most of an ordinary child's
// window.
//
// The submit response already carries the graded reveal (`challenge_reveal`)
// and, from QRT1, the reveal phase the server derived at the same instant
// (`challenge_reveal_timing`). This places both on the presented snapshot, in
// the fields the snapshot itself would carry a moment later, until a snapshot
// that already carries them arrives. It decides nothing and lengthens nothing:
// correctness is the server's reveal, read by the same reader as a polled one,
// and the hold still ends at the server's `reveal_until`.
// ---------------------------------------------------------------------------

import type { JourneyAckRevealTiming } from "@/lib/ranked-public/client";
import {
  MASTERY_SLICE_MODULE_ID,
  type MasteryChallengeReveal,
  type SegmentStateView,
} from "@/lib/ranked-public/contracts";

export interface JourneyAckRevealRef {
  matchId: string;
  segmentNumber: number;
  reveal: MasteryChallengeReveal;
  timing: JourneyAckRevealTiming;
}

/**
 * `state` with the accepted answer's reveal phase applied, when and only when:
 *   * it is a Journey `mastery_slice` segment state, of THIS match and THIS
 *     segment number;
 *   * the reveal and the timing name the same child; and
 *   * the snapshot has NOT caught up — it carries no reveal for that child and
 *     still has the viewer at (or before) it. A snapshot that already moved on
 *     or already carries the reveal is the authority, and is returned as is.
 *
 * Otherwise `state` itself, so identity is preserved for memoised consumers.
 */
export function withJourneyAckReveal(
  state: SegmentStateView | null,
  ack: JourneyAckRevealRef | null,
  matchId: string | null,
): SegmentStateView | null {
  if (!state || !ack || !matchId) return state;
  if (state.moduleId !== MASTERY_SLICE_MODULE_ID || !state.journey) return state;
  if (ack.matchId !== matchId || ack.segmentNumber !== state.segmentNumber) return state;
  const index = ack.timing.revealingCardIndex;
  if (ack.reveal.challengeIndex !== index) return state;
  if (state.ownNextChallengeIndex > index
    || state.ownChallengeReveals.some((r) => r.challengeIndex === index)) return state;
  const t = ack.timing;
  return {
    ...state,
    ownChallengeReveals: [...state.ownChallengeReveals, ack.reveal],
    ownNextChallengeIndex: t.nextChallengeIndex,
    ownChallengesCompleted: t.challengesCompleted,
    ownFinished: t.finished,
    ownCardIndex: t.finished ? null : t.nextChallengeIndex,
    ownCardStartedAt: t.nextCardStartedAt,
    ownCardDeadline: t.nextCardDeadline,
    ownRevealingCardIndex: index,
    ownRevealUntil: t.revealUntil,
    // The revealing child's own window, exactly as a per-child snapshot names
    // it; the hold reads `ownRevealUntil` for when it ends.
    ownRevealWindowMs: t.revealWindowMs,
    // The pooled clock is paused through every reveal (server-derived); the
    // remainder stays the snapshot's until the next one restates it.
    ...(state.activeTimeRunning != null ? { activeTimeRunning: false } : {}),
  };
}
