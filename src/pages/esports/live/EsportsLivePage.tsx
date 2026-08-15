/**
 * /esports/live — the production live esports viewer (LIVE1 Phase 4A).
 *
 * Polling is deliberate rather than uniform. The bounded feed is cheap and
 * decides what is on, so it polls fastest; per-game reads follow the game's
 * own state and stop entirely once it is final, because a finished game's
 * numbers never change again.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw, WifiOff } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useChampionAssets } from "@/hooks/useChampionAssets";
import {
  fetchGoldSeries,
  fetchLiveFeed,
  fetchLiveGame,
  fetchLivePlayers,
  type LiveGameSummary,
} from "@/lib/live-esports/api";

import {
  EmptyNote,
  EventTimeline,
  FreshnessPill,
  GoldChart,
  LoadingBoard,
  MatchCard,
  PlayerRow,
  SectionCard,
  TeamPanel,
} from "./components";
import { TIMELINE_EVENT_TYPES, gameClock, matchTitle, seriesContext } from "./lib";

const FEED_POLL_MS = 10_000;
const LIVE_DETAIL_POLL_MS = 10_000;
/** A finished game is immutable — poll it once, then stop. */
const FINAL_POLL_MS = false as const;
/** Gold history changes slowly and is the largest payload; poll it lazily. */
const GOLD_POLL_MS = 30_000;

export default function EsportsLivePage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const feed = useQuery({
    queryKey: ["live-esports", "feed"],
    queryFn: fetchLiveFeed,
    refetchInterval: FEED_POLL_MS,
    refetchOnWindowFocus: true,
  });

  // Derive from `feed.data` directly: a `?? []` fallback allocates a fresh
  // array every render, which would defeat the memo and re-run the selection
  // effect on every poll tick.
  const live = useMemo<LiveGameSummary[]>(() => feed.data?.live ?? [], [feed.data]);
  const recent = useMemo<LiveGameSummary[]>(() => feed.data?.recent ?? [], [feed.data]);
  const selectable = useMemo<LiveGameSummary[]>(() => [...live, ...recent], [live, recent]);

  // Follow the action by default, but never yank a game out from under
  // someone who explicitly picked one.
  useEffect(() => {
    if (selectedId && selectable.some((g) => g.game_id === selectedId)) return;
    setSelectedId(selectable[0]?.game_id ?? null);
  }, [selectable, selectedId]);

  const selected = selectable.find((g) => g.game_id === selectedId) ?? null;
  const isFinal = selected?.availability === "finished";
  const detailInterval = selected
    ? isFinal
      ? FINAL_POLL_MS
      : LIVE_DETAIL_POLL_MS
    : (false as const);

  const detail = useQuery({
    queryKey: ["live-esports", "game", selectedId],
    queryFn: () => fetchLiveGame(selectedId as string),
    enabled: !!selectedId,
    refetchInterval: detailInterval,
  });

  const players = useQuery({
    queryKey: ["live-esports", "players", selectedId],
    queryFn: () => fetchLivePlayers(selectedId as string),
    enabled: !!selectedId,
    refetchInterval: detailInterval,
  });

  const gold = useQuery({
    queryKey: ["live-esports", "gold", selectedId],
    queryFn: () => fetchGoldSeries(selectedId as string),
    enabled: !!selectedId,
    refetchInterval: selected && !isFinal ? GOLD_POLL_MS : (false as const),
  });

  const { data: manifest } = useChampionAssets();

  /* ── page-level states ─────────────────────────────────────────────────── */

  // An unreachable backend must never read as "no matches", and must never
  // sit on skeletons for ever either. `isError` alone is not enough: with a
  // refetchInterval the query keeps restarting, so it can stay pending
  // indefinitely against a dead service (observed). `failureCount` is set
  // from the first failure, so "we have failed and have nothing to show" is
  // the honest trigger.
  const feedFailing = feed.isError || feed.failureCount > 0;
  if (feedFailing && !feed.data) {
    return (
      <Shell>
        <Alert variant="destructive">
          <WifiOff className="h-4 w-4" />
          <AlertTitle>Can't reach the live feed</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>
              The esports service didn't respond. Nothing is broken on your side — this
              usually clears on its own.
            </span>
            <Button size="sm" variant="outline" className="w-fit" onClick={() => feed.refetch()}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </Shell>
    );
  }

  // Still connecting on a first load — show progress, never an emptiness we
  // have not actually confirmed.
  if (!feed.data) {
    return (
      <Shell>
        <Skeleton className="h-20 w-full" />
        <div className="mt-4">
          <LoadingBoard />
        </div>
      </Shell>
    );
  }

  const ingestionOff = feed.data?.enabled === false;

  if (selectable.length === 0) {
    return (
      <Shell>
        {ingestionOff && <IngestionPausedNote />}
        <Card className="p-8 text-center">
          <h2 className="text-base font-semibold">No matches right now</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Live games appear here automatically while a supported competition is playing.
          </p>
        </Card>
      </Shell>
    );
  }

  const staleSelected =
    selected && !isFinal && ["stale", "stale_source_failing"].includes(selected.freshness?.label ?? "");

  return (
    <Shell>
      {ingestionOff && <IngestionPausedNote />}
      {/* We have data but refreshes are failing: keep showing it, and say so,
          rather than either blanking the page or passing it off as current. */}
      {feedFailing && feed.data && (
        <Alert className="mb-3">
          <WifiOff className="h-4 w-4" />
          <AlertTitle>Reconnecting…</AlertTitle>
          <AlertDescription>
            Showing the last data received; live updates are paused until the
            connection recovers.
          </AlertDescription>
        </Alert>
      )}

      {/* selector — horizontally scrollable on mobile, wraps on desktop */}
      <div className="-mx-1 mb-4 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
        {live.map((g) => (
          <MatchCard
            key={g.game_id}
            game={g}
            selected={g.game_id === selectedId}
            onSelect={() => setSelectedId(g.game_id)}
          />
        ))}
        {recent.map((g) => (
          <MatchCard
            key={g.game_id}
            game={g}
            selected={g.game_id === selectedId}
            onSelect={() => setSelectedId(g.game_id)}
          />
        ))}
      </div>

      {live.length === 0 && (
        <p className="mb-3 text-xs text-muted-foreground">
          Nothing is live at the moment — showing the most recent games.
        </p>
      )}

      {selected && (
        <>
          <header className="mb-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-lg font-bold sm:text-xl">{matchTitle(selected)}</h1>
              <FreshnessPill freshness={selected.freshness} />
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span>{selected.league?.name || selected.league?.slug}</span>
              {seriesContext(selected) && <span>· {seriesContext(selected)}</span>}
              {gameClock(selected) && <span>· {gameClock(selected)}</span>}
              {selected.patch_version && <span>· Patch {selected.patch_version}</span>}
            </div>
          </header>

          {staleSelected && (
            <Alert className="mb-3">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>This game's telemetry has stopped updating</AlertTitle>
              <AlertDescription>
                The numbers below are the last ones received and are not current. This
                usually means the game ended without a final frame from the source.
              </AlertDescription>
            </Alert>
          )}

          {detail.isError ? (
            <Alert variant="destructive" className="mb-3">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Couldn't load this game</AlertTitle>
              <AlertDescription>
                It may have been archived. Pick another match above.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              {/* scoreboard */}
              <div className="grid gap-3 sm:grid-cols-2">
                <TeamPanel
                  side="blue"
                  team={selected.teams.blue}
                  state={detail.data?.team_state?.blue}
                  winner={isFinal && isWinner(detail.data?.team_state, "blue")}
                />
                <TeamPanel
                  side="red"
                  team={selected.teams.red}
                  state={detail.data?.team_state?.red}
                  winner={isFinal && isWinner(detail.data?.team_state, "red")}
                />
              </div>

              {/* players */}
              <SectionCard title="Players">
                {players.isLoading ? (
                  <Skeleton className="h-48" />
                ) : players.isError ? (
                  <EmptyNote>Player telemetry is unavailable for this game.</EmptyNote>
                ) : (players.data?.players?.length ?? 0) === 0 ? (
                  <EmptyNote>
                    No player telemetry was published for this game.
                  </EmptyNote>
                ) : (
                  <div className="-mx-1 divide-y rounded-md border">
                    {(["blue", "red"] as const).map((side) => (
                      <div key={side}>
                        <div
                          className={
                            side === "blue"
                              ? "bg-sky-500/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-400"
                              : "bg-rose-500/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-400"
                          }
                        >
                          {side === "blue" ? "Blue side" : "Red side"}
                        </div>
                        {(players.data?.players ?? [])
                          .filter((p) => p.side === side)
                          .map((p) => (
                            <PlayerRow
                              key={`${p.participant_id}`}
                              player={p}
                              side={side}
                              manifest={manifest}
                            />
                          ))}
                      </div>
                    ))}
                  </div>
                )}
                {players.data?.identity_resolution &&
                  players.data.identity_resolution.rate != null &&
                  players.data.identity_resolution.rate < 1 && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {players.data.identity_resolution.resolved} of{" "}
                      {players.data.identity_resolution.total} players matched to known
                      profiles; the rest show their in-game names.
                    </p>
                  )}
              </SectionCard>

              <div className="grid gap-3 lg:grid-cols-2">
                <SectionCard title="Gold lead">
                  {gold.isLoading ? (
                    <Skeleton className="h-40" />
                  ) : gold.isError ? (
                    <EmptyNote>Gold history is unavailable for this game.</EmptyNote>
                  ) : (
                    <GoldChart
                      series={gold.data?.series ?? []}
                      downsampled={!!gold.data?.downsampled}
                    />
                  )}
                </SectionCard>

                <SectionCard title="Objectives">
                  {detail.isLoading ? (
                    <Skeleton className="h-40" />
                  ) : (
                    <EventTimeline
                      events={(detail.data?.recent_events ?? []).filter((e) =>
                        TIMELINE_EVENT_TYPES.includes(e.event_type),
                      )}
                      firstFrameTs={selected.first_frame_ts}
                    />
                  )}
                </SectionCard>
              </div>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}

/** Highest kills wins is wrong; the store has no explicit winner field, so we
 * only claim a winner when one side actually destroyed more inhibitors or
 * clearly leads on towers at the final frame. When it is ambiguous we say
 * nothing rather than guess. */
function isWinner(
  state: { blue?: { towers: number | null; inhibitors: number | null } | null; red?: { towers: number | null; inhibitors: number | null } | null } | null | undefined,
  side: "blue" | "red",
): boolean {
  const me = side === "blue" ? state?.blue : state?.red;
  const them = side === "blue" ? state?.red : state?.blue;
  if (!me || !them) return false;
  const mi = me.inhibitors ?? 0;
  const ti = them.inhibitors ?? 0;
  if (mi !== ti) return mi > ti;
  const mt = me.towers ?? 0;
  const tt = them.towers ?? 0;
  return mt > tt + 2;
}

function IngestionPausedNote() {
  return (
    <Alert className="mb-3">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Live tracking is paused</AlertTitle>
      <AlertDescription>
        Stored games below are still readable, but nothing new is being recorded right now.
      </AlertDescription>
    </Alert>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Esports
        </p>
        <h1 className="text-xl font-bold sm:text-2xl">Live matches</h1>
      </div>
      {children}
    </main>
  );
}
