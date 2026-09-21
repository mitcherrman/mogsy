/**
 * DCMOD-E — A HOSTED MATCH.
 *
 * Some matches are not the whole experience. A parent flow (the Daily
 * Challenge's stages, and any future multi-match session) runs a canonical
 * match as ONE STEP of something larger, and it owns what surrounds that step:
 * the introduction before it and the closing state after it.
 *
 * This is the neutral seam for that. It names no mode. A host that supplies it
 * gets exactly three differences from an ordinary Ranked match, and nothing in
 * the arena, the renderers, the answer path, the timer or the settlement
 * changes:
 *
 *   1. ENTRY — the duel intro card is not drawn. The host already introduced
 *      the step; a second introduction on top of it would be two front doors.
 *   2. CLOSE — the Victory/Defeat outro beat, its result sting and the full end
 *      screen are not drawn. The final round's own reveal still plays in full,
 *      and then the match is handed back to the host.
 *   3. COPY — the placeholder's eyebrow is the host's, and Ranked's own rules
 *      scroll (Ranked's copy about Ranked's scoring) is not mounted.
 *
 * The handback happens at the SAME presentation instant the outro would have
 * started: after the final reveal, never before it, and on a recovered match
 * that is already over, immediately. Once per match.
 */
import type { RankedPresentationPhase } from "./rankedFlow";

/** What a host is told when its match is over. Authoritative facts only. */
export interface HostedMatchSettlement {
  matchId: string;
  /** The result row's terminal reason, or null if the row was not read. */
  terminalReason: string | null;
  /** The engine's completion reason (e.g. a ruleset ending the stage early). */
  completionReason: string | null;
}

export interface MatchHost {
  /** The placeholder's eyebrow — the host's name for where the player is. */
  eyebrow: string;
  /** What the placeholder says while a finished match waits to be released. */
  settlingMessage: string;
  /** Called once, when the match is over and its final reveal has played. */
  onMatchSettled: (settled: HostedMatchSettlement) => void;
  /**
   * A REPORTING seam, never a control one: the presented phase, on change.
   * A host uses it to know when a question is actually answerable, so any
   * clock it projects stands still through reveals and transitions.
   */
  onPresentationPhase?: (phase: RankedPresentationPhase) => void;
}

/**
 * Is it time to hand a hosted match back? The outro's own trigger, reused: the
 * presentation reached the match-complete beat, or the match was already over
 * when this client first saw it.
 */
export function hostedMatchSettled(args: {
  presentationPhase: RankedPresentationPhase;
  matchOver: boolean;
}): boolean {
  return args.presentationPhase === "match-outro" || args.matchOver;
}
