/**
 * Shown on a roster 404: what the search index says about the identifier the
 * reader actually asked for.
 *
 * This is deliberately a *suggestion list*, never a redirect and never a
 * merge. "M1nG" has no page of its own — it is an alias of the Thai player
 * "Flure" — while "M1ng" is a separate Taiwanese player with its own page.
 * Auto-resolving the 404 would quietly erase that distinction, so instead the
 * reader is told what matched and chooses for themselves.
 */
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { playerRoute, searchRoster, teamRoute } from "@/lib/league-docs/roster-api";

export default function RosterAliasSuggestions({ lpPage }: { lpPage: string }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["pro-roster", "search", lpPage],
    queryFn: ({ signal }) => searchRoster(lpPage, signal),
    enabled: lpPage.trim().length > 0,
    staleTime: 60 * 1000,
    retry: false,

  });

  if (isPending || isError) return null;
  const results = data?.results ?? [];
  if (results.length === 0) return null;

  return (
    <div className="mx-auto mt-4 max-w-xl rounded-lg border border-border bg-card/60 p-3 text-left">
      <p className="text-xs text-muted-foreground">
        Searching for “<span className="font-mono text-foreground/80">{lpPage}</span>” matched these
        separate pages. They are distinct records — pick the one you meant.
      </p>
      <ul className="mt-2 space-y-1">
        {results.slice(0, 8).map((r) => (
          <li key={`${r.type}:${r.page}`}>
            <Link
              to={r.type === "player" ? playerRoute(r.page) : teamRoute(r.page)}
              className="block rounded px-2 py-1 text-sm transition-colors hover:bg-[#c9a84c]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60"
            >
              <span className="font-semibold text-foreground">{r.display_name}</span>{" "}
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {r.type}
              </span>
              {r.matched_alias ? (
                <span className="block text-[11px] text-muted-foreground">
                  matched via alias{" "}
                  <span className="font-mono text-foreground/80">{r.matched_alias}</span>
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
