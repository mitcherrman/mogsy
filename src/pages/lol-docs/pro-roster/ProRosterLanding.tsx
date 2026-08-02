/**
 * /lol/docs/pro/rosters — entry point for the public roster wiki.
 *
 * This is documentation-first: it says what roster data exists, states plainly
 * what is NOT here yet (year-by-year champion game data is still being
 * promoted), shows the backend's own coverage totals and disclosure text, and
 * routes into the player and team directories.
 */
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarRange,
  Database,
  Info,
  Shield,
  Users,
  UsersRound,
} from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import DataSourcesNotice from "@/components/lol/DataSourcesNotice";
import RosterSearch from "@/components/lol-docs/roster/RosterSearch";
import {
  GOLD,
  RosterBreadcrumb,
  RosterError,
  RosterHeader,
  RosterPage,
  RosterSkeleton,
  SectionHeading,
} from "@/components/lol-docs/roster/RosterShell";
import { getRosterCoverage, rosterQueryOptions } from "@/lib/league-docs/roster-api";

const nf = new Intl.NumberFormat("en-US");

export default function ProRosterLanding() {
  const { data, isPending, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["pro-roster", "coverage"],
    queryFn: ({ signal }) => getRosterCoverage(signal),
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    ...rosterQueryOptions,
  });

  const years = data?.source_years ?? [];
  const yearSpan =
    years.length > 0 ? `${Math.min(...years)}–${Math.max(...years)}` : null;

  return (
    <div>
      <SEOHead
        title="Pro Rosters — Player and Team History — League Docs | Mogzy"
        description="Browse professional League of Legends roster history: canonical players, teams, aliases, and dated team memberships sourced from Leaguepedia, with every record's eligibility and source shown."
        path="/lol/docs/pro/rosters"
        keywords="league of legends pro rosters, lol esports player history, lol team roster history, leaguepedia rosters"
      />

      <RosterPage>
        <RosterBreadcrumb trail={[{ label: "Rosters" }]} />

        <RosterHeader
          eyebrow="League Docs · Pro Data"
          title="Pro Rosters"
          Icon={UsersRound}
          intro={
            <>
              Who played for which team, and when. This is roster identity data — canonical player
              and team pages, their aliases, and dated memberships — imported from Leaguepedia and
              published with the source link and eligibility level for every record.
            </>
          }
          aside={
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                asChild
                size="sm"
                variant="outline"
                className="border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/10"
              >
                <Link to="/lol/docs/pro/players">Browse players</Link>
              </Button>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/10"
              >
                <Link to="/lol/docs/pro/teams">Browse teams</Link>
              </Button>
            </div>
          }
        />

        <section aria-label="Roster search">
          <SectionHeading label="Find" title="Search players and teams" />
          <RosterSearch />
        </section>

        <section aria-label="Roster coverage">
          <SectionHeading label="Coverage" title="What's in the roster dataset" />
          {isPending ? (
            <RosterSkeleton label="Loading roster coverage" rows={3} />
          ) : isError ? (
            <RosterError
              error={error}
              onRetry={() => refetch()}
              isRetrying={isRefetching}
              subject="roster coverage"
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <CoverageCard
                  label="Players"
                  value={nf.format(data.total_players)}
                  Icon={Users}
                />
                <CoverageCard label="Teams" value={nf.format(data.total_teams)} Icon={Shield} />
                <CoverageCard
                  label="Public memberships"
                  value={nf.format(data.public_default_count)}
                  Icon={Database}
                />
                <CoverageCard
                  label="Source years"
                  value={yearSpan ?? "—"}
                  Icon={CalendarRange}
                />
              </div>

              <div className="mt-3 rounded-xl border border-border bg-card/60 p-4 space-y-3">
                <div className="flex items-start gap-2.5">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" style={{ color: GOLD }} aria-hidden />
                  <p className="text-xs text-muted-foreground">{data.disclosure}</p>
                </div>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
                  <Figure
                    label="Level A — public by default"
                    value={nf.format(data.membership_level_a)}
                  />
                  <Figure
                    label="Level B — shown on request, with warnings"
                    value={nf.format(data.membership_level_b)}
                  />
                  <Figure
                    label="Held for internal review (not published)"
                    value={nf.format(data.hidden_review_count)}
                  />
                  <Figure
                    label="Unresolved source observations"
                    value={nf.format(data.unresolved_observations)}
                  />
                </dl>
              </div>
            </>
          )}
        </section>

        <section aria-label="Directories">
          <SectionHeading label="Browse" title="Directories" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <DirectoryCard
              to="/lol/docs/pro/players"
              Icon={Users}
              title="Players"
              body="Every canonical player page with at least one public membership. Search by name or alias, then open a profile for that player's full team history."
            />
            <DirectoryCard
              to="/lol/docs/pro/teams"
              Icon={Shield}
              title="Teams"
              body="Canonical team pages with their abbreviations, historical names, and region. Each team page lists the players who have appeared on its roster."
            />
          </div>
        </section>

        <section aria-label="How to read this data">
          <SectionHeading label="Trust" title="How to read this data" />
          <div className="rounded-xl border border-border bg-card/60 p-5 space-y-3 text-xs text-muted-foreground">
            <p>
              <span className="font-semibold text-foreground/80">Identity is exact.</span> Pages are
              addressed by their exact Leaguepedia identifier, capitalisation included. Two players
              whose names differ only in case are two different players here, and nothing in this
              wiki merges them.
            </p>
            <p>
              <span className="font-semibold text-foreground/80">Eligibility is the source's
              call.</span> Level A records are shown by default. Level B records — benign overlaps
              such as an academy and main roster in the same window — appear only when you turn them
              on, and always carry the warning code that flagged them. Records held for internal
              review are not published at all.
            </p>
            <p>
              <span className="font-semibold text-foreground/80">Roster history is not match
              history.</span> These pages cover who was on which roster and when. Year-by-year
              champion, pick and ban data lives on the{" "}
              <Link to="/lol/docs/pro" className="text-primary hover:underline">
                Pro Data coverage pages
              </Link>
              , and historical years there are still being imported — nothing here should be read as
              a claim that every past season is fully loaded.
            </p>
          </div>
        </section>

        <DataSourcesNotice
          leaguepedia
          freshness="Roster records reflect Mogzy's most recent Leaguepedia identity import; counts and eligibility levels above come from the import audit itself."
        />
      </RosterPage>
    </div>
  );
}

function CoverageCard({
  label,
  value,
  Icon,
}: {
  label: string;
  value: string;
  Icon: React.ElementType;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" style={{ color: GOLD }} aria-hidden />
        {label}
      </div>
      <div className="mt-1.5 text-xl font-bold text-foreground">{value}</div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border/40 pb-1">
      <dt>{label}</dt>
      <dd className="font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function DirectoryCard({
  to,
  Icon,
  title,
  body,
}: {
  to: string;
  Icon: React.ElementType;
  title: string;
  body: string;
}) {
  return (
    <Link
      to={to}
      className="group rounded-xl border border-border bg-card/60 p-5 transition-colors hover:border-[#c9a84c]/40 hover:bg-[#c9a84c]/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60"
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" style={{ color: GOLD }} aria-hidden />
        <h3 className="text-sm font-bold text-foreground group-hover:text-[#c9a84c]">{title}</h3>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{body}</p>
    </Link>
  );
}
