/**
 * Small shared pieces of the Worlds experience (UX1): the panel surface, the
 * eyebrow label, stat figures, a crest-or-slot mark, and the roving arrow-key
 * handler the two navigation rails use.
 */
import type { KeyboardEvent, ReactNode } from "react";

import { TeamCrest, type CrestSize } from "@/components/pro-play/media/EntityCrest";
import type { TournamentMatchTeamV2 } from "@/lib/pro-play/tournamentApi";
import { localDayKey } from "@/lib/pro-play/tournamentView";
import { cn } from "@/lib/utils";

/** The experience's raised surface: a quiet navy plate with a hairline and a
 *  faint top light, so panels read as one instrument rather than cards. */
export const SURFACE =
  "rounded-2xl border border-white/[0.07] bg-[linear-gradient(180deg,hsl(213_48%_10%/0.92),hsl(214_52%_7%/0.92))] shadow-[inset_0_1px_0_hsl(42_70%_70%/0.06),0_18px_40px_-28px_rgba(0,0,0,0.9)]";

export const GOLD_TEXT = "text-[#e3c66f]";

/** "Oct 25–26" / "Oct 31 – Nov 1": a set of matches' local days, compactly. */
export function compactDays(isos: readonly string[]): string {
  const keys = [...new Set(isos.map((iso) => localDayKey(iso)).filter((d): d is string => Boolean(d)))].sort();
  if (!keys.length) return "";
  const date = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const a = date(keys[0]);
  const b = date(keys[keys.length - 1]);
  const md = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (keys.length === 1) return md(a);
  if (a.getMonth() === b.getMonth()) return `${md(a)}–${b.getDate()}`;
  return `${md(a)} – ${md(b)}`;
}

/** "23 Oct" for a registry calendar date ("2026-10-23"). */
export const calendarDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function Eyebrow({ children, className, tone = "gold" }: { children: ReactNode; className?: string; tone?: "gold" | "muted" }) {
  return (
    <p
      className={cn(
        "text-[10.5px] font-semibold uppercase leading-none tracking-[0.2em]",
        tone === "gold" ? "text-[#c9a84c]" : "text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** A large figure with its label: "4 / teams". */
export function Figure({ value, label, tone = "plain", testId }: { value: ReactNode; label: string; tone?: "plain" | "gold" | "muted"; testId?: string }) {
  return (
    <div className="min-w-0" data-testid={testId}>
      <p
        className={cn(
          "text-[26px] font-bold leading-none tabular-nums tracking-tight",
          tone === "gold" ? GOLD_TEXT : tone === "muted" ? "text-foreground/55" : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
    </div>
  );
}

/** A team's crest, or the dashed mark of a slot whose team is not known yet. */
export function SideMark({ team, size = "sm", byCodeName }: { team: TournamentMatchTeamV2; size?: CrestSize; byCodeName: (t: TournamentMatchTeamV2) => string }) {
  if (team.tbd || !team.code) {
    const box = { xs: "h-6 w-6", sm: "h-8 w-8", md: "h-11 w-11", lg: "h-16 w-16", xl: "h-20 w-20 md:h-24 md:w-24" }[size];
    return (
      <span
        aria-hidden="true"
        className={cn("inline-flex shrink-0 items-center justify-center rounded-lg border border-dashed border-white/20 text-xs font-semibold text-muted-foreground", box)}
      >
        ?
      </span>
    );
  }
  return <TeamCrest teamKey={team.team_key} name={byCodeName(team)} shortCode={team.code} size={size} />;
}

/**
 * Arrow keys move focus along a rail of links (Left / Right, Home / End).
 * Bound on the rail itself, so the keys are only taken while focus is in it —
 * never from a field or another control elsewhere on the page.
 */
export function rovingKeys(e: KeyboardEvent<HTMLElement>) {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-roving]")];
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return;
  let next = -1;
  if (e.key === "ArrowRight") next = (i + 1) % items.length;
  else if (e.key === "ArrowLeft") next = (i - 1 + items.length) % items.length;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = items.length - 1;
  if (next < 0) return;
  e.preventDefault();
  items[next].focus();
}
