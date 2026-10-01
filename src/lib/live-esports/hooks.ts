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
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

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
    queryFn: fetchUpcoming,
    refetchInterval: UPCOMING_POLL_MS,
    retry: false,
  });
  const matches = useMemo<UpcomingMatch[]>(
    () => (Array.isArray(query.data?.matches) ? query.data!.matches : []),
    [query.data],
  );
  return { query, matches };
}
