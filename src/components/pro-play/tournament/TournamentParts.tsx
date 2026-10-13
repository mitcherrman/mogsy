/**
 * Shared pieces of the v2 tournament page (Worlds 2026, PW4-B): the section
 * frame, notices, a team line that knows TBD slot provenance, and the one-row
 * match line used by "Today", Swiss rounds and the schedule.
 *
 * Presentation only. Every fact is the backend's (PW4-A); see
 * `tournamentV2View.ts` for the grouping rules.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Info } from "lucide-react";

import { HubKicker } from "@/components/pro-play/hub/HubSection";
import MatchStateBadge from "@/components/pro-play/hub/MatchStateBadge";
import { TeamCrest } from "@/components/pro-play/media/EntityCrest";
import { localStart } from "@/lib/pro-play/hubSeries";
import type {
  TournamentContextV2,
  TournamentMatchTeamV2,
  TournamentMatchV2,
  TournamentParticipantV2,
  TournamentStateV2,
} from "@/lib/pro-play/tournamentApi";
import { matchHref } from "@/lib/pro-play/tournamentView";
import {
  awaitingDraw,
  matchCaption,
  matchNames,
  matchesById,
  outcomeOf,
  scoreV2,
  slotLabel,
  teamName,
} from "@/lib/pro-play/tournamentV2View";
import { cn } from "@/lib/utils";

export const CARD = "rounded-xl border border-border/70 bg-card/50";
export const GOLD = "text-[#e3c66f]";

/* ── page-wide lookups ──────────────────────────────────────────────────── */

export interface TournamentKit {
  ctx: TournamentContextV2;
  state: TournamentStateV2;
  byCode: Map<string, TournamentParticipantV2>;
  byId: Map<string, TournamentMatchV2>;
  names: Map<string, string>;
  now: number;
}

const KitContext = createContext<TournamentKit | null>(null);

export function TournamentKitProvider({ ctx, state, now, children }: {
  ctx: TournamentContextV2;
  state: TournamentStateV2;
  now: number;
  children: ReactNode;
}) {
  const kit = useMemo<TournamentKit>(
    () => ({
      ctx,
      state,
      byCode: new Map(ctx.participants.map((p) => [p.code, p] as const)),
      byId: matchesById(state),
      names: matchNames(state, ctx),
      now,
    }),
    [ctx, state, now],
  );
  return <KitContext.Provider value={kit}>{children}</KitContext.Provider>;
}

export function useKit(): TournamentKit {
  const kit = useContext(KitContext);
  if (!kit) throw new Error("useKit outside TournamentKitProvider");
  return kit;
}

/* ── frame ──────────────────────────────────────────────────────────────── */

export function Section({ id, kicker, title, aside, children }: {
  id: string;
  kicker: ReactNode;
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={`tournament-${id}`}
      aria-labelledby={`${id}-title`}
      data-testid={`section-${id}`}
      className="scroll-mt-6 space-y-3"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <HubKicker>{kicker}</HubKicker>
          {title ? (
            <h2 id={`${id}-title`} className="text-base font-semibold text-foreground sm:text-lg">
              {title}
            </h2>
          ) : (
            <h2 id={`${id}-title`} className="sr-only">{kicker}</h2>
          )}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Notice({ tone = "warn", children, action, testId }: {
  tone?: "warn" | "info";
  children: ReactNode;
  action?: ReactNode;
  testId?: string;
}) {
  const Icon = tone === "warn" ? AlertTriangle : Info;
  return (
    <div
      role="status"
      data-testid={testId}
      className={cn(
        "flex flex-wrap items-start gap-x-2 gap-y-1 rounded-md border px-3 py-2 text-xs leading-relaxed",
        tone === "warn" ? "border-orange-500/30 bg-orange-500/5 text-orange-200" : "border-border/70 bg-muted/20 text-muted-foreground",
      )}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}

/* ── teams ──────────────────────────────────────────────────────────────── */

/**
 * One side of a match. A named team: crest, code, display name. A TBD side:
 * a dashed mark and where its team will come from ("Winner of FUR v MVK",
 * "Decided by draw") when standings say so, else just "TBD".
 */
export function TeamLine({ team, match, align = "left", showName = true, size = "sm", tag, hideSource = false }: {
  team: TournamentMatchTeamV2;
  match: TournamentMatchV2;
  align?: "left" | "right";
  showName?: boolean;
  size?: "xs" | "sm";
  tag?: ReactNode;
  /** The caller states the slots' source once for both sides. */
  hideSource?: boolean;
}) {
  const { byCode, byId, names } = useKit();
  const right = align === "right";
  if (team.tbd || !team.code) {
    const source = hideSource ? null : slotLabel(team.slot, byId, names);
    return (
      <span
        className={cn("flex min-w-0 items-center gap-2 text-muted-foreground", right && "flex-row-reverse text-right")}
        data-testid="team-tbd"
      >
        <span
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-md border border-dashed border-border/80 text-[10px] font-semibold",
            size === "xs" ? "h-6 w-6" : "h-8 w-8",
          )}
          aria-hidden="true"
        >
          ?
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-tight">TBD</span>
          {source && (
            <span className="block truncate text-[11px] leading-tight" data-testid="slot-source">
              {source}
            </span>
          )}
        </span>
      </span>
    );
  }
  const outcome = outcomeOf(match, team);
  const name = teamName(team, byCode);
  return (
    <span
      className={cn("flex min-w-0 items-center gap-2", right && "flex-row-reverse text-right", outcome === "loss" && "opacity-60")}
      data-team={team.code}
    >
      <TeamCrest teamKey={team.team_key} name={name} shortCode={team.code} size={size} />
      <span className="min-w-0">
        <span className={cn("flex items-center gap-1.5 text-sm font-semibold leading-tight", right && "flex-row-reverse", outcome === "win" && GOLD)}>
          {team.code}
          {tag}
        </span>
        {showName && <span className="block truncate text-[11px] leading-tight text-muted-foreground">{name}</span>}
      </span>
    </span>
  );
}

/* ── one-row match ──────────────────────────────────────────────────────── */

/**
 * A match as one row: time and caption, the two sides, score or "vs", state.
 * A row with somewhere to go (a stored game, or a fixture with a named side)
 * links to the match centre with the existing `?game=` / `?next=` links.
 */
export function MatchLine({ match, withStage = true, showDay = true, dense = false }: {
  match: TournamentMatchV2;
  withStage?: boolean;
  /** False inside a day group, where the day is the heading. */
  showDay?: boolean;
  /** A narrow panel that already names the round: time and format only. */
  dense?: boolean;
}) {
  const kit = useKit();
  const href = matchHref(match);
  const score = scoreV2(match);
  const [a, b] = match.teams;
  const when = localStart(match.scheduled_start);
  const time = showDay ? when : (when?.split(" · ")[1] ?? when);
  // A pairing still to be drawn is one quiet line, not two TBD sides.
  const body = awaitingDraw(match) ? (
    <p className="py-1 text-center text-xs text-muted-foreground" data-testid="awaiting-draw">
      {match.teams.some((t) => t.slot?.kind === "draw") ? "Teams decided by draw" : "Teams not yet announced"}
    </p>
  ) : (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
      <TeamLine team={a} match={match} />
      <span
        className={cn("min-w-12 text-center text-sm font-bold tabular-nums", score ? "text-foreground" : "text-muted-foreground")}
        data-testid="match-score"
      >
        {score ?? "vs"}
      </span>
      <TeamLine team={b} match={match} align="right" />
    </div>
  );
  return (
    <li
      data-testid="tournament-match"
      data-match-id={match.match_id}
      data-state={match.state}
      className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4 sm:px-4"
    >
      <div className={cn("flex min-w-0 shrink-0 items-center gap-2 sm:flex-col sm:items-start sm:gap-0.5", dense ? "sm:w-20" : "sm:w-56")}>
        <span className="shrink-0 text-xs font-medium tabular-nums text-foreground/80">{time}</span>
        <span className="min-w-0 max-w-full truncate text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          {dense ? (match.best_of ? `Bo${match.best_of}` : null) : matchCaption(match, kit, withStage)}
        </span>
        <MatchStateBadge state={match.state} size="sm" className="ml-auto sm:hidden" />
      </div>
      <div className="min-w-0 flex-1">
        {href ? (
          <Link
            to={href}
            className="block rounded-md outline-none ring-offset-background hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-[#c9a84c]"
          >
            {body}
          </Link>
        ) : (
          body
        )}
      </div>
      <div className="hidden shrink-0 items-center justify-end sm:flex sm:w-24">
        <MatchStateBadge state={match.state} size="sm" />
      </div>
    </li>
  );
}

export function MatchLines({ matches, withStage, showDay, dense }: {
  matches: readonly TournamentMatchV2[];
  withStage?: boolean;
  showDay?: boolean;
  dense?: boolean;
}) {
  return (
    <ul className={cn(CARD, "divide-y divide-border/50")}>
      {matches.map((m) => (
        <MatchLine key={m.match_id} match={m} withStage={withStage} showDay={showDay} dense={dense} />
      ))}
    </ul>
  );
}
