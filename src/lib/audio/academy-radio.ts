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
export const DEFAULT_MUSIC_VOLUME = 0.18;

/** The entrance swell. Preserved verbatim from the first Tidecaller pass. */
export const FADE_IN_MS = 2500;
/** Explicit Play and track switches: present, but not a 2.5s wait. */
export const FADE_SHORT_MS = 400;

/**
 * Namespaced under `mogsy.` to match the storage prefix the app already uses
 * (`mogsy.uiSfx.v1`, `mogsy.knowledge_admin_key`). Only the visitor's own
 * choices are persisted — never a promise that audio may play on load.
 */
export const RADIO_STORAGE_KEYS = {
  muted: "mogsy.audio.musicMuted",
  volume: "mogsy.audio.musicVolume",
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
  /** The visitor paused it. */
  | "paused"
  /** play() was refused and the radio has never sounded (autoplay policy). */
  | "blocked"
  /** The media element could not load the current track. */
  | "failed";

export interface RadioSnapshot {
  status: RadioStatus;
  /** True only once play() has actually resolved — never optimistic. */
  isPlaying: boolean;
  muted: boolean;
  /** 0..1. Survives muting: mute silences the output, not the setting. */
  volume: number;
  trackIndex: number;
  trackId: string;
  trackTitle: string;
  trackCount: number;
  /** False while the playlist has a single track — Next has nowhere to go. */
  canGoNext: boolean;
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
  volume: number;
  /** Set by an explicit Pause. Blocks auto-resume for the rest of the session. */
  userPaused: boolean;
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

function getState(): RadioState {
  const host = globalThis as StateHost;
  let state = host.__mogzyEntryMusic__;
  if (!state) {
    const storedVolume = Number.parseFloat(readStorage(RADIO_STORAGE_KEYS.volume) ?? "");
    state = {
      element: null,
      fadeFrame: null,
      starting: null,
      started: false,
      trackIndex: 0,
      status: "idle",
      muted: readStorage(RADIO_STORAGE_KEYS.muted) === "true",
      volume: Number.isFinite(storedVolume) ? clamp01(storedVolume) : DEFAULT_MUSIC_VOLUME,
      userPaused: false,
      detachUnlock: null,
      listeners: new Set(),
      snapshot: null,
    };
    host.__mogzyEntryMusic__ = state;
  }
  return state;
}

function now(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

/* -------------------------------------------------------------------------- */
/* Subscription                                                               */
/* -------------------------------------------------------------------------- */

function buildSnapshot(state: RadioState): RadioSnapshot {
  const track = RADIO_PLAYLIST[state.trackIndex] ?? RADIO_PLAYLIST[0];
  return {
    status: state.status,
    isPlaying: state.status === "playing",
    muted: state.muted,
    volume: state.volume,
    trackIndex: state.trackIndex,
    trackId: track.id,
    trackTitle: track.title,
    trackCount: RADIO_PLAYLIST.length,
    canGoNext: RADIO_PLAYLIST.length > 1,
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
  // With a single track the element loops itself and this never fires; the
  // guard is what keeps a future one-track regression from going silent.
  if (RADIO_PLAYLIST.length < 2) return;
  const state = getState();
  goToTrack(state, (state.trackIndex + 1) % RADIO_PLAYLIST.length);
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
  // One track: the element loops itself, so there is no gap and no `ended`.
  // Several tracks: `ended` is what advances the playlist.
  audio.loop = RADIO_PLAYLIST.length === 1;
  // Silent until a gesture. Nothing here can be heard.
  audio.volume = 0;
  audio.muted = state.muted;

  applyTrackSources(audio, state.trackIndex);
  audio.addEventListener("ended", handleEnded);
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

  const target = state.volume;
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
    audio.muted = state.muted;
    setStatus(state, "loading");
    await audio.play();
    state.started = true;
    state.userPaused = false;
    setStatus(state, "playing");
    fadeIn(audio, state, fadeMs);
    return true;
  } catch {
    // Autoplay policy, missing file, unsupported codec — no caller cares and
    // none of them may be delayed or broken by any of it.
    setStatus(state, state.started ? "paused" : "blocked");
    return false;
  }
}

export interface StartRadioOptions {
  fadeMs?: number;
}

/**
 * Start (or top up) the radio. Idempotent and safe to call rapidly.
 *
 * Contractually never throws and never rejects, so callers can fire it with
 * `void` from inside a click handler without risking whatever follows it.
 */
export function startRadio(options: StartRadioOptions = {}): Promise<boolean> {
  const { fadeMs = FADE_IN_MS } = options;
  try {
    const audio = ensureElement();
    if (!audio) return Promise.resolve(false);

    const state = getState();

    // Already sounding: never restart the track. Still make sure it actually
    // reaches the target, in case an earlier fade was interrupted part-way up.
    if (!audio.paused) {
      if (audio.volume < state.volume) fadeIn(audio, state, fadeMs);
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
  state.userPaused = false;
  if (state.muted) applyMuted(state, false);
  // The visitor found the controls; the first-gesture net has nothing left to do.
  state.detachUnlock?.();
  return startRadio({ fadeMs: FADE_SHORT_MS });
}

/**
 * The Pause control. Distinct from mute: this stops the transport, and for the
 * rest of the page session no incidental interaction may resume it.
 */
export function pauseRadio(): void {
  const state = getState();
  state.userPaused = true;
  state.starting = null;
  state.detachUnlock?.();

  const audio = state.element;
  if (audio) {
    cancelFade(state);
    try {
      audio.pause();
    } catch {
      /* jsdom and other non-implementing hosts */
    }
  }
  setStatus(state, "paused");
}

export function toggleRadioPlayback(): void {
  if (getState().status === "playing") pauseRadio();
  else void playRadio();
}

function applyMuted(state: RadioState, muted: boolean): void {
  state.muted = muted;
  // Muting the element rather than zeroing the volume is what keeps the
  // pre-mute level intact for free.
  if (state.element) state.element.muted = muted;
  writeStorage(RADIO_STORAGE_KEYS.muted, String(muted));
  emit(state);
}

export function setRadioMuted(muted: boolean): void {
  const state = getState();
  if (state.muted === muted) return;
  applyMuted(state, muted);

  // Unmuting is both a gesture and an explicit request to hear something — but
  // it must not override a deliberate pause.
  if (!muted && !state.userPaused) {
    void startRadio({ fadeMs: FADE_SHORT_MS });
  }
}

export function toggleRadioMute(): void {
  setRadioMuted(!getState().muted);
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
    audio.volume = volume;
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

  if (wasPlaying) void startRadio({ fadeMs: FADE_SHORT_MS });
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
  if (state.muted) return noop;

  let attempting = false;

  const handle = () => {
    const current = getState();
    // A preference has settled the question — stop watching entirely.
    if (current.muted || current.userPaused) {
      detach();
      return;
    }
    if (attempting) return;
    attempting = true;
    void startRadio({ fadeMs: FADE_IN_MS }).then((ok) => {
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
