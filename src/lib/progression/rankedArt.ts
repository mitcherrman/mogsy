/**
 * RE1 Phase 3B — the ONE place a Ranked tier becomes a renderable image URL.
 *
 * Ranked uses the official Riot/League ranked emblem family already served by
 * the combat backend at `assets/ranks/{large,small}/{tier}.png` — the same
 * asset origin the quiz difficulty badge reads. This module only RESOLVES a
 * path; it never writes, recolors, generates, or retires an asset, and the
 * legacy emblems that difficulty rendering depends on are untouched.
 *
 * Academy crowns are deliberately unreachable from here. Ranked and Academy
 * render different art families, and keeping the Ranked resolution behind
 * this single function is what makes the emblem set swappable later without
 * touching any screen: change this file, and every Ranked surface follows.
 */

import { resolveTierArt } from "./art";
import type { RankTier } from "./tiers";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";

export type RankedEmblemSize = "large" | "small";

/**
 * The absolute URL of the Riot ranked emblem for a canonical tier, or null
 * when the tier is not one of the five (callers then render no emblem rather
 * than substituting a nearest-tier guess).
 */
export function resolveRankedEmblemUrl(
  tier: unknown,
  size: RankedEmblemSize = "large",
): string | null {
  const art = resolveTierArt("ranked", tier, { size });
  if (!art) return null;
  return resolveQuizAssetUrl(art.src) ?? null;
}

/** Display name for a Ranked tier, e.g. `"Gold"`. Presentation only. */
export function rankedTierLabel(tier: RankTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}
