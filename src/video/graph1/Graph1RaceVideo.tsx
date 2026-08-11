/**
 * Graph1RaceVideo — the ONE shared deterministic Remotion composition for
 * GRAPH1 ranked races. Both launch configurations (Faker → champions,
 * Azir → players) render through this component; the only thing that
 * changes between them is the `dataset` input prop (the raw backend
 * VisualizationDataset payload) plus presentation knobs (speed, topN).
 *
 * Determinism: every frame is a pure function of (props, frame number).
 *   useCurrentFrame() → positionAtFrame (src/graph1/timeline.ts) →
 *   stateAt (src/graph1/engine.ts) → RaceRenderer — the exact pipeline the
 * live /dev/graph1 player uses, minus the wall-clock playback hook.
 * Champion icons render through remotion's <Img>, which blocks frame
 * capture until the asset is decoded, so no frame can ship a half-loaded
 * avatar. Player datasets use initials media and never fetch.
 *
 * Timeline: lead-in hold (position 0, empty board under the title) →
 * race → outro hold on the final standings. Frame counts come from
 * ./timing, the same module calculateMetadata and the render script use.
 */
import React, { useMemo } from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from "remotion";

import RaceRenderer, {
  type RaceRendererImageComponent,
} from "../../components/graph1/RaceRenderer";
import {
  resolveDisplayHints,
  resolveDisplayToggles,
  resolveValueDisplay,
} from "../../graph1/contract";
import { stateAt } from "../../graph1/engine";
import { buildRaceIndex } from "../../graph1/raceIndex";
import {
  buildCadence,
  DEFAULT_CADENCE,
  positionAtFrame,
} from "../../graph1/timeline";
import {
  raceVideoTiming,
  resolveRaceVideoOptions,
  type Graph1RaceVideoProps,
} from "./timing";

/** Design-space height; the composition scales this to the output height so
 * the same layout serves any 16:9 target resolution. */
const LOGICAL_HEIGHT = 800;

const RemotionAvatarImg: RaceRendererImageComponent = ({
  src,
  alt,
  className,
}) => <Img src={src} alt={alt} className={className} />;

const LONG_DATE = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

export const Graph1RaceVideo: React.FC<Graph1RaceVideoProps> = (props) => {
  const { dataset } = props;
  const frameNumber = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const index = useMemo(() => buildRaceIndex(dataset), [dataset]);
  const cadence = useMemo(() => buildCadence(index, DEFAULT_CADENCE), [index]);
  const opts = resolveRaceVideoOptions(props);
  const timing = raceVideoTiming(cadence, props, fps);
  // SAME resolution the live player uses, so the two paths cannot diverge on
  // which layers a dataset shows
  const toggles = useMemo(() => resolveDisplayToggles(dataset), [dataset]);

  const raceFrame = Math.max(
    0,
    Math.min(timing.raceFrames, frameNumber - timing.leadInFrames),
  );
  const position =
    raceFrame >= timing.raceFrames
      ? index.stepCount
      : positionAtFrame(cadence, raceFrame, fps, opts.speed);
  const frame = stateAt(index, position, { topN: opts.topN });

  const hints = resolveDisplayHints(dataset);
  const coverage = dataset.coverage;
  const ctx = frame.currentContext;
  const progression = index.progression;
  const valueDisplay = resolveValueDisplay(dataset);

  const scale = height / LOGICAL_HEIGHT;
  const logicalWidth = width / scale;

  return (
    <AbsoluteFill className="dark bg-background text-foreground font-sans">
      <div
        style={{
          width: logicalWidth,
          height: LOGICAL_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <div className="mx-auto flex h-full max-w-[1200px] flex-col justify-center gap-4 px-10">
          <header className="space-y-1">
            <h1 className="text-2xl font-bold">{dataset.definition.title}</h1>
            <p className="text-sm text-muted-foreground">
              {dataset.definition.metric.label} ·{" "}
              {dataset.definition.scope.label} ·{" "}
              {progression ? (
                <>
                  {coverage.distinctRankedEntityCount.toLocaleString("en-US")}{" "}
                  champions · {frame.stepCount}{" "}
                  {progression.unitLabel.toLowerCase()}s
                </>
              ) : (
                <>
                  {coverage.eligibleEventCount.toLocaleString("en-US")} games
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
            {toggles.eventHeader && progression && (
              <div className="min-h-[3.5rem] text-sm font-semibold tabular-nums">
                <p>
                  <span className="text-3xl">{frame.stepLabel}</span>
                  <span className="ml-2 text-muted-foreground">
                    {frame.stepIndex + 1} of {frame.stepCount}
                  </span>
                </p>
              </div>
            )}
            {toggles.eventHeader && !progression && (
              <div className="min-h-[3.5rem] text-sm font-semibold tabular-nums">
                <p>
                  <span className="text-3xl">{frame.year}</span>
                  <span className="ml-2 text-muted-foreground">
                    {toggles.dateLabel &&
                      `${LONG_DATE.format(new Date(frame.occurredAt))} · `}
                    game {(frame.eventIndex + 1).toLocaleString("en-US")} of{" "}
                    {frame.eventCount.toLocaleString("en-US")}
                  </span>
                </p>
                {hints.contextMode === "event-header" && toggles.contextLine && (
                  <p className="font-normal text-muted-foreground">
                    {ctx.tournament ?? ctx.league ?? ""}
                    {ctx.team && ctx.opponent && (
                      <span className="ml-2 font-medium text-foreground">
                        {ctx.team} vs. {ctx.opponent}
                      </span>
                    )}
                  </p>
                )}
              </div>
            )}
          </header>

          <RaceRenderer
            frame={frame}
            entities={dataset.entities}
            metricLabel={dataset.definition.metric.label}
            topN={opts.topN}
            valueDisplay={valueDisplay}
            display={{
              showWinOverlay: toggles.winOverlay,
              showSecondaryEntityLabel:
                hints.showSecondaryEntityLabel && toggles.secondaryLabel,
              showEntityMedia: toggles.entityMedia,
              showRankNumber: toggles.rankNumber,
              showValueLabel: toggles.valueLabel,
            }}
            imageComponent={RemotionAvatarImg}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
