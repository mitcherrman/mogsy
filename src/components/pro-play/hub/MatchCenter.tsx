/**
 * The hub's Match Center — the selected game, compact, with the rail to
 * switch games and the way through to the full match centre.
 *
 * EVERYTHING HERE IS THE MATCH CENTRE'S OWN. The cards, the status pill, the
 * competition lines, the scoreboard, the insight wording and the gold chart
 * are the live page's components and helpers, fed by the same hooks under the
 * same cache keys. This file decides only what the compact version keeps:
 * the scoreboard and the state of the game, not the player table or the
 * objective log, which stay one click away at full size.
 *
 * Props-driven: the hub owns selection (it also drives the workspace), so this
 * receives the feed, the selected match and an `onSelect`.
 */
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Library, RefreshCw, WifiOff } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { useLiveFeed, useLiveMatch } from "@/lib/live-esports/hooks";
import { PRO_PLAY_LIVE_ARCHIVE_ROUTE, proPlayLiveGameUrl } from "@/lib/pro-play/routes";
import { cn } from "@/lib/utils";
import {
  GoldChart,
  MatchCard,
  MatchContext,
  StatusPill,
  TeamPanel,
} from "@/pages/esports/live/components";
import { buildStory, insightRows } from "@/pages/esports/live/insights";
import { isWinner, matchTitle } from "@/pages/esports/live/lib";

import HubSection from "./HubSection";

/** The compact summary keeps the three facts that answer "how is it going". */
const HUB_INSIGHT_ROWS = 3;

type Feed = ReturnType<typeof useLiveFeed>;
type Match = ReturnType<typeof useLiveMatch>;

function ArchiveButton() {
  return (
    <Button asChild variant="outline" size="sm">
      <Link to={PRO_PLAY_LIVE_ARCHIVE_ROUTE}>
        <Library className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
        Match archive
      </Link>
    </Button>
  );
}

export default function MatchCenter({
  feed,
  match,
  selectedId,
  pinnedId,
  onSelect,
  onClearPin,
}: {
  feed: Feed;
  match: Match;
  selectedId: string | null;
  pinnedId: string | null;
  onSelect: (gameId: string) => void;
  onClearPin: () => void;
}) {
  const { live, recent, selectable, failing } = feed;
  const { selected, isFinal, detail, gold, insights } = match;
  const selectedIsLive = !!selectedId && live.some((g) => g.game_id === selectedId);

  const fullMatch = selectedId ? (
    <Button asChild size="sm" className="bg-[#c9a84c] text-black hover:bg-[#d8ba62]">
      <Link to={proPlayLiveGameUrl(selectedId)}>
        Open full match
        <ArrowRight className="ml-2 h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </Button>
  ) : null;

  const shell = (body: React.ReactNode, withFullMatch = false) => (
    <HubSection
      id="match-center"
      kicker="Match Center"
      title={selectedIsLive ? "Live now" : pinnedId ? "Selected match" : "Latest match"}
      description={
        selectedIsLive
          ? "A pro game in progress, updating as it is played."
          : pinnedId
            ? "The game you picked. Choose another below, or open it at full size."
            : "Nothing is live right now — here is the latest game we followed."
      }
      action={
        <>
          {withFullMatch && fullMatch}
          <ArchiveButton />
        </>
      }
      framed
    >
      {body}
    </HubSection>
  );

  /* ── states, in the live page's order ─────────────────────────────────── */

  if (failing && !feed.feed.data) {
    return shell(
      <Alert variant="destructive">
        <WifiOff className="h-4 w-4" />
        <AlertTitle>Can't reach the live feed</AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          <span>
            The esports service didn't respond. Everything else on this page still
            works — this usually clears on its own.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="w-fit"
            onClick={() => feed.feed.refetch()}
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Try again
          </Button>
        </AlertDescription>
      </Alert>,
    );
  }

  if (!feed.feed.data) {
    return shell(
      <div className="space-y-3" data-testid="match-center-loading">
        <div className="flex gap-2 overflow-hidden">
          <Skeleton className="h-[72px] w-[220px] shrink-0" />
          <Skeleton className="h-[72px] w-[220px] shrink-0" />
          <Skeleton className="h-[72px] w-[220px] shrink-0" />
        </div>
        <Skeleton className="h-28 w-full" />
      </div>,
    );
  }

  if (selectable.length === 0 && !pinnedId) {
    return shell(
      <div className="rounded-xl border border-dashed border-border/70 p-8 text-center">
        <p className="text-base font-semibold">No matches right now</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Live games appear here automatically while a supported competition is
          playing. Every stored game is in the archive.
        </p>
      </div>,
    );
  }

  const pinnedMissing = !!pinnedId && !selected;
  if (pinnedMissing && detail.isError) {
    return shell(
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Couldn't load that match</AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          <span>
            No stored game has the id in this link. It may have been removed, or the
            link may be wrong.
          </span>
          {selectable.length > 0 && (
            <Button size="sm" variant="outline" className="w-fit" onClick={onClearPin}>
              Show the latest match
            </Button>
          )}
        </AlertDescription>
      </Alert>,
    );
  }

  const staleSelected =
    selected &&
    !isFinal &&
    ["stale", "stale_source_failing"].includes(selected.freshness?.label ?? "");
  const rows = selected ? insightRows(insights.data, selected).slice(0, HUB_INSIGHT_ROWS) : [];
  const story = selected ? buildStory(insights.data, selected) : [];
  // A game the poller did not follow keeps one frame: no chart is possible,
  // so the section is not drawn at all rather than drawn empty.
  const goldSeries = gold.data?.series ?? [];
  const showGold = !gold.isError && goldSeries.length >= 2;

  return shell(
    <div className="space-y-4">
      {failing && (
        <p role="status" className="flex items-center gap-2 text-xs text-amber-400">
          <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
          Reconnecting — showing the last data received.
        </p>
      )}

      {/* rail — the live page's cards; horizontally scrollable */}
      <div
        className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1"
        role="group"
        aria-label="Choose a match"
      >
        {selected && !selectable.some((g) => g.game_id === selected.game_id) && (
          <MatchCard game={selected} selected onSelect={() => onSelect(selected.game_id)} />
        )}
        {[...live, ...recent].map((g) => (
          <MatchCard
            key={g.game_id}
            game={g}
            selected={g.game_id === selectedId}
            onSelect={() => onSelect(g.game_id)}
          />
        ))}
      </div>

      {pinnedMissing && (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      )}

      {selected && (
        <div className="space-y-3" data-testid="match-summary">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="text-lg font-bold sm:text-xl">{matchTitle(selected)}</h3>
              <StatusPill freshness={selected.freshness} />
            </div>
            <MatchContext game={selected} />
          </div>

          {staleSelected && (
            <p className="flex items-start gap-2 rounded-md border border-orange-500/30 bg-orange-500/5 px-3 py-2 text-xs text-orange-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              This game's telemetry stopped updating; the numbers are the last ones
              received, not a result.
            </p>
          )}

          {detail.isError ? (
            <p className="text-sm text-muted-foreground">
              Couldn't load this game's scoreboard. Pick another match above.
            </p>
          ) : (
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
          )}

          {(rows.length > 0 || story.length > 0 || showGold) && (
            <div className={cn("grid gap-3", showGold && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]")}>
              {(rows.length > 0 || story.length > 0) && (
                <div className="space-y-3 rounded-xl border border-border/60 bg-background/40 p-3">
                  {rows.length > 0 && (
                    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {rows.map((row) => (
                        <div key={row.key} title={row.title} className="min-w-0">
                          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {row.label}
                          </dt>
                          <dd
                            className={cn(
                              "mt-0.5 text-sm font-semibold tabular-nums",
                              row.side === "blue" && "text-sky-400",
                              row.side === "red" && "text-rose-400",
                            )}
                          >
                            {row.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {story.length > 0 && (
                    <p
                      className={cn(
                        "text-sm leading-relaxed text-foreground/90",
                        rows.length > 0 && "border-t border-border/60 pt-3",
                      )}
                    >
                      {story.join(" ")}
                    </p>
                  )}
                </div>
              )}
              {showGold && (
                <div
                  className="rounded-xl border border-border/60 bg-background/40 p-3"
                  data-testid="hub-gold"
                >
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Gold lead
                  </p>
                  <GoldChart series={goldSeries} downsampled={!!gold.data?.downsampled} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>,
    true,
  );
}
