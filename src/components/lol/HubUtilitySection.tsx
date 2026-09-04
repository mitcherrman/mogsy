/**
 * The hub's lower utility band: "Help improve Mogzy" beside a quieter
 * About / Help / Contact group.
 *
 * Every action here is an EXISTING route — `/feedback` (the Feedback Center,
 * whose four doors are deep-linkable via `?intent=`), `/about` and `/contact`.
 * Nothing new was invented on the backend, and nothing links to a page that
 * does not exist: an audit on 2026-09-04 found no Help/FAQ route in the app, so
 * that item is simply absent rather than pointed at a placeholder.
 */
import { Link } from "react-router-dom";
import { Bug, Info, Mail, MessageSquarePlus, ArrowRight } from "lucide-react";

type Utility = { to: string; label: string; Icon: typeof Info };

/** Quieter group. Help/FAQ is intentionally missing — no such route exists. */
const UTILITIES: Utility[] = [
  { to: "/about", label: "About Mogzy", Icon: Info },
  { to: "/contact", label: "Contact", Icon: Mail },
];

export default function HubUtilitySection() {
  return (
    <section
      data-testid="hub-utility-section"
      className="grid gap-4 md:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]"
    >
      {/* Feedback — the loud half of this band */}
      <div
        data-testid="hub-feedback-block"
        aria-labelledby="hub-feedback-heading"
        className="rounded-lg border border-border/40 bg-[#080d18]/70 px-5 py-6 sm:px-6"
      >
        <div className="flex items-center gap-2 text-[#c9a84c]">
          <MessageSquarePlus className="h-4 w-4" aria-hidden />
          <span className="text-[10px] font-bold uppercase tracking-widest">Feedback</span>
        </div>
        <h2 id="hub-feedback-heading" className="mt-1.5 text-lg font-bold text-foreground">
          Help improve Mogzy
        </h2>
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
          Found something wrong? Have an idea? Tell us.
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Link
            to="/feedback"
            data-testid="hub-feedback-give"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-[#c9a84c]/40 bg-[#c9a84c]/10 px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-[#c9a84c]/20"
          >
            <MessageSquarePlus className="h-4 w-4 text-[#c9a84c]" aria-hidden />
            Give Feedback
          </Link>
          {/* Opens the Feedback Center's bug door directly. */}
          <Link
            to="/feedback?intent=bug"
            data-testid="hub-feedback-bug"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-border/50 px-4 py-2 text-sm font-medium text-foreground/85 transition-colors hover:border-[#c9a84c]/40 hover:text-foreground"
          >
            <Bug className="h-4 w-4" aria-hidden />
            Report a Bug
          </Link>
        </div>
      </div>

      {/* About / Contact — the quiet half */}
      <div
        data-testid="hub-about-block"
        aria-labelledby="hub-about-heading"
        className="rounded-lg border border-border/40 bg-[#080d18]/70 px-5 py-6 sm:px-6"
      >
        <h2
          id="hub-about-heading"
          className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
        >
          About the Academy
        </h2>
        <nav aria-label="About and help" className="mt-2 flex flex-col">
          {UTILITIES.map(({ to, label, Icon }) => (
            <Link
              key={to}
              to={to}
              className="group inline-flex min-h-[44px] items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {label}
              <ArrowRight
                className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60"
                aria-hidden
              />
            </Link>
          ))}
        </nav>
      </div>
    </section>
  );
}
