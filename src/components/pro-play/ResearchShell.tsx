// ---------------------------------------------------------------------------
// Shared chrome for the Pro Play research surface.
//
// FUNCTIONAL, NOT A VISUAL REDESIGN. These are thin wrappers over the existing
// design system so the four research pages read as one surface without
// inventing a second one.
//
// THE ONE RULE THIS FILE ENFORCES: participation semantics survive rendering.
// A scope the entity did not attend has `stats === null` and renders as
// "Did not participate" — never as "0 games", which is a real and different
// fact belonging to someone who attended and did not play. ScopeCard is the
// only place that decision is made, so no page can accidentally flatten it.
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Info } from "lucide-react";
import {
  formatDate,
  formatRate,
  formatRecord,
  type ChampionRow,
  type EntityRow,
  type FocusBlock,
  type ScopePayload,
} from "@/lib/pro-play/researchApi";

/**
 * The research reading column.
 *
 * `wide` IS A DIFFERENT KIND OF PAGE, NOT A BIGGER ONE. The three profiles and
 * the search page are reading columns and stay at max-w-6xl. The Matchup
 * Explorer is a five-lane scouting board read two players at a time across; it
 * escapes the shell's max-w-7xl as well (see Layout's `isFullBleed`) and
 * supplies the cap and gutters itself, so the board gets ~1552px of content at
 * 1920px instead of 1104px.
 *
 * The top padding differs deliberately. A reading column wants air above its
 * first line; a board wants its first lane on screen. The shell already keeps
 * `--app-header-h` clear above both, so a second 24px of page padding was all
 * that stood between the HUD band and the breadcrumb.
 */
export function ResearchPage({
  children,
  wide,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={
        wide
          ? "mx-auto w-full max-w-[1600px] px-4 pb-6 pt-2 md:px-6 md:pb-8"
          : "mx-auto w-full max-w-6xl px-4 py-4 md:px-6 md:py-6"
      }
      data-research-page={wide ? "wide" : "column"}
    >
      {children}
    </div>
  );
}

export function ResearchBreadcrumb({ trail }: { trail: { label: string; to?: string }[] }) {
  return (
    <nav className="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      <Link to="/lol/pro-play" className="hover:text-foreground">
        Pro Play
      </Link>
      <span>/</span>
      <Link to="/lol/pro-play/search" className="hover:text-foreground">
        Research
      </Link>
      {trail.map((t) => (
        <span key={t.label} className="flex items-center gap-1">
          <span>/</span>
          {t.to ? (
            <Link to={t.to} className="hover:text-foreground">
              {t.label}
            </Link>
          ) : (
            <span className="text-foreground">{t.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function ProfileHeader({
  title,
  subtitle,
  meta,
  focus,
  media,
}: {
  title: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
  focus?: FocusBlock | null;
  /** An identity anchor to the left of the title — a team crest today. Optional
   *  on purpose: a profile with no approved media renders exactly as before,
   *  with no reserved gap where a logo might one day go. The NAME stays the
   *  dominant element either way; the crest is a cue, not the headline. */
  media?: ReactNode;
}) {
  return (
    <header className="mb-6 space-y-2" data-testid="profile-header">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {media}
        <div className="flex min-w-0 flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
          {subtitle ? <span className="text-sm text-muted-foreground">{subtitle}</span> : null}
        </div>
      </div>
      {meta ? <div className="flex flex-wrap items-center gap-2 text-sm">{meta}</div> : null}
      {focus ? <FocusNotice focus={focus} /> : null}
    </header>
  );
}

/** The watchlist marker. It says what the status MEANS, because "Worlds 2026"
 *  next to a team name reads as qualification and this data does not claim
 *  that — no 2026 World Championship game exists in the corpus to claim it
 *  with. */
export function FocusNotice({ focus }: { focus: FocusBlock }) {
  return (
    <div
      className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs"
      data-testid="worlds-focus-notice"
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-[10px] uppercase">
            {focus.target_event} · {focus.status}
          </Badge>
          <span className="text-muted-foreground">{focus.group}</span>
        </div>
        <p className="text-muted-foreground">{focus.meaning}</p>
      </div>
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 text-xs leading-relaxed text-muted-foreground" data-testid="research-note">
      {children}
    </p>
  );
}

export function Panel({
  title,
  children,
  note,
}: {
  title: string;
  children: ReactNode;
  note?: ReactNode;
}) {
  return (
    <Card className="mb-6 p-4 md:p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
      {note ? <Note>{note}</Note> : null}
    </Card>
  );
}

export function LoadingBlock() {
  return (
    <div className="space-y-3" data-testid="research-loading">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

export function ErrorBlock({ message, hint }: { message: string; hint?: string }) {
  return (
    <div
      className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm"
      data-testid="research-error"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div>
        <p className="font-medium">{message}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

/** One scope column. THE PARTICIPATION FORK LIVES HERE AND NOWHERE ELSE. */
export function ScopeCard({ scope }: { scope: ScopePayload }) {
  const absent = scope.participation === "did_not_participate" || scope.stats === null;
  return (
    <Card className="p-3" data-testid={`scope-card-${scope.scope.scope_id}`}>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {scope.scope.label}
      </div>
      {absent ? (
        <div className="space-y-1" data-testid="scope-dnp">
          <div className="text-lg font-semibold text-muted-foreground">Did not participate</div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Absent from this scope. This is not a record of zero games.
          </p>
        </div>
      ) : (
        <dl className="space-y-1 text-sm">
          <Stat label="Games" value={String(scope.stats!.games)} />
          <Stat label="Record" value={formatRecord(scope.stats!.wins, scope.stats!.losses)} />
          <Stat label="Win rate" value={formatRate(scope.stats!.win_rate)} />
          <Stat label="Last played" value={formatDate(scope.stats!.last_played_at)} />
        </dl>
      )}
    </Card>
  );
}

export function ScopeGrid({
  comparison,
}: {
  comparison: { scope_order: string[]; scopes: Record<string, ScopePayload> };
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="scope-grid">
      {comparison.scope_order.map((id) => (
        <ScopeCard key={id} scope={comparison.scopes[id]} />
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

/** A wide table must scroll inside its own box, never the page. */
export function TableScroll({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

export function ChampionPoolTable({
  rows,
  emptyLabel,
}: {
  rows: ChampionRow[];
  emptyLabel: string;
}) {
  if (!rows.length) return <EmptyRow label={emptyLabel} />;
  return (
    <TableScroll>
      <table className="w-full min-w-[560px] text-sm" data-testid="champion-pool-table">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Champion</th>
            <th className="py-2 pr-3 text-right font-medium">Games</th>
            <th className="py-2 pr-3 text-right font-medium">W–L</th>
            <th className="py-2 pr-3 text-right font-medium">Win rate</th>
            <th className="py-2 pr-3 text-right font-medium">Share</th>
            <th className="py-2 text-right font-medium">Last played</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-border/50 last:border-0">
              <td className="py-1.5 pr-3">
                <Link
                  to={`/lol/pro-play/champion/${encodeURIComponent(row.key)}`}
                  className="hover:underline"
                >
                  {row.key}
                </Link>
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{row.games}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">
                {formatRecord(row.wins, row.losses)}
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{formatRate(row.win_rate)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">
                {formatRate(row.champion_share)}
              </td>
              <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                {formatDate(row.last_played_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

export function EntityTable({
  rows,
  kind,
  heading,
  emptyLabel,
}: {
  rows: EntityRow[];
  kind: "player" | "team";
  heading: string;
  emptyLabel: string;
}) {
  if (!rows.length) return <EmptyRow label={emptyLabel} />;
  return (
    <TableScroll>
      <table className="w-full min-w-[480px] text-sm" data-testid={`entity-table-${kind}`}>
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <th className="py-2 pr-3 font-medium">{heading}</th>
            <th className="py-2 pr-3 text-right font-medium">Games</th>
            <th className="py-2 pr-3 text-right font-medium">W–L</th>
            <th className="py-2 pr-3 text-right font-medium">Win rate</th>
            <th className="py-2 text-right font-medium">Last played</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-border/50 last:border-0">
              <td className="py-1.5 pr-3">
                <Link
                  to={`/lol/pro-play/${kind}/${encodeURIComponent(row.key)}`}
                  className="hover:underline"
                >
                  {row.key}
                </Link>
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{row.games}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">
                {formatRecord(row.wins, row.losses)}
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{formatRate(row.win_rate)}</td>
              <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                {formatDate(row.last_played_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

export function EmptyRow({ label }: { label: string }) {
  return (
    <p className="py-3 text-sm text-muted-foreground" data-testid="research-empty">
      {label}
    </p>
  );
}

/** A scope selector for tables that show one scope at a time. */
export function ScopeTabs({
  comparison,
  active,
  onSelect,
}: {
  comparison: { scope_order: string[]; scopes: Record<string, ScopePayload> };
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-1" data-testid="scope-tabs">
      {comparison.scope_order.map((id) => {
        const scope = comparison.scopes[id];
        const absent = scope.participation === "did_not_participate";
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={[
              "rounded-md border px-2.5 py-1 text-xs transition-colors",
              id === active
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            ].join(" ")}
            data-testid={`scope-tab-${id}`}
          >
            {scope.scope.label}
            {absent ? <span className="ml-1 opacity-60">· DNP</span> : null}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PUBLIC-PROFILE ADDITIONS
//
// Shared by all three canonical profiles. Player is the first caller; Team and
// Champion reuse these unchanged, passing their own metric list.
// ---------------------------------------------------------------------------

/** One metric in a performance panel. `value` is already formatted, and is
 *  null ONLY when the underlying number was null — the em dash is applied
 *  here, once, so no caller can coalesce an absence to zero. */
export type PerformanceMetric = {
  label: string;
  value: string | null;
  /** Shown as a title attribute where the denominator is not obvious. */
  hint?: string;
};

/**
 * Performance rates for one entity, from the public statistics contract.
 *
 * THE SCOPE LINE IS NOT DECORATION. This panel's numbers are computed over a
 * DIFFERENT slice than the comparison block above it — career across every
 * competition, rather than four curated product scopes — so the scope and the
 * panel's own game counts are printed inside it. Two blocks of numbers with
 * unstated, unequal denominators is the one way this composition misleads.
 */
export function PerformancePanel({
  title,
  scopeLabel,
  metrics,
  games,
  statBackedGames,
  unit,
  actions,
  note,
}: {
  title: string;
  /** The slice the SERVER said it answered. */
  scopeLabel: string;
  metrics: PerformanceMetric[];
  /** Canonical games — the denominator for the record. */
  games: number;
  /** The subset carrying statistics — the denominator for every rate. */
  statBackedGames: number;
  /** "games" | "picks" — champions count player-games as picks. */
  unit?: string;
  actions?: ReactNode;
  note?: ReactNode;
}) {
  const noun = unit ?? "games";
  const partial = statBackedGames < games;
  return (
    <Card className="mb-6 p-4 md:p-5" data-testid="performance-panel">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        <span className="text-xs text-muted-foreground" data-testid="performance-scope">
          {scopeLabel}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 lg:grid-cols-7">
        {metrics.map((m) => (
          <div key={m.label} title={m.hint}>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {m.label}
            </dt>
            <dd
              className="mt-0.5 text-base font-medium tabular-nums"
              data-testid={`metric-${m.label}`}
            >
              {m.value ?? "—"}
            </dd>
          </div>
        ))}
      </dl>
      {/* The rate denominator, always stated when it differs from the record's.
          A career that predates detailed statistics shows a real W-L and em
          dashes here, and this line is what explains that rather than leaving
          it looking broken. */}
      <Note>
        {partial ? (
          <>
            Rates are over the {nf(statBackedGames)} of {nf(games)} {noun} that
            carry detailed statistics. The record is over all {nf(games)}.
          </>
        ) : (
          <>
            Over {nf(games)} {noun}, all of which carry detailed statistics.
          </>
        )}
      </Note>
      {note ? <Note>{note}</Note> : null}
      {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
    </Card>
  );
}

const NUM = new Intl.NumberFormat("en-US");
function nf(value: number): string {
  return NUM.format(value);
}

/**
 * An outbound action from a profile to another public Pro Play surface.
 *
 * Deliberately a link and not a button: these are navigations, so middle-click
 * and Back both behave, and a `<Link>` pushes rather than replaces so the
 * profile keeps its own history entry.
 */
export function ProfileAction({
  to,
  children,
  title,
}: {
  to: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <Link
      to={to}
      title={title}
      data-testid="profile-action"
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </Link>
  );
}

/** What a hand-off left behind, named with its value. Never a silent drop. */
export function DroppedFilters({ dropped }: { dropped: string[] }) {
  if (!dropped.length) return null;
  return <Note>Staying with this profile: {dropped.join(", ")}.</Note>;
}
