import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Database,
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProChampions } from "@/hooks/useProChampions";
import { useProExplorer } from "@/hooks/useProExplorer";
import {
  EXPLORER_PAGE_SIZES,
  activeFilterCount,
  defaultSortForMode,
  filtersFromSearch,
  writeFiltersToSearch,
  type ExplorerAggregateRow,
  type ExplorerFilterOptions,
  type ExplorerFilters,
  type ExplorerMode,
  type ExplorerRawRow,
} from "@/lib/league-docs/explorer";
import { buildProChampionUrl } from "@/lib/league-docs/pro-data-links";

const GOLD = "#c9a84c";
const nf = new Intl.NumberFormat("en-US");
const inputCls =
  "w-full rounded-md border border-border bg-card/60 px-2 py-1.5 text-xs text-foreground focus:border-[#c9a84c]/60 focus:outline-none";

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.split(" ")[0] || null;
}

// --- Coverage / live-status banner -----------------------------------------

const STATUS_LABEL: Record<string, string> = {
  complete: "Complete historical data",
  in_progress: "Import in progress — rankings may change",
  pending: "Waiting for import",
  partial: "Partial coverage",
  no_data: "No data",
};

function CoverageBanner({ coverage }: {
  coverage: { year: number | null; coverage_status: string | null; is_current_year: boolean; data_as_of: string | null };
}) {
  const asOf = formatDate(coverage.data_as_of);
  if (coverage.year === null) {
    if (!asOf) return null;
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-2 text-[11px] text-muted-foreground">
        <CalendarClock className="h-3.5 w-3.5" style={{ color: GOLD }} aria-hidden />
        All represented years · data as of {asOf}
      </div>
    );
  }
  if (coverage.is_current_year) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
        <Radio className="h-3.5 w-3.5 animate-pulse" aria-hidden />
        <span className="font-semibold">Live snapshot</span>
        <span className="text-amber-200/80">
          {coverage.year} data is still being imported and rankings can change.
          {asOf ? ` Updated through: ${asOf}` : ""}
        </span>
      </div>
    );
  }
  if (coverage.coverage_status === "complete") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-teal-500/40 bg-teal-500/10 px-3 py-2 text-[11px] text-teal-300">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        <span className="font-semibold">Complete historical data</span>
        <span className="text-teal-200/80">{coverage.year} coverage is stable.</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-2 text-[11px] text-muted-foreground">
      <CalendarClock className="h-3.5 w-3.5" style={{ color: GOLD }} aria-hidden />
      {coverage.year}: {STATUS_LABEL[coverage.coverage_status ?? ""] ?? "Coverage status unknown"}
      {asOf ? ` · through ${asOf}` : ""}
    </div>
  );
}

// --- Summary metrics --------------------------------------------------------

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-bold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

// --- Sortable / plain table headers -----------------------------------------

function SortHeader({ label, sortKey, activeSort, order, onSort, align = "right" }: {
  label: string; sortKey: string; activeSort: string; order: "asc" | "desc";
  onSort: (key: string) => void; align?: "left" | "right";
}) {
  const active = activeSort === sortKey;
  const Icon = active ? (order === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th scope="col" className={`px-3 py-2.5 font-bold ${align === "right" ? "text-right" : "text-left"}`}>
      <button type="button" onClick={() => onSort(sortKey)} aria-pressed={active}
        className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""} ${active ? "text-[#c9a84c]" : "hover:text-foreground"}`}>
        <Icon className="h-3 w-3" aria-hidden />
        {label}
      </button>
    </th>
  );
}

function PlainHeader({ label, align = "left" }: { label: string; align?: "left" | "right" }) {
  return <th scope="col" className={`px-3 py-2.5 font-bold ${align === "right" ? "text-right" : "text-left"}`}>{label}</th>;
}

// --- Multi-select checklist -------------------------------------------------

function OptionChecklist({ options, selected, onToggle }: {
  options: { id: string; label: string | null; games?: number | null }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const set = new Set(selected);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = set.has(o.id);
        return (
          <button key={o.id} type="button" onClick={() => onToggle(o.id)} aria-pressed={on}
            className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
              on ? "border-[#c9a84c]/60 bg-[#c9a84c]/15 text-[#c9a84c]" : "border-border bg-card/60 text-muted-foreground hover:text-foreground"}`}>
            {o.label ?? o.id}
            {typeof o.games === "number" ? <span className="ml-1 opacity-60 tabular-nums">{nf.format(o.games)}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

// --- Main component ---------------------------------------------------------

export default function ProExplorer() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => filtersFromSearch(searchParams), [searchParams]);

  const { data, isPending, isError, isFetching, refetch } = useProExplorer(filters);
  const { data: championsData } = useProChampions();
  const champions = championsData?.champions ?? [];
  const options = data?.filter_options;

  const update = useCallback(
    (patch: Partial<ExplorerFilters>, resetPage = true) => {
      const nextF: ExplorerFilters = { ...filters, ...patch, ...(resetPage ? { page: 1 } : {}) };
      setSearchParams(writeFiltersToSearch(nextF, searchParams), { replace: true });
    },
    [filters, searchParams, setSearchParams],
  );

  const toggleInArray = (key: "league_groups" | "leagues" | "regions" | "tournament_families" | "tournaments" | "splits" | "stages", id: string) => {
    const cur = filters[key];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    // Editing a competition dimension flips the preset to Custom.
    const isComp = key === "league_groups" || key === "leagues" || key === "tournament_families" || key === "tournaments";
    update(isComp ? { [key]: next, competition_preset: "custom" } as Partial<ExplorerFilters> : ({ [key]: next } as Partial<ExplorerFilters>));
  };

  // Preset dropdown value: explicit preset, else Custom if any competition
  // dimension is set, else All imported.
  const hasCustomComp = filters.league_groups.length > 0 || filters.leagues.length > 0
    || filters.tournament_families.length > 0 || filters.tournaments.length > 0;
  const presetValue = filters.competition_preset ?? (hasCustomComp ? "custom" : "all-imported");

  const onPreset = (p: string) => {
    if (p === "custom") {
      update({ competition_preset: "custom" });
    } else if (p === "all-imported") {
      update({ competition_preset: null, league_groups: [], leagues: [], tournament_families: [], tournaments: [] });
    } else {
      // Named preset clears contradictory custom competition selections.
      update({ competition_preset: p, league_groups: [], leagues: [], tournament_families: [], tournaments: [] });
    }
  };

  // Debounced text filters.
  const [draft, setDraft] = useState({ player: filters.player ?? "", team: filters.team ?? "" });
  useEffect(() => {
    setDraft({ player: filters.player ?? "", team: filters.team ?? "" });
  }, [filters.player, filters.team]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const setText = (key: "player" | "team", value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => update({ [key]: value.trim() || null } as Partial<ExplorerFilters>), 400);
  };

  const resetFilters = () => {
    const next = new URLSearchParams();
    const view = searchParams.get("view");
    if (view) next.set("view", view);
    setSearchParams(next, { replace: true });
  };

  const setMode = (mode: ExplorerMode) => {
    if (mode === filters.mode) return;
    update({ mode, sort: defaultSortForMode(mode), order: "desc" });
  };
  const toggleSort = (key: string) => {
    if (filters.sort === key) update({ order: filters.order === "asc" ? "desc" : "asc" });
    else update({ sort: key, order: "desc" });
  };

  const pagination = data?.pagination;
  const totalPages = pagination?.total_pages ?? 0;
  const page = filters.page;
  const setPage = (p: number) => update({ page: p }, false);

  const activeCount = useMemo(() => activeFilterCount(filters), [filters]);
  const [advancedOpen, setAdvancedOpen] = useState(
    () => hasCustomComp || filters.splits.length > 0 || filters.stages.length > 0
      || filters.regions.length > 0 || filters.competition_preset === "custom"
      || Boolean(filters.team || filters.player || filters.role || filters.side
        || filters.result !== "all" || filters.date_from || filters.date_to),
  );

  const summary = useMemo(() => (options ? buildSummary(filters, options, presetValue) : []), [filters, options, presetValue]);

  const rows = data?.rows ?? [];
  const showEmpty = !isPending && !isError && rows.length === 0;

  return (
    <div className="space-y-4">
      {/* Basic filters */}
      <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Field label="Year">
            <select className={inputCls} value={filters.year ?? ""} onChange={(e) => update({ year: e.target.value ? Number(e.target.value) : null })}>
              <option value="">All years</option>
              {(options?.years ?? []).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </Field>
          <Field label="Competition">
            <select className={inputCls} value={presetValue} onChange={(e) => onPreset(e.target.value)}>
              {(options?.presets ?? [{ id: "all-imported", label: "All imported" }]).map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Champion">
            <select className={inputCls} value={filters.champion ?? ""} onChange={(e) => update({ champion: e.target.value || null })}>
              <option value="">All champions</option>
              {champions.map((c) => <option key={c.slug} value={c.slug}>{c.champion}</option>)}
            </select>
          </Field>
          <Field label="Patch">
            <select className={inputCls} value={filters.patch ?? ""} onChange={(e) => update({ patch: e.target.value || null })}>
              <option value="">All patches</option>
              {(options?.patches ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Event">
            <select className={inputCls} value={filters.event_type} onChange={(e) => update({ event_type: e.target.value as ExplorerFilters["event_type"] })}>
              <option value="all">Picks &amp; bans</option>
              <option value="pick">Picks only</option>
              <option value="ban">Bans only</option>
            </select>
          </Field>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
          <button type="button" onClick={() => setAdvancedOpen((v) => !v)} aria-expanded={advancedOpen}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#c9a84c]/40 px-2.5 py-1.5 text-xs font-semibold text-[#c9a84c] hover:bg-[#c9a84c]/10">
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            {advancedOpen ? "Hide advanced filters" : "Advanced filters"}
          </button>
          <div className="flex items-center gap-2">
            {activeCount > 0 && <span className="text-[11px] text-muted-foreground">{activeCount} active</span>}
            <Button type="button" variant="outline" size="sm" onClick={resetFilters}
              className="border-border text-muted-foreground hover:text-foreground">
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
            </Button>
          </div>
        </div>

        {summary.length > 0 && (
          <div className="text-[11px] text-muted-foreground" data-testid="filter-summary">
            <span className="font-semibold text-foreground/70">Active:</span> {summary.join(" · ")}
          </div>
        )}
      </div>

      {/* Advanced filters */}
      {advancedOpen && (
        <div className="rounded-xl border border-[#c9a84c]/30 bg-card/40 p-4 space-y-4" data-testid="advanced-panel">
          <AdvancedPanel filters={filters} options={options} update={update} toggle={toggleInArray} draft={draft} setText={setText} />
        </div>
      )}

      {/* Coverage / live status */}
      {data && <CoverageBanner coverage={data.coverage} />}

      {/* Summary metrics */}
      {data && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricTile label="Distinct games" value={nf.format(data.summary.distinct_games)} />
          <MetricTile label="Picks" value={nf.format(data.summary.picks)} />
          <MetricTile label="Bans" value={nf.format(data.summary.bans)} />
          <MetricTile label="Champions" value={nf.format(data.summary.unique_champions)} />
          <MetricTile label="Players" value={nf.format(data.summary.unique_players)} />
          <MetricTile label="Teams" value={nf.format(data.summary.unique_teams)} />
          <MetricTile label="Tournaments" value={nf.format(data.summary.tournaments)} />
          <MetricTile label="Date range" value={data.summary.earliest_match_date
            ? `${formatDate(data.summary.earliest_match_date)} → ${formatDate(data.summary.latest_match_date)}` : "—"} />
        </div>
      )}

      {/* Mode toggle + page size */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-border bg-card/60 p-0.5">
          {(["aggregate", "raw"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={filters.mode === m}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${filters.mode === m ? "bg-[#c9a84c]/15 text-[#c9a84c]" : "text-muted-foreground hover:text-foreground"}`}>
              {m === "aggregate" ? "Aggregates" : "Raw events"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {isFetching && !isPending && <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          <label className="flex items-center gap-1.5">
            Rows
            <select className="rounded-md border border-border bg-card/60 px-1.5 py-1 text-xs text-foreground"
              value={filters.page_size} onChange={(e) => update({ page_size: Number(e.target.value) })}>
              {EXPLORER_PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* Results */}
      {isPending ? (
        <div className="h-[360px] rounded-xl border border-border bg-card/40 animate-pulse" aria-busy="true" aria-label="Loading explorer results" />
      ) : isError ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
          <p className="text-sm text-muted-foreground">Couldn't load explorer results. Check your connection and try again.</p>
          <Button variant="outline" size="sm" className="mt-3 border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/10" onClick={() => refetch()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      ) : showEmpty ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
          <Database className="mx-auto mb-2 h-5 w-5 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">No rows match these filters.</p>
          <Button variant="outline" size="sm" className="mt-3 border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/10" onClick={resetFilters}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset filters
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card/60">
          {filters.mode === "aggregate"
            ? <AggregateTable rows={rows as ExplorerAggregateRow[]} filters={filters} onSort={toggleSort} />
            : <RawTable rows={rows as ExplorerRawRow[]} filters={filters} onSort={toggleSort} />}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.total_rows > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {nf.format(pagination.total_rows)} {filters.mode === "aggregate" ? "champions" : "events"} · page {page} of {Math.max(totalPages, 1)}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} className="border-border">
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="border-border">
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Advanced panel ---------------------------------------------------------

function AdvancedPanel({ filters, options, update, toggle, draft, setText }: {
  filters: ExplorerFilters;
  options: ExplorerFilterOptions | undefined;
  update: (patch: Partial<ExplorerFilters>, resetPage?: boolean) => void;
  toggle: (key: "league_groups" | "leagues" | "regions" | "tournament_families" | "tournaments" | "splits" | "stages", id: string) => void;
  draft: { player: string; team: string };
  setText: (key: "player" | "team", value: string) => void;
}) {
  const [leagueSearch, setLeagueSearch] = useState("");
  const [tourSearch, setTourSearch] = useState("");
  const groups = options?.league_groups ?? [];
  const selectedGroups = new Set(filters.league_groups);

  const tournaments = (options?.tournaments ?? []).filter((t) =>
    !tourSearch || (t.label ?? "").toLowerCase().includes(tourSearch.toLowerCase()));

  return (
    <>
      {/* Competition groups + leagues */}
      <section className="space-y-2">
        <SubHead>Competitions</SubHead>
        <input className={inputCls} placeholder="Search leagues…" value={leagueSearch} onChange={(e) => setLeagueSearch(e.target.value)} />
        <div className="space-y-2">
          {groups.map((g) => {
            const groupOn = selectedGroups.has(g.id);
            const leagues = g.leagues.filter((l) => !leagueSearch || l.label.toLowerCase().includes(leagueSearch.toLowerCase()));
            if (leagueSearch && leagues.length === 0) return null;
            return (
              <div key={g.id} className="rounded-lg border border-border bg-card/40 p-2.5">
                <label className="flex items-center gap-2 text-xs font-bold text-foreground">
                  <input type="checkbox" checked={groupOn} onChange={() => toggle("league_groups", g.id)} className="accent-[#c9a84c]" />
                  {g.label}
                  <span className="text-[10px] font-normal text-muted-foreground tabular-nums">{nf.format(g.games)} games</span>
                </label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {leagues.map((l) => {
                    const on = groupOn || filters.leagues.includes(l.id);
                    return (
                      <button key={l.id} type="button" disabled={groupOn}
                        onClick={() => toggle("leagues", l.id)} aria-pressed={on}
                        className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                          on ? "border-[#c9a84c]/60 bg-[#c9a84c]/15 text-[#c9a84c]" : "border-border bg-card/60 text-muted-foreground hover:text-foreground"} ${groupOn ? "opacity-60 cursor-default" : ""}`}
                        title={groupOn ? "Included via group" : undefined}>
                        {l.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="space-y-1.5">
          <SubHead>International family</SubHead>
          <OptionChecklist options={options?.tournament_families ?? []} selected={filters.tournament_families} onToggle={(id) => toggle("tournament_families", id)} />
        </section>
        <section className="space-y-1.5">
          <SubHead>Region</SubHead>
          <OptionChecklist options={options?.regions ?? []} selected={filters.regions} onToggle={(id) => toggle("regions", id)} />
        </section>
        <section className="space-y-1.5">
          <SubHead>Split</SubHead>
          <OptionChecklist options={options?.splits ?? []} selected={filters.splits} onToggle={(id) => toggle("splits", id)} />
        </section>
        <section className="space-y-1.5">
          <SubHead>Stage <span className="font-normal normal-case text-muted-foreground">(regular season is derived)</span></SubHead>
          <OptionChecklist options={options?.stages ?? []} selected={filters.stages} onToggle={(id) => toggle("stages", id)} />
        </section>
      </div>

      {/* Specific tournaments */}
      <section className="space-y-1.5">
        <SubHead>Specific tournaments</SubHead>
        <input className={inputCls} placeholder="Search tournaments…" value={tourSearch} onChange={(e) => setTourSearch(e.target.value)} />
        <div className="max-h-44 overflow-y-auto rounded-lg border border-border bg-card/40 p-2">
          <OptionChecklist
            options={tournaments.slice(0, 200).map((t) => ({ id: t.id, label: t.label, games: t.games }))}
            selected={filters.tournaments}
            onToggle={(id) => toggle("tournaments", id)}
          />
        </div>
      </section>

      {/* Row-level filters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Field label="Role">
          <select className={inputCls} value={filters.role ?? ""} onChange={(e) => update({ role: e.target.value || null })}>
            <option value="">All roles</option>
            {(options?.roles ?? []).map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Side">
          <select className={inputCls} value={filters.side ?? ""} onChange={(e) => update({ side: e.target.value || null })}>
            <option value="">Both sides</option>
            <option value="Blue">Blue</option>
            <option value="Red">Red</option>
          </select>
        </Field>
        <Field label="Result">
          <select className={inputCls} value={filters.result} onChange={(e) => update({ result: e.target.value as ExplorerFilters["result"] })}>
            <option value="all">Any result</option>
            <option value="win">Wins</option>
            <option value="loss">Losses</option>
          </select>
        </Field>
        <Field label="Team">
          <input className={inputCls} list="explorer-teams" value={draft.team} placeholder="Any team" onChange={(e) => setText("team", e.target.value)} />
          <datalist id="explorer-teams">{(options?.teams ?? []).slice(0, 1000).map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
        <Field label="Player">
          <input className={inputCls} value={draft.player} placeholder="Any player" onChange={(e) => setText("player", e.target.value)} />
        </Field>
        <Field label="From date">
          <input type="date" className={inputCls} value={filters.date_from ?? ""} onChange={(e) => update({ date_from: e.target.value || null })} />
        </Field>
        <Field label="To date">
          <input type="date" className={inputCls} value={filters.date_to ?? ""} onChange={(e) => update({ date_to: e.target.value || null })} />
        </Field>
      </div>
    </>
  );
}

function SubHead({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-wider font-bold text-[#c9a84c]">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

// --- Active-filter summary --------------------------------------------------

function buildSummary(f: ExplorerFilters, o: ExplorerFilterOptions, presetValue: string): string[] {
  const parts: string[] = [];
  const label = (list: { id: string; label: string | null }[] | undefined, id: string) =>
    (list ?? []).find((x) => x.id === id)?.label ?? id;
  const groups = o.league_groups ?? [];
  const allLeagues = groups.flatMap((g) => g.leagues);

  if (presetValue !== "custom" && presetValue !== "all-imported") {
    parts.push(label(o.presets, presetValue));
  } else {
    const comp = [
      ...f.league_groups.map((id) => label(groups, id)),
      ...f.leagues.map((id) => label(allLeagues, id)),
    ];
    if (comp.length) parts.push(comp.slice(0, 3).join(" + ") + (comp.length > 3 ? ` +${comp.length - 3}` : ""));
    if (f.tournament_families.length) parts.push(f.tournament_families.map((id) => label(o.tournament_families, id)).join(" + "));
    if (f.tournaments.length) parts.push(`${f.tournaments.length} tournament${f.tournaments.length > 1 ? "s" : ""}`);
  }
  if (f.regions.length) parts.push(f.regions.map((id) => label(o.regions, id)).join("/"));
  if (f.splits.length) parts.push(f.splits.map((id) => label(o.splits, id)).join("/"));
  if (f.stages.length) parts.push(f.stages.map((id) => label(o.stages, id)).join("/"));
  if (f.patch) parts.push(f.patch);
  if (f.champion) parts.push(f.champion);
  if (f.event_type !== "all") parts.push(f.event_type === "pick" ? "picks" : "bans");
  if (f.result !== "all") parts.push(f.result);
  return parts;
}

// --- Tables (unchanged from Phase 1) ----------------------------------------

function AggregateTable({ rows, filters, onSort }: {
  rows: ExplorerAggregateRow[]; filters: ExplorerFilters; onSort: (key: string) => void;
}) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
          <SortHeader label="Champion" sortKey="champion" activeSort={filters.sort} order={filters.order} onSort={onSort} align="left" />
          <SortHeader label="Picks" sortKey="picks" activeSort={filters.sort} order={filters.order} onSort={onSort} />
          <SortHeader label="Bans" sortKey="bans" activeSort={filters.sort} order={filters.order} onSort={onSort} />
          <SortHeader label="Presence" sortKey="presence" activeSort={filters.sort} order={filters.order} onSort={onSort} />
          <SortHeader label="Wins" sortKey="wins" activeSort={filters.sort} order={filters.order} onSort={onSort} />
          <SortHeader label="Losses" sortKey="losses" activeSort={filters.sort} order={filters.order} onSort={onSort} />
          <SortHeader label="Win rate" sortKey="win_rate" activeSort={filters.sort} order={filters.order} onSort={onSort} />
          <SortHeader label="Players" sortKey="unique_players" activeSort={filters.sort} order={filters.order} onSort={onSort} />
          <SortHeader label="Teams" sortKey="unique_teams" activeSort={filters.sort} order={filters.order} onSort={onSort} />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.slug} className="border-b border-border/60 last:border-0 hover:bg-[#c9a84c]/5 transition-colors">
            <td className="px-3 py-2">
              <Link to={buildProChampionUrl({ slug: r.slug, year: filters.year })}
                className="font-semibold text-foreground hover:text-[#c9a84c] underline decoration-[#c9a84c]/30 underline-offset-2">{r.champion}</Link>
            </td>
            <td className="px-3 py-2 text-right tabular-nums">{nf.format(r.picks)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{nf.format(r.bans)}</td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold">{nf.format(r.presence_games)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{nf.format(r.wins)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{nf.format(r.losses)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{r.win_rate === null ? "—" : `${r.win_rate.toFixed(1)}%`}</td>
            <td className="px-3 py-2 text-right tabular-nums">{nf.format(r.unique_players)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{nf.format(r.unique_teams)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EventBadge({ type }: { type: string | null }) {
  if (type === "ban") return <span className="rounded border border-red-500/30 bg-red-500/5 px-1.5 py-0.5 text-[10px] font-semibold text-red-300">Ban</span>;
  return <span className="rounded border border-teal-500/30 bg-teal-500/5 px-1.5 py-0.5 text-[10px] font-semibold text-teal-300">Pick</span>;
}

function ResultBadge({ result }: { result: "win" | "loss" | null }) {
  if (result === "win") return <span className="text-teal-300 font-semibold">Win</span>;
  if (result === "loss") return <span className="text-red-300 font-semibold">Loss</span>;
  return <span className="text-muted-foreground">—</span>;
}

function RawTable({ rows, filters, onSort }: {
  rows: ExplorerRawRow[]; filters: ExplorerFilters; onSort: (key: string) => void;
}) {
  return (
    <table className="w-full text-xs whitespace-nowrap">
      <thead>
        <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
          <SortHeader label="Date" sortKey="match_date" activeSort={filters.sort} order={filters.order} onSort={onSort} align="left" />
          <SortHeader label="Tournament" sortKey="tournament" activeSort={filters.sort} order={filters.order} onSort={onSort} align="left" />
          <SortHeader label="Patch" sortKey="patch" activeSort={filters.sort} order={filters.order} onSort={onSort} align="left" />
          <SortHeader label="Champion" sortKey="champion" activeSort={filters.sort} order={filters.order} onSort={onSort} align="left" />
          <SortHeader label="Event" sortKey="event_type" activeSort={filters.sort} order={filters.order} onSort={onSort} align="left" />
          <SortHeader label="Player" sortKey="player" activeSort={filters.sort} order={filters.order} onSort={onSort} align="left" />
          <SortHeader label="Role" sortKey="role" activeSort={filters.sort} order={filters.order} onSort={onSort} align="left" />
          <SortHeader label="Team" sortKey="team" activeSort={filters.sort} order={filters.order} onSort={onSort} align="left" />
          <PlainHeader label="Opponent" />
          <SortHeader label="Side" sortKey="side" activeSort={filters.sort} order={filters.order} onSort={onSort} align="left" />
          <PlainHeader label="Result" />
          <PlainHeader label="Source" />
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.game_id}-${r.champion}-${r.event_type}-${i}`} className="border-b border-border/60 last:border-0 hover:bg-[#c9a84c]/5 transition-colors">
            <td className="px-3 py-2 tabular-nums">{formatDate(r.match_date) ?? "—"}</td>
            <td className="px-3 py-2 max-w-[220px] truncate" title={r.tournament ?? undefined}>{r.tournament ?? "—"}</td>
            <td className="px-3 py-2">{r.patch ?? "—"}</td>
            <td className="px-3 py-2">
              <Link to={buildProChampionUrl({ slug: r.slug, year: filters.year })} className="font-semibold text-foreground hover:text-[#c9a84c]">{r.champion}</Link>
            </td>
            <td className="px-3 py-2"><EventBadge type={r.event_type} /></td>
            <td className="px-3 py-2">{r.player ?? "—"}</td>
            <td className="px-3 py-2">{r.role ?? "—"}</td>
            <td className="px-3 py-2">{r.team ?? "—"}</td>
            <td className="px-3 py-2">{r.opponent ?? "—"}</td>
            <td className="px-3 py-2">{r.side ?? "—"}</td>
            <td className="px-3 py-2"><ResultBadge result={r.result} /></td>
            <td className="px-3 py-2">
              {r.source_url ? <a href={r.source_url} target="_blank" rel="noreferrer" className="text-[#c9a84c] hover:underline">{r.source ?? "Source"}</a> : (r.source ?? "—")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
