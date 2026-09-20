/**
 * RFX1 Phase 2B3 — THE MEDIUM PRESENTATION BEATS, in the coordinator.
 *
 * One hook for "is a special warning playing, and for how long", so the Final
 * Round beat and the Meta Reflex entry beat are the same mechanism rather than
 * two ad hoc timers. It decides nothing about what is drawn.
 *
 * THREE THINGS HAVE TO BE TRUE for a beat to play, and each one closes a
 * different replay hole:
 *
 *  1. the presented round is special (`projectSpecialTransition`);
 *  2. the server's lead-in still has room for the whole visible promise
 *     (`specialTransitionWindowMs`) — which is what makes a reconnect or a
 *     late discovery silently skip it, because their lead is already spent;
 *  3. THIS MOUNT WATCHED THE ROUND ARRIVE. The clock alone is not enough: a
 *     refresh that lands inside the 1.3-1.8 s lead-in would otherwise replay
 *     a warning for a round the client did not transition into. The caller
 *     supplies that observation.
 *
 * Once played for a round, never again for that round — a poll, a rerender or
 * a parent state change cannot restart it, and the beat ends on its own timer
 * rather than on the next snapshot.
 */
import { useEffect, useRef, useState } from "react";

import type { SpecialTransitionKind } from "../pacing";

export interface SpecialTransitionBeat {
  kind: SpecialTransitionKind;
  /** Identity of the round this beat belongs to; the React key. */
  id: string;
  /** Its configured visible duration, for measurement and tests. */
  visibleMs: number;
}

export function useSpecialTransition(args: {
  /** The beat this round is owed, or null. */
  candidate: { kind: SpecialTransitionKind; visibleMs: number } | null;
  /** Identity of the presented round — a new value is a new beat. */
  roundKey: string | null;
  /** Room the server's lead-in leaves, already clamped by pacing. 0 = none. */
  windowMs: number;
  /** Did this mount watch the arena advance into this round? */
  observedLive: boolean;
}): SpecialTransitionBeat | null {
  const { candidate, roundKey, windowMs, observedLive } = args;
  /**
   * Which round has already had its beat. A REF, not state: writing it must
   * not re-run the effect below, whose cleanup would then cancel the timer
   * that ends the beat — the exact trap `useEntrySting` and `CentralStage`
   * both document.
   */
  const playedFor = useRef<string | null>(null);
  const [beat, setBeat] = useState<SpecialTransitionBeat | null>(null);

  /**
   * THE DEPENDENCY LIST IS `[roundKey]` AND NOTHING ELSE, and that is
   * load-bearing rather than an oversight.
   *
   * Everything else this effect reads — the candidate, the window, whether
   * the round was observed live — is either a value that counts down on every
   * render or one that CHANGES AS A RESULT OF STARTING THE BEAT. Listing any
   * of them re-runs the effect the moment the beat begins, and the cleanup
   * then clears the very timeout that ends it: the warning stays on screen
   * for ever. That is exactly the trap `useEntrySting` and `CentralStage`
   * both document, and it is why `playedFor` is a ref.
   */
  useEffect(() => {
    if (roundKey === null || candidate === null) return;
    if (roundKey === playedFor.current) return;
    if (windowMs <= 0 || !observedLive) return;
    playedFor.current = roundKey;
    setBeat({ kind: candidate.kind, id: roundKey, visibleMs: candidate.visibleMs });
    const id = window.setTimeout(() => setBeat(null), windowMs);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey]);

  return beat;
}
