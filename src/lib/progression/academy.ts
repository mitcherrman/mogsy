/**
 * RE1 Phase 2B — the Academy progression block, as it arrives on the wire.
 *
 * The backend derives every number here from `quiz_user_progress.total_xp`
 * beside ACADEMY_THRESHOLDS, and this module deliberately RE-DERIVES NOTHING.
 * There are no thresholds in this file and no interval arithmetic: a later
 * change to the approved cutoffs must not be able to leave the client
 * disagreeing with the server about which tier a player is in.
 *
 * What this module does is validate. Every field is `unknown` on the wire and
 * an older backend omits the whole block, so the parser returns null unless
 * the set is coherent — callers then keep their existing legacy rendering
 * rather than displaying half a migration.
 */

import type { RankTier } from "./tiers";
import { parseRankTier } from "./tiers";

export type AcademyProgression = {
  tier: RankTier;
  /** null at Challenger, which has no tier above it. */
  nextTier: RankTier | null;
  /** Inclusive XP that entered `tier` — the progress bar's floor. */
  currentTierXp: number;
  /** XP that enters `nextTier`; null at Challenger, which has no ceiling. */
  nextTierXp: number | null;
  /** Remaining XP to `nextTier`; 0 at Challenger. */
  xpToNext: number;
  /** Position within `tier`'s own interval, 0-100. */
  progressPercent: number;
  /** Challenger: terminal state, nothing left to climb. */
  isMaxTier: boolean;
};

/** A finite number, or null. Rejects NaN, Infinity, booleans and strings. */
function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A finite number at or above zero, or null. */
function nonNegative(value: unknown): number | null {
  const n = finiteNumber(value);
  return n === null || n < 0 ? null : n;
}

type AcademyWireFields = {
  academy_tier?: unknown;
  academy_next_tier?: unknown;
  academy_current_tier_xp?: unknown;
  academy_next_tier_xp?: unknown;
  academy_xp_to_next?: unknown;
  academy_progress_percent?: unknown;
};

/**
 * Validate the Academy block. Returns null — meaning "keep rendering legacy"
 * — for a missing block, a non-canonical tier, or any incoherent combination.
 *
 * Coherence rules, all of which the backend already guarantees and which are
 * asserted here because the wire is untrusted:
 *
 *  - `tier` must be one of the five canonical tiers.
 *  - Challenger is the ONLY tier allowed to have no next tier, and it must
 *    have none. A "gold with no next tier" payload is a broken migration, not
 *    a max tier, and is rejected rather than rendered as one.
 *  - Below Challenger the interval must be real: a canonical next tier and a
 *    ceiling strictly above the floor.
 *  - The percentage is clamped to 0-100 rather than rejected, since a value
 *    slightly outside that range is a rounding artefact, not a broken tier.
 */
export function parseAcademyProgression(
  progress: AcademyWireFields | null | undefined,
): AcademyProgression | null {
  if (!progress) return null;

  const tier = parseRankTier(progress.academy_tier);
  if (!tier) return null;

  const currentTierXp = nonNegative(progress.academy_current_tier_xp);
  const percent = finiteNumber(progress.academy_progress_percent);
  if (currentTierXp === null || percent === null) return null;

  const progressPercent = Math.max(0, Math.min(100, percent));
  const nextTier = parseRankTier(progress.academy_next_tier);
  const nextTierXp = nonNegative(progress.academy_next_tier_xp);
  const isMaxTier = tier === "challenger";

  if (isMaxTier) {
    // Terminal state: a ceiling here would contradict the tier itself.
    if (nextTier || nextTierXp !== null) return null;
    return {
      tier,
      nextTier: null,
      currentTierXp,
      nextTierXp: null,
      xpToNext: 0,
      progressPercent: 100,
      isMaxTier: true,
    };
  }

  if (!nextTier || nextTierXp === null || nextTierXp <= currentTierXp) return null;

  return {
    tier,
    nextTier,
    currentTierXp,
    nextTierXp,
    xpToNext: nonNegative(progress.academy_xp_to_next) ?? 0,
    progressPercent,
    isMaxTier: false,
  };
}

/** "Academy Gold" — never bare competitive-sounding rank language. */
export function academyTierLabel(tier: RankTier): string {
  return `Academy ${tier.charAt(0).toUpperCase()}${tier.slice(1)}`;
}
