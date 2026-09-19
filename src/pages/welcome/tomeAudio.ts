import { useMemo } from "react";

import { mogzyAudio } from "@/lib/audio/engine";
import { MAX_SCRIBBLE_MS } from "@/lib/audio/sfx-renderers";
import { useSfx } from "@/lib/audio/useSfx";

export { MAX_SCRIBBLE_MS };

/** Non-React/Admin compatibility adapter; the canonical controller owns audio. */
export const tomeAudioEngine = {
  scribble(ms: number): void {
    try {
      mogzyAudio.stopSfx("welcome.scribble");
      if (ms > 0) mogzyAudio.playSfx("welcome.scribble", { durationMs: Math.min(MAX_SCRIBBLE_MS, ms), bypassLegacySetting: true });
    } catch { /* the welcome flow never depends on sound */ }
  },
  stopScribble(): void {
    mogzyAudio.stopSfx("welcome.scribble");
  },
  pageTurn(): void {
    mogzyAudio.playSfx("welcome.page.turn", { bypassLegacySetting: true });
  },
};

export interface TomeAudio {
  scribble: (ms: number) => void;
  stopScribble: () => void;
  pageTurn: () => void;
}

/** Keeps the welcome page's stable higher-level timing API without another engine. */
export function useTomeAudio(): TomeAudio {
  const sfx = useSfx();
  return useMemo(() => ({
    scribble(ms: number) {
      sfx.stop("welcome.scribble");
      if (ms > 0) sfx.play("welcome.scribble", { durationMs: Math.min(MAX_SCRIBBLE_MS, ms) });
    },
    stopScribble() { sfx.stop("welcome.scribble"); },
    pageTurn() { sfx.play("welcome.page.turn"); },
  }), [sfx]);
}
