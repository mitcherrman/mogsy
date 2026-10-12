/**
 * The live match centre's data orchestration, shared.
 *
 * EXTRACTED FROM `EsportsLivePage`, NOT REWRITTEN. The polling rules below are
 * the page's own, moved verbatim so the hub's Match Center and the full match
 * centre run the same queries under the same React Query keys — one cache, one
 * set of polls, whichever surface the reader has open.
 *
 * Polling is deliberate rather than uniform. The bounded feed is cheap and
 * decides what is on, so it polls fastest; per-game reads follow the game's
 * own state and stop entirely once it is final, because a finished game's
 * numbers never change again.
 *
 * Selection is NOT in here. The match centre follows `[...live, ...recent][0]`
 * and the hub prefers a finished game over a stale one; each surface owns its
 * own rule and hands the result to `useLiveMatch`.
 */
import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { isWorldsFixture, startMs, WORLDS_LEAGUE_SLUG } from "@/lib/pro-play/worlds";
import {
  fetchGameInsights,
  fetchGoldSeries,
  fetchLiveFeed,
  fetchLiveGame,
  fetchLivePlayers,
  fetchUpcoming,
  type LiveGameSummary,
  type UpcomingMatch,
} from "./api";

export const FEED_POLL_MS = 10_000;
export const LIVE_DETAIL_POLL_MS = 10_000;
/** A finished game is immutable — poll it once, then stop. */
export const FINAL_POLL_MS = false as const;
/** Gold history changes slowly and is the largest payload; poll it lazily. */
export const GOLD_POLL_MS = 30_000;
/** Insights re-scan the same frames as the gold chart; share its cadence. */
export const INSIGHTS_POLL_MS = 30_000;
/** The backend caches the schedule page for 120 s; polling faster buys nothing. */
export const UPCOMING_POLL_MS = 120_000;

export function useLiveFeed() {
  const feed = useQuery({
    queryKey: ["live-esports", "feed"],
    queryFn: fetchLiveFeed,
    refetchInterval: FEED_POLL_MS,
    refetchOnWindowFocus: true,
  });

  // Derive from `feed.data` directly: a `?? []` fallback allocates a fresh
  // array every render, which would defeat the memo and re-run any selection
  // effect downstream on every poll tick.
  const live = useMemo<LiveGameSummary[]>(() => feed.data?.live ?? [], [feed.data]);
  const recent = useMemo<LiveGameSummary[]>(() => feed.data?.recent ?? [], [feed.data]);
  const selectable = useMemo<LiveGameSummary[]>(() => [...live, ...recent], [live, recent]);

  // An unreachable backend must never read as "no matches", and must never
  // sit on skeletons for ever either. `isError` alone is not enough: with a
  // refetchInterval the query keeps restarting, so it can stay pending
  // indefinitely against a dead service (observed). `failureCount` is set
  // from the first failure, so "we have failed" is the honest trigger.
  const failing = feed.isError || feed.failureCount > 0;

  return { feed, live, recent, selectable, failing };
}

/**
 * Everything one selected game needs.
 *
 * `feedSummary` is the game's row in the bounded feed when it has one. An
 * archived game is not in the feed, so its summary comes from its own detail
 * read — the SAME `_game_summary` shape the feed serves, which is why no
 * second fetch and no second renderer are needed for it.
 */
export function useLiveMatch(
  gameId: string | null,
  feedSummary: LiveGameSummary | null | undefined,
) {
  const detail = useQuery({
    queryKey: ["live-esports", "game", gameId],
    queryFn: () => fetchLiveGame(gameId as string),
    enabled: !!gameId,
    // The cadence reads the response rather than the caller's `selected`,
    // which this query may itself be the source of when the game came from
    // the archive. A finished game is fetched once and never polled again.
    refetchInterval: (query) =>
      query.state.data?.game?.availability === "finished"
        ? FINAL_POLL_MS
        : LIVE_DETAIL_POLL_MS,
  });
  const detailGame = detail.data?.game ?? null;

  const selected: LiveGameSummary | null =
    feedSummary ?? (detailGame && detailGame.game_id === gameId ? detailGame : null);
  const isFinal = selected?.availability === "finished";
  const detailInterval = selected
    ? isFinal
      ? FINAL_POLL_MS
      : LIVE_DETAIL_POLL_MS
    : (false as const);

  const players = useQuery({
    queryKey: ["live-esports", "players", gameId],
    queryFn: () => fetchLivePlayers(gameId as string),
    enabled: !!gameId,
    refetchInterval: detailInterval,
  });

  const gold = useQuery({
    queryKey: ["live-esports", "gold", gameId],
    queryFn: () => fetchGoldSeries(gameId as string),
    enabled: !!gameId,
    refetchInterval: selected && !isFinal ? GOLD_POLL_MS : (false as const),
  });

  // Insights scan the same frames the gold chart does, so they poll on the
  // chart's slower cadence rather than the scoreboard's: doubling the rate
  // of that scan would buy a few seconds of freshness on numbers measured in
  // thousands of gold.
  const insights = useQuery({
    queryKey: ["live-esports", "insights", gameId],
    queryFn: () => fetchGameInsights(gameId as string),
    enabled: !!gameId,
    refetchInterval: selected && !isFinal ? INSIGHTS_POLL_MS : (false as const),
  });

  return { selected, isFinal, detail, players, gold, insights };
}

/**
 * Future matches (PPH3). An unreachable or older backend (no `/upcoming`
 * route yet) is not an error state for the page: the hub simply has nothing
 * to put under UP NEXT, so this resolves to an empty list and never retries
 * into a loop. `matches` is guarded because a 200 from an unexpected shape
 * must not crash the rail.
 */
export function useUpcoming() {
  const query = useQuery({
    queryKey: ["live-esports", "upcoming"],
    // An arrow: react-query passes its context as the first argument, which
    // `fetchUpcoming(league?)` must never mistake for a league slug.
    queryFn: () => fetchUpcoming(),
    refetchInterval: UPCOMING_POLL_MS,
    retry: false,
  });
  const matches = useMemo<UpcomingMatch[]>(
    () => (Array.isArray(query.data?.matches) ? query.data!.matches : []),
    [query.data],
  );
  return { query, matches };
}

/**
 * One schedule from two bounded reads (PW1-C).
 *
 * `/upcoming` is capped at 12 rows across every league, so on a busy day the
 * Worlds fixtures can fall off it. `/upcoming?league=worlds` filters by exact
 * slug before the cap. The two are separate queries under separate keys; their
 * matches are merged by `match_id` (no duplicates), time-ordered, so every
 * consumer — the automatic pick, the rail, an explicit `?next=` — sees one list.
 *
 * Honesty rules:
 * - A filtered answer counts only when it echoes `league: "worlds"`. An older
 *   backend ignores the parameter and returns the ordinary list; that response
 *   is NOT treated as a verified Worlds result (`worldsFiltered` is false, its
 *   rows add nothing the ordinary query does not already hold).
 * - A failed filtered read keeps whatever Worlds rows the ordinary read has,
 *   and unrelated fixtures are never hidden.
 * - Unavailable is not empty: `worldsVerifiedEmpty` is true only for a
 *   successful, honoured, source-ok filtered read with no rows.
 * - Pending is either read still pending: an explicit fixture is never called
 *   gone because only one of the two has answered.
 */
export function mergeUpcoming(...lists: readonly (readonly UpcomingMatch[])[]): UpcomingMatch[] {
  const seen = new Set<string>();
  const rows: { match: UpcomingMatch; start: number; index: number }[] = [];
  lists.flat().forEach((match) => {
    if (!match?.match_id || seen.has(match.match_id)) return;
    seen.add(match.match_id);
    rows.push({ match, start: startMs(match.scheduled_start) ?? Infinity, index: rows.length });
  });
  return rows
    .sort((x, y) => (x.start === y.start ? x.index - y.index : x.start < y.start ? -1 : 1))
    .map((r) => r.match);
}

export function useSchedule() {
  const { query: ordinary, matches: ordinaryMatches } = useUpcoming();
  const worlds = useQuery({
    queryKey: ["live-esports", "upcoming", WORLDS_LEAGUE_SLUG],
    queryFn: () => fetchUpcoming(WORLDS_LEAGUE_SLUG),
    refetchInterval: UPCOMING_POLL_MS,
    retry: false,
  });

  const worldsFiltered = worlds.data?.league === WORLDS_LEAGUE_SLUG;
  const worldsMatches = useMemo<UpcomingMatch[]>(
    () =>
      worldsFiltered && Array.isArray(worlds.data?.matches) ? worlds.data!.matches.filter(isWorldsFixture) : [],
    [worldsFiltered, worlds.data],
  );
  const matches = useMemo(() => mergeUpcoming(ordinaryMatches, worldsMatches), [ordinaryMatches, worldsMatches]);

  const ordinaryUnusable = ordinary.isError || ordinary.data?.source_ok === false;
  const worldsUnusable = worlds.isError || (worldsFiltered && worlds.data?.source_ok === false);
  const refetch = useCallback(
    () => Promise.all([ordinary.refetch(), worlds.refetch()]).then(() => undefined),
    [ordinary, worlds],
  );

  return {
    matches,
    /** Either read has not answered yet. */
    isPending: ordinary.isPending || worlds.isPending,
    /** Either read failed, or upstream's own read behind it failed. */
    unusable: ordinaryUnusable || worldsUnusable,
    /** The filtered read was honoured by the backend. */
    worldsFiltered,
    /** A successful, honoured, source-ok filtered read that found nothing. */
    worldsVerifiedEmpty:
      worlds.isSuccess && worldsFiltered && worlds.data?.source_ok !== false && worldsMatches.length === 0,
    /** Freshness of what is drawn, from both reads. */
    stale: Boolean(ordinary.data?.stale || (worldsFiltered && worlds.data?.stale)),
    sourceOk: ordinary.data?.source_ok !== false && !(worldsFiltered && worlds.data?.source_ok === false),
    refetch,
    ordinary,
    worlds,
  };
}
