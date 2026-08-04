import React from "react";
import { Composition } from "remotion";
import { QuizVideo } from "./QuizVideo";
import { SAMPLE_QUIZ_VIDEO } from "./sample-data";
import { FPS, buildTimeline } from "./timing";
import type { QuizVideoData } from "./types";
import { Graph1RaceVideo } from "./graph1/Graph1RaceVideo";
import { SAMPLE_RACE_DATASET } from "./graph1/sample-data";
import {
  GRAPH1_FPS,
  GRAPH1_HEIGHT,
  GRAPH1_WIDTH,
  raceVideoTimingForDataset,
  type Graph1RaceVideoProps,
} from "./graph1/timing";

/**
 * Remotion root.
 *   QuizVideo  — 1920x1080 @ 60fps horizontal quiz video.
 *   Graph1Race — 1920x1080 @ 30fps GRAPH1 ranked bar race; ONE composition
 *                serves every launch configuration (Faker → champions,
 *                Azir → players) — the dataset arrives as an input prop.
 * Durations are computed from input props via calculateMetadata, so
 * `--props=<file>.json` renders automatically size to their content.
 * A 9:16 Shorts composition is a planned future addition (same data,
 * vertical scene layout).
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="QuizVideo"
        component={QuizVideo}
        width={1920}
        height={1080}
        fps={FPS}
        durationInFrames={buildTimeline(SAMPLE_QUIZ_VIDEO).totalFrames}
        defaultProps={{ data: SAMPLE_QUIZ_VIDEO }}
        calculateMetadata={({ props }) => ({
          durationInFrames: buildTimeline(props.data as QuizVideoData).totalFrames,
        })}
      />
      <Composition
        id="Graph1Race"
        component={Graph1RaceVideo}
        width={GRAPH1_WIDTH}
        height={GRAPH1_HEIGHT}
        fps={GRAPH1_FPS}
        durationInFrames={
          raceVideoTimingForDataset({ dataset: SAMPLE_RACE_DATASET }).totalFrames
        }
        defaultProps={{ dataset: SAMPLE_RACE_DATASET }}
        calculateMetadata={({ props }) => ({
          durationInFrames: raceVideoTimingForDataset(
            props as Graph1RaceVideoProps,
          ).totalFrames,
        })}
      />
    </>
  );
};
