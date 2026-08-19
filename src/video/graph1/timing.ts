/**
 * GRAPH1 race video timing — single source of truth for MP4 duration.
 *
 * Both the Remotion composition (`Graph1RaceVideo`) and the render script
 * (`scripts/render-graph1-video.ts`) consume `raceVideoTiming`, so the
 * rendered frame count always matches the exported metadata exactly —
 * the same convention as `src/video/timing.ts` for the quiz pipeline.
 *
 * The race clock itself is the Phase 1 cadence (`src/graph1/timeline.ts`);
 * this module only frames it: lead-in hold → race → outro hold on the
 * final standings. Everything derives from input props — no wall clock.
 *
 * Relative imports on purpose: this file is also loaded by `tsx` from
 * scripts/, which does not resolve the Vite "@" alias.
 */
import type { VisualizationDataset } from "../../graph1/contract";
import { buildRaceIndex } from "../../graph1/raceIndex";
import {
  buildCadence,
  DEFAULT_CADENCE,
  type Cadence,
} from "../../graph1/timeline";

export const GRAPH1_FPS = 30;
export const GRAPH1_WIDTH = 1920;
export const GRAPH1_HEIGHT = 1080;

/** Composition input props. `dataset` is the raw backend payload
 * (VisualizationDataset), untouched — canonical bytes stay canonical.
 *
 * Declared as a type alias, not an interface, deliberately: Remotion's
 * `<Composition>` constrains its props to `Record<string, unknown>`, and only
 * a type alias gets the implicit index signature that satisfies it. As an
 * interface it silently failed the constraint, so `Props` fell back to
 * `Record<string, unknown>` and the required `dataset` stopped being
 * enforced at the composition boundary. */
export type Graph1RaceVideoProps = {
  dataset: VisualizationDataset;
  /** cadence playback multiplier (1 = 220ms/event); Azir-scale datasets
   * need 8–10x to fit a watchable runtime */
  speed?: number;
  topN?: number;
  leadInSeconds?: number;
  outroSeconds?: number;
  /** stat races only: interpolate the printed value between checkpoints
   * (the pre-polish look). Default false — the video shows only canonical
   * checkpoint values, consistent with the browser default. */
  smoothValues?: boolean;
};

export interface Graph1RaceVideoOptions {
  speed: number;
  topN: number;
  leadInSeconds: number;
  outroSeconds: number;
  smoothValues: boolean;
}

export function resolveRaceVideoOptions(
  props: Pick<
    Graph1RaceVideoProps,
    "speed" | "topN" | "leadInSeconds" | "outroSeconds" | "smoothValues"
  >,
): Graph1RaceVideoOptions {
  const speed = props.speed ?? 1;
  const topN = props.topN ?? 10;
  const leadInSeconds = props.leadInSeconds ?? 2;
  const outroSeconds = props.outroSeconds ?? 4;
  const smoothValues = props.smoothValues ?? false;
  if (!Number.isFinite(speed) || speed <= 0) {
    throw new Error(`GRAPH1 video: speed must be > 0, got ${speed}`);
  }
  if (!Number.isInteger(topN) || topN < 1) {
    throw new Error(`GRAPH1 video: topN must be a positive integer, got ${topN}`);
  }
  if (leadInSeconds < 0 || outroSeconds < 0) {
    throw new Error("GRAPH1 video: lead-in/outro seconds must be >= 0");
  }
  return { speed, topN, leadInSeconds, outroSeconds, smoothValues };
}

export interface Graph1RaceVideoTiming {
  fps: number;
  /** frames holding position 0 before the race starts */
  leadInFrames: number;
  /** frames covering the cadence at the requested speed */
  raceFrames: number;
  /** frames holding the final standings */
  outroFrames: number;
  totalFrames: number;
  totalSeconds: number;
  /** cadence total at 1x, before the speed divide */
  raceMsAtUnitSpeed: number;
}

export function raceVideoTiming(
  cadence: Cadence,
  props: Graph1RaceVideoProps,
  fps: number = GRAPH1_FPS,
): Graph1RaceVideoTiming {
  const opts = resolveRaceVideoOptions(props);
  const leadInFrames = Math.round(opts.leadInSeconds * fps);
  const raceFrames = Math.max(
    1,
    Math.ceil((cadence.totalMs / opts.speed / 1000) * fps),
  );
  const outroFrames = Math.round(opts.outroSeconds * fps);
  const totalFrames = leadInFrames + raceFrames + outroFrames;
  return {
    fps,
    leadInFrames,
    raceFrames,
    outroFrames,
    totalFrames,
    totalSeconds: totalFrames / fps,
    raceMsAtUnitSpeed: cadence.totalMs,
  };
}

/** Convenience for calculateMetadata / the render script: dataset in,
 * timing out. Index + cadence build is ms-scale even at Azir size. */
export function raceVideoTimingForDataset(
  props: Graph1RaceVideoProps,
  fps: number = GRAPH1_FPS,
): Graph1RaceVideoTiming {
  const index = buildRaceIndex(props.dataset);
  const cadence = buildCadence(index, DEFAULT_CADENCE);
  return raceVideoTiming(cadence, props, fps);
}
