import { useReducedMotion } from "framer-motion";
import { Pause, Play, SkipForward, Volume2, VolumeX } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  nextRadioTrack,
  pauseRadio,
  playRadio,
  setRadioVolume,
  toggleRadioMute,
  useAcademyRadio,
  type RadioSnapshot,
} from "@/lib/audio/academy-radio";

/**
 * Academy Radio — the broadcast dock.
 *
 * The compact control deck fixed to the base of the Academy Broadcast tome:
 * one flat strip with the transport row (play/pause first, then the current
 * track and its true state, then mute and the subdued Next) over a slim
 * volume row. The centerpiece above it establishes the Academy Broadcast
 * context, so the dock carries no plaque or repeated labels of its own.
 *
 * Pure UI, exactly like the navbar player: it never creates or touches an
 * <audio> element — it reads the shared snapshot through useAcademyRadio()
 * and drives the store's actions, so the dock, the navbar and the entrance
 * all operate one transport. Controls keep full accessible names but carry
 * no `title` attributes: native tooltips popping over the deck read as
 * browser chrome, and the state is already visible in text beside them.
 */

type Variant = "desktop" | "mobile";

/** Same wording as the navbar player, so the radio never disagrees with itself. */
const STATUS_LABEL: Record<RadioSnapshot["status"], string> = {
  idle: "Ready",
  ready: "Ready",
  loading: "Loading",
  playing: "Playing",
  paused: "Paused",
  blocked: "Press play to start",
  failed: "Track unavailable",
};

const controlButton =
  "inline-flex items-center justify-center rounded-full border transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0ac8ff] " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a1428] " +
  "disabled:opacity-35 disabled:cursor-not-allowed";

const sideButton =
  "border-[#c9a84c]/25 bg-transparent text-[#cfc4a5] hover:text-[#f0d78c] " +
  "hover:border-[#c9a84c]/60 " +
  "disabled:hover:text-[#cfc4a5] disabled:hover:border-[#c9a84c]/25";

const primaryButton =
  "border-[#c9a84c]/70 bg-gradient-to-b from-[#c9a84c]/30 to-[#78652f]/25 text-[#f0d78c] " +
  "shadow-[0_0_12px_rgba(201,168,76,0.25)] hover:border-[#e3d7b2] hover:text-[#f5e9c8] " +
  "hover:shadow-[0_0_18px_rgba(201,168,76,0.4)]";

/**
 * Tiny spectrum beside the track title. Decorative at a glance; the state it
 * signals is always also spelled out in the status text next to it, and under
 * reduced motion the bars hold still instead of pulsing.
 */
function SpectrumBars({
  active,
  still,
  className,
}: {
  active: boolean;
  still: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("h-3.5 w-5 shrink-0 items-end justify-center gap-[2px]", className)}
    >
      {[3, 1, 4, 2].map((seed, bar) => (
        <span
          key={bar}
          className={cn(
            "w-[2.5px] rounded-sm",
            active ? "bg-[#7ad6ff] opacity-90" : "bg-[#7ad6ff]/40",
            active && !still && "animate-pulse",
          )}
          style={{
            height: active ? `${6 + seed * 2}px` : "4px",
            ...(active && !still ? { animationDelay: `${bar * 140}ms` } : {}),
          }}
        />
      ))}
    </span>
  );
}

export default function AcademyRadioDock({
  variant = "desktop",
  className,
}: {
  variant?: Variant;
  className?: string;
}) {
  const radio = useAcademyRadio();
  const reducedMotion = useReducedMotion() === true;

  const suffix = variant === "desktop" ? "dock" : "dock-mobile";
  const nextNoteId = `academy-radio-${suffix}-next-note`;
  const statusLabel = STATUS_LABEL[radio.status];
  const statusLine =
    statusLabel + (radio.muted && radio.status !== "failed" ? " · Muted" : "");
  const volumePercent = Math.round(radio.volume * 100);

  return (
    <div
      role="group"
      aria-label="Academy Radio"
      data-testid={`academy-radio-${suffix}`}
      className={cn(
        "relative rounded-b-lg border border-t-0 border-[#c9a84c]/40",
        "bg-gradient-to-b from-[#0c1830] to-[#050d1c] px-3 pb-2.5 pt-2",
        className,
      )}
      style={{
        boxShadow:
          "inset 0 2px 6px rgba(0,0,0,0.5), 0 8px 18px rgba(0,0,0,0.45)",
      }}
    >
      {/* Seam with the tome above: a lit gold hinge line. */}
      <div
        aria-hidden
        className="absolute inset-x-2 top-0 h-px bg-gradient-to-r from-transparent via-[#c9a84c]/70 to-transparent"
      />

      {/* Transport row */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => (radio.isPlaying ? pauseRadio() : void playRadio())}
          aria-pressed={radio.isPlaying}
          aria-label={radio.isPlaying ? "Pause Academy Radio" : "Play Academy Radio"}
          className={cn(controlButton, primaryButton, "h-10 w-10 shrink-0")}
          data-testid={`academy-radio-playpause-${suffix}`}
        >
          {radio.isPlaying ? (
            <Pause className="h-[18px] w-[18px]" aria-hidden="true" />
          ) : (
            // Nudged right so the triangle reads centred in the round button.
            <Play className="h-[18px] w-[18px] translate-x-[1px]" aria-hidden="true" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {/* The desktop dock can run as narrow as ~200px inside the hub's
                central lane; there the bars would cost the title its room, so
                they only join from xl up. The mobile dock always has space. */}
            <SpectrumBars
              active={radio.isPlaying}
              still={reducedMotion}
              className={variant === "desktop" ? "hidden xl:flex" : "flex"}
            />
            <p
              className="truncate text-sm font-semibold text-[#f0e6d2]"
              style={{ fontFamily: '"Cinzel", "Trajan Pro", "EB Garamond", Georgia, serif' }}
            >
              {radio.trackTitle}
            </p>
          </div>
          <p className="truncate text-[10px] uppercase tracking-[0.16em] text-[#7ad6ff]/70">
            {statusLine}
          </p>
        </div>

        <button
          type="button"
          onClick={() => toggleRadioMute()}
          aria-pressed={radio.muted}
          aria-label={radio.muted ? "Unmute Academy Radio" : "Mute Academy Radio"}
          className={cn(controlButton, sideButton, "h-8 w-8 shrink-0")}
          data-testid={`academy-radio-mute-${suffix}`}
        >
          {radio.muted ? (
            <VolumeX className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Volume2 className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Volume row. Next lives here at the subdued end of the deck: with one
          track it is a disabled stub, and the transport row above keeps its
          full width for the track title. */}
      <div className="mt-1.5 flex items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-[10px] text-[#a09b8c]">
          <Volume2 className="h-3 w-3 shrink-0 text-[#c9a84c]/60" aria-hidden="true" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={radio.volume}
            onChange={(event) => setRadioVolume(Number(event.target.value))}
            aria-label="Music volume"
            aria-valuetext={`${volumePercent} percent`}
            className="h-1 w-full grow cursor-pointer accent-[#c9a84c]"
            data-testid={`academy-radio-volume-${suffix}`}
          />
          <span className="w-7 shrink-0 text-right tabular-nums">{volumePercent}%</span>
        </label>
        <button
          type="button"
          onClick={() => nextRadioTrack()}
          disabled={!radio.canGoNext}
          aria-label="Next track"
          aria-describedby={radio.canGoNext ? undefined : nextNoteId}
          className={cn(controlButton, sideButton, "h-6 w-6 shrink-0")}
          data-testid={`academy-radio-next-${suffix}`}
        >
          <SkipForward className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>

      {/* Rendered whenever Next is annotated, so aria-describedby never dangles. */}
      {!radio.canGoNext && (
        <span id={nextNoteId} className="sr-only">
          Only one track is available right now.
        </span>
      )}
    </div>
  );
}
