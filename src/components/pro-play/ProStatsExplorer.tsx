/**
 * Public Pro Play statistics explorer — the table on /lol/pro-play.
 *
 * ONE PRODUCT, THREE CONCEPTS (PSE-UNIFY, 2026-09-22):
 *
 *   Search   — find an entity or context by name, from the first paint:
 *              "Faker", "Gen.G", "Ahri", "LCK", "Worlds 2025". Choosing a
 *              result APPLIES it as a filter (`ExplorerSearch`).
 *   View     — Players | Teams | Champions: what ONE ROW of the table is.
 *              Nothing else on the page asks that question.
 *   Filters  — which population is counted: year, league/event, patch, role,
 *              minimum games, and the player / team / champion Search set.
 *              Every active one is a visible, removable chip. The URL is the
 *              only state.
 *
 * Then the table: the sortable statistical result for that row type and
 * population. It is not a second search, entity browser or graph builder.
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
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { proPlayProfileUrl } from "@/lib/pro-play/routes";
import { FilterCombobox, type ComboOption } from "@/components/pro-play/FilterCombobox";
import ExplorerSearch from "@/components/pro-play/ExplorerSearch";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  LineChart,
  Loader2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getChampionIcon, useChampionAssets } from "@/hooks/useChampionAssets";
import {
  getProStats,
  getProStatsFilterOptions,
  type ProStatsPlayerRow,
  type ProStatsChampionRow,
  type ProStatsTeamRow,
  type ProStatsView,
} from "@/lib/pro-play/statsApi";
import {
  competitionHint,
  competitionIndex,
  competitionLabel,
  competitionNoun,
  roleLabel,
  type ExplorerResult,
  type ProStatsFilterOptionsWithCompetitions,
} from "@/lib/pro-play/explorerSearch";
import { graphHandoff } from "@/lib/pro-play/graphHandoff";
import { useSfx } from "@/lib/audio/useSfx";

const GOLD = "#c9a84c";
const PAGE_SIZE = 25;
const EM_DASH = "—";

const nf = new Intl.NumberFormat("en-US");

/** Sample-size floors offered in the UI. The API accepts any value up to
 *  its own ceiling, so a shared link carrying 30 still works. */
const MIN_GAMES_OPTIONS = ["5", "10", "20", "50"];

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
function fmtKda(row: {
  kda: number | null;
  deaths: number | null;
  stat_backed_games: number;
}): string {
  if (row.kda !== null && row.kda !== undefined) return fmt(row.kda);
  if (row.stat_backed_games > 0 && row.deaths === 0) return "Perfect";
  return EM_DASH;
}

type AnyRow = ProStatsPlayerRow | ProStatsTeamRow | ProStatsChampionRow;

type Column<R = AnyRow> = {
  key: string;
  label: string;
  numeric: boolean;
  render: (row: R) => string;
  /** Optional rich cell. Falls back to `render` when absent. */
  cell?: (row: R) => React.ReactNode;
  /** Title attribute, for the columns whose denominator is not obvious. */
  hint?: string;
};

const PLAYER_COLUMNS: Column<ProStatsPlayerRow>[] = [
  {
    key: "player",
    label: "Player",
    numeric: false,
    render: (r) => r.player,
    // THE IDENTITY ITSELF IS THE LINK — not a separate per-row button in a
    // twelfth column. The name already IS the identity, the row already holds
    // the canonical key, and a per-row button would cost width the eleven
    // data columns need and add a second tab stop to every row.
    cell: (r) => <PlayerCell name={r.player} />,
  },
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

const TEAM_COLUMNS: Column<ProStatsTeamRow>[] = [
  {
    key: "team",
    label: "Team",
    numeric: false,
    render: (r) => r.team,
    // Same rule as the Player column: the identity IS the link. `row.team` is
    // `team_key` verbatim -- the key the profile route takes and the key this
    // table filters on.
    cell: (r) => <TeamCell name={r.team} />,
  },
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
    hint: "Over games with a recorded winner",
  },
  {
    key: "kills_per_game",
    label: "Kills/G",
    numeric: true,
    render: (r) => fmt(r.kills_per_game, 1),
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
    key: "towers_per_game",
    label: "Towers/G",
    numeric: true,
    render: (r) => fmt(r.towers_per_game, 1),
    hint: "Over games with detailed statistics",
  },
  {
    key: "dragons_per_game",
    label: "Dragons/G",
    numeric: true,
    render: (r) => fmt(r.dragons_per_game, 1),
    hint: "Over games with detailed statistics",
  },
  {
    key: "barons_per_game",
    label: "Barons/G",
    numeric: true,
    render: (r) => fmt(r.barons_per_game, 2),
    hint: "Over games with detailed statistics",
  },
];

const CHAMPION_COLUMNS: Column<ProStatsChampionRow>[] = [
  {
    key: "champion",
    label: "Champion",
    numeric: false,
    render: (r) => r.champion,
    cell: (r) => <ChampionCell name={r.champion} />,
  },
  {
    key: "picks",
    label: "Picks",
    numeric: true,
    render: (r) => fmtInt(r.picks),
    hint: "Player-games the champion was picked in",
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
  {
    key: "bans",
    label: "Bans",
    numeric: true,
    render: (r) => fmtInt(r.bans),
    hint: "Games the champion was banned in",
  },
  {
    key: "presence_rate",
    label: "Presence",
    numeric: true,
    render: (r) => fmtPct(r.presence_rate),
    hint: "Games picked or banned, of games with draft data",
  },
  { key: "kda", label: "KDA", numeric: true, render: fmtKda },
  {
    key: "cs_per_min",
    label: "CS/min",
    numeric: true,
    render: (r) => fmt(r.cs_per_min),
    hint: "Over picked games with detailed statistics",
  },
  {
    key: "gold_per_min",
    label: "Gold/min",
    numeric: true,
    render: (r) => fmt(r.gold_per_min, 0),
    hint: "Over picked games with detailed statistics",
  },
  {
    key: "damage_per_min",
    label: "Dmg/min",
    numeric: true,
    render: (r) => fmt(r.damage_per_min, 0),
    hint: "Over picked games with detailed statistics",
  },
];

/** A strip tile: which aggregate key it reads and how it prints. */
type StripTile = {
  label: string;
  key: string;
  format: (v: number | null) => string;
};

/**
 * ONE SHELL, THIN VIEW DEFINITIONS. Everything that differs between Players
 * and Teams lives here; the filter bar, URL state, sorting, pagination and
 * coverage line below are written once and read this.
 */
type ViewConfig = {
  label: string;
  /** Section heading and its one-line blurb. Derived from the config rather
   *  than a ternary on the label, which silently mislabelled the third view
   *  when it was added. */
  heading: string;
  blurb: string;
  columns: Column[];
  defaultSort: string;
  /** Stable identity per row, also the React key. */
  rowKey: (row: AnyRow) => string;
  strip: StripTile[];
  /** Noun for the pager: "2,099 players". */
  unit: string;
};

const VIEWS: Record<ProStatsView, ViewConfig> = {
  players: {
    label: "Players",
    heading: "Player Statistics",
    blurb:
      "Every professional player, filtered and ranked — drawn from real pro match history.",
    columns: PLAYER_COLUMNS as Column[],
    defaultSort: "games",
    rowKey: (r) => (r as ProStatsPlayerRow).player,
    unit: "players",
    strip: [
      { label: "Players", key: "players", format: fmtInt },
      { label: "Player-games", key: "games", format: fmtInt },
      { label: "KDA", key: "kda", format: (v) => fmt(v) },
      { label: "CS/min", key: "cs_per_min", format: (v) => fmt(v) },
      { label: "Gold/min", key: "gold_per_min", format: (v) => fmt(v, 0) },
    ],
  },
  teams: {
    label: "Teams",
    heading: "Team Statistics",
    blurb:
      "Every professional team, filtered and ranked — drawn from real pro match history.",
    columns: TEAM_COLUMNS as Column[],
    defaultSort: "games",
    rowKey: (r) => (r as ProStatsTeamRow).team,
    unit: "teams",
    // Deliberately NOT led by win rate: a cohort holding both sides of the
    // same games averages 50% by construction, so it says nothing about the
    // teams in it. Objective rates do.
    strip: [
      { label: "Teams", key: "teams", format: fmtInt },
      { label: "Team-games", key: "games", format: fmtInt },
      { label: "Kills/G", key: "kills_per_game", format: (v) => fmt(v, 1) },
      { label: "Towers/G", key: "towers_per_game", format: (v) => fmt(v, 1) },
      { label: "Gold/min", key: "gold_per_min", format: (v) => fmt(v, 0) },
    ],
  },
  champions: {
    label: "Champions",
    heading: "Champion Statistics",
    blurb:
      "Every champion picked or banned in pro play — drawn from real pro match history.",
    columns: CHAMPION_COLUMNS as Column[],
    defaultSort: "picks",
    rowKey: (r) => (r as ProStatsChampionRow).champion,
    unit: "champions",
    // No cohort win rate: champions sit on both sides of games and average
    // out near 50%, the same reason Teams omits it. Picks and bans are the
    // two numbers a draft conversation actually starts from.
    strip: [
      { label: "Champions", key: "champions", format: fmtInt },
      { label: "Picks", key: "picks", format: fmtInt },
      { label: "Bans", key: "bans", format: fmtInt },
      { label: "KDA", key: "kda", format: (v) => fmt(v) },
      { label: "Gold/min", key: "gold_per_min", format: (v) => fmt(v, 0) },
    ],
  },
};

const VIEW_KEYS = Object.keys(VIEWS) as ProStatsView[];

/** Every URL filter key. Player / team / champion are set by Search and
 *  shown as chips; the rest also have a control in the filter bar. */
const ALL_FILTERS = [
  "year",
  "league",
  "patch",
  "role",
  "min_games",
  "player",
  "team",
  "champion",
] as const;

type FilterKey = (typeof ALL_FILTERS)[number];

/** Order the chips read in: population first, then the entity narrowing. */
const CHIP_ORDER: FilterKey[] = [
  "league",
  "year",
  "patch",
  "role",
  "team",
  "player",
  "champion",
  "min_games",
];

type Chip = {
  key: FilterKey;
  noun: string;
  value: string;
  profile?: string;
};

export default function ProStatsExplorer() {
  const { play } = useSfx();
  const [searchParams, setSearchParams] = useSearchParams();
  // Small screens fold the filter bar behind one button so Search stays the
  // first thing on the screen; from `sm` up the bar is always open.
  const [filtersOpen, setFiltersOpen] = useState(false);

  const read = (key: string) => searchParams.get(key) ?? "";
  const viewParam = searchParams.get("view") as ProStatsView | null;
  const view: ProStatsView =
    viewParam && viewParam in VIEWS ? viewParam : "players";
  const config = VIEWS[view];
  // A sort the OTHER view owns would be rejected by the API, so fall back to
  // this view's default rather than sending something invalid.
  const sortParam = searchParams.get("sort") ?? "";
  const sort = config.columns.some((c) => c.key === sortParam)
    ? sortParam
    : config.defaultSort;
  const dir = searchParams.get("dir") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  // The label Search showed for a chosen player/team, remembered only for
  // DISPLAY. On a cold URL (refresh, shared link, Back) the chip shows the
  // canonical key itself, which is a true and readable name for every kind
  // ("Gen.G"; "Doran (Choi Hyeon-joon)"). It is never sent anywhere.
  const [entityLabels, setEntityLabels] = useState<Record<string, string>>({});

  /** Any filter change resets to page 1: page 4 of the old slice is
   *  meaningless in the new one. One history entry per change, so Back
   *  walks the filter history. */
  const updateFilters = (patch: Partial<Record<FilterKey, string>>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    if (!next.get("view")) next.set("view", view);
    setSearchParams(next);
  };
  const setFilter = (key: FilterKey, value: string) => updateFilters({ [key]: value });

  /** SEARCH WRITES THE SAME STATE EVERY CONTROL WRITES. A result's filters
   *  land in the URL as ordinary filter params — there is no second, hidden
   *  search state — so the chip, the table, refresh and Back all agree. */
  const applySearchResult = (result: ExplorerResult) => {
    const patch: Partial<Record<FilterKey, string>> = {};
    for (const [key, value] of Object.entries(result.filters)) {
      if (value !== undefined && value !== null) patch[key as FilterKey] = String(value);
    }
    if (result.kind === "player" || result.kind === "team" || result.kind === "champion") {
      const key = result.filters[result.kind];
      if (key && result.label && result.label !== key) {
        setEntityLabels((prev) => ({ ...prev, [key]: result.label }));
      }
    }
    updateFilters(patch);
  };

  const setSort = (key: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("sort", key);
    // First click on a new column sorts descending (biggest first), which is
    // what a leaderboard is for; the exception is the name column.
    next.set(
      "dir",
      sort === key && dir === "desc"
        ? "asc"
        : key === "player" || key === "team"
          ? "asc"
          : "desc",
    );
    next.delete("page");
    setSearchParams(next);
  };

  /** Switching view keeps the filters (they mean the same thing on every
   *  view) and drops only what cannot survive: the page, and a sort the new
   *  view has no column for. */
  const setView = (next: ProStatsView) => {
    const params = new URLSearchParams(searchParams);
    params.set("view", next);
    params.delete("page");
    const sortSurvives = VIEWS[next].columns.some((c) => c.key === sortParam);
    if (!sortSurvives) {
      params.delete("sort");
      params.delete("dir");
    }
    setSearchParams(params);
  };

  const setPage = (nextPage: number) => {
    const next = new URLSearchParams(searchParams);
    if (nextPage <= 1) next.delete("page");
    else next.set("page", String(nextPage));
    setSearchParams(next);
  };

  const clearAll = () => {
    setSearchParams(new URLSearchParams({ view }));
  };

  const query = useMemo(
    () => ({
      year: read("year") ? Number(read("year")) : null,
      league: read("league") || null,
      patch: read("patch") || null,
      role: read("role") || null,
      champion: read("champion") || null,
      minGames: read("min_games") ? Number(read("min_games")) : null,
      player: read("player") || null,
      team: read("team") || null,
      sort,
      dir: dir as "asc" | "desc",
      page,
      pageSize: PAGE_SIZE,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchParams, sort, dir, page],
  );

  const {
    data,
    isPending,
    isFetching,
    isPlaceholderData,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["pro-play-stats", view, query],
    queryFn: ({ signal }) => getProStats(view, query, signal),
    staleTime: 5 * 60 * 1000,
    // Keep the previous rows on screen while a new filter loads — but ONLY
    // for the same view. A Players page shown under Team columns would be a
    // table of em dashes pretending to be data.
    placeholderData: (prev) => (prev && prev.view === view ? prev : undefined),
  });

  const {
    data: options,
    isPending: optionsPending,
    isError: optionsError,
  } = useQuery({
    queryKey: ["pro-play-stats", "filters"],
    queryFn: ({ signal }) =>
      getProStatsFilterOptions(signal) as Promise<ProStatsFilterOptionsWithCompetitions>,
    staleTime: 60 * 60 * 1000,
  });
  // A failed option list must not leave the controls spinning forever: the
  // chips, Search and the table all still work without it.
  const optionsLoading = optionsPending && !optionsError;

  const competitions = useMemo(
    () => competitionIndex(options?.competitions),
    [options],
  );

  // Leagues most-played first (the server's order), shown by the name a
  // reader uses — "LCK", "Worlds" — with the region, the official name and
  // the years beneath. The official name still MATCHES when typed.
  const leagueOptions = useMemo<ComboOption[]>(() => {
    if (options?.competitions?.length) {
      return options.competitions.map((c) => ({
        value: c.slug,
        label: c.code,
        hint: competitionHint(c),
        keywords: c.code !== c.name ? [c.name] : undefined,
      }));
    }
    return (options?.leagues ?? []).map((l) => ({ value: l, label: l }));
  }, [options]);

  // Rows are only ever shown for the CURRENT request. While a new one is in
  // flight the previous rows stay, dimmed and marked, rather than vanishing.
  const rows = data?.rows ?? [];
  const coverage = data?.coverage;
  const updating = isFetching && isPlaceholderData;

  // An all-time ranking over every player is too expensive to serve, so a
  // request that names no scope at all comes back scoped to the latest
  // season. The control MUST SHOW THAT YEAR rather than "All".
  const effectiveYear =
    read("year") || (data && !isPlaceholderData && data.filters.year ? String(data.filters.year) : "");
  const yearWasDefaulted =
    !read("year") && !isPlaceholderData && data?.filters.year != null;

  // Built from the EFFECTIVE filters the server echoed, never from the URL,
  // so a graph can never be scoped to something the reader is not looking
  // at. Null means the scope names no single subject and the action is
  // withheld rather than pointed somewhere.
  const handoff = useMemo(
    () =>
      data && !isPlaceholderData
        ? graphHandoff({
            view,
            year: data.filters.year,
            league: data.filters.league,
            patch: data.filters.patch,
            role: data.filters.role,
            player: data.filters.player,
            team: data.filters.team,
            champion: data.filters.champion,
            minGames: data.filters.min_games || null,
          })
        : null,
    [data, view, isPlaceholderData],
  );

  const chips: Chip[] = CHIP_ORDER.filter((key) => read(key)).map((key) => {
    const value = read(key);
    switch (key) {
      case "league":
        return {
          key,
          noun: competitionNoun(competitions, value),
          value: competitionLabel(competitions, value),
        };
      case "role":
        return { key, noun: "Role", value: roleLabel(value) };
      case "min_games":
        return { key, noun: "Min. games", value: `${value}+` };
      case "player":
      case "team":
      case "champion":
        return {
          key,
          noun: key[0].toUpperCase() + key.slice(1),
          value: entityLabels[value] ?? value,
          profile: proPlayProfileUrl(key, value),
        };
      default:
        return { key, noun: key === "year" ? "Year" : "Patch", value };
    }
  });
  const activeCount = chips.length;
  const panelFilterCount = ["year", "league", "patch", "role", "min_games"].filter((k) =>
    read(k),
  ).length;

  return (
    <section className="mt-10" aria-labelledby="pro-stats-heading">
      <header className="mb-4">
        <div className="mb-2 flex items-center gap-3">
          {/* Deliberately smaller than the page header's 10x10 chip and
              3xl title. This is a section OF /lol/pro-play. */}
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#c9a84c]/30 bg-[#c9a84c]/10"
            aria-hidden="true"
          >
            <BarChart3 className="h-4 w-4 text-[#c9a84c]" />
          </span>
          <h2
            id="pro-stats-heading"
            className="text-2xl font-bold tracking-tight"
          >
            {config.heading}
          </h2>
        </div>
        <p className="text-muted-foreground">{config.blurb}</p>
      </header>

      {/* ------------------------------------------------ search · view · filters */}
      <div
        className="mb-4 space-y-3 rounded-xl border border-[#c9a84c]/20 bg-card/60 p-3"
        data-testid="explorer-controls"
      >
        {/* SEARCH — first, full width, usable before anything else loads. */}
        <ExplorerSearch onApply={applySearchResult} />

        {/* VIEW — the ONE control that decides what a row is. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] uppercase tracking-wide text-muted-foreground"
              id="pro-stats-view-label"
            >
              View
            </span>
            <div
              className="inline-flex rounded-lg border border-[#c9a84c]/30 bg-background/40 p-0.5"
              role="tablist"
              aria-labelledby="pro-stats-view-label"
              data-testid="stats-view-selector"
            >
              {VIEW_KEYS.map((key) => {
                const active = key === view;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setView(key)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:px-4 ${
                      active
                        ? "bg-[#c9a84c]/15 text-[#c9a84c]"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {VIEWS[key].label}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            aria-controls="pro-stats-filter-bar"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground sm:hidden"
            data-testid="stats-filters-toggle"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            Filters{panelFilterCount ? ` · ${panelFilterCount}` : ""}
          </button>
        </div>

        {/* FILTERS — the population. Never "All" before the option list
            exists: a control that cannot be used yet says so. */}
        <div
          id="pro-stats-filter-bar"
          className={`${filtersOpen ? "grid" : "hidden"} grid-cols-2 gap-2 sm:grid sm:grid-cols-3 lg:grid-cols-5`}
          data-testid="stats-filter-bar"
          aria-busy={optionsLoading || undefined}
        >
          <FilterSelect
            label="Year"
            value={effectiveYear}
            onChange={(v) => setFilter("year", v)}
            options={(options?.years ?? []).map(String)}
            loading={optionsLoading}
          />
          <FilterCombobox
            label="League / Event"
            value={read("league")}
            onChange={(v) => setFilter("league", v)}
            options={leagueOptions}
            loading={optionsLoading}
            searchPlaceholder="LCK, LPL, Worlds, MSI…"
          />
          <FilterSelect
            label="Patch"
            value={read("patch")}
            onChange={(v) => setFilter("patch", v)}
            options={options?.patches ?? []}
            loading={optionsLoading}
          />
          <FilterSelect
            label="Role"
            value={read("role")}
            onChange={(v) => setFilter("role", v)}
            options={options?.roles ?? []}
            optionLabel={roleLabel}
            loading={optionsLoading}
          />
          {/* Explicit, never automatic: a hidden floor would make the table
              quietly disagree with its own row count. Its options are fixed,
              so it is usable immediately. */}
          <FilterSelect
            label="Min. games"
            value={read("min_games")}
            onChange={(v) => setFilter("min_games", v)}
            options={MIN_GAMES_OPTIONS}
            anyLabel="Any"
            optionLabel={(v) => `${v}+`}
          />
        </div>

        {/* ACTIVE FILTERS — every filter in the URL, visible and removable.
            Search adds to this row; nothing it applies is invisible. */}
        {(activeCount > 0 || yearWasDefaulted || handoff) && (
          <div className="space-y-1.5 border-t border-border/50 pt-2.5">
            <div className="flex flex-wrap items-center gap-1.5" data-testid="active-filters">
              {yearWasDefaulted ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#c9a84c]/35 px-2.5 py-0.5 text-xs text-muted-foreground"
                  data-testid="active-filter-default-year"
                  title="No year, league, patch, player, team or champion is set, so the table shows the latest season."
                >
                  Latest season · {data?.filters.year}
                </span>
              ) : null}
              {chips.map((chip) => (
                <span
                  key={chip.key}
                  className="inline-flex items-center gap-1 rounded-full border border-[#c9a84c]/35 bg-[#c9a84c]/10 py-0.5 pl-2.5 pr-1 text-xs"
                  data-testid={`active-filter-${chip.key}`}
                >
                  <span className="text-muted-foreground">{chip.noun}</span>
                  {chip.profile ? (
                    <Link
                      to={chip.profile}
                      className="font-medium text-foreground underline-offset-2 hover:underline"
                      title={`Open ${chip.value} profile`}
                    >
                      {chip.value}
                    </Link>
                  ) : (
                    <span className="font-medium text-foreground">{chip.value}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setFilter(chip.key, "")}
                    aria-label={`Remove ${chip.noun} ${chip.value}`}
                    className="ml-0.5 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-[#c9a84c]/15 hover:text-foreground"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </span>
              ))}
              <span className="ml-auto flex flex-wrap items-center gap-4">
                {/* Secondary by construction: a text link beside "Clear all".
                    It carries the SCOPE the table is showing. */}
                {handoff && (
                  <Link
                    to={handoff.href}
                    onClick={() => play("pro-play.analysis.open")}
                    aria-label={`Graph ${handoff.entityLabel} in Explore Pro Data`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[#c9a84c] underline-offset-2 transition-colors hover:underline"
                  >
                    <LineChart className="h-3.5 w-3.5" aria-hidden />
                    Graph this
                  </Link>
                )}
                {activeCount > 0 && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                  >
                    Clear all
                  </button>
                )}
              </span>
            </div>
            {yearWasDefaulted ? (
              <p className="text-xs text-muted-foreground">
                Showing the latest season. Pick a league, champion, player or
                team to look across every year.
              </p>
            ) : null}
            {/* The graph is a different product with a narrower vocabulary.
                Naming what stays behind is what makes the action safe. */}
            {handoff && handoff.dropped.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Graph this covers {handoff.transferred.join(" · ")}. Staying
                with the table: {handoff.dropped.join(", ")}.
              </p>
            )}
          </div>
        )}
      </div>

      {/* -------------------------------------------------- aggregate strip */}
      {isPending ? (
        <div
          className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
          role="group"
          aria-label={`${config.label} summary loading`}
          aria-busy="true"
          data-testid="stats-strip-loading"
        >
          {config.strip.map((tile) => (
            <div
              key={tile.label}
              className="rounded-lg border border-border bg-card/60 p-3"
            >
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {tile.label}
              </div>
              <div className="mt-1 h-6 w-16 animate-pulse rounded bg-muted-foreground/20" />
            </div>
          ))}
        </div>
      ) : null}
      {data && !isError && (
        <div
          className={`mb-4 grid grid-cols-2 gap-2 transition-opacity sm:grid-cols-3 lg:grid-cols-5 ${
            updating ? "opacity-50" : ""
          }`}
          role="group"
          aria-label={`${config.label} summary`}
          aria-busy={updating || undefined}
        >
          {config.strip.map((tile) => (
            <Stat
              key={tile.label}
              label={tile.label}
              value={tile.format(data.aggregates[tile.key] ?? null)}
            />
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------ table */}
      {/* FOUR STATES, NEVER CONFUSED: loading (skeleton rows + a visible
          caption), results, zero results (says so, offers the way out), and
          error (says so, offers a retry). An empty table body is never shown
          on its own. */}
      <div
        className="relative rounded-xl border border-border bg-card/60"
        data-testid="stats-table"
        data-state={
          isPending ? "loading" : isError ? "error" : rows.length === 0 ? "empty" : updating ? "updating" : "ready"
        }
        aria-busy={isPending || updating || undefined}
      >
        {isPending ? (
          <div
            className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5 text-xs text-muted-foreground"
            role="status"
            data-testid="stats-table-loading"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#c9a84c]" aria-hidden />
            Loading {config.heading.toLowerCase()}… Search above already works.
          </div>
        ) : updating ? (
          <div
            className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5 text-xs text-muted-foreground"
            role="status"
            data-testid="stats-table-updating"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#c9a84c]" aria-hidden />
            Updating for the new filters…
          </div>
        ) : null}
        <Table className={updating ? "opacity-45 transition-opacity" : "transition-opacity"}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {config.columns.map((col) => {
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
            {/* `bg-muted-foreground/20` sits clear of the card at both ends of
                the pulse; `bg-muted` did not and read as an empty table. */}
            {isPending &&
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`} data-testid="stats-skeleton-row">
                  {config.columns.map((col) => (
                    <TableCell key={col.key}>
                      <div className="h-4 animate-pulse rounded bg-muted-foreground/20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isPending && isError && (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={config.columns.length}
                  className="py-10 text-center"
                  data-testid="stats-table-error"
                >
                  <p className="mb-1 inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <AlertTriangle className="h-4 w-4 text-[#c9a84c]" aria-hidden />
                    Couldn’t load {config.heading.toLowerCase()}.
                  </p>
                  <p className="mb-3 text-xs text-muted-foreground">
                    {(error as Error)?.message ??
                      "Statistics are unavailable right now."}{" "}
                    Your filters are kept.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => refetch()}>
                    Try again
                  </Button>
                </TableCell>
              </TableRow>
            )}

            {!isPending && !isError && rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={config.columns.length}
                  className="py-10 text-center"
                  data-testid="stats-table-empty"
                >
                  <p className="mb-1 text-sm font-medium text-foreground">
                    {`No ${config.unit} match these filters.`}
                  </p>
                  <p className="mb-3 text-xs text-muted-foreground">
                    The data loaded; this combination has no games. Remove a
                    filter above to widen it.
                  </p>
                  {activeCount > 0 ? (
                    <Button variant="outline" size="sm" onClick={clearAll}>
                      Clear all filters
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            )}

            {!isPending &&
              !isError &&
              rows.map((row) => (
                <TableRow key={config.rowKey(row)}>
                  {config.columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={`whitespace-nowrap ${
                        col.numeric ? "text-right tabular-nums" : "font-medium"
                      }`}
                    >
                      {col.cell ? col.cell(row) : col.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>

        {/* ------------------------------------------ coverage + pagination */}
        {data && !isError && data.total_rows > 0 && (
          <nav
            className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-3"
            aria-label={`${config.label} statistics pagination`}
          >
            <p className="text-xs text-muted-foreground" aria-live="polite">
              Page{" "}
              <span className="font-semibold text-foreground">
                {nf.format(data.page)}
              </span>{" "}
              of {nf.format(Math.max(data.total_pages, 1))} ·{" "}
              {nf.format(data.total_rows)} {config.unit}
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
                disabled={data.page <= 1 || updating}
                onClick={() => setPage(data.page - 1)}
                className="border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/10 disabled:opacity-40"
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" aria-hidden />{" "}
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={data.page >= data.total_pages || updating}
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

/**
 * A native select over a server-supplied list.
 *
 * WHILE THE LIST IS LOADING IT SAYS SO AND CANNOT BE USED. It used to render
 * "All" with an empty list — a control that looked ready, offered nothing,
 * and made a loading page read as an empty one. A value already in the URL
 * is still shown while loading, so a shared link reads correctly at once.
 */
function FilterSelect({
  label,
  value,
  onChange,
  options,
  anyLabel = "All",
  optionLabel = (v: string) => v,
  loading = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  anyLabel?: string;
  optionLabel?: (value: string) => string;
  loading?: boolean;
}) {
  const shown = loading ? (value ? [value] : []) : options;
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        disabled={loading}
        aria-busy={loading || undefined}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-progress disabled:opacity-60"
      >
        <option value="">{loading ? "Loading…" : anyLabel}</option>
        {shown.map((option) => (
          <option key={option} value={option}>
            {optionLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Champion identity: the icon from the existing Railway asset manifest plus
 *  the canonical name. No new asset system, and the row still reads if the
 *  manifest has not loaded or has no entry for this champion. */
/**
 * A player identity, linked to its canonical public profile.
 *
 * `row.player` IS `player_lp_page` — the same key the profile route takes and
 * the same key this table filters on — so the link is verbatim identity, not
 * a lookup. `proPlayProfileUrl` encodes it; Leaguepedia pages carry spaces
 * and parentheses ("Knight (Zhuo Ding)").
 *
 * The profile is PUBLIC. Do not reintroduce this link while any profile is
 * gated: every row would point a signed-out reader at a 403.
 */
function PlayerCell({ name }: { name: string }) {
  return (
    <Link
      to={proPlayProfileUrl("player", name)}
      className="font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-testid="player-profile-link"
    >
      {name}
    </Link>
  );
}

/** A team identity, linked to its canonical public profile. See PlayerCell —
 *  same helper, same verbatim-key reasoning, same public precondition. */
function TeamCell({ name }: { name: string }) {
  return (
    <Link
      to={proPlayProfileUrl("team", name)}
      className="font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-testid="team-profile-link"
    >
      {name}
    </Link>
  );
}

/** A champion identity, linked to its canonical public profile.
 *
 *  WRAPS the existing icon cell rather than replacing it: the icon and the
 *  name together are the identity, so the whole thing is one link and one tab
 *  stop. Same `proPlayProfileUrl` helper as the player and team columns. */
function ChampionCell({ name }: { name: string }) {
  const { data: manifest } = useChampionAssets();
  const icon = getChampionIcon(manifest, name);
  return (
    <Link
      to={proPlayProfileUrl("champion", name)}
      className="flex items-center gap-2 font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-testid="champion-profile-link"
    >
      {icon ? (
        <img
          src={icon}
          alt=""
          aria-hidden="true"
          width={20}
          height={20}
          loading="lazy"
          className="h-5 w-5 shrink-0 rounded border border-[#c9a84c]/25"
        />
      ) : (
        <span
          aria-hidden="true"
          className="h-5 w-5 shrink-0 rounded border border-[#c9a84c]/25 bg-[#c9a84c]/10"
        />
      )}
      {name}
    </Link>
  );
}
