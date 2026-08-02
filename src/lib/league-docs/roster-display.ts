/**
 * Presentation helpers for the public Pro roster wiki.
 *
 * Everything here is formatting only. No eligibility logic lives in the
 * frontend: the backend decides which rows are public, and these helpers just
 * label what it returned. Unknown warning codes are shown verbatim rather than
 * hidden or guessed at.
 */
import type { RosterDatePrecision, RosterMembership } from "@/lib/league-docs/roster-api";

/**
 * Readable expansions of the warning codes the backend currently emits. These
 * are literal readings of the code, not added meaning — and the raw code is
 * always displayed next to the label so the source value stays visible.
 */
const WARNING_LABELS: Record<string, string> = {
  academy_main_overlap: "Academy / main roster overlap",
  event_roster_overlap: "Event roster overlap",
  sister_team_overlap: "Sister team overlap",
  same_day_transition: "Same-day transition",
};

/** Human label for a backend warning/reason code, falling back to the code itself. */
export function warningLabel(code: string): string {
  return WARNING_LABELS[code] ?? code;
}

/**
 * Format one endpoint of a membership span. "open" precision means the record
 * has no end — render it as ongoing rather than inventing a date.
 */
export function formatRosterDate(
  date: string | null,
  precision: RosterDatePrecision | null,
): string {
  if (precision === "open") return "present";
  if (!date) return "unknown";
  if (precision === "year") return date.slice(0, 4);
  if (precision === "month") return date.slice(0, 7);
  return date;
}

/** "2017-11-22 → 2018-07-01" / "2020-11-17 → present". */
export function formatMembershipSpan(membership: RosterMembership): string {
  const start = formatRosterDate(membership.start_date, membership.start_precision);
  const end = formatRosterDate(membership.end_date, membership.end_precision);
  return `${start} → ${end}`;
}

/** Split the source's "Jungle;Mid" multi-role notation into discrete roles. */
export function splitRoles(role: string | null): string[] {
  if (!role) return [];
  return role
    .split(";")
    .map((r) => r.trim())
    .filter(Boolean);
}

/**
 * Sort memberships oldest-first, with undated rows last. Deliberately stable
 * on the membership key so repeated renders never reshuffle equal rows.
 */
export function sortMemberships(memberships: RosterMembership[]): RosterMembership[] {
  return memberships.slice().sort((a, b) => {
    if (a.start_date && b.start_date && a.start_date !== b.start_date) {
      return a.start_date < b.start_date ? -1 : 1;
    }
    if (a.start_date && !b.start_date) return -1;
    if (!a.start_date && b.start_date) return 1;
    return a.membership_key.localeCompare(b.membership_key);
  });
}

/** Message for rows the backend withheld at the current eligibility selection. */
export function hiddenRecordsMessage(hiddenCount: number, showingWarnings: boolean): string | null {
  if (hiddenCount <= 0) return null;
  const one = hiddenCount === 1;
  const rows = one ? "record" : "records";
  return showingWarnings
    ? `${hiddenCount} ${rows} held for internal review and not published.`
    : `${hiddenCount} further ${rows} ${one ? "is" : "are"} not shown by default — ${
        one
          ? "it either carries a data-quality warning or is held for internal review."
          : "some carry data-quality warnings, and some are held for internal review."
      }`;
}
