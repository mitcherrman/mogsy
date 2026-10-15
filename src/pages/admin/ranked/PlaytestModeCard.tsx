/**
 * UGMP — one game mode in the owner's Playtests hub. Every mode, whatever its
 * maturity, is presented the same way: name, maturity chip, a short gameplay
 * description, one prominent Play control, and a reserved line for loading,
 * availability and launch errors. The card never decides availability; its
 * host passes the backend's own answer down.
 */
import type { ReactNode } from "react";
import { Loader2, Play } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PLAYTEST_TIER_LABEL, type PlaytestTier } from "@/lib/playtests/modes";

const TIER_CLASS: Record<PlaytestTier, string> = {
  "ranked-bot": "border-emerald-600/40 text-emerald-700 dark:border-emerald-400/40 dark:text-emerald-300",
  prototype: "border-amber-600/50 text-amber-800 dark:border-amber-400/50 dark:text-amber-300",
  experiment: "border-sky-600/40 text-sky-700 dark:border-sky-400/40 dark:text-sky-300",
};

export function PlaytestTierChip({ tier }: { tier: PlaytestTier }) {
  return (
    <span
      data-testid="playtest-tier"
      data-tier={tier}
      className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", TIER_CLASS[tier])}
    >
      {PLAYTEST_TIER_LABEL[tier]}
    </span>
  );
}

/** The Play control: a launch button (Ranked Bot presets) or a link to the owner play route (labs). */
export type PlayControl =
  | { kind: "button"; label: string; onClick: () => void; busy: boolean; testId: string }
  | { kind: "link"; label: string; to: string; testId: string };

export function PlaytestModeCard({
  title,
  tier,
  description,
  play,
  disabledReason,
  checking = false,
  error,
  note,
  testId,
  children,
}: {
  title: string;
  tier: PlaytestTier;
  description: ReactNode;
  play: PlayControl;
  /** The backend's reason this mode cannot be served; disables Play. */
  disabledReason?: string | null;
  /** Availability is still being read; disables a link Play. */
  checking?: boolean;
  /** A launch failure, shown under the control. */
  error?: string | null;
  /** A quiet fact under the control (e.g. "227 abilities · historical capture"). */
  note?: string | null;
  testId: string;
  children?: ReactNode;
}) {
  const blocked = Boolean(disabledReason);
  const status = error ?? disabledReason ?? (checking ? "Checking the backend…" : note ?? null);
  const statusTone = error || disabledReason ? "text-destructive" : "text-muted-foreground";
  return (
    <article
      data-testid={testId}
      data-available={blocked ? "false" : checking ? "checking" : "true"}
      aria-label={title}
      className="flex h-full flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3.5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <PlaytestTierChip tier={tier} />
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{description}</p>
      {children}
      <div className="mt-auto space-y-1.5 pt-1">
        {play.kind === "button" ? (
          <Button
            size="sm"
            className="min-h-[40px] w-full gap-1.5 sm:w-auto"
            onClick={play.onClick}
            disabled={play.busy || blocked}
            data-testid={play.testId}
          >
            {play.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
            {play.busy ? "Starting…" : play.label}
          </Button>
        ) : blocked || checking ? (
          <Button size="sm" className="min-h-[40px] w-full gap-1.5 sm:w-auto" disabled data-testid={play.testId}>
            {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
            {play.label}
          </Button>
        ) : (
          <Button asChild size="sm" className="min-h-[40px] w-full gap-1.5 sm:w-auto">
            <Link to={play.to} data-testid={play.testId}>
              <Play className="h-3.5 w-3.5" aria-hidden />
              {play.label}
            </Link>
          </Button>
        )}
        <p
          data-testid={error ? `${testId}-error` : `${testId}-status`}
          role={error || disabledReason ? "alert" : undefined}
          className={cn("min-h-[1rem] text-[11px] leading-snug", statusTone)}
        >
          {status ?? ""}
        </p>
      </div>
    </article>
  );
}
