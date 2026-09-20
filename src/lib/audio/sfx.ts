import { mogzyAudio } from "./engine";
import {
  getAudioStudioRuntimeSnapshot,
  resolveRuntimeAsset,
  subscribeAudioStudioRuntime,
} from "./audio-studio-runtime";
import type { AudioStudioConfig, AudioEventBinding } from "./audio-studio-config";
import { EMPTY_AUDIO_STUDIO_CONFIG } from "./audio-studio-config";
import {
  getSfxGenerator,
  getSfxRegistryEntry,
  type SfxAssetVoice,
  type SfxEvent,
  type SfxSynthRenderer,
} from "./sfx-registry";
import {
  getSoundSettingsRuntimeSnapshot,
  SOUND_DEFAULTS,
  subscribeSoundSettingsRuntime,
  type SoundSettings,
} from "./sound-settings-runtime";
import type { SfxController, SfxEngineSnapshot, SfxPlayOptions } from "./types";

export const SFX_MUTE_STORAGE_KEY = "mogsy-sounds-muted";
export const SFX_MUTE_CHANGE_EVENT = "mogsy-sounds-muted-changed";
const MAX_ASSET_CACHE_ENTRIES = 24;
const MAX_EVENT_IDS = 512;

interface SfxRuntimeState {
  context: AudioContext | null;
  masterGain: GainNode | null;
  interacted: boolean;
  config: AudioStudioConfig;
  configReady: boolean;
  configVersion: number;
  soundSettings: SoundSettings;
  soundSettingsReady: boolean;
  muted: boolean;
  listeners: Set<() => void>;
  snapshot: SfxEngineSnapshot | null;
  lastPlayedAt: Map<string, number>;
  seenEventIds: Set<string>;
  eventIdOrder: string[];
  assetCache: Map<string, Promise<AudioBuffer | null>>;
  activeStops: Map<string, () => void>;
  unlockInstalled: boolean;
  observersInstalled: boolean;
}

type SfxHost = typeof globalThis & { __mogzySfxRuntime__?: SfxRuntimeState };

function readMuted(): boolean {
  try {
    return typeof localStorage !== "undefined"
      && localStorage.getItem(SFX_MUTE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function state(): SfxRuntimeState {
  const host = globalThis as SfxHost;
  host.__mogzySfxRuntime__ ??= {
    context: null,
    masterGain: null,
    interacted: false,
    config: EMPTY_AUDIO_STUDIO_CONFIG,
    configReady: false,
    configVersion: 0,
    soundSettings: SOUND_DEFAULTS,
    soundSettingsReady: false,
    muted: readMuted(),
    listeners: new Set(),
    snapshot: null,
    lastPlayedAt: new Map(),
    seenEventIds: new Set(),
    eventIdOrder: [],
    assetCache: new Map(),
    activeStops: new Map(),
    unlockInstalled: false,
    observersInstalled: false,
  };
  return host.__mogzySfxRuntime__;
}

function contextState(s: SfxRuntimeState): SfxEngineSnapshot["contextState"] {
  if (!s.interacted) return "locked";
  if (!s.context) return "unavailable";
  return s.context.state === "running" ? "running" : "suspended";
}

function buildSnapshot(s: SfxRuntimeState): SfxEngineSnapshot {
  return { muted: s.muted, configReady: s.configReady, contextState: contextState(s) };
}

function emit(s = state()): void {
  s.snapshot = buildSnapshot(s);
  [...s.listeners].forEach((listener) => listener());
}

function setMasterMuted(s: SfxRuntimeState): void {
  if (!s.masterGain || !s.context) return;
  try {
    s.masterGain.gain.setValueAtTime(s.muted ? 0 : 1, s.context.currentTime);
  } catch {
    s.masterGain.gain.value = s.muted ? 0 : 1;
  }
}

function ensureContext(s = state()): AudioContext | null {
  try {
    if (!s.context) {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      s.context = new Ctor();
      s.masterGain = s.context.createGain();
      setMasterMuted(s);
      s.masterGain.connect(s.context.destination);
    }
    return s.context;
  } catch {
    return null;
  }
}

async function unlock(): Promise<boolean> {
  const s = state();
  s.interacted = true;
  try {
    const context = ensureContext(s);
    if (!context) { emit(s); return false; }
    if (context.state === "suspended") await context.resume();
    emit(s);
    return context.state === "running";
  } catch {
    emit(s);
    return false;
  }
}

function installUnlock(): void {
  const s = state();
  if (s.unlockInstalled || typeof window === "undefined") return;
  s.unlockInstalled = true;
  const onGesture = () => {
    void unlock().then((unlocked) => {
      if (!unlocked) return;
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    }).catch(() => {});
  };
  // Keep retrying on real gestures until the platform actually accepts the
  // unlock. Safari can refuse the first attempt without making it fatal.
  window.addEventListener("pointerdown", onGesture, { passive: true });
  window.addEventListener("keydown", onGesture);
}

function refreshMute(): void {
  const s = state();
  const next = readMuted();
  if (s.muted === next) return;
  s.muted = next;
  setMasterMuted(s);
  emit(s);
}

function syncAudioStudio(): void {
  const runtime = getAudioStudioRuntimeSnapshot();
  const s = state();
  s.config = runtime.config;
  s.configVersion += 1;
  // No built-in may sound while operator policy is unknown. A stale snapshot
  // is safe because it contains the last successfully loaded configuration.
  s.configReady = runtime.status === "available" || runtime.status === "stale";
  emit(s);
}

function syncSoundSettings(): void {
  const runtime = getSoundSettingsRuntimeSnapshot();
  const s = state();
  s.soundSettings = runtime.settings;
  s.soundSettingsReady = runtime.status === "available";
  s.configVersion += 1;
  emit(s);
}

function rememberEventId(s: SfxRuntimeState, eventId: string): boolean {
  if (s.seenEventIds.has(eventId)) return false;
  s.seenEventIds.add(eventId);
  s.eventIdOrder.push(eventId);
  while (s.eventIdOrder.length > MAX_EVENT_IDS) {
    const oldest = s.eventIdOrder.shift();
    if (oldest) s.seenEventIds.delete(oldest);
  }
  return true;
}

function findBinding(config: AudioStudioConfig, event: SfxEvent): AudioEventBinding | null {
  return config.eventBindings.find((candidate) => candidate.eventKey === event) ?? null;
}

type Resolution =
  | { type: "silence" }
  | { type: "synth"; renderer: SfxSynthRenderer; relativeGain: number }
  | { type: "asset"; voices: readonly SfxAssetVoice[]; relativeGain: number };

function resolveEvent(s: SfxRuntimeState, event: SfxEvent, options: SfxPlayOptions = {}): Resolution {
  const entry = getSfxRegistryEntry(event);
  if (!entry || !s.configReady) return { type: "silence" };
  if (entry.legacySettingKey && !options.bypassLegacySetting) {
    if (!s.soundSettingsReady || !s.soundSettings[entry.legacySettingKey]) return { type: "silence" };
  }
  const binding = findBinding(s.config, event);
  if (binding) {
    // Explicit operator policy is authoritative. Disabled, legacy, malformed,
    // or failed overrides stay silent; they never surprise the operator by
    // falling through to a different sound.
    if (!binding.enabled || binding.sourceType === "disabled" || binding.sourceType === "legacy") {
      return { type: "silence" };
    }
    if (binding.sourceType === "asset" && binding.assetId) {
      const asset = resolveRuntimeAsset(s.config, binding.assetId);
      return asset?.kind === "sfx"
        ? {
            type: "asset",
            voices: [{ src: asset.sources[0].src, gain: 1 }],
            relativeGain: binding.relativeGain * asset.relativeGain,
          }
        : { type: "silence" };
    }
    if (binding.sourceType === "synthesized") {
      const renderer = getSfxGenerator(binding.generatorId);
      return renderer
        ? { type: "synth", renderer, relativeGain: binding.relativeGain }
        : { type: "silence" };
    }
    return { type: "silence" };
  }
  // A specialist's persisted asset is a compatibility fallback, not a way to
  // bypass explicit Audio Studio policy for the canonical semantic event.
  if (options.configuredAsset) {
    const src = options.configuredAsset.src.trim();
    return src
      ? {
          type: "asset",
          voices: [{ src, gain: 1 }],
          relativeGain: Math.min(4, Math.max(0, options.configuredAsset.relativeGain)),
        }
      : { type: "silence" };
  }
  const fallback = getSfxGenerator(entry.builtInGeneratorId);
  if (fallback) return { type: "synth", renderer: fallback, relativeGain: 1 };
  if (entry.builtInAssetVoices) {
    return { type: "asset", voices: entry.builtInAssetVoices, relativeGain: 1 };
  }
  return { type: "silence" };
}

function eventGain(context: AudioContext, s: SfxRuntimeState, value: number): GainNode | null {
  if (!s.masterGain) return null;
  const gain = context.createGain();
  gain.gain.setValueAtTime(Math.min(4, Math.max(0, value)), context.currentTime);
  gain.connect(s.masterGain);
  return gain;
}

function decode(context: AudioContext, bytes: ArrayBuffer): Promise<AudioBuffer | null> {
  try {
    const result = context.decodeAudioData(bytes.slice(0));
    return Promise.resolve(result).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

function loadAsset(s: SfxRuntimeState, context: AudioContext, src: string): Promise<AudioBuffer | null> {
  const cacheKey = src;
  const cached = s.assetCache.get(cacheKey);
  if (cached) return cached;
  const pending = fetch(src)
    .then((response) => response.ok ? response.arrayBuffer() : Promise.reject(new Error("asset unavailable")))
    .then((bytes) => decode(context, bytes))
    .catch(() => null);
  s.assetCache.set(cacheKey, pending);
  while (s.assetCache.size > MAX_ASSET_CACHE_ENTRIES) {
    const oldest = s.assetCache.keys().next().value as string | undefined;
    if (!oldest) break;
    s.assetCache.delete(oldest);
  }
  return pending;
}

function renderAsset(
  s: SfxRuntimeState,
  context: AudioContext,
  voices: readonly SfxAssetVoice[],
  gainValue: number,
  configVersion: number,
): void {
  void Promise.all(voices.map(async (voice) => ({ voice, buffer: await loadAsset(s, context, voice.src) }))).then((loaded) => {
    if (s.muted || s.configVersion !== configVersion || context.state !== "running") return;
    try {
      for (const { voice, buffer } of loaded) {
        if (!buffer) continue;
        const output = eventGain(context, s, gainValue * voice.gain);
        if (!output) continue;
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(output);
        const start = context.currentTime + (voice.at ?? 0);
        const duration = Math.max(0, buffer.duration - (voice.trimEnd ?? 0));
        if (voice.fadeOut) {
          const parameter = output.gain;
          const fadeStart = start + Math.max(0, duration - voice.fadeOut);
          parameter.setValueAtTime(gainValue * voice.gain, fadeStart);
          parameter.linearRampToValueAtTime(0, fadeStart + voice.fadeOut);
        }
        if (voice.trimEnd) source.start(start, 0, duration);
        else source.start(start);
      }
    } catch {
      // Explicit asset failures are silence; never layer the built-in fallback.
    }
  }).catch(() => {});
}

function stop(event: SfxEvent): void {
  const s = state();
  const active = s.activeStops.get(event);
  if (!active) return;
  s.activeStops.delete(event);
  try { active(); } catch { /* an already-ended voice is silent */ }
}

function preload(event: SfxEvent): void {
  try {
    const s = state();
    const resolution = resolveEvent(s, event);
    const voices = resolution.type === "asset"
      ? resolution.voices
      : getSfxRegistryEntry(event)?.builtInAssetVoices;
    if (!voices) return;
    const context = ensureContext(s);
    if (!context) return;
    for (const voice of voices) void loadAsset(s, context, voice.src);
  } catch { /* optional warm-up is fail-soft */ }
}

function play(event: SfxEvent, options: SfxPlayOptions = {}): void {
  try {
    const s = state();
    const entry = getSfxRegistryEntry(event);
    if (!entry || s.muted || !s.configReady || !s.interacted) return;
    const now = Date.now();
    if (now - (s.lastPlayedAt.get(event) ?? 0) < entry.minReplayMs) return;
    const resolution = resolveEvent(s, event, options);
    if (resolution.type === "silence") return;
    const context = ensureContext(s);
    if (!context) return;
    if (context.state !== "running") {
      if (context.state === "suspended") {
        void context.resume().then(() => {
          if (context.state === "running") play(event, options);
        }).catch(() => {});
      }
      return;
    }
    if (options.eventId && !rememberEventId(s, options.eventId)) return;
    const gainValue = entry.relativeGain * resolution.relativeGain;
    // Stamp only after policy and a running context accept the event.
    s.lastPlayedAt.set(event, now);
    if (resolution.type === "asset") {
      renderAsset(s, context, resolution.voices, gainValue, s.configVersion);
      return;
    }
    const output = eventGain(context, s, gainValue);
    if (!output) return;
    const activeStop = resolution.renderer(context, output, context.currentTime, options);
    if (activeStop) {
      stop(event);
      s.activeStops.set(event, activeStop);
    }
  } catch {
    // Sound is optional. No renderer/config/platform failure reaches the caller.
  }
}

export const sfxController: SfxController = {
  getSnapshot: () => {
    const s = state();
    return s.snapshot ??= buildSnapshot(s);
  },
  subscribe(listener) {
    state().listeners.add(listener);
    return () => state().listeners.delete(listener);
  },
  play,
  stop,
  preload,
  unlock,
  refreshMute,
};

installUnlock();
if (!state().observersInstalled) {
  state().observersInstalled = true;
  if (typeof window !== "undefined") {
    window.addEventListener(SFX_MUTE_CHANGE_EVENT, refreshMute);
    window.addEventListener("storage", refreshMute);
  }
  subscribeAudioStudioRuntime(syncAudioStudio);
  subscribeSoundSettingsRuntime(syncSoundSettings);
  syncAudioStudio();
  syncSoundSettings();
}
mogzyAudio.registerSfx(sfxController);

/** Test seam; production configuration still comes only from Audio Studio. */
export function setSfxConfigForTests(config: AudioStudioConfig, ready = true): void {
  const s = state();
  s.config = config;
  s.configReady = ready;
  s.configVersion += 1;
  emit(s);
}

export function setSfxSettingsForTests(settings: SoundSettings, ready = true): void {
  const s = state();
  s.soundSettings = settings;
  s.soundSettingsReady = ready;
  s.configVersion += 1;
  emit(s);
}

export function resetSfxForTests(): void {
  const s = state();
  try { void s.context?.close(); } catch { /* optional platform cleanup */ }
  s.context = null;
  s.masterGain = null;
  s.interacted = false;
  s.config = EMPTY_AUDIO_STUDIO_CONFIG;
  s.configReady = false;
  s.configVersion += 1;
  s.muted = readMuted();
  s.soundSettings = SOUND_DEFAULTS;
  s.soundSettingsReady = true;
  s.snapshot = null;
  s.lastPlayedAt.clear();
  s.seenEventIds.clear();
  s.eventIdOrder.length = 0;
  s.assetCache.clear();
  for (const active of s.activeStops.values()) {
    try { active(); } catch { /* test cleanup */ }
  }
  s.activeStops.clear();
}

/** Compatibility seam for Admin preview and focused migration tests. */
export function resetSfxReplayGuards(): void {
  state().lastPlayedAt.clear();
}
