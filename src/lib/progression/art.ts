/**
 * RE1 Phase 1 — track-scoped tier artwork resolution.
 *
 * Academy renders the original Mogzy crowns bundled with this app
 * (`/images/ranked/crowns/*.png`). Ranked renders the Riot/League ranked
 * emblem family already served by the combat backend at
 * `assets/ranks/{large,small}/{tier}.png` — the same asset origin the quiz
 * difficulty badge uses, and which must be resolved through the usual backend
 * asset URL helper.
 *
 * The two families are resolved through separate maps so Ranked artwork can be
 * replaced later without touching Academy, and so nothing here can overwrite
 * or retire the legacy `assets/ranks/...` files that difficulty rendering
 * still depends on. This module never mutates or deletes assets.
 */

import type { RankTier, RankTrack } from "./tiers";
import { parseRankTier, parseRankTrack } from "./tiers";
import { resolveCrownArt } from "@/lib/ranked/crowns";

export type TierArt = {
  track: RankTrack;
  tier: RankTier;
  /**
   * Academy: an app-absolute path served by this frontend.
   * Ranked: a backend-relative path — pass it through the backend asset URL
   * helper before use, exactly as the difficulty badge does.
   */
  src: string;
  /** True when `src` still needs backend asset-URL resolution. */
  backendRelative: boolean;
};

/** Ranked keeps using the existing League emblem family, untouched. */
function rankedEmblemPath(tier: RankTier, size: "large" | "small"): string {
  return `assets/ranks/${size}/${tier}.png`;
}

/**
 * Resolve the artwork for a tier on a specific track. Returns null for a
 * non-canonical track or tier — callers keep their existing legacy rendering
 * rather than receiving a guessed nearest tier.
 */
export function resolveTierArt(
  track: unknown,
  tier: unknown,
  options: { size?: "large" | "small" } = {},
): TierArt | null {
  const resolvedTrack = parseRankTrack(track);
  const resolvedTier = parseRankTier(tier);
  if (!resolvedTrack || !resolvedTier) return null;

  if (resolvedTrack === "academy") {
    const src = resolveCrownArt(resolvedTier);
    if (!src) return null;
    return { track: resolvedTrack, tier: resolvedTier, src, backendRelative: false };
  }

  return {
    track: resolvedTrack,
    tier: resolvedTier,
    src: rankedEmblemPath(resolvedTier, options.size ?? "large"),
    backendRelative: true,
  };
}
