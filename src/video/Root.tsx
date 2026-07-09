import React from "react";
import { Composition } from "remotion";
import { QuizVideo } from "./QuizVideo";
import { SAMPLE_QUIZ_VIDEO } from "./sample-data";
import { FPS, buildTimeline } from "./timing";
import type { QuizVideoData } from "./types";

/**
 * Remotion root. One composition for now:
 *   QuizVideo — 1920x1080 @ 60fps horizontal quiz video.
 * Duration is computed from input props via calculateMetadata, so
 * `--props=<file>.json` renders automatically size to their content.
 * A 9:16 Shorts composition is a planned future addition (same data,
 * vertical scene layout).
 */
export const RemotionRoot: React.FC = () => {
  return (
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
  );
};
