/**
 * Shared page furniture for the public Pro roster wiki: breadcrumb, gold
 * header block, section headings, and the loading / empty / error /
 * service-unavailable states.
 *
 * These mirror the existing /lol/docs/pro visual language (LeagueDocsProData)
 * rather than introducing a second design for the same section.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CloudOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiStatusError } from "@/lib/league-docs/roster-api";

export const GOLD = "#c9a84c";

export type Crumb = { label: string; to?: string };

export function RosterBreadcrumb({ trail }: { trail: Crumb[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted-foreground"
    >
      <Link
        to="/lol/docs/pro"
        className="hover:text-[#c9a84c] transition-colors inline-flex items-center gap-1.5"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Pro Data
      </Link>
      {trail.map((crumb) => (
        <span key={crumb.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden>/</span>
          {crumb.to ? (
            <Link to={crumb.to} className="hover:text-[#c9a84c] transition-colors">
              {crumb.label}
            </Link>
          ) : (
            <span className="text-foreground/80">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function RosterHeader({
  eyebrow,
  title,
  intro,
  Icon,
  aside,
}: {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  Icon: React.ElementType;
  aside?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#0a1428]/90 via-[#091428]/90 to-[#0a0a1a]/90 backdrop-blur-sm p-6 md:p-8">
      <div className="flex items-start gap-4">
        <div className="rounded-xl border border-[#c9a84c]/40 bg-black/40 p-3 shrink-0">
          <Icon className="h-6 w-6" style={{ color: GOLD }} aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="text-[10px] uppercase tracking-[0.25em] font-bold"
            style={{ color: GOLD }}
          >
            {eyebrow}
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground break-words">{title}</h1>
          <div className="text-xs md:text-sm text-muted-foreground mt-1 max-w-2xl">{intro}</div>
          {aside}
        </div>
      </div>
    </div>
  );
}

export function SectionHeading({ label, title }: { label: string; title: string }) {
  return (
    <div className="mb-3">
      <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: GOLD }}>
        {label}
      </div>
      <h2 className="text-lg md:text-xl font-bold text-foreground">{title}</h2>
    </div>
  );
}

/** Outer page container — same max width and rhythm as the Pro Data overview. */
export function RosterPage({ children }: { children: ReactNode }) {
  return <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">{children}</div>;
}

export function RosterSkeleton({ label, rows = 6 }: { label: string; rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 rounded-xl border border-border bg-card/40 animate-pulse" />
      ))}
    </div>
  );
}

export function RosterEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/**
 * Error presentation that distinguishes a temporary outage (502/503/504 — the
 * roster service is down, come back later) from any other failure, because the
 * two ask different things of the reader.
 */
export function RosterError({
  error,
  onRetry,
  isRetrying,
  subject,
}: {
  error: unknown;
  onRetry?: () => void;
  isRetrying?: boolean;
  subject: string;
}) {
  const status = error instanceof ApiStatusError ? error.status : undefined;
  const unavailable = status === 502 || status === 503 || status === 504;
  const Icon = unavailable ? CloudOff : AlertTriangle;
  return (
    <div
      role="alert"
      className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center"
    >
      <Icon className="mx-auto h-6 w-6 text-amber-300" aria-hidden />
      <p className="mt-3 text-sm font-semibold text-foreground">
        {unavailable ? "Roster data is temporarily unavailable" : `Couldn't load ${subject}`}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {unavailable
          ? "The roster service isn't responding right now. Nothing is wrong with your link — try again shortly."
          : "Check your connection and try again."}
      </p>
      {status ? (
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">HTTP {status}</p>
      ) : null}
      {onRetry ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/10"
          onClick={onRetry}
          disabled={isRetrying}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRetrying ? "animate-spin" : ""}`} aria-hidden />
          Retry
        </Button>
      ) : null}
    </div>
  );
}

/** 404 state for an exact page identifier that does not exist. */
export function RosterNotFound({
  kind,
  lpPage,
  children,
}: {
  kind: "player" | "team";
  lpPage: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
      <p className="text-sm font-semibold text-foreground">No {kind} page named “{lpPage}”</p>
      <p className="mx-auto mt-1 max-w-xl text-xs text-muted-foreground">
        Roster pages are matched on the exact Leaguepedia page identifier, including
        capitalisation. A different spelling or capitalisation is a different page here, never the
        same one.
      </p>
      {children}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button
          asChild
          variant="outline"
          size="sm"
          className="border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/10"
        >
          <Link to={kind === "player" ? "/lol/docs/pro/players" : "/lol/docs/pro/teams"}>
            Browse all {kind === "player" ? "players" : "teams"}
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to="/lol/docs/pro/rosters">Roster home</Link>
        </Button>
      </div>
    </div>
  );
}
