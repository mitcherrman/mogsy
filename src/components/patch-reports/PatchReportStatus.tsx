import type { MogzyStatus } from "@/lib/patch-reports/api";
import { MOGZY_STATUS_GLOSS, MOGZY_STATUS_LABEL } from "@/lib/patch-reports/mogzy-status";
import { cn } from "@/lib/utils";

// "Flagged" is amber, not red: a flagged line is Mogzy's data catching up with
// Riot, never Riot's change in dispute.
const STATUS_STYLES: Record<MogzyStatus, string> = {
  matches: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  applied: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  mismatch: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  unresolved: "bg-orange-500/15 text-orange-400 border-orange-500/40",
  needs_interpretation: "bg-sky-500/15 text-sky-400 border-sky-500/40",
  not_represented: "bg-zinc-500/15 text-zinc-400 border-zinc-500/40",
};

const STATUS_DOT: Record<MogzyStatus, string> = {
  matches: "bg-emerald-400",
  applied: "bg-emerald-300",
  pending: "bg-amber-400",
  mismatch: "bg-amber-400",
  unresolved: "bg-orange-400",
  needs_interpretation: "bg-sky-400",
  not_represented: "bg-zinc-500",
};

/** Full pill. Use inside evidence disclosures, where the status is the subject. */
export const StatusBadge = ({ status }: { status: MogzyStatus }) => (
  <span
    data-mogzy-status={status}
    className={cn(
      "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold",
      STATUS_STYLES[status],
    )}
  >
    {MOGZY_STATUS_LABEL[status]}
  </span>
);

/**
 * Quiet, truthful Mogzy-data marker for headers and summaries: a colored dot
 * plus plain text in muted type. Visible on every entry, but it never competes
 * with the Riot name, rationale or values. The labels name Mogzy themselves
 * ("Not modeled by Mogzy"), so no prefix is needed; `prefix` is kept for a
 * caller that wants one.
 */
export const PatchReportStatusMark = ({
  status,
  prefix,
  className,
}: {
  status: MogzyStatus;
  prefix?: string;
  className?: string;
}) => (
  <span
    data-testid="patch-report-status-mark"
    data-mogzy-status={status}
    title={MOGZY_STATUS_GLOSS[status]}
    className={cn(
      "inline-flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground",
      className,
    )}
  >
    <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[status])} />
    <span className="sr-only">Mogzy data status: </span>
    <span>
      {prefix ? `${prefix}: ` : ""}
      {MOGZY_STATUS_LABEL[status]}
    </span>
  </span>
);
