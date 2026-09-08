/**
 * /lol/pro-play/graphs — Explore Pro Data.
 *
 * The product surface for GRAPH1. The operator page at `/dev/graph1` stays as
 * it is (it exposes the fixed races, the stat families and the `?api=`
 * override); this page is the one a reader is meant to find, and it speaks
 * only in product terms — a focus, a counterpart, a metric, a scope. No family
 * id, no policy name, no internal universe key ever reaches the screen or the
 * URL.
 *
 * Everything below the controls is the EXISTING engine: `RacePlayer` for
 * monotonic totals, `StatBoardExplorer` for ratios. Phase F changed discovery,
 * selection, URL state and query construction — not how a graph is drawn.
 *
 * Scoping is a REQUEST, not a browser-side pass: narrowing Faker to Worlds
 * fetches ~64 KB instead of the 520 KB career race.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, BarChart3 } from "lucide-react";

import SEOHead from "@/components/SEOHead";
import EntityPicker from "@/components/graph1/EntityPicker";
import FeaturedGraphs from "@/components/graph1/FeaturedGraphs";
import GraphBuilderControls from "@/components/graph1/GraphBuilderControls";
import RacePlayer from "@/components/graph1/RacePlayer";
import ScopeControls from "@/components/graph1/ScopeControls";
import StatBoardExplorer, {
  type StatBoardState,
} from "@/components/graph1/StatBoardExplorer";
import { Button } from "@/components/ui/button";
import {
  COMBINATIONS,
  datasetKeyFor,
  defaultCompare,
  defaultMetric,
  findCombination,
  graphTitle,
  metricOption,
  metricsFor,
  selectionFromDatasetKey,
  type Graph1CompareKind,
  type Graph1FocusKind,
  type Graph1MetricChoice,
  type Graph1Mode,
} from "@/graph1/builder";
import { resolveDisplayToggles, type Graph1DisplayToggles } from "@/graph1/contract";
import { defaultCardFor, type Graph1FeaturedCard } from "@/graph1/featured";
import {
  initialControlState,
  parseControlState,
  serializeControlState,
  type Graph1ControlState,
} from "@/graph1/controlState";
import {
  ALL_PRO_SCOPE,
  describeScope,
  isScoped,
  parseScope,
  writeScope,
  type Graph1Scope,
} from "@/graph1/scope";
import {
  ALL_ROWS,
  isSnapshotOrder,
  type Graph1RowCount,
  type Graph1SnapshotOrder,
} from "@/graph1/snapshotContract";
import { Graph1HttpError, useGraph1Dataset } from "@/graph1/useGraph1Dataset";
import {
  featuredFirst,
  useDebounced,
  useGraph1Champions,
  useGraph1PlayerSearch,
  useGraph1TeamSearch,
  type Graph1Entity,
} from "@/graph1/useGraph1Entities";
import {
  scopeLabelIndex,
  useGraph1ScopeValues,
} from "@/graph1/useGraph1ScopeValues";
import { useGraph1Snapshot } from "@/graph1/useGraph1Snapshot";
import { supportsWinsRace, winsRaceDataset } from "@/graph1/winsRace";

export const PRO_PLAY_GRAPHS_ROUTE = "/lol/pro-play/graphs";

/** URL parameter names this page owns. Public, concise and stable. */
const PARAM = {
  focus: "focus",
  compare: "vs",
  entity: "e",
  mode: "mode",
  metric: "metric",
} as const;

/** Board parameters, shared with the operator page so a link means the same
 * thing on both. Kept outside `controlState`'s set, which it re-serializes. */
const BOARD_PARAM = { order: "order", rows: "rows", find: "find" } as const;
const BOARD_ROW_COUNTS: Graph1RowCount[] = [5, 10, 15, 20, ALL_ROWS];
const DEFAULT_BOARD_ROW_COUNT: Graph1RowCount = 10;
const DEFAULT_BOARD_ORDER: Graph1SnapshotOrder = "highest";
const MAX_FIND_LENGTH = 40;
const MAX_CHAMPION_ROWS = 40;

const FOCUS_KINDS: Graph1FocusKind[] = ["player", "team", "champion"];

function isFocusKind(value: string | null): value is Graph1FocusKind {
  return FOCUS_KINDS.includes(value as Graph1FocusKind);
}

function parseRowCount(raw: string | null): Graph1RowCount {
  if (raw === ALL_ROWS) return ALL_ROWS;
  const numeric = Number(raw);
  return BOARD_ROW_COUNTS.includes(numeric) ? numeric : DEFAULT_BOARD_ROW_COUNT;
}

/**
 * The whole selection, read out of the URL.
 *
 * Total: every malformed or unknown value falls back to a valid selection
 * rather than an error page, and an unknown combination cannot survive parsing
 * — so a hand-edited URL always resolves to a graph that exists.
 *
 * `?d=` is accepted as an alias for a raw dataset key. That is what keeps a
 * pre-Phase-F operator-page link working here instead of being rejected.
 */
export function parseSelection(params: URLSearchParams) {
  const fromKey = selectionFromDatasetKey(params.get("d") ?? undefined);

  const focus: Graph1FocusKind = isFocusKind(params.get(PARAM.focus))
    ? (params.get(PARAM.focus) as Graph1FocusKind)
    : (fromKey?.combination.focus ?? "player");

  const requested = params.get(PARAM.compare) as Graph1CompareKind | null;
  const combination =
    (requested ? findCombination(focus, requested) : undefined) ??
    (fromKey && fromKey.combination.focus === focus
      ? fromKey.combination
      : undefined) ??
    findCombination(focus, defaultCompare(focus))!;

  const mode: Graph1Mode =
    combination.modes && (params.get(PARAM.mode) === "bans" || fromKey?.mode === "bans")
      ? "bans"
      : "picks";

  const card = defaultCardFor(focus, combination.compare);
  const entityId =
    params.get(PARAM.entity)?.trim() ||
    (fromKey && fromKey.combination.familyId === combination.familyId
      ? fromKey.entityId
      : undefined) ||
    card?.entityId ||
    "";

  const requestedMetric = params.get(PARAM.metric) as Graph1MetricChoice | null;
  const metric =
    metricsFor(combination, mode).find((m) => m.id === requestedMetric)?.id ??
    defaultMetric(combination, mode);

  return { focus, combination, mode, entityId, metric };
}

/** A URL for one selection. Used by the featured cards and by every commit. */
export function selectionHref(card: Graph1FeaturedCard): string {
  const params = new URLSearchParams();
  params.set(PARAM.focus, card.focus);
  params.set(PARAM.compare, card.compare);
  params.set(PARAM.entity, card.entityId);
  if (card.mode === "bans") params.set(PARAM.mode, "bans");
  const combination = findCombination(card.focus, card.compare);
  // Only name the metric when it is not what the combination lands on, so a
  // shared link stays as short as what the reader actually chose.
  if (combination && card.metric !== defaultMetric(combination, card.mode)) {
    params.set(PARAM.metric, card.metric);
  }
  writeScope(params, card.scope);
  return `${PRO_PLAY_GRAPHS_ROUTE}?${params.toString()}`;
}

function Notice({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "error";
  children: React.ReactNode;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          : "text-sm text-muted-foreground"
      }
    >
      {children}
    </p>
  );
}

export default function ProPlayGraphs() {
  const [searchParams, setSearchParams] = useSearchParams();

  const selection = useMemo(() => parseSelection(searchParams), [searchParams]);
  const { focus, combination, mode, entityId, metric } = selection;
  const scope = useMemo(() => parseScope(searchParams), [searchParams]);
  const active = metricOption(combination, mode, metric)!;
  const isBoard = active.viz === "board";

  const datasetKey = entityId ? datasetKeyFor(combination, entityId, mode) : "";

  // --- data ---------------------------------------------------------------
  const scopeValues = useGraph1ScopeValues();
  const race = useGraph1Dataset(datasetKey, undefined, {
    enabled: Boolean(datasetKey) && !isBoard,
    scope,
  });
  const board = useGraph1Snapshot(datasetKey, undefined, {
    enabled: Boolean(datasetKey) && isBoard,
    scope,
    metric: active.apiMetric,
  });

  const loading = isBoard ? board.isLoading : race.isLoading;
  const error = (isBoard ? board.error : race.error) as Error | null;

  /**
   * The race actually rendered.
   *
   * "Wins" is the same payload ranked by cumulative wins — the backend
   * declares both count metrics on one payload precisely so the switch costs
   * no request. Offered only when the payload can honestly support it.
   */
  const raceDataset = useMemo(() => {
    if (!race.data) return undefined;
    return metric === "wins" && supportsWinsRace(race.data)
      ? winsRaceDataset(race.data)
      : race.data;
  }, [race.data, metric]);

  // --- URL commits --------------------------------------------------------
  /**
   * Write a selection into the URL.
   *
   * Changing WHAT is graphed pushes, so Back/Forward walks the graphs a reader
   * looked at. Nudging a control replaces, so Back does not walk every tweak.
   */
  const commitSelection = useCallback(
    (
      next: Partial<{
        focus: Graph1FocusKind;
        compare: Graph1CompareKind;
        entityId: string;
        mode: Graph1Mode;
        metric: Graph1MetricChoice;
        scope: Graph1Scope;
      }>,
      { push = true }: { push?: boolean } = {},
    ) => {
      const focusNext = next.focus ?? focus;
      const compareNext =
        next.compare ??
        (next.focus ? defaultCompare(next.focus) : combination.compare);
      const combinationNext =
        findCombination(focusNext, compareNext) ??
        findCombination(focusNext, defaultCompare(focusNext))!;
      const modeNext = combinationNext.modes ? (next.mode ?? mode) : "picks";

      // A focus change means a different KIND of entity: an lp_page is not a
      // team key. Fall back to the configured default rather than carrying an
      // id the new family will 404 on.
      const entityNext =
        next.entityId ??
        (next.focus || next.compare
          ? (defaultCardFor(focusNext, compareNext)?.entityId ?? entityId)
          : entityId);

      // Likewise a metric: "Ban rate" means nothing on a pick graph. Keep the
      // reader's choice when the new combination still supports it, otherwise
      // land on that combination's own default.
      const wanted = next.metric ?? metric;
      const metricNext =
        metricsFor(combinationNext, modeNext).find((m) => m.id === wanted)?.id ??
        defaultMetric(combinationNext, modeNext);

      const params = new URLSearchParams();
      params.set(PARAM.focus, focusNext);
      params.set(PARAM.compare, compareNext);
      if (entityNext) params.set(PARAM.entity, entityNext);
      if (modeNext === "bans") params.set(PARAM.mode, "bans");
      if (metricNext !== defaultMetric(combinationNext, modeNext)) {
        params.set(PARAM.metric, metricNext);
      }
      writeScope(params, next.scope ?? scope);
      setSearchParams(params, { replace: !push });
    },
    [focus, combination, mode, entityId, metric, scope, setSearchParams],
  );

  // --- race control state (top-N, toggles) --------------------------------
  const toggleDefaults = useMemo<Graph1DisplayToggles>(
    () =>
      raceDataset
        ? resolveDisplayToggles(raceDataset)
        : {
            winOverlay: true,
            eventHeader: true,
            contextLine: true,
            entityMedia: true,
            rankNumber: true,
            valueLabel: true,
            dateLabel: true,
            secondaryLabel: true,
            exactValues: true,
          },
    [raceDataset],
  );
  const controls = raceDataset?.definition.controls;

  const controlState = useMemo<Graph1ControlState>(
    () =>
      parseControlState(searchParams, toggleDefaults, {
        datasetKey: datasetKey || "graph",
        controls,
      }),
    [searchParams, toggleDefaults, datasetKey, controls],
  );

  const commitControlState = useCallback(
    (next: Graph1ControlState) => {
      // `serializeControlState` drops the parameters it owns and preserves the
      // rest, so the selection and the scope ride through untouched.
      setSearchParams(
        serializeControlState(next, toggleDefaults, {
          controls,
          preserve: searchParams,
        }),
        { replace: true },
      );
    },
    [setSearchParams, toggleDefaults, controls, searchParams],
  );

  const boardState = useMemo<StatBoardState>(() => {
    const order = searchParams.get(BOARD_PARAM.order);
    return {
      order: isSnapshotOrder(order) ? order : DEFAULT_BOARD_ORDER,
      rowCount: parseRowCount(searchParams.get(BOARD_PARAM.rows)),
      find: searchParams.get(BOARD_PARAM.find)?.slice(0, MAX_FIND_LENGTH) ?? undefined,
    };
  }, [searchParams]);

  const commitBoardState = useCallback(
    (next: StatBoardState) => {
      const params = new URLSearchParams(searchParams);
      if (next.order === DEFAULT_BOARD_ORDER) params.delete(BOARD_PARAM.order);
      else params.set(BOARD_PARAM.order, next.order);
      if (next.rowCount === DEFAULT_BOARD_ROW_COUNT) params.delete(BOARD_PARAM.rows);
      else params.set(BOARD_PARAM.rows, String(next.rowCount));
      const find = next.find?.trim();
      if (find) params.set(BOARD_PARAM.find, find.slice(0, MAX_FIND_LENGTH));
      else params.delete(BOARD_PARAM.find);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  // --- entity discovery ---------------------------------------------------
  const [query, setQuery] = useState("");
  // A query typed for players means nothing for champions.
  useEffect(() => setQuery(""), [focus]);
  const debounced = useDebounced(query);

  const players = useGraph1PlayerSearch(debounced, undefined, focus === "player");
  const teams = useGraph1TeamSearch(debounced, undefined, focus === "team");
  const champions = useGraph1Champions(undefined, focus === "champion");

  // 171 champions arrive once and filter locally, so typing costs no requests.
  const championOptions = useMemo(() => {
    const all = champions.data?.entities ?? [];
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? all.filter(
          (c) => c.label.toLowerCase().includes(needle) || c.id.includes(needle),
        )
      : all;
    return {
      rows: matches.slice(0, MAX_CHAMPION_ROWS),
      hidden: Math.max(0, matches.length - MAX_CHAMPION_ROWS),
    };
  }, [champions.data, query]);

  const picker = {
    player: {
      label: "Player",
      placeholder: "Search players…",
      // Highlighted entities lead; every other pro stays one scroll away.
      options: featuredFirst(players.data?.entities ?? []),
      loading: players.isLoading || players.isFetching,
      error: Boolean(players.error),
      hidden: (players.data?.entities.length ?? 0) >= (players.data?.limit ?? 25) ? 1 : 0,
    },
    team: {
      label: "Team",
      placeholder: "Search teams…",
      options: featuredFirst(teams.data?.entities ?? []),
      loading: teams.isLoading || teams.isFetching,
      error: Boolean(teams.error),
      hidden: (teams.data?.entities.length ?? 0) >= (teams.data?.limit ?? 25) ? 1 : 0,
    },
    champion: {
      label: "Champion",
      placeholder: "Search champions…",
      options: championOptions.rows,
      loading: champions.isLoading,
      error: Boolean(champions.error),
      hidden: championOptions.hidden,
    },
  }[focus];

  // --- copy ---------------------------------------------------------------
  const loaded = isBoard ? board.data : raceDataset;
  /**
   * The focus entity's name, best-available.
   *
   * The loaded payload is authoritative (it carries the canonical display
   * name), the discovery row is the good intermediate, and the raw id is the
   * last resort — so the heading is right immediately and never flashes a
   * lowercase slug like "nautilus" while the graph is in flight.
   */
  const focusName =
    loaded?.entities[loaded.definition.focusEntity.id]?.displayName ??
    picker.options.find((e) => e.id === entityId)?.label ??
    entityId;
  const title = graphTitle(combination, focusName, metric, mode);
  const subtitle = describeScope(scope, {
    league: scope.league ? scopeLabelIndex(scopeValues.data)[scope.league] : undefined,
    tournament: scope.tournament
      ? scopeLabelIndex(scopeValues.data)[scope.tournament]
      : undefined,
    region: scope.region ? scopeLabelIndex(scopeValues.data)[scope.region] : undefined,
  });

  const emptyRace = Boolean(raceDataset && raceDataset.events.length === 0);
  const emptyBoard = Boolean(board.data && board.data.rows.length === 0);
  const empty = isBoard ? emptyBoard : emptyRace;

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Explore Pro Data | Mogzy"
        description="Build and share graphs from real professional League of Legends match history — players, teams, champions, picks and bans."
        path={PRO_PLAY_GRAPHS_ROUTE}
      />
      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <Link
          to="/lol/pro-play"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Pro Play
        </Link>

        <header className="mb-6">
          <div className="mb-2 flex items-center gap-3">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#c9a84c]/30 bg-[#c9a84c]/10"
              aria-hidden="true"
            >
              <BarChart3 className="h-5 w-5 text-[#c9a84c]" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          </div>
          <p className="text-muted-foreground">{subtitle}</p>
        </header>

        <div className="space-y-5 rounded-lg border border-border/60 bg-card/40 p-4">
          <GraphBuilderControls
            focus={focus}
            combination={combination}
            mode={mode}
            metric={metric}
            onFocus={(next) => commitSelection({ focus: next })}
            onCompare={(next) => commitSelection({ compare: next })}
            onMode={(next) => commitSelection({ mode: next })}
            onMetric={(next) => commitSelection({ metric: next }, { push: false })}
          />

          <EntityPicker
            label={picker.label}
            options={picker.options}
            selectedId={entityId}
            selectedLabel={focusName}
            onSelect={(entity: Graph1Entity) =>
              commitSelection({ entityId: entity.id })
            }
            query={query}
            onQueryChange={setQuery}
            placeholder={picker.placeholder}
            loading={picker.loading}
            error={picker.error}
            hiddenCount={picker.hidden}
          />

          <ScopeControls
            scope={scope}
            values={scopeValues.data}
            loading={scopeValues.isLoading}
            error={Boolean(scopeValues.error)}
            onChange={(next) => commitSelection({ scope: next }, { push: false })}
          />
        </div>

        <div className="mt-6 space-y-4">
          {loading && <Notice>Loading graph…</Notice>}

          {error && <GraphError error={error} onClear={() => commitSelection({ scope: ALL_PRO_SCOPE }, { push: false })} scoped={isScoped(scope)} />}

          {!error && empty && (
            <div
              role="status"
              data-testid="graph1-empty"
              className="space-y-3 rounded-md border border-dashed border-border px-4 py-8 text-center"
            >
              <p className="text-sm text-muted-foreground">
                No qualifying pro games for this combination.
              </p>
              {isScoped(scope) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    commitSelection({ scope: ALL_PRO_SCOPE }, { push: false })
                  }
                >
                  Show all pro play
                </Button>
              )}
            </div>
          )}

          {!error && !empty && isBoard && board.data && (
            <StatBoardExplorer
              key={board.data.id}
              dataset={board.data}
              state={boardState}
              onStateChange={commitBoardState}
              rowCountOptions={BOARD_ROW_COUNTS}
            />
          )}

          {!error && !empty && !isBoard && raceDataset && (
            <RacePlayer
              key={raceDataset.id}
              dataset={raceDataset}
              datasetKey={datasetKey}
              state={controlState}
              onStateChange={commitControlState}
              // Scope is a SERVER-side predicate here; a second client-side
              // filter would only narrow what was already downloaded.
              showFilters={false}
            />
          )}
        </div>

        <div className="mt-10">
          <FeaturedGraphs hrefFor={selectionHref} />
        </div>
      </div>
    </div>
  );
}

/**
 * What went wrong, in the reader's terms.
 *
 * The 409 is the one that matters: the backend REFUSED a ratio because the
 * ban coverage underneath that scope is incomplete, and the whole point of
 * that refusal is that no trustworthy number exists. Never soften it into a
 * plausible-looking figure or a silent fallback.
 */
function GraphError({
  error,
  scoped,
  onClear,
}: {
  error: Error;
  scoped: boolean;
  onClear: () => void;
}) {
  const status = error instanceof Graph1HttpError ? error.status : undefined;
  const detail = error instanceof Graph1HttpError ? error.detail : undefined;

  let message: string;
  if (status === 409) {
    message =
      "This rate is unavailable for this scope: the underlying ban coverage " +
      "is incomplete, so the number would be misleading. Try a wider scope or " +
      "a different metric.";
  } else if (status === 404) {
    message =
      "We could not find that player, team or champion in professional play. " +
      "Pick another from the search above.";
  } else if (status === 400) {
    message =
      "That combination is not something we can graph. Try a different metric " +
      "or clear the scope.";
  } else {
    message =
      "The graph could not be loaded right now. Please try again in a moment.";
  }

  return (
    <div className="space-y-3">
      <Notice tone="error">{message}</Notice>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      {scoped && (status === 409 || status === 400) && (
        <Button type="button" size="sm" variant="outline" onClick={onClear}>
          Show all pro play
        </Button>
      )}
    </div>
  );
}
