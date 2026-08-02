/**
 * /lol/docs/pro/teams — paginated directory of canonical team pages.
 *
 * Same contract as the player directory: server-side `query` filtering,
 * debounced input, abortable requests keyed on the debounced term, and page
 * state in the URL.
 */
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, Shield } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Input } from "@/components/ui/input";
import DataSourcesNotice from "@/components/lol/DataSourcesNotice";
import RosterPager from "@/components/lol-docs/roster/RosterPager";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  RosterBreadcrumb,
  RosterEmpty,
  RosterError,
  RosterHeader,
  RosterPage,
  RosterSkeleton,
} from "@/components/lol-docs/roster/RosterShell";
import {
  getRosterTeams,
  ROSTER_PAGE_SIZE,
  rosterQueryOptions,
  teamRoute,
  type RosterTeamSummary,
} from "@/lib/league-docs/roster-api";

const nf = new Intl.NumberFormat("en-US");

export default function ProRosterTeams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const urlPage = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  const [term, setTerm] = useState(urlQuery);
  const debounced = useDebouncedValue(term.trim());

  useEffect(() => {
    if (debounced === urlQuery) return;
    const next = new URLSearchParams(searchParams);
    if (debounced) next.set("q", debounced);
    else next.delete("q");
    next.delete("page");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const setPage = (page: number) => {
    const next = new URLSearchParams(searchParams);
    if (page <= 1) next.delete("page");
    else next.set("page", String(page));
    setSearchParams(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const { data, isPending, isFetching, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["pro-roster", "teams", debounced, urlPage],
    queryFn: ({ signal }) =>
      getRosterTeams(
        { page: urlPage, pageSize: ROSTER_PAGE_SIZE, query: debounced || undefined },
        signal,
      ),
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
    ...rosterQueryOptions,
  });

  const teams = data?.teams ?? [];

  return (
    <div>
      <SEOHead
        title="Pro Teams — Roster Directory — League Docs | Mogzy"
        description="Browse professional League of Legends teams by canonical Leaguepedia page: display name, region, and how many roster memberships are on record. Open a team for its full player history."
        path="/lol/docs/pro/teams"
        keywords="lol pro teams list, league of legends esports teams, team roster history"
      />

      <RosterPage>
        <RosterBreadcrumb
          trail={[{ label: "Rosters", to: "/lol/docs/pro/rosters" }, { label: "Teams" }]}
        />

        <RosterHeader
          eyebrow="League Docs · Pro Rosters"
          title="Teams"
          Icon={Shield}
          intro={
            <>
              Canonical team pages with at least one public roster membership. Organisations that
              renamed keep their historical names on the team page rather than being folded into one
              another.
            </>
          }
        />

        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search teams by name or abbreviation…"
            aria-label="Search pro teams"
            className="bg-card/60 pl-9 pr-9"
          />
          {isFetching ? (
            <Loader2
              className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
              aria-hidden
            />
          ) : null}
        </div>

        {isPending ? (
          <RosterSkeleton label="Loading teams" />
        ) : isError ? (
          <RosterError
            error={error}
            onRetry={() => refetch()}
            isRetrying={isRefetching}
            subject="the team directory"
          />
        ) : teams.length === 0 ? (
          <RosterEmpty>
            {debounced
              ? `No teams match “${debounced}”. Try a shorter term, or search abbreviations from the roster home page.`
              : "No team records are available yet."}
          </RosterEmpty>
        ) : (
          <>
            <TeamTable teams={teams} />
            <RosterPager pagination={data.pagination} onPageChange={setPage} label="teams" />
          </>
        )}

        <DataSourcesNotice
          leaguepedia
          freshness="Team identities and membership counts come from Mogzy's most recent Leaguepedia roster import."
        />
      </RosterPage>
    </div>
  );
}

function TeamTable({ teams }: { teams: RosterTeamSummary[] }) {
  return (
    <>
      {/* Desktop */}
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card/60 md:block">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <th scope="col" className="px-3 py-2.5 font-bold">Team</th>
              <th scope="col" className="px-3 py-2.5 font-bold">Region</th>
              <th scope="col" className="px-3 py-2.5 text-right font-bold">Memberships</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr
                key={t.page}
                className="border-b border-border/60 transition-colors last:border-0 hover:bg-[#c9a84c]/5"
              >
                <td className="px-3 py-2.5">
                  <Link
                    to={teamRoute(t.page)}
                    className="font-bold text-foreground underline decoration-[#c9a84c]/30 underline-offset-2 transition-colors hover:text-[#c9a84c]"
                  >
                    {t.display_name}
                  </Link>
                  {t.display_name !== t.page ? (
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                      {t.page}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5">{t.region ?? "—"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {nf.format(t.membership_count)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <ul className="space-y-3 md:hidden">
        {teams.map((t) => (
          <li key={t.page}>
            <Link
              to={teamRoute(t.page)}
              className="block rounded-xl border border-border bg-card/60 p-4 transition-colors hover:border-[#c9a84c]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60"
            >
              <div className="text-sm font-bold text-foreground break-words">{t.display_name}</div>
              {t.display_name !== t.page ? (
                <div className="font-mono text-[10px] text-muted-foreground break-words">
                  {t.page}
                </div>
              ) : null}
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {t.region ? <span>{t.region}</span> : null}
                <span>
                  {nf.format(t.membership_count)}{" "}
                  {t.membership_count === 1 ? "membership" : "memberships"}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
