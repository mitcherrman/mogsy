import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import {
  getSoundSettingsRuntimeSnapshot,
  invalidateSoundSettingsCache,
  loadSoundSettingsRuntime,
  SOUND_DEFAULTS,
  SOUND_LABELS,
  subscribeSoundSettingsRuntime,
  type SoundSettings,
} from "@/lib/audio/sound-settings-runtime";

export { invalidateSoundSettingsCache, SOUND_DEFAULTS, SOUND_LABELS };
export type { SoundSettings };

function readMuted(): boolean {
  try {
    return typeof window !== "undefined" && localStorage.getItem("mogsy-sounds-muted") === "1";
  } catch {
    return false;
  }
}

function applyMute(settings: SoundSettings, muted: boolean): SoundSettings {
  if (!muted) return settings;
  return Object.fromEntries(Object.keys(settings).map((key) => [key, false])) as unknown as SoundSettings;
}

/** Compatibility view for Admin and development-only legacy surfaces. */
export function useSoundSettings() {
  const runtime = useSyncExternalStore(
    subscribeSoundSettingsRuntime,
    getSoundSettingsRuntimeSnapshot,
    getSoundSettingsRuntimeSnapshot,
  );
  const [muted, setMuted] = useState(readMuted);

  useEffect(() => {
    void loadSoundSettingsRuntime();
    const onChange = () => setMuted(readMuted());
    window.addEventListener("mogsy-sounds-muted-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("mogsy-sounds-muted-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  return {
    soundSettings: useMemo(() => applyMute(runtime.settings, muted), [runtime.settings, muted]),
    loading: runtime.status === "idle" || runtime.status === "loading",
  };
}
