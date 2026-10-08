import { FlaskConical } from "lucide-react";
import { Link } from "react-router-dom";
import type { CombatLabHandoff } from "@/lib/patch-hub-combat-lab/handoff";

/** The part of the label a sighted reader sees; the card heading already names the champion. */
const VISIBLE_LABEL = "Combat Lab";

/**
 * Entity-level "Open {Champion} in Combat Lab" (PH4-C). A plain client-side
 * link (given an already-eligible handoff), so browser Back returns to this report position. It performs no
 * request and carries no patch information; see `handoff.ts`.
 *
 * A quiet secondary action (PHSR4), not a bordered gold button: gold belongs
 * to Riot's new values, and this link only needs to be findable. It shows
 * "Combat Lab"; the accessible name and text content stay the full
 * `handoff.label`, which contains the visible words (label in name).
 */
export const CombatLabHandoffLink = ({ handoff }: { handoff: CombatLabHandoff }) => {
  const lead = handoff.label.endsWith(VISIBLE_LABEL) ? handoff.label.slice(0, -VISIBLE_LABEL.length) : null;
  return (
    <Link
      to={handoff.href}
      aria-label={handoff.label}
      data-testid="patch-report-combat-lab"
      className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60 motion-reduce:transition-none"
    >
      <FlaskConical aria-hidden className="h-4 w-4 shrink-0" />
      {lead === null ? (
        handoff.label
      ) : (
        <>
          <span className="sr-only">{lead}</span>
          {VISIBLE_LABEL}
        </>
      )}
    </Link>
  );
};
