/**
 * Unified player/team search over /api/docs/pro/roster/search.
 *
 * Staleness is handled by React Query keyed on the debounced term, plus an
 * AbortSignal per request: a slower earlier response is cancelled and, even if
 * it lands, it belongs to a different query key and can never overwrite the
 * newer term's results.
 *
 * Players and teams are rendered in separate labelled groups. The backend
 * returns each result's own canonical page identifier, and this component
 * links to that identifier verbatim — an alias match shows the alias it hit
 * ("matched via M1nG") while still pointing at the canonical page ("Flure").
 * Similar spellings are never collapsed into one row.
 */
import { useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, Shield, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  playerRoute,
  rosterQueryOptions,
  searchRoster,
  teamRoute,
  type RosterSearchResult,
} from "@/lib/league-docs/roster-api";
import { RosterError } from "@/components/lol-docs/roster/RosterShell";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

export default function RosterSearch({
  autoFocus = false,
  placeholder = "Search players and teams…",
  label = "Search pro players and teams",
}: {
  autoFocus?: boolean;
  placeholder?: string;
  label?: string;
}) {
  const [term, setTerm] = useState("");
  const debounced = useDebouncedValue(term.trim());
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const enabled = debounced.length > 0;
  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["pro-roster", "search", debounced],
    queryFn: ({ signal }) => searchRoster(debounced, signal),
    enabled,
    staleTime: 60 * 1000,
    ...rosterQueryOptions,
  });

  const { players, teams } = useMemo(() => {
    const results = data?.results ?? [];
    return {
      players: results.filter((r) => r.type === "player"),
      teams: results.filter((r) => r.type === "team"),
    };
  }, [data]);

  /** Arrow keys walk the result links; Escape returns focus to the input. */
  const moveFocus = (delta: number, from: HTMLElement) => {
    const links = Array.from(listRef.current?.querySelectorAll<HTMLAnchorElement>("a[data-result]") ?? []);
    if (links.length === 0) return;
    const index = links.indexOf(from as HTMLAnchorElement);
    const next = index === -1 ? (delta > 0 ? 0 : links.length - 1) : index + delta;
    if (next < 0) {
      inputRef.current?.focus();
      return;
    }
    links[Math.min(next, links.length - 1)]?.focus();
  };

  const hasResults = players.length + teams.length > 0;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
          aria-hidden
        />
        <Input
          ref={inputRef}
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          aria-controls={listId}
          aria-expanded={enabled && hasResults}
          autoFocus={autoFocus}
          className="pl-9 pr-9 bg-card/60"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              const first = listRef.current?.querySelector<HTMLAnchorElement>("a[data-result]");
              first?.focus();
            }
          }}
        />
        {enabled && isFetching ? (
          <Loader2
            className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground"
            aria-hidden
          />
        ) : null}
      </div>

      <div
        id={listId}
        ref={listRef}
        aria-live="polite"
        onKeyDown={(e) => {
          const target = e.target as HTMLElement;
          if (!target.matches("a[data-result]")) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            moveFocus(1, target);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            moveFocus(-1, target);
          } else if (e.key === "Escape") {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        {!enabled ? null : isError ? (
          <RosterError error={error} onRetry={() => refetch()} subject="search results" />
        ) : isFetching && !data ? (
          <p className="px-1 text-xs text-muted-foreground">Searching…</p>
        ) : !hasResults ? (
          <p className="px-1 text-xs text-muted-foreground">
            No players or teams match “{debounced}”.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <ResultGroup
              heading="Players"
              Icon={User}
              results={players}
              hrefFor={(r) => playerRoute(r.page)}
              emptyText="No player matches."
            />
            <ResultGroup
              heading="Teams"
              Icon={Shield}
              results={teams}
              hrefFor={(r) => teamRoute(r.page)}
              emptyText="No team matches."
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ResultGroup({
  heading,
  Icon,
  results,
  hrefFor,
  emptyText,
}: {
  heading: string;
  Icon: React.ElementType;
  results: RosterSearchResult[];
  hrefFor: (r: RosterSearchResult) => string;
  emptyText: string;
}) {
  return (
    <section className="rounded-xl border border-border bg-card/60 p-3" aria-label={heading}>
      <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#c9a84c]">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {heading}
        <span className="font-mono text-muted-foreground">({results.length})</span>
      </h3>
      {results.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-1">
          {results.map((r) => (
            <li key={`${r.type}:${r.page}`}>
              <Link
                data-result
                to={hrefFor(r)}
                className="block rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-[#c9a84c]/10 focus:bg-[#c9a84c]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60"
              >
                <span className="font-semibold text-foreground break-words">{r.display_name}</span>
                {r.region ? (
                  <span className="ml-2 text-[11px] text-muted-foreground">{r.region}</span>
                ) : null}
                {r.matched_alias ? (
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    matched via alias{" "}
                    <span className="font-mono text-foreground/80">{r.matched_alias}</span>
                  </span>
                ) : null}
                {r.display_name !== r.page ? (
                  <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                    {r.page}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
