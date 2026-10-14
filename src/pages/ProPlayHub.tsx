import { useEffect, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Trophy } from "lucide-react";

import SEOHead from "@/components/SEOHead";
import MatchCenter, { type NextNotice } from "@/components/pro-play/hub/MatchCenter";
import MatchWorkspace from "@/components/pro-play/hub/MatchWorkspace";
import ProPlayDiscovery, { SearchEntry } from "@/components/pro-play/hub/ProPlayDiscovery";
import TournamentSpotlight from "@/components/pro-play/hub/TournamentSpotlight";
import { ProPlayMediaProvider } from "@/components/pro-play/media/ProPlayMediaProvider";
import { useChampionAssets } from "@/hooks/useChampionAssets";
import { fetchLiveGame } from "@/lib/live-esports/api";
import { FINAL_POLL_MS, useLiveFeed, useLiveMatch, useSchedule } from "@/lib/live-esports/hooks";
import { gamesNeedingResult, groupSeries, railUpcoming, type GameRecord } from "@/lib/pro-play/hubSeries";
import { nextWorldsFixture } from "@/lib/pro-play/worlds";
import { featuredTournament } from "@/lib/pro-play/featuredTournament";
import {
  FIXTURE_CONTEXT_IDS,
  fixtureFeedGame,
  resolveExplicitFixture,
  tournamentFixtureView,
} from "@/lib/pro-play/explicitFixture";
import { tournamentQuery } from "@/lib/pro-play/tournamentApi";
import { lanePlayerKey, nextHubAutoPick, samePick, type HubPick } from "@/lib/pro-play/hubSelection";
import {
  PRO_PLAY_LIVE_GAME_PARAM,
  PRO_PLAY_ROUTE,
  PRO_PLAY_STATS_ROUTE,
  proStatsRedirect,
} from "@/lib/pro-play/routes";

/**
 * Pro Play hub — the landing page behind the academy hub's Pro Play book.
 *
 * MATCH-CENTRED (PPH1, composed for density in PPH2.1). A slim header —
 * back, the area's name, search — and then one selected game drives the page:
 *
 * 1. **Match Center** — one board: the live game if one is on, otherwise the
 *    latest finished one; a rail to switch; the score; objectives and gold.
 * 2. **Match Workspace** — inside that board: the ten players as five mirrored
 *    lane rows. A row opens in place with THIS GAME's facts for both players
 *    and a labelled "Go deeper" way out to wider scopes.
 * 3. **Explore** — BELOW the board, under its own heading, match-independent:
 *    featured graphs, the Pro Stats table's entry and the full tools.
 *
 * PP-IA2 — THE SELECTED GAME OWNS THE FIRST SCREEN. Discovery used to sit in
 * a column beside the board, where all-time prompts (Faker, T1) and a
 * calendar-year "Most games" leaderboard read as context for the LCS final
 * on screen. It now sits below, labelled as not about this match, and the
 * leaderboard glimpse is gone (the table lives at `/lol/pro-play/stats`).
 * The Pro Stats table itself moved to that route: a hub URL carrying its
 * query keys (`?view=…&player=…`, every older "View in Pro Stats" link and
 * shared table URL) is redirected there with those keys intact.
 *
 * PPH3: the rail is per SERIES in three labelled groups — LIVE NOW,
 * PREVIOUS MATCH, UP NEXT — and every match carries an unmistakable LIVE /
 * COMPLETED / UPCOMING state. UP NEXT is upstream's schedule
 * (`/api/live-esports/upcoming`), never the store's `scheduled` rows, which
 * are past unplayed games. `?next=<match_id>` selects an upcoming match the
 * way `?game=` selects a played one.
 *
 * PW1 — WORLDS LEADS THE AUTOMATIC SELECTION (`hubSelection.pickHubSelection`):
 * a live Worlds game, else the most recently completed one, else the next
 * officially scheduled Worlds match (TBD sides shown as TBD) — and only
 * without any of those does the page fall back to the live/latest rule. The
 * automatic pick is never written to the URL; `?game=` / `?next=` stay the
 * only explicit choices and still win; choosing a fixture clears `?game=` and
 * choosing a game clears `?next=`. A `?next=` whose match has since started
 * follows that match into its games rather than expiring, and one the
 * schedule cannot produce (slow, unavailable, gone) is said so — an
 * unrelated match is never shown in its place (PW1-A).
 *
 * HUB-NEXT1: the schedule reads are bounded, so a `?next=` they do not list is
 * looked up in the configured events' tournament schedules and, when found,
 * shown from there (`explicitFixture.ts`); otherwise the board says the match
 * can't be confirmed. Either way the link's match keeps the board.
 *
 * Nothing on the hub is a placeholder. No match-specific quiz: the quiz API
 * cannot filter by match.
 *
 * Any gate lives at the DESTINATION, never here. NOT to be confused with
 * /lol/premium, the paid-subscription page.
 */

// Route identity lives in `@/lib/pro-play/routes` so the router can import it
// without pulling this page into the main bundle. Re-exported here because
// this module was their original home and several call sites import from it.
export {
  LEGACY_ESPORTS_LIVE_ROUTE,
  PRO_PLAY_GRAPHS_ROUTE,
  PRO_PLAY_LIVE_ROUTE,
  PRO_PLAY_MATCHUP_ROUTE,
  PRO_PLAY_QUIZ_ROUTE,
  PRO_PLAY_ROUTE,
  PRO_PLAY_SEARCH_ROUTE,
} from "@/lib/pro-play/routes";

/** Selects an upcoming match (its upstream `match_id`) instead of a game. */
export const PRO_PLAY_NEXT_PARAM = "next";

/** The schedule is a second request behind the feed. The automatic pick waits
 *  for it this long, so a Worlds fixture is not preceded by a flash of the
 *  unrelated match it replaces; past this the page shows what it has. */
const SCHEDULE_SETTLE_MS = 2500;

function useElapsed(ms: number) {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setElapsed(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return elapsed;
}

/** Wall clock, refreshed each minute: fixture staleness is judged against it. */
function useMinuteNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function ProPlayHub() {
  const [params] = useSearchParams();
  // A hub URL carrying the Stats Explorer's keys came from a "View in Pro
  // Stats" link or a shared table: the table has its own route now.
  const statsTarget = proStatsRedirect(params);
  if (statsTarget) return <Navigate to={statsTarget} replace />;
  return <ProPlayHubPage />;
}

function ProPlayHubPage() {
  const [params, setParams] = useSearchParams();

  /* Selection, the match centre's way: `?game=` / `?next=` are EXPLICIT
   * choices and are never overridden; `auto` is the hub following the action
   * when nobody has chosen — Worlds first (PW1), then live, then a FINISHED
   * game. It is remembered (for stickiness) but never written to the URL. */
  const pinnedId = params.get(PRO_PLAY_LIVE_GAME_PARAM);
  const nextId = params.get(PRO_PLAY_NEXT_PARAM);
  const feed = useLiveFeed();
  const { live, recent, selectable } = feed;
  const schedule = useSchedule();
  const allUpcoming = schedule.matches;
  const now = useMinuteNow();
  // The featured event follows the event calendar, re-read each minute so an
  // open hub crosses midnight in Los Angeles without a reload.
  const featured = featuredTournament(now);
  const scheduleWaited = useElapsed(SCHEDULE_SETTLE_MS);

  /* An explicit `?next=` is an upcoming match. While it is upcoming the board
   * shows it. Once it has started its games are in the feed under the same
   * `match_id`: follow it into the live game, else its latest. */
  const explicitUpcoming = nextId ? (allUpcoming.find((m) => m.match_id === nextId) ?? null) : null;
  const roughSeries = useMemo(() => groupSeries(live, recent), [live, recent]);
  const seriesGameId =
    nextId && !explicitUpcoming ? (roughSeries.find((s) => s.key === nextId)?.focus.game_id ?? null) : null;

  /* HUB-NEXT1 — the schedule reads are BOUNDED (the next 12 within 14 days),
   * so a fixture they do not list may simply be further away: the Worlds
   * Final a month out. Such a link is looked up in the configured events'
   * own tournament schedules (`explicitFixture.ts`) — every configured event,
   * not just today's featured one, so a Worlds link works while DCGI is
   * featured. Only for an explicit link neither schedule read nor the feed
   * holds, once the schedule has answered (or the bounded wait is over): an
   * ordinary visit asks for nothing more. The featured event's read is the
   * pill's cache entry, so it costs nothing extra. */
  const lookupWanted = !!nextId && !explicitUpcoming && !seriesGameId && (!schedule.isPending || scheduleWaited);
  const fixtureReads = useQueries({
    queries: FIXTURE_CONTEXT_IDS.map((id) => ({ ...tournamentQuery(id), enabled: lookupWanted })),
  });
  const fixtureKey = fixtureReads.map((r) => `${r.dataUpdatedAt}:${r.errorUpdatedAt}:${r.status}`).join(",");
  const resolution = useMemo(
    () =>
      lookupWanted && nextId
        ? resolveExplicitFixture(
            nextId,
            fixtureReads.map((r, i) => ({
              contextId: FIXTURE_CONTEXT_IDS[i],
              data: r.data,
              error: r.error,
              isPending: r.isPending,
            })),
          )
        : null,
    // `fixtureReads` is a new array every render; `fixtureKey` is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lookupWanted, nextId, fixtureKey],
  );
  const found = resolution?.kind === "found" ? resolution : null;
  // A fixture the tournament marks started continues as its feed game, by the
  // backend's own game ids for the match.
  const fixtureGameId = found ? fixtureFeedGame(found.match, live, recent) : null;
  const followedGameId = seriesGameId ?? fixtureGameId;
  const tournamentFixture = useMemo(
    () => (found && !fixtureGameId ? tournamentFixtureView(found) : null),
    [found, fixtureGameId],
  );
  // `?next=` is the later, more specific choice when a URL carries both
  // (selecting a fixture clears `?game=`; an older link may still hold both):
  // a `?game=` pin never stands in for the fixture the link names.
  const explicitGameId = nextId ? followedGameId : pinnedId;

  /* An explicit fixture nothing can produce (yet). Within the bound the
   * loading frame holds; past it the board says so — it NEVER shows an
   * unrelated match as though it were the one in the link:
   *  - slow: the schedule or the tournament lookup has not answered in time;
   *  - unavailable: a read failed, so the fixture cannot be checked;
   *  - unverified: every read answered and none lists it. The sources are
   *    bounded or may be partial, so this is "can't be confirmed", never proof
   *    the match was removed.
   * Pending means EITHER schedule read (all upcoming / Worlds-filtered, PW1-C)
   * is pending: one answering is never enough. */
  const waitingOnNext = !!nextId && !explicitUpcoming && !followedGameId && !tournamentFixture;
  const lookupPending = !resolution || resolution.kind === "pending";
  const nextNotice: NextNotice | null = !waitingOnNext
    ? null
    : schedule.isPending || lookupPending
      ? scheduleWaited
        ? "slow"
        : null
      : schedule.unusable || resolution?.kind === "unavailable"
        ? "unavailable"
        : "unverified";
  const nextPartial = resolution?.kind === "not_found" && resolution.partial;
  // Still resolving an explicit fixture: the loading frame, never another match.
  const nextLoading = waitingOnNext && nextNotice === null;

  // The feed lands before the schedule: hold the pick (the automatic one, or
  // an explicit fixture's) until the schedule has answered, or for a bounded
  // wait. A game-only link never waits; neither does a followed match.
  const gameOnly = !!pinnedId && !nextId;
  // No need to wait on the second read once a Worlds fixture is already known.
  const worldsKnown = nextWorldsFixture(allUpcoming, now) !== null;
  const settling = !gameOnly && schedule.isPending && !scheduleWaited && !followedGameId && !worldsKnown;

  /* Selection, the match centre's way: `?game=` / `?next=` are EXPLICIT
   * choices and are never overridden; `auto` is the hub following the action
   * when nobody has chosen — Worlds first (PW1), then live, then a FINISHED
   * game. It is remembered (for stickiness) but never written to the URL. */
  const [auto, setAuto] = useState<HubPick | null>(null);
  const nextAuto = settling ? auto : nextHubAutoPick(auto, live, recent, allUpcoming, now);
  if (!samePick(nextAuto, auto)) setAuto(nextAuto);

  // The automatic pick only ever fills a board nobody has chosen for.
  const explicit = !!nextId || !!pinnedId;
  const autoGameId = !explicit && nextAuto?.kind === "game" ? nextAuto.id : null;
  const autoUpcoming =
    !explicit && nextAuto?.kind === "upcoming" ? (allUpcoming.find((m) => m.match_id === nextAuto.id) ?? null) : null;
  // The board's upcoming match: an explicit `?next=`, else the automatic
  // Worlds fixture. A fixture beyond the schedule reads is `tournamentFixture`.
  const upcomingMatch = explicitUpcoming ?? autoUpcoming;

  const selectedId = explicitGameId ?? (upcomingMatch ? null : autoGameId);
  const match = useLiveMatch(
    selectedId,
    selectable.find((g) => g.game_id === selectedId),
  );
  const { data: manifest } = useChampionAssets();
  const upcoming = useMemo(() => railUpcoming(allUpcoming), [allUpcoming]);

  /* Series: each series' last game's detail carries the series record
   * (PP-IA2) — every game's official result and the completed final score —
   * under the SAME query key the board uses, so the selected game costs
   * nothing extra, and a finished game is fetched once and never polled. */
  const resultIds = useMemo(() => gamesNeedingResult(roughSeries), [roughSeries]);
  const results = useQueries({
    queries: resultIds.map((id) => ({
      queryKey: ["live-esports", "game", id],
      queryFn: () => fetchLiveGame(id),
      refetchInterval: FINAL_POLL_MS,
    })),
  });
  const resultKey = results.map((r) => (r.data ? r.dataUpdatedAt : 0)).join(",");
  const series = useMemo(() => {
    const records: Record<string, GameRecord> = {};
    resultIds.forEach((id, i) => {
      const data = results[i]?.data;
      if (data) records[id] = data;
    });
    return groupSeries(live, recent, records);
    // `results` is a new array every render; `resultKey` is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, recent, resultIds, resultKey]);

  // Picking a match writes the URL — the copyable address is what is shown.
  const select = (gameId: string) => {
    const next = new URLSearchParams(params);
    next.set(PRO_PLAY_LIVE_GAME_PARAM, gameId);
    next.delete(PRO_PLAY_NEXT_PARAM);
    setParams(next, { replace: true });
  };
  const selectUpcoming = (matchId: string) => {
    const next = new URLSearchParams(params);
    next.set(PRO_PLAY_NEXT_PARAM, matchId);
    // One explicit choice at a time: a previous `?game=` pin must not be left
    // behind to take the board back when this fixture starts and leaves
    // `/upcoming` (the inverse is `select`, which clears `?next=`).
    next.delete(PRO_PLAY_LIVE_GAME_PARAM);
    setParams(next, { replace: true });
  };
  const clearPin = () => {
    const next = new URLSearchParams(params);
    next.delete(PRO_PLAY_LIVE_GAME_PARAM);
    next.delete(PRO_PLAY_NEXT_PARAM);
    setParams(next, { replace: true });
  };

  const selected = match.selected;

  // Every entity the screen draws, in ONE media request: the rail's teams,
  // the selected game's teams and its ten players' portraits.
  const mediaTeams = useMemo(
    () => [
      ...series.flatMap((x) => [x.a.team.resolved_page, x.b.team.resolved_page]),
      ...upcoming.flatMap((m) => [m.teams.a.resolved_page, m.teams.b.resolved_page]),
      upcomingMatch?.teams.a.resolved_page,
      upcomingMatch?.teams.b.resolved_page,
      tournamentFixture?.match.teams.a.resolved_page,
      tournamentFixture?.match.teams.b.resolved_page,
      selected?.teams.blue?.resolved_page,
      selected?.teams.red?.resolved_page,
    ],
    [series, upcoming, upcomingMatch, tournamentFixture, selected],
  );
  // Event marks for the event band and the UP NEXT rail (DCGI1): league
  // slugs resolve through the same media authority as crests.
  const mediaLeagues = useMemo(
    () => [
      ...upcoming.map((m) => m.league?.slug),
      upcomingMatch?.league?.slug,
      tournamentFixture?.match.league.slug,
      selected?.competition?.league.slug,
      selected?.league?.slug,
    ],
    [upcoming, upcomingMatch, tournamentFixture, selected],
  );
  const lanePlayers = match.players.data?.players;
  const mediaPlayers = useMemo(() => (lanePlayers ?? []).map(lanePlayerKey), [lanePlayers]);

  return (
    <div className="relative min-h-screen bg-background">
      <SEOHead
        title="Pro Play | Mogzy"
        description="Professional League of Legends — the live or latest pro match, lane-by-lane player and champion context, search, data graphs and statistics drawn from real pro match history."
        path={PRO_PLAY_ROUTE}
      />
      <div className="relative mx-auto w-full max-w-[1400px] space-y-4 px-3 pb-8 sm:px-6 lg:px-0">
        {/* Minimal header: the way back, the area's name, and search — the
            match is the page's introduction. */}
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:gap-x-5 border-b border-border/60 py-2 sm:min-h-14">
          <Link
            to="/lol"
            aria-label="Back to the Academy"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:min-h-0"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Academy
          </Link>
          <h1 className="flex items-center gap-2 text-lg font-bold tracking-wide text-[#e3c66f]">
            <Trophy className="h-4 w-4 text-[#c9a84c]" aria-hidden="true" />
            Pro Play
          </h1>
          <SearchEntry className="order-last w-full sm:order-none sm:w-auto sm:min-w-[11rem] sm:max-w-xl sm:flex-1 xl:min-w-[18rem]" />
          {/* The featured event (DCGI1) rides in this row rather than a band
              of its own, so the match stays in the first screen. It is page
              chrome, labelled "Featured" — never the selected game's event,
              which the board's own event band names. Which event is chosen
              by calendar day (PW4-B `featuredTournament`): DCGI until
              15 Oct, then Worlds, kept as an archive after it ends. */}
          <div className="ml-auto flex min-w-0 items-center gap-5">
            <TournamentSpotlight contextId={featured.event.contextId} fallback={featured.event} label="Featured" />
            <Link
              to={PRO_PLAY_STATS_ROUTE}
              className="hidden whitespace-nowrap text-sm font-medium text-muted-foreground hover:text-foreground hover:underline md:inline"
            >
              Pro Stats
            </Link>
          </div>
        </header>

        {/* The selected game is the page's one primary object: the board takes
            the full width, and nothing match-independent sits beside it. */}
        <ProPlayMediaProvider teams={mediaTeams} players={mediaPlayers} leagues={mediaLeagues}>
          <MatchCenter
            feed={feed}
            match={match}
            series={series}
            upcoming={upcoming}
            upcomingMatch={upcomingMatch}
            selectedId={selectedId}
            pinnedId={explicitGameId}
            tournamentFixture={tournamentFixture}
            selecting={settling || nextLoading}
            nextNotice={nextNotice}
            nextPartial={nextPartial}
            onRetrySchedule={() => {
              void schedule.refetch();
              fixtureReads.forEach((r) => void r.refetch());
            }}
            onSelect={select}
            onSelectUpcoming={selectUpcoming}
            onClearPin={clearPin}
            lanes={
              selected && (
                <MatchWorkspace
                  game={selected}
                  players={match.players.data?.players}
                  loading={match.players.isLoading}
                  failed={match.players.isError}
                  manifest={manifest}
                />
              )
            }
          />
        </ProPlayMediaProvider>

        <ProPlayDiscovery manifest={manifest} />
      </div>
    </div>
  );
}
