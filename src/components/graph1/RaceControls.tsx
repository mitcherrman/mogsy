/**
 * Playback controls — semantic buttons + keyboard-operable seek range.
 * Purely interactive-state UI; every change flows back up as position/time,
 * never into engine state.
 */
import { Button } from "@/components/ui/button";
import { Pause, Play, RotateCcw } from "lucide-react";

import {
  FALLBACK_SPEED_OPTIONS,
  FALLBACK_TOP_N_OPTIONS,
} from "@/graph1/controlState";

export interface RaceControlsProps {
  playing: boolean;
  speed: number;
  /** fractional event position and its bounds */
  position: number;
  eventCount: number;
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
  onSpeed: (s: number) => void;
  onSeekPosition: (p: number) => void;
  /** dataset-declared choices; both fall back to the Phase 1 lists */
  speedOptions?: number[];
  topN?: number;
  topNOptions?: number[];
  onTopN?: (n: number) => void;
}

export default function RaceControls({
  playing,
  speed,
  position,
  eventCount,
  onPlay,
  onPause,
  onRestart,
  onSpeed,
  onSeekPosition,
  speedOptions,
  topN,
  topNOptions,
  onTopN,
}: RaceControlsProps) {
  const speeds = speedOptions?.length ? speedOptions : FALLBACK_SPEED_OPTIONS;
  const topNChoices = topNOptions?.length
    ? topNOptions
    : FALLBACK_TOP_N_OPTIONS;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          aria-pressed={playing}
          aria-label={playing ? "Pause playback" : "Play"}
          onClick={playing ? onPause : onPlay}
          className="focus-visible:ring-2"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label="Restart from the beginning"
          onClick={onRestart}
          className="focus-visible:ring-2"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      <label className="flex min-w-[200px] flex-1 items-center gap-2 text-xs">
        <span className="sr-only">Seek by game</span>
        <input
          type="range"
          min={0}
          max={eventCount}
          step={1}
          value={Math.floor(position)}
          aria-label="Seek by game"
          aria-valuetext={`Game ${Math.floor(position)} of ${eventCount}`}
          onChange={(e) => onSeekPosition(Number(e.target.value))}
          className="h-2 w-full flex-1 cursor-pointer accent-primary"
        />
        <output className="w-24 text-right tabular-nums text-muted-foreground">
          {Math.floor(position).toLocaleString()} / {eventCount.toLocaleString()}
        </output>
      </label>

      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        Speed
        <select
          aria-label="Playback speed"
          value={speed}
          onChange={(e) => onSpeed(Number(e.target.value))}
          className="rounded border border-border bg-background px-1.5 py-1 text-xs"
        >
          {speeds.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </label>

      {onTopN && topN !== undefined && (
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Rows
          <select
            aria-label="Rows shown"
            value={topN}
            onChange={(e) => onTopN(Number(e.target.value))}
            className="rounded border border-border bg-background px-1.5 py-1 text-xs"
          >
            {topNChoices.map((n) => (
              <option key={n} value={n}>
                Top {n}
              </option>
            ))}
          </select>
        </label>
      )}

      <span role="status" aria-live="polite" className="sr-only">
        {playing ? "Playing" : "Paused"}
      </span>
    </div>
  );
}
