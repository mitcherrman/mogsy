/**
 * Historical roster memberships, rendered as a compact table on desktop and
 * readable cards on mobile (the source rows are too wide for a phone table).
 *
 * Only fields the backend actually returned are rendered — no invented flags,
 * avatars, or stats. Level B rows carry an amber marker and their backend
 * warning code so they can never be mistaken for default Level A data.
 */
import { Link } from "react-router-dom";
import { AlertTriangle, ExternalLink } from "lucide-react";
import {
  playerRoute,
  teamRoute,
  type RosterMembership,
} from "@/lib/league-docs/roster-api";
import {
  formatMembershipSpan,
  sortMemberships,
  splitRoles,
  warningLabel,
} from "@/lib/league-docs/roster-display";

/** Which side of the membership is the *other* party on this page. */
type Perspective = "player" | "team";

export default function MembershipList({
  memberships,
  perspective,
}: {
  memberships: RosterMembership[];
  /** "player" on a player page (shows teams); "team" on a team page (shows players). */
  perspective: Perspective;
}) {
  const rows = sortMemberships(memberships);
  const counterpartHeading = perspective === "player" ? "Team" : "Player";

  return (
    <>
      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-card/60">
        <table className="w-full text-xs">
          <caption className="sr-only">
            Historical roster memberships, oldest first. Rows marked Level B carry a data-quality
            warning code.
          </caption>
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <th scope="col" className="px-3 py-2.5 font-bold">{counterpartHeading}</th>
              <th scope="col" className="px-3 py-2.5 font-bold">Role</th>
              <th scope="col" className="px-3 py-2.5 font-bold">Dates</th>
              <th scope="col" className="px-3 py-2.5 font-bold">Region</th>
              <th scope="col" className="px-3 py-2.5 font-bold">Status</th>
              <th scope="col" className="px-3 py-2.5 font-bold">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr
                key={m.membership_key}
                data-eligibility={m.eligibility_level}
                className={`border-b border-border/60 last:border-0 transition-colors ${
                  m.eligibility_level === "B"
                    ? "bg-amber-500/5 hover:bg-amber-500/10"
                    : "hover:bg-[#c9a84c]/5"
                }`}
              >
                <td className="px-3 py-2.5">
                  <CounterpartLink membership={m} perspective={perspective} />
                </td>
                <td className="px-3 py-2.5">
                  <RoleBadges role={m.role} />
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">
                  {formatMembershipSpan(m)}
                </td>
                <td className="px-3 py-2.5">{m.region ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <StatusCell membership={m} />
                </td>
                <td className="px-3 py-2.5">
                  <SourceLink url={m.source_url} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <ul className="md:hidden space-y-3">
        {rows.map((m) => (
          <li
            key={m.membership_key}
            data-eligibility={m.eligibility_level}
            className={`rounded-xl border p-4 ${
              m.eligibility_level === "B"
                ? "border-amber-500/40 bg-amber-500/5"
                : "border-border bg-card/60"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <CounterpartLink membership={m} perspective={perspective} />
              <StatusCell membership={m} />
            </div>
            <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <CardStat label="Role" value={m.role ?? "—"} />
              <CardStat label="Region" value={m.region ?? "—"} />
              <CardStat label="Dates" value={formatMembershipSpan(m)} wide />
            </dl>
            <div className="mt-2">
              <SourceLink url={m.source_url} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function CounterpartLink({
  membership,
  perspective,
}: {
  membership: RosterMembership;
  perspective: Perspective;
}) {
  const isTeamTarget = perspective === "player";
  const page = isTeamTarget ? membership.team_page : membership.player_page;
  const name = isTeamTarget ? membership.team_display_name : membership.player_display_name;
  const to = isTeamTarget ? teamRoute(page) : playerRoute(page);
  return (
    <Link
      to={to}
      className="font-bold text-foreground hover:text-[#c9a84c] underline decoration-[#c9a84c]/30 underline-offset-2 transition-colors break-words"
    >
      {name}
    </Link>
  );
}

function RoleBadges({ role }: { role: string | null }) {
  const roles = splitRoles(role);
  if (roles.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <span
          key={r}
          className="rounded border border-teal-500/30 bg-teal-500/5 px-1.5 py-0.5 text-[10px] font-semibold text-teal-300"
        >
          {r}
        </span>
      ))}
    </span>
  );
}

function StatusCell({ membership }: { membership: RosterMembership }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {membership.is_active ? (
        <span className="rounded border border-teal-500/40 bg-teal-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-teal-300">
          Current
        </span>
      ) : null}
      {membership.eligibility_level === "B" ? (
        <span
          className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200"
          title={
            membership.warning_code
              ? `Level B — ${warningLabel(membership.warning_code)} (${membership.warning_code})`
              : "Level B — flagged historical record"
          }
        >
          <AlertTriangle className="h-3 w-3" aria-hidden />
          Level B
          {membership.warning_code ? (
            <span className="font-mono font-normal">{membership.warning_code}</span>
          ) : null}
        </span>
      ) : null}
      {membership.reason_codes
        .filter((code) => code !== membership.warning_code)
        .map((code) => (
          <span
            key={code}
            className="rounded border border-border bg-card/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
            title={warningLabel(code)}
          >
            {code}
          </span>
        ))}
      {!membership.is_active && membership.eligibility_level === "A" && membership.reason_codes.length === 0 ? (
        <span className="text-[11px] text-muted-foreground">Former</span>
      ) : null}
    </span>
  );
}

function SourceLink({ url }: { url: string | null }) {
  if (!url) return <span className="text-[11px] text-muted-foreground">No source recorded</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
    >
      Source <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  );
}

function CardStat({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-2 border-b border-border/40 pb-1 ${wide ? "col-span-2" : ""}`}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold text-foreground text-right break-words">{value}</dd>
    </div>
  );
}
