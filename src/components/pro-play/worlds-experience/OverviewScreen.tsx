/**
 * Screen 01 — Overview (UX1): "what is happening at Worlds right now, and
 * what should I look at next?"
 *
 * One composed screen, no scrolling at desktop sizes:
 * - THE FOCUS (hero): the live match, else the next one with its countdown,
 *   else the changeover between stages, the champion, or the honest
 *   "schedule unavailable" — each with a way into the Stage Explorer.
 * - THE ROAD (right rail): Play-In → Swiss → Knockouts, marked only as the
 *   phase certifies, with what each stage decides; every stage opens there.
 * - AT STAKE: the stage in play or next, by its served structure — size, how
 *   many go on, how many go home — and its teams where they are known.
 * - COMING UP: the next fixtures (and the latest results once there are
 *   any), each opening its match in the bracket.
 */
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Check, MapPin, Trophy } from "lucide-react";

import MatchStateBadge from "@/components/pro-play/hub/MatchStateBadge";
import { TeamCrest } from "@/components/pro-play/media/EntityCrest";
import { useKit } from "@/components/pro-play/tournament/TournamentParts";
import { localStart } from "@/lib/pro-play/hubSeries";
import type { TournamentMatchTeamV2, TournamentMatchV2, TournamentStageV2 } from "@/lib/pro-play/tournamentApi";
import { dateRange, dayLabel, localDayKey, matchHref } from "@/lib/pro-play/tournamentView";
import {
  championMatch,
  displayName,
  matchCaption,
  outcomeOf,
  playInSwissSlot,
  scoreV2,
  slotLabel,
  stageMatches,
  stageOf,
  stageProgress,
  teamName,
} from "@/lib/pro-play/tournamentV2View";
import {
  countdownParts,
  defaultStageKey,
  overviewFocus,
  recentResults,
  stageStakes,
  upcoming,
} from "@/lib/pro-play/worldsExperience/experienceView";
import { stageLabel } from "@/lib/pro-play/worldsExperience/navigation";
import { cn } from "@/lib/utils";

import { useExperience } from "./ExperienceContext";
import { Eyebrow, Figure, GOLD_TEXT, SURFACE, SideMark, calendarDay } from "./parts";

const pad2 = (n: number) => String(n).padStart(2, "0");

/* ── hero ───────────────────────────────────────────────────────────────── */

function HeroBackdrop({ word }: { word: string }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
      <div className="absolute inset-0 bg-[radial-gradient(55%_75%_at_50%_45%,hsl(42_70%_50%/0.13),transparent_72%)]" />
      <div className="absolute -right-6 bottom-[-0.32em] select-none font-['Cinzel',serif] text-[150px] font-bold leading-none tracking-[0.04em] text-[#c9a84c]/[0.045]">
        {word}
      </div>
      <div className="absolute inset-y-8 left-1/2 w-px bg-gradient-to-b from-transparent via-[#c9a84c]/20 to-transparent" />
      <div className="absolute inset-x-10 bottom-0 h-px bg-gradient-to-r from-transparent via-[#c9a84c]/45 to-transparent" />
    </div>
  );
}

function HeroTeam({ team, match, align, compact }: { team: TournamentMatchTeamV2; match: TournamentMatchV2; align: "left" | "right"; compact: boolean }) {
  const kit = useKit();
  const right = align === "right";
  const outcome = outcomeOf(match, team);
  if (team.tbd || !team.code) {
    const source = slotLabel(team.slot, kit.byId, kit.names);
    return (
      <div className={cn("flex min-w-0", compact ? "flex-col gap-2" : "items-center gap-4", right && (compact ? "items-end text-right" : "flex-row-reverse text-right"))} data-testid="hero-team" data-team="tbd">
        <SideMark team={team} size={compact ? "md" : "xl"} byCodeName={(t) => teamName(t, kit.byCode)} />
        <div className="min-w-0">
          <p className={cn("font-bold leading-none text-foreground/60", compact ? "text-2xl" : "text-[40px]")}>TBD</p>
          {source && <p className="mt-2 truncate text-xs text-muted-foreground">{source}</p>}
        </div>
      </div>
    );
  }
  const p = kit.byCode.get(team.code);
  const meta = [p?.region, p?.qualification, p?.entry_stage === "play_in" ? "Play-In entrant" : p?.swiss_tier ? `Swiss tier ${p.swiss_tier}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      className={cn("flex min-w-0", compact ? "flex-col gap-2" : "items-center gap-4", right && (compact ? "items-end text-right" : "flex-row-reverse text-right"), outcome === "loss" && "opacity-55")}
      data-testid="hero-team"
      data-team={team.code}
    >
      <TeamCrest teamKey={team.team_key} name={teamName(team, kit.byCode)} shortCode={team.code} size={compact ? "md" : "xl"} />
      <div className="min-w-0">
        <p className={cn("font-extrabold leading-none tracking-tight", compact ? "text-[28px]" : "text-[48px]", outcome === "win" ? GOLD_TEXT : "text-foreground")}>
          {team.code}
        </p>
        <p className={cn("mt-2 truncate font-medium text-foreground/85", compact ? "text-xs" : "text-sm")}>{teamName(team, kit.byCode)}</p>
        {meta && !compact && <p className="mt-0.5 truncate text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{meta}</p>}
      </div>
    </div>
  );
}

function Countdown({ iso, compact }: { iso: string; compact: boolean }) {
  const { now } = useKit();
  const parts = countdownParts(iso, now);
  if (!parts) return null;
  if (parts.started) return <p className="text-sm font-semibold text-emerald-300">Starting</p>;
  const units: [number, string][] = parts.days > 0
    ? [[parts.days, "days"], [parts.hours, "hrs"], [parts.minutes, "min"]]
    : [[parts.hours, "hrs"], [parts.minutes, "min"]];
  return (
    <p className="flex items-end gap-3" data-testid="countdown" aria-label={`Starts in ${units.map(([n, u]) => `${n} ${u}`).join(" ")}`}>
      {units.map(([n, u]) => (
        <span key={u} className="flex items-baseline gap-1">
          <span className={cn("font-bold tabular-nums leading-none text-foreground", compact ? "text-xl" : "text-[30px]")}>{pad2(n)}</span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{u}</span>
        </span>
      ))}
    </p>
  );
}

function HeroActions({ match }: { match: TournamentMatchV2 }) {
  const x = useExperience();
  const href = matchHref(match);
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {match.stage && (
        <Link
          to={x.hrefFor({ screen: "stages", stageKey: match.stage, matchId: match.match_id })}
          state={{ ux1Panel: true }}
          data-testid="hero-open-bracket"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[linear-gradient(180deg,#e9cf7d,#c9a84c)] px-4 text-sm font-semibold text-[#14110a] shadow-[0_1px_0_#f6e7b3_inset,0_8px_22px_-10px_rgba(201,168,76,0.8)] outline-none transition-transform hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-[#e3c66f] focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transform-none"
        >
          View in the bracket <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
      {href && (
        <Link
          to={href}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-white/12 px-3.5 text-sm font-medium text-foreground/85 outline-none transition-colors hover:border-[#c9a84c]/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-[#c9a84c]"
        >
          Match centre <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

function MatchHero({ match, live, others }: { match: TournamentMatchV2; live: boolean; others: TournamentMatchV2[] }) {
  const kit = useKit();
  const x = useExperience();
  const compact = !x.desktop;
  const stage = stageOf(kit.ctx, match.stage);
  const score = scoreV2(match);
  return (
    <div className={cn("relative flex h-full flex-col", compact ? "gap-5 p-4" : "gap-6 p-6 xl:p-7")}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {live ? (
          <span className="inline-flex items-center gap-2">
            <MatchStateBadge state="live" size="md" />
            <Eyebrow>On now</Eyebrow>
          </span>
        ) : (
          <Eyebrow>Next match</Eyebrow>
        )}
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/75" data-testid="hero-caption">
          {matchCaption(match, kit)}
        </p>
      </div>

      <div className={cn("grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center", compact ? "gap-2" : "my-auto gap-6")}>
        <HeroTeam team={match.teams[0]} match={match} align="left" compact={compact} />
        <div className="flex flex-col items-center">
          {score ? (
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.p
                key={score}
                initial={x.reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={x.reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className={cn("font-extrabold tabular-nums leading-none text-foreground", compact ? "text-3xl" : "text-[56px]")}
                data-testid="hero-score"
              >
                {score}
              </motion.p>
            </AnimatePresence>
          ) : (
            <span className={cn("font-['Cinzel',serif] font-bold text-[#c9a84c]/80", compact ? "text-base" : "text-2xl")}>vs</span>
          )}
          {match.best_of && score && (
            <span className="mt-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Bo{match.best_of} · first to {Math.ceil(match.best_of / 2)}
            </span>
          )}
        </div>
        <HeroTeam team={match.teams[1]} match={match} align="right" compact={compact} />
      </div>

      <div className={cn("flex items-end gap-x-6 gap-y-4 border-t border-white/[0.07]", compact ? "flex-wrap pt-4" : "pt-5")}>
        <div className="min-w-0">
          <Eyebrow tone="muted">{live ? "Started" : "Starts"}</Eyebrow>
          <p className="mt-2 text-sm font-semibold tabular-nums text-foreground" data-testid="hero-start">{localStart(match.scheduled_start)}</p>
          {stage && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" aria-hidden="true" /> {stage.venue}
            </p>
          )}
        </div>
        {!live && (
          <div>
            <Eyebrow tone="muted">Countdown</Eyebrow>
            <div className="mt-2">
              <Countdown iso={match.scheduled_start} compact={compact} />
            </div>
          </div>
        )}
        <div className={cn(!compact && "ml-auto shrink-0")}>
          <HeroActions match={match} />
        </div>
      </div>
      {others.length > 0 && (
        <p className="text-xs text-muted-foreground" data-testid="hero-also-live">
          Also live: {others.map((m) => m.teams.map((t) => t.code ?? "TBD").join(" v ")).join(" · ")}
        </p>
      )}
    </div>
  );
}

function TransitionHero() {
  const kit = useKit();
  const x = useExperience();
  const { ctx, state } = kit;
  const detail = state.phase_detail!;
  const done = stageOf(ctx, detail.completed_stage);
  const next = stageOf(ctx, detail.next_stage);
  const first = stageMatches(state, detail.next_stage).filter((m) => m.state === "upcoming").sort((a, b) => Date.parse(a.scheduled_start) - Date.parse(b.scheduled_start))[0];
  const facts: ReactNode[] = [];
  if (detail.completed_stage === "play_in") {
    const slot = playInSwissSlot(ctx, state);
    if (slot.code) {
      const p = kit.byCode.get(slot.code);
      facts.push(
        <span key="w" className="inline-flex items-center gap-2">
          {p && <TeamCrest teamKey={p.team_key} name={displayName(p)} shortCode={p.code} size="sm" />}
          <span>
            <b className="font-semibold text-foreground">{slot.code}</b> {slot.basis === "placed" ? "takes the Play-In slot in Swiss" : "won the Play-In"}
          </span>
        </span>,
      );
    }
    if (state.play_in.bracket_authority === "standings" && state.play_in.eliminated.length) {
      facts.push(<span key="e">Out: {state.play_in.eliminated.join(", ")}</span>);
    }
  }
  if (detail.completed_stage === "swiss") {
    const adv = state.swiss.records.filter((r) => r.status === "advanced").map((r) => r.code);
    if (adv.length) facts.push(<span key="a">Advanced: <b className="font-semibold text-foreground">{adv.join(", ")}</b></span>);
  }
  return (
    <div className="relative flex h-full flex-col gap-5 p-6 xl:p-7" data-testid="hero-transition">
      <Eyebrow>Between stages</Eyebrow>
      <div className="my-auto space-y-3">
        <h2 className="text-[34px] leading-tight lg:text-[42px]">{done ? stageLabel(done) : "Stage"} complete</h2>
        {next && (
          <p className="text-base text-foreground/85">
            {stageLabel(next)} begins <b className="font-semibold">{calendarDay(next.starts)}</b> in {next.venue}
          </p>
        )}
        {facts.length > 0 && <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground" data-testid="transition-facts">{facts}</div>}
      </div>
      <div className="flex items-end gap-x-6 gap-y-4 border-t border-white/[0.07] pt-5">
        {first && (
          <div>
            <Eyebrow tone="muted">First {next ? stageLabel(next) : ""} match</Eyebrow>
            <p className="mt-2 text-sm font-semibold tabular-nums">{localStart(first.scheduled_start)}</p>
          </div>
        )}
        {first && (
          <div>
            <Eyebrow tone="muted">Countdown</Eyebrow>
            <div className="mt-2"><Countdown iso={first.scheduled_start} compact={!x.desktop} /></div>
          </div>
        )}
        {next && (
          <Link
            to={x.hrefFor({ screen: "stages", stageKey: next.key })}
            className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[linear-gradient(180deg,#e9cf7d,#c9a84c)] px-4 text-sm font-semibold text-[#14110a] outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Explore {stageLabel(next)} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  );
}

function ChampionHero() {
  const kit = useKit();
  const x = useExperience();
  const code = kit.state.knockout.bracket_authority === "standings" ? kit.state.knockout.champion_code : null;
  const final = championMatch(kit.state);
  if (!code) return <QuietHero title="Event complete" body="The final has been played. The champion is named here once the official standings confirm it." />;
  const p = kit.byCode.get(code);
  const team = final?.teams.find((t) => t.code === code);
  const other = final?.teams.find((t) => t.code !== code);
  return (
    <div className="relative flex h-full flex-col gap-5 p-6 xl:p-7" data-testid="hero-champion">
      <Eyebrow>
        <span className="inline-flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5" aria-hidden="true" /> {kit.ctx.short_name} {kit.ctx.starts.slice(0, 4)} champion</span>
      </Eyebrow>
      <div className="my-auto flex items-center gap-6">
        <TeamCrest teamKey={p?.team_key ?? team?.team_key} name={p ? displayName(p) : code} shortCode={code} size="xl" />
        <div className="min-w-0">
          <p className={cn("font-extrabold leading-none tracking-tight", GOLD_TEXT, x.desktop ? "text-[56px]" : "text-4xl")}>{code}</p>
          <p className="mt-2 truncate text-lg font-medium text-foreground/90">{p ? displayName(p) : code}</p>
          {final && other && (
            <p className="mt-1 text-sm text-muted-foreground">
              Won the final <b className="font-semibold tabular-nums text-foreground">{team?.game_wins}–{other.game_wins}</b>
              {other.code ? ` against ${other.code}` : ""}
            </p>
          )}
        </div>
      </div>
      <div className="border-t border-white/[0.07] pt-5">
        <Link to={x.hrefFor({ screen: "stages", stageKey: "knockout" })} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-[#e3c66f] hover:underline">
          Relive the Knockouts <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

function QuietHero({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="relative flex h-full flex-col justify-center gap-3 p-6 xl:p-7" data-testid="hero-quiet">
      <h2 className="text-3xl">{title}</h2>
      <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

function Hero() {
  const kit = useKit();
  const x = useExperience();
  const focus = overviewFocus(kit.state);
  let body: ReactNode;
  let word = kit.ctx.short_name.toUpperCase();
  switch (focus.kind) {
    case "live":
      body = <MatchHero match={focus.matches[0]} live others={focus.matches.slice(1)} />;
      word = "LIVE";
      break;
    case "next":
      body = <MatchHero match={focus.match} live={false} others={[]} />;
      break;
    case "transition":
      body = <TransitionHero />;
      break;
    case "champion":
      body = <ChampionHero />;
      break;
    case "unavailable":
      body = (
        <QuietHero
          title="Schedule unavailable"
          body="The official schedule couldn't be read, so there is no live or next match to show. The field and the Swiss seeding are still here."
          action={
            <Link to={x.hrefFor({ screen: "stages", stageKey: "swiss" })} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-[#e3c66f] hover:underline">
              See the Swiss seeding <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          }
        />
      );
      break;
    default:
      body = <QuietHero title="No match scheduled" body="There is no upcoming match on the official schedule right now." />;
  }
  return (
    <section className={cn(SURFACE, "relative h-full overflow-hidden")} data-testid="overview-hero" data-focus={focus.kind} aria-label="Now at Worlds">
      {x.desktop && <HeroBackdrop word={word} />}
      {body}
    </section>
  );
}

/* ── road to the final ──────────────────────────────────────────────────── */

const PROGRESS: Record<"current" | "complete" | "next", { label: string; cls: string }> = {
  current: { label: "Now", cls: "bg-emerald-500 text-emerald-950" },
  complete: { label: "Complete", cls: "bg-white/10 text-foreground/80" },
  next: { label: "Next", cls: "border border-cyan-400/70 text-cyan-300" },
};

function stakesLine(stage: TournamentStageV2, s: ReturnType<typeof stageStakes>) {
  const parts: string[] = [];
  if (s.teams) parts.push(`${s.teams} teams`);
  if (s.formats) parts.push(s.formats);
  if (s.advance !== null) parts.push(s.nextStage ? `${s.advance} ${s.advance === 1 ? "advances" : "advance"}` : "1 champion");
  return parts.join(" · ");
}

function StageRoad() {
  const kit = useKit();
  const x = useExperience();
  const { ctx, state } = kit;
  return (
    <section className={cn(SURFACE, "flex h-full flex-col", x.desktop ? "p-5" : "p-4")} data-testid="stage-road" aria-labelledby="road-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="road-title" className="text-lg leading-none">Road to the Final</h2>
        <span className="text-[11px] tabular-nums text-muted-foreground">{state.counts.matches} matches</span>
      </div>
      <ol className="relative mt-3 flex max-h-[420px] flex-1 flex-col gap-1">
        {ctx.stages.map((s, i) => {
          const progress = stageProgress(s, state, ctx);
          const stakes = stageStakes(s, state, ctx);
          const all = stageMatches(state, s.key);
          const done = all.filter((m) => m.state === "completed").length;
          const chip = progress ? PROGRESS[progress] : null;
          return (
            <li key={s.key} className="relative flex-1" data-testid="road-stage" data-stage={s.key} data-progress={progress ?? "none"}>
              {i < ctx.stages.length - 1 && (
                <span aria-hidden="true" className="absolute bottom-[-4px] left-[25px] top-[42px] w-px bg-gradient-to-b from-[#c9a84c]/45 to-white/[0.06]" />
              )}
              <Link
                to={x.hrefFor({ screen: "stages", stageKey: s.key })}
                className={cn(
                  "group relative grid h-full grid-cols-[28px_minmax(0,1fr)] gap-3 rounded-xl p-3 outline-none transition-colors hover:bg-white/[0.035] focus-visible:ring-1 focus-visible:ring-[#c9a84c]/70",
                  progress === "current" && "bg-[#c9a84c]/[0.05]",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold tabular-nums",
                    progress === "complete" ? "border-white/15 bg-white/10 text-foreground/80" : "border-[#c9a84c]/60 bg-[hsl(214_52%_7%)] text-[#e3c66f]",
                    progress === "current" && "shadow-[0_0_0_4px_hsl(42_70%_50%/0.12)]",
                  )}
                >
                  {progress === "complete" ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-foreground">{stageLabel(s)}</span>
                    {chip && <span className={cn("rounded px-1.5 py-[3px] text-[9.5px] font-bold uppercase leading-none tracking-[0.12em]", chip.cls)}>{chip.label}</span>}
                    <ArrowRight className="ml-auto h-3.5 w-3.5 text-[#c9a84c] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
                  </span>
                  <span className="mt-1 block text-xs tabular-nums text-muted-foreground">
                    {dateRange(s.starts, s.ends).replace(/\s\d{4}$/, "")} · {s.venue}
                  </span>
                  <span className="mt-1 block text-xs text-foreground/80" data-testid="road-stakes">{stakesLine(s, stakes)}</span>
                  {stakes.teams && stakes.advance !== null && stakes.teams <= 24 && (
                    <span className="mt-2 flex flex-wrap gap-[3px]" aria-hidden="true" data-testid="road-funnel">
                      {Array.from({ length: stakes.teams }, (_, k) => (
                        <span key={k} className={cn("h-1.5 w-1.5 rounded-full", k < (stakes.advance ?? 0) ? "bg-[#e3c66f]" : "bg-white/[0.14]")} />
                      ))}
                    </span>
                  )}
                  {done > 0 && all.length > 0 && (
                    <span className="mt-2 flex items-center gap-2" data-testid="road-progress">
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                        <span className="block h-full rounded-full bg-[#c9a84c]/80" style={{ width: `${(done / all.length) * 100}%` }} />
                      </span>
                      <span className="text-[10.5px] tabular-nums text-muted-foreground">{done}/{all.length}</span>
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <FieldSummary />
      <Link
        to={x.hrefFor({ screen: "stages" })}
        data-testid="open-stage-explorer"
        className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#c9a84c]/35 bg-[#c9a84c]/[0.06] text-sm font-semibold text-[#e3c66f] outline-none transition-colors hover:bg-[#c9a84c]/[0.12] focus-visible:ring-2 focus-visible:ring-[#c9a84c]"
      >
        Open the Stage Explorer <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}

/** The field by region: who is here, and how many start in the Play-In. */
function FieldSummary() {
  const { ctx } = useKit();
  const x = useExperience();
  const direct = ctx.participants.filter((p) => p.entry_stage === "swiss").length;
  const playIn = ctx.participants.filter((p) => p.entry_stage === "play_in").length;
  return (
    <div className="mt-auto border-t border-white/[0.06] pt-4" data-testid="field-summary">
      <p className="flex items-baseline justify-between gap-2">
        <Link
          to={x.hrefFor({ screen: "teams" })}
          data-testid="overview-open-teams"
          className="group inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-muted-foreground outline-none hover:text-[#e3c66f] focus-visible:text-[#e3c66f]"
        >
          The field <ArrowRight className="h-3 w-3 opacity-60 group-hover:opacity-100" aria-hidden="true" />
        </Link>
        <span className="text-[11px] text-muted-foreground">
          {direct > 0 && playIn > 0 ? `${direct} straight to Swiss · ${playIn} in the Play-In` : `${ctx.participants.length} teams`}
        </span>
      </p>
      <ul className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2.5">
        {ctx.regions.map((r) => {
          const n = ctx.participants.filter((p) => p.region === r).length;
          if (!n) return null;
          return (
            <li key={r} className="min-w-0" data-testid="field-region" data-region={r}>
              <span className="flex items-baseline gap-1.5">
                <span className="text-[13px] font-bold text-foreground">{r}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{n}</span>
              </span>
              <span className="mt-1 flex gap-[3px]" aria-hidden="true">
                {Array.from({ length: n }, (_, k) => <span key={k} className="h-1 flex-1 rounded-full bg-[#c9a84c]/45" />)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── at stake ───────────────────────────────────────────────────────────── */

function StakesPanel() {
  const kit = useKit();
  const x = useExperience();
  const { ctx, state } = kit;
  const key = defaultStageKey(state, ctx);
  const stage = key ? stageOf(ctx, key) : null;
  if (!stage) return null;
  const stakes = stageStakes(stage, state, ctx);
  const swiss = stage.bracket === "swiss";
  const recs = state.swiss.records;
  const entrants = ctx.participants.filter((p) => p.entry_stage === stage.key);
  const authority = stage.key === "play_in" ? state.play_in.bracket_authority === "standings" : false;
  const qualified = stage.key === "knockout" ? state.knockout_teams : [];
  return (
    <section className={cn(SURFACE, "flex h-full flex-col", x.desktop ? "p-5" : "p-4")} data-testid="stakes" data-stage={stage.key} aria-labelledby="stakes-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="stakes-title" className="text-lg leading-none">At stake</h2>
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#c9a84c]">{stageLabel(stage)}</span>
      </div>
      {swiss && recs.length > 0 ? (
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Figure value={recs.filter((r) => r.status === "advanced").length} label="Advanced" tone="gold" testId="stake-advanced" />
          <Figure value={recs.filter((r) => r.status === "active").length} label="Still alive" testId="stake-alive" />
          <Figure value={recs.filter((r) => r.status === "eliminated").length} label="Eliminated" tone="muted" testId="stake-eliminated" />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Figure value={stakes.teams ?? "—"} label="Teams" testId="stake-teams" />
          <Figure value={stakes.advance ?? "—"} label={stakes.nextStage ? `To ${stageLabel(stakes.nextStage)}` : "Champion"} tone="gold" testId="stake-advance" />
          <Figure value={stakes.eliminated ?? "—"} label="Go home" tone="muted" testId="stake-eliminated" />
        </div>
      )}
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground" data-testid="stakes-format">{stage.format_note}</p>
      {!swiss && entrants.length > 0 && (
        <div className="mt-auto pt-4">
        <Eyebrow tone="muted">In the {stageLabel(stage)}</Eyebrow>
        <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2" aria-label={`${stageLabel(stage)} teams`}>
          {entrants.map((p) => {
            const out = authority && state.play_in.eliminated.includes(p.code);
            const won = authority && state.play_in.winner_code === p.code;
            return (
              <li key={p.code} className={cn("flex min-w-0 items-center gap-2", out && "opacity-50")} data-testid="stakes-team" data-team={p.code}>
                <TeamCrest teamKey={p.team_key} name={displayName(p)} shortCode={p.code} size="sm" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
                    {p.code}
                    {won && <span className="rounded bg-[#c9a84c]/15 px-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#e3c66f]">Won</span>}
                    {out && <span className="rounded border border-white/15 px-1 text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Out</span>}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">{[p.region, p.qualification].filter(Boolean).join(" · ")}</span>
                </span>
              </li>
            );
          })}
        </ul>
        </div>
      )}
      {qualified.length > 0 && (
        <div className="mt-auto pt-4">
          <Eyebrow tone="muted">Qualified</Eyebrow>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {qualified.map((c) => {
              const p = kit.byCode.get(c);
              return (
                <li key={c} className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-1.5 py-1 text-xs font-semibold">
                  <TeamCrest teamKey={p?.team_key} name={p ? displayName(p) : c} shortCode={c} size="xs" /> {c}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ── coming up ──────────────────────────────────────────────────────────── */

function FixtureRow({ match, showScore }: { match: TournamentMatchV2; showScore?: boolean }) {
  const kit = useKit();
  const x = useExperience();
  const [a, b] = match.teams;
  const named = match.teams.every((t) => !t.tbd && t.code);
  const side = (t: TournamentMatchTeamV2) =>
    t.tbd || !t.code ? (
      <span className="text-muted-foreground">TBD</span>
    ) : (
      <span className={cn("inline-flex min-w-0 items-center gap-1.5 font-semibold", outcomeOf(match, t) === "loss" && "opacity-55", outcomeOf(match, t) === "win" && GOLD_TEXT)}>
        <TeamCrest teamKey={t.team_key} name={teamName(t, kit.byCode)} shortCode={t.code} size="xs" />
        {t.code}
      </span>
    );
  // An unnamed pairing reads by its name ("Upper Final"), its sides' origins beneath.
  const origins = named ? null : match.teams.map((t) => (t.tbd || !t.code ? slotLabel(t.slot, kit.byId, kit.names) ?? "TBD" : t.code)).join("  ·  ");
  const [day, time] = (localStart(match.scheduled_start) ?? "").split(" · ");
  return (
    <li>
      <Link
        to={match.stage ? x.hrefFor({ screen: "stages", stageKey: match.stage, matchId: match.match_id }) : "#"}
        state={{ ux1Panel: true }}
        data-testid="fixture"
        data-match-id={match.match_id}
        className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-2 outline-none transition-colors hover:bg-white/[0.04] focus-visible:ring-1 focus-visible:ring-[#c9a84c]/70"
      >
        <span className="whitespace-nowrap text-xs font-medium tabular-nums text-foreground/80">
          {showScore && <span className="block text-[10.5px] font-normal text-muted-foreground">{day}</span>}
          {time}
        </span>
        <span className="min-w-0">
          {named ? (
            <span className="flex min-w-0 items-center gap-2 text-sm">
              {side(a)}
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{showScore && scoreV2(match) ? scoreV2(match) : "v"}</span>
              {side(b)}
            </span>
          ) : (
            <span className="block truncate text-sm font-semibold text-foreground/90">{matchCaption(match, kit)}</span>
          )}
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground" title={origins ?? undefined}>
            {origins ?? matchCaption(match, kit)}
          </span>
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden="true" />
      </Link>
    </li>
  );
}

function ComingUp() {
  const kit = useKit();
  const x = useExperience();
  const focus = overviewFocus(kit.state);
  const exclude = focus.kind === "next" ? [focus.match.match_id] : [];
  const results = recentResults(kit.state, 2);
  const next = upcoming(kit.state, results.length ? 2 : 3, exclude);
  const days: { day: string; matches: TournamentMatchV2[] }[] = [];
  for (const m of next) {
    const d = localDayKey(m.scheduled_start) ?? "";
    const last = days[days.length - 1];
    if (last && last.day === d) last.matches.push(m);
    else days.push({ day: d, matches: [m] });
  }
  return (
    <section className={cn(SURFACE, "flex h-full min-h-0 flex-col", x.desktop ? "p-5" : "p-4")} data-testid="coming-up" aria-labelledby="coming-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="coming-title" className="text-lg leading-none">{results.length ? "Results & fixtures" : "Coming up"}</h2>
        <Link
          to={x.hrefFor({ screen: "schedule" })}
          data-testid="overview-open-schedule"
          className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-[#e3c66f] hover:underline"
        >
          Full schedule <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
      <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
        {results.length > 0 && (
          <div>
            <Eyebrow tone="muted" className="px-2">Latest results</Eyebrow>
            <ul className="mt-1.5">{results.map((m) => <FixtureRow key={m.match_id} match={m} showScore />)}</ul>
          </div>
        )}
        {days.map((d) => (
          <div key={d.day}>
            <Eyebrow tone="muted" className="px-2">{d.day ? dayLabel(d.day) : "Date to be confirmed"}</Eyebrow>
            <ul className="mt-1.5">{d.matches.map((m) => <FixtureRow key={m.match_id} match={m} />)}</ul>
          </div>
        ))}
        {!results.length && !days.length && <p className="px-2 text-sm text-muted-foreground">No fixtures on the official schedule.</p>}
      </div>
    </section>
  );
}

/* ── screen ─────────────────────────────────────────────────────────────── */

export function OverviewScreen() {
  const x = useExperience();
  if (!x.desktop) {
    return (
      <div className="space-y-3 px-3 pb-24 pt-3" data-testid="overview">
        <Hero />
        <StakesPanel />
        <ComingUp />
        <StageRoad />
      </div>
    );
  }
  return (
    <div className="h-full overflow-y-auto overscroll-contain" data-testid="overview">
      <div className="mx-auto grid h-full min-h-[600px] max-w-[1680px] grid-cols-12 grid-rows-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4 px-6 py-5">
        <div className="col-span-8 min-h-0"><Hero /></div>
        <div className="col-span-4 row-span-2 min-h-0"><StageRoad /></div>
        <div className="col-span-4 min-h-0"><StakesPanel /></div>
        <div className="col-span-4 min-h-0"><ComingUp /></div>
      </div>
    </div>
  );
}
