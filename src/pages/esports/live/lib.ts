/**
 * Presentation helpers for the production live viewer.
 *
 * The rule that shapes most of this file: never present absent data as zero.
 * LIVE1 returns `null` for telemetry the feed did not supply, and a dash is
 * an honest answer where "0" would be a lie.
 */
import type { LiveFreshness, LiveGameSummary } from "@/lib/live-esports/api";

export type FreshnessTone = "live" | "delayed" | "stale" | "final" | "none";

export function freshnessTone(f: LiveFreshness | null | undefined): FreshnessTone {
  switch (f?.label) {
    case "live_fresh":
      return "live";
    case "delayed":
      return "delayed";
    case "final":
      return "final";
    case "stale":
    case "stale_source_failing":
      return "stale";
    default:
      return "none";
  }
}

export function freshnessLabel(f: LiveFreshness | null | undefined): string {
  switch (f?.label) {
    case "live_fresh":
      return "LIVE";
    case "delayed":
      return "DELAYED";
    case "final":
      return "FINAL";
    case "stale":
      return "STALE";
    case "stale_source_failing":
      return "SOURCE FAILING";
    case "no_stats":
      return "NO STATS";
    default:
      return "NO DATA";
  }
}

/** "3m ago" / "2h ago" — how old the underlying telemetry is. */
export function agoLabel(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

/** Elapsed game time from the stored frame clock, never wall-clock. */
export function gameClock(game: LiveGameSummary | null | undefined): string | null {
  const start = game?.first_frame_ts;
  const latest = game?.freshness?.source_frame_ts;
  if (!start || !latest) return null;
  const a = Date.parse(start);
  const b = Date.parse(latest);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return clock(Math.floor((b - a) / 1000));
}

export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** Thousands separators; `—` when the value is genuinely absent. */
export function num(value: number | null | undefined): string {
  return value == null ? "—" : value.toLocaleString();
}

/** 12.3k for gold totals, where exact units are noise. */
export function kgold(value: number | null | undefined): string {
  if (value == null) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

export function pct(value: number | null | undefined): string {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

export function teamLabel(t: { name: string | null; code: string | null } | null | undefined): string {
  return t?.code || t?.name || "TBD";
}

export function matchTitle(g: LiveGameSummary): string {
  return `${teamLabel(g.teams.blue)} vs ${teamLabel(g.teams.red)}`;
}

/** "Bo3 · Game 2 · 1-0" — only the parts we actually know. */
export function seriesContext(g: LiveGameSummary): string | null {
  const parts: string[] = [];
  if (g.best_of) parts.push(`Bo${g.best_of}`);
  if (g.game_number) parts.push(`Game ${g.game_number}`);
  const bw = g.teams.blue?.series_wins;
  const rw = g.teams.red?.series_wins;
  if (bw != null && rw != null) parts.push(`${bw}-${rw}`);
  return parts.length ? parts.join(" · ") : null;
}

/** Dragon souls arrive as a list of type strings; count them by type. */
export function dragonCounts(dragons: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!Array.isArray(dragons)) return out;
  for (const d of dragons) {
    const key = typeof d === "string" ? d : (d as { type?: string })?.type;
    if (!key) continue;
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

export const DRAGON_LABEL: Record<string, string> = {
  infernal: "Infernal",
  mountain: "Mountain",
  ocean: "Ocean",
  cloud: "Cloud",
  hextech: "Hextech",
  chemtech: "Chemtech",
  elder: "Elder",
};

/**
 * Event types worth surfacing. LIVE1 derives these by diffing consecutive
 * frames rather than reading Riot-native events, so the timeline shows the
 * ORDER things happened and the frame each was first observed in — never a
 * to-the-second kill timestamp we cannot actually support.
 */
export const EVENT_LABEL: Record<string, string> = {
  team_kill: "Kill",
  player_kill: "Kill",
  player_death: "Death",
  tower_destroyed: "Tower",
  inhibitor_destroyed: "Inhibitor",
  dragon_killed: "Dragon",
  baron_killed: "Baron",
};

export const TIMELINE_EVENT_TYPES = [
  "tower_destroyed",
  "inhibitor_destroyed",
  "dragon_killed",
  "baron_killed",
  "team_kill",
];
