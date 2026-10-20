/**
 * The Worlds experience shell (UX1 prototype; Teams and Schedule in UX2): a
 * tournament application, not a long page.
 *
 * ONE FRAME, FIVE DESTINATIONS. A persistent command bar carries the event's
 * identity, the primary navigation (Overview · Stages · Teams · Schedule ·
 * Discover, the last shown as the structure to come, not as a link) and
 * the event's live status. Beneath it one workspace holds the current screen;
 * moving between screens slides it in the direction of travel, and coming
 * back slides it the other way.
 *
 * NOTHING SCROLLS (UX4). At every size the frame is exactly the viewport the
 * shell leaves under the global HUD, the document is locked while it is
 * mounted, and each screen is composed to fit its workspace: more data than
 * fits is reached through visible controls (pages, views, steppers), never
 * by moving the page or a panel (`fit.tsx`).
 *
 * DATA IS THE PAGE'S. The shell takes a `tournament_context_v2` body exactly
 * as `useTournament` serves it (or a fixture of the same shape) and adds no
 * fact of its own; everything it states comes through `tournamentV2View` and
 * `worldsExperience/experienceView`.
 */
import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowLeft, Brain, Info, RefreshCw } from "lucide-react";

import { EventMark } from "@/components/pro-play/media/EventMark";
import { TournamentKitProvider, useKit } from "@/components/pro-play/tournament/TournamentParts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useViewportLock } from "@/lib/pro-play/worldsExperience/viewportLock";
import { PRO_PLAY_ROUTE, PRO_PLAY_WORLDS_QUIZ_ROUTE } from "@/lib/pro-play/routes";
import type { TournamentResponseV2 } from "@/lib/pro-play/tournamentApi";
import { dateRange } from "@/lib/pro-play/tournamentView";
import { freshness, stageOf } from "@/lib/pro-play/tournamentV2View";
import {
  SCREENS,
  adjacentScreen,
  screenIndex,
  stageLabel,
  type ScreenKey,
} from "@/lib/pro-play/worldsExperience/navigation";
import { cn } from "@/lib/utils";

import { ExperienceProvider, useExperience } from "./ExperienceContext";
import { FitCascade, PagerButton } from "./fit";
import { DURATION, OFFSET, slideTransition, slideVariants } from "./motion";
import { OverviewScreen } from "./OverviewScreen";
import { calendarDay, rovingKeys } from "./parts";
import { ScheduleScreen } from "./ScheduleScreen";
import { StagesScreen } from "./StagesScreen";
import { TeamsScreen } from "./TeamsScreen";

const pad2 = (n: number) => String(n).padStart(2, "0");

/* ── primary navigation ─────────────────────────────────────────────────── */

function PrimaryNav({ compact }: { compact: boolean }) {
  const x = useExperience();
  return (
    <nav aria-label="Worlds 2026" className={cn(compact ? "w-full min-w-0" : "h-full")}>
      <ul
        className={cn("flex", compact ? "grid grid-cols-5" : "h-full items-stretch gap-1")}
        onKeyDown={rovingKeys}
        data-testid="primary-nav"
      >
        {SCREENS.map((s, i) => {
          const active = x.loc.screen === s.key;
          const index = <span className={cn("tabular-nums", compact ? "text-[9px]" : "text-[10px]", active ? "text-[#c9a84c]" : "text-[#c9a84c]/45")}>{pad2(i + 1)}</span>;
          const ink = active && (
            <motion.span
              layoutId="ux1-nav-ink"
              aria-hidden="true"
              transition={{ duration: x.reduced ? 0 : DURATION.screen, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "absolute bg-[linear-gradient(90deg,transparent,#e3c66f_20%,#e3c66f_80%,transparent)]",
                compact ? "inset-x-2 bottom-0 h-[2px]" : "inset-x-3 bottom-0 h-[2px]",
              )}
            />
          );
          if (!s.ready) {
            return (
              <li key={s.key} className="relative flex">
                <span
                  aria-disabled="true"
                  data-testid="nav-future"
                  data-screen={s.key}
                  title={`${s.label} arrives in a later build`}
                  className={cn(
                    "flex cursor-default select-none items-center text-muted-foreground/45",
                    compact ? "w-full flex-col justify-center gap-0.5 py-2 text-[11px]" : "gap-2 px-3 text-[13px]",
                  )}
                >
                  {index}
                  <span className="font-medium">{s.label}</span>
                  <span className="sr-only"> (not available yet)</span>
                </span>
              </li>
            );
          }
          return (
            <li key={s.key} className="relative flex">
              <Link
                to={x.hrefFor({ screen: s.key })}
                data-roving
                data-testid="nav-screen"
                data-screen={s.key}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center outline-none transition-colors focus-visible:bg-white/[0.06] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#c9a84c]/70",
                  compact
                    ? "min-h-11 w-full flex-col justify-center gap-0.5 py-2 text-[11px]"
                    : "gap-2 rounded-md px-3 text-[13px] hover:text-foreground",
                  active ? "text-foreground" : "text-foreground/70",
                )}
              >
                {index}
                <span className={cn("font-semibold tracking-[0.02em]", active && "text-[#f1dc9c]")}>{s.label}</span>
                {ink}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ── status (right of the bar) ──────────────────────────────────────────── */

/** The phase in the bar; `compact` (a phone's bar) says it in fewer words. */
function PhaseChip({ compact = false }: { compact?: boolean }) {
  const { ctx, state } = useKit();
  const live = state.matches.some((m) => m.state === "live");
  let label: string;
  let tone: "live" | "gold" | "muted" = "gold";
  switch (state.phase) {
    case "pre_event":
      label = `Starts ${calendarDay(ctx.starts)}`;
      break;
    case "between_stages": {
      const done = stageOf(ctx, state.phase_detail?.completed_stage);
      label = done ? `${stageLabel(done)} ${compact ? "done" : "complete"}` : "Between stages";
      break;
    }
    case "complete":
      label = compact ? "Complete" : "Event complete";
      tone = "muted";
      break;
    case "unknown":
      label = compact ? "No schedule" : "Schedule unavailable";
      tone = "muted";
      break;
    default: {
      const stage = stageOf(ctx, state.phase);
      // A phone's bar has room for a short stage name only ("KO live").
      const name = stage ? (compact && stage.key === "knockout" ? "KO" : stageLabel(stage)) : "Stage";
      label = `${name} ${live ? "live" : compact ? "now" : "in progress"}`;
      if (live) tone = "live";
    }
  }
  return (
    <span
      data-testid="phase-chip"
      data-phase={state.phase}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[11px] font-semibold uppercase tracking-[0.12em]",
        tone === "live" && "border-emerald-400/50 bg-emerald-500/10 text-emerald-300",
        tone === "gold" && "border-[#c9a84c]/40 bg-[#c9a84c]/[0.07] text-[#e3c66f]",
        tone === "muted" && "border-white/10 text-muted-foreground",
      )}
    >
      {tone === "live" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 motion-reduce:animate-none" aria-hidden="true" />}
      {label}
    </span>
  );
}

function FeedChip({ data, refreshFailed }: { data: TournamentResponseV2; refreshFailed?: boolean }) {
  const fresh = freshness(data);
  const t = fresh.fetchedAt ? new Date(fresh.fetchedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : null;
  const degraded = refreshFailed || fresh.stale || data.state.phase === "unknown";
  return (
    <span
      data-testid="feed-chip"
      data-degraded={String(Boolean(degraded))}
      title="Schedule, results and bracket from the official LoL Esports feed"
      className="hidden items-center gap-1.5 whitespace-nowrap text-[11px] text-muted-foreground 2xl:inline-flex"
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", degraded ? "bg-amber-400" : "bg-emerald-400/80")} aria-hidden="true" />
      {degraded ? "Feed degraded" : "Official feed"}
      {t && !degraded ? <span className="tabular-nums text-muted-foreground/80">· {t}</span> : null}
    </span>
  );
}

/* ── degraded sources: one line, every notice reachable ─────────────────── */

interface Notice {
  key: string;
  /** The whole statement. */
  text: ReactNode;
  /** The same fact in a few words, for a strip too narrow for `text`. */
  short: ReactNode;
  retry?: boolean;
}

function notices(data: TournamentResponseV2, state: TournamentResponseV2["state"], refreshFailed?: boolean): Notice[] {
  const fresh = freshness(data);
  const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : null);
  const lines: Notice[] = [];
  if (refreshFailed) {
    const at = time(data.generated_at);
    lines.push({
      key: "refresh",
      retry: true,
      text: (
        <>
          <b className="font-semibold">Couldn't get the latest update.</b> Showing the last successful response{at ? ` (${at})` : ""}.
        </>
      ),
      short: <><b className="font-semibold">Update failed</b>{at ? ` · showing ${at}` : ""}</>,
    });
  }
  if (state.phase === "unknown") {
    lines.push({
      key: "unknown",
      retry: true,
      text: (
        <>
          <b className="font-semibold">Schedule unavailable.</b> The official schedule couldn't be read: matches, brackets and results aren't shown. The field and Swiss seeding come from the tournament registry.
        </>
      ),
      short: <b className="font-semibold">Schedule unavailable</b>,
    });
  } else if (fresh.stale) {
    const which = fresh.scheduleStale && fresh.standingsStale ? "schedule and standings" : fresh.standingsStale ? "standings" : "schedule";
    const at = time(fresh.fetchedAt);
    lines.push({
      key: "stale",
      retry: true,
      text: (
        <>
          Showing a recent copy of the official {which}
          {at ? ` from ${at}` : ""}: the live source isn't answering right now.
        </>
      ),
      short: <>Recent copy{at ? ` from ${at}` : ""}</>,
    });
  }
  if (state.phase !== "unknown" && state.coverage.complete === false) {
    lines.push({
      key: "partial",
      text: (
        <>
          <b className="font-semibold">Partial schedule.</b> {state.coverage.found_matches} of {state.coverage.expected_matches} matches could be read; missing matches aren't drawn.
        </>
      ),
      short: <><b className="font-semibold">Partial</b> · {state.coverage.found_matches} of {state.coverage.expected_matches} matches</>,
    });
  }
  if (state.phase !== "unknown" && state.coverage.basis === "unverified") {
    lines.push({
      key: "standings",
      text: <>Official standings aren't available: bracket positions, advancement and eliminations aren't shown. Times and results still are.</>,
      short: <>Standings unavailable</>,
    });
  }
  if (state.warnings.some((w) => w.kind === "results_behind_calendar")) {
    lines.push({
      key: "lag",
      text: <>Results may be behind the official calendar: the latest matches haven't been confirmed yet.</>,
      short: <>Results may be behind</>,
    });
  }
  return lines;
}

/**
 * One line under the bar, never more (UX4): the notice in full where it fits,
 * else in a few words with its full statement one tap away (Details). Several
 * notices are stepped through, "1 / 3", rather than stacked.
 */
function StatusStrip({ data, onRetry, retrying, refreshFailed }: {
  data: TournamentResponseV2;
  onRetry?: () => void;
  retrying?: boolean;
  refreshFailed?: boolean;
}) {
  const { state } = useKit();
  const x = useExperience();
  const lines = notices(data, state, refreshFailed);
  const [index, setIndex] = useState(0);
  if (!lines.length) return null;
  const at = Math.min(index, lines.length - 1);
  const retry = (
    <button
      type="button"
      onClick={onRetry}
      disabled={retrying}
      aria-label="Try again"
      className="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-amber-200/30 px-2 text-[11px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70 disabled:opacity-60"
    >
      <RefreshCw className={cn("h-3 w-3", retrying && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
      <span className="hidden sm:inline">Try again</span>
    </button>
  );
  return (
    <div className={cn("flex shrink-0 items-center gap-2 border-b border-amber-500/20 bg-amber-500/[0.06] px-3 text-amber-100/90 lg:px-6", x.landscape ? "h-9" : "h-10")} role="status" data-testid="status-strip" data-count={lines.length}>
      <FitCascade levels={2} watch={`${at}|${lines.map((l) => l.key).join(",")}`} className="flex h-full flex-1 items-center">
        {(level) =>
          lines.map((l, k) => (
            <p key={l.key} hidden={k !== at} data-testid={`status-${l.key}`} data-length={level === 0 ? "full" : "short"} className="flex h-full min-w-0 items-center gap-2 whitespace-nowrap text-[12px] leading-none">
              <span>{level === 0 ? l.text : l.short}</span>
              {level > 0 && <NoticeDetails lines={lines} />}
              {l.retry && onRetry && retry}
            </p>
          ))
        }
      </FitCascade>
      {lines.length > 1 && (
        <span className="flex shrink-0 items-center gap-1" data-testid="status-pager">
          <span className="text-[11px] tabular-nums text-amber-100/70" aria-live="polite">
            {at + 1} / {lines.length}
          </span>
          <PagerButton dir="prev" label="Previous notice" onClick={at > 0 ? () => setIndex(at - 1) : undefined} testId="status-prev" />
          <PagerButton dir="next" label="Next notice" onClick={at < lines.length - 1 ? () => setIndex(at + 1) : undefined} testId="status-next" />
        </span>
      )}
    </div>
  );
}

/** Every notice in full, for the strip that can only say each in a few words. */
function NoticeDetails({ lines }: { lines: Notice[] }) {
  return (
    <Popover>
      <PopoverTrigger
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-amber-200/30 px-1.5 text-[11px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70"
        data-testid="status-details"
      >
        <Info className="h-3 w-3" aria-hidden="true" /> Details
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-1.5rem))] space-y-2 border-amber-500/30 bg-[hsl(214_50%_8%)] p-3 text-[12px] leading-snug text-amber-100/90" data-testid="status-details-body">
        {lines.map((l) => (
          <p key={l.key}>{l.text}</p>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/* ── the bar ────────────────────────────────────────────────────────────── */

/**
 * W26Q — the way into the Worlds 2026 Quiz, one fixed-size control in the
 * bar's right cluster beside the phase chip. It never changes the bar's height
 * (desktop 56 px, phone rows 44 px), so no screen loses a pixel of workspace
 * (UX4 zero-scroll). Icon-only on phones, portrait and landscape: at 360 px
 * the title, this 36 px target and the short phase chip still fit one row.
 * No motion of its own, so Reduce Motion has nothing to stop.
 */
function QuizChip({ compact }: { compact: boolean }) {
  if (compact) {
    return (
      <Link
        to={PRO_PLAY_WORLDS_QUIZ_ROUTE}
        aria-label="Worlds 2026 Quiz"
        title="Worlds 2026 Quiz"
        data-testid="worlds-quiz-cta"
        data-layout="compact"
        className="inline-flex h-11 w-9 shrink-0 items-center justify-center text-[#e3c66f] outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#c9a84c]/70"
      >
        <Brain className="h-4 w-4" aria-hidden="true" />
      </Link>
    );
  }
  return (
    <Link
      to={PRO_PLAY_WORLDS_QUIZ_ROUTE}
      aria-label="Worlds 2026 Quiz"
      data-testid="worlds-quiz-cta"
      data-layout="wide"
      className="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#c9a84c]/40 px-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#e3c66f] outline-none transition-colors hover:bg-[#c9a84c]/[0.08] focus-visible:ring-1 focus-visible:ring-[#c9a84c]/70"
    >
      <Brain className="h-3.5 w-3.5" aria-hidden="true" />
      Quiz
    </Link>
  );
}

function Identity({ compact }: { compact: boolean }) {
  const { ctx } = useKit();
  const year = ctx.starts.slice(0, 4);
  return (
    <div className={cn("flex items-center gap-3", compact ? "min-w-0 shrink-0" : "shrink-0")}>
      {/* A narrow phone keeps the title whole beside the phase; the event's mark yields. */}
      <span className={cn("shrink-0", compact && "hidden min-[420px]:inline-flex")}>
        <EventMark name={ctx.short_name} slug={ctx.league.slug} size={compact ? "xs" : "sm"} />
      </span>
      <div className="min-w-0">
        <h1 className={cn("whitespace-nowrap leading-none", compact ? "text-[15px]" : "text-[17px]")} title={ctx.name}>
          {ctx.short_name} {year}
          <span className="sr-only"> — {ctx.name}</span>
        </h1>
        {!compact && (
          <p className="mt-1 truncate text-[11px] leading-none text-muted-foreground">
            {dateRange(ctx.starts, ctx.ends).replace(/\s\d{4}$/, "")} · {ctx.participants.length} teams
          </p>
        )}
      </div>
    </div>
  );
}

function CommandBar({ data, refreshFailed, badge, tools }: { data: TournamentResponseV2; refreshFailed?: boolean; badge?: ReactNode; tools?: ReactNode }) {
  const x = useExperience();
  if (x.landscape) {
    // A phone on its side: one row (identity · the five destinations · phase),
    // so the workspace keeps the height the second row would take.
    return (
      <header
        className="relative z-30 flex h-11 shrink-0 items-center gap-2 border-b border-white/[0.07] bg-[hsl(215_55%_6%/0.92)] px-3 backdrop-blur-md"
        data-testid="command-bar"
        data-layout="compact"
        data-landscape="true"
      >
        <Link to={PRO_PLAY_ROUTE} aria-label="Back to Pro Play" className="-ml-1 inline-flex h-11 w-9 shrink-0 items-center justify-center text-muted-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <Identity compact />
        <div className="min-w-0 flex-1">
          <PrimaryNav compact />
        </div>
        {badge}
        <QuizChip compact />
        <PhaseChip compact />
      </header>
    );
  }
  if (!x.desktop) {
    return (
      <header
        className="relative z-30 shrink-0 border-b border-white/[0.07] bg-[hsl(215_55%_6%/0.92)] backdrop-blur-md"
        data-testid="command-bar"
        data-layout="compact"
      >
        <div className="flex h-11 items-center gap-2 px-3">
          <Link to={PRO_PLAY_ROUTE} aria-label="Back to Pro Play" className="-ml-1 inline-flex h-11 w-9 items-center justify-center text-muted-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Identity compact />
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <QuizChip compact />
            <PhaseChip compact />
          </span>
        </div>
        <PrimaryNav compact />
        {badge && <div className="flex justify-center border-t border-white/[0.06] py-1">{badge}</div>}
      </header>
    );
  }
  return (
    <header
      className="relative z-30 flex h-14 shrink-0 items-center gap-5 border-b border-white/[0.07] bg-[hsl(215_55%_5%/0.6)] px-6 backdrop-blur-md"
      data-testid="command-bar"
      data-layout="wide"
    >
      <Link
        to={PRO_PLAY_ROUTE}
        aria-label="Back to Pro Play"
        className="-ml-2 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      </Link>
      <Identity compact={false} />
      <span aria-hidden="true" className="h-6 w-px bg-white/10" />
      <div className="h-full shrink-0">
        <PrimaryNav compact={false} />
      </div>
      <span className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-3">
        <FeedChip data={data} refreshFailed={refreshFailed} />
        {tools}
        {badge}
        <QuizChip compact={false} />
        <PhaseChip />
      </span>
    </header>
  );
}

/* ── workspace ──────────────────────────────────────────────────────────── */

const SCREEN_VIEW: Record<ScreenKey, () => ReactNode> = {
  overview: () => <OverviewScreen />,
  stages: () => <StagesScreen />,
  teams: () => <TeamsScreen />,
  schedule: () => <ScheduleScreen />,
  // Not routable in this build (`ready: false`); never rendered.
  discover: () => null,
};

function Workspace() {
  const x = useExperience();
  const dir = x.move.level === "screen" ? x.move.dir : 0;
  const touch = useRef<{ x: number; y: number; ignore: boolean } | null>(null);

  // Phones: a horizontal swipe moves between the built screens. Never the only
  // way (the bar is), and never from inside a region that scrolls sideways.
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, ignore: Boolean((e.target as HTMLElement).closest("[data-swipe-ignore]")) };
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start || start.ignore || x.desktop) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    const next = adjacentScreen(x.loc.screen, dx < 0 ? 1 : -1);
    if (next) x.go({ screen: next });
  };

  return (
    <div
      className="relative min-h-0 flex-1 overflow-clip"
      data-testid="workspace"
      data-screen={x.loc.screen}
      data-direction={dir}
      data-motion={x.reduced ? "reduced" : "full"}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <AnimatePresence initial={false} mode="popLayout" custom={dir}>
        <motion.div
          key={x.loc.screen}
          custom={dir}
          variants={slideVariants(OFFSET.screen, x.reduced)}
          initial="enter"
          animate="center"
          exit="exit"
          transition={slideTransition(DURATION.screen, x.reduced)}
          className="h-full"
          data-testid="screen"
          data-screen-view={x.loc.screen}
          data-screen-index={screenIndex(x.loc.screen)}
        >
          {SCREEN_VIEW[x.loc.screen]()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Says where the reader is after every move, for screen readers. */
function Announcer() {
  const x = useExperience();
  const { ctx } = useKit();
  const [text, setText] = useState("");
  const screen = SCREENS.find((s) => s.key === x.loc.screen)?.label ?? "";
  const stage = x.stageKey ? stageOf(ctx, x.stageKey) : null;
  const team = x.loc.team ? ctx.participants.find((p) => p.code === x.loc.team) : null;
  const msg = stage ? `${screen}: ${stageLabel(stage)}` : team ? `${screen}: ${team.name || team.team_key}` : screen;
  useEffect(() => setText(msg), [msg]);
  return (
    <p className="sr-only" aria-live="polite" data-testid="announcer">
      {text}
    </p>
  );
}

/** Escape closes the open detail, a match or a team (desktop; the phone sheet handles its own). */
function EscapeToClose() {
  const x = useExperience();
  useEffect(() => {
    if (!x.desktop || !(x.loc.matchId || x.loc.team)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='listbox'], [role='menu']")) return;
      if (x.loc.matchId) x.selectMatch(null);
      else x.selectTeam(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [x]);
  return null;
}

export default function WorldsExperience({ data, now, base, onRetry, retrying, refreshFailed, badge, tools, desktop, landscape, simulated = false }: {
  data: TournamentResponseV2;
  now: number;
  /** Where the experience is mounted ("/lol/dev/worlds-experience"). */
  base: string;
  onRetry?: () => void;
  retrying?: boolean;
  refreshFailed?: boolean;
  /** A marker the host page puts in the bar (the prototype's "Simulated"). */
  badge?: ReactNode;
  /** Host controls for the wide bar (the prototype's data picker). */
  tools?: ReactNode;
  /** Pins the layout (tests); otherwise read from the viewport. */
  desktop?: boolean;
  /** Pins the landscape-phone layout (tests); otherwise read from the viewport. */
  landscape?: boolean;
  /** The data is simulated: results are marked as such wherever they show. */
  simulated?: boolean;
}) {
  return (
    <TournamentKitProvider ctx={data.context} state={data.state} now={now}>
      <ExperienceProvider base={base} ctx={data.context} state={data.state} now={now} desktop={desktop} landscape={landscape} simulated={simulated}>
        <Frame data={data} onRetry={onRetry} retrying={retrying} refreshFailed={refreshFailed} badge={badge} tools={tools} />
      </ExperienceProvider>
    </TournamentKitProvider>
  );
}

function Frame({ data, onRetry, retrying, refreshFailed, badge, tools }: {
  data: TournamentResponseV2;
  onRetry?: () => void;
  retrying?: boolean;
  refreshFailed?: boolean;
  badge?: ReactNode;
  tools?: ReactNode;
}) {
  const x = useExperience();
  useViewportLock();
  return (
    <div
      data-testid="worlds-experience"
      data-phase={data.state.phase}
      data-layout={x.desktop ? "wide" : "compact"}
      data-landscape={x.landscape ? "true" : undefined}
      data-viewport="fixed"
      className={cn(
        // An opaque ground of its own: the site's ambience runes stay outside the instrument.
        "relative flex flex-col bg-[radial-gradient(80%_55%_at_50%_0%,hsl(42_70%_50%/0.06),transparent_70%),linear-gradient(hsl(215_55%_5%),hsl(215_55%_5%))]",
        // Exactly the room under the HUD, at every size; the device's home
        // indicator keeps its inset.
        "h-[var(--app-viewport-h)] overflow-clip pb-[env(safe-area-inset-bottom,0px)]",
      )}
    >
      <CommandBar data={data} refreshFailed={refreshFailed} badge={badge} tools={x.desktop ? tools : undefined} />
      <StatusStrip data={data} onRetry={onRetry} retrying={retrying} refreshFailed={refreshFailed} />
      <Workspace />
      <Announcer />
      <EscapeToClose />
    </div>
  );
}
