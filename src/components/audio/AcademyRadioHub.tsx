import { useReducedMotion } from "framer-motion";
import { Pause, Play, Radio, SkipForward, Volume2, VolumeX } from "lucide-react";

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
 * Academy Radio — the hub broadcast console.
 *
 * The prominent /lol face of the radio: an enchanted academy broadcast device
 * in the hub's own Hextech language (chamfered silhouette, layered navy
 * surface, gold frame, cyan glass). Pure UI, exactly like the navbar player —
 * it never creates or touches an <audio> element, it reads the shared snapshot
 * through useAcademyRadio() and drives the store's actions, so this console,
 * the navbar row and the entrance all operate one transport.
 *
 * Two layouts, both driven by the same snapshot:
 *   "console" — the upright device for the desktop hub's central lane. It is
 *               absolutely positioned by the hub, so it costs the book grid no
 *               layout height.
 *   "bar"     — the compact horizontal card for the mobile hub list.
 */

type Layout = "console" | "bar";

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

/** Chamfered Hextech silhouette shared with HexPanelLink. */
const PANEL_CLIP =
  "polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)";
const SCREEN_CLIP =
  "polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)";

const controlButton =
  "inline-flex items-center justify-center rounded-full border transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0ac8ff] " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a1428] " +
  "disabled:opacity-40 disabled:cursor-not-allowed";

const sideButton =
  "border-[#c9a84c]/25 bg-[#c9a84c]/5 text-[#cfc4a5] hover:text-[#f0d78c] " +
  "hover:border-[#c9a84c]/60 hover:bg-[#c9a84c]/10 " +
  "disabled:hover:text-[#cfc4a5] disabled:hover:border-[#c9a84c]/25 disabled:hover:bg-[#c9a84c]/5";

const primaryButton =
  "border-[#c9a84c]/70 bg-gradient-to-b from-[#c9a84c]/30 to-[#78652f]/25 text-[#f0d78c] " +
  "shadow-[0_0_14px_rgba(201,168,76,0.25)] hover:border-[#e3d7b2] hover:text-[#f5e9c8] " +
  "hover:shadow-[0_0_20px_rgba(201,168,76,0.4)]";

/**
 * The glass screen's spectrum bars. Decorative at a glance; the state they
 * signal is always also spelled out in the status text beside them, and under
 * reduced motion they hold still instead of pulsing.
 */
function SpectrumBars({ active, still }: { active: boolean; still: boolean }) {
  return (
    <span aria-hidden="true" className="flex h-4 w-6 shrink-0 items-end justify-center gap-[2px]">
      {[3, 1, 4, 2, 5].map((seed, bar) => (
        <span
          key={bar}
          className={cn(
            "w-[3px] rounded-sm",
            active ? "bg-[#7ad6ff] opacity-90" : "bg-[#7ad6ff]/40",
            active && !still && "animate-pulse",
          )}
          style={{
            height: active ? `${8 + seed * 2}px` : "5px",
            ...(active && !still ? { animationDelay: `${bar * 140}ms` } : {}),
          }}
        />
      ))}
    </span>
  );
}

/** The "on air" lamp: lit gold while sound is actually coming out. */
function OnAirLamp({ active, still }: { active: boolean; still: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "h-1.5 w-1.5 shrink-0 rounded-full transition-colors",
        active
          ? "bg-[#f0d78c] shadow-[0_0_6px_rgba(240,215,140,0.9)]"
          : "bg-[#c9a84c]/25",
        active && !still && "animate-pulse",
      )}
    />
  );
}

export default function AcademyRadioHub({
  layout = "console",
  className,
}: {
  layout?: Layout;
  className?: string;
}) {
  const radio = useAcademyRadio();
  const reducedMotion = useReducedMotion() === true;

  const suffix = layout === "console" ? "hub" : "hub-bar";
  const nextNoteId = `academy-radio-${suffix}-next-note`;
  const statusLabel = STATUS_LABEL[radio.status];
  const statusLine =
    statusLabel + (radio.muted && radio.status !== "failed" ? " · Muted" : "");
  const volumePercent = Math.round(radio.volume * 100);

  const playPauseButton = (size: string, iconSize: string) => (
    <button
      type="button"
      onClick={() => (radio.isPlaying ? pauseRadio() : void playRadio())}
      aria-pressed={radio.isPlaying}
      aria-label={radio.isPlaying ? "Pause Academy Radio" : "Play Academy Radio"}
      title={radio.isPlaying ? "Pause Academy Radio" : "Play Academy Radio"}
      className={cn(controlButton, primaryButton, size)}
      data-testid={`academy-radio-playpause-${suffix}`}
    >
      {radio.isPlaying ? (
        <Pause className={iconSize} aria-hidden="true" />
      ) : (
        // Nudged right so the triangle reads centred inside the round button.
        <Play className={cn(iconSize, "translate-x-[1px]")} aria-hidden="true" />
      )}
    </button>
  );

  const muteButton = (size: string) => (
    <button
      type="button"
      onClick={() => toggleRadioMute()}
      aria-pressed={radio.muted}
      aria-label={radio.muted ? "Unmute Academy Radio" : "Mute Academy Radio"}
      title={radio.muted ? "Unmute Academy Radio" : "Mute Academy Radio"}
      className={cn(controlButton, sideButton, size)}
      data-testid={`academy-radio-mute-${suffix}`}
    >
      {radio.muted ? (
        <VolumeX className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Volume2 className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );

  const nextButton = (size: string) => (
    <button
      type="button"
      onClick={() => nextRadioTrack()}
      disabled={!radio.canGoNext}
      aria-label="Next track"
      aria-describedby={radio.canGoNext ? undefined : nextNoteId}
      title={radio.canGoNext ? "Next track" : "Only one track is available right now"}
      className={cn(controlButton, sideButton, size)}
      data-testid={`academy-radio-next-${suffix}`}
    >
      <SkipForward className="h-4 w-4" aria-hidden="true" />
    </button>
  );

  // Rendered whether or not Next is disabled-annotated, so aria-describedby
  // never dangles.
  const nextNote = !radio.canGoNext && (
    <span id={nextNoteId} className="sr-only">
      Only one track is available right now.
    </span>
  );

  const volumeControl = (
    <label className="flex items-center gap-2 text-[11px] text-[#a09b8c]">
      <Volume2 className="h-3.5 w-3.5 shrink-0 text-[#c9a84c]/70" aria-hidden="true" />
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={radio.volume}
        onChange={(event) => setRadioVolume(Number(event.target.value))}
        aria-label="Music volume"
        aria-valuetext={`${volumePercent} percent`}
        className="h-1.5 w-full grow cursor-pointer accent-[#c9a84c]"
        data-testid={`academy-radio-volume-${suffix}`}
      />
      <span className="w-8 shrink-0 text-right tabular-nums">{volumePercent}%</span>
    </label>
  );

  const screen = (
    <div
      className="relative bg-[#04101f]/90 px-3 py-2"
      style={{
        clipPath: SCREEN_CLIP,
        boxShadow: "inset 0 0 18px rgba(10,200,255,0.10), inset 0 0 2px rgba(122,214,255,0.35)",
      }}
    >
      <div className="flex items-center gap-2.5">
        <SpectrumBars active={radio.isPlaying} still={reducedMotion} />
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-semibold text-[#f0e6d2]"
            style={{ fontFamily: '"Cinzel", "Trajan Pro", "EB Garamond", Georgia, serif' }}
          >
            {radio.trackTitle}
          </p>
          <p className="truncate text-[10px] uppercase tracking-[0.18em] text-[#7ad6ff]/75">
            {statusLine}
          </p>
        </div>
      </div>
    </div>
  );

  /* ------------------------------------------------------------------------ */

  if (layout === "bar") {
    return (
      <section
        role="group"
        aria-label="Academy Radio"
        className={cn("relative", className)}
        data-testid="academy-radio-hub-bar"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-br from-[#c9a84c]/60 via-[#c9a84c]/20 to-[#c9a84c]/45"
          style={{ clipPath: PANEL_CLIP }}
        />
        <div
          className="relative m-[1px] bg-gradient-to-br from-[#0e1e38] via-[#0a1428] to-[#050d1c] p-3"
          style={{ clipPath: PANEL_CLIP, boxShadow: "inset 0 0 24px rgba(10,200,255,0.06)" }}
        >
          <div className="flex items-center gap-2 text-[#c9a84c]">
            <Radio className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="text-[10px] font-bold uppercase tracking-[0.3em]">
              Academy Radio
            </span>
            <OnAirLamp active={radio.isPlaying} still={reducedMotion} />
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <div className="min-w-0 flex-1">{screen}</div>
            {playPauseButton("h-11 w-11 shrink-0", "h-5 w-5")}
            {muteButton("h-11 w-11 shrink-0")}
          </div>
          <div className="mt-2.5 flex items-center gap-2.5">
            <div className="min-w-0 flex-1">{volumeControl}</div>
            {nextButton("h-8 w-8 shrink-0")}
          </div>
        </div>
        {nextNote}
      </section>
    );
  }

  return (
    <section
      role="group"
      aria-label="Academy Radio"
      className={cn("relative", className)}
      data-testid="academy-radio-hub"
    >
      {/* Gold accent frame, then the navy device face — the hub panel recipe. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-[#c9a84c]/70 via-[#c9a84c]/25 to-[#c9a84c]/50"
        style={{ clipPath: PANEL_CLIP }}
      />
      <div
        className="relative m-[1px] bg-gradient-to-b from-[#101f3a] via-[#0a1428] to-[#050d1c] px-3.5 pb-3.5 pt-3"
        style={{
          clipPath: PANEL_CLIP,
          boxShadow: "inset 0 0 28px rgba(10,200,255,0.07), inset 0 1px 0 rgba(240,230,210,0.08)",
        }}
      >
        {/* Maker's plaque */}
        <div className="flex items-center justify-center gap-2 text-[#c9a84c]">
          <Radio className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="text-[10px] font-bold uppercase tracking-[0.3em]">
            Academy Radio
          </span>
          <OnAirLamp active={radio.isPlaying} still={reducedMotion} />
        </div>
        <p className="mt-0.5 text-center text-[9px] uppercase tracking-[0.22em] text-[#a09b8c]/70">
          Broadcasting from the library
        </p>

        <div className="mt-2.5">{screen}</div>

        {/* Transport */}
        <div className="mt-3 flex items-center justify-center gap-2.5">
          {muteButton("h-9 w-9")}
          {playPauseButton("h-12 w-12", "h-5 w-5")}
          {nextButton("h-9 w-9")}
        </div>

        <div className="mt-3">{volumeControl}</div>
      </div>
      {nextNote}
    </section>
  );
}
