/**
 * The one section frame the Pro Play hub uses, so Match Center, Match
 * Workspace and Discovery read as three chapters of one page rather than
 * three unrelated cards: the same gold kicker, the same heading scale, the
 * same rule under it.
 */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function HubKicker({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c9a84c]">
      <span aria-hidden="true" className="h-px w-5 bg-[#c9a84c]/70" />
      {children}
    </p>
  );
}

export default function HubSection({
  id,
  kicker,
  title,
  description,
  action,
  children,
  className,
  framed = false,
}: {
  id?: string;
  kicker: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** The stage treatment — a gold-edged panel. Reserved for the Match Center,
   *  which is the page's lead; everything else sits on the page itself. */
  framed?: boolean;
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        "scroll-mt-20",
        framed &&
          "relative overflow-hidden rounded-2xl border border-[#c9a84c]/25 bg-gradient-to-b from-[#c9a84c]/[0.07] via-card/60 to-card/30 p-4 shadow-[0_0_0_1px_rgba(201,168,76,0.04),0_24px_60px_-30px_rgba(201,168,76,0.25)] sm:p-6",
        className,
      )}
    >
      {framed && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#c9a84c]/70 to-transparent"
        />
      )}
      <header className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <HubKicker>{kicker}</HubKicker>
          <h2 id={headingId} className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
            {title}
          </h2>
          {description && (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="flex max-w-full flex-wrap gap-2">{action}</div>}
      </header>
      {children}
    </section>
  );
}
