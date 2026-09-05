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
 */
import { useCallback, useMemo } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Library,
  RefreshCw,
  Search,
  WifiOff,
} from "lucide-react";

import SEOHead from "@/components/SEOHead";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  PRO_PLAY_LIVE_ROUTE,
  PRO_PLAY_ROUTE,
  proPlayLiveGameUrl,
} from "@/lib/pro-play/routes";

import {
  DEPTH_LABEL,
  DEPTH_TITLE,
  DEPTH_TONE,
  EMPTY_FILTERS,
  asSummary,
  countActiveFilters,
  filtersFromParams,
  filtersToParams,
  hasAnyFilter,
  tournamentsForLeague,
} from "./archive";
import { competitionLine, matchDate, matchDateTitle, patchLabel, seriesContext, teamLabel } from "./lib";

const PAGE_SIZE = 24;
/** The Select primitive cannot hold an empty value, so "no filter" needs a
 *  sentinel that is not a legal league slug, tournament id or team id. */
const ANY = "__any__";

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

  const open = useCallback(
    (gameId: string) => navigate(proPlayLiveGameUrl(gameId)),
    [navigate],
  );

  const leagues = facets.data?.leagues ?? [];
  const teams = facets.data?.teams ?? [];
  const tournaments = tournamentsForLeague(
    facets.data?.tournaments ?? [],
    filters.league ?? null,
  );

  const games = page.data?.games ?? [];
  const total = page.data?.total ?? 0;
  const active = countActiveFilters(filters);

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

      {/* ── filter rail ─────────────────────────────────────────────────────
          One column on mobile so every control is full-width and tappable,
          two from sm, four from lg. */}
      <Card className="mb-4 p-3 sm:p-4">
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
        <ul className="space-y-2">
          {games.map((g) => (
            <ArchiveRow key={g.game_id} game={g} onOpen={open} />
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

/**
 * One browsable match.
 *
 * A button rather than a link-shaped div so it is reachable and operable from
 * the keyboard, and the whole row is the target — on a 375px screen a small
 * "open" affordance would be the hardest thing on the page to hit.
 */
export function ArchiveRow({
  game,
  onOpen,
}: {
  game: ArchiveGame;
  onOpen: (gameId: string) => void;
}) {
  const summary = asSummary(game);
  const blue = teamLabel(game.teams.blue);
  const red = teamLabel(game.teams.red);
  const date = matchDate(summary);
  const series = seriesContext(summary, true);
  const patch = patchLabel(game.patch_version);
  const competition = competitionLine(summary);
  const depth = game.telemetry.depth;

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(game.game_id)}
        className="w-full rounded-lg border bg-card px-3 py-3 text-left transition-colors hover:border-[#c9a84c]/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold">
                {/* The winning side is emphasised, never invented: the backend
                    returns null unless the stored final state proves it. */}
                <Side name={blue} won={game.winner === "blue"} />
                <span className="mx-1.5 text-xs font-normal text-muted-foreground">vs</span>
                <Side name={red} won={game.winner === "red"} />
              </span>
              {(game.teams.blue.kills != null || game.teams.red.kills != null) && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {game.teams.blue.kills ?? "—"}–{game.teams.red.kills ?? "—"}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {competition.join(" · ") || "—"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0 sm:justify-end">
            <span
              className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${DEPTH_TONE[depth]}`}
              title={DEPTH_TITLE[depth]}
            >
              {DEPTH_LABEL[depth]}
            </span>
            {series && <Meta>{series}</Meta>}
            {patch && <Meta title={game.patch_version ?? undefined}>Patch {patch}</Meta>}
            {date && <Meta title={matchDateTitle(summary)}>{date}</Meta>}
          </div>
        </div>
      </button>
    </li>
  );
}

function Side({ name, won }: { name: string; won: boolean }) {
  return (
    <span className={won ? "text-[#c9a84c]" : undefined}>
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
