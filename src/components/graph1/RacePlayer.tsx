/**
 * RacePlayer — wires dataset -> index -> cadence -> clock -> engine -> UI.
 *
 * React state holds ONLY interactive inputs (playing / time / speed); the
 * visible frame is derived on every render from the prebuilt immutable
 * index via the pure engine. Nothing engine-derived is copied into state
 * through effects.
 */
import { useMemo } from "react";

import type { VisualizationDataset } from "@/graph1/contract";
import { stateAt } from "@/graph1/engine";
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
import RaceRenderer from "./RaceRenderer";

const TOP_N = 10;

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

export default function RacePlayer({
  dataset,
}: {
  dataset: VisualizationDataset;
}) {
  // heavy pure derivations, built once per dataset (measured: ms-scale)
  const index = useMemo(() => buildRaceIndex(dataset), [dataset]);
  const cadence = useMemo(
    () => buildCadence(index, DEFAULT_CADENCE),
    [index],
  );

  const reducedMotion = useReducedMotion();
  const clock = usePlaybackClock(cadence.totalMs);

  const position = positionAtTime(cadence, clock.timeMs);
  const frame = stateAt(index, position, {
    topN: TOP_N,
    reducedMotion,
  });

  const coverage = dataset.coverage;
  const hints = dataset.definition.display ?? {
    contextMode: "event-header" as const,
    showSecondaryEntityLabel: false,
  };
  const winsAvailable = dataset.events.some((e) => e.winsDelta !== undefined);
  const ctx = frame.currentContext;

  return (
    <section aria-label={dataset.definition.title} className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-bold">{dataset.definition.title}</h2>
        <p className="text-sm text-muted-foreground">
          {dataset.definition.metric.label} · {dataset.definition.scope.label} ·{" "}
          {coverage.eligibleEventCount.toLocaleString()} games ·{" "}
          {coverage.firstEventAt.slice(0, 10)} → {coverage.lastEventAt.slice(0, 10)}
        </p>
        {hints.contextMode === "event-header" ? (
          <div
            className="min-h-[3.5rem] text-sm font-semibold tabular-nums"
            aria-live="off"
            data-testid="event-header"
          >
            <p>
              <span className="text-2xl">{frame.year}</span>
              <span className="ml-2 text-muted-foreground">
                {formatLongDate(frame.occurredAt)} · game{" "}
                {(frame.eventIndex + 1).toLocaleString()} of{" "}
                {frame.eventCount.toLocaleString()}
              </span>
            </p>
            <p className="font-normal text-muted-foreground">
              {ctx.tournament ?? ctx.league ?? ""}
              {ctx.team && ctx.opponent && (
                <span className="ml-2 font-medium text-foreground">
                  {ctx.team} vs. {ctx.opponent}
                </span>
              )}
            </p>
          </div>
        ) : (
          <p className="text-sm font-semibold tabular-nums" aria-live="off">
            <span className="text-2xl">{frame.year}</span>
            <span className="ml-2 text-muted-foreground">
              {formatDate(frame.occurredAt)} · game{" "}
              {(frame.eventIndex + 1).toLocaleString()} of{" "}
              {frame.eventCount.toLocaleString()}
            </span>
          </p>
        )}
      </header>

      <RaceRenderer
        frame={frame}
        entities={dataset.entities}
        metricLabel={dataset.definition.metric.label}
        topN={TOP_N}
        display={{
          showWinOverlay: winsAvailable,
          showSecondaryEntityLabel: hints.showSecondaryEntityLabel,
        }}
      />

      <RaceControls
        playing={clock.playing}
        speed={clock.speed}
        position={position}
        eventCount={index.eventCount}
        onPlay={clock.play}
        onPause={clock.pause}
        onRestart={clock.restart}
        onSpeed={clock.setSpeed}
        onSeekPosition={(p) => clock.seekTimeMs(timeAtPosition(cadence, p))}
      />
    </section>
  );
}
