/**
 * Canonical source-of-truth map from normalized rank tier name to the Mogzy
 * crown art path. Only the five tiers below have crown art in this phase;
 * every other live rank tier (Unranked, Iron, Platinum, Emerald, Master,
 * Grandmaster) intentionally has no entry and must keep using its existing
 * backend-supplied rank crest instead.
 */
const CROWN_ART_BY_TIER: Record<string, string> = {
  bronze: "/images/ranked/crowns/bronze.png",
  silver: "/images/ranked/crowns/silver.png",
  gold: "/images/ranked/crowns/gold.png",
  diamond: "/images/ranked/crowns/diamond.png",
  challenger: "/images/ranked/crowns/challenger.png",
};

/**
 * Resolve Mogzy crown art for a rank tier name. Exact, case-insensitive
 * match only — no fuzzy matching, no nearest-tier fallback, no rank
 * threshold logic. Returns null for unsupported tiers or empty input.
 */
export function resolveCrownArt(rankName?: string | null): string | null {
  if (!rankName) return null;
  const normalized = rankName.trim().toLowerCase();
  if (!normalized) return null;
  return CROWN_ART_BY_TIER[normalized] ?? null;
}
