/**
 * The Pro Stats Explorer's one search box.
 *
 * Type "Faker", "Gen.G", "Ahri", "LCK" or "Worlds 2025" without choosing a
 * category first. Results come back grouped (Players, Teams, Champions,
 * Leagues, Events) and choosing one APPLIES it to the table as a filter — the
 * explorer is the primary use on this page, so a result never navigates away
 * on its own. Player, team and champion rows carry a secondary "Profile" link
 * for the reader who wanted the entity page instead.
 *
 * USABLE FROM THE FIRST PAINT. Nothing here waits on the statistics table or
 * the filter options: the lookup is its own request against the backend's
 * in-memory index (`explorerSearch.ts`).
 *
 * A standard ARIA combobox: the input owns `aria-activedescendant`, arrows
 * move through every option across groups, Enter applies, Escape closes.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Loader2, Search as SearchIcon, X } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { proPlayProfileUrl, PRO_PLAY_SEARCH_ROUTE } from "@/lib/pro-play/routes";
import {
  EXPLORER_QUERY_MAX,
  lookupExplorer,
  type ExplorerResult,
} from "@/lib/pro-play/explorerSearch";
import { cn } from "@/lib/utils";

const KIND_BADGE: Record<ExplorerResult["kind"], string> = {
  player: "Player",
  team: "Team",
  champion: "Champion",
  league: "League",
  event: "Event",
};

/** Short enough to feel instant, long enough that a fast typist does not
 *  send a request per keystroke. */
const DEBOUNCE_MS = 120;

export default function ExplorerSearch({
  onApply,
}: {
  /** Apply a result's filters to the explorer. */
  onApply: (result: ExplorerResult) => void;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const optionId = (i: number) => `${listId}-opt-${i}`;

  const debounced = useDebouncedValue(text.trim(), DEBOUNCE_MS);
  const enabled = debounced.length > 0;
  const { data, isFetching, isError } = useQuery({
    queryKey: ["pro-play-explorer-lookup", debounced],
    queryFn: ({ signal }) => lookupExplorer(debounced, signal),
    enabled,
    staleTime: 5 * 60 * 1000,
    // A type-ahead that retries three times with backoff leaves "Searching…"
    // on screen for seconds after the answer is already "unavailable".
    retry: 1,
    retryDelay: 300,
    // Keep the last answer on screen while the next keystroke's is in
    // flight, so the list refines rather than flashing empty.
    placeholderData: (prev) => prev,
  });

  const flat = useMemo(
    () => (enabled && data ? data.groups.flatMap((g) => g.results) : []),
    [data, enabled],
  );

  useEffect(() => setActive(0), [data]);

  // Close on a click anywhere outside the search.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const apply = (result: ExplorerResult) => {
    onApply(result);
    setText("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      if (flat.length) setActive((i) => (i + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flat.length) setActive((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      if (open && flat[active]) {
        e.preventDefault();
        apply(flat[active]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      } else if (text) {
        setText("");
      }
    }
  };

  const showPanel = open && text.trim().length > 0;
  // "Searching" only when there is nothing yet to show for THIS text.
  const settling = text.trim() !== debounced || (isFetching && !data);
  let offset = 0;

  return (
    <div ref={rootRef} className="relative" data-testid="explorer-search">
      <div className="relative">
        <SearchIcon
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#c9a84c]/80"
          aria-hidden
        />
        <input
          ref={inputRef}
          type="search"
          value={text}
          maxLength={EXPLORER_QUERY_MAX}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search players, teams, champions, leagues, events…"
          aria-label="Search players, teams, champions, leagues and events"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-activedescendant={showPanel && flat[active] ? optionId(active) : undefined}
          autoComplete="off"
          spellCheck={false}
          data-testid="explorer-search-input"
          className="h-11 w-full rounded-lg border border-[#c9a84c]/35 bg-background/80 pl-10 pr-10 text-[0.95rem] shadow-[inset_0_1px_0_rgba(201,168,76,0.08)] placeholder:text-muted-foreground/80 focus-visible:border-[#c9a84c]/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a84c]/50 [&::-webkit-search-cancel-button]:hidden"
        />
        {text ? (
          <button
            type="button"
            onClick={() => {
              setText("");
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>

      {showPanel ? (
        <div
          className="absolute left-0 right-0 z-40 mt-1.5 max-h-[min(28rem,70vh)] overflow-y-auto rounded-lg border border-[#c9a84c]/30 bg-popover shadow-xl"
          data-testid="explorer-search-panel"
        >
          <ul id={listId} role="listbox" aria-label="Search results">
            {flat.length === 0 ? (
              <li className="px-3 py-3 text-sm text-muted-foreground" role="presentation">
                {settling || isFetching ? (
                  <span className="inline-flex items-center gap-2" data-testid="explorer-search-loading">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    Searching…
                  </span>
                ) : isError ? (
                  <span data-testid="explorer-search-error">
                    Search is unavailable right now. The table and filters below
                    still work.
                  </span>
                ) : (
                  <span data-testid="explorer-search-empty">
                    No players, teams, champions, leagues or events match “{text.trim()}”.
                  </span>
                )}
              </li>
            ) : (
              data!.groups.map((group) => {
                const start = offset;
                offset += group.results.length;
                return (
                  <li key={group.kind} role="presentation">
                    <div
                      className="sticky top-0 bg-popover/95 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#c9a84c]/80"
                      role="presentation"
                    >
                      {group.label}
                    </div>
                    <ul role="presentation">
                      {group.results.map((result, i) => {
                        const index = start + i;
                        return (
                          <ResultOption
                            key={`${result.kind}:${result.key}`}
                            id={optionId(index)}
                            result={result}
                            active={index === active}
                            onHover={() => setActive(index)}
                            onApply={() => apply(result)}
                          />
                        );
                      })}
                    </ul>
                  </li>
                );
              })
            )}
          </ul>
          <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
            <span>
              {isFetching && flat.length > 0 ? (
                <Loader2 className="mr-1 inline h-3 w-3 animate-spin" aria-hidden />
              ) : null}
              Enter applies to the table
            </span>
            {/* The full research search: disambiguation, compound queries
                ("Faker Azir") and zero-game registry names live there. */}
            <Link
              to={`${PRO_PLAY_SEARCH_ROUTE}?q=${encodeURIComponent(text.trim())}`}
              className="text-[#c9a84c] underline-offset-2 hover:underline"
              data-testid="explorer-search-all"
            >
              All results
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ResultOption({
  id,
  result,
  active,
  onHover,
  onApply,
}: {
  id: string;
  result: ExplorerResult;
  active: boolean;
  onHover: () => void;
  onApply: () => void;
}) {
  const profileKind =
    result.kind === "player" || result.kind === "team" || result.kind === "champion"
      ? result.kind
      : null;
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      onMouseEnter={onHover}
      onMouseDown={(e) => {
        // Keep focus in the input; apply on click.
        e.preventDefault();
      }}
      onClick={onApply}
      data-testid="explorer-search-option"
      data-kind={result.kind}
      className={cn(
        "flex cursor-pointer items-center gap-3 px-3 py-2",
        active ? "bg-[#c9a84c]/15" : "hover:bg-muted/40",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate font-medium">{result.label}</span>
          <span className="shrink-0 rounded border border-border/70 px-1 text-[9px] uppercase tracking-wide text-muted-foreground">
            {KIND_BADGE[result.kind]}
          </span>
        </span>
        {result.hint ? (
          <span className="block truncate text-xs text-muted-foreground">{result.hint}</span>
        ) : null}
      </span>
      {profileKind && result.has_profile ? (
        <Link
          to={proPlayProfileUrl(profileKind, result.key)}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-[#c9a84c]"
          aria-label={`Open ${result.label} profile`}
          data-testid="explorer-search-profile"
          tabIndex={-1}
        >
          Profile
          <ArrowUpRight className="h-3 w-3" aria-hidden />
        </Link>
      ) : null}
    </li>
  );
}
