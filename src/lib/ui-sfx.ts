import { useEffect, useState } from "react";

/**
 * Main-app UI sound effects.
 * --------------------------------------------------------------------------
 * Completely separate from the Quiz Broadcast SFX system
 * (src/lib/quiz-broadcast/sfx.ts) — different config, different localStorage
 * key, different public/ folder. Files live in public/audio/sfx/ and are
 * referenced by browser path, e.g. /audio/sfx/nav-click.mp3.
 *
 * Everything defaults OFF and every failure is soft: missing files, bad
 * paths, and autoplay blocks never throw or interrupt navigation.
 */

export type UiSfxEvent =
  | "appEnter"
  | "navClick"
  | "sectionOpen"
  | "primaryAction"
  | "success"
  | "error";

export type UiSfxItem = {
  enabled: boolean;
  /** Browser path, e.g. "/audio/sfx/nav-click.mp3" (file in public/audio/sfx/). */
  src: string;
  volume: number; // 0..1, multiplied by masterVolume
};

export type UiSfxConfig = {
  enabled: boolean;
  masterVolume: number; // 0..1
  sounds: Record<UiSfxEvent, UiSfxItem>;
};

export type UiSfxConfigPatch = Partial<Omit<UiSfxConfig, "sounds">> & {
  sounds?: Partial<Record<UiSfxEvent, Partial<UiSfxItem>>>;
};

export const UI_SFX_EVENTS: UiSfxEvent[] = [
  "appEnter",
  "navClick",
  "sectionOpen",
  "primaryAction",
  "success",
  "error",
];

const STORAGE_KEY = "mogsy.uiSfx.v1";
const CHANGE_EVENT = "mogsy-ui-sfx-changed";

const DEFAULT_ITEM: UiSfxItem = { enabled: false, src: "", volume: 0.6 };

export const DEFAULT_UI_SFX_CONFIG: UiSfxConfig = {
  enabled: false,
  masterVolume: 0.35,
  sounds: {
    appEnter: { ...DEFAULT_ITEM },
    navClick: { ...DEFAULT_ITEM },
    sectionOpen: { ...DEFAULT_ITEM },
    primaryAction: { ...DEFAULT_ITEM },
    success: { ...DEFAULT_ITEM },
    error: { ...DEFAULT_ITEM },
  },
};

function mergeConfig(base: UiSfxConfig, patch?: UiSfxConfigPatch | null): UiSfxConfig {
  if (!patch) return base;
  const sounds = {} as UiSfxConfig["sounds"];
  for (const ev of UI_SFX_EVENTS) {
    sounds[ev] = { ...DEFAULT_ITEM, ...base.sounds?.[ev], ...(patch.sounds?.[ev] ?? {}) };
  }
  return {
    enabled: patch.enabled ?? base.enabled,
    masterVolume: patch.masterVolume ?? base.masterVolume,
    sounds,
  };
}

let cached: UiSfxConfig | null = null;

export function getUiSfxConfig(): UiSfxConfig {
  if (cached) return cached;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    cached = raw ? mergeConfig(DEFAULT_UI_SFX_CONFIG, JSON.parse(raw)) : DEFAULT_UI_SFX_CONFIG;
  } catch {
    cached = DEFAULT_UI_SFX_CONFIG;
  }
  return cached;
}

export function setUiSfxConfig(patch: UiSfxConfigPatch): UiSfxConfig {
  cached = mergeConfig(getUiSfxConfig(), patch);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch {
    /* quota */
  }
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* SSR */
  }
  return cached;
}

/** React hook — config value that stays in sync across components/tabs. */
export function useUiSfxConfig(): UiSfxConfig {
  const [config, setConfig] = useState<UiSfxConfig>(() => getUiSfxConfig());
  useEffect(() => {
    const onChange = () => setConfig(getUiSfxConfig());
    const onStorage = () => {
      cached = null; // another tab wrote — re-read from disk
      setConfig(getUiSfxConfig());
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return config;
}

/* ── Playback ─────────────────────────────────────────────────────────── */

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

let lastBlocked = false;
let hasUserInteracted = false;
const lastPlayedAt: Partial<Record<UiSfxEvent, number>> = {};
const MIN_REPLAY_MS = 150; // guard against double-fire from repeated renders/bubbling

// Track the first user gesture so appEnter never autoplays on a cold load.
if (typeof window !== "undefined") {
  const markInteracted = () => {
    hasUserInteracted = true;
  };
  window.addEventListener("pointerdown", markInteracted, { once: true, passive: true });
  window.addEventListener("keydown", markInteracted, { once: true, passive: true });
}

/** True if a playback attempt was blocked by the browser's autoplay policy. */
export function wasUiSfxBlocked(): boolean {
  return lastBlocked;
}

export type UiSfxPlayResult = "played" | "blocked" | "error" | "skipped";

/**
 * Play one raw sound (used by Settings "Test" buttons). Never rejects.
 */
export function playUiSfxRaw(src: string, volume: number): Promise<UiSfxPlayResult> {
  if (!src || !src.trim()) return Promise.resolve("skipped");
  try {
    const audio = new Audio(src.trim());
    audio.volume = clamp01(volume);
    const p = audio.play();
    if (!p || typeof p.then !== "function") return Promise.resolve("played");
    return p.then(
      () => {
        lastBlocked = false;
        return "played" as const;
      },
      (err: unknown) => {
        if ((err as { name?: string } | null)?.name === "NotAllowedError") {
          lastBlocked = true;
          return "blocked" as const;
        }
        return "error" as const;
      },
    );
  } catch {
    return Promise.resolve("error");
  }
}

/**
 * Play a configured UI sound effect. No-op unless the master switch and the
 * event's own toggle are on and a src is set. `appEnter` additionally
 * requires a prior user gesture (no cold-load autoplay). Fails silently.
 */
export function playUiSfx(event: UiSfxEvent): void {
  const cfg = getUiSfxConfig();
  if (!cfg.enabled) return;
  const item = cfg.sounds[event];
  if (!item?.enabled || !item.src) return;
  if (event === "appEnter" && !hasUserInteracted) return;
  const now = Date.now();
  if (now - (lastPlayedAt[event] ?? 0) < MIN_REPLAY_MS) return;
  lastPlayedAt[event] = now;
  void playUiSfxRaw(item.src, cfg.masterVolume * item.volume);
}

let sharedCtx: AudioContext | null = null;

/** Prime audio from a user gesture so later programmatic playback works. */
export async function unlockUiSfx(): Promise<boolean> {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return true;
    sharedCtx = sharedCtx ?? new Ctor();
    if (sharedCtx.state === "suspended") await sharedCtx.resume();
    const buffer = sharedCtx.createBuffer(1, 1, 22050);
    const source = sharedCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(sharedCtx.destination);
    source.start(0);
    lastBlocked = false;
    return true;
  } catch {
    return false;
  }
}
