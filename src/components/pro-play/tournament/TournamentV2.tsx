/**
 * The v2 tournament page body (Worlds 2026, PW4-B), on the backend's
 * `tournament_context_v2` (PW4-A).
 *
 * PHASE-AWARE. The header always says where the event stands: the live
 * match, the next one, the transition between stages, or the champion. The
 * sections below re-order by phase (`sectionOrderV2`): before the event the
 * Play-In and the field lead; during a stage, today and that stage; between
 * stages, the stage coming next; at the end, the bracket and its champion.
 *
 * HONEST STATES. No schedule at all is "Schedule unavailable", never a
 * pre-event page. A partial schedule, missing standings and a stale copy are
 * each said once, at the top, and the claims they cannot support are not
 * drawn (see `TournamentBracket.tsx`). Lineups the backend has not certified
 * are not listed, and no list is left empty in their place.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Brain, CalendarDays, Check, MapPin, RefreshCw, Search } from "lucide-react";

import { HubKicker } from "@/components/pro-play/hub/HubSection";
import { PlayerPortrait, TeamCrest } from "@/components/pro-play/media/EntityCrest";
import { EventMark } from "@/components/pro-play/media/EventMark";
import { countdown, localStart } from "@/lib/pro-play/hubSeries";
import { PRO_PLAY_QUIZ_ROUTE, PRO_PLAY_ROUTE, PRO_PLAY_SEARCH_ROUTE, proPlayProfileUrl } from "@/lib/pro-play/routes";
import type {
  TournamentMatchV2,
  TournamentParticipantV2,
  TournamentResponseV2,
  TournamentStageV2,
} from "@/lib/pro-play/tournamentApi";
import { ROLE_LABEL, dateRange, dayLabel, matchHref, matchesByDay, todaysMatches } from "@/lib/pro-play/tournamentView";
import {
  defaultScheduleStage,
  displayName,
  fieldByRegionV2,
  freshness,
  lineupsWithheld,
  matchCaption,
  phaseLabelV2,
  playInSwissSlot,
  sectionOrderV2,
  stageMatches,
  stageOf,
  stageProgress,
  stageShortName,
  type V2SectionKey,
} from "@/lib/pro-play/tournamentV2View";
import { cn } from "@/lib/utils";

import { ChampionBanner, DoubleElimStage, SingleElimStage } from "./TournamentBracket";
import { SwissStage } from "./TournamentSwiss";
import { CARD, MatchLines, Notice, Section, TeamLine, TournamentKitProvider, useKit } from "./TournamentParts";

/** "23 Oct" for a registry calendar date ("2026-10-23"). */
const calendarDate = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

const countWord = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ── header ─────────────────────────────────────────────────────────────── */

const PROGRESS_CHIP: Record<"current" | "complete" | "next", { label: string; className: string }> = {
  current: { label: "Now", className: "bg-emerald-500 text-emerald-950" },
  complete: { label: "Complete", className: "bg-muted text-foreground/80" },
  next: { label: "Next", className: "border border-cyan-400/80 text-cyan-300" },
};

function StagePath() {
  const { ctx, state } = useKit();
  return (
    <ol className="grid gap-2 md:grid-cols-3" aria-label="Stages" data-testid="stage-path">
      {ctx.stages.map((s, i) => {
        const progress = stageProgress(s, state, ctx);
        const chip = progress ? PROGRESS_CHIP[progress] : null;
        return (
          <li key={s.key} data-testid="stage" data-stage={s.key} data-progress={progress ?? "none"}>
            <a
              href={`#tournament-stage-${s.key}`}
              className={cn(
                CARD,
                "group flex h-full flex-col gap-1 px-3 py-2.5 transition-colors hover:border-[#c9a84c]/60",
                progress === "current" && "border-[#c9a84c]/60 bg-[#c9a84c]/[0.05]",
              )}
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold tabular-nums",
                    progress === "complete" ? "border-border bg-muted text-foreground/80" : "border-[#c9a84c]/60 text-[#e3c66f]",
                  )}
                  aria-hidden="true"
                >
                  {progress === "complete" ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className="text-sm font-semibold text-foreground">{s.name}</span>
                {chip && (
                  <span
                    className={cn("ml-auto rounded px-1.5 py-[3px] text-[9.5px] font-bold uppercase leading-none tracking-[0.12em]", chip.className)}
                    data-testid="stage-progress"
                  >
                    {chip.label}
                  </span>
                )}
              </span>
              <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 pl-7 text-xs text-muted-foreground">
                <span className="tabular-nums">{dateRange(s.starts, s.ends)}</span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" aria-hidden="true" />
                  {s.venue}
                </span>
              </span>
            </a>
          </li>
        );
      })}
    </ol>
  );
}

function Header() {
  const { ctx, state } = useKit();
  const swissEntrants = ctx.participants.filter((p) => p.entry_stage === "swiss").length;
  const playInEntrants = ctx.participants.filter((p) => p.entry_stage === "play_in").length;
  return (
    <header className="space-y-5 border-b border-border/60 pb-6 pt-2">
      <Link
        to={PRO_PLAY_ROUTE}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:min-h-0"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Pro Play
      </Link>
      <div className="flex items-start gap-4">
        <EventMark name={ctx.short_name} slug={ctx.league.slug} size="lg" />
        <div className="min-w-0 space-y-1.5">
          <HubKicker>
            <span>
              Tournament · <span data-testid="tournament-phase">{phaseLabelV2(state, ctx)}</span>
            </span>
          </HubKicker>
          <h1 className="text-xl font-bold leading-tight text-foreground sm:text-3xl">{ctx.name}</h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              {dateRange(ctx.starts, ctx.ends)}
            </span>
            <span data-testid="field-count">
              {countWord(ctx.participants.length, "team")} · {countWord(ctx.regions.length, "region")}
            </span>
            {swissEntrants > 0 && playInEntrants > 0 && (
              <span className="hidden sm:inline">
                {swissEntrants} straight to Swiss · {playInEntrants} in the Play-In
              </span>
            )}
          </p>
        </div>
      </div>
      <StatusPanel />
      <StagePath />
    </header>
  );
}

/* ── status (the header's "what now") ───────────────────────────────────── */

function NextPanel({ match }: { match: TournamentMatchV2 }) {
  const kit = useKit();
  const href = matchHref(match);
  const [a, b] = match.teams;
  return (
    <div className={cn(CARD, "p-4")} data-testid="next-match">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="font-semibold uppercase tracking-[0.12em] text-[#c9a84c]">Next match</span>
        <span className="font-semibold uppercase tracking-[0.1em] text-foreground/80">{matchCaption(match, kit)}</span>
        <span className="tabular-nums">{localStart(match.scheduled_start)}</span>
        <span className="tabular-nums text-cyan-300">{countdown(match.scheduled_start, kit.now)}</span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <TeamLine team={a} match={match} />
        <span className="text-sm font-semibold text-muted-foreground">vs</span>
        <TeamLine team={b} match={match} align="right" />
      </div>
      {href && (
        <Link to={href} className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-[#e3c66f] hover:underline sm:min-h-0">
          Open in the match centre <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

function TransitionPanel() {
  const kit = useKit();
  const { ctx, state } = kit;
  const detail = state.phase_detail;
  if (!detail) return null;
  const done = stageOf(ctx, detail.completed_stage);
  const next = stageOf(ctx, detail.next_stage);
  const firstNext = stageMatches(state, detail.next_stage).find((m) => m.state === "upcoming");
  const facts: ReactNode[] = [];
  if (detail.completed_stage === "play_in") {
    const slot = playInSwissSlot(ctx, state);
    if (slot.code) {
      facts.push(
        <span key="w">
          <span className="font-semibold text-foreground">{slot.code}</span>{" "}
          {slot.basis === "placed" ? "takes the Play-In slot in Swiss" : "won the Play-In"}
        </span>,
      );
    }
    if (state.play_in.bracket_authority === "standings" && state.play_in.eliminated.length) {
      facts.push(<span key="e">Out: {state.play_in.eliminated.join(", ")}</span>);
    }
  }
  if (detail.completed_stage === "swiss") {
    const advanced = state.swiss.records.filter((r) => r.status === "advanced").map((r) => r.code);
    if (advanced.length) {
      facts.push(
        <span key="a">
          Advanced: <span className="font-semibold text-foreground">{advanced.join(", ")}</span>
        </span>,
      );
    }
  }
  return (
    <div className={cn(CARD, "space-y-2 border-[#c9a84c]/40 p-4")} data-testid="stage-transition">
      <p className="text-base font-semibold text-foreground">
        {stageShortName(done)} complete
        {next && (
          <span className="font-normal text-muted-foreground">
            {" — "}
            {stageShortName(next)} begins {calendarDate(next.starts)} in {next.venue}
          </span>
        )}
      </p>
      {facts.length > 0 && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground" data-testid="transition-facts">
          {facts}
        </p>
      )}
      {firstNext && (
        <p className="text-xs text-muted-foreground">
          First {stageShortName(next)} match: <span className="tabular-nums text-foreground/85">{localStart(firstNext.scheduled_start)}</span>{" "}
          <span className="tabular-nums text-cyan-300">{countdown(firstNext.scheduled_start, kit.now)}</span>
          {firstNext.teams.every((t) => t.tbd) && " · teams to be drawn"}
        </p>
      )}
    </div>
  );
}

function StatusPanel() {
  const kit = useKit();
  const { state } = kit;
  if (state.phase === "complete") return <ChampionBanner />;
  const live = state.matches.filter((m) => m.state === "live");
  const next = state.matches.find((m) => m.match_id === state.next_match_id) ?? null;
  if (live.length) {
    return (
      <div className="space-y-2" data-testid="live-now">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-400">Live now</p>
        <MatchLines matches={live} />
        {next && (
          <p className="text-xs text-muted-foreground">
            Next: {matchCaption(next, kit)} · <span className="tabular-nums">{localStart(next.scheduled_start)}</span>
          </p>
        )}
      </div>
    );
  }
  if (state.phase === "between_stages") return <TransitionPanel />;
  if (next) return <NextPanel match={next} />;
  return null;
}

/* ── field ──────────────────────────────────────────────────────────────── */

function EntryTag({ team }: { team: TournamentParticipantV2 }) {
  if (team.entry_stage === "play_in") {
    return (
      <span className="rounded border border-cyan-400/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-cyan-200" data-testid="entry-tag">
        Play-In
      </span>
    );
  }
  if (team.entry_stage === "swiss") {
    return (
      <span className="rounded border border-[#c9a84c]/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#e3c66f]" data-testid="entry-tag">
        Swiss{typeof team.swiss_tier === "number" ? ` · T${team.swiss_tier}` : ""}
      </span>
    );
  }
  return null;
}

/** A team's standing in the event, only as served: champion, out, a Swiss record. */
function useTeamStatus(code: string) {
  const { state } = useKit();
  const ko = state.knockout.bracket_authority === "standings";
  const pi = state.play_in.bracket_authority === "standings";
  if (ko && state.knockout.champion_code === code) return { label: "Champion", tone: "gold" as const };
  if ((ko && state.knockout.eliminated.includes(code)) || (pi && state.play_in.eliminated.includes(code))) {
    return { label: "Out", tone: "muted" as const };
  }
  const rec = state.swiss.records.find((r) => r.code === code);
  if (rec?.status === "eliminated") return { label: `Out · ${rec.wins}–${rec.losses}`, tone: "muted" as const };
  if (rec) return { label: `${rec.wins}–${rec.losses}`, tone: rec.status === "advanced" ? ("gold" as const) : ("plain" as const) };
  return null;
}

function FieldTeam({ team }: { team: TournamentParticipantV2 }) {
  const status = useTeamStatus(team.code);
  const name = displayName(team);
  return (
    <li className="py-2" data-testid="field-team" data-team={team.code}>
      <div className="flex min-w-0 items-center gap-3">
        <TeamCrest teamKey={team.team_key} name={name} shortCode={team.code} size="sm" />
        <div className="min-w-0 flex-1">
          <Link
            to={proPlayProfileUrl("team", team.team_key)}
            className="block truncate text-sm font-semibold text-foreground hover:underline"
            title={name === team.team_key ? name : `${name} (${team.team_key})`}
          >
            {name}
          </Link>
          <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            {team.code}
            {team.qualification ? ` · ${team.qualification}` : ""}
          </p>
        </div>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <EntryTag team={team} />
          {status && (
            <span
              data-testid="team-status"
              className={cn(
                "text-[10px] font-bold uppercase tabular-nums tracking-[0.08em]",
                status.tone === "gold" ? "text-[#e3c66f]" : "text-muted-foreground",
              )}
            >
              {status.label}
            </span>
          )}
        </span>
      </div>
      {team.lineup_status === "registered" && team.lineup.length > 0 && (
        <ul className="mt-2 space-y-1 pl-11" aria-label={`${team.team_key} tournament lineup`}>
          {team.lineup.map((slot) => (
            <li key={slot.role} className="flex min-h-7 items-center gap-2">
              <span className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{ROLE_LABEL[slot.role]}</span>
              <PlayerPortrait playerKey={slot.player_key} name={slot.handle} size="xs" />
              <Link to={proPlayProfileUrl("player", slot.player_key)} className="min-w-0 truncate text-sm text-foreground/90 hover:underline">
                {slot.handle}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Field() {
  const { ctx } = useKit();
  const regions = fieldByRegionV2(ctx);
  return (
    <div className="space-y-3">
      {lineupsWithheld(ctx) && (
        <p className="text-xs text-muted-foreground" data-testid="lineups-withheld">
          Rosters aren't listed: no official {ctx.short_name} lineups have been registered and certified yet. Team pages show each roster's own history.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {regions.map((g) => (
          <div key={g.region} className={cn(CARD, "px-3 py-2")} data-testid="field-region" data-region={g.region}>
            <p className="flex items-center justify-between pt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#c9a84c]">
              {g.region}
              <span className="font-semibold text-muted-foreground">{countWord(g.teams.length, "team")}</span>
            </p>
            <ul className="divide-y divide-border/40">
              {g.teams.map((t) => (
                <FieldTeam key={t.code} team={t} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── schedule ───────────────────────────────────────────────────────────── */

function Schedule() {
  const { ctx, state } = useKit();
  const [filter, setFilter] = useState<string | null>(null);
  const stages = ctx.stages.filter((s) => state.matches.some((m) => m.stage === s.key));
  const initial = defaultScheduleStage(state, ctx);
  const active = filter ?? (stages.some((s) => s.key === initial) ? initial : "all");
  const shown = active === "all" ? state.matches : state.matches.filter((m) => m.stage === active);
  const days = matchesByDay(shown);
  const options = [{ key: "all", label: "All", count: state.matches.length }].concat(
    stages.map((s) => ({ key: s.key, label: stageShortName(s), count: state.matches.filter((m) => m.stage === s.key).length })),
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter the schedule by stage">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            aria-pressed={active === o.key}
            data-testid="schedule-filter"
            data-stage={o.key}
            onClick={() => setFilter(o.key)}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors sm:min-h-8",
              active === o.key ? "border-[#c9a84c]/70 bg-[#c9a84c]/[0.1] text-[#e3c66f]" : "border-border/70 text-muted-foreground hover:bg-muted/30",
            )}
          >
            {o.label}
            <span className="tabular-nums opacity-70">{o.count}</span>
          </button>
        ))}
      </div>
      <div className="space-y-4" data-testid="schedule-days">
        {days.map((d) => (
          <div key={d.day} className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{dayLabel(d.day)}</p>
            <MatchLines matches={d.matches as TournamentMatchV2[]} withStage={active === "all"} showDay={false} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── sections ───────────────────────────────────────────────────────────── */

function stageTitle(stage: TournamentStageV2, teams: number, bestOf: string) {
  const kind =
    stage.bracket === "double_elimination"
      ? "Double elimination"
      : stage.bracket === "single_elimination"
        ? "Single elimination"
        : stage.bracket === "swiss" && stage.wins_to_advance && stage.losses_to_eliminate
          ? `${stage.wins_to_advance} wins advance, ${stage.losses_to_eliminate} losses eliminate`
          : null;
  return [teams > 0 ? countWord(teams, "team") : null, kind, bestOf || null].filter(Boolean).join(" · ");
}

/**
 * How many teams a stage holds: two per match of its opening cell or round in
 * upstream's standings (Upper Semifinals 2 → 4, Round 1 8 → 16,
 * Quarterfinals 4 → 8). Without standings, the registry's entrants for the
 * stage, else nothing. Never hardcoded.
 */
function stageTeamCount(
  stage: TournamentStageV2,
  matches: readonly TournamentMatchV2[],
  rounds: Record<string, string[]>,
  participants: readonly TournamentParticipantV2[],
) {
  if (stage.bracket === "swiss" && rounds["1"]?.length) return rounds["1"].length * 2;
  const firstCell = matches[0]?.bracket?.cell;
  if (stage.bracket !== "swiss" && firstCell) return matches.filter((m) => m.bracket?.cell === firstCell).length * 2;
  return participants.filter((p) => p.entry_stage === stage.key).length;
}

function StageSection({ stage }: { stage: TournamentStageV2 }) {
  const { ctx, state } = useKit();
  const summary = stage.key === "play_in" ? state.play_in : stage.key === "knockout" ? state.knockout : null;
  const matches = stageMatches(state, stage.key, summary);
  if (stage.key !== "swiss" && matches.length === 0) return null;
  const formats = [...new Set(matches.map((m) => m.best_of).filter(Boolean))].sort().map((n) => `Bo${n}`).join(" / ");
  const teams = stageTeamCount(stage, matches, state.swiss.rounds, ctx.participants);
  let body: ReactNode;
  if (stage.bracket === "double_elimination" && summary) {
    body = <DoubleElimStage stage={stage} summary={summary} matches={matches} />;
  } else if (stage.bracket === "single_elimination" && summary) {
    body = <SingleElimStage stage={stage} summary={summary} matches={matches} />;
  } else if (stage.bracket === "swiss") {
    body = <SwissStage stage={stage} matches={matches} />;
  } else {
    body = <MatchLines matches={matches} withStage={false} />;
  }
  return (
    <Section
      id={`stage-${stage.key}`}
      kicker={
        <>
          {stage.name} · {stage.venue}
        </>
      }
      title={stageTitle(stage, teams, formats)}
      aside={<span className="text-xs tabular-nums text-muted-foreground">{dateRange(stage.starts, stage.ends)}</span>}
    >
      {stage.key === "knockout" && state.phase !== "complete" && <ChampionBanner />}
      {body}
    </Section>
  );
}

function Today() {
  const { state, now } = useKit();
  const today = todaysMatches(state.matches, now) as TournamentMatchV2[];
  if (!today.length) return null;
  return (
    <Section id="today" kicker="Today" title={countWord(today.length, "match", "matches")}>
      <MatchLines matches={today} />
    </Section>
  );
}

function Notices({ data, onRetry, retrying, refreshFailed }: {
  data: TournamentResponseV2;
  onRetry?: () => void;
  retrying?: boolean;
  refreshFailed?: boolean;
}) {
  const { state, ctx } = useKit();
  const fresh = freshness(data);
  const out: ReactNode[] = [];
  const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : null);
  const retry = onRetry && (
    <button
      type="button"
      onClick={onRetry}
      disabled={retrying}
      className="inline-flex min-h-8 items-center gap-1 rounded border border-current/40 px-2 text-[11px] font-semibold disabled:opacity-60"
    >
      <RefreshCw className={cn("h-3 w-3", retrying && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
      Try again
    </button>
  );
  // The browser could not reach the service on a background refresh: the page
  // keeps the last good answer, and says it is that, not a fresh read.
  if (refreshFailed) {
    out.push(
      <Notice key="refresh" testId="notice-refresh-failed" action={retry}>
        <span className="font-semibold">Couldn't get the latest update.</span> What's shown is from the last successful response
        {time(data.generated_at) ? ` (${time(data.generated_at)})` : ""}; it will update when the service answers again.
      </Notice>,
    );
  }
  if (state.phase === "unknown") {
    out.push(
      <Notice key="unknown" testId="notice-unknown" action={retry}>
        <span className="font-semibold">Schedule unavailable.</span> The official schedule couldn't be read, so matches, brackets and results aren't shown.
        The field{ctx.stages.some((s) => s.key === "swiss") ? " and the Swiss seeding" : ""} below come from the tournament registry.
      </Notice>,
    );
  } else if (fresh.stale) {
    const which = fresh.scheduleStale && fresh.standingsStale ? "schedule and standings" : fresh.standingsStale ? "standings" : "schedule";
    out.push(
      <Notice key="stale" testId="notice-stale" action={retry}>
        Showing a recent copy of the official {which}
        {time(fresh.fetchedAt) ? ` from ${time(fresh.fetchedAt)}` : ""}: the live source isn't answering right now.
      </Notice>,
    );
  }
  if (state.phase !== "unknown" && state.coverage.complete === false) {
    out.push(
      <Notice key="partial" testId="notice-partial">
        <span className="font-semibold">Partial schedule.</span> {state.coverage.found_matches} of {state.coverage.expected_matches} matches could be read
        from the official schedule. Missing matches aren't shown, and stage outcomes are only stated where they are verified on their own.
      </Notice>,
    );
  }
  if (state.phase !== "unknown" && state.coverage.basis === "unverified") {
    out.push(
      <Notice key="standings" testId="notice-standings">
        The official standings aren't available right now, so bracket positions, advancement and eliminations aren't shown. Times and results still are.
      </Notice>,
    );
  }
  if (state.warnings.some((w) => w.kind === "results_behind_calendar")) {
    out.push(
      <Notice key="lag" tone="info" testId="notice-lag">
        Results may be behind the official calendar: the latest matches haven't been confirmed yet.
      </Notice>,
    );
  }
  return out.length ? <div className="space-y-2">{out}</div> : null;
}

function SourceLine({ data }: { data: TournamentResponseV2 }) {
  const fresh = freshness(data);
  if (!fresh.fetchedAt || fresh.stale) return null;
  const t = new Date(fresh.fetchedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return (
    <p className="text-[11px] text-muted-foreground" data-testid="source-line">
      Schedule, results and bracket from the official LoL Esports feed · updated {t}
    </p>
  );
}

function Body({ data, onRetry, retrying, refreshFailed }: {
  data: TournamentResponseV2;
  onRetry?: () => void;
  retrying?: boolean;
  refreshFailed?: boolean;
}) {
  const { ctx, state } = useKit();
  const order = sectionOrderV2(state, ctx);
  const render = (key: V2SectionKey): ReactNode => {
    if (key === "today") return state.phase === "unknown" ? null : <Today />;
    if (key === "field") {
      return (
        <Section
          id="field"
          kicker="Know the field"
          title={`${countWord(ctx.participants.length, "team")} from ${countWord(ctx.regions.length, "region")}`}
        >
          <Field />
        </Section>
      );
    }
    if (key === "schedule") {
      return state.matches.length > 0 ? (
        <Section id="schedule" kicker="Schedule" title="Every match, in your local time">
          <Schedule />
        </Section>
      ) : null;
    }
    const stage = stageOf(ctx, key.slice("stage:".length));
    return stage ? <StageSection stage={stage} /> : null;
  };
  return (
    <div className="space-y-10">
      <Notices data={data} onRetry={onRetry} retrying={retrying} refreshFailed={refreshFailed} />
      {order.map((key) => {
        const node = render(key);
        return node ? <div key={key}>{node}</div> : null;
      })}
      <div className="space-y-4 border-t border-border/60 pt-5">
        <SourceLine data={data} />
        <nav aria-label="More Pro Play" className="flex flex-wrap gap-2">
          <Link to={PRO_PLAY_QUIZ_ROUTE} className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border/70 px-3 text-sm hover:bg-muted/40">
            <Brain className="h-4 w-4 text-[#c9a84c]" aria-hidden="true" /> Pro Play quiz
          </Link>
          <Link to={PRO_PLAY_SEARCH_ROUTE} className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border/70 px-3 text-sm hover:bg-muted/40">
            <Search className="h-4 w-4 text-[#c9a84c]" aria-hidden="true" /> Search players and teams
          </Link>
        </nav>
      </div>
    </div>
  );
}

export default function TournamentV2({ data, now, onRetry, retrying, refreshFailed }: {
  data: TournamentResponseV2;
  now: number;
  onRetry?: () => void;
  retrying?: boolean;
  /** A background refetch failed in the browser; `data` is the last good one. */
  refreshFailed?: boolean;
}) {
  return (
    <TournamentKitProvider ctx={data.context} state={data.state} now={now}>
      <div className="space-y-8" data-testid="tournament-v2" data-phase={data.state.phase}>
        <Header />
        <Body data={data} onRetry={onRetry} retrying={retrying} refreshFailed={refreshFailed} />
      </div>
    </TournamentKitProvider>
  );
}
