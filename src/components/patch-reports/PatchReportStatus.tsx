import type { MogzyStatus } from "@/lib/patch-reports/api";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<MogzyStatus, string> = {
  matches: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  applied: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  mismatch: "bg-red-500/15 text-red-400 border-red-500/40",
  unresolved: "bg-orange-500/15 text-orange-400 border-orange-500/40",
  needs_interpretation: "bg-sky-500/15 text-sky-400 border-sky-500/40",
  not_represented: "bg-zinc-500/15 text-zinc-400 border-zinc-500/40",
};

const STATUS_DOT: Record<MogzyStatus, string> = {
  matches: "bg-emerald-400",
  applied: "bg-emerald-300",
  pending: "bg-amber-400",
  mismatch: "bg-red-400",
  unresolved: "bg-orange-400",
  needs_interpretation: "bg-sky-400",
  not_represented: "bg-zinc-500",
};

const PATCH_REPORT_STATUS_TEXT: Record<MogzyStatus, string> = {
  matches: "Matches",
  applied: "Applied",
  pending: "Pending",
  mismatch: "Mismatch",
  unresolved: "Unresolved",
  needs_interpretation: "Needs interpretation",
  not_represented: "Not represented",
};

/** Full pill. Use inside evidence disclosures, where the status is the subject. */
export const StatusBadge = ({ status }: { status: MogzyStatus }) => (
  <span
    className={cn(
      "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold",
      STATUS_STYLES[status],
    )}
  >
    {PATCH_REPORT_STATUS_TEXT[status]}
  </span>
);

/**
 * Quiet, truthful Mogzy-data marker for headers and summaries: a colored dot
 * plus plain text in muted type. Visible on every entry, but it never competes
 * with the Riot name, rationale or values.
 */
export const PatchReportStatusMark = ({
  status,
  prefix = "Mogzy",
  className,
}: {
  status: MogzyStatus;
  prefix?: string;
  className?: string;
}) => (
  <span
    className={cn(
      "inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] text-muted-foreground",
      className,
    )}
  >
    <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} />
    {prefix}: {PATCH_REPORT_STATUS_TEXT[status]}
  </span>
);
