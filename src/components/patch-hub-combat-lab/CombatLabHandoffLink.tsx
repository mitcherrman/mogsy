import { FlaskConical } from "lucide-react";
import { Link } from "react-router-dom";
import type { CombatLabHandoff } from "@/lib/patch-hub-combat-lab/handoff";

/**
 * Entity-level "Open {Champion} in Combat Lab" (PH4-C). A plain client-side
 * link (given an already-eligible handoff), so browser Back returns to this report position. It performs no
 * request and carries no patch information; see `handoff.ts`.
 */
export const CombatLabHandoffLink = ({ handoff }: { handoff: CombatLabHandoff }) => {
  return (
    <Link
      to={handoff.href}
      data-testid="patch-report-combat-lab"
      className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[#c9a84c]/40 px-3 text-xs font-medium text-[#c9a84c] transition-colors hover:bg-[#c9a84c]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60 motion-reduce:transition-none"
    >
      <FlaskConical aria-hidden className="h-4 w-4 shrink-0" />
      {handoff.label}
    </Link>
  );
};
