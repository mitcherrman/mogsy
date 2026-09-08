/**
 * The Commons' **utility strip** — Feedback, Bug, About, Contact in one row.
 *
 * ### Revision 24 — why this is a strip and no longer two slips
 * These four destinations used to live on the two small painted parchments
 * below the noticeboard. Premium and Community now hold those sheets, and the
 * painting contains no fifth sheet: it has one gilt frame, one large board,
 * two small parchments and the panelling the legal rail is fixed to. So rather
 * than invent a surface the artwork does not have, the four links are cut into
 * the panelling directly above the legal rail, in the same inscription hand
 * the rail itself uses.
 *
 * That is a deliberate exception to the room's "every mount sits on a painted
 * surface" rule, and it is the smallest one available: four short links on
 * bare panelling, immediately above a real board carrying five more. It is
 * flagged in the handoff for browser review.
 *
 * **Nothing changed about where they go.** Every action is the same EXISTING
 * route it was — `/feedback` (the Feedback Center, whose four doors are
 * deep-linkable via `?intent=`), `/feedback?intent=bug`, `/about` and
 * `/contact`. Help/FAQ is still intentionally absent: an audit on 2026-09-04
 * found no such route in the app, and a link to a placeholder is worse than no
 * link.
 */
import { Link } from "react-router-dom";
import { Bug, Info, Mail, MessageSquarePlus } from "lucide-react";

type Utility = { to: string; label: string; Icon: typeof Info; testId?: string };

/**
 * Reading order is deliberate: the two feedback doors first — they are the
 * reason a reader looks down here — then the two informational ones.
 */
const UTILITIES: Utility[] = [
  { to: "/feedback", label: "Give Feedback", Icon: MessageSquarePlus, testId: "hub-feedback-give" },
  // Opens the Feedback Center's bug door directly. The query parameter IS the
  // feature — see the `?intent=` reader in Feedback.tsx.
  { to: "/feedback?intent=bug", label: "Report a Bug", Icon: Bug, testId: "hub-feedback-bug" },
  { to: "/about", label: "About Mogzy", Icon: Info },
  { to: "/contact", label: "Contact", Icon: Mail },
];

export default function HubUtilitySection() {
  return (
    <section
      data-testid="hub-utility-section"
      className="academy-commons-utilstrip flex w-full items-center justify-center"
    >
      <nav
        aria-label="Feedback and information"
        className="academy-commons-utilstrip-row flex flex-wrap items-center justify-center gap-x-2 gap-y-2"
      >
        {UTILITIES.map(({ to, label, Icon, testId }) => (
          <Link
            key={to}
            to={to}
            data-testid={testId}
            className="academy-commons-utilstrip-link academy-commons-inscription-link inline-flex min-h-[44px] items-center gap-2 rounded-[2px] px-3 text-[11px] font-bold uppercase tracking-[0.18em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6cd93]/70"
          >
            <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            {label}
          </Link>
        ))}
      </nav>
    </section>
  );
}
