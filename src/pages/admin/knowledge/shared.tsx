import { cn } from "@/lib/utils";
import type {
  HealthCategory,
  Provider,
  RecommendedAction,
  Severity,
} from "@/lib/knowledge-admin/types";

/* ────────────────────────────────────────────────────────────────────────
   Small presentational helpers shared by every Knowledge Admin page.
   Colors follow docs/admin_ui_wireframes.md "Global assumptions".
   ──────────────────────────────────────────────────────────────────────── */

export function ConfidenceBadge({ value, className }: { value: number; className?: string }) {
  const pct = Math.round(value * 100);
  const tone =
    value >= 0.9
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : value >= 0.7
      ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
      : "bg-red-500/15 text-red-300 border-red-500/30";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold tabular-nums", tone, className)}>
      {pct}%
    </span>
  );
}

export function ProviderBadge({ provider }: { provider: Provider }) {
  const isPatch = provider === "patch_notes";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider",
        isPatch ? "bg-purple-500/20 text-purple-200" : "bg-sky-500/20 text-sky-200",
      )}
      title={isPatch ? "Riot Patch Notes (authoritative)" : "League Wiki"}
    >
      {isPatch ? "PATCH" : "WIKI"}
    </span>
  );
}

const SEVERITY_TONES: Record<Severity, string> = {
  major: "bg-red-500/15 text-red-300 border-red-500/30",
  moderate: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  minor: "bg-muted text-muted-foreground border-border",
  unknown: "bg-muted text-muted-foreground border-border",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase", SEVERITY_TONES[severity])}>
      {severity}
    </span>
  );
}

const CATEGORY_TONES: Record<HealthCategory, string> = {
  HEALTHY: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  NEEDS_REVIEW: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  CRITICAL: "bg-red-500/20 text-red-300 border-red-500/30",
  NO_DATA: "bg-muted text-muted-foreground border-border",
};

export function HealthCategoryBadge({ category }: { category: HealthCategory }) {
  return (
    <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider", CATEGORY_TONES[category])}>
      {category.replace("_", " ")}
    </span>
  );
}

export function FlagChip({ flag }: { flag: string }) {
  return (
    <span className="inline-flex items-center rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-bold">
      ⚠ {flag.replace(/_/g, " ")}
    </span>
  );
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "—";
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function ErrorBanner({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center justify-between gap-3">
      <span className="truncate">Error: {message}</span>
      {onRetry && (
        <button onClick={onRetry} className="rounded bg-destructive/20 hover:bg-destructive/30 text-destructive px-2 py-1 text-xs font-bold">
          Retry
        </button>
      )}
    </div>
  );
}

export function SkeletonRow({ className }: { className?: string }) {
  return <div className={cn("h-8 rounded bg-muted/40 animate-pulse", className)} />;
}

/** UI treatment for the recommended_action field (docs §2). */
export function actionPrimaryStyle(action: RecommendedAction) {
  switch (action) {
    case "manual_review":
      return { disabled: true, label: "Disputed — approve ranks individually", variant: "destructive" as const };
    case "verify_source":
      return { disabled: false, label: "Verify source first", variant: "secondary" as const };
    case "approve_progression":
      return { disabled: false, label: "Approve progression", variant: "default" as const };
    case "approve":
      return { disabled: false, label: "Approve rank", variant: "default" as const };
    case "none":
    default:
      return { disabled: true, label: "Read-only (already actioned)", variant: "secondary" as const };
  }
}