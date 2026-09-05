/**
 * /lol/pro-play/live — the production live esports viewer (LIVE1 Phase 4A),
 * and the "what is on now / what just happened" side of Pro Play.
 *
 * It shipped at `/esports/live` before Pro Play had a hub, reachable only by
 * typing the URL; that path now redirects here. The page itself is unchanged
 * apart from the shell, which places it inside the Pro Play area.
 *
 * Polling is deliberate rather than uniform. The bounded feed is cheap and
 * decides what is on, so it polls fastest; per-game reads follow the game's
 * own state and stop entirely once it is final, because a finished game's
 * numbers never change again.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Library, Radio, RefreshCw, WifiOff } from "lucide-react";

import SEOHead from "@/components/SEOHead";
import {
  PRO_PLAY_LIVE_ARCHIVE_ROUTE,
  PRO_PLAY_LIVE_GAME_PARAM,
  PRO_PLAY_LIVE_ROUTE,
  PRO_PLAY_ROUTE,
} from "@/lib/pro-play/routes";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useChampionAssets } from "@/hooks/useChampionAssets";
import {
  fetchGameInsights,
  fetchGoldSeries,
  fetchLiveFeed,
  fetchLiveGame,
  fetchLivePlayers,
  type LiveGameSummary,
} from "@/lib/live-esports/api";

import {
  EmptyNote,
  EventTimeline,
  GoldChart,
  LoadingBoard,
  MatchCard,
  MatchContext,
  MatchInsights,
  PlayerRow,
  SectionCard,
  StatusPill,
  TeamPanel,
} from "./components";
import { TIMELINE_EVENT_TYPES, matchTitle } from "./lib";

const FEED_POLL_MS = 10_000;
const LIVE_DETAIL_POLL_MS = 10_000;
/** A finished game is immutable — poll it once, then stop. */
const FINAL_POLL_MS = false as const;
/** Gold history changes slowly and is the largest payload; poll it lazily. */
const GOLD_POLL_MS = 30_000;
/** Insights re-scan the same frames as the gold chart; share its cadence. */
const INSIGHTS_POLL_MS = 30_000;

/**
 * Where "Browse archive" should go.
 *
 * A reader who arrived from the archive expects to land back on the page they
 * left — their league, their team, their page 3 — not at the top of an
 * unfiltered catalogue. The archive hands its own URL over in history state
 * when it opens a match, and this reads it back.
 *
 * State is not trusted blindly. It survives Back and Forward but it is also
 * whatever the previous entry happened to write, so anything that is not a
 * path under the archive route is ignored and the plain route is used. The
 * fallback is the normal case, not an error: a shared `?game=` link, a reload
 * or a visit from the hub all arrive with no state at all.
 */
function useArchiveReturn(): { to: string; label: string } {
  const location = useLocation();
  const from = (location.state as { archive?: unknown } | null)?.archive;
  const valid =
    typeof from === "string" &&
    (from === PRO_PLAY_LIVE_ARCHIVE_ROUTE ||
      from.startsWith(`${PRO_PLAY_LIVE_ARCHIVE_ROUTE}?`));
  return valid
    ? { to: from as string, label: "Back to archive" }
    : { to: PRO_PLAY_LIVE_ARCHIVE_ROUTE, label: "Browse archive" };
}

export default function EsportsLivePage() {
  /* Selection has two sources and they are not the same thing.
   *
   * `?game=` is an EXPLICIT choice — an archive row, a shared link, a reload —
   * and it may name a game far too old to be in the bounded feed. `autoId` is
   * the page following the action on its own when nobody has chosen. Keeping
   * them apart is what lets a deep link survive: the auto-follow effect below
   * only ever manages `autoId`, so it can no longer yank an archived game out
   * from under the reader for the crime of not being in `live`+`recent`.
   */
  const [params, setParams] = useSearchParams();
  const archiveLink = useArchiveReturn();
  const pinnedId = params.get(PRO_PLAY_LIVE_GAME_PARAM);
  const [autoId, setAutoId] = useState<string | null>(null);
  const selectedId = pinnedId ?? autoId;

  // Picking a match writes the URL, so what someone is looking at is always
  // the thing they can copy out of the address bar.
  const select = (gameId: string) => {
    const next = new URLSearchParams(params);
    next.set(PRO_PLAY_LIVE_GAME_PARAM, gameId);
    setParams(next, { replace: true });
  };

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
  // someone who explicitly picked one — including one that is not in the feed
  // at all, which every archived game is.
  useEffect(() => {
    if (pinnedId) return;
    if (autoId && selectable.some((g) => g.game_id === autoId)) return;
    setAutoId(selectable[0]?.game_id ?? null);
  }, [selectable, autoId, pinnedId]);

  const detail = useQuery({
    queryKey: ["live-esports", "game", selectedId],
    queryFn: () => fetchLiveGame(selectedId as string),
    enabled: !!selectedId,
    // The cadence reads the response rather than the page's `selected`, which
    // this query may itself be the source of when the game came from the
    // archive. The rule is unchanged: a finished game is immutable, so it is
    // fetched once and never polled again.
    refetchInterval: (query) =>
      query.state.data?.game?.availability === "finished"
        ? FINAL_POLL_MS
        : LIVE_DETAIL_POLL_MS,
  });
  const detailGame = detail.data?.game ?? null;

  // An archived game is not in the feed, so its summary comes from its own
  // detail read — the SAME `_game_summary` shape the feed serves, which is why
  // no second fetch and no second renderer are needed for it.
  const selected =
    selectable.find((g) => g.game_id === selectedId) ??
    (detailGame && detailGame.game_id === selectedId ? detailGame : null);
  const isFinal = selected?.availability === "finished";
  const detailInterval = selected
    ? isFinal
      ? FINAL_POLL_MS
      : LIVE_DETAIL_POLL_MS
    : (false as const);

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

  // Insights scan the same frames the gold chart does, so they poll on the
  // chart's slower cadence rather than the scoreboard's: doubling the rate
  // of that scan would buy a few seconds of freshness on numbers measured in
  // thousands of gold.
  const insights = useQuery({
    queryKey: ["live-esports", "insights", selectedId],
    queryFn: () => fetchGameInsights(selectedId as string),
    enabled: !!selectedId,
    refetchInterval: selected && !isFinal ? INSIGHTS_POLL_MS : (false as const),
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

  // Nothing live, nothing recent AND nobody asked for a specific game. A
  // pinned archived game is none of those, so it must not be swallowed here:
  // an empty feed is the NORMAL state for a deep link into the archive.
  if (selectable.length === 0 && !pinnedId) {
    return (
      <Shell>
        {ingestionOff && <IngestionPausedNote />}
        <Card className="p-8 text-center">
          <h2 className="text-base font-semibold">No matches right now</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Live games appear here automatically while a supported competition is playing.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to={archiveLink.to}>
              <Library className="mr-2 h-4 w-4" aria-hidden="true" />
              {archiveLink.label}
            </Link>
          </Button>
        </Card>
      </Shell>
    );
  }

  // A pinned game that is not in the feed is an archived one; its own detail
  // read supplies the summary, so the only state left to show is that read
  // failing or still in flight.
  const pinnedMissing = !!pinnedId && !selected;
  if (pinnedMissing && detail.isError) {
    return (
      <Shell>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Couldn't load that match</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>
              No stored game has the id in this link. It may have been removed, or the
              link may be wrong.
            </span>
            <Button asChild size="sm" variant="outline" className="w-fit">
              <Link to={archiveLink.to}>{archiveLink.label}</Link>
            </Button>
          </AlertDescription>
        </Alert>
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
        {/* An archived game is not in the feed, so it would otherwise be the
            one match on the page with no card. The rail always shows what is
            selected. */}
        {selected && !selectable.some((g) => g.game_id === selected.game_id) && (
          <MatchCard game={selected} selected onSelect={() => select(selected.game_id)} />
        )}
        {live.map((g) => (
          <MatchCard
            key={g.game_id}
            game={g}
            selected={g.game_id === selectedId}
            onSelect={() => select(g.game_id)}
          />
        ))}
        {recent.map((g) => (
          <MatchCard
            key={g.game_id}
            game={g}
            selected={g.game_id === selectedId}
            onSelect={() => select(g.game_id)}
          />
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {live.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing is live at the moment — showing the most recent games.
          </p>
        ) : (
          <span />
        )}
        {/* The one way into the rest of the catalogue. The live page stays a
            live page: this is a link, not a second list bolted onto it. */}
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link to={archiveLink.to}>
            <Library className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            {archiveLink.label}
          </Link>
        </Button>
      </div>

      {pinnedMissing && (
        <div className="mb-3 space-y-2">
          <Skeleton className="h-16 w-full" />
          <LoadingBoard />
        </div>
      )}

      {selected && (
        <>
          <header className="mb-3">
            {/* h2, not h1: the shell already titles the page, and two h1s
                would leave a screen reader without a document heading. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-lg font-bold sm:text-xl">{matchTitle(selected)}</h2>
              <StatusPill freshness={selected.freshness} />
            </div>
            <MatchContext game={selected} />
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
              {/* insights — the state of the match before the raw numbers.
                  A failed insights read is not worth an alert of its own:
                  every fact it carries is derived from data still shown
                  below, so the section simply does not render. */}
              {!insights.isError && (
                <MatchInsights
                  insights={insights.data}
                  game={selected}
                  loading={insights.isLoading}
                />
              )}

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

/**
 * The page chrome, shared by every state so a failing feed still reads as a
 * Pro Play page with a way out of it. The gold trophy tile and the "Back to
 * Pro Play" link are the same two elements the quiz and graphs pages carry —
 * they are what make three separate surfaces read as one area.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
      <SEOHead
        title="Live & Recent Pro Matches | Mogzy"
        description="Live and recently finished professional League of Legends games — scoreboards, players, objectives and gold."
        path={PRO_PLAY_LIVE_ROUTE}
      />
      <Link
        to={PRO_PLAY_ROUTE}
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Pro Play
      </Link>

      <div className="mb-4 flex items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#c9a84c]/30 bg-[#c9a84c]/10"
          aria-hidden="true"
        >
          <Radio className="h-4 w-4 text-[#c9a84c]" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Pro Play
          </p>
          <h1 className="text-xl font-bold sm:text-2xl">Live &amp; Recent Matches</h1>
        </div>
      </div>
      {children}
    </main>
  );
}
