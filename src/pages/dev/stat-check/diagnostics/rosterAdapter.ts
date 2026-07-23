import type { ChampionBaseStats, ChampionStatsResponse } from "@/lib/league-docs/api";
import { buildCardsFromBaseStats, type StatCheckCard } from "../statCheckEngine";

/**
 * Diagnostic adapter for already-loaded canonical champion rows. Mirrors the
 * live route's pipeline exactly: fetchChampionBaseStats unwraps and
 * name-filters the /api/meta/champion-stats payload, then StatCheckPage feeds
 * the rows to buildCardsFromBaseStats. No new data source, no network here —
 * acquisition stays outside tests (a gitignored roster.local.json snapshot).
 */
export function parseChampionStatsResponse(payload: unknown): ChampionBaseStats[] {
  const data = payload as ChampionStatsResponse | null;
  const rows = Array.isArray(data?.champion_stats) ? data!.champion_stats! : [];
  return rows.filter((r) => typeof r?.champion_name === "string" && r.champion_name.trim().length > 0);
}

/** Same transformation the dev route applies to live rows. */
export function buildRosterDeck(rows: ChampionBaseStats[]): StatCheckCard[] {
  return buildCardsFromBaseStats(rows);
}

export function rosterDeckFromResponse(payload: unknown): StatCheckCard[] {
  return buildRosterDeck(parseChampionStatsResponse(payload));
}
