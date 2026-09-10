/**
 * Public Pro Play statistics explorer — the table on /lol/pro-play.
 *
 * Lives INLINE on the hub, below the module grid. It is deliberately not a
 * route: `?view=players` and the filters are query params on the hub URL, so
 * a filtered table is a shareable /lol/pro-play link and the back button walks
 * the filter history.
 *
 * THE ONE RULE A FUTURE EDITOR MUST NOT BREAK. A row carries two game counts.
 * `games` is the canonical record and exists for every season; the K/D/A and
 * per-minute columns come from `stat_backed_games`, a subset, and are `null`
 * whenever that is zero. Null renders as an em dash. Coalescing a null to 0
 * would print "0.0 CS/min" for a 2013 player who simply predates detailed
 * statistics — a fabricated number sitting beside a real win rate. `fmt`
 * exists so no cell can do that by accident.
 *
 * Sorting and pagination are SERVER-side: the corpus is ~12k players and
 * 1.07M player-games, so the client never holds enough rows to sort them.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  getProPlayerStats,
  getProStatsFilterOptions,
  type ProStatsPlayerRow,
  type ProStatsSort,
} from "@/lib/pro-play/statsApi";

const GOLD = "#c9a84c";
const PAGE_SIZE = 25;
const EM_DASH = "—";

const nf = new Intl.NumberFormat("en-US");

/** The single place a missing statistic becomes visible text. Null means "we
 *  have no data", which is not zero and must never be shown as zero. */
function fmt(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return EM_DASH;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtInt(value: number | null | undefined): string {
  return value === null || value === undefined ? EM_DASH : nf.format(value);
}

function fmtPct(value: number | null | undefined): string {
  return value === null || value === undefined
    ? EM_DASH
    : `${(value * 100).toFixed(1)}%`;
}

/** deaths === 0 over real games is "Perfect", not missing data. The two are
 *  both null on the wire and only `stat_backed_games` tells them apart. */
function fmtKda(row: ProStatsPlayerRow): string {
  if (row.kda !== null && row.kda !== undefined) return fmt(row.kda);
  if (row.stat_backed_games > 0 && row.deaths === 0) return "Perfect";
  return EM_DASH;
}

type Column = {
  key: ProStatsSort;
  label: string;
  numeric: boolean;
  render: (row: ProStatsPlayerRow) => string;
  /** Title attribute, for the columns whose denominator is not obvious. */
  hint?: string;
};

const COLUMNS: Column[] = [
  { key: "player", label: "Player", numeric: false, render: (r) => r.player },
  {
    key: "games",
    label: "Games",
    numeric: true,
    render: (r) => fmtInt(r.games),
    hint: "Canonical games played",
  },
  {
    key: "wins",
    label: "W-L",
    numeric: true,
    render: (r) => `${nf.format(r.wins)}-${nf.format(r.losses)}`,
  },
  {
    key: "win_rate",
    label: "Win %",
    numeric: true,
    render: (r) => fmtPct(r.win_rate),
  },
  { key: "kills", label: "K", numeric: true, render: (r) => fmtInt(r.kills) },
  { key: "deaths", label: "D", numeric: true, render: (r) => fmtInt(r.deaths) },
  {
    key: "assists",
    label: "A",
    numeric: true,
    render: (r) => fmtInt(r.assists),
  },
  { key: "kda", label: "KDA", numeric: true, render: fmtKda },
  {
    key: "cs_per_min",
    label: "CS/min",
    numeric: true,
    render: (r) => fmt(r.cs_per_min),
    hint: "Over games with detailed statistics",
  },
  {
    key: "gold_per_min",
    label: "Gold/min",
    numeric: true,
    render: (r) => fmt(r.gold_per_min, 0),
    hint: "Over games with detailed statistics",
  },
  {
    key: "damage_per_min",
    label: "Dmg/min",
    numeric: true,
    render: (r) => fmt(r.damage_per_min, 0),
    hint: "Over games with detailed statistics",
  },
];

/** Text filters are debounced and matched exactly, so they live in local
 *  state until they settle and only then reach the URL. */
const TEXT_FILTERS = ["player", "team"] as const;
/** Filters backed by an option list. */
const LIST_FILTERS = ["year", "league", "patch", "role", "champion"] as const;
const ALL_FILTERS = [...LIST_FILTERS, ...TEXT_FILTERS] as const;

type FilterKey = (typeof ALL_FILTERS)[number];

export default function ProStatsExplorer() {
  const [searchParams, setSearchParams] = useSearchParams();

  const read = (key: string) => searchParams.get(key) ?? "";
  const sort = (searchParams.get("sort") as ProStatsSort) || "games";
  const dir = searchParams.get("dir") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  // Text filters settle locally before they become a request or a URL entry.
  const [playerTerm, setPlayerTerm] = useState(read("player"));
  const [teamTerm, setTeamTerm] = useState(read("team"));
  const debouncedPlayer = useDebouncedValue(playerTerm.trim());
  const debouncedTeam = useDebouncedValue(teamTerm.trim());

  useEffect(() => {
    const urlPlayer = searchParams.get("player") ?? "";
    const urlTeam = searchParams.get("team") ?? "";
    if (debouncedPlayer === urlPlayer && debouncedTeam === urlTeam) return;
    const next = new URLSearchParams(searchParams);
    if (debouncedPlayer) next.set("player", debouncedPlayer);
    else next.delete("player");
    if (debouncedTeam) next.set("team", debouncedTeam);
    else next.delete("team");
    next.delete("page");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedPlayer, debouncedTeam]);

  /** Any filter change resets to page 1: page 4 of the old slice is
   *  meaningless in the new one. */
  const setFilter = (key: FilterKey, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    if (!next.get("view")) next.set("view", "players");
    setSearchParams(next);
  };

  const setSort = (key: ProStatsSort) => {
    const next = new URLSearchParams(searchParams);
    next.set("sort", key);
    // First click on a new column sorts descending (biggest first), which is
    // what a leaderboard is for; the exception is the name column.
    next.set(
      "dir",
      sort === key && dir === "desc"
        ? "asc"
        : key === "player"
          ? "asc"
          : "desc",
    );
    next.delete("page");
    setSearchParams(next);
  };

  const setPage = (nextPage: number) => {
    const next = new URLSearchParams(searchParams);
    if (nextPage <= 1) next.delete("page");
    else next.set("page", String(nextPage));
    setSearchParams(next);
  };

  const clearAll = () => {
    setPlayerTerm("");
    setTeamTerm("");
    setSearchParams(new URLSearchParams({ view: "players" }));
  };

  const query = useMemo(
    () => ({
      year: read("year") ? Number(read("year")) : null,
      league: read("league") || null,
      patch: read("patch") || null,
      role: read("role") || null,
      champion: read("champion") || null,
      player: debouncedPlayer || null,
      team: debouncedTeam || null,
      sort,
      dir: dir as "asc" | "desc",
      page,
      pageSize: PAGE_SIZE,
    }),
    [searchParams, debouncedPlayer, debouncedTeam, sort, dir, page],
  );

  const { data, isPending, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["pro-play-stats", "players", query],
    queryFn: ({ signal }) => getProPlayerStats(query, signal),
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  const { data: options } = useQuery({
    queryKey: ["pro-play-stats", "filters"],
    queryFn: ({ signal }) => getProStatsFilterOptions(signal),
    staleTime: 60 * 60 * 1000,
  });

  const rows = data?.rows ?? [];
  const coverage = data?.coverage;
  const activeCount = ALL_FILTERS.filter((k) => read(k)).length;

  return (
    <section className="mt-10" aria-labelledby="pro-stats-heading">
      <header className="mb-4">
        <div className="mb-2 flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#c9a84c]/30 bg-[#c9a84c]/10"
            aria-hidden="true"
          >
            <BarChart3 className="h-5 w-5 text-[#c9a84c]" />
          </span>
          <h2
            id="pro-stats-heading"
            className="text-3xl font-bold tracking-tight"
          >
            Player Statistics
          </h2>
        </div>
        <p className="text-muted-foreground">
          Every professional player, filtered and ranked — drawn from real pro
          match history.
        </p>
      </header>

      {/* ---------------------------------------------------------- filters */}
      <div className="mb-4 rounded-xl border border-border bg-card/60 p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
          <FilterSelect
            label="Year"
            value={read("year")}
            onChange={(v) => setFilter("year", v)}
            options={(options?.years ?? []).map(String)}
          />
          <FilterSelect
            label="League"
            value={read("league")}
            onChange={(v) => setFilter("league", v)}
            options={options?.leagues ?? []}
          />
          <FilterSelect
            label="Patch"
            value={read("patch")}
            onChange={(v) => setFilter("patch", v)}
            options={options?.patches ?? []}
          />
          <FilterSelect
            label="Role"
            value={read("role")}
            onChange={(v) => setFilter("role", v)}
            options={options?.roles ?? []}
          />
          <FilterSelect
            label="Champion"
            value={read("champion")}
            onChange={(v) => setFilter("champion", v)}
            options={options?.champions ?? []}
          />
          <FilterText
            label="Player"
            value={playerTerm}
            onChange={setPlayerTerm}
          />
          <FilterText label="Team" value={teamTerm} onChange={setTeamTerm} />
        </div>
        {activeCount > 0 && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* -------------------------------------------------- aggregate strip */}
      {/* Five tiles never divide evenly into two or three columns, so a
          hairline "gap-px over a background" grid would paint a phantom sixth
          cell on narrow screens. Each tile carries its own border instead. */}
      {data && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Players" value={fmtInt(data.aggregates.players)} />
          <Stat label="Player-games" value={fmtInt(data.aggregates.games)} />
          <Stat
            label="With stats"
            value={fmtInt(data.aggregates.stat_backed_games)}
          />
          <Stat label="KDA" value={fmt(data.aggregates.kda)} />
          <Stat label="CS/min" value={fmt(data.aggregates.cs_per_min)} />
        </div>
      )}

      {/* ------------------------------------------------------------ table */}
      {/* No scroll wrapper here: ui/table.tsx already wraps the table in
          `relative w-full overflow-auto`, and nesting a second scroller makes
          the inner one unreachable on touch. Eleven columns overflow on a
          phone and scroll inside that wrapper; the PAGE never scrolls
          sideways. */}
      <div className="rounded-xl border border-border bg-card/60">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {COLUMNS.map((col) => {
                const active = sort === col.key;
                return (
                  <TableHead
                    key={col.key}
                    title={col.hint}
                    className={`whitespace-nowrap ${col.numeric ? "text-right" : ""}`}
                    aria-sort={
                      active
                        ? dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <button
                      type="button"
                      onClick={() => setSort(col.key)}
                      className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${
                        active ? "font-semibold" : ""
                      }`}
                      style={active ? { color: GOLD } : undefined}
                    >
                      {col.label}
                      {active &&
                        (dir === "asc" ? (
                          <ArrowUp className="h-3 w-3" aria-hidden />
                        ) : (
                          <ArrowDown className="h-3 w-3" aria-hidden />
                        ))}
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {COLUMNS.map((col) => (
                    <TableCell key={col.key}>
                      <div className="h-4 animate-pulse rounded bg-muted" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isPending && isError && (
              <TableRow>
                <TableCell
                  colSpan={COLUMNS.length}
                  className="py-10 text-center"
                >
                  <p className="mb-3 text-sm text-muted-foreground">
                    {(error as Error)?.message ??
                      "Statistics are unavailable right now."}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => refetch()}>
                    Try again
                  </Button>
                </TableCell>
              </TableRow>
            )}

            {!isPending && !isError && rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={COLUMNS.length}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No players match these filters.
                </TableCell>
              </TableRow>
            )}

            {!isError &&
              rows.map((row) => (
                <TableRow key={row.player}>
                  {COLUMNS.map((col) => (
                    <TableCell
                      key={col.key}
                      className={`whitespace-nowrap ${
                        col.numeric ? "text-right tabular-nums" : "font-medium"
                      }`}
                    >
                      {col.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>

        {/* ------------------------------------------ coverage + pagination */}
        {data && data.total_rows > 0 && (
          <nav
            className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-3"
            aria-label="Player statistics pagination"
          >
            <p className="text-xs text-muted-foreground" aria-live="polite">
              Page{" "}
              <span className="font-semibold text-foreground">
                {nf.format(data.page)}
              </span>{" "}
              of {nf.format(Math.max(data.total_pages, 1))} ·{" "}
              {nf.format(data.total_rows)} players
              {coverage && coverage.missing_stat_games > 0 && (
                <>
                  {" · "}
                  <span title="Win-loss records cover every game; detailed statistics do not.">
                    detailed stats for {nf.format(coverage.stat_backed_games)}{" "}
                    of {nf.format(coverage.games)} games
                  </span>
                </>
              )}
              {isFetching && (
                <Loader2
                  className="ml-2 inline h-3 w-3 animate-spin"
                  aria-hidden
                />
              )}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={data.page <= 1}
                onClick={() => setPage(data.page - 1)}
                className="border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/10 disabled:opacity-40"
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" aria-hidden />{" "}
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={data.page >= data.total_pages}
                onClick={() => setPage(data.page + 1)}
                className="border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/10 disabled:opacity-40"
              >
                Next <ChevronRight className="ml-1 h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          </nav>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#c9a84c]/25 bg-card px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-lg font-semibold tabular-nums" style={{ color: GOLD }}>
        {value}
      </p>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterText({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Any"
        aria-label={label}
        className="h-9"
      />
    </label>
  );
}
