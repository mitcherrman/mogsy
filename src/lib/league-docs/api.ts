/**
 * League Docs data-access layer.
 *
 * Public, read-only reference data for the /lol/docs knowledge base. Reuses the
 * canonical Combat API base URL (VITE_COMBAT_API_URL) — do not add separate
 * fallback URLs here. Only endpoints that are already public may be used;
 * admin endpoints and keys must never appear in this file.
 */
import { COMBAT_API_BASE_URL } from "@/lib/combat-lab/api";

export type ChampionBaseStats = {
  champion_name: string;
  hp: number;
  hp_per_level: number;
  hp5: number;
  mp: number;
  mp_per_level: number;
  ad: number;
  ad_per_level: number;
  attack_speed: number;
  /** Percent growth per level (League attack-speed growth is percentage-based). */
  attack_speed_per_level: number;
  armor: number;
  armor_per_level: number;
  magic_resist: number;
  magic_resist_per_level: number;
  move_speed: number;
  attack_range: number;
};

export type ChampionStatsResponse = {
  ok?: boolean;
  champion_stats?: ChampionBaseStats[];
};

/** Fetch base stats + per-level growth for every champion (public endpoint). */
export async function fetchChampionBaseStats(): Promise<ChampionBaseStats[]> {
  const res = await fetch(`${COMBAT_API_BASE_URL}/api/meta/champion-stats`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  const data = (await res.json()) as ChampionStatsResponse;
  const rows = Array.isArray(data?.champion_stats) ? data.champion_stats : [];
  return rows.filter((r) => typeof r?.champion_name === "string" && r.champion_name.trim());
}

/**
 * URL slug for a champion name: "Aurelion Sol" → "aurelion-sol",
 * "Kai'Sa" → "kaisa", "Nunu & Willump" → "nunu-willump".
 */
export function championSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function findChampionBySlug<T extends { champion_name: string }>(
  rows: T[] | undefined,
  slug: string,
): T | undefined {
  if (!rows) return undefined;
  const target = slug.toLowerCase();
  return rows.find((r) => championSlug(r.champion_name) === target);
}

/**
 * Riot's stat-growth multiplier. Mirrors the backend combat engine
 * (champion_stat_profile.riot_level_multiplier) so League Docs projections
 * match Combat Lab: g(level) = (level−1) × (0.7025 + 0.0175 × (level−1)).
 */
export function riotLevelMultiplier(level: number): number {
  if (level <= 1) return 0;
  const n = level - 1;
  return n * (0.7025 + 0.0175 * n);
}

/** Flat stats: base + growth × multiplier. */
export function statAtLevel(base: number, perLevel: number, level: number): number {
  return base + perLevel * riotLevelMultiplier(level);
}

/**
 * Attack speed grows by a PERCENT of the champion's attack-speed ratio.
 * The public endpoint does not expose the ratio, so this assumes ratio ≈ base
 * attack speed (true for most champions) — matching the engine's formula shape:
 * AS(level) = ratio × (1 + growth% × multiplier / 100).
 */
export function attackSpeedAtLevel(baseAs: number, asPerLevelPercent: number, level: number): number {
  return baseAs * (1 + (asPerLevelPercent * riotLevelMultiplier(level)) / 100);
}
