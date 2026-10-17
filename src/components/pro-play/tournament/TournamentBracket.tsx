/**
 * Bracket stages of the v2 tournament page (PW4-B): the Play-In's double
 * elimination and the Knockout's single elimination.
 *
 * THE SHAPE IS UPSTREAM'S. Rows and columns come from the standings cell
 * names ("Upper Bracket - Semifinals"), and every TBD slot says where its team
 * comes from (the winner or loser of a named match, or a draw). A Play-In is
 * never drawn as single elimination: without recognisable cells the stage is
 * listed by cell instead.
 *
 * CONNECTORS ARE THE SLOT EDGES. Each line joins a match to the exact team
 * row its winner fills, measured from the rendered cards, so a line can only
 * exist where upstream's bracket has that edge. Loser drops are written on
 * the card ("Loser → Lower Semifinal") rather than drawn across the bracket.
 * In the stacked phone layout no lines are drawn.
 *
 * OUTCOMES ONLY WITH AUTHORITY. "Out", a stage winner and the champion are
 * shown only when the backend's `bracket_authority` is "standings" and it
 * served them; routing text likewise needs standings.
 */
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Trophy } from "lucide-react";

import MatchStateBadge from "@/components/pro-play/hub/MatchStateBadge";
import { TeamCrest } from "@/components/pro-play/media/EntityCrest";
import { localStart } from "@/lib/pro-play/hubSeries";
import type { BracketSummary, TournamentMatchV2, TournamentStageV2 } from "@/lib/pro-play/tournamentApi";
import { dayLabel, localDayKey, matchHref } from "@/lib/pro-play/tournamentView";
import {
  awaitingDraw,
  championMatch,
  doubleElimLayout,
  outcomeOf,
  teamName,
  routesFrom,
  singleElimRounds,
  stageShortName,
  winnerEdges,
  type BracketColumn,
} from "@/lib/pro-play/tournamentV2View";
import { cn } from "@/lib/utils";

import { CARD, GOLD, MatchLines, Notice, TeamLine, useKit } from "./TournamentParts";

/* ── one match ──────────────────────────────────────────────────────────── */

/**
 * Opt-in selection (UX1, the Worlds experience prototype). Inside a provider a
 * card is a toggle button that selects the match for a detail panel instead
 * of linking to the match centre (the panel carries that link). Without one —
 * the published tournament page — cards are exactly as before.
 */
export interface BracketSelection {
  selectedId: string | null;
  onSelect: (matchId: string) => void;
  /** One header line: an upcoming match shows its time where the state badge sits. */
  dense?: boolean;
  /** The two sides abreast in one row under the header (a short landscape phone). */
  abreast?: boolean;
}

export const BracketSelectContext = createContext<BracketSelection | null>(null);

function Tag({ children, tone }: { children: ReactNode; tone: "gold" | "muted" }) {
  return (
    <span
      data-testid="bracket-tag"
      className={cn(
        "rounded px-1 py-px text-[9.5px] font-bold uppercase tracking-[0.1em]",
        tone === "gold" ? "bg-[#c9a84c]/15 text-[#e3c66f]" : "border border-border/70 text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function BracketMatchCard({ match, summary, stageName, winnerTag }: {
  match: TournamentMatchV2;
  summary: BracketSummary;
  stageName: string;
  /** What the stage's terminal winner is called ("Play-In winner", "Champion"). */
  winnerTag: string;
}) {
  const kit = useKit();
  const select = useContext(BracketSelectContext);
  const selected = select?.selectedId === match.match_id;
  const dense = Boolean(select?.dense);
  const abreast = Boolean(select?.abreast);
  const authority = summary.bracket_authority === "standings";
  const routes = authority ? routesFrom(match.match_id, kit.state.matches) : [];
  const href = matchHref(match);
  const name = kit.names.get(match.match_id) ?? match.block_name ?? "Match";
  const started = match.state !== "upcoming";
  // Both sides awaiting a draw: say it once, in the footer.
  const drawn = awaitingDraw(match) && match.teams.some((t) => t.slot?.kind === "draw");
  const tagFor = (code: string | null, outcome: ReturnType<typeof outcomeOf>) => {
    if (!authority || !code || !outcome) return null;
    // Out where the loss ended the run: this match's loser goes nowhere.
    if (outcome === "loss" && summary.eliminated.includes(code) && !routes.some((r) => r.kind === "loser")) {
      return <Tag tone="muted">Out</Tag>;
    }
    if (outcome === "win" && summary.winner_code === code && !routes.some((r) => r.kind === "winner")) {
      return <Tag tone="gold">{winnerTag}</Tag>;
    }
    return null;
  };
  const head = (
    <>
      <div className={cn("flex items-center gap-2 px-3", dense ? "py-2" : "pt-2.5")}>
        <span className="min-w-0 truncate text-[10.5px] font-semibold uppercase tracking-[0.1em] text-foreground/85">
          {name}
          {match.best_of ? <span className="text-muted-foreground"> · Bo{match.best_of}</span> : null}
        </span>
        {dense && match.state === "upcoming" ? (
          <span className="ml-auto shrink-0 text-[10.5px] tabular-nums text-muted-foreground" data-testid="card-time">
            {/* The column label carries the day. */}
            {localStart(match.scheduled_start)?.split(" · ")[1] ?? localStart(match.scheduled_start)}
          </span>
        ) : (
          <MatchStateBadge state={match.state} size="sm" className="ml-auto" />
        )}
      </div>
      {!dense && <p className="px-3 pb-2 text-[11px] tabular-nums text-muted-foreground">{localStart(match.scheduled_start)}</p>}
      <div className={cn("border-t border-border/40", abreast ? "grid grid-cols-2 divide-x divide-border/40" : "divide-y divide-border/40")}>
        {match.teams.map((t, i) => {
          const outcome = outcomeOf(match, t);
          return (
            <div
              key={i}
              data-slot-row={`${match.match_id}:${i}`}
              className={cn(
                "flex min-w-0 items-center gap-2 border-l-2 py-1.5",
                abreast ? "px-2" : "px-3",
                outcome === "win" ? "border-l-[#c9a84c]" : "border-l-transparent",
              )}
            >
              <span className="min-w-0 flex-1">
                <TeamLine team={t} match={match} size="xs" showName={false} tag={tagFor(t.code, outcome)} hideSource={drawn} />
              </span>
              {started && !t.tbd && (
                <span
                  className={cn("w-5 text-right text-sm font-bold tabular-nums", outcome === "win" ? GOLD : "text-foreground/80")}
                  data-testid="slot-score"
                >
                  {t.game_wins}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
  return (
    <article
      data-testid="bracket-match"
      data-bracket-match={match.match_id}
      data-state={match.state}
      data-selected={select ? String(selected) : undefined}
      aria-label={`${stageName} ${name}`}
      className={cn(
        "relative z-[1] overflow-hidden rounded-lg border bg-card",
        match.state === "live" ? "border-emerald-500/60" : "border-border/70",
        selected && "border-[#c9a84c] shadow-[0_0_0_1px_#c9a84c,0_8px_28px_-12px_rgba(201,168,76,0.55)]",
        select && "transition-[border-color,box-shadow] duration-200",
      )}
    >
      {select ? (
        <button
          type="button"
          aria-pressed={selected}
          onClick={() => select.onSelect(match.match_id)}
          className="block w-full text-left outline-none transition-colors hover:bg-muted/25 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c9a84c]"
        >
          {head}
        </button>
      ) : href ? (
        <Link
          to={href}
          className="block outline-none transition-colors hover:bg-muted/25 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c9a84c]"
        >
          {head}
        </Link>
      ) : (
        head
      )}
      {(routes.length > 0 || drawn) && (
        <p className="border-t border-border/40 px-3 py-1.5 text-[10.5px] leading-snug text-muted-foreground" data-testid="bracket-routes">
          {drawn && <span data-testid="awaiting-draw">Teams decided by draw{routes.length ? " · " : ""}</span>}
          {routes.map((r, i) => (
            <span key={`${r.kind}-${r.to.match_id}`}>
              {i > 0 && " · "}
              <span className={r.kind === "winner" ? "text-foreground/75" : undefined}>
                {r.kind === "winner" ? "Winner" : "Loser"} → {kit.names.get(r.to.match_id) ?? "next match"}
              </span>
            </span>
          ))}
        </p>
      )}
    </article>
  );
}

/* ── connectors ─────────────────────────────────────────────────────────── */

interface Edge {
  from: string;
  to: string;
  slot: 0 | 1;
}

/**
 * Lines from each match to the team row its winner fills, measured from the
 * DOM. Drawn only when the target sits to the right of the source (the wide
 * layout); re-measured when the bracket resizes. It measures against its own
 * parent (the positioned bracket box): a child's layout effect runs before an
 * ancestor's ref is attached, so it anchors on its own node instead.
 */
export function Connectors({ edges, version }: {
  edges: readonly Edge[];
  /** Changes when card contents change (state, scores). */
  version: string;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState<{ paths: { d: string; done: boolean }[]; w: number; h: number }>({ paths: [], w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = anchor.current?.parentElement;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const paths: { d: string; done: boolean }[] = [];
      if (box.width > 0) {
        for (const e of edges) {
          const src = el.querySelector<HTMLElement>(`[data-bracket-match="${e.from}"]`);
          const dst =
            el.querySelector<HTMLElement>(`[data-slot-row="${e.to}:${e.slot}"]`) ??
            el.querySelector<HTMLElement>(`[data-bracket-match="${e.to}"]`);
          if (!src || !dst) continue;
          const a = src.getBoundingClientRect();
          const b = dst.getBoundingClientRect();
          const sx = a.right - box.left;
          const sy = a.top + a.height / 2 - box.top;
          const tx = b.left - box.left;
          const ty = b.top + b.height / 2 - box.top;
          if (tx - sx < 12) continue;
          const mx = Math.round(sx + (tx - sx) / 2);
          paths.push({ d: `M${sx} ${sy}H${mx}V${ty}H${tx}`, done: src.dataset.state === "completed" });
        }
      }
      setDrawn((prev) =>
        prev.w === box.width && prev.h === box.height && JSON.stringify(prev.paths) === JSON.stringify(paths)
          ? prev
          : { paths, w: box.width, h: box.height },
      );
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [edges, version]);
  return (
    <div ref={anchor} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-0">
      {drawn.paths.length > 0 && (
        <svg data-testid="bracket-connectors" width={drawn.w} height={drawn.h} className="block">
          {drawn.paths.map((p, i) => (
            <path
              key={i}
              d={p.d}
              fill="none"
              strokeWidth={1.5}
              className={p.done ? "stroke-[#c9a84c]/70" : "stroke-border"}
            />
          ))}
        </svg>
      )}
    </div>
  );
}

export function useBracketEdges(matches: readonly TournamentMatchV2[], authority: boolean) {
  const edges = useMemo(() => (authority ? winnerEdges(matches) : []), [matches, authority]);
  const version = matches.map((m) => `${m.match_id}:${m.state}:${m.teams.map((t) => t.code ?? "").join("/")}`).join("|");
  return { edges, version };
}

/* ── layouts ────────────────────────────────────────────────────────────── */

/** "Tue 3 Nov – Fri 6 Nov" in the viewer's own days. */
export function daySpan(matches: readonly TournamentMatchV2[]) {
  const days = matches.map((m) => localDayKey(m.scheduled_start)).filter((d): d is string => Boolean(d)).sort();
  if (!days.length) return null;
  const first = dayLabel(days[0]);
  const last = dayLabel(days[days.length - 1]);
  return first === last ? first : `${first} – ${last}`;
}

function ColumnLabel({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{children}</p>;
}

export function CellList({ matches }: { matches: readonly TournamentMatchV2[] }) {
  const kit = useKit();
  const groups: BracketColumn[] = [];
  for (const m of matches) {
    const cell = m.bracket?.cell ?? m.block_name ?? "Matches";
    const g = groups.find((x) => x.cell === cell);
    if (g) g.matches.push(m);
    else groups.push({ cell, matches: [m] });
  }
  return (
    <div className="space-y-4" data-testid="bracket-list">
      {groups.map((g) => (
        <div key={g.cell} className="space-y-2">
          <ColumnLabel>{kit.names.get(g.matches[0].match_id)?.replace(/\s\d+$/, "") ?? g.cell}</ColumnLabel>
          <MatchLines matches={g.matches} withStage={false} />
        </div>
      ))}
    </div>
  );
}

export function AuthorityNotice({ summary }: { summary: BracketSummary }) {
  if (summary.bracket_authority === "standings") {
    return summary.unverified_completed_matches > 0 ? (
      <Notice tone="info">Some completed results here are pending verification, so they don't move anyone yet.</Notice>
    ) : null;
  }
  // "unavailable" is said once, at the top of the page.
  if (summary.bracket_authority === "unavailable") return null;
  return (
    <Notice testId="bracket-authority">
      The official bracket has changed shape since this event was set up, so advancement and eliminations aren't derived from it. Matches
      are shown as published.
    </Notice>
  );
}

export function DoubleElimStage({ stage, summary, matches }: {
  stage: TournamentStageV2;
  summary: BracketSummary;
  matches: TournamentMatchV2[];
}) {
  const kit = useKit();
  const layout = useMemo(() => doubleElimLayout(matches), [matches]);
  const authority = summary.bracket_authority === "standings";
  const { edges, version } = useBracketEdges(matches, authority && layout !== null);
  const name = stageShortName(stage);
  if (!layout) {
    return (
      <div className="space-y-3">
        <AuthorityNotice summary={summary} />
        <CellList matches={matches} />
      </div>
    );
  }
  const card = (m: TournamentMatchV2) => (
    <BracketMatchCard key={m.match_id} match={m} summary={summary} stageName={name} winnerTag={`${name} winner`} />
  );
  const columns = Math.max(...layout.rows.map((r) => r.columns.length));
  return (
    <div className="space-y-3">
      <AuthorityNotice summary={summary} />
      <div className="relative" data-testid="double-elim" data-bracket="double_elimination">
        <Connectors edges={edges} version={version} />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch lg:gap-10">
          <div className="flex min-w-0 flex-col gap-6" style={{ flex: columns }}>
            {layout.rows.map((row) => (
              <div key={row.key} data-testid={`bracket-row-${row.key}`} className="space-y-2">
                <p className={cn("text-[11px] font-bold uppercase tracking-[0.14em]", row.key === "upper" ? "text-[#c9a84c]" : "text-muted-foreground")}>
                  {row.label}
                </p>
                <div className="flex flex-col gap-3 lg:flex-row lg:gap-10">
                  {row.columns.map((col) => (
                    <div key={col.cell} data-testid="bracket-column" data-cell={col.cell} className="flex min-w-0 flex-1 flex-col justify-around gap-3">
                      {col.matches.map(card)}
                    </div>
                  ))}
                  {/* Keep columns aligned across rows of unequal length. */}
                  {Array.from({ length: columns - row.columns.length }, (_, i) => (
                    <div key={`pad-${i}`} className="hidden flex-1 lg:block" aria-hidden="true" />
                  ))}
                </div>
              </div>
            ))}
          </div>
          {layout.final && (
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-2" data-testid="bracket-final">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#c9a84c]">
                {(layout.final.matches.length === 1 && kit.names.get(layout.final.matches[0].match_id)) || "Final"}
              </p>
              {layout.final.matches.map(card)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SingleElimStage({ stage, summary, matches }: {
  stage: TournamentStageV2;
  summary: BracketSummary & { champion_code?: string | null };
  matches: TournamentMatchV2[];
}) {
  const { rounds, tree } = useMemo(() => singleElimRounds(matches), [matches]);
  const authority = summary.bracket_authority === "standings";
  const { edges, version } = useBracketEdges(matches, authority && tree);
  const name = stageShortName(stage);
  const winnerTag = summary.champion_code !== undefined ? "Champion" : `${name} winner`;
  return (
    <div className="space-y-3">
      <AuthorityNotice summary={summary} />
      <div className="relative" data-testid="single-elim" data-bracket="single_elimination">
        <Connectors edges={edges} version={version} />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch lg:gap-10">
          {rounds.map((r) => (
            <div key={r.cell} className="flex min-w-0 flex-1 flex-col gap-2" data-testid="bracket-round" data-cell={r.cell}>
              <ColumnLabel>
                <span className="text-foreground/85">{r.cell}</span>
                {daySpan(r.matches) && <span className="font-medium normal-case tracking-normal"> · {daySpan(r.matches)}</span>}
              </ColumnLabel>
              <div className="flex flex-1 flex-col justify-around gap-3">
                {r.matches.map((m) => (
                  <BracketMatchCard key={m.match_id} match={m} summary={summary} stageName={name} winnerTag={winnerTag} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── champion ───────────────────────────────────────────────────────────── */

/** The champion, only when the backend certified one; with the final's score. */
export function ChampionBanner() {
  const kit = useKit();
  const final = championMatch(kit.state);
  const code = kit.state.knockout.bracket_authority === "standings" ? kit.state.knockout.champion_code : null;
  if (!code) return null;
  const p = kit.byCode.get(code);
  const team = final?.teams.find((t) => t.code === code);
  const other = final?.teams.find((t) => t.code !== code);
  const name = team ? teamName(team, kit.byCode) : (p?.name ?? p?.team_key ?? code);
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-[#c9a84c]/50 bg-gradient-to-br from-[#c9a84c]/[0.14] via-card/60 to-card/40 p-4 sm:p-5"
      data-testid="champion"
    >
      <div className="flex items-center gap-4">
        <TeamCrest teamKey={team?.team_key ?? p?.team_key} name={name} shortCode={code} size="lg" />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#c9a84c]">
            <Trophy className="h-3.5 w-3.5" aria-hidden="true" /> {kit.ctx.short_name} champion
          </p>
          <p className="truncate text-xl font-bold text-foreground sm:text-2xl">{name}</p>
          {final && other && (
            <p className="text-sm text-muted-foreground">
              Won the final <span className="font-semibold tabular-nums text-foreground">{team?.game_wins}–{other.game_wins}</span>
              {other.code ? ` against ${other.code}` : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
