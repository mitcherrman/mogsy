/**
 * Presentation pieces for the production live viewer.
 *
 * Blue/red sides are carried by a thin accent bar and a tinted value, never
 * by flooding whole rows with colour — the scoreboard has to stay readable
 * for the twenty minutes someone might leave it open.
 */
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { resolveAssetUrl, type ChampionManifest } from "@/hooks/useChampionAssets";
import type {
  GoldPoint,
  LiveEvent,
  LiveGameSummary,
  LivePlayer,
  LiveTeamState,
  MatchInsightsResponse,
} from "@/lib/live-esports/api";
import { buildStory, emptyInsightReason, insightRows } from "./insights";
import {
  DRAGON_LABEL,
  EVENT_LABEL,
  SCOPE_TITLE,
  SERIES_SCORE_TITLE,
  agoLabel,
  clock,
  competitionLine,
  dragonCounts,
  gameClock,
  kgold,
  matchDateShort,
  matchDateTitle,
  matchLine,
  matchTitle,
  num,
  pct,
  scopeLabel,
  seriesContext,
  statusLabel,
  statusTone,
  teamLabel,
} from "./lib";

/* ── status pill ─────────────────────────────────────────────────────────── */

export function StatusPill({
  freshness,
  className,
}: {
  freshness: LiveGameSummary["freshness"] | null | undefined;
  className?: string;
}) {
  const tone = statusTone(freshness);
  const label = statusLabel(freshness);
  const ago = agoLabel(freshness?.seconds_since_success);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide",
          tone === "live" && "bg-emerald-500/15 text-emerald-400",
          tone === "delayed" && "bg-amber-500/15 text-amber-400",
          tone === "stale" && "bg-orange-500/15 text-orange-400",
          tone === "done" && "bg-muted text-muted-foreground",
          tone === "none" && "bg-muted text-muted-foreground",
        )}
      >
        {tone === "live" && (
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
        )}
        {label}
      </span>
      {/* Age is shown whenever the data is NOT fresh, so nothing stale can
          quietly read as current. */}
      {ago && tone !== "live" && tone !== "done" && (
        <span className="text-[11px] text-muted-foreground">{ago}</span>
      )}
    </span>
  );
}

/* ── match selector ──────────────────────────────────────────────────────── */

export function MatchCard({
  game,
  selected,
  onSelect,
}: {
  game: LiveGameSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const ctx = seriesContext(game, true);
  const cl = gameClock(game);
  const date = matchDateShort(game);
  // The stage sits on the card because it is what distinguishes two
  // otherwise identical-looking fixtures; the tournament name and
  // domestic/international scope are left to the header, which has room.
  const stage = game.competition?.stage?.round_name || game.block_name;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "min-w-[220px] shrink-0 snap-start rounded-lg border px-3 py-2.5 text-left transition",
        "hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary bg-primary/5" : "border-border bg-card",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {game.league?.name || game.league?.slug || "—"}
          {stage ? <span className="normal-case"> · {stage}</span> : null}
        </span>
        <StatusPill freshness={game.freshness} />
      </div>
      <div className="mt-1 truncate text-sm font-semibold">{matchTitle(game)}</div>
      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
        {date && (
          <span className="shrink-0" title={matchDateTitle(game)}>
            {date}
          </span>
        )}
        {ctx && (
          <span className="truncate" title={SERIES_SCORE_TITLE}>
            {ctx}
          </span>
        )}
        {cl && <span className="tabular-nums">{cl}</span>}
      </div>
    </button>
  );
}

/* ── selected-match context ──────────────────────────────────────────────── */

/**
 * Two lines that answer, at a glance: what competition is this, and which
 * game of it am I looking at.
 *
 *   LCP · Split 3 2026 · Play-Ins · Round 2      [Domestic]
 *   Aug 16, 2026 · Bo5 · Game 5 · Series 2–2 · 41:07 · Patch 16.15
 *
 * Nothing here is manufactured. Missing metadata drops its segment: a game
 * with no synced league region shows no scope chip, and a group-phase game
 * shows the schedule's "Week 12" rather than an invented "Regular Season".
 */
export function MatchContext({ game }: { game: LiveGameSummary }) {
  const competition = competitionLine(game);
  const match = matchLine(game);
  const scope = scopeLabel(game.competition);
  if (!competition.length && !match.length) return null;
  return (
    <div className="mt-1 space-y-0.5">
      {competition.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
          <span className="font-medium text-foreground/90">
            {competition.join(" · ")}
          </span>
          {scope && (
            <span
              title={SCOPE_TITLE[scope]}
              className={cn(
                "rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide",
                scope === "International"
                  ? "bg-violet-500/15 text-violet-400"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {scope}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
        {match.map((part, i) => (
          <span key={part.kind} title={part.title}>
            {i > 0 && <span className="mr-1.5">·</span>}
            <span className={part.kind === "clock" ? "tabular-nums" : undefined}>
              {part.text}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── match insights (Phase 4B2) ──────────────────────────────────────────── */

/**
 * A compact grid of derived facts, sitting between the match context and the
 * scoreboard so the state of a game is readable in a couple of seconds.
 *
 * Deliberately small: four to six one-line cards, no charts and no per-row
 * iconography. The surfaces below already carry the detail, and an insight
 * panel that needs scrolling has stopped being a summary.
 */
export function MatchInsights({
  insights,
  game,
  loading,
}: {
  insights: MatchInsightsResponse | null | undefined;
  game: LiveGameSummary;
  loading?: boolean;
}) {
  const rows = insightRows(insights, game);
  const story = buildStory(insights, game);
  const reason = emptyInsightReason(insights);

  if (loading && !insights) {
    return (
      <SectionCard title="Match insights">
        <Skeleton className="h-24" />
      </SectionCard>
    );
  }
  // Nothing derivable and nothing to explain: the game simply is not there
  // yet, and an empty card would be worse than no card.
  if (!rows.length && !reason) return null;

  return (
    <SectionCard title="Match insights">
      {rows.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <div
              key={row.key}
              title={row.title}
              className="rounded-md border bg-muted/20 px-3 py-2"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {row.label}
              </p>
              {/* Wraps rather than truncates: a five-objective window reads
                  "Baron · Dragon · 3 Inhibitors · 8 towers · 5 kills", and
                  an ellipsis there would hide the half that answers the
                  question. The grid equalises the row height anyway. */}
              <p
                className={cn(
                  "mt-0.5 text-sm font-semibold tabular-nums",
                  row.side === "blue" && "text-sky-400",
                  row.side === "red" && "text-rose-400",
                )}
              >
                {row.value}
              </p>
              {row.detail && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {row.detail}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyNote>{reason}</EmptyNote>
      )}

      {/* The same facts, joined into sentences — assembled from the numbers
          above, never written by a model. */}
      {story.length > 0 && (
        <div className="mt-3 border-t pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Game story
          </p>
          <p className="mt-1 text-sm leading-relaxed text-foreground/90">
            {story.join(" ")}
          </p>
        </div>
      )}
    </SectionCard>
  );
}

/* ── team scoreboard ─────────────────────────────────────────────────────── */

function ObjectiveStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function TeamPanel({
  side,
  team,
  state,
  winner,
}: {
  side: "blue" | "red";
  team: LiveGameSummary["teams"]["blue"];
  state: LiveTeamState | null | undefined;
  winner?: boolean;
}) {
  const dragons = dragonCounts((state as { dragons?: unknown })?.dragons);
  const dragonTotal = Object.values(dragons).reduce((a, b) => a + b, 0);
  return (
    <div
      className={cn(
        "relative rounded-lg border bg-card p-3 sm:p-4",
        side === "blue" ? "border-sky-500/30" : "border-rose-500/30",
      )}
    >
      <span
        className={cn(
          "absolute inset-x-0 top-0 h-0.5 rounded-t-lg",
          side === "blue" ? "bg-sky-500" : "bg-rose-500",
        )}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-bold">{teamLabel(team)}</span>
            {winner && (
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                WINNER
              </Badge>
            )}
          </div>
          {team?.name && team.name !== team.code && (
            <div className="truncate text-xs text-muted-foreground">{team.name}</div>
          )}
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Kills</div>
          <div
            className={cn(
              "text-2xl font-bold leading-none tabular-nums",
              side === "blue" ? "text-sky-400" : "text-rose-400",
            )}
          >
            {num(state?.kills)}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-1 border-t pt-3">
        <ObjectiveStat label="Gold" value={kgold(state?.total_gold)} />
        <ObjectiveStat label="Towers" value={num(state?.towers)} />
        <ObjectiveStat label="Drakes" value={state ? String(dragonTotal) : "—"} />
        <ObjectiveStat label="Barons" value={num(state?.barons)} />
        <ObjectiveStat label="Inhibs" value={num(state?.inhibitors)} />
      </div>
      {dragonTotal > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {Object.entries(dragons).map(([type, count]) => (
            <span
              key={type}
              className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              {DRAGON_LABEL[type] || type}
              {count > 1 ? ` ×${count}` : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── player rows ─────────────────────────────────────────────────────────── */

function ChampionIcon({
  championId,
  championName,
  manifest,
}: {
  championId: string | null;
  championName: string | null;
  manifest: ChampionManifest | null | undefined;
}) {
  const [failed, setFailed] = useState(false);
  const key = championName || championId || "";
  const asset = key ? manifest?.champions?.[key] : undefined;
  const src = resolveAssetUrl(asset?.icon);
  if (!src || failed) {
    // Honest placeholder: the champion's initials, never a wrong portrait.
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">
        {(key || "?").slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={key}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-8 w-8 shrink-0 rounded object-cover"
    />
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 rounded bg-muted/40 px-2 py-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-xs font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function PlayerRow({
  player,
  side,
  manifest,
}: {
  player: LivePlayer;
  side: "blue" | "red";
  manifest: ChampionManifest | null | undefined;
}) {
  const [open, setOpen] = useState(false);
  const p = player as unknown as Record<string, number | string | null>;
  const items = Array.isArray((player as { items?: unknown }).items)
    ? ((player as { items: unknown[] }).items as Array<Record<string, unknown>>)
    : [];
  const unresolved = (player.resolution_method || "").startsWith("unresolved");

  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2 py-2 text-left transition hover:bg-muted/40 sm:gap-3 sm:px-3"
      >
        <ChampionIcon
          championId={player.champion_id}
          championName={player.resolved_champion_name}
          manifest={manifest}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">
              {player.resolved_player_name || player.summoner_name || "Unknown"}
            </span>
            {/* An unresolved identity is shown as such rather than silently
                presenting the raw in-game name as a canonical player. */}
            {unresolved && (
              <span className="shrink-0 text-[10px] text-muted-foreground" title="Identity not resolved">
                ?
              </span>
            )}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {player.resolved_champion_name || player.champion_id || "—"}
          </div>
        </div>
        <div className="hidden w-14 text-right text-xs tabular-nums text-muted-foreground sm:block">
          {player.level == null ? "—" : `Lv ${player.level}`}
        </div>
        <div className="w-16 text-right text-sm tabular-nums sm:w-20">
          <span className="font-semibold">
            {num(player.kills)}/{num(player.deaths)}/{num(player.assists)}
          </span>
        </div>
        <div className="hidden w-12 text-right text-xs tabular-nums text-muted-foreground sm:block">
          {num(player.creep_score)}
        </div>
        <div
          className={cn(
            "w-14 text-right text-xs font-medium tabular-nums",
            side === "blue" ? "text-sky-400" : "text-rose-400",
          )}
        >
          {kgold(player.total_gold)}
        </div>
        <div className="hidden items-center gap-0.5 md:flex">
          {items.slice(0, 6).map((it, i) => (
            <span
              key={i}
              className="h-5 w-5 rounded-sm bg-muted"
              title={String((it as { name?: string }).name ?? "")}
            />
          ))}
        </div>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="bg-muted/20 px-2 pb-3 pt-1 sm:px-3">
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
            <Detail label="AD" value={num(p.attack_damage as number)} />
            <Detail label="AP" value={num(p.ability_power as number)} />
            <Detail label="Armor" value={num(p.armor as number)} />
            <Detail label="MR" value={num(p.magic_resistance as number)} />
            <Detail label="Atk Spd" value={num(p.attack_speed as number)} />
            <Detail
              label="HP"
              value={
                p.current_health == null || p.max_health == null
                  ? "—"
                  : `${p.current_health}/${p.max_health}`
              }
            />
            <Detail label="CS" value={num(player.creep_score)} />
            <Detail label="Level" value={num(player.level)} />
            <Detail label="Wards" value={num(p.wards_placed as number)} />
            <Detail label="Wards killed" value={num(p.wards_destroyed as number)} />
            <Detail label="Kill part." value={pct(p.kill_participation as number)} />
            <Detail label="Dmg share" value={pct(p.champion_damage_share as number)} />
          </div>
          {items.length > 0 && (
            <div className="mt-2">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Items
              </div>
              <div className="flex flex-wrap gap-1">
                {items.map((it, i) => (
                  <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                    {String((it as { name?: string }).name ?? (it as { id?: unknown }).id ?? "?")}
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* Runes and skill order are only rendered when the feed actually
              supplied them; an empty section would imply "none taken". */}
          <RuneOrSkillBlock label="Runes" raw={(player as { runes?: unknown }).runes} />
          <RuneOrSkillBlock label="Skill order" raw={(player as { abilities?: unknown }).abilities} />
        </div>
      )}
    </div>
  );
}

function RuneOrSkillBlock({ label, raw }: { label: string; raw: unknown }) {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length === 0) return null;
  return (
    <div className="mt-2">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1">
        {list.map((r, i) => (
          <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
            {typeof r === "string"
              ? r
              : String((r as { name?: string }).name ?? (r as { id?: unknown }).id ?? "?")}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── gold chart ──────────────────────────────────────────────────────────── */

export function GoldChart({
  series,
  downsampled,
}: {
  series: GoldPoint[];
  downsampled: boolean;
}) {
  if (series.length < 2) {
    return (
      <EmptyNote>Not enough gold history yet for a chart.</EmptyNote>
    );
  }
  const data = series.map((p) => ({ t: p.t ?? 0, diff: p.diff }));
  return (
    <div>
      <div className="h-40 w-full sm:h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="blueLead" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(199 89% 55%)" stopOpacity={0.5} />
                <stop offset="100%" stopColor="hsl(199 89% 55%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={(v) => clock(Number(v))}
              tick={{ fontSize: 10 }}
              stroke="currentColor"
              className="text-muted-foreground"
            />
            <YAxis
              tickFormatter={(v) => (Math.abs(Number(v)) >= 1000 ? `${(Number(v) / 1000).toFixed(0)}k` : String(v))}
              tick={{ fontSize: 10 }}
              stroke="currentColor"
              className="text-muted-foreground"
            />
            <Tooltip
              contentStyle={{ fontSize: 12 }}
              labelFormatter={(v) => `Game time ${clock(Number(v))}`}
              formatter={(v: number) => [
                `${v >= 0 ? "Blue" : "Red"} +${Math.abs(v).toLocaleString()}`,
                "Gold lead",
              ]}
            />
            <ReferenceLine y={0} className="stroke-border" />
            <Area
              type="monotone"
              dataKey="diff"
              stroke="hsl(199 89% 55%)"
              fill="url(#blueLead)"
              strokeWidth={2}
              isAnimationActive={false}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Gold lead — above zero favours blue side.
        {downsampled && " Sampled from the full timeline."}
      </p>
    </div>
  );
}

/* ── event timeline ──────────────────────────────────────────────────────── */

export function EventTimeline({
  events,
  firstFrameTs,
}: {
  events: LiveEvent[];
  firstFrameTs: string | null;
}) {
  if (!events.length) {
    return <EmptyNote>No objective events recorded yet.</EmptyNote>;
  }
  const t0 = firstFrameTs ? Date.parse(firstFrameTs) : NaN;
  return (
    <ol className="space-y-1.5">
      {events.map((e, i) => {
        const at = Date.parse(e.frame_ts);
        const rel =
          Number.isFinite(t0) && Number.isFinite(at) && at >= t0
            ? clock(Math.floor((at - t0) / 1000))
            : null;
        return (
          <li key={`${e.frame_ts}-${e.event_type}-${i}`} className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                e.side === "blue" ? "bg-sky-500" : e.side === "red" ? "bg-rose-500" : "bg-muted-foreground",
              )}
            />
            {/* "~" because these are derived by diffing consecutive frames,
                not read from Riot-native events — the ordering is real, the
                second-precision is not. */}
            <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">
              {rel ? `~${rel}` : "—"}
            </span>
            <span className="truncate">
              {EVENT_LABEL[e.event_type] || e.event_type}
              {e.count && e.count > 1 ? ` ×${e.count}` : ""}
              {e.detail ? ` · ${e.detail}` : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ── shared states ───────────────────────────────────────────────────────── */

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-center text-sm text-muted-foreground">{children}</p>;
}

export function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function LoadingBoard() {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
