/**
 * The hub's Match Center — ONE board for the selected match: the rail to
 * switch matches, the event, the score, the lanes (passed in by the hub), and
 * the objectives with the gold lead beside them.
 *
 * EVERYTHING HERE IS THE MATCH CENTRE'S OWN DATA. The feed, the detail read,
 * the gold series and the insight story are the live page's hooks under the
 * same cache keys; the status pill, gold chart, winner rule and every label
 * helper are the live page's. PPH3 adds three things on top, all derived:
 *
 * - the rail is per SERIES, not per game, in three labelled groups —
 *   LIVE NOW, PREVIOUS MATCH, UP NEXT (`hubSeries.groupSeries`);
 * - the selected series' games as tabs right after its rail chip (the chip
 *   carries the series score);
 * - the event band: the league's mark slot and the competition in
 *   upstream's words, with the match facts on the same wrapping line;
 * - an unmistakable state badge — LIVE / COMPLETED / UPCOMING.
 *
 * UP NEXT is upstream's schedule (`/upcoming`), never the store's `scheduled`
 * rows. An upcoming match has no scoreboard, so its board draws identity and
 * time only — no empty tables.
 *
 * Props-driven: the hub owns selection (it also drives the lanes).
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, RefreshCw, WifiOff } from "lucide-react";

import { EventMark } from "@/components/pro-play/media/EventMark";
import { TeamCrest } from "@/components/pro-play/media/EntityCrest";
import { useEntityMedia } from "@/components/pro-play/media/ProPlayMediaProvider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { LiveCompetition, LiveTeamState, UpcomingMatch } from "@/lib/live-esports/api";
import type { useLiveFeed, useLiveMatch } from "@/lib/live-esports/hooks";
import {
  countdown,
  gameState,
  localStart,
  seriesOf,
  type HubSeries,
} from "@/lib/pro-play/hubSeries";
import {
  PRO_PLAY_LIVE_ARCHIVE_ROUTE,
  proPlayLiveGameUrl,
  proPlayProfileUrl,
} from "@/lib/pro-play/routes";
import { cn } from "@/lib/utils";
import { GoldChart, StatusPill } from "@/pages/esports/live/components";
import { buildStory } from "@/pages/esports/live/insights";
import {
  SCOPE_TITLE,
  competitionLine,
  dragonCounts,
  gameClock,
  isWinner,
  kgold,
  matchLine,
  matchTitle,
  num,
  scopeLabel,
  statusTone,
  teamLabel,
} from "@/pages/esports/live/lib";
import MatchStateBadge from "./MatchStateBadge";

type Feed = ReturnType<typeof useLiveFeed>;
type Match = ReturnType<typeof useLiveMatch>;
type Side = "blue" | "red";
type TeamLike = { name: string | null; code: string | null; resolved_page: string | null };

const SIDE_TEXT: Record<Side, string> = { blue: "text-sky-300", red: "text-rose-300" };

/** Re-render once a minute so countdowns stay honest without a ticking clock. */
function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/* ── the rail ───────────────────────────────────────────────────────────── */

function ChipTeam({ team }: { team: TeamLike }) {
  const key = team.resolved_page ?? null;
  const { src } = useEntityMedia("team", key);
  const label = teamLabel(team);
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      {src && <TeamCrest teamKey={key} name={team.name || label} shortCode={team.code} size="xs" />}
      <span className="whitespace-nowrap">{label}</span>
    </span>
  );
}

const CHIP =
  "flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-2.5 text-sm font-semibold transition-colors sm:min-h-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const chipTone = (selected: boolean) =>
  selected
    ? "border-[#c9a84c]/70 bg-[#c9a84c]/10 text-[#f0e6c8]"
    : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground";

function SeriesChip({
  series,
  selected,
  onSelect,
}: {
  series: HubSeries;
  selected: boolean;
  onSelect: () => void;
}) {
  const { a, b, score, bestOf } = series;
  const focus = series.focus;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-testid="series-chip"
      title={[focus.league?.name, focus.competition?.stage?.round_name || focus.block_name]
        .filter(Boolean)
        .join(" · ")}
      className={cn(CHIP, chipTone(selected))}
    >
      <MatchStateBadge state={series.state} size="sm" />
      <ChipTeam team={a.team} />
      <span className="tabular-nums" data-testid="series-score" title={score.known ? "Series score" : "Series score — a result is not recorded"}>
        {score.a}
        <span className="px-0.5 opacity-50">–</span>
        {score.b}
        {!score.known && <span className="opacity-60">*</span>}
      </span>
      <ChipTeam team={b.team} />
      {bestOf && <span className="whitespace-nowrap text-xs font-medium opacity-60">Bo{bestOf}</span>}
    </button>
  );
}

function UpcomingChip({
  match,
  selected,
  onSelect,
  now,
}: {
  match: UpcomingMatch;
  selected: boolean;
  onSelect: () => void;
  now: number;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-testid="upcoming-chip"
      title={[match.league?.name, match.block_name, localStart(match.scheduled_start)].filter(Boolean).join(" · ")}
      className={cn(CHIP, chipTone(selected))}
    >
      <MatchStateBadge state="upcoming" size="sm" />
      <ChipTeam team={match.teams.a} />
      <span className="text-xs font-medium opacity-60">vs</span>
      <ChipTeam team={match.teams.b} />
      <span className="whitespace-nowrap text-xs font-medium opacity-70">{countdown(match.scheduled_start, now)}</span>
    </button>
  );
}

function RailLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex shrink-0 items-center pl-1 pr-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </span>
  );
}

function Rail({
  series,
  upcoming,
  selectedKey,
  upcomingId,
  onSelectSeries,
  onSelectUpcoming,
  pinnedOutside,
  gameTabs,
}: {
  series: HubSeries[];
  upcoming: UpcomingMatch[];
  selectedKey: string | null;
  upcomingId: string | null;
  onSelectSeries: (s: HubSeries) => void;
  onSelectUpcoming: (matchId: string) => void;
  pinnedOutside: React.ReactNode;
  /** The selected series' games, drawn right after its chip: a series'
   *  games belong to the series, and the rail's height is already paid. */
  gameTabs?: React.ReactNode;
}) {
  const now = useMinuteClock();
  const live = series.filter((s) => s.state === "live");
  const previous = series.filter((s) => s.state !== "live");
  return (
    <div
      className="flex snap-x items-center gap-1.5 overflow-x-auto border-b border-border/60 bg-background/40 px-3 py-2 sm:py-1.5 [scrollbar-color:rgba(201,168,76,0.35)_transparent] [scrollbar-width:thin]"
      role="group"
      aria-label="Choose a match"
      data-testid="match-rail"
    >
      {/* An empty group is not drawn: the board's own COMPLETED badge already
          says nothing is live (PPH2.1 dropped "nothing is live" copy). */}
      {live.length > 0 && <RailLabel>Live now</RailLabel>}
      {live.map((s) => (
        <span key={s.key} className="contents">
          <SeriesChip series={s} selected={s.key === selectedKey} onSelect={() => onSelectSeries(s)} />
          {s.key === selectedKey && gameTabs}
        </span>
      ))}
      {(previous.length > 0 || pinnedOutside) && <RailLabel>Previous match</RailLabel>}
      {pinnedOutside}
      {previous.map((s) => (
        <span key={s.key} className="contents">
          <SeriesChip series={s} selected={s.key === selectedKey} onSelect={() => onSelectSeries(s)} />
          {s.key === selectedKey && gameTabs}
        </span>
      ))}
      {upcoming.length > 0 && <RailLabel>Up next</RailLabel>}
      {upcoming.map((m) => (
        <UpcomingChip
          key={m.match_id}
          match={m}
          selected={m.match_id === upcomingId}
          onSelect={() => onSelectUpcoming(m.match_id)}
          now={now}
        />
      ))}
    </div>
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
  sideLabel = true,
}: {
  team: TeamLike;
  side: Side;
  winner: boolean;
  sideLabel?: boolean;
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

  const sub = [
    src && full !== label ? full : !src && full !== label ? label : null,
    sideLabel ? (side === "blue" ? "Blue" : "Red") : null,
  ].filter(Boolean);

  return (
    <div
      className={cn("flex min-w-0 items-center gap-3", mirrored && "flex-row-reverse text-right")}
      data-testid={`team-${side}`}
    >
      {/* 44px on phones, 64px from `sm`: a full-size crest in a ~150px half
          left the team's name a one-word column. */}
      {src && (
        <>
          <TeamCrest teamKey={key} name={full} shortCode={team?.code} size="md" className="sm:hidden" />
          <TeamCrest teamKey={key} name={full} shortCode={team?.code} size="lg" className="hidden sm:inline-flex" />
        </>
      )}
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
        {(sub.length > 0 || winner) && (
          <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground [overflow-wrap:anywhere]">
            {sub.join(" · ")}
            {winner && <span className={cn("ml-1.5", SIDE_TEXT[side])}>· Winner</span>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── the event band ─────────────────────────────────────────────────────── */

/**
 * League → tournament → stage, in upstream's words, beside the league's mark
 * slot, then the quieter match facts (best-of, date, patch) — one wrapping
 * line, so the event costs one row at desktop width.
 */
function EventBand({
  league,
  competition,
  scope,
  facts,
  right,
}: {
  league: { name: string | null; slug: string | null };
  competition: string[];
  scope: string | null;
  facts: { key: string; text: string; title?: string }[];
  right?: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border/60 px-3 py-1.5 sm:px-4"
      data-testid="event-band"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <EventMark name={league.name} slug={league.slug} />
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm font-semibold leading-snug text-foreground/90" data-testid="match-meta">
            {competition.map((text, i) => (
              <span key={`${text}-${i}`} className={i === 0 ? "font-bold text-foreground" : undefined}>
                {i > 0 && <span aria-hidden="true" className="mr-1.5 text-muted-foreground/60">·</span>}
                {text}
              </span>
            ))}
            {scope && (
              <span
                title={SCOPE_TITLE[scope]}
                className={cn(
                  "ml-1 rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide",
                  scope === "International" ? "bg-violet-500/15 text-violet-300" : "bg-muted text-muted-foreground",
                )}
              >
                {scope}
              </span>
            )}
          </p>
          {facts.length > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="match-facts">
              {facts.map((f, i) => (
                <span key={f.key} title={f.title}>
                  {i > 0 && <span aria-hidden="true"> · </span>}
                  {f.text}
                </span>
              ))}
            </p>
          )}
        </div>
      </div>
      {right}
    </div>
  );
}

function SeriesTabs({
  series,
  selectedId,
  onSelect,
}: {
  series: HubSeries;
  selectedId: string | null;
  onSelect: (gameId: string) => void;
}) {
  const label = (id: string | null) => {
    if (!id) return null;
    if (id === series.a.id) return teamLabel(series.a.team);
    if (id === series.b.id) return teamLabel(series.b.team);
    return null;
  };
  return (
    <div className="flex shrink-0 items-center gap-1" data-testid="series-bar" role="group" aria-label="Games in this series">
      {series.games.length > 1 &&
        series.games.map(({ game, live, winner }) => {
          const selected = game.game_id === selectedId;
          const w = label(winner);
          return (
            <button
              key={game.game_id}
              type="button"
              onClick={() => onSelect(game.game_id)}
              aria-pressed={selected}
              data-testid="game-tab"
              title={live ? "In progress" : w ? `${w} won` : "Result not recorded"}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md border px-2 text-xs font-semibold tabular-nums transition-colors sm:min-h-7",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "border-[#c9a84c]/70 bg-[#c9a84c]/10 text-[#f0e6c8]" : "border-border/60 text-muted-foreground hover:text-foreground",
              )}
            >
              G{game.game_number ?? "?"}
              {live ? (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-label="live" />
              ) : (
                <span className="font-medium opacity-75">{w ?? "—"}</span>
              )}
            </button>
          );
        })}
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

/* ── the upcoming board ─────────────────────────────────────────────────── */

function UpcomingBoard({ match }: { match: UpcomingMatch }) {
  const now = useMinuteClock();
  const competition = [match.league?.name, match.block_name].filter(Boolean) as string[];
  const facts = [
    ...(match.best_of ? [{ key: "bo", text: `Best of ${match.best_of}` }] : []),
    { key: "src", text: "Upstream schedule", title: "From the official LoL Esports schedule" },
  ];
  const start = localStart(match.scheduled_start);
  return (
    <div data-testid="upcoming-summary">
      <h3 className="sr-only">
        {teamLabel(match.teams.a)} vs {teamLabel(match.teams.b)}
      </h3>
      <EventBand
        league={{ name: match.league?.name ?? null, slug: match.league?.slug ?? null }}
        competition={competition}
        scope={scopeLabel({ league: match.league } as LiveCompetition)}
        facts={facts}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-3 py-5 sm:gap-6 sm:px-6">
        <TeamIdentity team={match.teams.a} side="blue" winner={false} sideLabel={false} />
        <div className="flex flex-col items-center gap-1.5 text-center">
          <MatchStateBadge state="upcoming" />
          <span className="text-2xl font-bold leading-none text-[#e3c66f]">VS</span>
          {start && (
            <span className="text-sm font-semibold tabular-nums text-foreground" title={`${match.scheduled_start} UTC, shown in your local time`}>
              {start}
            </span>
          )}
          <span className="text-xs text-muted-foreground tabular-nums">{countdown(match.scheduled_start, now)}</span>
        </div>
        <TeamIdentity team={match.teams.b} side="red" winner={false} sideLabel={false} />
      </div>
      <p className="border-t border-border/60 px-4 py-3 text-center text-xs text-muted-foreground">
        Sides, lineups, the live score and match evidence appear here once the match starts.
      </p>
    </div>
  );
}

/* ── the board ──────────────────────────────────────────────────────────── */

export default function MatchCenter({
  feed,
  match,
  series,
  upcoming,
  upcomingMatch,
  selectedId,
  pinnedId,
  onSelect,
  onSelectUpcoming,
  onClearPin,
  lanes,
}: {
  feed: Feed;
  match: Match;
  series: HubSeries[];
  upcoming: UpcomingMatch[];
  /** The selected upcoming match; when set, the board shows it. */
  upcomingMatch: UpcomingMatch | null;
  selectedId: string | null;
  pinnedId: string | null;
  onSelect: (gameId: string) => void;
  onSelectUpcoming: (matchId: string) => void;
  onClearPin: () => void;
  /** The lane board for the selected game, drawn inside the match. */
  lanes?: React.ReactNode;
}) {
  const { live, selectable, failing } = feed;
  const { selected, isFinal, detail, gold, insights } = match;
  const selectedIsLive = !!selectedId && live.some((g) => g.game_id === selectedId);
  const title = upcomingMatch
    ? "Up next"
    : selectedIsLive
      ? "Live now"
      : pinnedId
        ? "Selected match"
        : "Previous match";

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

  const selectedSeries = seriesOf(series, selected?.game_id ?? selectedId);
  const pinnedOutside =
    selected && !selectable.some((g) => g.game_id === selected.game_id) ? (
      <button
        type="button"
        aria-pressed={!upcomingMatch}
        onClick={() => onSelect(selected.game_id)}
        className={cn(CHIP, chipTone(!upcomingMatch))}
        data-testid="pinned-chip"
      >
        {gameState(selected, false) ? (
          <MatchStateBadge state={gameState(selected, false)!} size="sm" />
        ) : (
          <StatusPill freshness={selected.freshness} />
        )}
        <span className="whitespace-nowrap">{matchTitle(selected)}</span>
        {selected.game_number && <span className="text-xs font-medium opacity-60">G{selected.game_number}</span>}
      </button>
    ) : null;

  const rail = (
    <Rail
      series={series}
      upcoming={upcoming}
      selectedKey={upcomingMatch ? null : (selectedSeries?.key ?? null)}
      upcomingId={upcomingMatch?.match_id ?? null}
      onSelectSeries={(s) => onSelect(s.focus.game_id)}
      onSelectUpcoming={onSelectUpcoming}
      pinnedOutside={pinnedOutside}
      gameTabs={
        selectedSeries && selectedSeries.games.length > 1 && selected ? (
          <SeriesTabs series={selectedSeries} selectedId={selected.game_id} onSelect={onSelect} />
        ) : null
      }
    />
  );

  if (upcomingMatch) {
    return shell(
      <>
        {rail}
        <UpcomingBoard match={upcomingMatch} />
      </>,
    );
  }

  if (selectable.length === 0 && !pinnedId) {
    return shell(
      <>
        {upcoming.length > 0 && rail}
        <div className="p-8 text-center">
          <p className="text-base font-semibold">No matches right now</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Live games appear here automatically while a supported competition is
            playing. Every stored game is in the archive.
          </p>
          <div className="mt-2">{archiveLink}</div>
        </div>
      </>,
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

  const competition = selected ? competitionLine(selected) : [];
  // The clock sits under the score and the series score in the band's right
  // half, so neither is repeated in the facts line.
  const facts: { key: string; text: string; title?: string }[] = selected
    ? matchLine(selected)
        .filter((p) => p.kind !== "clock" && p.kind !== "series")
        .map((p) => ({ key: p.kind as string, text: p.text, title: p.title }))
    : [];
  if (selected?.best_of) facts.unshift({ key: "bo", text: `Bo${selected.best_of}`, title: undefined });
  const clockText = selected ? gameClock(selected) : null;
  const badge = selected ? gameState(selected, selectedIsLive) : null;
  const delayed = selectedIsLive && statusTone(selected?.freshness) === "delayed";

  return shell(
    <>
      {rail}

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

          <EventBand
            league={{
              name: selected.competition?.league?.name || selected.league?.name || null,
              slug: selected.competition?.league?.slug || selected.league?.slug || null,
            }}
            competition={competition}
            scope={scopeLabel(selected.competition)}
            facts={facts}
          />

          {/* score */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-3 py-3 sm:gap-6 sm:px-6 sm:py-2.5">
            <TeamIdentity
              team={selected.teams.blue}
              side="blue"
              winner={isFinal && isWinner(state, "blue")}
            />
            <div className="flex flex-col items-center gap-1.5 text-center">
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
              <div className="flex flex-col items-center justify-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground tabular-nums sm:flex-row sm:flex-wrap">
                {/* The state sits where the live page's pill always sat: under
                    the score, beside the clock — no extra row. */}
                {badge ? (
                  <MatchStateBadge state={badge} qualifier={delayed ? "Delayed" : null} />
                ) : (
                  <StatusPill freshness={selected.freshness} />
                )}
                <span className="whitespace-nowrap">
                  {selected.game_number && <span>Game {selected.game_number}</span>}
                  {clockText && (
                    <span title="Elapsed game time">
                      {selected.game_number && <span aria-hidden="true"> · </span>}
                      {clockText}
                    </span>
                  )}
                </span>
              </div>
            </div>
            <TeamIdentity
              team={selected.teams.red}
              side="red"
              winner={isFinal && isWinner(state, "red")}
            />
          </div>

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
                <div className="border-t border-border/60 pt-3" data-testid="hub-gold" aria-label="Gold lead">
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
