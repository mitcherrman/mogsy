import { ReactNode, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

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
 * Inline-expandable configuration row: shows the current selection at a
 * glance, expands in place to reveal the existing editor controls.
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
    <div className="rounded-md border border-border/50 bg-background/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-muted/20"
        aria-expanded={open}
      >
        <span className="w-[74px] shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">{summary}</span>
        <span className="flex shrink-0 items-center gap-0.5 text-[10px] font-medium uppercase tracking-wider text-primary/80">
          {open ? (
            <>
              Close <ChevronUp className="h-3 w-3" />
            </>
          ) : (
            <>
              Edit <ChevronDown className="h-3 w-3" />
            </>
          )}
        </span>
      </button>
      {open && <div className="border-t border-border/40 px-2.5 py-2.5">{children}</div>}
    </div>
  );
}
