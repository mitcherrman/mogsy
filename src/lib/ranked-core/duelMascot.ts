// ---------------------------------------------------------------------------
// RD2 — THE MASCOTS' DUEL REACTIONS.
//
// Which motion each duelist's mascot plays, and the event id that makes it play
// exactly once. A points match has no attacker and no victim, so the rule from
// RP1 stands and is now the whole design:
//
//   A MASCOT REACTS ONLY TO ITS OWN PLAYER'S COMPETITIVE STATE.
//
// Nothing here can make one player's success look like the other's injury: no
// `hit`, no `attack`, and no reaction is ever derived from the OTHER side's
// award. A duelist who scored nothing, fell behind, or was caught simply does
// not move.
//
// SOURCES — both already authoritative, neither recomputed:
//   * settlement reactions read ONE settlement (`modulePoints`, and RD1's
//     `projectLeadChange` over its before/after totals) and only while that
//     settlement is being revealed. Resume and backfill never open the reveal
//     gate, so a rehydrated settlement cannot replay one.
//   * the final-module reaction reads an entry id from `observeFinalModuleEntry`,
//     which only exists when THIS client watched the module number cross into
//     the last module — never when it reconnects already inside it.
//
// PRECEDENCE, one reaction per mascot per settlement:
//   1. took the lead        → celebrate   `lead:<round>:<player>`
//   2. earned a speed bonus → celebrate   `speed:<round>:<player>`
//   3. scored points        → cheer       `score:<round>:<player>`
//   (no reaction)
// A TIE TRANSITION has no rung of its own. Scores only rise, so a tie is only
// ever reached by the trailing player SCORING — who is already cheering at
// rung 3 — while the player who was caught scored nothing new and, by the rule
// above, does not move. A separate tie motion would either duplicate rung 3 or
// animate the caught player, which is exactly the reaction-to-the-other-side
// this file refuses.
//
// The final-module `focus` plays only OUTSIDE a reveal beat, so it follows the
// previous module's result instead of fighting it, and stops being offered
// once the final module has itself settled.
// ---------------------------------------------------------------------------

import { projectLeadChange } from "./duelState";
import type { MascotReaction, ResolvedRoundView } from "./viewTypes";

/** What this client has watched of the match's module progress. */
export interface FinalModuleWatch {
  /** The last module number observed, or null before the first snapshot. */
  lastModule: number | null;
  /** `final:<module>` once the crossing was WATCHED; null otherwise. */
  entry: { id: string; moduleNumber: number } | null;
}

export const EMPTY_FINAL_MODULE_WATCH: FinalModuleWatch = Object.freeze({
  lastModule: null, entry: null,
}) as FinalModuleWatch;

/**
 * Fold one snapshot's progress into the watch. Identity-preserving: returns
 * the SAME object when nothing changed, so a render-time reconcile stores
 * nothing on an ordinary poll.
 *
 * An entry is recorded only for an OBSERVED transition — a previous module
 * below the last, then the last. The first snapshot a client sees (a fresh
 * mount, a refresh, a reconnect) only seeds `lastModule`, so reconnecting into
 * module 10 produces no entry.
 */
export function observeFinalModuleEntry(
  prev: FinalModuleWatch,
  snapshot: { moduleNumber: number; matchLength: number | null; matchOver: boolean } | null,
): FinalModuleWatch {
  if (!snapshot) return prev;
  const { moduleNumber, matchLength, matchOver } = snapshot;
  if (moduleNumber === prev.lastModule) return prev;
  const crossed = prev.lastModule !== null && matchLength !== null && !matchOver
    && prev.lastModule < matchLength && moduleNumber === matchLength;
  return {
    lastModule: moduleNumber,
    entry: crossed ? { id: `final:${moduleNumber}`, moduleNumber } : prev.entry,
  };
}

export interface DuelMascotInput {
  settlement: ResolvedRoundView | null;
  revealing: boolean;
  viewerId: string;
  opponentId: string | null;
  finalEntry: FinalModuleWatch["entry"];
}

/** Each duelist's reaction, keyed by player id. Empty when nothing is owed. */
export function projectDuelMascotReactions(
  { settlement, revealing, viewerId, opponentId, finalEntry }: DuelMascotInput,
): Record<string, MascotReaction> {
  const out: Record<string, MascotReaction> = {};
  const players = opponentId ? [viewerId, opponentId] : [viewerId];

  if (revealing && settlement?.modulePoints) {
    const change = opponentId ? projectLeadChange(settlement, viewerId, opponentId) : null;
    const round = settlement.roundNumber;
    for (const pid of players) {
      const award = settlement.modulePoints[pid];
      if (!award) continue;
      const tookLead = change !== null && change.newLeader
        === (pid === viewerId ? "viewer" : "opponent");
      if (tookLead) {
        out[pid] = { action: "celebrate", actionId: `lead:${round}:${pid}` };
      } else if (award.speedBonusPoints > 0) {
        out[pid] = { action: "celebrate", actionId: `speed:${round}:${pid}` };
      } else if (award.pointsAwarded > 0) {
        out[pid] = { action: "cheer", actionId: `score:${round}:${pid}` };
      }
    }
    return out;
  }

  // Between beats: the final module's lock-in, while it is still unsettled.
  if (!revealing && finalEntry
      && (settlement === null || settlement.roundNumber < finalEntry.moduleNumber)) {
    for (const pid of players) out[pid] = { action: "focus", actionId: finalEntry.id };
  }
  return out;
}
