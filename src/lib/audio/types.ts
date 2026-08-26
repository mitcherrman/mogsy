export interface RadioEngineSnapshot {
  isPlaying: boolean;
  isAudible: boolean;
  muted: boolean;
  muteReason: "manual" | "inactivity" | null;
  suppressedByMode: boolean;
  volume: number;
  trackId: string;
  playRadioByDefault: boolean;
}

export interface RadioController<TSnapshot extends RadioEngineSnapshot = RadioEngineSnapshot> {
  getSnapshot: () => TSnapshot;
  subscribe: (listener: () => void) => () => void;
  play: () => Promise<boolean>;
  pause: () => void;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
  setPlayByDefault: (enabled: boolean) => void;
  setAutoMuteWhenInactive: (enabled: boolean) => void;
  setSuppressedByMode: (suppressed: boolean) => void;
}

export interface ModeSoundtrackRequest {
  owner: string;
  source: "track" | "none";
  sourceId?: string;
  startBehavior: "continue" | "restart";
  exitBehavior: "stop" | "return-to-radio";
}

export interface ModeSoundtrackSnapshot {
  owner: string | null;
  trackId: string | null;
  trackTitle: string | null;
  active: boolean;
  available: boolean;
  status: "idle" | "loading" | "playing" | "paused" | "blocked" | "failed";
  muted: boolean;
  volume: number;
  playAutomatically: boolean;
}

export interface ModeSoundtrackController {
  getSnapshot: () => ModeSoundtrackSnapshot;
  subscribe: (listener: () => void) => () => void;
  acquire: (request: ModeSoundtrackRequest) => Promise<boolean>;
  release: (owner: string) => void;
  play: () => Promise<boolean>;
  pause: () => void;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
  setPlayAutomatically: (enabled: boolean) => void;
}
