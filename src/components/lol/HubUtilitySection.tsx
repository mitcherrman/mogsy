/**
 * The Commons' two **pinned slips**: "Help improve Mogzy" beside a quieter
 * About / Contact notice.
 *
 * Third in the room's hierarchy and deliberately subordinate to both the
 * membership plaque and the noticeboard — smaller sheets, smaller type, no
 * gilt. They are the same parchment as the notice board's bill
 * (`.academy-commons-notice`), pinned the other way so the pair reads as two
 * slips someone tacked up rather than as a two-column card grid.
 *
 * Every action here is an EXISTING route — `/feedback` (the Feedback Center,
 * whose four doors are deep-linkable via `?intent=`), `/about` and `/contact`.
 * Nothing new was invented on the backend, and nothing links to a page that
 * does not exist: an audit on 2026-09-04 found no Help/FAQ route in the app, so
 * that item is simply absent rather than pointed at a placeholder. This pass
 * changed the surface only; the routes and actions are untouched.
 */
import { Link } from "react-router-dom";
import { Bug, Info, Mail, MessageSquarePlus } from "lucide-react";

type Utility = { to: string; label: string; Icon: typeof Info };

/** Quieter group. Help/FAQ is intentionally missing — no such route exists. */
const UTILITIES: Utility[] = [
  { to: "/about", label: "About Mogzy", Icon: Info },
  { to: "/contact", label: "Contact", Icon: Mail },
];

/** Shared slip chrome: parchment, one pin, a whisper of rotation. */
function Slip({
  children,
  className,
  ...rest
}: React.ComponentProps<"div"> & { className?: string }) {
  return (
    <div
      {...rest}
      className={`academy-commons-notice relative rounded-[2px] px-5 py-3.5 ${className ?? ""}`}
    >
      <span
        aria-hidden
        className="academy-commons-pin absolute left-1/2 top-2 h-2.5 w-2.5 -translate-x-1/2 rounded-full"
      />
      {children}
    </div>
  );
}

/** Ink-on-paper action, the parchment counterpart of a secondary button. */
const SLIP_ACTION =
  "inline-flex min-h-[44px] items-center gap-2 rounded-[2px] border border-[#7a6230]/45 bg-[#e6d9b6]/45 px-3.5 py-1.5 text-[13px] font-semibold text-[#2c2417] transition-colors hover:bg-[#f0e5c8]/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a6230]";

export default function HubUtilitySection() {
  return (
    <section
      data-testid="hub-utility-section"
      className="grid gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]"
    >
      {/* Feedback — the louder slip of the pair. */}
      <Slip
        data-testid="hub-feedback-block"
        aria-labelledby="hub-feedback-heading"
        className="[transform:rotate(0.3deg)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <span className="academy-commons-notice-soft text-[10px] font-bold uppercase tracking-[0.28em]">
              Feedback
            </span>
            <h2
              id="hub-feedback-heading"
              className="academy-commons-notice-ink text-[1.05rem] font-semibold leading-tight"
              style={{ fontFamily: '"Cinzel", "Trajan Pro", "EB Garamond", Georgia, serif' }}
            >
              Help improve Mogzy
            </h2>
            <p className="academy-commons-notice-soft mt-0.5 text-[12.5px] leading-snug">
              Found something wrong? Have an idea? Tell us.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/feedback" data-testid="hub-feedback-give" className={SLIP_ACTION}>
              <MessageSquarePlus className="h-3.5 w-3.5 text-[#7a6230]" aria-hidden />
              Give Feedback
            </Link>
            {/* Opens the Feedback Center's bug door directly. */}
            <Link to="/feedback?intent=bug" data-testid="hub-feedback-bug" className={SLIP_ACTION}>
              <Bug className="h-3.5 w-3.5 text-[#7a6230]" aria-hidden />
              Report a Bug
            </Link>
          </div>
        </div>
      </Slip>

      {/* About / Contact — the quiet slip. */}
      <Slip
        data-testid="hub-about-block"
        aria-labelledby="hub-about-heading"
        className="[transform:rotate(-0.28deg)]"
      >
        <h2
          id="hub-about-heading"
          className="academy-commons-notice-soft text-[10px] font-bold uppercase tracking-[0.28em]"
        >
          About the Academy
        </h2>
        <nav aria-label="About and help" className="mt-1.5 flex flex-wrap gap-2">
          {UTILITIES.map(({ to, label, Icon }) => (
            <Link key={to} to={to} className={SLIP_ACTION}>
              <Icon className="h-3.5 w-3.5 shrink-0 text-[#7a6230]" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
      </Slip>
    </section>
  );
}
