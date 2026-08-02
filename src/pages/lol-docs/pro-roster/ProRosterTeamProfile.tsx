/**
 * /lol/docs/pro/teams/:lpPage — one canonical team page.
 *
 * Same exact-identity contract as the player profile: the Leaguepedia page id
 * round-trips verbatim, and a miss is a 404 rather than a fuzzy match onto a
 * similarly named organisation.
 */
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Globe, Shield } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import DataSourcesNotice from "@/components/lol/DataSourcesNotice";
import EligibilityControl from "@/components/lol-docs/roster/EligibilityControl";
import MembershipList from "@/components/lol-docs/roster/MembershipList";
import RosterAliasSuggestions from "@/components/lol-docs/roster/RosterAliasSuggestions";
import {
  RosterBreadcrumb,
  RosterEmpty,
  RosterError,
  RosterHeader,
  RosterNotFound,
  RosterPage,
  RosterSkeleton,
  SectionHeading,
} from "@/components/lol-docs/roster/RosterShell";
import {
  ApiStatusError,
  getRosterTeam,
  rosterQueryOptions,
  type RosterEligibility,
} from "@/lib/league-docs/roster-api";

export default function ProRosterTeamProfile() {
  const { lpPage = "" } = useParams<{ lpPage: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const eligibility: RosterEligibility = searchParams.get("warnings") === "1" ? "AB" : "A";

  const setEligibility = (next: RosterEligibility) => {
    const params = new URLSearchParams(searchParams);
    if (next === "AB") params.set("warnings", "1");
    else params.delete("warnings");
    setSearchParams(params, { replace: true });
  };

  const { data, isPending, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["pro-roster", "team", lpPage, eligibility],
    queryFn: ({ signal }) => getRosterTeam(lpPage, eligibility, signal),
    enabled: lpPage.length > 0,
    staleTime: 5 * 60 * 1000,
    ...rosterQueryOptions,
  });

  const notFound = error instanceof ApiStatusError && error.status === 404;
  const levelBShown = (data?.memberships ?? []).filter((m) => m.eligibility_level === "B").length;

  return (
    <div>
      <SEOHead
        title={
          data
            ? `${data.display_name} — Pro Roster History — League Docs | Mogzy`
            : "Pro Team — Roster History — League Docs | Mogzy"
        }
        description={
          data
            ? `Roster history for ${data.display_name}${data.region ? ` (${data.region})` : ""}: players, roles, dates, and source links, from Leaguepedia roster data.`
            : "Professional League of Legends team roster history from Leaguepedia roster data."
        }
        path={`/lol/docs/pro/teams/${encodeURIComponent(lpPage)}`}
        noindex={notFound}
      />

      <RosterPage>
        <RosterBreadcrumb
          trail={[
            { label: "Rosters", to: "/lol/docs/pro/rosters" },
            { label: "Teams", to: "/lol/docs/pro/teams" },
            { label: data?.display_name ?? lpPage },
          ]}
        />

        {isPending ? (
          <RosterSkeleton label={`Loading team ${lpPage}`} />
        ) : notFound ? (
          <RosterNotFound kind="team" lpPage={lpPage}>
            <RosterAliasSuggestions lpPage={lpPage} />
          </RosterNotFound>
        ) : isError ? (
          <RosterError
            error={error}
            onRetry={() => refetch()}
            isRetrying={isRefetching}
            subject={`the team “${lpPage}”`}
          />
        ) : (
          <>
            <RosterHeader
              eyebrow="League Docs · Pro Rosters · Team"
              title={data.display_name}
              Icon={Shield}
              intro={
                <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {data.region ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5" aria-hidden /> {data.region}
                    </span>
                  ) : null}
                  {/* Exact identifier in monospace — see the player profile. */}
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wider">Page ID</span>
                    <code className="rounded border border-border bg-black/30 px-1.5 py-0.5 font-mono text-[11px] text-foreground/90">
                      {data.page}
                    </code>
                  </span>
                </span>
              }
              aside={
                data.aliases.length > 0 || data.historical_names.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {data.aliases.length > 0 ? (
                      <NameGroup heading="Abbreviations and aliases" names={data.aliases} />
                    ) : null}
                    {data.historical_names.length > 0 ? (
                      <NameGroup heading="Historical names" names={data.historical_names} />
                    ) : null}
                  </div>
                ) : null
              }
            />

            <EligibilityControl
              eligibility={eligibility}
              onChange={setEligibility}
              hiddenCount={data.hidden_count}
              levelBShown={levelBShown}
            />

            <section aria-label="Roster memberships">
              <SectionHeading label="History" title="Roster memberships" />
              {data.memberships.length === 0 ? (
                <RosterEmpty>
                  No public roster memberships are on record for this team
                  {eligibility === "A" && data.hidden_count > 0
                    ? " at the default eligibility level."
                    : "."}
                </RosterEmpty>
              ) : (
                <MembershipList memberships={data.memberships} perspective="team" />
              )}
            </section>
          </>
        )}

        <DataSourcesNotice
          leaguepedia
          freshness="Roster memberships come from Mogzy's most recent Leaguepedia identity import; each row links to the source page it was derived from."
        />
      </RosterPage>
    </div>
  );
}

function NameGroup({ heading, names }: { heading: string; names: string[] }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-[#c9a84c]">
        {heading}
      </div>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {names.map((name) => (
          <li
            key={name}
            className="rounded border border-border bg-black/30 px-1.5 py-0.5 font-mono text-[11px] text-foreground/80"
          >
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}
