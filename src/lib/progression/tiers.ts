/**
 * RE1 Phase 1 — canonical five-tier progression domain (frontend).
 *
 * Mogzy has two progression tracks that share one tier vocabulary but nothing
 * else:
 *
 *   academy — scored by cumulative quiz XP; upward only, no demotions.
 *   ranked  — scored by the Public Ranked competitive rating; can demote.
 *
 * The tracks stay separate on purpose: their scores have different units, they
 * carry independent thresholds (owned by the backend), and they render
 * DIFFERENT art families. Nothing in this module is coupled to R1 role
 * identity (top/jungle/mid/adc/support) — progression and role are orthogonal.
 *
 * This module is additive vocabulary only. It is not yet wired into any
 * screen; the live profile/quiz surfaces still render backend-supplied legacy
 * rank names. Phase 2 does that migration.
 */

export const RANK_TIERS = ["bronze", "silver", "gold", "diamond", "challenger"] as const;
/** Ascending tier order; the single source of ordering truth. */
export type RankTier = (typeof RANK_TIERS)[number];

export const RANK_TRACKS = ["academy", "ranked"] as const;
export type RankTrack = (typeof RANK_TRACKS)[number];

export function isRankTier(value: unknown): value is RankTier {
  return typeof value === "string" && (RANK_TIERS as readonly string[]).includes(value);
}

export function isRankTrack(value: unknown): value is RankTrack {
  return typeof value === "string" && (RANK_TRACKS as readonly string[]).includes(value);
}

/**
 * Normalize a tier token, case-insensitively. Returns null for anything
 * outside the five-tier vocabulary — legacy League tiers (Iron, Platinum,
 * Emerald, Master, Grandmaster) and "Unranked" deliberately do NOT map onto a
 * canonical tier, so callers keep their existing legacy rendering for them.
 */
export function parseRankTier(value: unknown): RankTier | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return isRankTier(normalized) ? normalized : null;
}

export function parseRankTrack(value: unknown): RankTrack | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return isRankTrack(normalized) ? normalized : null;
}

/** Ascending index of a tier, or null when the token is not canonical. */
export function rankTierIndex(value: unknown): number | null {
  const tier = parseRankTier(value);
  return tier === null ? null : RANK_TIERS.indexOf(tier);
}
