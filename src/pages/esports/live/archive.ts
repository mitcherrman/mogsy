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

/* ── series ───────────────────────────────────────────────────────────────
 *
 * A page of the archive is mostly series, not lone games: 786 of 794 stored
 * games belong to a match with at least one sibling, and the default ordering
 * — `scheduled_start DESC, game_id DESC` — already lands them next to each
 * other, because every game of a series shares one broadcast slot. Rendering
 * them as four independent rows repeated the same league, tournament, stage,
 * patch and date four times and made a best-of-five look like four duplicates.
 *
 * Grouping is therefore a READ of the order the backend already returned, not
 * a re-sort and not a second query. Only ADJACENT games sharing a `match_id`
 * are grouped, which is what makes it honest at a page boundary: a series
 * split across two pages renders as two groups saying how many games each
 * holds, rather than a header claiming a series the page cannot show.
 */

/** Adjacent games of one match, in the order the backend returned them. */
export type SeriesGroup = {
  /**
   * Stable and UNIQUE across the page — the lead game's id, not the match id.
   * Three production match ids appear in two separate runs of one page (a
   * scheduled game 3 sits at the top of the archive while its own games 1 and
   * 2 sit three weeks down it), and keying on the match id made React see two
   * children with the same key.
   */
  key: string;
  matchId: string | null;
  /** Game N descending, exactly as served. Never re-sorted. */
  games: ArchiveGame[];
  /**
   * The game the group's shared metadata is read from — the latest of the
   * run, so the header describes the furthest the series got on this page.
   */
  lead: ArchiveGame;
};

export function groupIntoSeries(games: ArchiveGame[]): SeriesGroup[] {
  const groups: SeriesGroup[] = [];
  for (const game of games) {
    const previous = groups[groups.length - 1];
    // A null match_id groups with nothing, including another null one.
    if (previous && game.match_id && previous.matchId === game.match_id) {
      previous.games.push(game);
      continue;
    }
    groups.push({
      key: game.game_id,
      matchId: game.match_id ?? null,
      games: [game],
      lead: game,
    });
  }
  return groups;
}

/**
 * The result of the series, or nothing.
 *
 * `series_wins` is the score a game was played AT, frozen when the game stops
 * being the match's current one — so game 4 of a Bo5 reads 2–1 whatever
 * happened in it. The score AFTER that game is therefore two stored facts and
 * one addition: the frozen score plus who won the game. No frame, no kill
 * count and no other game is consulted.
 *
 * That still is not a series result. A 2–2 after game 4 says the match went
 * on; a 3–1 says it cannot have, because three wins ends a best-of-five. So a
 * result is claimed ONLY when the arithmetic reaches the best-of's own
 * threshold — never inferred from "this is the last game we hold", which at a
 * page boundary is a fact about pagination rather than about the match.
 *
 * Sides are the LEAD game's sides. Teams swap ends between games, so there is
 * no series-wide blue and red, and the caller renders both from the same game.
 */
export type SeriesResult = {
  blue: number;
  red: number;
  winner: "blue" | "red";
  bestOf: number;
};

export function seriesResult(group: SeriesGroup): SeriesResult | null {
  const g = group.lead;
  // A game still in progress, or one whose winner the store will not claim,
  // says nothing about the series.
  if (!g.final || !g.winner) return null;
  const bestOf = g.best_of;
  if (!bestOf || bestOf < 1) return null;
  const blueWins = g.teams.blue?.series_wins;
  const redWins = g.teams.red?.series_wins;
  if (blueWins == null || redWins == null) return null;

  const blue = blueWins + (g.winner === "blue" ? 1 : 0);
  const red = redWins + (g.winner === "red" ? 1 : 0);
  const needed = Math.floor(bestOf / 2) + 1;
  if (blue < needed && red < needed) return null;
  return { blue, red, winner: blue > red ? "blue" : "red", bestOf };
}

/**
 * The patch every game of the group agrees on, or null.
 *
 * A series is played on one patch in practice, and hoisting it out of four
 * identical row chips is most of what makes a group readable. When the games
 * disagree — which a page boundary or a rescheduled game can produce — the
 * header says nothing and each row keeps its own.
 */
export function sharedPatch(group: SeriesGroup): string | null {
  const first = group.games[0]?.patch_version ?? null;
  if (!first) return null;
  return group.games.every((g) => g.patch_version === first) ? first : null;
}

/**
 * A game that has not been played.
 *
 * Riot creates every slot of a best-of up front, so the store holds 16 rows
 * for games that may never happen — the game 3 of a series won 2–0. They are
 * not sparse recordings, they are absences, and labelling them "No telemetry"
 * alongside genuinely thin games said the wrong thing about both.
 */
export function isUnplayed(game: ArchiveGame): boolean {
  return !game.final && game.availability === "scheduled";
}

/**
 * A game the store has not finalised.
 *
 * Deliberately NOT called "live". `availability` carries the upstream label,
 * and the match centre already learned the hard way that the label alone is
 * not evidence: production has carried dozens of rows stuck at `live` for
 * hours — once for 22 days — after their match ended. The archive holds no
 * freshness clock to tell those apart, so it states what it can actually
 * prove: this record has no final result yet. A reader who opens it gets the
 * viewer, which does have the clock and does say LIVE or STALE.
 */
export function isUnfinished(game: ArchiveGame): boolean {
  return !game.final && !isUnplayed(game);
}

/* ── featured ─────────────────────────────────────────────────────────────
 *
 * 283 of 794 stored games carry a real recorded timeline, and until now
 * finding one meant knowing that the Telemetry control existed. The featured
 * strip is the answer to "just show me something worth watching" — and it is
 * a QUERY, not an editorial list. Nothing here names a league, a team or a
 * player; the picks change as the store does.
 */

/** Why this match was picked — shown on the card, so the rule is visible. */
export type FeaturedReason = "decider" | "timeline";

export type FeaturedMatch = {
  game: ArchiveGame;
  reason: FeaturedReason;
  /** The clinching score, when the pick is a decider. */
  result: SeriesResult | null;
};

export const FEATURED_LIMIT = 3;

/**
 * How many full-timeline games the strip is chosen from.
 *
 * One bounded request (`?depth=full&status=final&limit=12`, 11.7 KB measured
 * against production), not a scan. Twelve is enough to hold three or four
 * complete series at the top of the store, which is what the league spread
 * below needs to have anything to choose between.
 */
export const FEATURED_POOL = 12;

export const FEATURED_FILTERS: ArchiveFilters = {
  ...EMPTY_FILTERS,
  depth: "full",
  status: "final",
};

/**
 * The picks, from newest-first full-timeline games.
 *
 * Two rules, in order, and no third:
 *
 * 1. **The game that ended a series wins over one that did not.** It is the
 *    only "importance" signal the store actually holds — derived from the
 *    frozen series score and the game's own winner, never from kills, gold or
 *    a stage name we would have to interpret.
 * 2. **One per league.** Without it a single busy region takes every slot;
 *    with it the strip shows what the archive's breadth actually is. The cap
 *    is dropped rather than returning fewer than three, so a day when only
 *    one league played still fills the strip.
 *
 * Recency is not a third rule — it is the order the input already arrives in,
 * and every tie keeps it. The function is pure and deterministic: the same
 * page in gives the same picks out.
 */
export function featuredMatches(
  games: ArchiveGame[],
  limit = FEATURED_LIMIT,
): FeaturedMatch[] {
  const candidates: FeaturedMatch[] = groupIntoSeries(games).map((group) => {
    const result = seriesResult(group);
    return {
      game: group.lead,
      reason: result ? ("decider" as const) : ("timeline" as const),
      result,
    };
  });

  const picked: FeaturedMatch[] = [];
  const leagues = new Set<string>();
  // Deciders first, then everything else; within each pass the input's own
  // recency order is preserved, so the ranking never depends on a sort's
  // tie-breaking.
  for (const pass of ["decider", "timeline"] as const) {
    for (const c of candidates) {
      if (picked.length >= limit) break;
      if (c.reason !== pass) continue;
      const league = c.game.league?.slug ?? "";
      if (league && leagues.has(league)) continue;
      leagues.add(league);
      picked.push(c);
    }
  }
  // Breadth is a preference, never a reason to show two cards instead of
  // three: backfill in the same order, ignoring the league cap.
  for (const c of candidates) {
    if (picked.length >= limit) break;
    if (!picked.includes(c)) picked.push(c);
  }
  return picked;
}

export const FEATURED_REASON_LABEL: Record<FeaturedReason, string> = {
  decider: "Series decider",
  timeline: "Full timeline",
};

/* ── quick filters ────────────────────────────────────────────────────────
 *
 * A compact strip of the browsing paths people actually take, sitting above
 * the full rail rather than replacing it. Every chip is one of the filters
 * the backend already serves and writes the same URL parameter, so a chip and
 * the matching control in the rail are the same state seen twice — a chip can
 * never express something the rail cannot show, or vice versa.
 *
 * Nothing in here is a taxonomy. The league chips are whichever leagues have
 * the most stored games at the moment the facets were read, so a competition
 * that starts being covered appears on its own and one that stops disappears.
 */
export type QuickFilter = {
  id: string;
  label: string;
  /** Present when the facet knows how many games the chip will return. */
  count: number | null;
  /** The filter fields the chip owns — set when on, cleared when off. */
  patch: Partial<ArchiveFilters>;
};

/** How many league chips the strip offers before the rail takes over. */
export const QUICK_LEAGUE_CHIPS = 4;

/** The window "Recent" means, anchored to the store rather than to today. */
export const RECENT_WINDOW_DAYS = 7;

/**
 * The newest stored day minus a week, as `YYYY-MM-DD`.
 *
 * Anchored to `date_range.to` and not to the reader's clock on purpose: the
 * feed can be quiet for a week, and a "Recent" chip that returns nothing at
 * all is worse than no chip. Parsed as UTC — the facet dates are UTC days,
 * and `new Date("2026-09-05")` in a negative-offset timezone is the 4th.
 */
export function recentFrom(latest: string | null | undefined): string | null {
  if (!latest) return null;
  const ms = Date.parse(`${latest.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms - RECENT_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
}

export function quickFilters(
  facets:
    | {
        leagues: { slug: string; name: string; games: number }[];
        date_range: { from: string | null; to: string | null };
      }
    | undefined,
): QuickFilter[] {
  const chips: QuickFilter[] = [
    {
      id: "depth:full",
      label: "Full timeline",
      count: null,
      patch: { depth: "full" },
    },
  ];

  const from = recentFrom(facets?.date_range?.to);
  if (from) {
    chips.push({
      id: "recent",
      label: `Last ${RECENT_WINDOW_DAYS} days`,
      count: null,
      patch: { date_from: from, date_to: null },
    });
  }

  for (const league of (facets?.leagues ?? []).slice(0, QUICK_LEAGUE_CHIPS)) {
    chips.push({
      id: `league:${league.slug}`,
      label: league.name || league.slug,
      count: league.games,
      // A league chip drops the tournament with it: a tournament belongs to
      // exactly one league, so carrying it across would return nothing.
      patch: { league: league.slug, tournament: null },
    });
  }
  return chips;
}

/** A chip is on when every field it owns already matches the URL state. */
export function isQuickFilterActive(chip: QuickFilter, filters: ArchiveFilters): boolean {
  return Object.entries(chip.patch).every(([key, value]) => {
    const current = filters[key as keyof ArchiveFilters] ?? null;
    return (value ?? null) === current;
  });
}

/** Toggling a chip sets the fields it owns, or clears them if it was on. */
export function toggleQuickFilter(
  chip: QuickFilter,
  filters: ArchiveFilters,
): ArchiveFilters {
  const on = isQuickFilterActive(chip, filters);
  const next: ArchiveFilters = { ...filters };
  for (const key of Object.keys(chip.patch) as (keyof ArchiveFilters)[]) {
    next[key] = null as never;
  }
  if (!on) Object.assign(next, chip.patch);
  return next;
}

/* ── the current scope, in words ──────────────────────────────────────────
 *
 * Chips can be set from three places now — the rail, the quick strip, and a
 * team or competition inside a row — and a control the reader never opened
 * cannot tell them what it is holding. This is the one place that says what
 * the archive is currently narrowed to, and every entry removes itself.
 *
 * Ids are resolved to names through the facets, which is the only thing that
 * knows that `100205573495116443` is Gen.G. An id the facets do not carry is
 * shown verbatim rather than dropped: a hand-edited URL that narrows the page
 * must still be visible and removable.
 */
export type ScopeChip = {
  /** The filter field this chip owns, so removing it clears exactly that. */
  field: keyof ArchiveFilters;
  kind: string;
  value: string;
};

export function describeScope(
  filters: ArchiveFilters,
  facets:
    | {
        leagues: { slug: string; name: string }[];
        tournaments: { id: string; name: string | null; league_slug: string | null }[];
        teams: { id: string; name: string | null; code: string | null }[];
      }
    | undefined,
): ScopeChip[] {
  const chips: ScopeChip[] = [];
  const push = (field: keyof ArchiveFilters, kind: string, value: string | null | undefined) => {
    if (value) chips.push({ field, kind, value });
  };

  if (filters.league) {
    const l = facets?.leagues?.find((x) => x.slug === filters.league);
    push("league", "League", l?.name || filters.league);
  }
  if (filters.tournament) {
    const t = facets?.tournaments?.find((x) => x.id === filters.tournament);
    push("tournament", "Tournament", t?.name || filters.tournament);
  }
  if (filters.team) {
    const t = facets?.teams?.find((x) => x.id === filters.team);
    push("team", "Team", t?.name || t?.code || filters.team);
  }
  push("date_from", "From", filters.date_from);
  push("date_to", "To", filters.date_to);
  if (filters.depth === "full") push("depth", "Telemetry", "Full timeline");
  if (filters.status) {
    push("status", "Status", filters.status === "final" ? "Finished" : "Not finished");
  }
  return chips;
}
