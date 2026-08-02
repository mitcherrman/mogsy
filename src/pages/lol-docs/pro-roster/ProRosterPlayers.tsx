/**
 * /lol/docs/pro/players — paginated directory of canonical player pages.
 *
 * Search and page live in the URL (?q= / ?page=) so a result set is
 * shareable and the back button behaves. Filtering happens server-side via the
 * directory endpoint's `query` parameter; the term is debounced and each
 * request carries an AbortSignal, and React Query keys on the debounced term
 * so a slow earlier response can never overwrite a newer one.
 *
 * Only fields the API returns are shown: canonical page id, display name,
 * country, primary role, membership count. No flags, avatars, or stats are
 * fabricated.
 */
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, Users } from "lucide-react";
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
  getRosterPlayers,
  playerRoute,
  ROSTER_PAGE_SIZE,
  rosterQueryOptions,
  type RosterPlayerSummary,
} from "@/lib/league-docs/roster-api";

const nf = new Intl.NumberFormat("en-US");

export default function ProRosterPlayers() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const urlPage = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  const [term, setTerm] = useState(urlQuery);
  const debounced = useDebouncedValue(term.trim());

  // Mirror the debounced term back into the URL and reset to page 1 when it
  // changes, so a shared link reproduces exactly what the searcher saw.
  useEffect(() => {
    if (debounced === urlQuery) return;
    const next = new URLSearchParams(searchParams);
    if (debounced) next.set("q", debounced);
    else next.delete("q");
    next.delete("page");
    setSearchParams(next, { replace: true });
    // searchParams/setSearchParams are stable enough here; the debounced term drives this.
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
    queryKey: ["pro-roster", "players", debounced, urlPage],
    queryFn: ({ signal }) =>
      getRosterPlayers(
        { page: urlPage, pageSize: ROSTER_PAGE_SIZE, query: debounced || undefined },
        signal,
      ),
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
    ...rosterQueryOptions,
  });

  const players = data?.players ?? [];

  return (
    <div>
      <SEOHead
        title="Pro Players — Roster Directory — League Docs | Mogzy"
        description="Browse professional League of Legends players by canonical Leaguepedia page: display name, country, primary role, and how many team memberships are on record. Search by name or alias."
        path="/lol/docs/pro/players"
        keywords="lol pro players list, league of legends esports players, pro player roster history"
      />

      <RosterPage>
        <RosterBreadcrumb
          trail={[{ label: "Rosters", to: "/lol/docs/pro/rosters" }, { label: "Players" }]}
        />

        <RosterHeader
          eyebrow="League Docs · Pro Rosters"
          title="Players"
          Icon={Users}
          intro={
            <>
              Every canonical player page with at least one public roster membership. Names are
              matched exactly — capitalisation is part of a player's identity here, and two
              similarly spelled names are never merged.
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
            placeholder="Search players by name or alias…"
            aria-label="Search pro players"
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
          <RosterSkeleton label="Loading players" />
        ) : isError ? (
          <RosterError
            error={error}
            onRetry={() => refetch()}
            isRetrying={isRefetching}
            subject="the player directory"
          />
        ) : players.length === 0 ? (
          <RosterEmpty>
            {debounced
              ? `No players match “${debounced}”. Try a shorter term, or search aliases from the roster home page.`
              : "No player records are available yet."}
          </RosterEmpty>
        ) : (
          <>
            <PlayerTable players={players} />
            <RosterPager
              pagination={data.pagination}
              onPageChange={setPage}
              label="players"
            />
          </>
        )}

        <DataSourcesNotice
          leaguepedia
          freshness="Player identities and membership counts come from Mogzy's most recent Leaguepedia roster import."
        />
      </RosterPage>
    </div>
  );
}

function PlayerTable({ players }: { players: RosterPlayerSummary[] }) {
  return (
    <>
      {/* Desktop */}
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card/60 md:block">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <th scope="col" className="px-3 py-2.5 font-bold">Player</th>
              <th scope="col" className="px-3 py-2.5 font-bold">Country</th>
              <th scope="col" className="px-3 py-2.5 font-bold">Primary role</th>
              <th scope="col" className="px-3 py-2.5 text-right font-bold">Memberships</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr
                key={p.page}
                className="border-b border-border/60 transition-colors last:border-0 hover:bg-[#c9a84c]/5"
              >
                <td className="px-3 py-2.5">
                  <Link
                    to={playerRoute(p.page)}
                    className="font-bold text-foreground underline decoration-[#c9a84c]/30 underline-offset-2 transition-colors hover:text-[#c9a84c]"
                  >
                    {p.display_name}
                  </Link>
                  {p.display_name !== p.page ? (
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                      {p.page}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5">{p.country ?? "—"}</td>
                <td className="px-3 py-2.5">{p.primary_role ?? "—"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {nf.format(p.membership_count)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <ul className="space-y-3 md:hidden">
        {players.map((p) => (
          <li key={p.page}>
            <Link
              to={playerRoute(p.page)}
              className="block rounded-xl border border-border bg-card/60 p-4 transition-colors hover:border-[#c9a84c]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60"
            >
              <div className="text-sm font-bold text-foreground break-words">{p.display_name}</div>
              {p.display_name !== p.page ? (
                <div className="font-mono text-[10px] text-muted-foreground break-words">
                  {p.page}
                </div>
              ) : null}
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {p.country ? <span>{p.country}</span> : null}
                {p.primary_role ? <span>{p.primary_role}</span> : null}
                <span>
                  {nf.format(p.membership_count)}{" "}
                  {p.membership_count === 1 ? "membership" : "memberships"}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
