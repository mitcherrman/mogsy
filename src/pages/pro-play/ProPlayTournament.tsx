/**
 * A tournament context page (DCGI1) — "know the field" before an event, its
 * matches, results and records while it runs.
 *
 * ONE SOURCE PER FACT. Identity, venues, the field and each team's
 * tournament lineup come from the backend's tournament registry; matches,
 * results, Swiss records and knockout placement come from upstream's own
 * schedule, derived per request. The page groups and labels them and never
 * computes a standing, a seed, an elimination or a prediction itself. Before
 * a match has finished there is no records table at all.
 *
 * LINEUPS ARE THE EVENT'S, NOT THE ROSTER. A lineup here is what the team
 * registered for this tournament (GAM's loaned jungler, RED's stand-in); the
 * team and player links lead to the ordinary profiles, which keep their own
 * roster truth.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Brain, CalendarDays, MapPin, Search } from "lucide-react";

import SEOHead from "@/components/SEOHead";
import { HubKicker } from "@/components/pro-play/hub/HubSection";
import MatchStateBadge from "@/components/pro-play/hub/MatchStateBadge";
import { PlayerPortrait, TeamCrest } from "@/components/pro-play/media/EntityCrest";
import { EventMark } from "@/components/pro-play/media/EventMark";
import { ProPlayMediaProvider } from "@/components/pro-play/media/ProPlayMediaProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { countdown, localStart } from "@/lib/pro-play/hubSeries";
import {
  PRO_PLAY_QUIZ_ROUTE,
  PRO_PLAY_ROUTE,
  PRO_PLAY_SEARCH_ROUTE,
  proPlayProfileUrl,
  proPlayTournamentUrl,
} from "@/lib/pro-play/routes";
import {
  TournamentNotFound,
  useTournament,
  type TournamentContext,
  type TournamentMatch,
  type TournamentMatchTeam,
  type TournamentParticipant,
  type TournamentPhase,
  type TournamentResponse,
} from "@/lib/pro-play/tournamentApi";
import {
  PHASE_LABEL,
  ROLE_LABEL,
  SECTION_ORDER,
  type SectionKey,
  bracketRounds,
  dateRange,
  dayLabel,
  fieldByRegion,
  matchHref,
  matchesByDay,
  participantsByCode,
  recordGroups,
  scoreText,
  todaysMatches,
} from "@/lib/pro-play/tournamentView";
import { cn } from "@/lib/utils";

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function Section({ id, kicker, title, children, aside }: {
  id: string;
  kicker: string;
  title?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} data-testid={`section-${id}`} className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-1">
          <HubKicker>{kicker}</HubKicker>
          {title && (
            <h2 id={`${id}-title`} className="text-base font-semibold text-foreground">
              {title}
            </h2>
          )}
          {!title && <h2 id={`${id}-title`} className="sr-only">{kicker}</h2>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

const CARD = "rounded-xl border border-border/70 bg-card/50";

/* ── teams ──────────────────────────────────────────────────────────────── */

function TeamChip({ team, byCode, align = "left", emphasis }: {
  team: TournamentMatchTeam;
  byCode: Map<string, TournamentParticipant>;
  align?: "left" | "right";
  emphasis?: "win" | "loss" | null;
}) {
  if (team.tbd || !team.code) {
    return (
      <span className={cn("flex min-w-0 items-center gap-2 text-sm text-muted-foreground", align === "right" && "flex-row-reverse text-right")}>
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-dashed border-border/70 text-[10px] font-semibold">
          ?
        </span>
        TBD
      </span>
    );
  }
  const p = byCode.get(team.code);
  const name = p?.team_key ?? team.upstream_name ?? team.code;
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-2",
        align === "right" && "flex-row-reverse text-right",
        emphasis === "loss" && "opacity-60",
      )}
    >
      <TeamCrest teamKey={p?.team_key} name={name} shortCode={team.code} size="sm" />
      <span className="min-w-0">
        <span className={cn("block text-sm font-semibold leading-tight", emphasis === "win" && "text-[#e3c66f]")}>
          {team.code}
        </span>
        <span className="hidden truncate text-[11px] text-muted-foreground sm:block">{name}</span>
      </span>
    </span>
  );
}

/* ── matches ────────────────────────────────────────────────────────────── */

function stageLabel(m: TournamentMatch) {
  const parts = [m.block_name ?? "Match"];
  if (m.best_of) parts.push(`Bo${m.best_of}`);
  return parts.join(" · ");
}

function MatchRow({ match, byCode, compact = false }: {
  match: TournamentMatch;
  byCode: Map<string, TournamentParticipant>;
  /** Always the stacked (phone) layout — for narrow columns like the bracket. */
  compact?: boolean;
}) {
  const score = scoreText(match);
  const href = matchHref(match);
  const [a, b] = match.teams;
  const outcome = (t: TournamentMatchTeam) =>
    match.state === "completed" ? (t.code && t.code === match.winner_code ? "win" : "loss") : null;
  const body = (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
      <TeamChip team={a} byCode={byCode} emphasis={outcome(a)} />
      <span
        className={cn(
          "min-w-12 text-center text-sm font-bold tabular-nums",
          score ? "text-foreground" : "text-muted-foreground",
        )}
        data-testid="match-score"
      >
        {score ?? "vs"}
      </span>
      <TeamChip team={b} byCode={byCode} align="right" emphasis={outcome(b)} />
    </div>
  );
  return (
    <li
      data-testid="tournament-match"
      data-match-id={match.match_id}
      data-state={match.state}
      className={cn("flex flex-col gap-2 px-3 py-2.5", !compact && "sm:flex-row sm:items-center sm:gap-4 sm:px-4")}
    >
      <div className={cn("flex shrink-0 items-center gap-2", !compact && "sm:w-44 sm:flex-col sm:items-start sm:gap-1")}>
        <span className="text-xs font-medium tabular-nums text-foreground/80">{localStart(match.scheduled_start)}</span>
        <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          {compact ? (match.best_of ? `Bo${match.best_of}` : null) : stageLabel(match)}
        </span>
        {/* Phones: the state rides the top line instead of taking its own. */}
        <MatchStateBadge state={match.state} size="sm" className={cn("ml-auto", !compact && "sm:hidden")} />
      </div>
      <div className="min-w-0 flex-1">
        {href ? (
          <Link to={href} className="block rounded-md outline-none ring-offset-background hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-[#c9a84c]">
            {body}
          </Link>
        ) : (
          body
        )}
      </div>
      <div className={cn("hidden shrink-0 items-center justify-end", !compact && "sm:flex sm:w-28")}>
        <MatchStateBadge state={match.state} size="sm" />
      </div>
    </li>
  );
}

function MatchList({ matches, byCode, compact }: {
  matches: TournamentMatch[];
  byCode: Map<string, TournamentParticipant>;
  compact?: boolean;
}) {
  return (
    <ul className={cn(CARD, "divide-y divide-border/50")}>
      {matches.map((m) => (
        <MatchRow key={m.match_id} match={m} byCode={byCode} compact={compact} />
      ))}
    </ul>
  );
}

function NextMatch({ match, byCode, now }: {
  match: TournamentMatch;
  byCode: Map<string, TournamentParticipant>;
  now: number;
}) {
  const href = matchHref(match);
  const [a, b] = match.teams;
  return (
    <div className={cn(CARD, "p-4")} data-testid="next-match">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="font-semibold uppercase tracking-[0.1em] text-foreground/80">{stageLabel(match)}</span>
        <span className="tabular-nums">{localStart(match.scheduled_start)}</span>
        <span className="tabular-nums text-cyan-300">{countdown(match.scheduled_start, now)}</span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <TeamChip team={a} byCode={byCode} />
        <span className="text-sm font-semibold text-muted-foreground">vs</span>
        <TeamChip team={b} byCode={byCode} align="right" />
      </div>
      {href && (
        <Link to={href} className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-[#e3c66f] hover:underline sm:min-h-0">
          Open in the match centre <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

/* ── field ──────────────────────────────────────────────────────────────── */

function TeamCard({ team, record, placed }: {
  team: TournamentParticipant;
  record?: { wins: number; losses: number } | null;
  placed: boolean;
}) {
  return (
    <article className={cn(CARD, "p-3")} data-testid="field-team" data-team={team.code}>
      <header className="flex items-center gap-3">
        <TeamCrest teamKey={team.team_key} name={team.team_key} shortCode={team.code} size="md" />
        <div className="min-w-0 flex-1">
          <Link
            to={proPlayProfileUrl("team", team.team_key)}
            className="block truncate text-sm font-semibold text-foreground hover:underline"
          >
            {team.team_key}
          </Link>
          <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            {team.code} · {team.region}
          </p>
        </div>
        {record && (
          <span className="rounded border border-border/70 px-1.5 py-0.5 text-xs font-semibold tabular-nums" title="Swiss record">
            {record.wins}–{record.losses}
          </span>
        )}
        {placed && (
          <span className="rounded bg-[#c9a84c]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#e3c66f]">
            Knockout
          </span>
        )}
      </header>
      <ul className="mt-3 space-y-1.5" aria-label={`${team.team_key} tournament lineup`}>
        {team.lineup.map((slot) => (
          <li key={slot.role} className="flex min-h-8 items-center gap-2.5">
            <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {ROLE_LABEL[slot.role]}
            </span>
            <PlayerPortrait playerKey={slot.player_key} name={slot.handle} size="xs" />
            <Link
              to={proPlayProfileUrl("player", slot.player_key)}
              className="min-w-0 truncate text-sm text-foreground/90 hover:underline"
            >
              {slot.handle}
            </Link>
            {slot.change && (
              <span
                data-testid="lineup-change"
                className="ml-auto shrink-0 rounded border border-cyan-400/50 px-1.5 py-0.5 text-[10px] font-medium text-cyan-200"
              >
                {slot.change}
              </span>
            )}
          </li>
        ))}
      </ul>
    </article>
  );
}

/* ── page ───────────────────────────────────────────────────────────────── */

function Header({ ctx, phase }: { ctx: TournamentContext; phase: TournamentPhase }) {
  return (
    <header className="space-y-4 border-b border-border/60 pb-5 pt-2">
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
            Tournament · <span data-testid="tournament-phase">{PHASE_LABEL[phase]}</span>
          </HubKicker>
          <h1 className="text-xl font-bold leading-tight text-foreground sm:text-2xl">{ctx.name}</h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              {dateRange(ctx.starts, ctx.ends)}
            </span>
            <span>{ctx.participants.length} teams · {ctx.regions.length} regions</span>
          </p>
        </div>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2" aria-label="Stages">
        {ctx.stages.map((s) => (
          <li key={s.key} className={cn(CARD, "px-3 py-2")} data-testid="stage">
            <p className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-foreground">
              {s.name}
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <MapPin className="h-3 w-3" aria-hidden="true" />
                {s.venue}
              </span>
              <span className="text-xs font-medium text-muted-foreground">{dateRange(s.starts, s.ends)}</span>
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.format_note}</p>
          </li>
        ))}
      </ul>
    </header>
  );
}

function TournamentBody({ data, now }: { data: TournamentResponse; now: number }) {
  const { context: ctx, state } = data;
  const byCode = useMemo(() => participantsByCode(ctx), [ctx]);
  const regions = useMemo(() => fieldByRegion(ctx), [ctx]);
  const records = useMemo(
    () => new Map(state.swiss_records.map((r) => [r.code, r])),
    [state.swiss_records],
  );
  const placed = useMemo(() => new Set(state.knockout_teams), [state.knockout_teams]);
  const next = state.matches.find((m) => m.match_id === state.next_match_id) ?? null;
  const today = todaysMatches(state.matches, now);
  const days = matchesByDay(state.matches);
  const rounds = bracketRounds(state.matches);
  const groups = recordGroups(state.swiss_records);

  const sections: Record<SectionKey, ReactNode> = {
    next: next && (
      <Section id="next" kicker="Next match">
        <NextMatch match={next} byCode={byCode} now={now} />
      </Section>
    ),
    today: today.length > 0 && (
      <Section id="today" kicker="Today">
        <MatchList matches={today} byCode={byCode} />
      </Section>
    ),
    records: groups.length > 0 && (
      <Section id="records" kicker="Swiss records" title="Completed Swiss matches won and lost">
        <div className={cn(CARD, "divide-y divide-border/50")}>
          {groups.map((g) => (
            <div key={g.record} className="flex flex-wrap items-center gap-3 px-3 py-2.5 sm:px-4" data-testid="record-group">
              <span className="w-10 shrink-0 text-sm font-bold tabular-nums text-foreground">{g.record}</span>
              <ul className="flex flex-wrap gap-2">
                {g.rows.map((r) => (
                  <li key={r.code} className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-2 py-1">
                    <TeamCrest teamKey={r.team_key} name={r.team_key} shortCode={r.code} size="xs" />
                    <span className="text-xs font-semibold">{r.code}</span>
                    {placed.has(r.code) && (
                      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#e3c66f]">KO</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>
    ),
    bracket: rounds.length > 0 && (
      <Section id="bracket" kicker={["Knockout stage", ctx.stages.find((s) => s.key === "knockout")?.venue].filter(Boolean).join(" · ")}>
        <div className="grid gap-3 lg:grid-cols-3">
          {rounds.map((r) => (
            <div key={r.round} className="space-y-2" data-testid="bracket-round">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{r.round}</p>
              <MatchList matches={r.matches} byCode={byCode} compact />
            </div>
          ))}
        </div>
      </Section>
    ),
    schedule: days.length > 0 && (
      <Section id="schedule" kicker="Schedule" title="Every match, in your local time">
        <div className="space-y-4">
          {days.map((d) => (
            <div key={d.day} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{dayLabel(d.day)}</p>
              <MatchList matches={d.matches} byCode={byCode} />
            </div>
          ))}
        </div>
      </Section>
    ),
    field: (
      <Section id="field" kicker="Know the field" title="Twelve teams, six regions — and the lineups they registered for this event">
        <div className="space-y-5">
          {regions.map((g) => (
            <div key={g.region} className="space-y-2" data-testid="field-region" data-region={g.region}>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {g.region} · {g.teams.length} {g.teams.length === 1 ? "team" : "teams"}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {g.teams.map((t) => (
                  <TeamCard key={t.code} team={t} record={records.get(t.code) ?? null} placed={placed.has(t.code)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>
    ),
    worlds: ctx.related.length > 0 && (
      <Section id="worlds" kicker="Related event">
        <div className="space-y-3">
          {ctx.related.map((r) => (
            <div key={r.league_slug} className={cn(CARD, "p-4")} data-testid="related-event">
              <p className="text-sm font-semibold text-foreground">
                {r.name} <span className="font-normal text-muted-foreground">· {dateRange(r.starts, r.ends)}</span>
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{r.relation}</p>
              <ul className="mt-3 flex flex-wrap gap-2" aria-label={`${ctx.short_name} teams by region`}>
                {regions.map((g) => (
                  <li key={g.region} className="rounded-md border border-border/60 px-2 py-1 text-xs">
                    <span className="font-semibold">{g.region}</span>
                    <span className="text-muted-foreground"> · {g.teams.map((t) => t.code).join(", ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>
    ),
  };

  return (
    <div className="space-y-8">
      {!data.source_ok && (
        <p role="status" className="rounded-md border border-orange-500/30 bg-orange-500/5 px-3 py-2 text-xs text-orange-300">
          {data.stale
            ? "The schedule source is not answering; results below are from a recent copy."
            : "The schedule source is not answering, so matches and results cannot be shown right now. The field below is unaffected."}
        </p>
      )}
      {SECTION_ORDER[state.phase].map((key) =>
        sections[key] ? <div key={key}>{sections[key]}</div> : null,
      )}
      <nav aria-label="More Pro Play" className="flex flex-wrap gap-2 border-t border-border/60 pt-5">
        <Link to={PRO_PLAY_QUIZ_ROUTE} className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border/70 px-3 text-sm hover:bg-muted/40">
          <Brain className="h-4 w-4 text-[#c9a84c]" aria-hidden="true" /> Pro Play quiz
        </Link>
        <Link to={PRO_PLAY_SEARCH_ROUTE} className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border/70 px-3 text-sm hover:bg-muted/40">
          <Search className="h-4 w-4 text-[#c9a84c]" aria-hidden="true" /> Search players and teams
        </Link>
      </nav>
    </div>
  );
}

export default function ProPlayTournament() {
  const { contextId } = useParams<{ contextId: string }>();
  const query = useTournament(contextId);
  const now = useNow();
  const data = query.data;

  const mediaTeams = useMemo(() => data?.context.participants.map((p) => p.team_key) ?? [], [data]);
  const mediaPlayers = useMemo(
    () => data?.context.participants.flatMap((p) => p.lineup.map((s) => s.player_key)) ?? [],
    [data],
  );
  const mediaLeagues = useMemo(() => (data ? [data.context.league.slug] : []), [data]);

  return (
    <div className="relative min-h-screen bg-background">
      <SEOHead
        title={data ? `${data.context.short_name} — ${data.context.name} | Mogzy` : "Tournament | Mogzy"}
        description={
          data
            ? `${data.context.name}: the ${data.context.participants.length}-team field, tournament lineups, schedule and results.`
            : "A professional League of Legends tournament: field, lineups, schedule and results."
        }
        path={proPlayTournamentUrl(contextId ?? "")}
      />
      <div className="mx-auto w-full max-w-[1200px] space-y-6 px-4 pb-10 sm:px-6">
        {query.isLoading && (
          <div className="space-y-4 pt-6" data-testid="tournament-loading">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}
        {query.isError && (
          <div className="space-y-3 pt-8" role="alert">
            <Link to={PRO_PLAY_ROUTE} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Pro Play
            </Link>
            <p className="text-base font-semibold">
              {query.error instanceof TournamentNotFound ? "No such tournament." : "This tournament could not be loaded."}
            </p>
            {!(query.error instanceof TournamentNotFound) && (
              <p className="text-sm text-muted-foreground">The Pro Play service did not answer. Try again in a moment.</p>
            )}
          </div>
        )}
        {data && (
          <ProPlayMediaProvider teams={mediaTeams} players={mediaPlayers} leagues={mediaLeagues}>
            <Header ctx={data.context} phase={data.state.phase} />
            <TournamentBody data={data} now={now} />
          </ProPlayMediaProvider>
        )}
      </div>
    </div>
  );
}
