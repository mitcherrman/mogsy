/**
 * The hub's Match Center — ONE board for the selected game: the rail to switch
 * games, the score, the lanes (passed in by the hub), and the objectives with
 * the gold lead beside them.
 *
 * EVERYTHING HERE IS THE MATCH CENTRE'S OWN DATA. The feed, the detail read,
 * the gold series and the insight story are the live page's hooks under the
 * same cache keys; the status pill, gold chart, winner rule and every label
 * helper are the live page's. This file decides only the compact composition
 * (PPH2.1): the match is the page's primary object, so nothing above it but a
 * slim header, and nothing inside it that repeats what another part says.
 *
 * Props-driven: the hub owns selection (it also drives the lanes), so this
 * receives the feed, the selected match, an `onSelect` and the lane board.
 */
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, RefreshCw, WifiOff } from "lucide-react";

import { TeamCrest } from "@/components/pro-play/media/EntityCrest";
import { useEntityMedia } from "@/components/pro-play/media/ProPlayMediaProvider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { LiveGameSummary, LiveTeamState } from "@/lib/live-esports/api";
import type { useLiveFeed, useLiveMatch } from "@/lib/live-esports/hooks";
import {
  PRO_PLAY_LIVE_ARCHIVE_ROUTE,
  proPlayLiveGameUrl,
  proPlayProfileUrl,
} from "@/lib/pro-play/routes";
import { cn } from "@/lib/utils";
import { GoldChart, StatusPill } from "@/pages/esports/live/components";
import { buildStory } from "@/pages/esports/live/insights";
import {
  competitionLine,
  dragonCounts,
  gameClock,
  isWinner,
  kgold,
  matchLine,
  matchTitle,
  num,
  seriesContext,
  statusTone,
  teamLabel,
} from "@/pages/esports/live/lib";

type Feed = ReturnType<typeof useLiveFeed>;
type Match = ReturnType<typeof useLiveMatch>;
type Side = "blue" | "red";

const SIDE_TEXT: Record<Side, string> = { blue: "text-sky-300", red: "text-rose-300" };

/* ── the rail ───────────────────────────────────────────────────────────── */

function RailChip({
  game,
  selected,
  onSelect,
}: {
  game: LiveGameSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const live = statusTone(game.freshness) === "live";
  const series = seriesContext(game, true);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={[game.league?.name, game.competition?.stage?.round_name || game.block_name]
        .filter(Boolean)
        .join(" · ")}
      className={cn(
        "flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors sm:min-h-9",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-[#c9a84c]/70 bg-[#c9a84c]/10 text-[#f0e6c8]"
          : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
      )}
    >
      {live && (
        <span className="relative flex h-1.5 w-1.5" aria-label="Live">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
        </span>
      )}
      <span className="whitespace-nowrap">{matchTitle(game)}</span>
      {series && <span className="whitespace-nowrap text-xs font-medium opacity-70">{series}</span>}
    </button>
  );
}

/* ── team identity ──────────────────────────────────────────────────────── */

/**
 * A team's identity in the score header. The real crest whenever the
 * canonical team resolves to approved art; otherwise the FULL team name is
 * the identity — never an empty frame of initials pretending to be a logo.
 */
function TeamIdentity({
  team,
  side,
  winner,
}: {
  team: LiveGameSummary["teams"]["blue"];
  side: Side;
  winner: boolean;
}) {
  const key = team?.resolved_page ?? null;
  const { src } = useEntityMedia("team", key);
  const label = teamLabel(team);
  const full = team?.name || label;
  const mirrored = side === "red";

  const name = (
    <span
      className={cn(
        "line-clamp-2 break-words text-lg font-bold leading-tight sm:text-2xl",
        SIDE_TEXT[side],
      )}
      title={full}
    >
      {src ? label : full}
    </span>
  );

  return (
    <div
      className={cn("flex min-w-0 items-center gap-3", mirrored && "flex-row-reverse text-right")}
      data-testid={`team-${side}`}
    >
      {src && <TeamCrest teamKey={key} name={full} shortCode={team?.code} size="lg" />}
      <div className="min-w-0">
        {key ? (
          <Link
            to={proPlayProfileUrl("team", key)}
            aria-label={`${label} profile`}
            className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {name}
          </Link>
        ) : (
          name
        )}
        <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {src && full !== label ? `${full} · ` : !src && full !== label ? `${label} · ` : ""}
          {side === "blue" ? "Blue" : "Red"}
          {winner && <span className={cn("ml-1.5", SIDE_TEXT[side])}>· Winner</span>}
        </div>
      </div>
    </div>
  );
}

/* ── objectives ─────────────────────────────────────────────────────────── */

function Objectives({ blue, red }: { blue?: LiveTeamState; red?: LiveTeamState }) {
  const drakes = (s?: LiveTeamState) => {
    if (!s) return "—";
    return String(Object.values(dragonCounts((s as { dragons?: unknown }).dragons)).reduce((a, b) => a + b, 0));
  };
  const rows: [string, string, string][] = [
    ["Gold", kgold(blue?.total_gold), kgold(red?.total_gold)],
    ["Towers", num(blue?.towers), num(red?.towers)],
    ["Drakes", drakes(blue), drakes(red)],
    ["Inhibitors", num(blue?.inhibitors), num(red?.inhibitors)],
    ["Barons", num(blue?.barons), num(red?.barons)],
  ];
  return (
    <>
      {/* Phones: one row of five, blue over red. */}
      <div className="grid grid-cols-5 gap-1 text-center lg:hidden" data-testid="hub-objectives-compact">
        {rows.map(([label, b, r]) => (
          <div key={label} className="min-w-0">
            <div className="text-sm font-bold tabular-nums text-sky-300">{b}</div>
            <div className="text-sm font-bold tabular-nums text-rose-300">{r}</div>
            <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {label === "Inhibitors" ? "Inhibs" : label}
            </div>
          </div>
        ))}
      </div>
    <div className="hidden grid-cols-[1fr_auto_1fr] items-baseline gap-x-3 gap-y-1.5 lg:grid" data-testid="hub-objectives">
      {rows.map(([label, b, r]) => (
        <div key={label} className="contents">
          <span className="text-base font-bold tabular-nums text-sky-300">{b}</span>
          <span className="text-center text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {label}
          </span>
          <span className="text-right text-base font-bold tabular-nums text-rose-300">{r}</span>
        </div>
      ))}
    </div>
    </>
  );
}

/* ── the board ──────────────────────────────────────────────────────────── */

export default function MatchCenter({
  feed,
  match,
  selectedId,
  pinnedId,
  onSelect,
  onClearPin,
  lanes,
}: {
  feed: Feed;
  match: Match;
  selectedId: string | null;
  pinnedId: string | null;
  onSelect: (gameId: string) => void;
  onClearPin: () => void;
  /** The lane board for the selected game, drawn inside the match. */
  lanes?: React.ReactNode;
}) {
  const { live, recent, selectable, failing } = feed;
  const { selected, isFinal, detail, gold, insights } = match;
  const selectedIsLive = !!selectedId && live.some((g) => g.game_id === selectedId);
  const title = selectedIsLive ? "Live now" : pinnedId ? "Selected match" : "Latest match";

  const shell = (body: React.ReactNode) => (
    <section
      id="match-center"
      aria-labelledby="match-center-title"
      className="scroll-mt-20 overflow-hidden rounded-xl border border-border/70 bg-card/50"
    >
      <h2 id="match-center-title" className="sr-only">
        {title}
      </h2>
      {body}
    </section>
  );

  const archiveLink = (
    <Link
      to={PRO_PLAY_LIVE_ARCHIVE_ROUTE}
      className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground hover:text-foreground hover:underline sm:min-h-0"
    >
      Match archive
    </Link>
  );

  /* ── states, in the live page's order ─────────────────────────────────── */

  if (failing && !feed.feed.data) {
    return shell(
      <div className="p-4">
        <Alert variant="destructive">
          <WifiOff className="h-4 w-4" />
          <AlertTitle>Can't reach the live feed</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>
              The esports service didn't respond. Everything else on this page still
              works — this usually clears on its own.
            </span>
            <Button size="sm" variant="outline" className="w-fit" onClick={() => feed.feed.refetch()}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </div>,
    );
  }

  if (!feed.feed.data) {
    return shell(
      <div className="space-y-3 p-4" data-testid="match-center-loading">
        <div className="flex gap-2 overflow-hidden">
          <Skeleton className="h-9 w-40 shrink-0" />
          <Skeleton className="h-9 w-24 shrink-0" />
          <Skeleton className="h-9 w-24 shrink-0" />
        </div>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>,
    );
  }

  if (selectable.length === 0 && !pinnedId) {
    return shell(
      <div className="p-8 text-center">
        <p className="text-base font-semibold">No matches right now</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Live games appear here automatically while a supported competition is
          playing. Every stored game is in the archive.
        </p>
        <div className="mt-2">{archiveLink}</div>
      </div>,
    );
  }

  const pinnedMissing = !!pinnedId && !selected;
  if (pinnedMissing && detail.isError) {
    return shell(
      <div className="p-4">
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
        </Alert>
      </div>,
    );
  }

  const staleSelected =
    selected &&
    !isFinal &&
    ["stale", "stale_source_failing"].includes(selected.freshness?.label ?? "");
  const story = selected ? buildStory(insights.data, selected) : [];
  // A game the poller did not follow keeps one frame: no chart is possible,
  // so the chart is not drawn at all rather than drawn empty.
  const goldSeries = gold.data?.series ?? [];
  const showGold = !gold.isError && goldSeries.length >= 2;
  const state = detail.data?.team_state;

  // One metadata line: competition, then the match facts. The clock is not
  // repeated here — it sits under the score.
  const meta = selected
    ? [
        ...competitionLine(selected).map((text) => ({ key: text, text, title: undefined as string | undefined })),
        ...matchLine(selected)
          .filter((p) => p.kind !== "clock")
          .map((p) => ({ key: p.kind, text: p.text, title: p.title })),
      ]
    : [];
  const clockText = selected ? gameClock(selected) : null;

  return shell(
    <>
      {/* rail */}
      <div
        className="flex snap-x gap-1.5 overflow-x-auto border-b border-border/60 bg-background/40 px-3 py-2 [scrollbar-color:rgba(201,168,76,0.35)_transparent] [scrollbar-width:thin]"
        role="group"
        aria-label="Choose a match"
      >
        {selected && !selectable.some((g) => g.game_id === selected.game_id) && (
          <RailChip game={selected} selected onSelect={() => onSelect(selected.game_id)} />
        )}
        {[...live, ...recent].map((g) => (
          <RailChip
            key={g.game_id}
            game={g}
            selected={g.game_id === selectedId}
            onSelect={() => onSelect(g.game_id)}
          />
        ))}
      </div>

      {failing && (
        <p role="status" className="flex items-center gap-2 px-4 pt-2 text-xs text-amber-400">
          <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
          Reconnecting — showing the last data received.
        </p>
      )}

      {pinnedMissing && (
        <div className="space-y-2 p-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {selected && (
        <div data-testid="match-summary">
          <h3 className="sr-only">{matchTitle(selected)}</h3>

          {/* score */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-3 pb-2 pt-4 sm:gap-6 sm:px-6">
            <TeamIdentity
              team={selected.teams.blue}
              side="blue"
              winner={isFinal && isWinner(state, "blue")}
            />
            <div className="text-center">
              {detail.isError ? (
                <p className="max-w-[10rem] text-xs text-muted-foreground">
                  Couldn't load this game's scoreboard.
                </p>
              ) : (
                <div
                  className="text-4xl font-bold leading-none tabular-nums sm:text-5xl"
                  aria-label={`Kills ${num(state?.blue?.kills)} to ${num(state?.red?.kills)}`}
                >
                  <span className="text-foreground">{num(state?.blue?.kills)}</span>
                  <span className="px-2 text-muted-foreground/40">:</span>
                  <span className="text-foreground/70">{num(state?.red?.kills)}</span>
                </div>
              )}
              <div className="mt-1.5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <StatusPill freshness={selected.freshness} />
                {clockText && <span className="tabular-nums" title="Elapsed game time">{clockText}</span>}
              </div>
            </div>
            <TeamIdentity
              team={selected.teams.red}
              side="red"
              winner={isFinal && isWinner(state, "red")}
            />
          </div>
          {meta.length > 0 && (
            <p className="px-4 pb-3 text-center text-xs leading-relaxed text-muted-foreground" data-testid="match-meta">
              {meta.map((m, i) => (
                <span key={m.key} title={m.title}>
                  {i > 0 && <span aria-hidden="true"> · </span>}
                  {m.text}
                </span>
              ))}
            </p>
          )}

          {staleSelected && (
            <p className="mx-4 mb-3 flex items-start gap-2 rounded-md border border-orange-500/30 bg-orange-500/5 px-3 py-2 text-xs text-orange-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              This game's telemetry stopped updating; the numbers are the last ones
              received, not a result.
            </p>
          )}

          {/* lanes | objectives + gold */}
          <div className="grid border-t border-border/60 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="min-w-0">{lanes}</div>
            <aside
              aria-label="Objectives and gold"
              className="space-y-3 border-t border-border/60 px-4 py-3 lg:border-l lg:border-t-0"
            >
              {!detail.isError && <Objectives blue={state?.blue} red={state?.red} />}
              {showGold && (
                <div className="border-t border-border/60 pt-3" data-testid="hub-gold">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Gold lead
                  </p>
                  <GoldChart series={goldSeries} downsampled={!!gold.data?.downsampled} />
                </div>
              )}
              {story.length > 0 && (
                <p className="text-sm leading-relaxed text-foreground/85">{story.join(" ")}</p>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-0">
                {selectedId && (
                  <Link
                    to={proPlayLiveGameUrl(selectedId)}
                    className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-foreground/90 hover:text-foreground hover:underline sm:min-h-0"
                  >
                    Open full match centre
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                )}
                {archiveLink}
              </div>
            </aside>
          </div>
        </div>
      )}
    </>,
  );
}
