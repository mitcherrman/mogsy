// Shared presentational primitives for the Mechanics Explorer surfaces.
//
// These deliberately mirror existing Mogzy conventions rather than inventing
// new ones: the status pill follows patch-reports' StatusBadge tone map
// (src/components/patch-reports/PatchReportEntityCard.tsx — including its
// orange "unresolved"), the error banner follows the Knowledge Admin
// ErrorBanner contract (src/pages/admin/knowledge/shared.tsx), and panels
// follow the League Docs card treatment. Local copies keep the public /lol
// bundle free of admin/patch-report modules while preserving the vocabulary.

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MechanicProvenance, StatValue } from "@/lib/mechanics-explorer/api";

export const GOLD = "#c9a84c";

// ---------------------------------------------------------------------------
// Status badge — authoritative / derived / unresolved vocabulary
// ---------------------------------------------------------------------------

export type MechanicStatus = "verified" | "derived" | "unresolved" | string;

const STATUS_STYLES: Record<string, string> = {
  verified: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  derived: "bg-sky-500/15 text-sky-400 border-sky-500/40",
  unresolved: "bg-orange-500/15 text-orange-400 border-orange-500/40",
};

const STATUS_TEXT: Record<string, string> = {
  verified: "Verified",
  derived: "Derived",
  unresolved: "Unresolved",
};

/** Spelled-out status pill (never color-only), patch-reports tone map. */
export function MechanicStatusBadge({ status }: { status: MechanicStatus }) {
  const style = STATUS_STYLES[status] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/40";
  const text = STATUS_TEXT[status] ?? status.replaceAll("_", " ");
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        style,
      )}
    >
      {text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Panels, stat rows, chips
// ---------------------------------------------------------------------------

export function Panel({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card/60 p-4", className)}>
      {title && (
        <h3 className="mb-3 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}

/** Compact label-over-value stat tile (Combat Lab `Stat` contract). */
export function StatRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-border/50 bg-background/40 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-semibold text-foreground tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Small gold "Soon" chip, matching the League Docs landing placeholder tiles. */
export function SoonChip() {
  return (
    <span className="rounded-md border border-[#c9a84c]/30 bg-[#c9a84c]/5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#c9a84c]">
      Soon
    </span>
  );
}

// ---------------------------------------------------------------------------
// Error banner (Knowledge Admin ErrorBanner contract)
// ---------------------------------------------------------------------------

export function ErrorBanner({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <span className="min-w-0 break-words">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded bg-destructive/20 px-2 py-1 text-xs font-bold text-destructive hover:bg-destructive/30"
        >
          Retry
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provenance disclosure
// ---------------------------------------------------------------------------

/**
 * Collapsible "where these numbers come from" list. Every backend result
 * carries the canonical mechanics consumed; each row shows its verification
 * status and, when present, the manifest's own caveat text verbatim.
 */
export function ProvenanceList({ provenance }: { provenance: MechanicProvenance[] }) {
  const [open, setOpen] = useState(false);
  if (provenance.length === 0) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-card/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
      >
        <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
          Rules behind this result ({provenance.length})
        </span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <ul className="space-y-2.5 border-t border-border/60 px-4 py-3">
          {provenance.map((rule) => (
            <li key={rule.mechanic_id} className="text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <code className="break-all text-foreground">{rule.mechanic_id}</code>
                <MechanicStatusBadge status={rule.status} />
                <span className="text-muted-foreground">
                  effective {rule.effective_patch} · verified through {rule.verified_through}
                </span>
              </div>
              {rule.caveat && (
                <p className="mt-1 text-muted-foreground">{rule.caveat}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton for result areas
// ---------------------------------------------------------------------------

export function ResultSkeleton() {
  return (
    <div className="space-y-3" aria-hidden data-testid="mechanics-result-skeleton">
      <div className="h-24 animate-pulse rounded-xl bg-muted/40" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="h-14 animate-pulse rounded-md bg-muted/40" />
        <div className="h-14 animate-pulse rounded-md bg-muted/40" />
        <div className="h-14 animate-pulse rounded-md bg-muted/40" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Choice chips — touch-friendly single-select row (5B2)
// ---------------------------------------------------------------------------

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

/** Wrapping row of selectable chips; the accessible pattern is a radiogroup. */
export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: ReadonlyArray<ChoiceOption<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors",
              selected
                ? "border-[#c9a84c]/60 bg-[#c9a84c]/10 text-foreground"
                : "border-border text-muted-foreground hover:border-[#c9a84c]/40 hover:text-foreground",
            )}
          >
            {option.label}
            {option.hint && (
              <span className="ml-1 font-normal text-muted-foreground">{option.hint}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat-with-status rendering (5B2) — verified / derived / unresolved
// ---------------------------------------------------------------------------

/**
 * One backend StatValue as a table cell body: the exact value string when
 * present, or an explicit Unresolved badge plus the backend's reason.
 * Verified values carry no badge (it is the norm); non-verified statuses are
 * always badged so uncertainty is visible, never blank or zero.
 */
export function StatValueCell({ stat, unit }: { stat: StatValue; unit?: string }) {
  if (stat.value === null) {
    return (
      <div>
        <MechanicStatusBadge status={stat.status} />
        {stat.unresolved_reason && (
          <p className="mt-1 max-w-sm text-[11px] leading-snug text-muted-foreground">
            {stat.unresolved_reason}
          </p>
        )}
      </div>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-semibold tabular-nums text-foreground">
        {stat.value}
        {unit ? ` ${unit}` : ""}
      </span>
      {stat.status !== "verified" && <MechanicStatusBadge status={stat.status} />}
    </span>
  );
}

/** Compact "doesn't apply here" list for structure sections (5B2). */
export function NotApplicableNotes({
  notes,
}: {
  notes: Array<{ name: string; reason: string }>;
}) {
  if (notes.length === 0) return null;
  return (
    <div
      className="rounded-xl border border-border/60 bg-card/30 p-4"
      data-testid="not-applicable-notes"
    >
      <h3 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
        Doesn't apply here
      </h3>
      <ul className="mt-2 space-y-1.5">
        {notes.map((note) => (
          <li key={note.name} className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{note.name}</span> — {note.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}
