import { Pause, Play, Volume1, Volume2, VolumeX } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  setRadioVolume,
  toggleRadioPlayback,
  useAcademyRadio,
  type RadioSnapshot,
} from "@/lib/audio/academy-radio";

/**
 * Academy Radio — the slim strip (Academy Pulse layout).
 *
 * The broadcast dock compressed to one ~40 px row so the Orrery's left column
 * can give its height to Academy Pulse: Play/Pause, the live track line, and
 * a compact volume slider. Like the dock and the navbar player it is pure UI
 * over the one shared transport (useAcademyRadio + the store's actions); it
 * never touches an <audio> element. Next is omitted: with a one-track
 * playlist it is a permanently disabled stub, and the HUD player still has it.
 */

const STATUS_LABEL: Record<RadioSnapshot["status"], string> = {
  idle: "Ready",
  ready: "Ready",
  loading: "Loading",
  playing: "Live",
  paused: "Ready",
  blocked: "Tune in to listen",
  failed: "Track unavailable",
};

export default function AcademyRadioStrip({ className }: { className?: string }) {
  const radio = useAcademyRadio();
  const isPlayingMusic = radio.isPlaying && !radio.muted;
  const volumePercent = Math.round(radio.volume * 100);
  const status = STATUS_LABEL[radio.status] + (radio.muted && radio.status !== "failed" ? " · Muted" : "");
  const VolumeIcon = radio.volume === 0 ? VolumeX : radio.volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      role="group"
      aria-label="Academy Radio"
      className={cn("academy-radio-strip", className)}
      data-playing={isPlayingMusic ? "true" : "false"}
      data-testid="academy-radio-strip"
    >
      <button
        type="button"
        onClick={() => toggleRadioPlayback()}
        aria-label={isPlayingMusic ? "Pause music" : "Play music"}
        className="academy-radio-strip-play"
        data-testid="academy-radio-strip-toggle"
      >
        {isPlayingMusic ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" className="translate-x-[1px]" />}
      </button>
      <div className="academy-radio-strip-track">
        <span className="academy-radio-strip-bars" aria-hidden="true" data-active={radio.isAudible ? "true" : "false"}>
          <i /><i /><i /><i />
        </span>
        <span className="academy-radio-strip-title">{radio.trackTitle}</span>
        <span className="academy-radio-strip-status">{status}</span>
      </div>
      <label className="academy-radio-strip-volume">
        <VolumeIcon aria-hidden="true" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={radio.volume}
          onChange={(event) => setRadioVolume(Number(event.target.value))}
          aria-label="Music volume"
          aria-valuetext={`${volumePercent} percent`}
          style={{ ["--vol" as string]: `${volumePercent}%` }}
          data-testid="academy-radio-strip-volume"
        />
      </label>
    </div>
  );
}
