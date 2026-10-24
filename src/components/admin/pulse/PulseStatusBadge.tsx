import { cn } from "@/lib/utils";
import type { PulseEffectiveStatus } from "@/lib/admin/pulse/contract";
import { STATUS_LABEL } from "@/lib/admin/pulse/lifecycle";

const TONE: Record<PulseEffectiveStatus, string> = {
  live: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  scheduled: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  draft: "bg-muted text-muted-foreground",
  expired: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  unpublished: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300",
  archived: "bg-zinc-500/10 text-zinc-500",
};

export function PulseStatusBadge({ status }: { status: PulseEffectiveStatus }) {
  return (
    <span className={cn("rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide", TONE[status])} data-testid="pulse-status" data-status={status}>
      {STATUS_LABEL[status]}
    </span>
  );
}
