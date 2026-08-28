import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Music, Radio, SkipForward, VolumeX } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  dismissRadioNotice,
  isRadioNoticeDismissed,
  nextRadioTrack,
  playRadio,
  setRadioVolume,
  toggleRadioMute,
  useAcademyRadio,
  type RadioSnapshot,
} from "@/lib/audio/academy-radio";

/**
 * Academy Radio — the navbar player.
 *
 * Pure UI. It never creates or touches an <audio> element: it reads the shared
 * snapshot through useAcademyRadio() and calls the store's actions, so the
 * desktop row, the mobile panel and the entrance are all driving one transport.
 *
 * State shown here is the truth, never an optimistic guess — "Playing" appears
 * only once play() has actually resolved.
 */

/**
 * `desktop` / `mobile` are the legacy navbar pair (each self-gates on the
 * sm breakpoint). `hud` is the global-HUD control: one compact trigger with
 * the full-transport panel behind it, present at every width — the HUD shows
 * exactly one music control, so no breakpoint gating and no sibling variant.
 */
type Variant = "desktop" | "mobile" | "hud";

const STATUS_LABEL: Record<RadioSnapshot["status"], string> = {
  idle: "Ready",
  ready: "Ready",
  loading: "Loading",
  playing: "Live",
  paused: "Ready",
  blocked: "Tune in to listen",
  failed: "Track unavailable",
};

/**
 * The whole of the notice's copy. No subtitle and no second line, so the
 * container can be sized by its text instead of a box.
 *
 * Discovery is always worth offering. The invitation to turn the radio on is
 * only honest while it is genuinely off, so it is rotated in conditionally —
 * see `canPromptToTuneIn` below.
 */
const HUD_NOTICE_DISCOVERY = "See what's playing!";
const HUD_NOTICE_PROMPTS = ["Turn on the Radio!", HUD_NOTICE_DISCOVERY] as const;

const iconButton =
  "inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors " +
  "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
  "focus-visible:ring-offset-1 focus-visible:ring-offset-background " +
  "disabled:opacity-40 disabled:hover:text-muted-foreground disabled:cursor-not-allowed";

/**
 * Playing indicator. Animated bars carry it at a glance, but the state is also
 * spelled out in text next to it and in every control's accessible name, so it
 * is never colour- or motion-only. Under reduced motion the bars hold still
 * instead of pulsing.
 */
function PlayingIndicator({ active, still }: { active: boolean; still: boolean }) {
  return (
    <span aria-hidden="true" className="flex h-3 w-3 items-end justify-center gap-[2px]">
      {[0, 1, 2].map((bar) => (
        <span
          key={bar}
          className={cn(
            "w-[2px] rounded-sm bg-current",
            active ? "h-3 opacity-90" : "h-1.5 opacity-40",
            active && !still && "animate-pulse",
          )}
          style={active && !still ? { animationDelay: `${bar * 160}ms` } : undefined}
        />
      ))}
    </span>
  );
}

export default function AcademyRadioControls({
  variant = "desktop",
  className,
}: {
  variant?: Variant;
  className?: string;
}) {
  const radio = useAcademyRadio();
  const reducedMotion = useReducedMotion() === true;
  const [panelOpen, setPanelOpen] = useState(false);
  const [promptIndex, setPromptIndex] = useState(0);
  // Read once, at mount, so a dismissed notice never flashes before it is hidden.
  const [noticeDismissed, setNoticeDismissed] = useState(() => isRadioNoticeDismissed());
  const containerRef = useRef<HTMLDivElement>(null);

  const panelId = `academy-radio-panel-${variant}`;
  const nextNoteId = `academy-radio-next-note-${variant}`;
  const statusLabel = STATUS_LABEL[radio.status];
  const volumePercent = Math.round(radio.volume * 100);

  /**
   * Offer to turn the radio on only when that is actually the missing step: the
   * station has never sounded AND the silence is not the visitor's own doing.
   *
   * That leaves exactly one case rotating the invitation — startup or autoplay
   * has not succeeded yet. A mute the visitor chose is not something to nag
   * them out of; a Mode holding the floor is not theirs to override; and an
   * automatic idle or hidden-tab mute lifts itself the moment they come back.
   * In all of those the notice falls back to plain discovery.
   */
  const canPromptToTuneIn = !radio.isPlaying && !radio.muted;
  const noticePrompt = canPromptToTuneIn
    ? HUD_NOTICE_PROMPTS[promptIndex % HUD_NOTICE_PROMPTS.length]
    : HUD_NOTICE_DISCOVERY;

  // Dismiss the panel the way every other transient surface does: click away or
  // press Escape. Keyboard users are never trapped inside it.
  useEffect(() => {
    if (!panelOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setPanelOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanelOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [panelOpen]);

  useEffect(() => {
    // Rotating copy is motion. Reduced motion keeps the first prompt still, and
    // a notice that is down to one string has nothing to rotate.
    if (variant !== "hud" || reducedMotion || noticeDismissed || !canPromptToTuneIn) return;
    const timer = window.setInterval(
      () => setPromptIndex((index) => (index + 1) % HUD_NOTICE_PROMPTS.length),
      7000,
    );
    return () => window.clearInterval(timer);
  }, [variant, reducedMotion, noticeDismissed, canPromptToTuneIn]);

  /**
   * One dismissal for both routes into it — clicking the notice, and using the
   * Radio control it points at. Persisted, so it does not come back on the next
   * visit; it is a nudge, and a nudge only earns one showing.
   */
  const dismissNotice = () => {
    if (variant !== "hud" || noticeDismissed) return;
    setNoticeDismissed(true);
    dismissRadioNotice();
  };

  const tuneButton = (size: string) => (
    <button
      type="button"
      onClick={() => (radio.isAudible ? toggleRadioMute() : void playRadio())}
      aria-pressed={radio.isAudible}
      aria-label={radio.isAudible ? "Mute Academy Radio" : "Tune in to Academy Radio"}
      title={radio.isAudible ? "Mute Academy Radio" : "Tune in to Academy Radio"}
      className={cn(iconButton, size)}
      data-testid={`academy-radio-tune-${variant}`}
    >
      {radio.isAudible ? (
        <VolumeX className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Radio className="h-4 w-4" aria-hidden="true" />
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
      className={cn(iconButton, size)}
      data-testid={`academy-radio-next-${variant}`}
    >
      <SkipForward className="h-4 w-4" aria-hidden="true" />
    </button>
  );

  const volumeControl = (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="shrink-0">Volume</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={radio.volume}
        onChange={(event) => setRadioVolume(Number(event.target.value))}
        aria-label="Music volume"
        aria-valuetext={`${volumePercent} percent`}
        className="h-1.5 w-full grow cursor-pointer accent-primary"
        data-testid={`academy-radio-volume-${variant}`}
      />
      <span className="w-9 shrink-0 text-right tabular-nums">{volumePercent}%</span>
    </label>
  );

  /**
   * `withTransport` keeps play/pause/mute/next in exactly one place per variant:
   * the desktop row already carries them inline, so its panel adds only what
   * does not fit in the bar. Repeating them would duplicate control ids and
   * give screen readers two of every button.
   */
  const panel = (withTransport: boolean) => (
    <div
      id={panelId}
      role="group"
      aria-label="Academy Radio"
      className={cn(
        "absolute right-0 top-full z-50 mt-2 w-60 rounded-lg border border-border",
        "bg-background/95 p-3 shadow-xl backdrop-blur-xl",
      )}
      data-testid={`academy-radio-panel-${variant}`}
    >
      <div className="flex items-center gap-2">
        <PlayingIndicator active={radio.isAudible} still={reducedMotion} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{radio.trackTitle}</p>
          <p className="text-[11px] text-muted-foreground">
            {statusLabel}
            {radio.muted && radio.status !== "failed" ? " · Muted" : ""}
          </p>
        </div>
      </div>

      {withTransport && (
        <div className="mt-3 flex items-center gap-1">
          {tuneButton("h-10 w-10")}
          {nextButton("h-10 w-10")}
        </div>
      )}

      <div className="mt-3">{volumeControl}</div>

      {!radio.canGoNext && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Only one track is available right now.
        </p>
      )}
    </div>
  );

  // Always in the DOM, so Next's aria-describedby never dangles while the panel
  // is closed.
  const nextNote = !radio.canGoNext && (
    <span id={nextNoteId} className="sr-only">
      Only one track is available right now.
    </span>
  );

  /* ---------------------------------------------------------------------- */

  if (variant === "mobile" || variant === "hud") {
    const control = (
      <div className={cn(variant === "mobile" && "sm:hidden", className)}>
        {variant === "hud" && !noticeDismissed && (
          /* A temporary nudge hanging under the entire top-right HUD hub, not
             a fixture of the bar: absolutely positioned, so it reserves no
             space and nothing in the HUD cluster moves when it appears or goes
             away. Width comes from the copy (`w-fit` + `whitespace-nowrap`),
             never from a fixed box. Its right edge aligns with the hub chip,
             and the hub itself is the positioned ancestor. Still aria-hidden
             and still not a live region — it would otherwise re-read itself on
             every rotation, and the trigger beside it already carries the real
             accessible name and dismisses it too. */
          <div
            onClick={dismissNotice}
            className={cn(
              "absolute right-0 top-full z-40 mt-1.5 w-fit cursor-pointer",
              "whitespace-nowrap rounded-md border border-[#c9a84c]/30 bg-[#0a1020]/90",
              "px-2 py-1 text-[10px] font-semibold text-foreground/85 shadow-lg backdrop-blur-md",
              "transition-colors hover:text-foreground",
            )}
            data-testid="academy-radio-hud-prompt"
            aria-hidden="true"
          >
            {noticePrompt}
          </div>
        )}
        <div ref={containerRef} className="relative">
          <button
            type="button"
            onClick={() => {
              dismissNotice();
              setPanelOpen((open) => !open);
            }}
            aria-expanded={panelOpen}
            aria-controls={panelId}
            aria-label={`Academy Radio — ${statusLabel}`}
            title="Academy Radio"
            className={cn(
              iconButton,
              // The HUD trigger takes the same 44px target as its neighbours in
              // the global cluster; the glyph inside stays 20px, so the control
              // is easier to hit without getting visually heavier. It is a
              // utility control, so a ground tint is all the hover it gets — the
              // pop belongs to the branded marks (see @/lib/hud/chrome).
              variant === "hud"
                ? "h-11 w-11 rounded-full hover:bg-white/[0.07]"
                : "h-10 w-10",
            )}
            data-testid={`academy-radio-${variant}-trigger`}
          >
            {radio.muted ? (
              <VolumeX className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Music className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
          {panelOpen && panel(true)}
          {nextNote}
          <RadioLiveRegion radio={radio} />
        </div>
      </div>
    );
    return control;
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative hidden items-center gap-0.5 sm:flex", className)}
      data-testid="academy-radio-desktop"
    >
      {tuneButton("h-8 w-8")}

      <button
        type="button"
        onClick={() => setPanelOpen((open) => !open)}
        aria-expanded={panelOpen}
        aria-controls={panelId}
        aria-label={`Academy Radio — ${radio.trackTitle}, ${statusLabel}`}
        title="Academy Radio settings"
        className={cn(
          "flex max-w-[9rem] items-center gap-1.5 rounded-md px-1.5 py-1 text-xs",
          "text-muted-foreground transition-colors hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        )}
        data-testid="academy-radio-title"
      >
        <PlayingIndicator active={radio.isAudible} still={reducedMotion} />
        <span className="hidden truncate lg:inline">{radio.trackTitle}</span>
      </button>

      {nextButton("h-8 w-8")}

      {panelOpen && panel(false)}
      {nextNote}
      <RadioLiveRegion radio={radio} />
    </div>
  );
}

/**
 * Track changes are announced once they are actually audible. Kept out of the
 * visual controls so the message is not tied to the panel being open.
 */
function RadioLiveRegion({ radio }: { radio: RadioSnapshot }) {
  return (
    <span aria-live="polite" className="sr-only">
      {radio.isAudible ? `Academy Radio now playing: ${radio.trackTitle}` : ""}
    </span>
  );
}
