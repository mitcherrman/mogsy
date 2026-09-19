import { mogzyAudio } from "./engine";
import { LEGACY_PLAY_SFX_EVENT } from "./sfx-registry";
import { resetSfxReplayGuards } from "./sfx";

/** Temporary SFX1.2 compatibility vocabulary; product callers migrate later. */
export type PlaySfxCue = keyof typeof LEGACY_PLAY_SFX_EVENT;
export const PLAY_SFX_CUES = Object.keys(LEGACY_PLAY_SFX_EVENT) as PlaySfxCue[];

/** Non-React/Admin compatibility adapter. It owns no audio state or policy. */
export const playSfxEngine = {
  play(cue: PlaySfxCue): void {
    try { mogzyAudio.playSfx(LEGACY_PLAY_SFX_EVENT[cue], { bypassLegacySetting: true }); } catch { /* sound is optional */ }
  },
};

export function resetPlaySfxGuards(): void {
  resetSfxReplayGuards();
}
