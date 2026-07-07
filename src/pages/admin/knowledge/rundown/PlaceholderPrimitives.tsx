import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/* ────────────────────────────────────────────────────────────────────────
   Reusable placeholder / metric primitives for the Patch Intelligence
   Report. Every "awaiting backend" state uses these — they are the
   scaffolding that will accept real values once the analytics endpoint
   is wired. No calculation happens here; the components purely render
   what they're given (or a placeholder if `value` is undefined/null).
   ──────────────────────────────────────────────────────────────────────── */

export function PendingBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-dashed border-primary/40 bg-primary/5 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-primary/80",
        className,
      )}
      title="Awaiting backend analytics endpoint"
    >
      awaiting backend
    </span>
  );
}

export function ShimmerBar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded bg-muted/30",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2.2s_infinite]",
        "before:bg-gradient-to-r before:from-transparent before:via-white/5 before:to-transparent",
        className,
      )}
    />
  );
}

interface MetricCardProps {
  label: string;
  value?: number | string | null;
  hint?: ReactNode;
  accent?: "default" | "positive" | "negative" | "warning" | "info";
  icon?: ReactNode;
  loading?: boolean;
  className?: string;
}

const ACCENT_TONES: Record<NonNullable<MetricCardProps["accent"]>, string> = {
  default:  "from-primary/10 to-transparent ring-primary/20",
  positive: "from-emerald-500/15 to-transparent ring-emerald-500/25",
  negative: "from-red-500/15 to-transparent ring-red-500/25",
  warning:  "from-amber-500/15 to-transparent ring-amber-500/25",
  info:     "from-sky-500/15 to-transparent ring-sky-500/25",
};

/**
 * Broadcast-style metric card. Renders `value` if provided; otherwise
 * shows a pending shimmer + "awaiting backend" chip. Never fabricates.
 */
export function MetricCard({
  label,
  value,
  hint,
  accent = "default",
  icon,
  loading,
  className,
}: MetricCardProps) {
  const hasValue = value !== undefined && value !== null && value !== "";
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-card p-3 ring-1 ring-inset",
        "bg-gradient-to-br transition-transform duration-200 hover:-translate-y-0.5",
        ACCENT_TONES[accent],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </div>
        {icon && <div className="opacity-60">{icon}</div>}
      </div>
      <div className="mt-2 min-h-[2rem]">
        {loading ? (
          <ShimmerBar className="h-7 w-20" />
        ) : hasValue ? (
          <div className="animate-fade-in text-2xl font-black tabular-nums leading-none">
            {value}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <ShimmerBar className="h-6 w-16" />
            <PendingBadge />
          </div>
        )}
      </div>
      {hint && <div className="mt-1.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

interface SectionShellProps {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  banner?: ReactNode;
}

export function SectionShell({ title, subtitle, right, children, banner }: SectionShellProps) {
  return (
    <section className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.16em] bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
            {title}
          </h2>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        {right}
      </div>
      {banner}
      {children}
    </section>
  );
}

interface RankingCardProps {
  label: string;
  champion?: string | null;
  detail?: string | null;
  value?: string | number | null;
  loading?: boolean;
}

/**
 * Ranking (superlative) card. Displays a leader and a value. When either
 * is missing (which is the case today since the rundown endpoint doesn't
 * expose deltas), it renders the pending state instead of computing.
 */
export function RankingCard({ label, champion, detail, value, loading }: RankingCardProps) {
  const hasData = champion != null && champion !== "";
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-3">
      <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      {loading ? (
        <div className="mt-2 space-y-2">
          <ShimmerBar className="h-4 w-32" />
          <ShimmerBar className="h-3 w-20" />
        </div>
      ) : hasData ? (
        <div className="mt-2 animate-fade-in">
          <div className="text-base font-extrabold truncate">{champion}</div>
          {detail && <div className="text-[11px] text-muted-foreground truncate">{detail}</div>}
          {value != null && (
            <div className="mt-1 text-lg font-black tabular-nums text-primary">{value}</div>
          )}
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <ShimmerBar className="h-4 w-28" />
          <PendingBadge />
        </div>
      )}
    </div>
  );
}

interface PropertyBreakdownCardProps {
  property: string;
  count?: number | null;
  largestDelta?: string | number | null;
  largestPct?: string | number | null;
  topChampion?: string | null;
  loading?: boolean;
}

/**
 * Card describing per-property rollups (cooldown, mana, damage, …).
 * Accepts count / largest delta / largest pct / top champion. Any field
 * left null renders as an awaiting-backend placeholder.
 */
export function PropertyBreakdownCard({
  property,
  count,
  largestDelta,
  largestPct,
  topChampion,
  loading,
}: PropertyBreakdownCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-extrabold capitalize">{property}</div>
        {count == null && !loading && <PendingBadge />}
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <Stat label="Changes" value={count} loading={loading} />
        <Stat label="Largest Δ" value={largestDelta} loading={loading} />
        <Stat label="Largest %" value={largestPct} loading={loading} />
        <Stat label="Top champion" value={topChampion} loading={loading} truncate />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  loading,
  truncate,
}: {
  label: string;
  value?: string | number | null;
  loading?: boolean;
  truncate?: boolean;
}) {
  const hasValue = value !== undefined && value !== null && value !== "";
  return (
    <div className="rounded bg-background/40 px-2 py-1">
      <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      {loading ? (
        <ShimmerBar className="h-3.5 w-12 mt-0.5" />
      ) : hasValue ? (
        <div className={cn("text-xs font-bold tabular-nums", truncate && "truncate")}>{value}</div>
      ) : (
        <div className="text-[10px] text-muted-foreground/70 italic">pending</div>
      )}
    </div>
  );
}

/** Progress ring used for confidence / coverage / health. */
export function ProgressRing({
  value,
  size = 64,
  label,
  loading,
}: {
  value?: number | null;
  size?: number;
  label?: string;
  loading?: boolean;
}) {
  const has = value !== undefined && value !== null;
  const pct = has ? Math.max(0, Math.min(1, value)) : 0;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  const tone =
    pct >= 0.85 ? "text-emerald-400" : pct >= 0.65 ? "text-amber-300" : "text-red-400";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="stroke-muted/40" fill="none" />
          {has && !loading && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              className={cn(tone, "transition-[stroke-dashoffset] duration-700 ease-out")}
              stroke="currentColor"
              strokeDasharray={`${dash} ${c - dash}`}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {loading ? (
            <ShimmerBar className="h-3 w-8" />
          ) : has ? (
            <span className="text-sm font-black tabular-nums animate-fade-in">
              {Math.round(pct * 100)}%
            </span>
          ) : (
            <span className="text-[9px] text-muted-foreground italic">—</span>
          )}
        </div>
      </div>
      {label && (
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center">
          {label}
        </div>
      )}
    </div>
  );
}

/**
 * Banner used on the Gameplay Impact section (and anywhere else we need
 * to be explicit that a whole block depends on backend work).
 */
export function AwaitingBackendBanner({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-primary/40 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-3 py-2 text-xs text-primary/90 flex items-center gap-2">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
      {children}
    </div>
  );
}