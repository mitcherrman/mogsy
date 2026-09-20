import { useMemo } from "react";

import type { SoundSettings } from "@/hooks/useSoundSettings";
import { LEGACY_PLAY_SFX_EVENT } from "./sfx-registry";
import { useSfx } from "./useSfx";
import type { PlaySfxCue } from "./play-sfx";

export const PLAY_SFX_SETTING_KEY: Record<PlaySfxCue, keyof SoundSettings> = {
  scrollOpen: "play_scroll_open", scrollClose: "play_scroll_close",
  roleStep: "play_role_step", mascotReact: "play_mascot_react",
  modeConfirm: "play_mode_confirm", queueStart: "play_queue_start",
  opponentFound: "play_opponent_found", error: "play_error",
  buttonPress: "play_button_press", bookLand: "play_book_land",
  bookRuffle: "play_book_ruffle",
};

export interface PlaySfx { play: (cue: PlaySfxCue) => void }

/** Temporary call-site adapter; all policy/rendering lives in useSfx. */
export function usePlaySfx(): PlaySfx {
  const sfx = useSfx();
  return useMemo(() => ({
    play(cue: PlaySfxCue) {
      try { sfx.play(LEGACY_PLAY_SFX_EVENT[cue]); } catch { /* never block the action */ }
    },
  }), [sfx]);
}
