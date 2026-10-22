/**
 * Transport controls: restart, previous, play/pause, next, speed, readouts.
 * Pure presentation over `TheaterController`.
 */
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";

import { formatClock } from "@/lib/combat-theater/theater";
import { THEATER_SPEEDS, type TheaterController } from "@/lib/combat-theater/useTheaterController";

export function TheaterTransport({ controller, beatCount }: { controller: TheaterController; beatCount: number }) {
  const c = controller;
  return (
    <div className="ct-transport" role="group" aria-label="Playback controls" data-testid="theater-transport">
      <div className="ct-transport__group">
        <button type="button" className="ct-btn" onClick={c.restart} aria-label="Restart" title="Restart (Home)" data-testid="transport-restart">
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="ct-btn"
          onClick={c.prev}
          disabled={c.selectedIndex < 0}
          aria-label="Previous event"
          title="Previous event ([)"
          data-testid="transport-prev"
        >
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="ct-btn ct-btn--primary"
          onClick={c.toggle}
          aria-label={c.playing ? "Pause" : "Play"}
          aria-pressed={c.playing}
          title="Play / pause (Space)"
          data-testid="transport-play"
        >
          {c.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          <span>{c.playing ? "Pause" : c.atEnd ? "Replay" : "Play"}</span>
        </button>
        <button
          type="button"
          className="ct-btn"
          onClick={c.next}
          disabled={beatCount === 0 || c.selectedIndex >= beatCount - 1}
          aria-label="Next event"
          title="Next event (])"
          data-testid="transport-next"
        >
          <SkipForward className="h-4 w-4" />
        </button>
      </div>

      <div className="ct-transport__group">
        <span className="ct-kicker">Speed</span>
        <div className="ct-speed" role="group" aria-label="Playback speed">
          {THEATER_SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              className="ct-speed__btn"
              aria-pressed={c.speed === s}
              onClick={() => c.setSpeed(s)}
              data-testid={`speed-${s}`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      <div className="ct-transport__group ct-readout" data-testid="transport-readout">
        <span>
          event <strong>{c.selectedIndex + 1}</strong> / {beatCount}
        </span>
        <span aria-hidden>·</span>
        <span>
          <strong className="ct-num">{formatClock(c.time)}</strong> s
        </span>
      </div>
    </div>
  );
}
