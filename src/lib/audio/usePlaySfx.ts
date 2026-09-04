/**
 * PLAY1 — the gate in front of the match-entry sound engine.
 *
 * `play-sfx.ts` knows how to make eight noises. This knows whether it is
 * allowed to, and the answer comes from the app's ONE sound-settings store —
 * no new preference, no PLAY-specific volume control, no second mute.
 *
 * WHAT THE APP ALREADY HAS, AND WHAT THIS USES
 * ────────────────────────────────────────────
 * `useSoundSettings` is the whole SFX policy: a per-sound boolean, stored in
 * `app_settings.sound_settings` and toggled by admins in `AdminSounds`, with
 * ONE global mute (`mogsy-sounds-muted`, the switch in Settings) that flattens
 * every key to false. Eight `play_*` keys are added to that object and nothing
 * else changes — a muted visitor hears nothing here for exactly the same
 * reason they hear nothing anywhere else in the app.
 *
 * WHAT IT DELIBERATELY DOES NOT USE. `src/lib/ui-sfx.ts` was re-checked at
 * this baseline and is still disqualified on all three counts: its own
 * localStorage config (`mogsy.uiSfx.v1`), every event defaulting to
 * `enabled: false` with an empty `src`, and no consultation of
 * `mogsy-sounds-muted` at all — so a muted visitor would still hear it.
 *
 * Music is a genuinely separate system (`src/lib/audio/academy-radio.ts`, its
 * own `mogsy.audio.musicMuted` and `mogsy.audio.musicVolume`), so the
 * music/SFX split the phase asked about already exists and is used as-is:
 * silencing SFX does not stop the radio, and vice versa.
 *
 * THE CALLBACK IS STABLE, DELIBERATELY. Settings are read through a ref so
 * `play` never changes identity — the record wires it into effects that watch
 * queue transitions, and a callback that changed when a settings fetch
 * resolved would re-run them and re-sound a beat that had already happened.
 * Same reason, same technique, as `useTomeAudio`.
 */
import { useEffect, useMemo, useRef } from "react";

import { useSoundSettings, type SoundSettings } from "@/hooks/useSoundSettings";
import { playSfxEngine, type PlaySfxCue } from "./play-sfx";

/**
 * Which stored setting governs which cue.
 *
 * One key per cue rather than one key for "PLAY sounds": the cues differ
 * enormously in how often they fire and how loud they are, and an operator who
 * wants the role tick gone should not have to lose the opponent bell with it.
 */
export const PLAY_SFX_SETTING_KEY: Record<PlaySfxCue, keyof SoundSettings> = {
  scrollOpen: "play_scroll_open",
  scrollClose: "play_scroll_close",
  roleStep: "play_role_step",
  mascotReact: "play_mascot_react",
  modeConfirm: "play_mode_confirm",
  queueStart: "play_queue_start",
  opponentFound: "play_opponent_found",
  error: "play_error",
  buttonPress: "play_button_press",
  bookLand: "play_book_land",
  bookRuffle: "play_book_ruffle",
};

export interface PlaySfx {
  /** Sound one cue, if the settings allow it. Never throws. */
  play: (cue: PlaySfxCue) => void;
}

export function usePlaySfx(): PlaySfx {
  const { soundSettings } = useSoundSettings();
  const settingsRef = useRef<SoundSettings>(soundSettings);
  useEffect(() => {
    settingsRef.current = soundSettings;
  }, [soundSettings]);

  return useMemo(
    () => ({
      /**
       * SOUND IS NEVER LOAD-BEARING, and that is enforced HERE.
       *
       * Call sites are click handlers, and most of them sound the cue before
       * doing the thing — `sfx.play("buttonPress"); onBack();`. If a cue could
       * throw, that ordering would silently make the sound a precondition of
       * the action: a broken audio stack would stop Back from going back.
       *
       * The engine already swallows its own failures, so in practice nothing
       * gets this far. The guard is here anyway because "the control still
       * works" must be a property of the layer rather than a promise about
       * every future line inside it — including a settings object that turns
       * out not to have the key, which is the one thing above the engine that
       * could still throw.
       */
      play(cue: PlaySfxCue) {
        try {
          if (!settingsRef.current[PLAY_SFX_SETTING_KEY[cue]]) return;
          playSfxEngine.play(cue);
        } catch {
          // Best-effort sound; a failure is silence, never a broken control.
        }
      },
    }),
    [],
  );
}
