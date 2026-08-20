/**
 * LC1 — per-role tallies derived from real Ranked match rows.
 *
 * WHY THIS IS DERIVED, NOT FETCHED
 * ────────────────────────────────
 * There is no per-role stats contract on the backend today: `/api/ranked/*`
 * exposes an account's progression and its recent match rows, and nothing
 * that scores a role. Rather than invent a per-role record, this counts the
 * rows the account actually has — so every figure it produces is one the
 * player can see in their own history.
 *
 * HONESTY RULES
 * ─────────────
 *  - a role with no rows gets NO entry, so callers say "nothing on record"
 *    rather than rendering a 0W-0L that reads as a played-and-lost season;
 *  - rows that predate roles (`viewerRole === null`) are counted for no role,
 *    never back-filled from the recorded legacy class (R1: a class is not a
 *    role in either direction);
 *  - the tally's scope is the caller's fetch window, never "all time" —
 *    `roleRecordScopeLabel` exists so that scope is always stated beside it.
 *
 * No rating, no win rate, no threshold: this is counting, and RE1 keeps every
 * progression decision.
 */

import type { MatchHistoryEntryView } from "./contracts";
import type { RankedRole } from "./roles";

export interface RoleRecord {
  wins: number;
  losses: number;
  draws: number;
}

/** Count real rows per role. Roles with no rows are absent from the result. */
export function tallyRoleRecords(
  entries: readonly MatchHistoryEntryView[],
): Partial<Record<RankedRole, RoleRecord>> {
  const out: Partial<Record<RankedRole, RoleRecord>> = {};
  for (const entry of entries) {
    const role = entry.viewerRole;
    if (role === null) continue;
    const bucket = out[role] ?? (out[role] = { wins: 0, losses: 0, draws: 0 });
    if (entry.viewerOutcome === "win") bucket.wins += 1;
    else if (entry.viewerOutcome === "loss") bucket.losses += 1;
    else bucket.draws += 1;
  }
  return out;
}

/** The scope sentence that must accompany a tally, so it is never read as a
 *  career record. `counted` is the number of rows actually tallied. */
export function roleRecordScopeLabel(counted: number): string {
  return counted === 1 ? "Last 1 ranked match" : `Last ${counted} ranked matches`;
}
