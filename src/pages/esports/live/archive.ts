/**
 * Presentation layer for the match archive.
 *
 * Two rules carried over from the viewer's own `lib.ts`, because the archive
 * is the same product and must not develop a second, looser voice:
 *
 * 1. Never present absent data as zero — a dash where we do not know.
 * 2. Never imply telemetry the store does not hold. Most finished games carry
 *    a single final-snapshot frame, and a row that hints at a timeline it
 *    cannot draw is the exact dishonesty the match centre already fixed.
 */
import type {
  ArchiveFilters,
  ArchiveGame,
  LiveGameSummary,
  TelemetryDepth,
} from "@/lib/live-esports/api";

/**
 * An archive row, shaped as the summary the viewer's helpers already take.
 *
 * The wire format keeps `league`/`tournament`/`stage` at the top level so a
 * browse row stays compact; the display helpers want them nested under
 * `competition`. This is that adaptation and nothing else — no field is
 * invented, and everything the helpers treat as optional stays absent rather
 * than being filled in with a plausible value. In particular there is no
 * `freshness` and no `first_frame_ts`: an archive row genuinely does not carry
 * them, so `gameClock` returns null and no elapsed time is claimed.
 */
export function asSummary(row: ArchiveGame): LiveGameSummary {
  return {
    game_id: row.game_id,
    match_id: row.match_id ?? "",
    league: { slug: row.league?.slug ?? null, name: row.league?.name ?? null },
    block_name: row.stage?.block_name ?? null,
    competition: { league: row.league, tournament: row.tournament, stage: row.stage },
    best_of: row.best_of,
    game_number: row.game_number,
    teams: {
      blue: { ...row.teams.blue, resolved_page: null },
      red: { ...row.teams.red, resolved_page: null },
    },
    patch_version: row.patch_version,
    game_state: null,
    availability: row.availability,
    availability_detail: null,
    scheduled_start: row.scheduled_start,
    first_frame_ts: null,
    freshness: {
      label: row.final ? "final" : "no_data",
      seconds_since_success: null,
      source_frame_ts: null,
      last_attempt_at: null,
      last_success_at: null,
    },
  };
}

/**
 * What the reader is told they will get if they open this game.
 *
 * Each label is a promise about the viewer, so each is worded to what the
 * viewer can actually render: a gold chart and objective timeline need a real
 * frame series, and a game holding one frame has a final scoreboard and
 * nothing else. The backend decides the band from a frame count; nothing here
 * re-derives or softens it.
 */
export const DEPTH_LABEL: Record<TelemetryDepth, string> = {
  full: "Full timeline",
  partial: "Partial telemetry",
  final_snapshot: "Final snapshot",
  none: "No telemetry",
};

export const DEPTH_TITLE: Record<TelemetryDepth, string> = {
  full: "Gold chart and objective timeline from a recorded frame series",
  partial: "A short recorded series — the chart covers part of the game",
  final_snapshot:
    "One recorded frame: the final scoreboard, with no chart or timeline",
  none: "No telemetry was stored for this game",
};

/** Muted for the thin bands: this is information, never a badge of quality. */
export const DEPTH_TONE: Record<TelemetryDepth, string> = {
  full: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  partial: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  final_snapshot: "border-border bg-muted/40 text-muted-foreground",
  none: "border-border bg-muted/40 text-muted-foreground",
};

export const EMPTY_FILTERS: ArchiveFilters = {
  league: null,
  tournament: null,
  team: null,
  date_from: null,
  date_to: null,
  status: null,
  depth: null,
};

export function hasAnyFilter(f: ArchiveFilters): boolean {
  return Object.values(f).some(Boolean);
}

export function countActiveFilters(f: ArchiveFilters): number {
  return Object.values(f).filter(Boolean).length;
}

/**
 * Filters as URL params, so a filtered archive view is a shareable link and
 * survives a refresh. Only set values are written — an untouched control
 * leaves no trace in the URL.
 */
export function filtersToParams(f: ArchiveFilters): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, String(v));
  return p;
}

export function filtersFromParams(p: URLSearchParams): ArchiveFilters {
  const get = (k: string) => p.get(k) || null;
  const status = get("status");
  const depth = get("depth");
  return {
    league: get("league"),
    tournament: get("tournament"),
    team: get("team"),
    date_from: get("date_from"),
    date_to: get("date_to"),
    // The backend 400s on an unknown value, so a hand-edited URL is dropped
    // here rather than turned into a failed page.
    status: status === "final" || status === "unfinished" ? status : null,
    depth: depth === "full" ? "full" : null,
  };
}

/**
 * Tournaments belonging to the selected league.
 *
 * Production holds five separate tournaments all named "Summer 2026", one per
 * league, which is why each facet carries its league and why an unscoped list
 * would show the same word five times with no way to tell them apart.
 */
export function tournamentsForLeague<T extends { league_slug: string | null }>(
  tournaments: T[],
  league: string | null,
): T[] {
  if (!league) return tournaments;
  return tournaments.filter((t) => t.league_slug === league);
}
