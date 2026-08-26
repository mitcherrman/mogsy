import type {
  ModeSoundtrackController,
  ModeSoundtrackRequest,
  RadioController,
  RadioEngineSnapshot,
} from "./types";

interface EngineState {
  radio: RadioController | null;
  mode: ModeSoundtrackController | null;
}

type EngineHost = typeof globalThis & { __mogzyAudioEngine__?: EngineState };

function state(): EngineState {
  const host = globalThis as EngineHost;
  host.__mogzyAudioEngine__ ??= { radio: null, mode: null };
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
};
