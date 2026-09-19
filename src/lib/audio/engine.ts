import type {
  ModeSoundtrackController,
  ModeSoundtrackRequest,
  RadioController,
  RadioEngineSnapshot,
  SfxController,
  SfxPlayOptions,
} from "./types";
import type { SfxEvent } from "./sfx-registry";

interface EngineState {
  radio: RadioController | null;
  mode: ModeSoundtrackController | null;
  sfx: SfxController | null;
}

type EngineHost = typeof globalThis & { __mogzyAudioEngine__?: EngineState };

function state(): EngineState {
  const host = globalThis as EngineHost;
  host.__mogzyAudioEngine__ ??= { radio: null, mode: null, sfx: null };
  return host.__mogzyAudioEngine__;
}

/** Routes persistent music channels without owning a media element itself. */
export const mogzyAudio = {
  registerRadio<TSnapshot extends RadioEngineSnapshot>(controller: RadioController<TSnapshot>) {
    state().radio = controller;
    return () => {
      if (state().radio === controller) state().radio = null;
    };
  },

  getRadio(): RadioController | null {
    return state().radio;
  },

  registerModeSoundtrack(controller: ModeSoundtrackController) {
    state().mode = controller;
    return () => {
      if (state().mode === controller) state().mode = null;
    };
  },

  getModeSoundtrack(): ModeSoundtrackController | null {
    return state().mode;
  },

  acquireModeSoundtrack(request: ModeSoundtrackRequest): Promise<boolean> {
    return state().mode?.acquire(request) ?? Promise.resolve(false);
  },

  releaseModeSoundtrack(owner: string): void {
    state().mode?.release(owner);
  },

  registerSfx(controller: SfxController) {
    state().sfx = controller;
    return () => {
      if (state().sfx === controller) state().sfx = null;
    };
  },

  getSfx(): SfxController | null {
    return state().sfx;
  },

  /** Fire-and-forget by contract: sound is never load-bearing. */
  playSfx(event: SfxEvent, options?: SfxPlayOptions): void {
    try {
      state().sfx?.play(event, options);
    } catch {
      // A controller bug degrades to silence, never to a broken application action.
    }
  },
};
