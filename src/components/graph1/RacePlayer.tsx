/**
 * RacePlayer — wires dataset -> filters -> index -> cadence -> clock ->
 * engine -> UI.
 *
 * React state holds ONLY interactive inputs (playing / time / speed and the
 * control state); the visible frame is derived on every render from the
 * prebuilt immutable index via the pure engine. Nothing engine-derived is
 * copied into state through effects.
 *
 * Filtering happens BEFORE indexing, so the engine, cadence, colors and the
 * Remotion composition all keep operating on an ordinary event stream — there
 * is still one engine and one renderer.
 *
 * Control state is optional-controlled: pass `state`/`onStateChange` to hoist
 * it (the page does, so it can mirror it into the URL), or omit both and the
 * player manages its own.
 */
import { useMemo, useState } from "react";

import {
  resolveDisplayHints,
  resolveDisplayToggles,
  resolveValueDisplay,
  type VisualizationDataset,
} from "@/graph1/contract";
import {
  initialControlState,
  speedOptions as declaredSpeedOptions,
  topNOptions as declaredTopNOptions,
  type Graph1ControlState,
} from "@/graph1/controlState";
import { stateAt } from "@/graph1/engine";
import {
  deriveFacets,
  filteredDataset,
  type Graph1FilterState,
} from "@/graph1/filters";
import { buildRaceIndex } from "@/graph1/raceIndex";
import {
  buildCadence,
  DEFAULT_CADENCE,
  positionAtTime,
  timeAtPosition,
} from "@/graph1/timeline";
import { usePlaybackClock } from "@/graph1/usePlaybackClock";
import { useReducedMotion } from "@/graph1/useReducedMotion";
import RaceControls from "./RaceControls";
import RaceDisplayToggles from "./RaceDisplayToggles";
import RaceFilters from "./RaceFilters";
import RaceRenderer from "./RaceRenderer";

const LONG_DATE = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

function formatDate(occurredAt: string): string {
  return occurredAt.slice(0, 10);
}

function formatLongDate(occurredAt: string): string {
  return LONG_DATE.format(new Date(occurredAt));
}

export interface RacePlayerProps {
  dataset: VisualizationDataset;
  /** hoisted control state; omit both to let the player manage its own */
  state?: Graph1ControlState;
  onStateChange?: (next: Graph1ControlState) => void;
  /**
   * Routing key this payload came from. Supplied by the page; falls back to
   * deriving it from `dataset.id`, which is `<key>@<scope>`. Passing it
   * explicitly means the component never has to parse the id — and a dynamic
   * family key such as `player-champions:Faker` stays intact.
   */
  datasetKey?: string;
}

export default function RacePlayer({
  dataset,
  state: controlledState,
  onStateChange,
  datasetKey,
}: RacePlayerProps) {
  const hints = resolveDisplayHints(dataset);
  const controls = dataset.definition.controls;
  // dataset-declared toggle defaults, resolved by VALUE so a pre-Phase-2
  // payload keeps the appearance it always had
  const toggleDefaults = useMemo(() => resolveDisplayToggles(dataset), [dataset]);

  const [ownState, setOwnState] = useState<Graph1ControlState>(() =>
    initialControlState(
      datasetKey ?? dataset.id.split("@")[0],
      toggleDefaults,
      controls,
    ),
  );
  const state = controlledState ?? ownState;
  const setState = onStateChange ?? setOwnState;

  // heavy pure derivations, built once per (dataset, filter) pair
  const facets = useMemo(() => deriveFacets(dataset), [dataset]);
  const visible = useMemo(
    () => filteredDataset(dataset, state.filters),
    [dataset, state.filters],
  );
  const index = useMemo(() => buildRaceIndex(visible), [visible]);
  const cadence = useMemo(() => buildCadence(index, DEFAULT_CADENCE), [index]);

  const reducedMotion = useReducedMotion();
  const clock = usePlaybackClock(cadence.totalMs);

  const position = positionAtTime(cadence, clock.timeMs);
  // stateAt requires at least one event; an empty filter result renders the
  // recovery panel below instead of a race
  const frame =
    index.eventCount > 0
      ? stateAt(index, position, { topN: state.topN, reducedMotion })
      : null;

  const coverage = visible.coverage;
  const toggles = state.toggles;
  const ctx = frame?.currentContext;
  // progression datasets label positions with steps ("Level 7"), print scaled
  // stat values, and pace one level per beat; both resolve to null/absent on
  // every chronological dataset, whose rendering is unchanged
  const progression = index.progression;
  const valueDisplay = resolveValueDisplay(dataset);

  const setFilters = (filters: Graph1FilterState) =>
    setState({ ...state, filters });

  return (
    <section aria-label={dataset.definition.title} className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-bold">{dataset.definition.title}</h2>
        <p className="text-sm text-muted-foreground">
          {dataset.definition.metric.label} · {dataset.definition.scope.label} ·{" "}
          {progression ? (
            <>
              {coverage.distinctRankedEntityCount.toLocaleString()} champions ·{" "}
              {frame?.stepCount ?? progression.stepLabels.length}{" "}
              {progression.unitLabel.toLowerCase()}s
            </>
          ) : (
            <>
              {coverage.eligibleEventCount.toLocaleString()} games
              {coverage.firstEventAt && coverage.lastEventAt && (
                <>
                  {" · "}
                  {coverage.firstEventAt.slice(0, 10)} →{" "}
                  {coverage.lastEventAt.slice(0, 10)}
                </>
              )}
            </>
          )}
        </p>
        {frame && toggles.eventHeader && progression && (
          <div
            className="min-h-[3.5rem] text-sm font-semibold tabular-nums"
            aria-live="off"
            data-testid="event-header"
          >
            <p>
              <span className="text-2xl">{frame.stepLabel}</span>
              <span className="ml-2 text-muted-foreground">
                {frame.stepIndex + 1} of {frame.stepCount}
              </span>
            </p>
          </div>
        )}
        {frame && toggles.eventHeader && !progression && (
          hints.contextMode === "event-header" ? (
            <div
              className="min-h-[3.5rem] text-sm font-semibold tabular-nums"
              aria-live="off"
              data-testid="event-header"
            >
              <p>
                <span className="text-2xl">{frame.year}</span>
                <span className="ml-2 text-muted-foreground">
                  {toggles.dateLabel && `${formatLongDate(frame.occurredAt)} · `}
                  game {(frame.eventIndex + 1).toLocaleString()} of{" "}
                  {frame.eventCount.toLocaleString()}
                </span>
              </p>
              {toggles.contextLine && (
                <p className="font-normal text-muted-foreground">
                  {ctx!.tournament ?? ctx!.league ?? ""}
                  {ctx!.team && ctx!.opponent && (
                    <span className="ml-2 font-medium text-foreground">
                      {ctx!.team} vs. {ctx!.opponent}
                    </span>
                  )}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm font-semibold tabular-nums" aria-live="off">
              <span className="text-2xl">{frame.year}</span>
              <span className="ml-2 text-muted-foreground">
                {toggles.dateLabel && `${formatDate(frame.occurredAt)} · `}
                game {(frame.eventIndex + 1).toLocaleString()} of{" "}
                {frame.eventCount.toLocaleString()}
              </span>
            </p>
          )
        )}
      </header>

      {frame ? (
        <RaceRenderer
          frame={frame}
          entities={visible.entities}
          metricLabel={dataset.definition.metric.label}
          topN={state.topN}
          valueDisplay={valueDisplay}
          display={{
            showWinOverlay: toggles.winOverlay,
            showSecondaryEntityLabel:
              hints.showSecondaryEntityLabel && toggles.secondaryLabel,
            showEntityMedia: toggles.entityMedia,
            showRankNumber: toggles.rankNumber,
            showValueLabel: toggles.valueLabel,
          }}
        />
      ) : (
        <p
          role="status"
          data-testid="empty-race"
          className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground"
        >
          No games match these filters. Widen or clear them to see the race.
        </p>
      )}

      <RaceControls
        playing={clock.playing}
        speed={clock.speed}
        position={position}
        eventCount={index.stepCount}
        unitLabel={progression?.unitLabel ?? "game"}
        onPlay={clock.play}
        onPause={clock.pause}
        onRestart={clock.restart}
        onSpeed={clock.setSpeed}
        onSeekPosition={(p) => clock.seekTimeMs(timeAtPosition(cadence, p))}
        speedOptions={declaredSpeedOptions(controls)}
        topN={state.topN}
        topNOptions={declaredTopNOptions(controls)}
        onTopN={(topN) => setState({ ...state, topN })}
      />

      <div className="space-y-2">
        <RaceFilters
          specs={controls?.filters}
          facets={facets}
          state={state.filters}
          onChange={setFilters}
          matchedCount={visible.events.length}
          totalCount={dataset.events.length}
        />
        <RaceDisplayToggles
          toggles={toggles}
          defaults={toggleDefaults}
          onChange={(next) => setState({ ...state, toggles: next })}
          available={{
            winOverlay: toggleDefaults.winOverlay,
            secondaryLabel: hints.showSecondaryEntityLabel,
            contextLine: hints.contextMode === "event-header",
          }}
        />
      </div>
    </section>
  );
}
