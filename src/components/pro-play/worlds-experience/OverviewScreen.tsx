/**
 * Screen 01 — Overview (UX1): "what is happening at Worlds right now, and
 * what should I look at next?"
 *
 * One composed screen that never scrolls (UX4):
 * - THE FOCUS (hero): the live match, else the next one with its countdown,
 *   else the changeover between stages, the champion, or the honest
 *   "schedule unavailable" — each with a way into the Stage Explorer.
 * - THE ROAD (right rail): Play-In → Swiss → Knockouts, marked only as the
 *   phase certifies, with what each stage decides; every stage opens there.
 * - AT STAKE: the stage in play or next, by its served structure — size, how
 *   many go on, how many go home — and its teams where they are known.
 * - COMING UP / RESULTS: every upcoming fixture (and every result once there
 *   are any), as many as the panel holds, the rest one page away.
 *
 * DENSITY, NOT CLIPPING. Each panel has compositions from spacious to
 * compact (`FitCascade`); the first that fits its cell is drawn. On a phone
 * the hero leads and the three panels are views of one region (Coming up ·
 * At stake · Road), not a column to scroll.
 */
import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Check, MapPin, Trophy } from "lucide-react";

import MatchStateBadge from "@/components/pro-play/hub/MatchStateBadge";
import { TeamCrest, type CrestSize } from "@/components/pro-play/media/EntityCrest";
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

import { useExperience, useMediaQuery } from "./ExperienceContext";
import { FitCascade, FitPages, ViewTabs } from "./fit";
import { Eyebrow, Figure, GOLD_TEXT, SURFACE, SideMark, calendarDay } from "./parts";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 0 = spacious, 1 = compact, 2 = tight (the phone's), 3 = the phone's tightest hero. */
type Density = 0 | 1 | 2 | 3;

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

const CREST: Record<Density, CrestSize> = { 0: "xl", 1: "lg", 2: "md", 3: "sm" };
const CODE: Record<Density, string> = { 0: "text-[48px]", 1: "text-[36px]", 2: "text-[26px]", 3: "text-xl" };
const TBD: Record<Density, string> = { 0: "text-[40px]", 1: "text-[30px]", 2: "text-2xl", 3: "text-xl" };

function HeroTeam({ team, match, align, d, stacked }: { team: TournamentMatchTeamV2; match: TournamentMatchV2; align: "left" | "right"; d: Density; stacked: boolean }) {
  const kit = useKit();
  const right = align === "right";
  const outcome = outcomeOf(match, team);
  const layout = cn("flex min-w-0", stacked ? "flex-col gap-2" : "items-center gap-4", right && (stacked ? "items-end text-right" : "flex-row-reverse text-right"));
  if (team.tbd || !team.code) {
    const source = slotLabel(team.slot, kit.byId, kit.names);
    return (
      <div className={layout} data-testid="hero-team" data-team="tbd">
        <SideMark team={team} size={CREST[d]} byCodeName={(t) => teamName(t, kit.byCode)} />
        <div className="min-w-0">
          <p className={cn("font-bold leading-none text-foreground/60", TBD[d])}>TBD</p>
          {source && <p className="mt-2 text-xs leading-snug text-muted-foreground">{source}</p>}
        </div>
      </div>
    );
  }
  const p = kit.byCode.get(team.code);
  const meta = [p?.region, p?.qualification, p?.entry_stage === "play_in" ? "Play-In entrant" : p?.swiss_tier ? `Swiss tier ${p.swiss_tier}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className={cn(layout, outcome === "loss" && "opacity-55")} data-testid="hero-team" data-team={team.code}>
      <TeamCrest teamKey={team.team_key} name={teamName(team, kit.byCode)} shortCode={team.code} size={CREST[d]} />
      <div className="min-w-0">
        <p className={cn("font-extrabold leading-none tracking-tight", CODE[d], outcome === "win" ? GOLD_TEXT : "text-foreground")}>{team.code}</p>
        <p className={cn("mt-1.5 font-medium leading-tight text-foreground/85", d === 2 ? "text-xs" : "text-sm")}>{teamName(team, kit.byCode)}</p>
        {meta && d < 2 && <p className="mt-0.5 text-[11px] uppercase leading-tight tracking-[0.1em] text-muted-foreground">{meta}</p>}
      </div>
    </div>
  );
}

function Countdown({ iso, d }: { iso: string; d: Density }) {
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
          <span className={cn("font-bold tabular-nums leading-none text-foreground", d === 0 ? "text-[30px]" : d === 1 ? "text-2xl" : "text-xl")}>{pad2(n)}</span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{u}</span>
        </span>
      ))}
    </p>
  );
}

const PRIMARY =
  "inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[linear-gradient(180deg,#e9cf7d,#c9a84c)] px-4 text-sm font-semibold text-[#14110a] shadow-[0_1px_0_#f6e7b3_inset,0_8px_22px_-10px_rgba(201,168,76,0.8)] outline-none transition-transform hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-[#e3c66f] focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transform-none";

function HeroActions({ match }: { match: TournamentMatchV2 }) {
  const x = useExperience();
  const href = matchHref(match);
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {match.stage && (
        <Link to={x.hrefFor({ screen: "stages", stageKey: match.stage, matchId: match.match_id })} state={{ ux1Panel: true }} data-testid="hero-open-bracket" className={PRIMARY}>
          View in the bracket <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
      {href && (
        <Link
          to={href}
          className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/12 px-3.5 text-sm font-medium text-foreground/85 outline-none transition-colors hover:border-[#c9a84c]/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-[#c9a84c]"
        >
          Match centre <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

const PAD: Record<Density, string> = { 0: "gap-6 p-6 xl:p-7", 1: "gap-4 p-5", 2: "gap-3 p-4", 3: "gap-2.5 p-3.5" };

function MatchHero({ match, live, others, d }: { match: TournamentMatchV2; live: boolean; others: TournamentMatchV2[]; d: Density }) {
  const kit = useKit();
  const x = useExperience();
  const stacked = !x.desktop || d === 2;
  const stage = stageOf(kit.ctx, match.stage);
  const score = scoreV2(match);
  return (
    <div className={cn("relative flex h-full flex-col", PAD[d])}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
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

      <div className={cn("grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center", d === 0 ? "my-auto gap-6" : d === 1 ? "my-auto gap-4" : "gap-2")}>
        <HeroTeam team={match.teams[0]} match={match} align="left" d={d} stacked={stacked} />
        <div className="flex flex-col items-center">
          {score ? (
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.p
                key={score}
                initial={x.reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={x.reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className={cn("font-extrabold tabular-nums leading-none text-foreground", d === 0 ? "text-[56px]" : d === 1 ? "text-[40px]" : "text-3xl")}
                data-testid="hero-score"
              >
                {score}
              </motion.p>
            </AnimatePresence>
          ) : (
            <span className={cn("font-['Cinzel',serif] font-bold text-[#c9a84c]/80", d === 2 ? "text-base" : "text-2xl")}>vs</span>
          )}
          {match.best_of && score && (
            <span className="mt-2 whitespace-nowrap text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Bo{match.best_of} · first to {Math.ceil(match.best_of / 2)}
            </span>
          )}
        </div>
        <HeroTeam team={match.teams[1]} match={match} align="right" d={d} stacked={stacked} />
      </div>

      <div className={cn("flex flex-wrap items-end gap-x-6 gap-y-3 border-t border-white/[0.07]", d === 2 ? "pt-3" : "pt-4")}>
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
              <Countdown iso={match.scheduled_start} d={d} />
            </div>
          </div>
        )}
        <div className="ml-auto min-w-0 max-w-full">
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

/** The tightest match hero (a short phone): the same facts in three lines and one row of actions. */
function CompactMatchHero({ match, live, others }: { match: TournamentMatchV2; live: boolean; others: TournamentMatchV2[] }) {
  const kit = useKit();
  const x = useExperience();
  const stage = stageOf(kit.ctx, match.stage);
  const score = scoreV2(match);
  const href = matchHref(match);
  const parts = countdownParts(match.scheduled_start, kit.now);
  const until = !live && parts && !parts.started ? [parts.days ? `${parts.days}d` : null, `${parts.hours}h`, `${pad2(parts.minutes)}m`].filter(Boolean).join(" ") : null;
  const side = (t: TournamentMatchTeamV2, right: boolean) => {
    const outcome = outcomeOf(match, t);
    const named = !t.tbd && t.code;
    return (
      <div className={cn("flex min-w-0 items-center gap-2", right && "flex-row-reverse text-right", outcome === "loss" && "opacity-55")} data-testid="hero-team" data-team={named ? t.code : "tbd"}>
        <SideMark team={t} size="sm" byCodeName={(tm) => teamName(tm, kit.byCode)} />
        <div className="min-w-0">
          <p className={cn("text-xl font-extrabold leading-none tracking-tight", named ? (outcome === "win" ? GOLD_TEXT : "text-foreground") : "text-foreground/60")}>{named ? t.code : "TBD"}</p>
          <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{named ? teamName(t, kit.byCode) : (slotLabel(t.slot, kit.byId, kit.names) ?? "To be decided")}</p>
        </div>
      </div>
    );
  };
  return (
    <div className={cn("relative flex flex-col", PAD[3])} data-density="3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {live ? (
          <span className="inline-flex items-center gap-2">
            <MatchStateBadge state="live" size="sm" />
            <Eyebrow>On now</Eyebrow>
          </span>
        ) : (
          <Eyebrow>Next match</Eyebrow>
        )}
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-foreground/75" data-testid="hero-caption">
          {matchCaption(match, kit)}
        </p>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        {side(match.teams[0], false)}
        {score ? (
          <p className="text-2xl font-extrabold tabular-nums leading-none text-foreground" data-testid="hero-score">{score}</p>
        ) : (
          <span className="font-['Cinzel',serif] text-sm font-bold text-[#c9a84c]/80">vs</span>
        )}
        {side(match.teams[1], true)}
      </div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-white/[0.07] pt-2.5 text-xs text-foreground/85">
        <span className="font-semibold tabular-nums" data-testid="hero-start">{localStart(match.scheduled_start)}</span>
        {until && (
          <span className="tabular-nums text-cyan-300" data-testid="countdown" aria-label={`Starts in ${until}`}>
            in {until}
          </span>
        )}
        {stage && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <MapPin className="h-3 w-3" aria-hidden="true" /> {stage.venue}
          </span>
        )}
      </p>
      <div className={cn("grid gap-2", href && match.stage ? "grid-cols-2" : "grid-cols-1")}>
        {match.stage && (
          <Link
            to={x.hrefFor({ screen: "stages", stageKey: match.stage, matchId: match.match_id })}
            state={{ ux1Panel: true }}
            data-testid="hero-open-bracket"
            className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-[linear-gradient(180deg,#e9cf7d,#c9a84c)] px-2 text-xs font-semibold text-[#14110a] outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            View in the bracket <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
        {href && (
          <Link
            to={href}
            className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-white/12 px-2 text-xs font-medium text-foreground/85 outline-none hover:border-[#c9a84c]/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c9a84c]"
          >
            Match centre <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        )}
      </div>
      {others.length > 0 && (
        <p className="text-[11px] text-muted-foreground" data-testid="hero-also-live">
          Also live: {others.map((m) => m.teams.map((t) => t.code ?? "TBD").join(" v ")).join(" · ")}
        </p>
      )}
    </div>
  );
}

function TransitionHero({ d }: { d: Density }) {
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
    <div className={cn("relative flex h-full flex-col", PAD[d])} data-testid="hero-transition">
      <Eyebrow>Between stages</Eyebrow>
      <div className="my-auto space-y-2.5">
        <h2 className={cn("leading-tight", d === 0 ? "text-[34px] xl:text-[42px]" : d === 1 ? "text-[28px]" : "text-2xl")}>{done ? stageLabel(done) : "Stage"} complete</h2>
        {next && (
          <p className={cn("text-foreground/85", d === 2 ? "text-sm" : "text-base")}>
            {stageLabel(next)} begins <b className="font-semibold">{calendarDay(next.starts)}</b> in {next.venue}
          </p>
        )}
        {facts.length > 0 && <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground" data-testid="transition-facts">{facts}</div>}
      </div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-t border-white/[0.07] pt-4">
        {first && (
          <div>
            <Eyebrow tone="muted">First {next ? stageLabel(next) : ""} match</Eyebrow>
            <p className="mt-2 text-sm font-semibold tabular-nums">{localStart(first.scheduled_start)}</p>
          </div>
        )}
        {first && (
          <div>
            <Eyebrow tone="muted">Countdown</Eyebrow>
            <div className="mt-2"><Countdown iso={first.scheduled_start} d={d} /></div>
          </div>
        )}
        {next && (
          <Link to={x.hrefFor({ screen: "stages", stageKey: next.key })} className={cn(PRIMARY, "ml-auto")}>
            Explore {stageLabel(next)} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  );
}

function ChampionHero({ d }: { d: Density }) {
  const kit = useKit();
  const x = useExperience();
  const code = kit.state.knockout.bracket_authority === "standings" ? kit.state.knockout.champion_code : null;
  const final = championMatch(kit.state);
  if (!code) return <QuietHero d={d} title="Event complete" body="The final has been played. The champion is named here once the official standings confirm it." />;
  const p = kit.byCode.get(code);
  const team = final?.teams.find((t) => t.code === code);
  const other = final?.teams.find((t) => t.code !== code);
  return (
    <div className={cn("relative flex h-full flex-col", PAD[d])} data-testid="hero-champion">
      <Eyebrow>
        <span className="inline-flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5" aria-hidden="true" /> {kit.ctx.short_name} {kit.ctx.starts.slice(0, 4)} champion</span>
      </Eyebrow>
      <div className="my-auto flex items-center gap-5">
        <TeamCrest teamKey={p?.team_key ?? team?.team_key} name={p ? displayName(p) : code} shortCode={code} size={CREST[d]} />
        <div className="min-w-0">
          <p className={cn("font-extrabold leading-none tracking-tight", GOLD_TEXT, d === 0 ? "text-[56px]" : d === 1 ? "text-[40px]" : "text-3xl")}>{code}</p>
          <p className={cn("mt-2 font-medium text-foreground/90", d === 2 ? "text-base" : "text-lg")}>{p ? displayName(p) : code}</p>
          {final && other && (
            <p className="mt-1 text-sm text-muted-foreground">
              Won the final <b className="font-semibold tabular-nums text-foreground">{team?.game_wins}–{other.game_wins}</b>
              {other.code ? ` against ${other.code}` : ""}
            </p>
          )}
        </div>
      </div>
      <div className="border-t border-white/[0.07] pt-4">
        <Link to={x.hrefFor({ screen: "stages", stageKey: "knockout" })} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-[#e3c66f] hover:underline">
          Relive the Knockouts <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

function QuietHero({ title, body, action, d }: { title: string; body: string; action?: ReactNode; d: Density }) {
  return (
    <div className={cn("relative flex h-full flex-col justify-center", PAD[d])} data-testid="hero-quiet">
      <h2 className={d === 2 ? "text-2xl" : "text-3xl"}>{title}</h2>
      <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

function HeroBody({ d }: { d: Density }) {
  const kit = useKit();
  const x = useExperience();
  const focus = overviewFocus(kit.state);
  switch (focus.kind) {
    case "live":
      return d === 3 ? <CompactMatchHero match={focus.matches[0]} live others={focus.matches.slice(1)} /> : <MatchHero match={focus.matches[0]} live others={focus.matches.slice(1)} d={d} />;
    case "next":
      return d === 3 ? <CompactMatchHero match={focus.match} live={false} others={[]} /> : <MatchHero match={focus.match} live={false} others={[]} d={d} />;
    case "transition":
      return <TransitionHero d={d} />;
    case "champion":
      return <ChampionHero d={d} />;
    case "unavailable":
      return (
        <QuietHero
          d={d}
          title="Schedule unavailable"
          body="The official schedule couldn't be read, so there is no live or next match to show. The field and the Swiss seeding are still here."
          action={
            <Link to={x.hrefFor({ screen: "stages", stageKey: "swiss" })} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-[#e3c66f] hover:underline">
              See the Swiss seeding <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          }
        />
      );
    default:
      return <QuietHero d={d} title="No match scheduled" body="There is no upcoming match on the official schedule right now." />;
  }
}

/** The hero at the first density that fits its cell (`from` skips the roomier ones). */
function Hero({ from = 0, to = 2, fill = true }: { from?: Density; to?: Density; fill?: boolean }) {
  const kit = useKit();
  const x = useExperience();
  const focus = overviewFocus(kit.state);
  const word = focus.kind === "live" ? "LIVE" : kit.ctx.short_name.toUpperCase();
  const levels = to - from + 1;
  return (
    <section className={cn(SURFACE, "relative overflow-clip", fill && "h-full")} data-testid="overview-hero" data-focus={focus.kind} aria-label="Now at Worlds">
      {x.desktop && <HeroBackdrop word={word} />}
      {fill ? (
        <FitCascade levels={levels} watch={`${focus.kind}|${kit.state.matches.length}`} className="h-full">
          {(level) => <HeroBody d={(level + from) as Density} />}
        </FitCascade>
      ) : (
        <HeroBody d={from} />
      )}
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

function RoadStages({ d }: { d: Density }) {
  const kit = useKit();
  const x = useExperience();
  const { ctx, state } = kit;
  return (
    <ol className={cn("relative flex flex-col", d === 0 ? "gap-1" : "gap-0.5")}>
      {ctx.stages.map((s, i) => {
        const progress = stageProgress(s, state, ctx);
        const stakes = stageStakes(s, state, ctx);
        const all = stageMatches(state, s.key);
        const done = all.filter((m) => m.state === "completed").length;
        const chip = progress ? PROGRESS[progress] : null;
        return (
          <li key={s.key} className="relative" data-testid="road-stage" data-stage={s.key} data-progress={progress ?? "none"}>
            {i < ctx.stages.length - 1 && (
              <span aria-hidden="true" className={cn("absolute bottom-[-4px] w-px bg-gradient-to-b from-[#c9a84c]/45 to-white/[0.06]", d === 2 ? "left-[21px] top-[34px]" : "left-[25px] top-[42px]")} />
            )}
            <Link
              to={x.hrefFor({ screen: "stages", stageKey: s.key })}
              className={cn(
                "group relative grid gap-3 rounded-xl outline-none transition-colors hover:bg-white/[0.035] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#c9a84c]/70",
                d === 2 ? "grid-cols-[20px_minmax(0,1fr)] p-2.5" : "grid-cols-[28px_minmax(0,1fr)] p-3",
                progress === "current" && "bg-[#c9a84c]/[0.05]",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 inline-flex items-center justify-center rounded-full border font-bold tabular-nums",
                  d === 2 ? "h-5 w-5 text-[10px]" : "h-7 w-7 text-[11px]",
                  progress === "complete" ? "border-white/15 bg-white/10 text-foreground/80" : "border-[#c9a84c]/60 bg-[hsl(214_52%_7%)] text-[#e3c66f]",
                  progress === "current" && "shadow-[0_0_0_4px_hsl(42_70%_50%/0.12)]",
                )}
              >
                {progress === "complete" ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className={cn("font-semibold text-foreground", d === 2 ? "text-sm" : "text-[15px]")}>{stageLabel(s)}</span>
                  {chip && <span className={cn("rounded px-1.5 py-[3px] text-[9.5px] font-bold uppercase leading-none tracking-[0.12em]", chip.cls)}>{chip.label}</span>}
                  {done > 0 && all.length > 0 && d > 0 && <span className="text-[10.5px] tabular-nums text-muted-foreground" data-testid="road-progress">{done}/{all.length} played</span>}
                  <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-[#c9a84c] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
                </span>
                <span className="mt-0.5 block text-xs tabular-nums leading-snug text-muted-foreground">
                  {dateRange(s.starts, s.ends).replace(/\s\d{4}$/, "")} · {s.venue}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-foreground/80" data-testid="road-stakes">{stakesLine(s, stakes)}</span>
                {d === 0 && stakes.teams && stakes.advance !== null && stakes.teams <= 24 && (
                  <span className="mt-2 flex flex-wrap gap-[3px]" aria-hidden="true" data-testid="road-funnel">
                    {Array.from({ length: stakes.teams }, (_, k) => (
                      <span key={k} className={cn("h-1.5 w-1.5 rounded-full", k < (stakes.advance ?? 0) ? "bg-[#e3c66f]" : "bg-white/[0.14]")} />
                    ))}
                  </span>
                )}
                {d === 0 && done > 0 && all.length > 0 && (
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
  );
}

function ExplorerButton() {
  const x = useExperience();
  return (
    <Link
      to={x.hrefFor({ screen: "stages" })}
      data-testid="open-stage-explorer"
      className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#c9a84c]/35 bg-[#c9a84c]/[0.06] text-sm font-semibold text-[#e3c66f] outline-none transition-colors hover:bg-[#c9a84c]/[0.12] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c9a84c]"
    >
      Open the Stage Explorer <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

function StageRoad({ d, framed = true }: { d: Density; framed?: boolean }) {
  const kit = useKit();
  return (
    <div className={cn("flex h-full min-h-0 flex-col", framed && (d === 2 ? "p-4" : "p-5"))}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="road-title" className="text-lg leading-none">Road to the Final</h2>
        <span className="text-[11px] tabular-nums text-muted-foreground">{kit.state.counts.matches} matches</span>
      </div>
      <div className="mt-2.5">
        <RoadStages d={d} />
      </div>
      <FieldSummary d={d} />
      <div className={cn("flex flex-col", d === 2 ? "mt-2.5" : "mt-3")}>
        <ExplorerButton />
      </div>
    </div>
  );
}

/** The field by region: who is here, and how many start in the Play-In. */
function FieldSummary({ d }: { d: Density }) {
  const { ctx } = useKit();
  const x = useExperience();
  const direct = ctx.participants.filter((p) => p.entry_stage === "swiss").length;
  const playIn = ctx.participants.filter((p) => p.entry_stage === "play_in").length;
  return (
    <div className={cn("mt-auto border-t border-white/[0.06]", d === 2 ? "pt-2.5" : "pt-3")} data-testid="field-summary">
      <p className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <Link
          to={x.hrefFor({ screen: "teams" })}
          data-testid="overview-open-teams"
          className="group inline-flex min-h-6 items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-muted-foreground outline-none hover:text-[#e3c66f] focus-visible:text-[#e3c66f]"
        >
          The field <ArrowRight className="h-3 w-3 opacity-60 group-hover:opacity-100" aria-hidden="true" />
        </Link>
        <span className="text-[11px] text-muted-foreground">
          {direct > 0 && playIn > 0 ? `${direct} straight to Swiss · ${playIn} in the Play-In` : `${ctx.participants.length} teams`}
        </span>
      </p>
      <ul className={cn("grid", d === 0 ? "mt-3 grid-cols-3 gap-x-3 gap-y-2.5" : "mt-1.5 grid-cols-6 gap-x-2")}>
        {ctx.regions.map((r) => {
          const n = ctx.participants.filter((p) => p.region === r).length;
          if (!n) return null;
          return (
            <li key={r} className="min-w-0" data-testid="field-region" data-region={r}>
              <span className="flex items-baseline gap-1">
                <span className={cn("font-bold text-foreground", d === 0 ? "text-[13px]" : "text-[11px]")}>{r}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{n}</span>
              </span>
              {d === 0 && (
                <span className="mt-1 flex gap-[3px]" aria-hidden="true">
                  {Array.from({ length: n }, (_, k) => <span key={k} className="h-1 flex-1 rounded-full bg-[#c9a84c]/45" />)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── at stake ───────────────────────────────────────────────────────────── */

function StakesBody({ d, framed = true }: { d: Density; framed?: boolean }) {
  const kit = useKit();
  const { ctx, state } = kit;
  const key = defaultStageKey(state, ctx);
  const stage = key ? stageOf(ctx, key) : null;
  if (!stage) return <p className="p-5 text-sm text-muted-foreground">No stage is on the official schedule.</p>;
  const stakes = stageStakes(stage, state, ctx);
  const swiss = stage.bracket === "swiss";
  const recs = state.swiss.records;
  const entrants = ctx.participants.filter((p) => p.entry_stage === stage.key);
  const authority = stage.key === "play_in" ? state.play_in.bracket_authority === "standings" : false;
  const qualified = stage.key === "knockout" ? state.knockout_teams : [];
  return (
    <div className={cn("flex h-full min-h-0 flex-col", framed && (d === 2 ? "p-4" : "p-5"))} data-testid="stakes" data-stage={stage.key}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="stakes-title" className="text-lg leading-none">At stake</h2>
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#c9a84c]">{stageLabel(stage)}</span>
      </div>
      {swiss && recs.length > 0 ? (
        <div className={cn("grid grid-cols-3 gap-3", d === 0 ? "mt-4" : "mt-3")}>
          <Figure value={recs.filter((r) => r.status === "advanced").length} label="Advanced" tone="gold" testId="stake-advanced" />
          <Figure value={recs.filter((r) => r.status === "active").length} label="Still alive" testId="stake-alive" />
          <Figure value={recs.filter((r) => r.status === "eliminated").length} label="Eliminated" tone="muted" testId="stake-eliminated" />
        </div>
      ) : (
        <div className={cn("grid grid-cols-3 gap-3", d === 0 ? "mt-4" : "mt-3")}>
          <Figure value={stakes.teams ?? "—"} label="Teams" testId="stake-teams" />
          <Figure value={stakes.advance ?? "—"} label={stakes.nextStage ? `To ${stageLabel(stakes.nextStage)}` : "Champion"} tone="gold" testId="stake-advance" />
          <Figure value={stakes.eliminated ?? "—"} label="Go home" tone="muted" testId="stake-eliminated" />
        </div>
      )}
      <p className={cn("leading-relaxed text-muted-foreground", d === 0 ? "mt-4 text-xs" : "mt-2.5 text-[11.5px] leading-snug")} data-testid="stakes-format">{stage.format_note}</p>
      {!swiss && entrants.length > 0 && (
        <div className={cn("mt-auto", d === 0 ? "pt-4" : "pt-2.5")}>
          <Eyebrow tone="muted">In the {stageLabel(stage)}</Eyebrow>
          <ul className={cn("grid grid-cols-2", d === 0 ? "mt-2.5 gap-x-3 gap-y-2" : "mt-1.5 gap-x-3 gap-y-1")} aria-label={`${stageLabel(stage)} teams`}>
            {entrants.map((p) => {
              const out = authority && state.play_in.eliminated.includes(p.code);
              const won = authority && state.play_in.winner_code === p.code;
              return (
                <li key={p.code} className={cn("flex min-w-0 items-center gap-2", out && "opacity-50")} data-testid="stakes-team" data-team={p.code}>
                  <TeamCrest teamKey={p.team_key} name={displayName(p)} shortCode={p.code} size={d === 0 ? "sm" : "xs"} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
                      {p.code}
                      {won && <span className="rounded bg-[#c9a84c]/15 px-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#e3c66f]">Won</span>}
                      {out && <span className="rounded border border-white/15 px-1 text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Out</span>}
                    </span>
                    {d === 0 && <span className="block text-[11px] leading-tight text-muted-foreground">{[p.region, p.qualification].filter(Boolean).join(" · ")}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {qualified.length > 0 && (
        <div className={cn("mt-auto", d === 0 ? "pt-4" : "pt-2.5")}>
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
    </div>
  );
}

/* ── coming up / results ────────────────────────────────────────────────── */

function FixtureRow({ match, showScore }: { match: TournamentMatchV2; showScore?: boolean }) {
  const kit = useKit();
  const x = useExperience();
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
    <Link
      to={match.stage ? x.hrefFor({ screen: "stages", stageKey: match.stage, matchId: match.match_id }) : "#"}
      state={{ ux1Panel: true }}
      data-testid="fixture"
      data-match-id={match.match_id}
      className="grid h-[52px] grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 outline-none transition-colors hover:bg-white/[0.04] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#c9a84c]/70"
    >
      <span className="whitespace-nowrap text-xs font-medium tabular-nums leading-tight text-foreground/80">
        <span className="block text-[10.5px] font-normal text-muted-foreground">{day ? dayLabel(localDayKey(match.scheduled_start) ?? "") : ""}</span>
        {time}
      </span>
      <span className="min-w-0">
        {named ? (
          <span className="flex min-w-0 items-center gap-2 text-sm">
            {side(match.teams[0])}
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{showScore && scoreV2(match) ? scoreV2(match) : "v"}</span>
            {side(match.teams[1])}
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
  );
}

type FixtureView = "upcoming" | "results";

function ComingUpBody({ framed = true }: { framed?: boolean }) {
  const kit = useKit();
  const x = useExperience();
  const focus = overviewFocus(kit.state);
  const exclude = focus.kind === "next" ? [focus.match.match_id] : [];
  const results = recentResults(kit.state, Number.POSITIVE_INFINITY);
  const next = upcoming(kit.state, Number.POSITIVE_INFINITY, exclude);
  const [view, setView] = useState<FixtureView>("upcoming");
  const shown: FixtureView = results.length ? view : "upcoming";
  const items = shown === "results" ? results : next;
  return (
    <div className={cn("flex h-full min-h-0 flex-col", framed && "p-5")} data-testid="coming-up" data-view={shown}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="coming-title" className="text-lg leading-none">{results.length ? "Results & fixtures" : "Coming up"}</h2>
        <Link
          to={x.hrefFor({ screen: "schedule" })}
          data-testid="overview-open-schedule"
          className="inline-flex min-h-8 items-center gap-1 whitespace-nowrap text-xs font-semibold text-[#e3c66f] hover:underline"
        >
          Full schedule <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
      {results.length > 0 && (
        <ViewTabs
          className="mt-2.5"
          label="Fixtures or results"
          testId="coming-up-views"
          value={shown}
          onChange={setView}
          views={[
            { key: "upcoming", label: "Coming up", count: next.length },
            { key: "results", label: "Results", count: results.length },
          ]}
        />
      )}
      <div className="mt-2 flex min-h-0 flex-1 flex-col" role="tabpanel" aria-label={shown === "results" ? "Results" : "Coming up"}>
        <FitPages
          items={items}
          keyOf={(m) => m.match_id}
          render={(m) => <FixtureRow match={m} showScore={shown === "results"} />}
          noun={shown === "results" ? "Results" : "Fixtures"}
          resetKey={shown}
          testId="coming-up-pages"
          minRows={2}
          empty={<p className="px-2 text-sm text-muted-foreground">{shown === "results" ? "No results yet." : "No fixtures on the official schedule."}</p>}
        />
      </div>
    </div>
  );
}

/* ── screen ─────────────────────────────────────────────────────────────── */

type PhonePanel = "now" | "coming" | "stakes" | "road";

/** A raised panel whose content is drawn at the first density that fits. */
function Panel({ label, testId, levels, watch, className, children }: {
  label: string;
  testId?: string;
  levels: number;
  watch: string;
  className?: string;
  children: (level: number) => ReactNode;
}) {
  return (
    <section className={cn(SURFACE, "min-h-0 overflow-clip", className)} aria-labelledby={label} data-testid={testId}>
      <FitCascade levels={levels} watch={watch} className="h-full">
        {children}
      </FitCascade>
    </section>
  );
}

/**
 * One region, several views: the phone's way to hold the panels. With
 * `withNow` (the shortest phones) the hero is a view too, the first one,
 * rather than a block above that leaves the panels no room.
 */
function PanelViews({ d, watch, withNow = false }: { d: Density; watch: string; withNow?: boolean }) {
  const [chosen, setPanel] = useState<PhonePanel>(withNow ? "now" : "coming");
  const panel: PhonePanel = !withNow && chosen === "now" ? "coming" : chosen;
  if (withNow && panel === "now") {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2.5">
        <PanelTabs panel={panel} setPanel={setPanel} withNow />
        <div className="min-h-0 flex-1" role="tabpanel" aria-label="Now">
          <Hero from={2} to={3} />
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <PanelTabs panel={panel} setPanel={setPanel} withNow={withNow} />
      <section className={cn(SURFACE, "flex min-h-0 flex-1 flex-col overflow-clip p-3.5")} role="tabpanel" aria-label={panel === "coming" ? "Coming up" : panel === "stakes" ? "At stake" : "Road to the Final"} data-panel={panel} data-testid={panel === "road" ? "stage-road" : undefined}>
        {panel === "coming" ? (
          <ComingUpBody framed={false} />
        ) : (
          <FitCascade levels={2} watch={`${watch}|${panel}`} className="h-full">
            {(level) => (panel === "stakes" ? <StakesBody d={Math.max(d, level + 1) as Density} framed={false} /> : <StageRoad d={(level === 0 ? d : 2) as Density} framed={false} />)}
          </FitCascade>
        )}
      </section>
    </div>
  );
}

function PanelTabs({ panel, setPanel, withNow }: { panel: PhonePanel; setPanel: (p: PhonePanel) => void; withNow: boolean }) {
  return (
    <ViewTabs
      label="Overview panels"
      testId="overview-panels"
      value={panel}
      onChange={setPanel}
      views={[
        ...(withNow ? [{ key: "now" as PhonePanel, label: "Now" }] : []),
        { key: "coming", label: withNow ? "Fixtures" : "Coming up" },
        { key: "stakes", label: "At stake" },
        { key: "road", label: "Road" },
      ]}
    />
  );
}

function PhoneOverview() {
  const kit = useKit();
  const wide = useMediaQuery("(min-width: 640px)");
  const watch = `${kit.state.phase}|${kit.state.matches.map((m) => m.state[0]).join("")}`;
  const views = (heroD: Density, d: Density) => (
    <div className="flex h-full flex-col gap-2.5">
      <div className="shrink-0">
        <Hero from={heroD} fill={false} />
      </div>
      <PanelViews d={d} watch={watch} />
    </div>
  );
  return (
    <div className="h-full px-3 py-3" data-testid="overview" data-layout="compact">
      <FitCascade levels={wide ? 4 : 3} watch={`${watch}|${wide}`} className="h-full">
        {(level) => {
          // A tablet first tries every panel at once; a phone starts with views.
          if (wide && level === 0) {
            return (
              <div className="grid h-full grid-cols-2 grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)] gap-3">
                <div className="col-span-2"><Hero from={1} fill={false} /></div>
                <section className={cn(SURFACE, "row-span-2 flex min-h-0 flex-col overflow-clip")} aria-labelledby="coming-title"><ComingUpBody /></section>
                <Panel label="stakes-title" levels={2} watch={watch}>{(l) => <StakesBody d={(l + 1) as Density} />}</Panel>
                <Panel label="road-title" testId="stage-road" levels={2} watch={watch}>{(l) => <StageRoad d={(l + 1) as Density} />}</Panel>
              </div>
            );
          }
          const step = level - (wide ? 1 : 0);
          // Hero above the views, then a tighter hero, then the hero as a view.
          if (step >= 2) {
            return (
              <div className="flex h-full flex-col">
                <PanelViews d={2} watch={watch} withNow />
              </div>
            );
          }
          return views(step === 1 ? 3 : 2, step === 1 ? 2 : 1);
        }}
      </FitCascade>
    </div>
  );
}

export function OverviewScreen() {
  const x = useExperience();
  const kit = useKit();
  if (!x.desktop) return <PhoneOverview />;
  const watch = `${kit.state.phase}|${kit.state.matches.map((m) => m.state[0]).join("")}`;
  return (
    <div className="h-full" data-testid="overview" data-layout="wide">
      <FitCascade levels={2} watch={watch} className="mx-auto h-full max-w-[1680px]" testId="overview-fit">
        {(level) =>
          level === 0 ? (
            // Room for everything: the hero over At stake + Coming up, the road beside.
            <div className="grid h-full grid-cols-12 grid-rows-[minmax(0,1.15fr)_minmax(0,1fr)] gap-4 px-6 py-5">
              <div className="col-span-8 min-h-0"><Hero /></div>
              <Panel className="col-span-4 row-span-2" label="road-title" testId="stage-road" levels={3} watch={watch}>{(l) => <StageRoad d={l as Density} />}</Panel>
              <Panel className="col-span-4" label="stakes-title" levels={2} watch={watch}>{(l) => <StakesBody d={l as Density} />}</Panel>
              <section className={cn(SURFACE, "col-span-4 flex min-h-0 flex-col overflow-clip")} aria-labelledby="coming-title"><ComingUpBody /></section>
            </div>
          ) : (
            // A short screen: one row — the hero, then fixtures / stakes as views, then the road.
            <div className="grid h-full grid-cols-12 gap-4 px-6 py-4">
              <div className="col-span-5 min-h-0"><Hero from={1} /></div>
              <div className="col-span-4 flex min-h-0 flex-col">
                <ShortMiddle watch={watch} />
              </div>
              <Panel className="col-span-3" label="road-title" testId="stage-road" levels={2} watch={watch}>{(l) => <StageRoad d={(l + 1) as Density} />}</Panel>
            </div>
          )
        }
      </FitCascade>
    </div>
  );
}

/** The short desktop's middle column: Coming up and At stake as two views of one panel. */
function ShortMiddle({ watch }: { watch: string }) {
  const [view, setView] = useState<"coming" | "stakes">("coming");
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <ViewTabs
        label="Overview panels"
        testId="overview-panels"
        value={view}
        onChange={setView}
        views={[
          { key: "coming", label: "Fixtures" },
          { key: "stakes", label: "At stake" },
        ]}
      />
      <section className={cn(SURFACE, "flex min-h-0 flex-1 flex-col overflow-clip")} role="tabpanel" aria-label={view === "coming" ? "Coming up" : "At stake"} data-panel={view}>
        {view === "coming" ? (
          <ComingUpBody />
        ) : (
          <FitCascade levels={2} watch={watch} className="h-full">
            {(l) => <StakesBody d={(l + 1) as Density} />}
          </FitCascade>
        )}
      </section>
    </div>
  );
}
