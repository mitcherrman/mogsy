import { useMemo, useSyncExternalStore } from "react";

import { mogzyAudio } from "./engine";
import { sfxController } from "./sfx";
import type { SfxEvent } from "./sfx-registry";
import type { SfxPlayOptions } from "./types";

export interface SfxApi {
  play: (event: SfxEvent, options?: SfxPlayOptions) => void;
  stop: (event: SfxEvent) => void;
  preload: (event: SfxEvent) => void;
}

/** Stable command-only API. Configuration changes never change `play` identity. */
export function useSfx(): SfxApi {
  return useMemo(() => ({
    play(event: SfxEvent, options?: SfxPlayOptions) {
      mogzyAudio.playSfx(event, options);
    },
    stop(event: SfxEvent) {
      mogzyAudio.stopSfx(event);
    },
    preload(event: SfxEvent) {
      mogzyAudio.preloadSfx(event);
    },
  }), []);
}

/** Opt-in state for future settings/admin UI; ordinary callers do not subscribe. */
export function useSfxSnapshot() {
  return useSyncExternalStore(
    sfxController.subscribe,
    sfxController.getSnapshot,
    sfxController.getSnapshot,
  );
}
