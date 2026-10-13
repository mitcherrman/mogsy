/**
 * Screen 04 — Schedule (UX2): the tournament calendar as a match board.
 *
 * A stage filter (All · Play-In · Swiss · Knockouts) and a DATE RAIL of every
 * local day with a served fixture: each day shows its date, match count,
 * stage, live or done marks, and the rail shows the gaps between match days
 * as gaps (never filled). Under it, the selected DAY BOARD: one row per
 * fixture in start order, with local time, stage / round, both sides (crests,
 * or where an unnamed side comes from), score and state. A row opens the
 * shared match detail (the adaptive context column on desktop, the sheet on a
 * phone); the detail can take the match to its stage.
 *
 * URL: `?day=YYYY-MM-DD` and `?stage=<slug>` are view settings (replace);
 * `?match=<id>` is a detail (push, switch replaces, close pops). The day a
 * board opens on: the linked one, else a day with live play, else today,
 * else the next day ahead, else the last day (`pickDay`).
 */
import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight, CircleDot } from "lucide-react";

import MatchStateBadge from "@/components/pro-play/hub/MatchStateBadge";
import { TeamCrest } from "@/components/pro-play/media/EntityCrest";
import { useKit } from "@/components/pro-play/tournament/TournamentParts";
import { localStart } from "@/lib/pro-play/hubSeries";
import type { TournamentMatchTeamV2, TournamentMatchV2 } from "@/lib/pro-play/tournamentApi";
import { localDayKey } from "@/lib/pro-play/tournamentView";
import { awaitingDraw, bothTbd, outcomeOf, slotLabel, stageOf, teamName } from "@/lib/pro-play/tournamentV2View";
import { stageLabel } from "@/lib/pro-play/worldsExperience/navigation";
import { daysBetween, filterCounts, pickDay, scheduleDays, type ScheduleDay } from "@/lib/pro-play/worldsExperience/scheduleView";
import { cn } from "@/lib/utils";

import { ContextColumn, MatchSheet } from "./Detail";
import { useExperience } from "./ExperienceContext";
import { DURATION, OFFSET, slideTransition, slideVariants } from "./motion";
import { Eyebrow, GOLD_TEXT, SURFACE, rovingKeys } from "./parts";

const STAGE_TICK: Record<string, string> = {
  play_in: "bg-cyan-300/80",
  swiss: "bg-[#c9a84c]/90",
  knockout: "bg-[#f1dc9c]",
};

const dayDate = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/* ── filter ─────────────────────────────────────────────────────────────── */

function StageFilter() {
  const kit = useKit();
  const x = useExperience();
  const options = filterCounts(kit.state, x.stageKeys);
  return (
    <div className={cn(!x.desktop && "-mx-3 overflow-x-auto px-3 pb-1")} data-swipe-ignore>
      <div role="group" aria-label="Filter the schedule by stage" className={cn("flex gap-1.5", !x.desktop && "w-max")} onKeyDown={rovingKeys} data-testid="schedule-filter">
        {options.map((o) => {
          const stage = o.key ? stageOf(kit.ctx, o.key) : null;
          const on = x.filterKey === o.key;
          return (
            <button
              key={o.key ?? "all"}
              type="button"
              data-roving
              aria-pressed={on}
              data-testid="schedule-filter-chip"
              data-stage={o.key ?? "all"}
              onClick={() => x.setFilter(o.key)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#c9a84c] lg:min-h-9",
                on ? "border-[#c9a84c]/70 bg-[#c9a84c]/[0.12] text-[#f1dc9c]" : "border-white/10 text-foreground/75 hover:border-white/20 hover:text-foreground",
              )}
            >
              {o.key && <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", STAGE_TICK[o.key] ?? "bg-white/40")} />}
              {stage ? stageLabel(stage) : "All"}
              <span className="tabular-nums text-muted-foreground">{o.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── date rail ──────────────────────────────────────────────────────────── */

function DayCell({ d, selected, today }: { d: ScheduleDay; selected: boolean; today: boolean }) {
  const x = useExperience();
  const date = dayDate(d.day);
  const done = d.completed === d.matches.length;
  return (
    <button
      type="button"
      data-roving
      data-testid="day-cell"
      data-day={d.day}
      aria-pressed={selected}
      aria-label={`${date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}, ${d.matches.length} ${d.matches.length === 1 ? "match" : "matches"}${d.live ? ", live now" : ""}`}
      onClick={() => x.setDay(d.day)}
      className={cn(
        "relative flex shrink-0 flex-col items-center rounded-xl border outline-none transition-[border-color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-[#c9a84c]",
        x.desktop ? "w-[58px] py-2" : "w-[60px] py-1.5",
        selected ? "border-[#c9a84c] bg-[#c9a84c]/[0.1] shadow-[0_0_0_1px_#c9a84c,0_10px_24px_-14px_rgba(201,168,76,0.9)]" : "border-white/[0.07] bg-white/[0.015] hover:border-white/20",
      )}
    >
      <span className={cn("text-[10px] font-semibold uppercase tracking-[0.14em]", selected ? "text-[#e3c66f]" : "text-muted-foreground")}>
        {today ? "Today" : date.toLocaleDateString(undefined, { weekday: "short" })}
      </span>
      <span className={cn("font-bold tabular-nums leading-tight", x.desktop ? "text-xl" : "text-lg", selected ? "text-[#f6e7b3]" : "text-foreground")}>{date.getDate()}</span>
      <span className="text-[10px] text-muted-foreground">{date.toLocaleDateString(undefined, { month: "short" })}</span>
      <span className="mt-1 flex items-center gap-[3px]" aria-hidden="true">
        {d.matches.slice(0, 8).map((m) => (
          <span key={m.match_id} className={cn("h-1 w-1 rounded-full", m.state === "live" ? "bg-emerald-400" : m.state === "completed" ? "bg-white/45" : STAGE_TICK[m.stage ?? ""] ?? "bg-white/30")} />
        ))}
      </span>
      {d.live > 0 && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 motion-reduce:animate-none" aria-hidden="true" />}
      {done && !d.live && <span className="sr-only">, all played</span>}
    </button>
  );
}

function DateRail({ days, selected }: { days: ScheduleDay[]; selected: string }) {
  const kit = useKit();
  const x = useExperience();
  const rail = useRef<HTMLDivElement>(null);
  const today = localDayKey(new Date(kit.now).toISOString());
  useEffect(() => {
    rail.current?.querySelector<HTMLElement>(`[data-day="${selected}"]`)?.scrollIntoView?.({ block: "nearest", inline: "center", behavior: x.reduced ? "auto" : "smooth" });
  }, [selected, x.reduced]);
  const i = days.findIndex((d) => d.day === selected);
  const step = (dir: -1 | 1) => {
    const next = days[i + dir];
    if (next) x.setDay(next.day);
  };
  const onKey = (e: KeyboardEvent<HTMLElement>) => rovingKeys(e);
  // Stage runs: a label over the first day of each run of one stage.
  let lastStage = "";
  return (
    <div className="flex items-stretch gap-2" data-testid="date-rail">
      {x.desktop && (
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={i <= 0}
          aria-label="Previous match day"
          data-testid="day-prev"
          className="inline-flex w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] text-foreground/80 outline-none hover:border-white/20 focus-visible:ring-2 focus-visible:ring-[#c9a84c] disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      <div ref={rail} className="min-w-0 flex-1 overflow-x-auto pb-1 [scrollbar-width:thin]" data-swipe-ignore>
        <div className="flex w-max items-end gap-1" role="group" aria-label="Match days" onKeyDown={onKey}>
          {days.map((d, k) => {
            const prev = days[k - 1];
            const gap = prev ? daysBetween(prev.day, d.day) - 1 : 0;
            const stage = d.stages[0] ?? "";
            const label = stage !== lastStage ? stageOf(kit.ctx, stage) : null;
            lastStage = stage;
            return (
              <div key={d.day} className="flex items-end gap-1">
                {gap > 0 && (
                  <span className="mb-6 flex w-5 flex-col items-center text-[9px] leading-none text-muted-foreground/70" data-testid="day-gap" title={`${gap} ${gap === 1 ? "day" : "days"} without matches`}>
                    <span aria-hidden="true">···</span>
                    <span className="sr-only">{gap} days without matches</span>
                  </span>
                )}
                <div className="flex flex-col gap-1">
                  <span className={cn("h-3.5 whitespace-nowrap pl-0.5 text-[9.5px] font-bold uppercase tracking-[0.16em]", label ? "text-muted-foreground" : "")} aria-hidden="true">
                    {label ? stageLabel(label) : ""}
                  </span>
                  <DayCell d={d} selected={d.day === selected} today={d.day === today} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {x.desktop && (
        <button
          type="button"
          onClick={() => step(1)}
          disabled={i < 0 || i >= days.length - 1}
          aria-label="Next match day"
          data-testid="day-next"
          className="inline-flex w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] text-foreground/80 outline-none hover:border-white/20 focus-visible:ring-2 focus-visible:ring-[#c9a84c] disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/* ── day board ──────────────────────────────────────────────────────────── */

function Side({ team, match, align }: { team: TournamentMatchTeamV2; match: TournamentMatchV2; align: "left" | "right" }) {
  const kit = useKit();
  const x = useExperience();
  const right = align === "right";
  if (team.tbd || !team.code) {
    return (
      <span className={cn("flex min-w-0 items-center gap-2.5 text-muted-foreground", right && "flex-row-reverse text-right")} data-testid="row-tbd">
        <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center justify-center rounded-md border border-dashed border-white/20 text-[10px]", x.desktop ? "h-9 w-9" : "h-7 w-7")}>?</span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">TBD</span>
          <span className="block truncate text-[11px]">{slotLabel(team.slot, kit.byId, kit.names) ?? "To be decided"}</span>
        </span>
      </span>
    );
  }
  const o = outcomeOf(match, team);
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", right && "flex-row-reverse text-right", o === "loss" && "opacity-55")} data-team={team.code}>
      <TeamCrest teamKey={team.team_key} name={teamName(team, kit.byCode)} shortCode={team.code} size={x.desktop ? "sm" : "xs"} />
      <span className="min-w-0">
        <span className={cn("block text-[15px] font-bold leading-tight", o === "win" ? GOLD_TEXT : "text-foreground")}>{team.code}</span>
        {x.desktop && <span className="block truncate text-[11px] text-muted-foreground">{teamName(team, kit.byCode)}</span>}
      </span>
    </span>
  );
}

/** "Swiss · Round 3 · Bo1"; the stage is dropped on a day that has only one (the header says it). */
function rowCaption(m: TournamentMatchV2, names: Map<string, string>, stageName: string, withStage = true) {
  const parts = withStage ? [stageName] : [];
  if (m.swiss_round) parts.push(`Round ${m.swiss_round}`);
  else {
    const n = names.get(m.match_id);
    if (n && n !== stageName) parts.push(n);
  }
  if (m.best_of) parts.push(`Bo${m.best_of}`);
  return parts.join(" · ");
}

function FixtureRow({ m, withStage }: { m: TournamentMatchV2; withStage: boolean }) {
  const kit = useKit();
  const x = useExperience();
  const stage = stageOf(kit.ctx, m.stage);
  const selected = x.loc.matchId === m.match_id;
  const [, time] = (localStart(m.scheduled_start) ?? " · ").split(" · ");
  const pending = bothTbd(m);
  const drawn = awaitingDraw(m) && m.teams.some((t) => t.slot?.kind === "draw");
  const score = m.state !== "upcoming" ? [m.teams[0].game_wins, m.teams[1].game_wins] : null;
  return (
    <li className="relative">
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => x.selectMatch(m.match_id)}
        data-testid="fixture-row"
        data-match-id={m.match_id}
        data-state={m.state}
        className={cn(
          "relative grid w-full items-center text-left outline-none transition-[border-color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c9a84c]",
          x.desktop
            ? "grid-cols-[86px_minmax(0,0.9fr)_minmax(0,1fr)_72px_minmax(0,1fr)_96px] gap-4 rounded-xl border px-4 py-3"
            : "grid-cols-[66px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-xl border px-3 py-2.5",
          selected
            ? "border-[#c9a84c] bg-[#c9a84c]/[0.07] shadow-[0_0_0_1px_#c9a84c]"
            : m.state === "live"
              ? "border-emerald-500/50 bg-emerald-500/[0.04] hover:border-emerald-400/70"
              : "border-white/[0.06] bg-white/[0.012] hover:border-white/15 hover:bg-white/[0.03]",
        )}
      >
        <span className="flex flex-col">
          <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">{time}</span>
          {!x.desktop && m.state !== "upcoming" && (
            // The phone's time column is narrow: the state as a word, not the badge.
            <span
              data-testid="row-state"
              className={cn(
                "mt-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em]",
                m.state === "live" ? "text-emerald-300" : "text-muted-foreground",
              )}
            >
              {m.state === "live" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 motion-reduce:animate-none" aria-hidden="true" />}
              {m.state === "live" ? "Live" : "Final"}
            </span>
          )}
        </span>
        {x.desktop && (
          <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground" data-testid="row-caption">
            {rowCaption(m, kit.names, stage ? stageLabel(stage) : "Match", withStage)}
          </span>
        )}
        {pending ? (
          <span className={cn("text-sm text-muted-foreground", x.desktop ? "col-span-3 text-center" : "")} data-testid="row-pending">
            {!x.desktop && <span className="mb-0.5 block text-[10.5px] font-semibold uppercase tracking-[0.12em]">{rowCaption(m, kit.names, stage ? stageLabel(stage) : "Match")}</span>}
            {drawn || m.stage === "swiss" ? "Pairing published by the official draw" : (slotLabel(m.teams[0].slot, kit.byId, kit.names) && slotLabel(m.teams[1].slot, kit.byId, kit.names)
              ? `${slotLabel(m.teams[0].slot, kit.byId, kit.names)} v ${slotLabel(m.teams[1].slot, kit.byId, kit.names)}`
              : "Teams to be decided")}
          </span>
        ) : x.desktop ? (
          <>
            <Side team={m.teams[0]} match={m} align="left" />
            <span className={cn("text-center font-extrabold tabular-nums", score ? "text-xl text-foreground" : "text-sm font-semibold text-muted-foreground")} data-testid="row-score">
              {score ? `${score[0]}–${score[1]}` : "vs"}
            </span>
            <Side team={m.teams[1]} match={m} align="right" />
          </>
        ) : (
          <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-y-1.5">
            <Side team={m.teams[0]} match={m} align="left" />
            <span className={cn("text-right font-bold tabular-nums", outcomeOf(m, m.teams[0]) === "win" ? GOLD_TEXT : "text-foreground/80")}>{score ? score[0] : ""}</span>
            <Side team={m.teams[1]} match={m} align="left" />
            <span className={cn("text-right font-bold tabular-nums", outcomeOf(m, m.teams[1]) === "win" ? GOLD_TEXT : "text-foreground/80")}>{score ? score[1] : ""}</span>
          </span>
        )}
        {x.desktop && (
          <span className="flex justify-end">
            <MatchStateBadge state={m.state} size="sm" />
          </span>
        )}
      </button>
    </li>
  );
}

function DayBoard({ day }: { day: ScheduleDay }) {
  const kit = useKit();
  const x = useExperience();
  const date = dayDate(day.day);
  const stages = day.stages.map((k) => stageOf(kit.ctx, k)).filter((s): s is NonNullable<typeof s> => Boolean(s));
  const rounds = [...new Set(day.matches.map((m) => m.swiss_round).filter((r): r is number => typeof r === "number"))];
  const title = date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  return (
    <section aria-labelledby="day-title" data-testid="day-board" data-day={day.day} className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 id="day-title" className={cn("!font-sans font-bold leading-tight text-foreground [text-shadow:none]", x.desktop ? "text-[22px]" : "text-lg")}>
            {title}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {stages.map((s) => stageLabel(s)).join(" · ")}
            {rounds.length ? ` · Round ${rounds.join(", ")}` : ""}
            {stages[0] ? ` · ${stages[0].venue}` : ""}
          </p>
        </div>
        <p className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground" data-testid="day-counts">
          <span>{day.matches.length} {day.matches.length === 1 ? "match" : "matches"}</span>
          {day.live > 0 && <span className="inline-flex items-center gap-1 text-emerald-300"><CircleDot className="h-3 w-3" aria-hidden="true" /> {day.live} live</span>}
          {day.completed > 0 && <span>{day.completed} played</span>}
        </p>
      </header>
      <ol className="space-y-1.5" data-testid="day-fixtures">
        {day.matches.map((m) => <FixtureRow key={m.match_id} m={m} withStage={day.stages.length > 1} />)}
      </ol>
    </section>
  );
}

function DayBrief({ day }: { day: ScheduleDay }) {
  const kit = useKit();
  const x = useExperience();
  const stages = day.stages.map((k) => stageOf(kit.ctx, k)).filter((s): s is NonNullable<typeof s> => Boolean(s));
  const first = localStart(day.matches[0].scheduled_start)?.split(" · ")[1];
  const last = localStart(day.matches[day.matches.length - 1].scheduled_start)?.split(" · ")[1];
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="day-brief">
      <header className="border-b border-white/[0.07] px-5 pb-4 pt-5">
        <Eyebrow>Day brief</Eyebrow>
        <p className="mt-2.5 text-sm text-foreground/85">{dayDate(day.day).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
      </header>
      <div className="space-y-4 px-5 py-4 text-sm">
        <p className="tabular-nums text-foreground/85">
          {day.matches.length} {day.matches.length === 1 ? "match" : "matches"}, {first}
          {last && last !== first ? ` – ${last}` : ""} (your time)
        </p>
        {stages.map((s) => (
          <div key={s.key} className="space-y-1.5">
            <p className="font-semibold">{stageLabel(s)} · {s.venue}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">{s.format_note}</p>
            <Link to={x.hrefFor({ screen: "stages", stageKey: s.key })} className="inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-[#e3c66f] hover:underline">
              Open the {stageLabel(s)} in the Stage Explorer <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── screen ─────────────────────────────────────────────────────────────── */

export function ScheduleScreen() {
  const kit = useKit();
  const x = useExperience();
  const days = useMemo(() => scheduleDays(kit.state, x.filterKey), [kit.state, x.filterKey]);
  const selectedDay = pickDay(days, x.loc.day, kit.now);
  const day = days.find((d) => d.day === selectedDay) ?? null;
  const index = days.findIndex((d) => d.day === selectedDay);
  // The board slides with the calendar: a later day enters from the right.
  const prevIndex = useRef(index);
  const dir = index > prevIndex.current ? 1 : index < prevIndex.current ? -1 : 0;
  useEffect(() => {
    prevIndex.current = index;
  }, [index]);

  const coverage = kit.state.coverage;
  const empty = (
    <div className="p-6 text-sm text-muted-foreground" data-testid="schedule-empty">
      {kit.state.phase === "unknown"
        ? "The official schedule couldn't be read, so there are no fixtures to show. The field is still on the Teams screen."
        : "No fixtures for this stage are on the official schedule right now."}
    </div>
  );
  const partial =
    coverage.complete === false && kit.state.phase !== "unknown" ? (
      <p className="text-[11px] text-amber-200/80" data-testid="schedule-partial">
        Showing the {coverage.found_matches} of {coverage.expected_matches} fixtures that could be read. Missing ones aren't drawn.
      </p>
    ) : null;

  const board = day ? (
    <AnimatePresence initial={false} mode="popLayout" custom={dir}>
      <motion.div
        key={day.day}
        custom={dir}
        variants={slideVariants(OFFSET.stage, x.reduced)}
        initial="enter"
        animate="center"
        exit="exit"
        transition={slideTransition(DURATION.stage, x.reduced)}
      >
        <DayBoard day={day} />
      </motion.div>
    </AnimatePresence>
  ) : (
    empty
  );

  if (!x.desktop) {
    return (
      <div className="space-y-3 px-3 pb-24 pt-3" data-testid="schedule">
        <StageFilter />
        {days.length > 0 && selectedDay && <DateRail days={days} selected={selectedDay} />}
        {partial}
        <div className="overflow-x-clip">{board}</div>
        <MatchSheet />
      </div>
    );
  }
  return (
    <div className="mx-auto flex h-full max-w-[1760px] flex-col gap-3 px-6 pb-5 pt-4" data-testid="schedule">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StageFilter />
        {partial}
      </div>
      {days.length > 0 && selectedDay && <DateRail days={days} selected={selectedDay} />}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_auto] gap-4">
        <section className={cn(SURFACE, "relative min-h-0 overflow-hidden")} aria-label="Fixtures">
          <div className="h-full overflow-y-auto overscroll-contain p-5" data-testid="schedule-scroll">
            {board}
          </div>
        </section>
        {day && <ContextColumn brief={<DayBrief day={day} />} briefLabel="Day brief" briefKey={day.day} />}
      </div>
    </div>
  );
}
