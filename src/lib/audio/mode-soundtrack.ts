import { useSyncExternalStore } from "react";

import { mogzyAudio } from "./engine";
import type { ModeSoundtrackRequest, ModeSoundtrackSnapshot } from "./types";

export const DEFAULT_MODE_VOLUME = 0.15;
export const MODE_STORAGE_KEYS = {
  playAutomatically: "mogsy.audio.playModeMusicAutomatically",
  volume: "mogsy.audio.modeMusicVolume",
} as const;

export interface ModeSoundtrackConfig {
  id: string;
  title: string;
  sources: readonly { src: string; type: string }[];
  relativeGain?: number;
}

/** Ranked deliberately has no production binding until an asset is approved. */
const MODE_CONFIGS: Record<string, ModeSoundtrackConfig> = {
  ranked: { id: "ranked", title: "Ranked Soundtrack", sources: [] },
};

interface ModeState {
  element: HTMLAudioElement | null;
  owner: string | null;
  config: ModeSoundtrackConfig | null;
  status: ModeSoundtrackSnapshot["status"];
  muted: boolean;
  volume: number;
  playAutomatically: boolean;
  radioSuppressed: boolean;
  starting: Promise<boolean> | null;
  listeners: Set<() => void>;
  snapshot: ModeSoundtrackSnapshot | null;
}

type Host = typeof globalThis & { __mogzyModeSoundtrack__?: ModeState };
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const read = (key: string) => {
  try { return typeof localStorage === "undefined" ? null : localStorage.getItem(key); }
  catch { return null; }
};
const write = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* optional persistence */ }
};

function state(): ModeState {
  const host = globalThis as Host;
  if (!host.__mogzyModeSoundtrack__) {
    const storedVolume = Number.parseFloat(read(MODE_STORAGE_KEYS.volume) ?? "");
    host.__mogzyModeSoundtrack__ = {
      element: null,
      owner: null,
      config: null,
      status: "idle",
      muted: false,
      volume: Number.isFinite(storedVolume) ? clamp01(storedVolume) : DEFAULT_MODE_VOLUME,
      playAutomatically: read(MODE_STORAGE_KEYS.playAutomatically) !== "false",
      radioSuppressed: false,
      starting: null,
      listeners: new Set(),
      snapshot: null,
    };
  }
  return host.__mogzyModeSoundtrack__;
}

function build(s: ModeState): ModeSoundtrackSnapshot {
  return {
    owner: s.owner,
    trackId: s.config?.id ?? null,
    trackTitle: s.config?.title ?? null,
    active: s.owner !== null,
    available: Boolean(s.config?.sources.length),
    status: s.status,
    muted: s.muted,
    volume: s.volume,
    playAutomatically: s.playAutomatically,
  };
}

export function getModeSoundtrackSnapshot(): ModeSoundtrackSnapshot {
  const s = state();
  return s.snapshot ??= build(s);
}

function emit(s = state()) {
  s.snapshot = build(s);
  [...s.listeners].forEach((listener) => listener());
}

export function subscribeModeSoundtrack(listener: () => void) {
  state().listeners.add(listener);
  return () => state().listeners.delete(listener);
}

export function useModeSoundtrack() {
  return useSyncExternalStore(
    subscribeModeSoundtrack,
    getModeSoundtrackSnapshot,
    getModeSoundtrackSnapshot,
  );
}

function setRadioSuppressed(s: ModeState, suppressed: boolean) {
  if (s.radioSuppressed === suppressed) return;
  s.radioSuppressed = suppressed;
  mogzyAudio.getRadio()?.setSuppressedByMode(suppressed);
}

function ensureElement(s: ModeState) {
  const source = s.config?.sources[0];
  if (!source || typeof document === "undefined") return null;
  if (!s.element) {
    s.element = document.createElement("audio");
    s.element.preload = "auto";
    s.element.loop = true;
    s.element.addEventListener("error", () => {
      s.status = "failed";
      setRadioSuppressed(s, false);
      emit(s);
    });
  }
  const absoluteSource = new URL(source.src, window.location.href).href;
  if (s.element.src !== absoluteSource) {
    s.element.src = source.src;
    s.element.load();
  }
  return s.element;
}

function effectiveVolume(s: ModeState) {
  return clamp01(s.volume * (s.config?.relativeGain ?? 1));
}

export async function playModeSoundtrack(): Promise<boolean> {
  const s = state();
  if (!s.owner || !s.config?.sources.length) return false;
  const audio = ensureElement(s);
  if (!audio) return false;
  if (!audio.paused) {
    s.status = "playing";
    audio.muted = s.muted;
    audio.volume = effectiveVolume(s);
    setRadioSuppressed(s, !s.muted);
    emit(s);
    return true;
  }
  if (s.starting) return s.starting;
  audio.muted = s.muted;
  audio.volume = effectiveVolume(s);
  s.status = "loading";
  emit(s);
  const ownerAtStart = s.owner;
  s.starting = audio.play().then(() => {
    s.starting = null;
    if (s.owner !== ownerAtStart) return false;
    s.status = "playing";
    setRadioSuppressed(s, !s.muted);
    emit(s);
    return true;
  }).catch(() => {
    s.starting = null;
    if (s.owner === ownerAtStart) {
      s.status = "blocked";
      setRadioSuppressed(s, false);
      emit(s);
    }
    return false;
  });
  return s.starting;
}

export async function acquireModeSoundtrack(request: ModeSoundtrackRequest): Promise<boolean> {
  const s = state();
  if (s.owner === request.owner && s.config?.id === request.sourceId) {
    return s.status === "playing";
  }
  setRadioSuppressed(s, false);
  try { s.element?.pause(); } catch { /* optional media */ }
  s.owner = request.owner;
  s.config = request.source === "track" && request.sourceId
    ? MODE_CONFIGS[request.sourceId] ?? null
    : null;
  s.status = "idle";
  s.muted = false;
  s.starting = null;
  emit(s);
  if (!s.playAutomatically || !s.config?.sources.length) return false;
  return playModeSoundtrack();
}

export function releaseModeSoundtrack(owner: string): void {
  const s = state();
  if (s.owner !== owner) return;
  try { s.element?.pause(); } catch { /* optional media */ }
  if (s.element) s.element.currentTime = 0;
  setRadioSuppressed(s, false);
  s.owner = null;
  s.config = null;
  s.status = "idle";
  s.muted = false;
  s.starting = null;
  emit(s);
}

export function pauseModeSoundtrack(): void {
  const s = state();
  if (!s.owner || !s.element || s.status !== "playing") return;
  s.element.pause();
  s.status = "paused";
  setRadioSuppressed(s, false);
  emit(s);
}

export function setModeSoundtrackMuted(muted: boolean): void {
  const s = state();
  s.muted = muted;
  if (s.element) s.element.muted = muted;
  setRadioSuppressed(s, s.status === "playing" && !muted);
  emit(s);
}

export function setModeSoundtrackVolume(next: number): void {
  const s = state();
  s.volume = clamp01(Number.isFinite(next) ? next : DEFAULT_MODE_VOLUME);
  write(MODE_STORAGE_KEYS.volume, String(s.volume));
  if (s.element) s.element.volume = effectiveVolume(s);
  emit(s);
}

export function setPlayModeMusicAutomatically(enabled: boolean): void {
  const s = state();
  s.playAutomatically = enabled;
  write(MODE_STORAGE_KEYS.playAutomatically, String(enabled));
  emit(s);
}

export function setModeSoundtrackConfigForTests(id: string, config: ModeSoundtrackConfig): void {
  MODE_CONFIGS[id] = config;
}

export function resetModeSoundtrackForTests(): void {
  const host = globalThis as Host;
  const s = host.__mogzyModeSoundtrack__;
  if (s) {
    setRadioSuppressed(s, false);
    try { s.element?.pause(); } catch { /* optional media */ }
    s.listeners.clear();
  }
  delete host.__mogzyModeSoundtrack__;
  Object.values(MODE_STORAGE_KEYS).forEach((key) => {
    try { localStorage.removeItem(key); } catch { /* unavailable storage */ }
  });
}

mogzyAudio.registerModeSoundtrack({
  getSnapshot: getModeSoundtrackSnapshot,
  subscribe: subscribeModeSoundtrack,
  acquire: acquireModeSoundtrack,
  release: releaseModeSoundtrack,
  play: playModeSoundtrack,
  pause: pauseModeSoundtrack,
  setMuted: setModeSoundtrackMuted,
  setVolume: setModeSoundtrackVolume,
  setPlayAutomatically: setPlayModeMusicAutomatically,
});
