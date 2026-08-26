/**
 * Academy Radio — the one music surface for the whole app.
 * ---------------------------------------------------------------------------
 * There is exactly ONE <audio> element for music in a session. It is created
 * lazily, parked on globalThis (not module scope, not React state) and never
 * torn down: the entrance unmounts during the / -> /lol hand-off, routes come
 * and go, and Vite re-evaluates this module on every HMR save — none of that is
 * allowed to orphan a sounding track or stack a second one on top of it.
 *
 * UI never touches the element. Components read a cached immutable snapshot
 * through `useAcademyRadio()` (useSyncExternalStore, the pattern already used by
 * src/lib/ads/consent.ts) and drive it through the exported actions, so the
 * navbar player and the entrance both talk to the same state.
 *
 * Nothing here is ever audible without a real user gesture. The module has no
 * import-time side effects at all: no element, no listeners, no storage reads.
 */

import { useSyncExternalStore } from "react";
import { mogzyAudio } from "./engine";

/* -------------------------------------------------------------------------- */
/* Playlist                                                                   */
/* -------------------------------------------------------------------------- */

export interface RadioSource {
  /** Browser path of a file that actually exists in public/. */
  src: string;
  type: string;
}

export interface RadioTrack {
  id: string;
  title: string;
  /** Preferred encoding first; the browser picks the first it can decode. */
  sources: RadioSource[];
}

/**
 * Only tracks with runtime files committed under public/audio/music/ may appear
 * here. Tidecaller is currently the only one that has been encoded; the other
 * Riot tracks sit unprocessed in the ignored intake folder and are deliberately
 * absent rather than listed against paths that would 404.
 */
export const RADIO_PLAYLIST: readonly RadioTrack[] = [
  {
    id: "tidecaller",
    title: "Tidecaller",
    sources: [
      // WebM/Opus first (3.4 MB); the MP3 is the fallback for browsers that
      // will not take Opus in a WebM container.
      { src: "/audio/music/tidecaller.webm", type: "audio/webm; codecs=opus" },
      { src: "/audio/music/tidecaller.mp3", type: "audio/mpeg" },
    ],
  },
];

/**
 * The masters are already quiet by design (~-17 LUFS integrated, -0.3 dBFS true
 * peak), and music sits under the UI rather than fronting it, so the element
 * level stays low. Files are used exactly as encoded — no normalisation.
 */
export const DEFAULT_MUSIC_VOLUME = 0.15;

/** The entrance swell. Preserved verbatim from the first Tidecaller pass. */
export const FADE_IN_MS = 2500;
/** Explicit Play and track switches: present, but not a 2.5s wait. */
export const FADE_SHORT_MS = 400;
export const RADIO_INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
export const RADIO_INACTIVITY_FADE_MS = 1800;
export const RADIO_DRIFT_TOLERANCE_SECONDS = 2;

/**
 * Namespaced under `mogsy.` to match the storage prefix the app already uses
 * (`mogsy.uiSfx.v1`, `mogsy.knowledge_admin_key`). Only the visitor's own
 * choices are persisted — never a promise that audio may play on load.
 */
export const RADIO_STORAGE_KEYS = {
  muted: "mogsy.audio.musicMuted",
  muteReason: "mogsy.audio.radioMuteReason",
  volume: "mogsy.audio.musicVolume",
  playByDefault: "mogsy.audio.playRadioByDefault",
  autoMuteWhenInactive: "mogsy.audio.autoMuteWhenInactive",
  stationEpoch: "mogsy.audio.stationEpoch",
} as const;

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */

export type RadioStatus =
  /** Nothing prepared yet. */
  | "idle"
  /** Element built and buffered, silent, waiting for a gesture. */
  | "ready"
  /** play() issued, not yet resolved. */
  | "loading"
  /** play() resolved — sound is actually coming out. */
  | "playing"
  /** Compatibility status for a failed/legacy stopped native transport. */
  | "paused"
  /** play() was refused and the radio has never sounded (autoplay policy). */
  | "blocked"
  /** The media element could not load the current track. */
  | "failed";

export interface RadioSnapshot {
  status: RadioStatus;
  /** True only once play() has actually resolved — never optimistic. */
  isPlaying: boolean;
  /** Playing and not muted. This is the user-facing "tuned in" state. */
  isAudible: boolean;
  muted: boolean;
  muteReason: "manual" | "inactivity" | null;
  /** Temporary routing policy; never persisted as a listener preference. */
  suppressedByMode: boolean;
  /** Whether ordinary app-entry gestures may start the radio automatically. */
  playRadioByDefault: boolean;
  autoMuteWhenInactive: boolean;
  /** 0..1. Survives muting: mute silences the output, not the setting. */
  volume: number;
  trackIndex: number;
  trackId: string;
  trackTitle: string;
  trackCount: number;
  /** False while the playlist has a single track — Next has nowhere to go. */
  canGoNext: boolean;
  stationEpoch: number;
  trackStartedAt: number;
  stationElapsedSeconds: number;
  trackPositionSeconds: number;
}

interface RadioState {
  element: HTMLAudioElement | null;
  /** The single in-flight fade frame, or null. Never more than one. */
  fadeFrame: number | null;
  /** In-flight play() attempt, shared so rapid calls never issue a second play. */
  starting: Promise<boolean> | null;
  /** True once play() has resolved once — gates the load() warm-up. */
  started: boolean;
  trackIndex: number;
  status: RadioStatus;
  muted: boolean;
  muteReason: "manual" | "inactivity" | null;
  suppressedByMode: boolean;
  playRadioByDefault: boolean;
  autoMuteWhenInactive: boolean;
  volume: number;
  /** Stable wall-clock anchor; the station advances whether the listener is muted. */
  stationEpoch: number;
  trackDurations: Record<string, number>;
  inactivityTimer: ReturnType<typeof setTimeout> | null;
  detachActivity: (() => void) | null;
  lastActivityAt: number;
  /** Removes the first-gesture listeners, or null when they are not armed. */
  detachUnlock: (() => void) | null;
  listeners: Set<() => void>;
  snapshot: RadioSnapshot | null;
}

/**
 * The key is inherited from the first Tidecaller pass on purpose: an HMR reload
 * that swaps this module in mid-track must adopt the element that is already
 * playing rather than start a rival one.
 */
type StateHost = typeof globalThis & { __mogzyEntryMusic__?: RadioState };

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function readStorage(key: string): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    // Private mode / disabled storage: preferences simply do not persist.
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* quota or disabled storage — never worth breaking playback over */
  }
}

function readBoolean(key: string, fallback: boolean): boolean {
  const value = readStorage(key);
  return value === null ? fallback : value === "true";
}

function readStationEpoch(): number {
  const stored = Number.parseInt(readStorage(RADIO_STORAGE_KEYS.stationEpoch) ?? "", 10);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const epoch = Date.now();
  writeStorage(RADIO_STORAGE_KEYS.stationEpoch, String(epoch));
  return epoch;
}

function readMuteReason(muted: boolean): RadioState["muteReason"] {
  if (!muted) return null;
  return readStorage(RADIO_STORAGE_KEYS.muteReason) === "inactivity" ? "inactivity" : "manual";
}

/**
 * Resolve the new explicit preference without resetting existing radio users.
 * A notice alone is deliberately not evidence of an old music preference.
 */
export function resolvePlayRadioByDefault(): boolean {
  const explicit = readStorage(RADIO_STORAGE_KEYS.playByDefault);
  if (explicit !== null) return explicit === "true";

  const legacyMuted = readStorage(RADIO_STORAGE_KEYS.muted);
  if (legacyMuted !== null) return legacyMuted !== "true";

  return readStorage(RADIO_STORAGE_KEYS.volume) !== null;
}

function getState(): RadioState {
  const host = globalThis as StateHost;
  let state = host.__mogzyEntryMusic__;
  if (!state) {
    const storedVolume = Number.parseFloat(readStorage(RADIO_STORAGE_KEYS.volume) ?? "");
    const muted = readStorage(RADIO_STORAGE_KEYS.muted) === "true";
    state = {
      element: null,
      fadeFrame: null,
      starting: null,
      started: false,
      trackIndex: 0,
      status: "idle",
      muted,
      muteReason: readMuteReason(muted),
      suppressedByMode: false,
      playRadioByDefault: resolvePlayRadioByDefault(),
      autoMuteWhenInactive: readBoolean(RADIO_STORAGE_KEYS.autoMuteWhenInactive, true),
      volume: Number.isFinite(storedVolume) ? clamp01(storedVolume) : DEFAULT_MUSIC_VOLUME,
      stationEpoch: readStationEpoch(),
      trackDurations: {},
      inactivityTimer: null,
      detachActivity: null,
      lastActivityAt: Date.now(),
      detachUnlock: null,
      listeners: new Set(),
      snapshot: null,
    };
    host.__mogzyEntryMusic__ = state;
  } else {
    // Adopt a singleton created by the pre-live-radio module during HMR. Keep
    // its element, listeners, playback state, mute and volume while filling in
    // only fields that did not exist in the older shape.
    state.muteReason ??= state.muted ? readMuteReason(true) : null;
    state.suppressedByMode ??= false;
    state.playRadioByDefault ??= resolvePlayRadioByDefault();
    state.autoMuteWhenInactive ??= readBoolean(RADIO_STORAGE_KEYS.autoMuteWhenInactive, true);
    state.stationEpoch ??= readStationEpoch();
    state.trackDurations ??= {};
    state.inactivityTimer ??= null;
    state.detachActivity ??= null;
    state.lastActivityAt ??= Date.now();
  }
  return state;
}

function now(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function effectiveVolume(state: RadioState): number {
  return state.volume;
}

/* -------------------------------------------------------------------------- */
/* Subscription                                                               */
/* -------------------------------------------------------------------------- */

function buildSnapshot(state: RadioState): RadioSnapshot {
  const tracks = RADIO_PLAYLIST;
  const track = tracks[state.trackIndex] ?? tracks[0];
  const station = getStationPosition(state);
  return {
    status: state.status,
    isPlaying: state.status === "playing",
    isAudible: state.status === "playing" && !state.muted && !state.suppressedByMode,
    muted: state.muted,
    muteReason: state.muteReason,
    suppressedByMode: state.suppressedByMode,
    playRadioByDefault: state.playRadioByDefault,
    autoMuteWhenInactive: state.autoMuteWhenInactive,
    volume: state.volume,
    trackIndex: state.trackIndex,
    trackId: track.id,
    trackTitle: track.title,
    trackCount: tracks.length,
    canGoNext: tracks.length > 1,
    stationEpoch: state.stationEpoch,
    trackStartedAt: station.trackStartedAt,
    stationElapsedSeconds: station.stationElapsedSeconds,
    trackPositionSeconds: station.positionSeconds,
  };
}

/** Cached and referentially stable between changes, as useSyncExternalStore requires. */
export function getRadioSnapshot(): RadioSnapshot {
  const state = getState();
  if (!state.snapshot) state.snapshot = buildSnapshot(state);
  return state.snapshot;
}

function emit(state: RadioState): void {
  state.snapshot = buildSnapshot(state);
  for (const listener of [...state.listeners]) {
    try {
      listener();
    } catch {
      // One bad subscriber must not stop the rest from hearing about it.
    }
  }
}

export function subscribeRadio(listener: () => void): () => void {
  getState().listeners.add(listener);
  return () => {
    getState().listeners.delete(listener);
  };
}

/** React binding — re-renders every player control when the radio changes. */
export function useAcademyRadio(): RadioSnapshot {
  return useSyncExternalStore(subscribeRadio, getRadioSnapshot, getRadioSnapshot);
}

function setStatus(state: RadioState, status: RadioStatus): void {
  if (state.status === status) return;
  state.status = status;
  emit(state);
}

interface StationPosition {
  trackIndex: number;
  positionSeconds: number;
  stationElapsedSeconds: number;
  trackStartedAt: number;
}

/** The single centralized wall-clock calculation for the live station. */
function getStationPosition(state: RadioState, at = Date.now()): StationPosition {
  const elapsed = Math.max(0, (at - state.stationEpoch) / 1000);
  const durations = RADIO_PLAYLIST.map((track) => state.trackDurations[track.id]);
  if (durations.some((duration) => !Number.isFinite(duration) || duration <= 0)) {
    return {
      trackIndex: state.trackIndex,
      positionSeconds: 0,
      stationElapsedSeconds: elapsed,
      trackStartedAt: state.stationEpoch,
    };
  }

  const cycleDuration = durations.reduce((sum, duration) => sum + duration, 0);
  let cyclePosition = elapsed % cycleDuration;
  for (let index = 0; index < durations.length; index += 1) {
    if (cyclePosition < durations[index]) {
      return {
        trackIndex: index,
        positionSeconds: cyclePosition,
        stationElapsedSeconds: elapsed,
        trackStartedAt: at - cyclePosition * 1000,
      };
    }
    cyclePosition -= durations[index];
  }
  return { trackIndex: 0, positionSeconds: 0, stationElapsedSeconds: elapsed, trackStartedAt: at };
}

function reconcileNativePosition(state: RadioState, force = false): void {
  const audio = state.element;
  if (!audio) return;
  const station = getStationPosition(state);
  if (station.trackIndex !== state.trackIndex) {
    state.trackIndex = station.trackIndex;
    applyTrackSources(audio, station.trackIndex);
    audio.load();
  }
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
  const expected = station.positionSeconds % audio.duration;
  if (force || !Number.isFinite(audio.currentTime) || Math.abs(audio.currentTime - expected) > RADIO_DRIFT_TOLERANCE_SECONDS) {
    try {
      audio.currentTime = expected;
    } catch {
      /* metadata/seekability can lag source selection */
    }
  }
}

/* -------------------------------------------------------------------------- */
/* The element                                                                */
/* -------------------------------------------------------------------------- */

function applyTrackSources(audio: HTMLAudioElement, index: number): void {
  const track = RADIO_PLAYLIST[index] ?? RADIO_PLAYLIST[0];
  while (audio.firstChild) audio.removeChild(audio.firstChild);
  for (const source of track.sources) {
    const element = document.createElement("source");
    element.src = source.src;
    element.type = source.type;
    audio.appendChild(element);
  }
}

function handleEnded(): void {
  const state = getState();
  // Native playback is subordinate to the station clock. Rejoin the current
  // logical position instead of allowing `ended` to stop the broadcast.
  reconcileNativePosition(state, true);
  if (state.started) void startRadio({ automatic: false, fadeMs: 0 });
}

function handleLoadedMetadata(): void {
  const state = getState();
  const audio = state.element;
  if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
  const track = RADIO_PLAYLIST[state.trackIndex] ?? RADIO_PLAYLIST[0];
  state.trackDurations[track.id] = audio.duration;
  reconcileNativePosition(state, true);
  emit(state);
}

function handleError(): void {
  const state = getState();
  state.starting = null;
  setStatus(state, "failed");
}

function ensureElement(): HTMLAudioElement | null {
  // SSR and any non-DOM import: no element, no browser APIs touched.
  if (typeof window === "undefined" || typeof document === "undefined") return null;

  const state = getState();
  if (state.element) return state.element;

  const audio = document.createElement("audio");
  audio.preload = "auto";
  // Native looping avoids a one-track gap; the logical clock remains the
  // authority when we explicitly reconcile or receive a stray `ended` event.
  audio.loop = RADIO_PLAYLIST.length === 1;
  // Silent until a gesture. Nothing here can be heard.
  audio.volume = 0;
  audio.muted = state.muted || state.suppressedByMode;

  applyTrackSources(audio, state.trackIndex);
  audio.addEventListener("ended", handleEnded);
  audio.addEventListener("loadedmetadata", handleLoadedMetadata);
  audio.addEventListener("error", handleError);

  state.element = audio;
  return audio;
}

/* -------------------------------------------------------------------------- */
/* Fading                                                                     */
/* -------------------------------------------------------------------------- */

function cancelFade(state: RadioState): void {
  if (state.fadeFrame === null) return;
  if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(state.fadeFrame);
  }
  state.fadeFrame = null;
}

/**
 * Ramps to the visitor's volume from wherever the element already is.
 *
 * Resuming from the current level rather than from zero is what makes repeat
 * calls safe: a second start part-way through the swell neither drops the music
 * back to silence nor extends the ramp past its budget.
 */
function fadeIn(audio: HTMLAudioElement, state: RadioState, durationMs: number): void {
  // Exactly one fade in flight, always.
  cancelFade(state);

  const target = effectiveVolume(state);
  const from = Math.min(Math.max(audio.volume, 0), target);
  if (from >= target) {
    audio.volume = target;
    return;
  }

  // No frame loop to ride (non-browser host): land on the target rather than
  // leave the track inaudible.
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    audio.volume = target;
    return;
  }

  const remainingMs = durationMs * (1 - from / target);
  const startedAt = now();

  const tick = () => {
    const progress = remainingMs <= 0 ? 1 : Math.min((now() - startedAt) / remainingMs, 1);
    audio.volume = from + (target - from) * progress;
    state.fadeFrame = progress < 1 ? window.requestAnimationFrame(tick) : null;
  };

  state.fadeFrame = window.requestAnimationFrame(tick);
}

function fadeOutThenMute(state: RadioState, durationMs = RADIO_INACTIVITY_FADE_MS): void {
  const audio = state.element;
  if (!audio || state.muted || state.status !== "playing") return;
  cancelFade(state);
  const from = audio.volume;
  const startedAt = now();

  const finish = () => {
    audio.volume = effectiveVolume(state);
    applyMuted(state, true, "inactivity");
  };
  if (durationMs <= 0) {
    finish();
    return;
  }
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    finish();
    return;
  }
  const tick = () => {
    const progress = Math.min((now() - startedAt) / durationMs, 1);
    audio.volume = from * (1 - progress);
    if (progress < 1) state.fadeFrame = window.requestAnimationFrame(tick);
    else {
      state.fadeFrame = null;
      finish();
    }
  };
  state.fadeFrame = window.requestAnimationFrame(tick);
}

function clearInactivityTimer(state: RadioState): void {
  if (state.inactivityTimer !== null) clearTimeout(state.inactivityTimer);
  state.inactivityTimer = null;
}

function scheduleInactivityMute(state: RadioState): void {
  clearInactivityTimer(state);
  if (!state.autoMuteWhenInactive || state.muted || state.status !== "playing") return;
  const remaining = Math.max(0, RADIO_INACTIVITY_TIMEOUT_MS - (Date.now() - state.lastActivityAt));
  state.inactivityTimer = setTimeout(() => {
    state.inactivityTimer = null;
    evaluateRadioInactivity();
  }, remaining);
}

/** Central policy check, also used after long sleeps where timers may be throttled. */
export function evaluateRadioInactivity(
  at = Date.now(),
  fadeMs = RADIO_INACTIVITY_FADE_MS,
): void {
  const state = getState();
  if (
    state.autoMuteWhenInactive &&
    !state.muted &&
    !state.suppressedByMode &&
    state.status === "playing" &&
    at - state.lastActivityAt >= RADIO_INACTIVITY_TIMEOUT_MS
  ) fadeOutThenMute(state, fadeMs);
}

/** One global activity owner; activity reschedules while audible but never unmutes. */
export function installRadioInactivityMonitor(): () => void {
  const noop = () => undefined;
  if (typeof window === "undefined" || typeof document === "undefined") return noop;
  const state = getState();
  if (state.detachActivity) return state.detachActivity;

  const onActivity = () => {
    const current = getState();
    current.lastActivityAt = Date.now();
    reconcileNativePosition(current);
    scheduleInactivityMute(current);
  };
  const onVisibility = () => {
    const current = getState();
    reconcileNativePosition(current);
    evaluateRadioInactivity();
    if (document.visibilityState === "visible" && !current.muted) onActivity();
  };
  const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart", "focus"];
  events.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));
  document.addEventListener("visibilitychange", onVisibility);
  const detach = () => {
    events.forEach((event) => window.removeEventListener(event, onActivity));
    document.removeEventListener("visibilitychange", onVisibility);
    clearInactivityTimer(getState());
    if (getState().detachActivity === detach) getState().detachActivity = null;
  };
  state.detachActivity = detach;
  scheduleInactivityMute(state);
  return detach;
}

/* -------------------------------------------------------------------------- */
/* Playback                                                                   */
/* -------------------------------------------------------------------------- */

/** Never rejects: a blocked or unsupported track is a silent non-event. */
async function playAndFade(
  audio: HTMLAudioElement,
  state: RadioState,
  fadeMs: number,
): Promise<boolean> {
  try {
    // Only a first start swells from silence. A resume keeps whatever level it
    // had so it does not dip back to nothing.
    if (!state.started) audio.volume = 0;
    audio.muted = state.muted || state.suppressedByMode;
    reconcileNativePosition(state, true);
    setStatus(state, "loading");
    await audio.play();
    state.started = true;
    setStatus(state, "playing");
    fadeIn(audio, state, fadeMs);
    scheduleInactivityMute(state);
    return true;
  } catch {
    // Autoplay policy, missing file, unsupported codec — no caller cares and
    // none of them may be delayed or broken by any of it.
    setStatus(state, state.started ? "paused" : "blocked");
    return false;
  }
}

export interface StartRadioOptions {
  /**
   * True when the app decided to start the music rather than the visitor asking
   * for it by name. Only an automatic start earns the one-time toast.
   */
  automatic?: boolean;
  fadeMs?: number;
}

/**
 * Start (or top up) the radio. Idempotent and safe to call rapidly.
 *
 * Contractually never throws and never rejects, so callers can fire it with
 * `void` from inside a click handler without risking whatever follows it.
 */
export function startRadio(options: StartRadioOptions = {}): Promise<boolean> {
  const { automatic = false, fadeMs = FADE_IN_MS } = options;
  try {
    // Preparation may still happen globally, but an automatic call never earns
    // audible playback unless the visitor's resolved preference permits it.
    if (automatic && !getState().playRadioByDefault) return Promise.resolve(false);
    const audio = ensureElement();
    if (!audio) return Promise.resolve(false);

    const state = getState();

    // Already sounding: never restart the track. Still make sure it actually
    // reaches the target, in case an earlier fade was interrupted part-way up.
    if (!audio.paused) {
      reconcileNativePosition(state);
      if (audio.volume < effectiveVolume(state)) fadeIn(audio, state, fadeMs);
      setStatus(state, "playing");
      return Promise.resolve(true);
    }

    // A start is already in flight — share it rather than issue a second play().
    if (state.starting) return state.starting;

    const attempt = playAndFade(audio, state, fadeMs).then((ok) => {
      state.starting = null;
      return ok;
    });
    state.starting = attempt;
    return attempt;
  } catch {
    return Promise.resolve(false);
  }
}

/**
 * The Play control. Explicit intent to hear the radio, so it also lifts a mute
 * — Mute stays the one deliberate way to make it silent.
 */
export function playRadio(): Promise<boolean> {
  const state = getState();
  state.lastActivityAt = Date.now();
  if (state.muted) applyMuted(state, false, null);
  // The visitor found the controls; the first-gesture net has nothing left to do.
  state.detachUnlock?.();
  return startRadio({ automatic: false, fadeMs: FADE_SHORT_MS });
}

/**
 * Compatibility alias for old callers. A live station cannot be paused, so
 * leaving it only mutes output while the native/logical timeline continues.
 */
export function pauseRadio(): void {
  setRadioMuted(true);
}

export function toggleRadioPlayback(): void {
  if (getState().status === "playing" && !getState().muted) pauseRadio();
  else void playRadio();
}

function applyMuted(
  state: RadioState,
  muted: boolean,
  reason: RadioState["muteReason"] = muted ? "manual" : null,
): void {
  state.muted = muted;
  state.muteReason = muted ? reason : null;
  // Muting the element rather than zeroing the volume is what keeps the
  // pre-mute level intact for free.
  if (state.element) state.element.muted = muted || state.suppressedByMode;
  writeStorage(RADIO_STORAGE_KEYS.muted, String(muted));
  writeStorage(RADIO_STORAGE_KEYS.muteReason, muted ? state.muteReason ?? "manual" : "none");
  if (muted) clearInactivityTimer(state);
  else scheduleInactivityMute(state);
  emit(state);
}

export function setRadioMuted(muted: boolean): void {
  const state = getState();
  if (state.muted === muted) return;
  state.lastActivityAt = Date.now();
  applyMuted(state, muted, muted ? "manual" : null);

  // Unmuting is both a gesture and an explicit request to hear something — but
  if (!muted) {
    void startRadio({ automatic: false, fadeMs: FADE_SHORT_MS });
  }
}

export function toggleRadioMute(): void {
  setRadioMuted(!getState().muted);
}

/** Silence/resume physical output without changing Radio's live clock or preferences. */
export function setRadioSuppressedByMode(suppressed: boolean): void {
  const state = getState();
  if (state.suppressedByMode === suppressed) return;
  state.suppressedByMode = suppressed;
  if (state.element) state.element.muted = state.muted || suppressed;
  if (suppressed) clearInactivityTimer(state);
  else if (!state.muted) scheduleInactivityMute(state);
  emit(state);
}

/** Persist the default-entry preference without changing current playback. */
export function setPlayRadioByDefault(enabled: boolean): void {
  const state = getState();
  if (state.playRadioByDefault === enabled && readStorage(RADIO_STORAGE_KEYS.playByDefault) !== null) {
    return;
  }
  state.playRadioByDefault = enabled;
  writeStorage(RADIO_STORAGE_KEYS.playByDefault, String(enabled));
  emit(state);
}

/** Persist inactivity policy without changing current audibility. */
export function setAutoMuteWhenInactive(enabled: boolean): void {
  const state = getState();
  if (
    state.autoMuteWhenInactive === enabled &&
    readStorage(RADIO_STORAGE_KEYS.autoMuteWhenInactive) !== null
  ) return;
  state.autoMuteWhenInactive = enabled;
  writeStorage(RADIO_STORAGE_KEYS.autoMuteWhenInactive, String(enabled));
  if (enabled) scheduleInactivityMute(state);
  else clearInactivityTimer(state);
  emit(state);
}

export function setRadioVolume(next: number): void {
  const state = getState();
  const volume = clamp01(Number.isFinite(next) ? next : DEFAULT_MUSIC_VOLUME);
  if (volume === state.volume) return;

  state.volume = volume;
  writeStorage(RADIO_STORAGE_KEYS.volume, String(volume));

  const audio = state.element;
  if (audio && state.started) {
    // A live drag has to land immediately instead of chasing a fade.
    cancelFade(state);
    audio.volume = effectiveVolume(state);
  }
  emit(state);
}

function goToTrack(state: RadioState, index: number): void {
  const audio = state.element;
  const wasPlaying = state.status === "playing" || (audio ? !audio.paused : false);
  state.trackIndex = index;
  state.starting = null;

  if (audio) {
    cancelFade(state);
    // Drop to silence before swapping sources so the splice is not a click.
    audio.volume = 0;
    applyTrackSources(audio, index);
    audio.load();
  }
  emit(state);

  if (wasPlaying) void startRadio({ automatic: false, fadeMs: FADE_SHORT_MS });
}

/** Advance the playlist. A no-op while there is nowhere distinct to go. */
export function nextRadioTrack(): void {
  if (RADIO_PLAYLIST.length < 2) return;
  const state = getState();
  goToTrack(state, (state.trackIndex + 1) % RADIO_PLAYLIST.length);
}

/* -------------------------------------------------------------------------- */
/* First meaningful interaction                                               */
/* -------------------------------------------------------------------------- */

/**
 * What counts as an application action. Deliberately a real-control test rather
 * than "any click": the page body, decorative art and layout chrome are not it.
 */
const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[tabindex]:not([tabindex="-1"])',
  // Escape hatch for a real application affordance that is none of the above.
  "[data-radio-gesture]",
].join(",");

/**
 * Opt-out marker. Consent/cookie chrome and anything else that is not an
 * application-entry gesture can carry `data-no-audio-gesture` to stay silent.
 */
const OPT_OUT_SELECTOR = "[data-no-audio-gesture]";

function isMeaningfulTarget(event: Event): boolean {
  const target = event.target as Element | null;
  if (!target || typeof target.closest !== "function") return false;
  const control = target.closest(INTERACTIVE_SELECTOR);
  if (!control) return false;
  return !control.closest(OPT_OUT_SELECTOR);
}

/**
 * Arms a single centralized listener pair for the first meaningful interaction.
 *
 * This is the ONLY place that turns an ordinary interaction into playback —
 * feature components stay ignorant of the radio. Only click and keydown are
 * observed, so pointer movement, hover, scroll, resize, focus and visibility
 * changes cannot start music by construction rather than by filtering, and the
 * target has to resolve to a real control rather than to scenery. The listeners
 * remove themselves as soon as a start has actually succeeded.
 */
export function installFirstGestureUnlock(): () => void {
  const noop = () => undefined;
  if (typeof window === "undefined" || typeof document === "undefined") return noop;

  const state = getState();
  if (state.detachUnlock) return state.detachUnlock;
  // A visitor who muted the radio gets no audible auto-start, so there is
  // nothing to wait for. Unmuting from the navbar starts it directly.
  if (state.muted || !state.playRadioByDefault) return noop;

  let attempting = false;

  const handle = () => {
    const current = getState();
    // A preference has settled the question — stop watching entirely.
    if (current.muted || !current.playRadioByDefault) {
      detach();
      return;
    }
    if (attempting) return;
    attempting = true;
    void startRadio({ automatic: true, fadeMs: FADE_IN_MS }).then((ok) => {
      attempting = false;
      // Only a start that actually produced sound retires the listener.
      //
      // This is also what makes a forged click harmless: the browser is the
      // only authority on whether an event was a real gesture (an untrusted
      // event cannot satisfy the autoplay policy, so play() is refused), and a
      // refusal must leave the net armed for the visitor's next real action
      // rather than silently burning the one chance to start the radio.
      if (ok) detach();
    });
  };

  const onClick = (event: MouseEvent) => {
    if (!isMeaningfulTarget(event)) return;
    handle();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    // Typing a space into a field is not an application action.
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return;
    }
    if (!isMeaningfulTarget(event)) return;
    handle();
  };

  // Capture phase, so a handler that stops propagation cannot hide the gesture.
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);

  function detach() {
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    const current = getState();
    if (current.detachUnlock === detach) current.detachUnlock = null;
  }

  state.detachUnlock = detach;
  return detach;
}

/** True while the first-interaction listeners are still armed. */
export function isFirstGestureUnlockArmed(): boolean {
  return getState().detachUnlock !== null;
}

/* -------------------------------------------------------------------------- */
/* Mounting + test support                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Builds the element and warms the buffer so the eventual gesture gets an
 * immediate fade rather than a download. load() rewinds and pauses a playing
 * element, so it is strictly a pre-first-play call. Nothing here is audible.
 */
export function prepareRadio(): void {
  const audio = ensureElement();
  if (!audio) return;
  const state = getState();
  if (state.started) return;
  audio.load();
  setStatus(state, "ready");
}

/** Test-only: drops the cross-module singleton so specs start from silence. */
export function resetRadioForTests(): void {
  const host = globalThis as StateHost;
  const state = host.__mogzyEntryMusic__;
  if (state) {
    cancelFade(state);
    state.detachUnlock?.();
    state.detachActivity?.();
    state.listeners.clear();
  }
  delete host.__mogzyEntryMusic__;
  for (const key of Object.values(RADIO_STORAGE_KEYS)) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* disabled storage */
    }
  }
}

mogzyAudio.registerRadio<RadioSnapshot>({
  getSnapshot: getRadioSnapshot,
  subscribe: subscribeRadio,
  play: playRadio,
  pause: pauseRadio,
  setMuted: setRadioMuted,
  setVolume: setRadioVolume,
  setPlayByDefault: setPlayRadioByDefault,
  setAutoMuteWhenInactive,
  setSuppressedByMode: setRadioSuppressedByMode,
});
