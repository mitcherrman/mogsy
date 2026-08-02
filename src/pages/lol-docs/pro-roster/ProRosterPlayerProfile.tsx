/**
 * /lol/docs/pro/players/:lpPage — one canonical player page.
 *
 * `lpPage` is the exact Leaguepedia page identifier. React Router hands it
 * back already percent-decoded, and it is passed straight through to the API
 * client, which re-encodes it verbatim. Nothing lowercases, trims or
 * slugifies it: "M1nG" and "M1ng" address different things and a 404 on one
 * of them is the correct answer, not a bug to paper over.
 */
import { useSearchParams, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Globe, Swords, User } from "lucide-react";
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
  getRosterPlayer,
  rosterQueryOptions,
  type RosterEligibility,
} from "@/lib/league-docs/roster-api";

export default function ProRosterPlayerProfile() {
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
    queryKey: ["pro-roster", "player", lpPage, eligibility],
    queryFn: ({ signal }) => getRosterPlayer(lpPage, eligibility, signal),
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
            : "Pro Player — Roster History — League Docs | Mogzy"
        }
        description={
          data
            ? `Roster history for ${data.display_name}${data.country ? ` (${data.country})` : ""}: team memberships with dates, roles, regions and source links, from Leaguepedia roster data.`
            : "Professional League of Legends player roster history from Leaguepedia roster data."
        }
        path={`/lol/docs/pro/players/${encodeURIComponent(lpPage)}`}
        noindex={notFound}
      />

      <RosterPage>
        <RosterBreadcrumb
          trail={[
            { label: "Rosters", to: "/lol/docs/pro/rosters" },
            { label: "Players", to: "/lol/docs/pro/players" },
            { label: data?.display_name ?? lpPage },
          ]}
        />

        {isPending ? (
          <RosterSkeleton label={`Loading player ${lpPage}`} />
        ) : notFound ? (
          <RosterNotFound kind="player" lpPage={lpPage}>
            <RosterAliasSuggestions lpPage={lpPage} />
          </RosterNotFound>
        ) : isError ? (
          <RosterError
            error={error}
            onRetry={() => refetch()}
            isRetrying={isRefetching}
            subject={`the player “${lpPage}”`}
          />
        ) : (
          <>
            <RosterHeader
              eyebrow="League Docs · Pro Rosters · Player"
              title={data.display_name}
              Icon={User}
              intro={
                <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {data.country ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5" aria-hidden /> {data.country}
                    </span>
                  ) : null}
                  {data.primary_role ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Swords className="h-3.5 w-3.5" aria-hidden /> {data.primary_role}
                    </span>
                  ) : null}
                  {/*
                    The heading uses the site's Cinzel display face, which
                    renders lowercase as small caps — so two ids differing only
                    in case would look alike there. The exact identifier is
                    therefore always repeated in monospace, where case reads
                    unambiguously.
                  */}
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wider">Page ID</span>
                    <code className="rounded border border-border bg-black/30 px-1.5 py-0.5 font-mono text-[11px] text-foreground/90">
                      {data.page}
                    </code>
                  </span>
                </span>
              }
              aside={
                data.aliases.length > 0 ? (
                  <div className="mt-3">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-[#c9a84c]">
                      Also known as
                    </div>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {data.aliases.map((alias) => (
                        <li
                          key={alias}
                          className="rounded border border-border bg-black/30 px-1.5 py-0.5 font-mono text-[11px] text-foreground/80"
                        >
                          {alias}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Aliases resolve to this page. A differently capitalised name is a different
                      player unless it is listed here.
                    </p>
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

            <section aria-label="Team memberships">
              <SectionHeading label="History" title="Team memberships" />
              {data.memberships.length === 0 ? (
                <RosterEmpty>
                  No public roster memberships are on record for this player
                  {eligibility === "A" && data.hidden_count > 0
                    ? " at the default eligibility level."
                    : "."}
                </RosterEmpty>
              ) : (
                <MembershipList memberships={data.memberships} perspective="player" />
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
