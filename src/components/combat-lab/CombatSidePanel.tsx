import { ReactNode, useState } from "react";
import { ChevronDown, ChevronUp, Pencil, X } from "lucide-react";

/**
 * Column shell for the attacker/defender sides of the Combat Lab workspace:
 * a large champion visual on top, compact configuration below. Purely
 * presentational — all state stays with the caller.
 */
export default function CombatSidePanel({
  visual,
  children,
  className,
}: {
  visual: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      {visual}
      <div className="flex min-h-0 flex-col gap-3">{children}</div>
    </div>
  );
}

/**
 * Mobile-only progressive disclosure: below the desktop breakpoint the
 * children collapse behind a labeled row that summarizes the current
 * selections; at lg+ the children render exactly as before with no
 * disclosure chrome, so desktop layout is unchanged.
 */
export function MoreSection({
  label,
  summary,
  children,
}: {
  label: string;
  summary: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 py-2 text-left transition-colors hover:bg-muted/10 lg:hidden"
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-foreground/90">
            {label}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{summary}</span>
        </span>
        <span className="flex shrink-0 items-center text-muted-foreground/70">
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>
      <div className={`${open ? "block pb-1" : "hidden"} lg:block lg:pb-0`}>{children}</div>
    </div>
  );
}

/**
 * Inline-expandable configuration row.
 *
 * These rows are read far more often than they are edited, so they carry no
 * frame of their own: a hairline divider separates them and the label/summary
 * pair supplies the hierarchy. Borders are reserved for the real input controls
 * (champion select, level field) that sit above them, which is what makes those
 * read as the interactive elements. The edit affordance is a small square icon
 * button rather than gold `EDIT` text — the whole row is still the click target,
 * so discoverability does not depend on hitting the icon.
 */
export function ConfigRow({
  label,
  summary,
  defaultOpen = false,
  children,
}: {
  label: string;
  summary: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/25 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`group flex w-full items-center gap-2 py-1.5 text-left transition-colors hover:bg-muted/10 ${
          open ? "text-foreground" : ""
        }`}
        aria-expanded={open}
        aria-label={open ? `Close ${label}` : `Edit ${label}`}
        title={open ? `Close ${label}` : `Edit ${label}`}
      >
        <span className="w-[70px] shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">{summary}</span>
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 transition-colors group-hover:bg-primary/15 group-hover:text-primary ${
            open ? "bg-primary/15 text-primary" : ""
          }`}
          aria-hidden="true"
        >
          {open ? <X className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
        </span>
      </button>
      {open && <div className="pb-2.5 pt-0.5">{children}</div>}
    </div>
  );
}
