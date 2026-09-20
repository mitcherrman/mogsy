/**
 * RFX1 Phase 2B3 — THE PRESENTATION BEATS' AUDIO SEAM.
 *
 * `useRankedMatchSfx` is driven by the public PROJECTION: it observes two
 * consecutive snapshots and emits what changed between them. The three beats
 * here are not in that stream. The duel intro plays while `publicRound` is
 * still null on the queue path, so that hook's observation is null and it can
 * emit nothing at all; and the two medium warnings are decided by the
 * presentation coordinator (`useSpecialTransition`) from a window, not by a
 * field on any snapshot.
 *
 * So this is a second, deliberately tiny hook over the same `useSfx` policy
 * layer rather than a second sound system. It emits at most one event per
 * beat, keyed on that beat's own DETERMINISTIC id — which is the same id the
 * beat already publishes to the DOM and the same mechanism that stops a poll
 * or a rerender replaying it.
 *
 * THE THREE EVENTS ARE VOICELESS TODAY. `sfx-registry` adds them with no
 * built-in generator and no asset, which the registry's own contract defines
 * as silent-until-an-operator-binds-one. That is the point: the seam exists
 * and is correct now, and authoring the sound later is an Audio Studio action
 * rather than a code change. Nothing here can make a noise this phase did not
 * ship an asset for.
 */
import { useEffect, useRef } from "react";

import type { SfxEvent } from "@/lib/audio/sfx-registry";
import { useSfx } from "@/lib/audio/useSfx";
import type { SpecialTransitionKind } from "@/lib/ranked-core/pacing";

const SPECIAL_EVENT: Record<SpecialTransitionKind, SfxEvent> = {
  "final-round": "ranked.round.final",
  // Deliberately NOT `ranked.meta.action`: that is the per-card action sound
  // at `relativeGain: 0.62`, and reusing it would make entering the mode
  // sound like playing a card in it.
  "meta-reflex-entry": "ranked.mode.shift",
};

export interface RankedPresentationSfxInput {
  matchId: string;
  /** Is the Ranked Duel intro card on screen for this entry? */
  introVisible: boolean;
  /** The medium beat currently playing, or null. */
  specialBeat: { kind: SpecialTransitionKind; id: string } | null;
}

/**
 * One emission per distinct beat identity, for the life of the mount.
 *
 * A `Set` of ids rather than a boolean per beat, because the medium warnings
 * legitimately play more than once in a match (a Meta Reflex block at module
 * 4 and another at module 9) and must sound each time — while the SAME beat,
 * re-rendered by a poll landing inside its window, must not.
 */
export function useRankedPresentationSfx(input: RankedPresentationSfxInput): void {
  const { play } = useSfx();
  const sounded = useRef<Set<string>>(new Set());
  const { matchId, introVisible, specialBeat } = input;

  useEffect(() => {
    if (!introVisible) return;
    const eventId = `ranked:${matchId}:intro`;
    if (sounded.current.has(eventId)) return;
    sounded.current.add(eventId);
    play("ranked.duel.begin", { eventId });
  }, [introVisible, matchId, play]);

  const beatKind = specialBeat?.kind ?? null;
  const beatId = specialBeat?.id ?? null;
  useEffect(() => {
    if (beatKind === null || beatId === null) return;
    const eventId = `ranked:${matchId}:beat:${beatKind}:${beatId}`;
    if (sounded.current.has(eventId)) return;
    sounded.current.add(eventId);
    play(SPECIAL_EVENT[beatKind], { eventId });
  }, [beatKind, beatId, matchId, play]);
}
