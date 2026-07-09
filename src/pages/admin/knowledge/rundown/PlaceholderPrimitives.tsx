import { cn } from "@/lib/utils";
import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronRight, Copy } from "lucide-react";

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
      title="No data for this scope"
    >
      no data
    </span>
  );
}

export function ShimmerBar({ className }: { className?: string }) {
  return (
    <div className={cn("rounded bg-muted/40 animate-pulse", className)} />
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

/* ────────────────────────────────────────────────────────────────────────
   Patch Intelligence primitives. Purely presentational — every value is
   backend-provided. No derivation, no invented data.
   ──────────────────────────────────────────────────────────────────────── */

function scoreTone(score: number): { text: string; bar: string; ring: string; glow: string } {
  if (score >= 80) return { text: "text-emerald-300", bar: "bg-emerald-400", ring: "ring-emerald-500/30", glow: "from-emerald-500/25" };
  if (score >= 55) return { text: "text-amber-300", bar: "bg-amber-400", ring: "ring-amber-500/30", glow: "from-amber-500/25" };
  if (score >= 30) return { text: "text-sky-300", bar: "bg-sky-400", ring: "ring-sky-500/30", glow: "from-sky-500/25" };
  return { text: "text-muted-foreground", bar: "bg-muted", ring: "ring-muted/40", glow: "from-muted/20" };
}

export function PatchScoreHero({
  score,
  classification,
  explanation,
  loading,
}: {
  score?: number | null;
  classification?: string | null;
  explanation?: unknown;
  loading?: boolean;
}) {
  const { summary, drivers, raw } = parseExplanation(explanation);
  const has = typeof score === "number" && Number.isFinite(score);
  const clamped = has ? Math.max(0, Math.min(100, score as number)) : 0;
  const tone = scoreTone(clamped);
  const size = 168;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * (clamped / 100);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border bg-card p-5 ring-1 ring-inset",
        "bg-gradient-to-br to-transparent",
        tone.glow,
        tone.ring,
      )}
    >
      <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" className="stroke-muted/25" />
            {has && !loading && (
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                strokeWidth={stroke}
                fill="none"
                strokeLinecap="round"
                stroke="currentColor"
                className={cn(tone.text, "transition-[stroke-dashoffset] duration-1000 ease-out")}
                strokeDasharray={`${dash} ${c - dash}`}
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {loading ? (
              <ShimmerBar className="h-10 w-20" />
            ) : has ? (
              <>
                <div className={cn("text-5xl font-black tabular-nums leading-none animate-fade-in", tone.text)}>
                  {Math.round(clamped)}
                </div>
                <div className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
                  / 100
                </div>
              </>
            ) : (
              <PendingBadge />
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-muted-foreground">
            Patch Impact
          </div>
          {loading ? (
            <ShimmerBar className="h-8 w-56" />
          ) : classification ? (
            <h1 className={cn("text-3xl font-black leading-tight animate-fade-in", tone.text)}>
              {classification}
            </h1>
          ) : (
            <div className="flex items-center gap-2"><ShimmerBar className="h-7 w-40" /><PendingBadge /></div>
          )}
          {summary && (
            <p className="text-sm text-foreground/80 leading-relaxed animate-fade-in">{summary}</p>
          )}
          {drivers.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
                Score drivers
              </div>
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {drivers.map((driver, index) => (
                  <li
                    key={`driver-${index}`}
                    className="flex items-baseline justify-between gap-2 rounded border border-border/60 bg-background/40 px-2 py-1 text-xs"
                  >
                    <span className="truncate text-foreground/90">{driver.label}</span>
                    <span className={cn("shrink-0 font-black tabular-nums", driverTone(driver.points))}>
                      {formatDriverPoints(driver.points)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!summary && drivers.length === 0 && !loading && (
            <p className="text-xs italic text-muted-foreground">No score explanation provided.</p>
          )}
          {raw && <ExplanationRawDetails raw={raw} />}
          {has && !loading && (
            <div className="mt-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
                <div
                  className={cn("h-full rounded-full transition-[width] duration-1000 ease-out", tone.bar)}
                  style={{ width: `${clamped}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface ExplanationDriver {
  label: string;
  points: number | null;
}

function parseExplanation(value: unknown): {
  summary: string | null;
  drivers: ExplanationDriver[];
  raw: string | null;
} {
  if (value == null) return { summary: null, drivers: [], raw: null };
  if (typeof value === "string") {
    return { summary: value, drivers: [], raw: null };
  }
  if (typeof value !== "object") {
    return { summary: String(value), drivers: [], raw: null };
  }
  const record = value as Record<string, unknown>;
  const summaryKeys = ["summary", "description", "text", "message"];
  let summary: string | null = null;
  for (const key of summaryKeys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim() !== "") {
      summary = candidate;
      break;
    }
  }
  const drivers: ExplanationDriver[] = [];
  const driverContainers: unknown[] = [
    record.drivers,
    record.components,
    record.breakdown,
    record.parts,
  ];
  for (const container of driverContainers) {
    if (Array.isArray(container)) {
      for (const entry of container) {
        if (entry && typeof entry === "object") {
          const e = entry as Record<string, unknown>;
          const label =
            (typeof e.label === "string" && e.label) ||
            (typeof e.name === "string" && e.name) ||
            (typeof e.key === "string" && humanizeKind(e.key)) ||
            null;
          if (!label) continue;
          const points =
            typeof e.points === "number" ? e.points
            : typeof e.value === "number" ? e.value
            : typeof e.score === "number" ? e.score
            : typeof e.contribution === "number" ? e.contribution
            : null;
          drivers.push({ label, points });
        }
      }
    } else if (container && typeof container === "object") {
      for (const [key, val] of Object.entries(container as Record<string, unknown>)) {
        drivers.push({
          label: humanizeKind(key),
          points: typeof val === "number" ? val : null,
        });
      }
    }
  }
  let raw: string | null = null;
  try {
    raw = JSON.stringify(value, null, 2);
  } catch {
    raw = null;
  }
  return { summary, drivers, raw };
}

function driverTone(points: number | null): string {
  if (points == null) return "text-muted-foreground";
  if (points > 0) return "text-emerald-300";
  if (points < 0) return "text-red-300";
  return "text-muted-foreground";
}

function formatDriverPoints(points: number | null): string {
  if (points == null) return "—";
  const rounded = Math.round(points * 100) / 100;
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function ExplanationRawDetails({ raw }: { raw: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {open ? "hide score details" : "show score details"}
      </button>
      {open && (
        <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-background/60 p-2 font-mono text-[11px] text-muted-foreground">
          {raw}
        </pre>
      )}
    </div>
  );
}

/** Convert snake_case / kebab-case kind identifiers to Title Case labels. */
export function humanizeKind(kind: string | null | undefined): string | null {
  if (!kind || typeof kind !== "string") return null;
  const trimmed = kind.trim();
  if (!trimmed) return null;
  return trimmed
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .map((word) => {
      if (!word) return word;
      const upper = word.toUpperCase();
      // Preserve acronyms
      if (["CD", "AP", "AD", "HP", "MP"].includes(upper)) return upper;
      if (word.toLowerCase() === "pct") return "%";
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

interface ExecSummaryItem {
  label: string;
  value?: string | number | null;
  tone?: "positive" | "negative" | "info" | "default";
}

export function ExecutiveSummaryCard({
  items,
  loading,
}: {
  items: ExecSummaryItem[];
  loading?: boolean;
}) {
  const tones: Record<NonNullable<ExecSummaryItem["tone"]>, string> = {
    default: "text-foreground",
    positive: "text-emerald-300",
    negative: "text-red-300",
    info: "text-sky-300",
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const has = item.value !== undefined && item.value !== null && item.value !== "";
          return (
            <div
              key={item.label}
              className="group rounded-xl border border-border/60 bg-background/40 p-3 transition-transform duration-200 hover:-translate-y-0.5"
            >
              <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                {item.label}
              </div>
              <div className="mt-1.5 min-h-[1.75rem]">
                {loading ? (
                  <ShimmerBar className="h-5 w-24" />
                ) : has ? (
                  <div className={cn("text-base font-extrabold tabular-nums animate-fade-in", tones[item.tone ?? "default"])}>
                    {item.value}
                  </div>
                ) : (
                  <div className="flex items-center gap-2"><ShimmerBar className="h-4 w-16" /><PendingBadge /></div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConfidenceChip({ value }: { value?: number | null }) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const tone =
    pct >= 85 ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
    : pct >= 60 ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
    : "bg-red-500/15 text-red-300 border-red-500/30";
  return (
    <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold tabular-nums", tone)}>
      {pct}% conf
    </span>
  );
}

function EvidenceBlock({ evidence }: { evidence: unknown }) {
  if (evidence == null) return null;
  let body: string;
  if (typeof evidence === "string") body = evidence;
  else {
    try { body = JSON.stringify(evidence, null, 2); } catch { return null; }
  }
  return (
    <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-background/60 p-2 font-mono text-[11px] text-muted-foreground">
      {body}
    </pre>
  );
}

export function InterestingFactCard({
  headline,
  confidence,
  evidence,
}: {
  headline?: string | null;
  confidence?: number | null;
  evidence?: unknown;
}) {
  const [open, setOpen] = useState(false);
  const hasEvidence = evidence != null && !(Array.isArray(evidence) && evidence.length === 0);
  return (
    <div className="group relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-3 ring-1 ring-inset ring-primary/20 transition-transform duration-200 hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary/80">
          Did you know?
        </div>
        <ConfidenceChip value={confidence} />
      </div>
      <div className="mt-2 text-sm font-extrabold leading-snug animate-fade-in">
        {headline || <span className="italic text-muted-foreground">Awaiting fact</span>}
      </div>
      {hasEvidence && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {open ? "hide evidence" : "show evidence"}
        </button>
      )}
      {open && hasEvidence && <EvidenceBlock evidence={evidence} />}
    </div>
  );
}

export function InsightCard({
  title,
  kind,
  description,
  available,
  availability,
  unavailableReason,
  evidence,
  detail,
  compact,
}: {
  title?: string | null;
  kind?: string | null;
  description?: string | null;
  available?: boolean | null;
  availability?: string | null;
  unavailableReason?: string | null;
  evidence?: unknown;
  detail?: GameplayDetailFields | null;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isAvailable = available !== false && !unavailableReason;
  const hasEvidence = evidence != null && !(Array.isArray(evidence) && evidence.length === 0);
  const displayTitle =
    (title && title.trim()) || humanizeKind(kind) || "Insight";
  const kindLabel = humanizeKind(kind);

  if (compact) {
    return (
      <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <div className="truncate text-xs font-bold text-foreground/90">{displayTitle}</div>
          {kindLabel && (
            <span className="shrink-0 rounded border border-border/60 bg-background/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              {kind}
            </span>
          )}
        </div>
        {unavailableReason && (
          <div className="mt-1 text-[11px] text-amber-200/80">{unavailableReason}</div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border p-3 transition-transform duration-200 hover:-translate-y-0.5",
        isAvailable
          ? "border-emerald-500/25 bg-gradient-to-br from-emerald-500/5 to-card"
          : "border-amber-500/25 bg-gradient-to-br from-amber-500/5 to-card",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-extrabold leading-snug">
            {displayTitle}
          </div>
          {description && (
            <p className="mt-1 text-xs text-foreground/80 leading-relaxed">{description}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {kindLabel && (
            <span className="rounded-md border border-border bg-background/60 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">
              {kindLabel}
            </span>
          )}
          <span
            className={cn(
              "rounded-md border px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider",
              isAvailable
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/30 bg-amber-500/10 text-amber-300",
            )}
          >
            {isAvailable ? availability || "available" : "unavailable"}
          </span>
        </div>
      </div>
      {!isAvailable && unavailableReason && (
        <div className="mt-2 rounded border border-amber-500/20 bg-amber-500/5 px-2 py-1 text-[11px] text-amber-200/90">
          {unavailableReason}
        </div>
      )}
      {detail && <GameplayMetricBlock detail={detail} />}
      {hasEvidence && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {open ? "hide evidence" : "show evidence"}
          </button>
          {open && <EvidenceBlock evidence={evidence} />}
        </>
      )}
    </div>
  );
}

export function HeadlineCard({
  headline,
  kind,
  onCopy,
}: {
  headline?: string | null;
  kind?: string | null;
  onCopy?: (headline: string) => void;
}) {
  const has = typeof headline === "string" && headline.trim().length > 0;
  return (
    <div className="group rounded-xl border border-border bg-card p-3 transition-transform duration-200 hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-2">
        {kind && (
          <span className="rounded-md border border-border bg-background/60 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">
            {kind}
          </span>
        )}
        {has && (
          <button
            type="button"
            onClick={() => onCopy?.(headline as string)}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-primary opacity-0 transition-opacity hover:underline group-hover:opacity-100"
          >
            <Copy className="h-3 w-3" /> copy
          </button>
        )}
      </div>
      <div className="mt-2 text-sm font-extrabold leading-snug animate-fade-in">
        {has ? headline : <span className="italic text-muted-foreground">Awaiting headline</span>}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Gameplay Impact primitives.
   ──────────────────────────────────────────────────────────────────────── */

function formatMaybeNumber(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const rounded = Math.round(value * 100) / 100;
    return String(rounded);
  }
  if (typeof value === "string" && value.trim() !== "") return value;
  return null;
}

function formatSignedMaybe(value: unknown, suffix = ""): string | null {
  const raw = formatMaybeNumber(value);
  if (raw == null) return null;
  const asNum = typeof value === "number" ? value : Number(raw);
  if (Number.isFinite(asNum) && asNum > 0) return `+${raw}${suffix}`;
  return `${raw}${suffix}`;
}

function deltaTone(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "text-foreground";
  if (n > 0) return "text-emerald-300";
  if (n < 0) return "text-red-300";
  return "text-foreground";
}

export interface GameplayDetailFields {
  champion?: string | null;
  ability?: string | null;
  ability_key?: string | null;
  metric_key?: string | null;
  property?: string | null;
  rank?: unknown;
  net_change_score?: unknown;
  old_value?: unknown;
  new_value?: unknown;
  before?: unknown;
  after?: unknown;
  delta?: unknown;
  delta_pct?: unknown;
  unit?: string | null;
  assumptions?: unknown;
}

/** Renders a structured metric delta block (before → after, delta, %). */
export function GameplayMetricBlock({ detail }: { detail: GameplayDetailFields }) {
  const before = formatMaybeNumber(detail.before ?? detail.old_value);
  const after = formatMaybeNumber(detail.after ?? detail.new_value);
  const delta = formatSignedMaybe(detail.delta, detail.unit ? ` ${detail.unit}` : "");
  const deltaPct = formatSignedMaybe(detail.delta_pct, "%");
  const ability = detail.ability || detail.ability_key || null;
  const metricLabel = humanizeKind(detail.metric_key) || detail.metric_key || null;
  const propertyLabel = humanizeKind(detail.property) || detail.property || null;
  const rank = formatMaybeNumber(detail.rank);
  const netChange = formatSignedMaybe(detail.net_change_score);

  const summary = [detail.champion, ability, metricLabel || propertyLabel]
    .filter(Boolean)
    .join(" · ");
  const hasAny = before || after || delta || deltaPct || summary || rank || netChange;
  if (!hasAny) return null;

  return (
    <div className="mt-2 rounded-lg border border-border/60 bg-background/40 p-2">
      {summary && (
        <div className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
          {summary}
        </div>
      )}
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs tabular-nums">
        {before != null && (
          <span>
            <span className="text-[10px] uppercase text-muted-foreground">before </span>
            <span className="font-bold">{before}</span>
          </span>
        )}
        {after != null && (
          <span>
            <span className="text-[10px] uppercase text-muted-foreground">after </span>
            <span className="font-bold">{after}</span>
          </span>
        )}
        {delta != null && (
          <span className={cn("font-black", deltaTone(detail.delta))}>Δ {delta}</span>
        )}
        {deltaPct != null && (
          <span className={cn("font-black", deltaTone(detail.delta_pct))}>{deltaPct}</span>
        )}
        {detail.unit && !delta && (
          <span className="text-[10px] text-muted-foreground">unit: {detail.unit}</span>
        )}
        {rank != null && (
          <span>
            <span className="text-[10px] uppercase text-muted-foreground">rank </span>
            <span className="font-bold">{rank}</span>
          </span>
        )}
        {netChange != null && (
          <span>
            <span className="text-[10px] uppercase text-muted-foreground">net </span>
            <span className={cn("font-bold", deltaTone(detail.net_change_score))}>{netChange}</span>
          </span>
        )}
      </div>
      {detail.assumptions != null && (
        <AssumptionsInline value={detail.assumptions} />
      )}
    </div>
  );
}

function AssumptionsInline({ value }: { value: unknown }) {
  let text: string | null = null;
  if (typeof value === "string") text = value;
  else if (Array.isArray(value)) {
    text = value.filter((v) => typeof v === "string").join(" · ") || null;
    if (!text) {
      try { text = JSON.stringify(value); } catch { text = null; }
    }
  } else if (value != null) {
    try { text = JSON.stringify(value); } catch { text = null; }
  }
  if (!text) return null;
  return (
    <div className="mt-1.5 text-[10px] italic text-muted-foreground">
      assumptions: {text}
    </div>
  );
}

export function GameplayImpactSummaryCards({
  metricsComputed,
  metricsUnavailable,
  sources,
  generatedAt,
  loading,
}: {
  metricsComputed?: number | null;
  metricsUnavailable?: number | null;
  sources?: string[] | null;
  generatedAt?: string | null;
  loading?: boolean;
}) {
  const sourceText = Array.isArray(sources) && sources.length > 0 ? sources.join(" · ") : null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <MetricCard label="Metrics Computed" value={metricsComputed ?? undefined} accent="positive" loading={loading} />
      <MetricCard label="Metrics Unavailable" value={metricsUnavailable ?? undefined} accent="warning" loading={loading} />
      <MetricCard label="Sources" value={sourceText ?? undefined} accent="info" loading={loading} />
      <MetricCard label="Generated At" value={generatedAt ?? undefined} accent="default" loading={loading} />
    </div>
  );
}

export function GameplayMetricsTable({ metrics }: { metrics: GameplayDetailFields[] & { role?: string | null; availability?: string | null; available?: boolean | null; unavailable_reason?: string | null }[] }) {
  if (!metrics || metrics.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-[11px] tabular-nums">
        <thead className="bg-background/40 text-muted-foreground">
          <tr className="text-left">
            <th className="px-2 py-1.5 font-bold">Champion</th>
            <th className="px-2 py-1.5 font-bold">Role</th>
            <th className="px-2 py-1.5 font-bold">Ability</th>
            <th className="px-2 py-1.5 font-bold">Metric</th>
            <th className="px-2 py-1.5 font-bold">Before</th>
            <th className="px-2 py-1.5 font-bold">After</th>
            <th className="px-2 py-1.5 font-bold">Δ</th>
            <th className="px-2 py-1.5 font-bold">%</th>
            <th className="px-2 py-1.5 font-bold">Unit</th>
            <th className="px-2 py-1.5 font-bold">Availability</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((m, index) => {
            const row = m as GameplayDetailFields & { role?: string | null; availability?: string | null; available?: boolean | null; unavailable_reason?: string | null };
            const isAvail = row.available !== false && !row.unavailable_reason;
            const availabilityLabel = isAvail
              ? row.availability || "available"
              : row.unavailable_reason || row.availability || "unavailable";
            return (
              <tr key={`gm-${index}`} className="border-t border-border/40">
                <td className="px-2 py-1.5 font-bold">{row.champion ?? "—"}</td>
                <td className="px-2 py-1.5">{row.role ?? "—"}</td>
                <td className="px-2 py-1.5">{row.ability || row.ability_key || "—"}</td>
                <td className="px-2 py-1.5 font-mono text-[10px]">{row.metric_key ?? "—"}</td>
                <td className="px-2 py-1.5">{formatMaybeNumber(row.before) ?? "—"}</td>
                <td className="px-2 py-1.5">{formatMaybeNumber(row.after) ?? "—"}</td>
                <td className={cn("px-2 py-1.5 font-black", deltaTone(row.delta))}>
                  {formatSignedMaybe(row.delta) ?? "—"}
                </td>
                <td className={cn("px-2 py-1.5 font-black", deltaTone(row.delta_pct))}>
                  {formatSignedMaybe(row.delta_pct, "%") ?? "—"}
                </td>
                <td className="px-2 py-1.5 text-muted-foreground">{row.unit ?? "—"}</td>
                <td className="px-2 py-1.5">
                  <span
                    className={cn(
                      "inline-block rounded border px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider",
                      isAvail
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-300",
                    )}
                    title={row.unavailable_reason ?? undefined}
                  >
                    {availabilityLabel}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function GameplayChampionImpactCard({
  champion,
  role,
  availableKeys,
  unavailableKeys,
  computedCount,
  unavailableCount,
}: {
  champion?: string | null;
  role?: string | null;
  availableKeys?: string[] | null;
  unavailableKeys?: string[] | null;
  computedCount?: number | null;
  unavailableCount?: number | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-extrabold">{champion || "Unknown champion"}</div>
          {role && <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{role}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-1 text-[10px] font-bold">
          {computedCount != null && (
            <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">
              {computedCount} computed
            </span>
          )}
          {unavailableCount != null && (
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-amber-300">
              {unavailableCount} pending
            </span>
          )}
        </div>
      </div>
      {availableKeys && availableKeys.length > 0 && (
        <div className="mt-2">
          <div className="text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">Available metrics</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {availableKeys.map((key) => (
              <span key={`av-${key}`} className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                {key}
              </span>
            ))}
          </div>
        </div>
      )}
      {unavailableKeys && unavailableKeys.length > 0 && (
        <div className="mt-2">
          <div className="text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">Unavailable metrics</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {unavailableKeys.map((key) => (
              <span key={`un-${key}`} className="rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
                {key}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AssumptionsPanel({ assumptions }: { assumptions: unknown }) {
  const [open, setOpen] = useState(false);
  if (assumptions == null) return null;

  let items: { key: string; value: string }[] = [];
  let globalText: string | null = null;

  if (typeof assumptions === "string") {
    globalText = assumptions;
  } else if (Array.isArray(assumptions)) {
    items = assumptions
      .map((item, index) => {
        if (typeof item === "string") return { key: String(index), value: item };
        try { return { key: String(index), value: JSON.stringify(item) }; } catch { return null; }
      })
      .filter((v): v is { key: string; value: string } => v != null);
  } else if (typeof assumptions === "object") {
    items = Object.entries(assumptions as Record<string, unknown>).map(([k, v]) => ({
      key: k,
      value: typeof v === "string" ? v : (() => { try { return JSON.stringify(v); } catch { return ""; } })(),
    }));
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div>
          <div className="text-xs font-extrabold uppercase tracking-wider">Assumptions</div>
          <div className="text-[10px] text-muted-foreground">Global assumptions behind these metrics</div>
        </div>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
        <div className="mt-2 space-y-1 text-[11px] text-foreground/80">
          {globalText && <div>{globalText}</div>}
          {items.map((item) => (
            <div key={item.key} className="flex gap-2 border-t border-border/30 pt-1">
              <span className="min-w-[8rem] font-mono text-[10px] text-muted-foreground">{item.key}</span>
              <span className="flex-1">{item.value}</span>
            </div>
          ))}
          {!globalText && items.length === 0 && (
            <div className="italic text-muted-foreground">No structured assumptions.</div>
          )}
        </div>
      )}
    </div>
  );
}