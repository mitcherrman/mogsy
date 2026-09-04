/**
 * Presentation helpers for the production live viewer.
 *
 * The rule that shapes most of this file: never present absent data as zero.
 * LIVE1 returns `null` for telemetry the feed did not supply, and a dash is
 * an honest answer where "0" would be a lie.
 */
import type {
  LiveCompetition,
  LiveFreshness,
  LiveGameSummary,
} from "@/lib/live-esports/api";

export type StatusTone = "live" | "delayed" | "stale" | "done" | "none";

export function statusTone(f: LiveFreshness | null | undefined): StatusTone {
  switch (f?.label) {
    case "live_fresh":
      return "live";
    case "delayed":
      return "delayed";
    case "final":
      return "done";
    case "stale":
    case "stale_source_failing":
      return "stale";
    default:
      return "none";
  }
}

/**
 * The two words that matter are LIVE and DONE.
 *
 * A completed game used to read "FINAL", which people reasonably heard as
 * "the finals" — a claim about the STAGE of a tournament rather than the
 * state of a game. "DONE" cannot be misread that way. The remaining labels
 * are the honest in-between states and stay: a game whose feed stopped
 * mid-match is neither live nor done, and saying so is the point.
 */
export function statusLabel(f: LiveFreshness | null | undefined): string {
  switch (f?.label) {
    case "live_fresh":
      return "LIVE";
    case "delayed":
      return "DELAYED";
    case "final":
      return "DONE";
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

/**
 * Elapsed game time from the stored frame clock, never wall-clock.
 *
 * A zero span is SILENCE, not "0:00". Most finished games in the store hold a
 * single telemetry frame — the live poller's last successful capture — because
 * only the leagues the daily backfill covers get a walked timeline. For those,
 * `first_frame_ts` and the latest frame are the same instant, and a literal
 * "0:00" would tell the reader a 30-minute game lasted no time at all. We know
 * the game's final state; we do not know its duration, so we say nothing.
 */
export function gameClock(game: LiveGameSummary | null | undefined): string | null {
  const start = game?.first_frame_ts;
  const latest = game?.freshness?.source_frame_ts;
  if (!start || !latest) return null;
  const a = Date.parse(start);
  const b = Date.parse(latest);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  const seconds = Math.floor((b - a) / 1000);
  if (seconds <= 0) return null;
  return clock(seconds);
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

/**
 * "Bo3 · Game 2 · Series 1–0" — only the parts we actually know.
 *
 * The score is the one entering this game: LIVE1 freezes a game's series
 * wins when it stops being the current game of the match, so game 3 of a
 * 1-1 series reads "Series 1–1" and not the eventual result. `compact`
 * drops the words for the selector cards, which have ~220px to work with.
 */
export function seriesContext(g: LiveGameSummary, compact = false): string | null {
  const parts: string[] = [];
  if (g.best_of) parts.push(`Bo${g.best_of}`);
  if (g.game_number) parts.push(compact ? `G${g.game_number}` : `Game ${g.game_number}`);
  const bw = g.teams.blue?.series_wins;
  const rw = g.teams.red?.series_wins;
  const score = `${bw}–${rw}`;
  if (bw != null && rw != null) parts.push(compact ? score : `Series ${score}`);
  return parts.length ? parts.join(" · ") : null;
}

export const SERIES_SCORE_TITLE = "Series score entering this game";

/* ── when was this match? ────────────────────────────────────────────────── */

/**
 * The instant this match belongs to, and which field said so.
 *
 * `scheduled_start` is the broadcast slot and is the answer to "when was
 * this match" — it is shared by every game of a series, exactly as a
 * schedule shows it. Games ingested by the batch/daily path can predate the
 * schedule passthrough and have none, so the first telemetry frame is the
 * fallback: less tidy, but a real observed instant rather than nothing.
 *
 * Both fields are UTC (`…Z`). `Date.parse` therefore yields the correct
 * instant, and every renderer below formats it in the VIEWER's timezone —
 * a UTC date is never relabelled as a local one.
 */
export function matchInstant(
  g: LiveGameSummary | null | undefined,
): { date: Date; source: "scheduled" | "first_frame" } | null {
  for (const [value, source] of [
    [g?.scheduled_start, "scheduled"],
    [g?.first_frame_ts, "first_frame"],
  ] as const) {
    if (!value) continue;
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return { date: new Date(ms), source };
  }
  return null;
}

/** "Aug 16, 2026" in the viewer's own timezone. */
export function matchDate(g: LiveGameSummary | null | undefined): string | null {
  const instant = matchInstant(g);
  if (!instant) return null;
  return instant.date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * "Aug 16" for the ~220px selector cards. The year is dropped rather than
 * decided by a same-year test, which would compare a local year against a
 * UTC one and flip around New Year; the card's tooltip and the header both
 * carry the full date, so nothing is actually lost.
 */
export function matchDateShort(g: LiveGameSummary | null | undefined): string | null {
  const instant = matchInstant(g);
  if (!instant) return null;
  return instant.date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Tooltip text that makes the conversion auditable: the full local date and
 * time, named as local, plus which upstream field it came from.
 */
export function matchDateTitle(g: LiveGameSummary | null | undefined): string | undefined {
  const instant = matchInstant(g);
  if (!instant) return undefined;
  const local = instant.date.toLocaleString(undefined, {
    dateStyle: "full",
    timeStyle: "short",
  });
  const origin =
    instant.source === "scheduled" ? "scheduled start" : "first telemetry frame";
  return `${local} (your local time) — ${origin}`;
}

/* ── what kind of match is this? ─────────────────────────────────────────── */

export function scopeLabel(c: LiveCompetition | null | undefined): string | null {
  switch (c?.league?.scope) {
    case "international":
      return "International";
    case "domestic":
      return "Domestic";
    default:
      // No league region synced yet: say nothing rather than assume domestic.
      return null;
  }
}

export const SCOPE_TITLE: Record<string, string> = {
  International: "Cross-region competition",
  Domestic: "Regional league competition",
};

/**
 * "Playoffs · Finals" / "Week 12" — the stage, in upstream's own words.
 *
 * Two labels describe a game's place in a competition and neither is
 * redundant: the bracket stage/round from the standings ("Playoffs",
 * "Finals") and the schedule's block ("Week 12", "Play-Ins"). Group-phase
 * games have no bracket entry at all, so the block is all there is — and
 * "Week 12" is deliberately left as "Week 12" rather than promoted to
 * "Regular Season", which upstream never says.
 */
export function stageLabel(c: LiveCompetition | null | undefined): string | null {
  const stage = c?.stage;
  if (!stage) return null;
  const parts: string[] = [];
  if (stage.name) parts.push(stage.name);
  // Whichever of the two is more specific than the stage itself; never the
  // same word twice ("Play-Ins · Play-Ins").
  const detail = stage.round_name || stage.block_name;
  if (detail && !parts.includes(detail)) parts.push(detail);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * The competition line — league, tournament, stage — each omitted rather
 * than filled in when we do not have it. Scope is deliberately NOT in here:
 * "is this domestic or international" is a question of its own and gets its
 * own chip rather than a word buried at the end of a muted line.
 */
export function competitionLine(g: LiveGameSummary | null | undefined): string[] {
  const c = g?.competition;
  const parts: string[] = [];
  const league = c?.league?.name || g?.league?.name || g?.league?.slug;
  if (league) parts.push(league);
  if (c?.tournament?.name) parts.push(c.tournament.name);
  const stage = stageLabel(c) ?? g?.block_name ?? null;
  if (stage) parts.push(stage);
  return parts;
}

/**
 * "16.17.810.4348" → "16.17". Upstream sends the full game version; the patch
 * a reader knows is its first two components, which is Riot's own convention.
 * Anything that does not look like a version (no two leading numeric parts) is
 * shown verbatim rather than truncated into something wrong — and the full
 * string stays available as the segment's tooltip.
 */
export function patchLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length < 2) return raw;
  const [major, minor] = parts;
  if (!/^\d+$/.test(major) || !/^\d+$/.test(minor)) return raw;
  return `${major}.${minor}`;
}

export type MatchLinePart = {
  kind: "date" | "series" | "clock" | "patch";
  text: string;
  title?: string;
};

/**
 * "Aug 16, 2026 · Bo3 · Game 3 · Series 1–1 · 38:28 · Patch 16.15" — the
 * match line, as tagged parts so the renderer never has to guess which
 * segment is the date (a locale-dependent string) to attach its tooltip.
 */
export function matchLine(g: LiveGameSummary | null | undefined): MatchLinePart[] {
  if (!g) return [];
  const parts: MatchLinePart[] = [];
  const date = matchDate(g);
  if (date) parts.push({ kind: "date", text: date, title: matchDateTitle(g) });
  const series = seriesContext(g);
  if (series) parts.push({ kind: "series", text: series, title: SERIES_SCORE_TITLE });
  const cl = gameClock(g);
  if (cl) parts.push({ kind: "clock", text: cl, title: "Elapsed game time" });
  const patch = patchLabel(g.patch_version);
  if (patch) parts.push({ kind: "patch", text: `Patch ${patch}`, title: g.patch_version ?? undefined });
  return parts;
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
