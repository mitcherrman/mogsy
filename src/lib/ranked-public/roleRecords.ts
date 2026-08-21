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

/**
 * MALT — the same real rows, read as a ROLE MASTERY RECORD.
 *
 * The left parchment now answers "how strong am I at this role?", which needs
 * more than a W-L pair. Every field below is still COUNTED from the account's
 * own match rows — the identical rows the centre column lists — so nothing
 * here is a new claim about the player. What the backend does not send, this
 * does not invent:
 *
 *   available     games, W/L/D, win rate, net rating movement, last played
 *   NOT available per-role accuracy, per-role rating, per-role study category
 *                 strength/weakness — there is no per-role stats contract on
 *                 `/api/ranked/*` and no per-role dimension on the quiz
 *                 progress endpoint. They are absent here rather than faked.
 *
 * `winRatePercent` is only ever read beside `games`, which is why it is safe
 * to compute: a role with no rows has NO entry at all (the `tallyRoleRecords`
 * rule, unchanged), so a 0% can never stand for "never played".
 *
 * `netRating` is null — not 0 — when no row in the window carries an applied
 * delta, because "no rating was applied to these matches" and "the rating
 * came out even" are different facts and must not render identically.
 */
export interface RoleMastery extends RoleRecord {
  /** Rows tallied for this role inside the caller's fetch window. */
  games: number;
  /** Rounded 0-100. Meaningful only because `games` is always shown with it. */
  winRatePercent: number;
  /** Summed applied rating movement, or null when no row carries one. */
  netRating: number | null;
  /** ISO timestamp of the most recent row for this role. */
  lastPlayedAt: string | null;
}

/** Count real rows per role, richer. Roles with no rows are absent. */
export function tallyRoleMastery(
  entries: readonly MatchHistoryEntryView[],
): Partial<Record<RankedRole, RoleMastery>> {
  const out: Partial<Record<RankedRole, RoleMastery>> = {};
  // Deltas are accumulated separately from the record so "no delta on any
  // row" stays distinguishable from "the deltas summed to zero".
  const deltaSeen: Partial<Record<RankedRole, boolean>> = {};

  for (const entry of entries) {
    const role = entry.viewerRole;
    if (role === null) continue;
    const bucket =
      out[role] ??
      (out[role] = {
        wins: 0, losses: 0, draws: 0,
        games: 0, winRatePercent: 0, netRating: null, lastPlayedAt: null,
      });

    if (entry.viewerOutcome === "win") bucket.wins += 1;
    else if (entry.viewerOutcome === "loss") bucket.losses += 1;
    else bucket.draws += 1;
    bucket.games += 1;

    if (entry.ratingDelta !== null) {
      bucket.netRating = (deltaSeen[role] ? bucket.netRating ?? 0 : 0) + entry.ratingDelta;
      deltaSeen[role] = true;
    }
    // The window is newest-first on the wire, but this does not depend on
    // that: it keeps the largest timestamp it has seen, in either order.
    if (bucket.lastPlayedAt === null || entry.completedAt > bucket.lastPlayedAt) {
      bucket.lastPlayedAt = entry.completedAt;
    }
  }

  for (const bucket of Object.values(out)) {
    bucket.winRatePercent = Math.round((bucket.wins / bucket.games) * 100);
  }
  return out;
}

/**
 * A coarse "when" for a match row — days, never hours or minutes.
 *
 * Deliberately imprecise. This line sits in a mastery ledger, where the useful
 * fact is "recently / a while ago"; a to-the-minute figure would invite the
 * reader to treat a 20-row window as a live feed. Returns null for an
 * unparseable timestamp rather than rendering "Invalid Date".
 */
export function matchAgeLabel(iso: string | null, now: number = Date.now()): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const days = Math.floor((now - then) / 86_400_000);
  if (days < 0) return "Today";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "Last week";
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}
