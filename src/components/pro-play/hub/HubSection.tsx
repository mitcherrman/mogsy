/**
 * The Pro Play hub's section kicker: the small gold label with its rule.
 */
import type { ReactNode } from "react";

export function HubKicker({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c9a84c]">
      <span aria-hidden="true" className="h-px w-5 bg-[#c9a84c]/70" />
      {children}
    </p>
  );
}
