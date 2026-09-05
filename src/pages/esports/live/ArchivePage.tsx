/**
 * /lol/pro-play/live/archive — browsing every stored pro game.
 *
 * The match centre shows what is on now plus a six-game tail. That is right
 * for the live page and it left 750+ stored games, including every fully
 * recorded timeline, reachable only by knowing a game id. This is the way in.
 *
 * It is a CHOOSER, not a second viewer: a row hands its game id to the match
 * centre at `/lol/pro-play/live?game=<id>`, which renders it with the same
 * scoreboard, players, gold chart and timeline it renders everything else
 * with. There is deliberately no archive-specific renderer to drift.
 *
 * Three things shape the layout, and all three came out of reading real
 * production rows rather than from a design:
 *
 * 1. **Most rows are series.** 786 of 794 stored games share a match with at
 *    least one sibling, and the default ordering already puts them next to
 *    each other. Rendering them flat repeated one league, tournament, stage,
 *    patch and date four times per best-of-five.
 * 2. **The rich games were invisible.** 283 games carry a real timeline and
 *    the only way to ask for them was a control most readers never open.
 * 3. **Nothing in a row was clickable.** Narrowing to a team meant scrolling
 *    back to a select holding 195 of them and finding the name by eye.
 */
import { useCallback, useMemo } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Library,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  WifiOff,
  X,
} from "lucide-react";

import SEOHead from "@/components/SEOHead";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchArchive,
  fetchArchiveFacets,
  type ArchiveFilters,
  type ArchiveGame,
} from "@/lib/live-esports/api";
import {
  PRO_PLAY_LIVE_ARCHIVE_ROUTE,
  PRO_PLAY_LIVE_ROUTE,
  PRO_PLAY_ROUTE,
  proPlayLiveGameUrl,
} from "@/lib/pro-play/routes";

import {
  DEPTH_LABEL,
  DEPTH_TITLE,
  DEPTH_TONE,
  EMPTY_FILTERS,
  FEATURED_FILTERS,
  FEATURED_POOL,
  FEATURED_REASON_LABEL,
  asSummary,
  countActiveFilters,
  describeScope,
  featuredMatches,
  filtersFromParams,
  filtersToParams,
  groupIntoSeries,
  hasAnyFilter,
  isQuickFilterActive,
  isUnfinished,
  isUnplayed,
  quickFilters,
  seriesResult,
  sharedPatch,
  toggleQuickFilter,
  tournamentsForLeague,
  type FeaturedMatch,
  type QuickFilter,
  type SeriesGroup,
} from "./archive";
import {
  SERIES_SCORE_TITLE,
  competitionLine,
  matchDate,
  matchDateTitle,
  patchLabel,
  stageLabel,
  teamLabel,
} from "./lib";

const PAGE_SIZE = 24;
/** The Select primitive cannot hold an empty value, so "no filter" needs a
 *  sentinel that is not a legal league slug, tournament id or team id. */
const ANY = "__any__";

/**
 * What a row hands to the viewer so its Back link can return here.
 *
 * The archive's whole state is already in its URL, so the trip back is one
 * string. It rides in history state rather than in the viewer's own URL: a
 * shared `?game=` link is about the match, and hanging a stranger's filter
 * set off it would make two different links to the same game.
 */
export type ArchiveReturn = { archive?: string };

export default function ArchivePage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  /* Keyset pagination has no reverse cursor, so "previous" has to be
   * remembered rather than computed. The cursors already visited ride in the
   * history entry, which means Back and the Previous button agree, and a
   * refresh keeps the trail.
   *
   * On a COLD load of a shared page-3 link the trail is empty, and Previous is
   * correctly disabled — the alternative, `navigate(-1)`, would have walked the
   * reader off the site entirely, because the entry before that link is
   * whatever page they came from. */
  // Memoised for the reason `EsportsLivePage` documents on its own feed
  // arrays: a bare `?? []` allocates a fresh array every render, which defeats
  // the memo on both callbacks below.
  const trail = useMemo<(string | null)[]>(
    () => (location.state as { trail?: (string | null)[] } | null)?.trail ?? [],
    [location.state],
  );

  // Filters and the page cursor both live in the URL, so a filtered archive
  // view is a shareable link and survives a refresh, and every page is a real
  // history entry the browser's Back button already steps through.
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const cursor = params.get("cursor");

  const facets = useQuery({
    queryKey: ["live-esports", "archive", "facets"],
    queryFn: fetchArchiveFacets,
    // The set of leagues and teams in the store changes on the timescale of a
    // split, not a page view.
    staleTime: 10 * 60_000,
  });

  const page = useQuery({
    queryKey: ["live-esports", "archive", filters, cursor],
    queryFn: () => fetchArchive(filters, { cursor, limit: PAGE_SIZE }),
    // Keep the previous page on screen while the next one loads: the list does
    // not collapse to skeletons and the page does not jump under the reader.
    placeholderData: keepPreviousData,
  });

  /* The featured strip is the archive's front door, so it is asked for ONLY
   * at the front door: an unfiltered first page. Once someone is browsing a
   * team or a tournament, three unrelated matches above their results are
   * noise, and the request is not made at all. */
  const showFeatured = !hasAnyFilter(filters) && !cursor;
  const featured = useQuery({
    queryKey: ["live-esports", "archive", "featured"],
    queryFn: () => fetchArchive(FEATURED_FILTERS, { limit: FEATURED_POOL }),
    enabled: showFeatured,
    staleTime: 5 * 60_000,
  });

  const setFilters = useCallback(
    (next: ArchiveFilters) => {
      // Any filter change resets to the first page. Carrying a cursor across a
      // filter change would resume from a row that may not be in the new
      // result set at all.
      setParams(filtersToParams(next), { replace: false, state: { trail: [] } });
    },
    [setParams],
  );

  const patch = useCallback(
    (part: Partial<ArchiveFilters>) => setFilters({ ...filters, ...part }),
    [filters, setFilters],
  );

  const goNext = useCallback(
    (nextCursor: string) => {
      const p = filtersToParams(filters);
      p.set("cursor", nextCursor);
      setParams(p, { replace: false, state: { trail: [...trail, cursor] } });
    },
    [filters, setParams, trail, cursor],
  );

  const goPrevious = useCallback(() => {
    const previous = trail[trail.length - 1] ?? null;
    const p = filtersToParams(filters);
    if (previous) p.set("cursor", previous);
    setParams(p, { replace: false, state: { trail: trail.slice(0, -1) } });
  }, [filters, setParams, trail]);

  /* Opening a match carries the archive's own URL forward, so the viewer's
   * Back link returns to this exact filtered page rather than to the top of
   * an unfiltered archive. */
  const returnTo = `${PRO_PLAY_LIVE_ARCHIVE_ROUTE}${location.search}`;
  const open = useCallback(
    (gameId: string) =>
      navigate(proPlayLiveGameUrl(gameId), {
        state: { archive: returnTo } satisfies ArchiveReturn,
      }),
    [navigate, returnTo],
  );

  const leagues = facets.data?.leagues ?? [];
  const teams = facets.data?.teams ?? [];
  const tournaments = tournamentsForLeague(
    facets.data?.tournaments ?? [],
    filters.league ?? null,
  );

  const games = page.data?.games ?? [];
  const groups = useMemo(() => groupIntoSeries(games), [games]);
  const total = page.data?.total ?? 0;
  const active = countActiveFilters(filters);
  const chips = useMemo(() => quickFilters(facets.data), [facets.data]);
  const scope = useMemo(() => describeScope(filters, facets.data), [filters, facets.data]);
  const picks = useMemo(
    () => (featured.data ? featuredMatches(featured.data.games) : []),
    [featured.data],
  );

  /* ── unreachable backend ───────────────────────────────────────────────── */
  if (page.isError && !page.data) {
    return (
      <Shell>
        <Alert variant="destructive">
          <WifiOff className="h-4 w-4" />
          <AlertTitle>Can't reach the match archive</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>
              The esports service didn't respond. Nothing is broken on your side — this
              usually clears on its own.
            </span>
            <Button size="sm" variant="outline" className="w-fit" onClick={() => page.refetch()}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </Shell>
    );
  }

  return (
    <Shell>
      {page.data?.enabled === false && (
        <Alert className="mb-3">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Live tracking is paused</AlertTitle>
          <AlertDescription>
            Stored games are still browsable; nothing new is being recorded right now.
          </AlertDescription>
        </Alert>
      )}

      {/* ── featured ────────────────────────────────────────────────────── */}
      {showFeatured && picks.length > 0 && (
        <section className="mb-4" aria-labelledby="archive-featured">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-[#c9a84c]" aria-hidden="true" />
            <h2
              id="archive-featured"
              className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
            >
              Start here
            </h2>
            <span className="text-xs text-muted-foreground">
              Recent matches with a full recorded timeline
            </span>
          </div>
          {/* Three stacked cards were 405px of an 812px phone — half the
              screen before a single archive row. On mobile the strip is a
              swipeable rail one card high; from sm it is the grid it looks
              like. */}
          <ul className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
            {picks.map((pick) => (
              <FeaturedCard key={pick.game.game_id} pick={pick} onOpen={open} />
            ))}
          </ul>
        </section>
      )}

      {/* ── quick filters ───────────────────────────────────────────────────
          The strip scrolls sideways rather than wrapping to three lines on a
          375px screen; the full rail below it is the exhaustive control. */}
      <div className="-mx-3 mb-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
        <ul
          className="flex w-max items-center gap-1.5 sm:w-auto sm:flex-wrap"
          aria-label="Quick filters"
        >
          {chips.map((chip) => (
            <li key={chip.id}>
              <QuickChip
                chip={chip}
                active={isQuickFilterActive(chip, filters)}
                onToggle={() => setFilters(toggleQuickFilter(chip, filters))}
              />
            </li>
          ))}
        </ul>
      </div>

      {/* ── filter rail ─────────────────────────────────────────────────────
          Collapsed by default so the page opens on matches rather than on
          eight controls — and open whenever the URL already carries a filter,
          so a shared link shows what is narrowing it. One column on mobile so
          every control is full-width and tappable, two from sm, four from lg. */}
      <Collapsible defaultOpen={active > 0} className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="group">
              <SlidersHorizontal className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
              All filters{active ? ` (${active})` : ""}
              <ChevronDown
                className="ml-2 h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180"
                aria-hidden="true"
              />
            </Button>
          </CollapsibleTrigger>

          {/* What the archive is narrowed to right now, wherever it was set
              from — the rail, a chip, or a team inside a row. */}
          {scope.map((s) => (
            <button
              key={`${s.field}:${s.value}`}
              type="button"
              onClick={() => patch({ [s.field]: null } as Partial<ArchiveFilters>)}
              className="inline-flex max-w-[16rem] items-center gap-1 rounded-full border border-[#c9a84c]/40 bg-[#c9a84c]/10 py-1 pl-2.5 pr-1.5 text-xs text-foreground transition-colors hover:bg-[#c9a84c]/20"
            >
              <span className="text-muted-foreground">{s.kind}</span>
              <span className="truncate font-medium">{s.value}</span>
              <X className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="sr-only">Remove {s.kind} filter</span>
            </button>
          ))}

          {active > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear filters ({active})
            </Button>
          )}
        </div>

        <CollapsibleContent>
          <Card className="mt-2 p-3 sm:p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="League" htmlFor="archive-league">
                <Select
                  value={filters.league ?? ANY}
                  onValueChange={(v) =>
                    // Changing league drops a tournament that belongs to the old
                    // one, which would otherwise return an empty page.
                    patch({ league: v === ANY ? null : v, tournament: null })
                  }
                >
                  <SelectTrigger id="archive-league">
                    <SelectValue placeholder="All leagues" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>All leagues</SelectItem>
                    {leagues.map((l) => (
                      <SelectItem key={l.slug} value={l.slug}>
                        {l.name} ({l.games})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Tournament" htmlFor="archive-tournament">
                <Select
                  value={filters.tournament ?? ANY}
                  onValueChange={(v) => patch({ tournament: v === ANY ? null : v })}
                >
                  <SelectTrigger id="archive-tournament">
                    <SelectValue placeholder="All tournaments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>All tournaments</SelectItem>
                    {tournaments.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {/* Five separate tournaments are named "Summer 2026"; the
                            league is what tells them apart. */}
                        {t.name ?? t.id}
                        {!filters.league && t.league_slug ? ` — ${t.league_slug}` : ""} ({t.games})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Team" htmlFor="archive-team">
                <Select
                  value={filters.team ?? ANY}
                  onValueChange={(v) => patch({ team: v === ANY ? null : v })}
                >
                  <SelectTrigger id="archive-team">
                    <SelectValue placeholder="All teams" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value={ANY}>All teams</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name ?? t.id} ({t.games})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Telemetry" htmlFor="archive-depth">
                <Select
                  value={filters.depth ?? ANY}
                  onValueChange={(v) => patch({ depth: v === ANY ? null : "full" })}
                >
                  <SelectTrigger id="archive-depth">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Sparse games are never hidden by default. Recorded
                        timelines are the rarer, richer thing, so finding them is
                        offered — but only as an explicit choice. */}
                    <SelectItem value={ANY}>Any telemetry</SelectItem>
                    <SelectItem value="full">Full timeline only</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="From" htmlFor="archive-from">
                <Input
                  id="archive-from"
                  type="date"
                  value={filters.date_from ?? ""}
                  min={facets.data?.date_range?.from ?? undefined}
                  max={facets.data?.date_range?.to ?? undefined}
                  onChange={(e) => patch({ date_from: e.target.value || null })}
                />
              </Field>

              <Field label="To" htmlFor="archive-to">
                <Input
                  id="archive-to"
                  type="date"
                  value={filters.date_to ?? ""}
                  min={facets.data?.date_range?.from ?? undefined}
                  max={facets.data?.date_range?.to ?? undefined}
                  onChange={(e) => patch({ date_to: e.target.value || null })}
                />
              </Field>

              <Field label="Status" htmlFor="archive-status">
                <Select
                  value={filters.status ?? ANY}
                  onValueChange={(v) =>
                    patch({ status: v === ANY ? null : (v as "final" | "unfinished") })
                  }
                >
                  <SelectTrigger id="archive-status">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>Any status</SelectItem>
                    <SelectItem value="final">Finished</SelectItem>
                    <SelectItem value="unfinished">Not finished</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <div className="flex items-end">
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={!hasAnyFilter(filters)}
                  onClick={() => setFilters(EMPTY_FILTERS)}
                >
                  Clear filters{active ? ` (${active})` : ""}
                </Button>
              </div>
            </div>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* ── result count ────────────────────────────────────────────────── */}
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {page.isLoading && !page.data ? (
            "Loading matches…"
          ) : (
            <>
              <span className="font-semibold text-foreground">{total.toLocaleString()}</span>{" "}
              {total === 1 ? "match" : "matches"}
              {active > 0 ? " matching your filters" : " stored"}
            </>
          )}
        </p>
        {page.isFetching && page.data && (
          <span className="text-xs text-muted-foreground">Updating…</span>
        )}
      </div>

      {/* ── list ────────────────────────────────────────────────────────── */}
      {page.isLoading && !page.data ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] w-full sm:h-[72px]" />
          ))}
        </div>
      ) : games.length === 0 ? (
        <Card className="p-8 text-center">
          <Search className="mx-auto mb-3 h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-base font-semibold">No matches found</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {hasAnyFilter(filters)
              ? "No stored game matches every filter you've set. Try widening the date range or clearing a filter."
              : "No pro games have been stored yet. They appear here as the live feed records them."}
          </p>
          {hasAnyFilter(filters) && (
            <Button variant="outline" className="mt-4" onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear filters
            </Button>
          )}
        </Card>
      ) : (
        <ul className="space-y-3">
          {groups.map((group) => (
            <SeriesBlock
              key={group.key}
              group={group}
              onOpen={open}
              onScope={patch}
              scopedTeam={filters.team ?? null}
            />
          ))}
        </ul>
      )}

      {/* ── pagination ──────────────────────────────────────────────────── */}
      {(cursor || page.data?.next_cursor) && (
        <nav
          className="mt-4 flex items-center justify-between gap-2"
          aria-label="Archive pages"
        >
          <Button
            variant="outline"
            size="sm"
            disabled={trail.length === 0}
            onClick={goPrevious}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!page.data?.next_cursor}
            onClick={() => goNext(page.data?.next_cursor as string)}
          >
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </nav>
      )}
    </Shell>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <Label
        htmlFor={htmlFor}
        className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </Label>
      {children}
    </div>
  );
}

function QuickChip({
  chip,
  active,
  onToggle,
}: {
  chip: QuickFilter;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-[#c9a84c] bg-[#c9a84c]/15 text-[#c9a84c]"
          : "border-border bg-card text-muted-foreground hover:border-[#c9a84c]/40 hover:text-foreground"
      }`}
    >
      {chip.label}
      {chip.count != null && (
        <span className="ml-1.5 tabular-nums opacity-60">{chip.count}</span>
      )}
    </button>
  );
}

/**
 * One featured match.
 *
 * It says why it is here. "Series decider" is a derived fact — the frozen
 * series score plus this game's own winner reaching the best-of's threshold —
 * and putting it on the card is what stops the strip from reading as an
 * unexplained editorial pick.
 */
export function FeaturedCard({
  pick,
  onOpen,
}: {
  pick: FeaturedMatch;
  onOpen: (gameId: string) => void;
}) {
  const { game, result } = pick;
  const summary = asSummary(game);
  const blue = teamLabel(game.teams.blue);
  const red = teamLabel(game.teams.red);
  const stage = stageLabel(summary.competition);
  const date = matchDate(summary);

  return (
    <li className="w-64 shrink-0 sm:w-auto sm:shrink">
      <button
        type="button"
        onClick={() => onOpen(game.game_id)}
        className="flex h-full w-full flex-col rounded-lg border border-[#c9a84c]/25 bg-gradient-to-b from-[#c9a84c]/[0.07] to-transparent px-3 py-3 text-left transition-colors hover:border-[#c9a84c]/50 hover:from-[#c9a84c]/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[#c9a84c]">
          {FEATURED_REASON_LABEL[pick.reason]}
        </span>
        <span className="mt-1 flex flex-wrap items-baseline gap-x-2 text-base font-semibold">
          <span className={result?.winner === "blue" ? "text-[#c9a84c]" : undefined}>{blue}</span>
          {result ? (
            <span className="tabular-nums text-muted-foreground">
              {result.blue}–{result.red}
            </span>
          ) : (
            <span className="text-xs font-normal text-muted-foreground">vs</span>
          )}
          <span className={result?.winner === "red" ? "text-[#c9a84c]" : undefined}>{red}</span>
        </span>
        <span className="mt-0.5 truncate text-xs text-muted-foreground">
          {[game.league?.name || game.league?.slug, stage].filter(Boolean).join(" · ") || "—"}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
          {result && <Meta>Bo{result.bestOf}</Meta>}
          {date && <Meta title={matchDateTitle(summary)}>{date}</Meta>}
        </span>
      </button>
    </li>
  );
}

/**
 * A series, or a lone game.
 *
 * The shared facts — the two teams, the competition, the date, the patch and
 * the result if the store proves one — are stated once in a header, and each
 * game underneath carries only what differs: its number, its winner, its
 * kills and what the viewer will be able to render. That is the whole reason
 * for the grouping: a best-of-five stopped being four rows that look alike.
 *
 * The header is NOT the clickable target. Teams and competitions in it are
 * their own buttons — nesting a button inside a button is invalid and breaks
 * the keyboard — so opening a match is always a game row, and narrowing the
 * archive is always the header.
 */
export function SeriesBlock({
  group,
  onOpen,
  onScope,
  scopedTeam,
}: {
  group: SeriesGroup;
  onOpen: (gameId: string) => void;
  onScope: (part: Partial<ArchiveFilters>) => void;
  scopedTeam?: string | null;
}) {
  const lead = group.lead;
  const summary = asSummary(lead);
  const result = seriesResult(group);
  const seriesPatch = sharedPatch(group);
  const patch = patchLabel(seriesPatch);
  const date = matchDate(summary);
  const competition = competitionLine(summary);
  const stage = stageLabel(summary.competition);
  const multi = group.games.length > 1;

  return (
    <li
      className="overflow-hidden rounded-lg border bg-card"
      data-testid={`series-${group.key}`}
    >
      {/* ── shared header ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5 border-b bg-muted/20 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="flex flex-wrap items-baseline gap-x-1.5 text-sm font-semibold">
              <TeamChip
                team={lead.teams.blue}
                won={result?.winner === "blue"}
                scoped={scopedTeam != null && scopedTeam === lead.teams.blue.esports_team_id}
                onScope={onScope}
              />
              {result ? (
                <span
                  className="tabular-nums text-muted-foreground"
                  title="Series score — the score this game was played at, plus its own result"
                >
                  {result.blue}–{result.red}
                </span>
              ) : (
                <span className="text-xs font-normal text-muted-foreground">vs</span>
              )}
              <TeamChip
                team={lead.teams.red}
                won={result?.winner === "red"}
                scoped={scopedTeam != null && scopedTeam === lead.teams.red.esports_team_id}
                onScope={onScope}
              />
            </span>
            {lead.best_of != null && lead.best_of > 1 && (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Bo{lead.best_of}
                {/* Only a claim about what is on screen. A series split across
                    a page boundary says two games, and means it. */}
                {multi ? ` · ${group.games.length} games` : ""}
              </span>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
            {competition.length === 0 ? (
              <span>—</span>
            ) : (
              <>
                {lead.league?.slug && (
                  <ScopeLink
                    onClick={() =>
                      onScope({ league: lead.league?.slug ?? null, tournament: null })
                    }
                    title={`Show every stored ${lead.league.name || lead.league.slug} game`}
                  >
                    {lead.league.name || lead.league.slug}
                  </ScopeLink>
                )}
                {lead.tournament?.id && lead.tournament?.name && (
                  <>
                    <Dot />
                    <ScopeLink
                      onClick={() =>
                        onScope({
                          // A tournament belongs to one league, so scoping to
                          // it scopes the league too — otherwise the rail
                          // would still offer tournaments from everywhere else.
                          league: lead.league?.slug ?? null,
                          tournament: lead.tournament?.id ?? null,
                        })
                      }
                      title={`Show every stored ${lead.tournament.name} game`}
                    >
                      {lead.tournament.name}
                    </ScopeLink>
                  </>
                )}
                {stage && (
                  <>
                    <Dot />
                    <span className="truncate">{stage}</span>
                  </>
                )}
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
          {patch && <Meta title={seriesPatch ?? undefined}>Patch {patch}</Meta>}
          {date && <Meta title={matchDateTitle(summary)}>{date}</Meta>}
        </div>
      </div>

      {/* ── the games ──────────────────────────────────────────────────── */}
      <ul>
        {group.games.map((game) => (
          <GameRow
            key={game.game_id}
            game={game}
            onOpen={onOpen}
            /* Anything hoisted into the header is not repeated on the rows
             * below it, and the two are decided separately: an unfinished
             * game has no patch to hoist but still has a date, and tying
             * them together printed that date twice. */
            showOwnPatch={!patch}
            showOwnDate={!date}
            numbered={multi || (game.game_number ?? 0) > 1}
          />
        ))}
      </ul>
    </li>
  );
}

/**
 * One game inside a series.
 *
 * The whole row is the target — on a 375px screen a small "open" affordance
 * would be the hardest thing on the page to hit — and it is a real button so
 * it is reachable and operable from the keyboard.
 */
function GameRow({
  game,
  onOpen,
  showOwnPatch,
  showOwnDate,
  numbered,
}: {
  game: ArchiveGame;
  onOpen: (gameId: string) => void;
  showOwnPatch: boolean;
  showOwnDate: boolean;
  numbered: boolean;
}) {
  const summary = asSummary(game);
  const blue = teamLabel(game.teams.blue);
  const red = teamLabel(game.teams.red);
  const depth = game.telemetry.depth;
  const unplayed = isUnplayed(game);
  const unfinished = isUnfinished(game);
  const patch = patchLabel(game.patch_version);
  const date = matchDate(summary);
  const bw = game.teams.blue?.series_wins;
  const rw = game.teams.red?.series_wins;

  return (
    <li className="border-t first:border-t-0">
      <button
        type="button"
        onClick={() => onOpen(game.game_id)}
        className="flex w-full flex-col gap-1.5 px-3 py-2 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between"
      >
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {numbered && game.game_number != null && (
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Game {game.game_number}
            </span>
          )}
          <span className="text-sm">
            {/* The winning side is emphasised, never invented: the backend
                returns null unless the stored final state proves it. */}
            <Side name={blue} won={game.winner === "blue"} />
            <span className="mx-1.5 text-xs text-muted-foreground">vs</span>
            <Side name={red} won={game.winner === "red"} />
          </span>
          {(game.teams.blue.kills != null || game.teams.red.kills != null) && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {game.teams.blue.kills ?? "—"}–{game.teams.red.kills ?? "—"}
            </span>
          )}
          {numbered && bw != null && rw != null && (
            <span
              className="text-[10px] tabular-nums text-muted-foreground/70"
              title={SERIES_SCORE_TITLE}
            >
              at {bw}–{rw}
            </span>
          )}
        </span>

        <span className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
          {unplayed ? (
            /* Riot creates every slot of a best-of up front, so a 2–0 series
               leaves a game 3 row behind. It is an absence, not a thin
               recording, and "No telemetry" said the wrong thing about it. */
            <span
              className="rounded border border-dashed border-border bg-transparent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
              title="Scheduled as part of the series with no stored result — it may never have been played"
            >
              Not played
            </span>
          ) : (
            <>
              {/* A game with no final result yet. Never "LIVE": the upstream
                  label is not evidence a match is still being played, and the
                  archive holds no freshness clock to check it against. */}
              {unfinished && (
                <span
                  className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400"
                  title="No final result stored yet — it may still be being played, or the feed may have stopped before the end"
                >
                  Not final
                </span>
              )}
              {/* "Not final · No telemetry" is one fact said twice, and the
                  depth labels are worded as promises about a game that is
                  over. A match that has only just started keeps the honest
                  half. */}
              {!(unfinished && depth === "none") && (
                <span
                  className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${DEPTH_TONE[depth]}`}
                  title={DEPTH_TITLE[depth]}
                >
                  {DEPTH_LABEL[depth]}
                </span>
              )}
            </>
          )}
          {showOwnPatch && patch && (
            <Meta title={game.patch_version ?? undefined}>Patch {patch}</Meta>
          )}
          {showOwnDate && date && <Meta title={matchDateTitle(summary)}>{date}</Meta>}
        </span>
      </button>
    </li>
  );
}

/** A team name that narrows the archive to that team. */
function TeamChip({
  team,
  won,
  scoped,
  onScope,
}: {
  team: ArchiveGame["teams"]["blue"];
  won: boolean;
  scoped: boolean;
  onScope: (part: Partial<ArchiveFilters>) => void;
}) {
  const label = teamLabel(team);
  const id = team?.esports_team_id ?? null;
  const full = team?.name || label;
  // No id, no filter — the archive matches team ids exactly, and there is
  // nothing to send. It stays plain text rather than becoming a dead control.
  if (!id) {
    return (
      <span className={won ? "text-[#c9a84c]" : undefined}>
        {label}
        {won && <span className="sr-only"> (winner)</span>}
      </span>
    );
  }
  /* The visible label is a three-letter code, which is not a control anyone
   * could act on by ear — so the accessible name says what the button DOES
   * and which team it is, and carries the win as a word rather than colour. */
  const action = scoped ? `Stop filtering by ${full}` : `Show every stored ${full} game`;
  return (
    <button
      type="button"
      // Exact ids, never a name: "T1" and "SK Telecom T1" are separate rows
      // upstream and the archive keeps them separate.
      onClick={() => onScope({ team: scoped ? null : id })}
      aria-label={won ? `${action} — winner` : action}
      aria-pressed={scoped}
      title={action}
      /* -mx/-my cancel the padding in the layout, so the hit area grows from
         ~28x20 to ~44x36 on a phone without moving a pixel of the line. */
      className={`-mx-1 -my-2 rounded px-1 py-2 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        won ? "text-[#c9a84c]" : ""
      } ${scoped ? "underline decoration-[#c9a84c] decoration-2" : ""}`}
    >
      {label}
    </button>
  );
}

function ScopeLink({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // "LEC" alone does not say that activating it narrows the archive.
      aria-label={title}
      title={title}
      className="-mx-1 -my-2 max-w-[14rem] truncate rounded px-1 py-2 underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

function Dot() {
  return <span aria-hidden="true">·</span>;
}

function Side({ name, won }: { name: string; won: boolean }) {
  return (
    <span className={won ? "font-semibold text-[#c9a84c]" : undefined}>
      {name}
      {won && <span className="sr-only"> (winner)</span>}
    </span>
  );
}

function Meta({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span
      className="whitespace-nowrap rounded border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
      title={title}
    >
      {children}
    </span>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
      <SEOHead
        title="Pro Match Archive | Mogzy"
        description="Browse every stored professional League of Legends game — filter by league, tournament, team and date, then open any match in the match centre."
        path="/lol/pro-play/live/archive"
      />
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link
          to={PRO_PLAY_LIVE_ROUTE}
          className="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Live &amp; recent
        </Link>
        <Link
          to={PRO_PLAY_ROUTE}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          Pro Play
        </Link>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#c9a84c]/30 bg-[#c9a84c]/10"
          aria-hidden="true"
        >
          <Library className="h-4 w-4 text-[#c9a84c]" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Pro Play
          </p>
          <h1 className="text-xl font-bold sm:text-2xl">Match Archive</h1>
        </div>
      </div>
      {children}
    </main>
  );
}
