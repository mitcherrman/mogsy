import { useCallback, useState } from "react";

/**
 * Per-device customization for the Mogzy profile page.
 * Stored in localStorage so users can toggle sections on/off without any
 * backend changes. LEGACY1 removed the `showLegacyMogsy` escape hatch: the
 * boost, favorites and legacy-frame modules it re-enabled are deleted.
 */
export interface ProfileConfig {
  showQuizProgress: boolean;
  showCategoryKnowledge: boolean;
  showCombatLab: boolean;
  showQuickActions: boolean;
  showPhotos: boolean;
  showSocials: boolean;
}

export const DEFAULT_PROFILE_CONFIG: ProfileConfig = {
  showQuizProgress: true,
  showCategoryKnowledge: true,
  showCombatLab: true,
  showQuickActions: true,
  showPhotos: true,
  showSocials: true,
};

const STORAGE_KEY = "mogsy.profileConfig.v1";

function loadConfig(): ProfileConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROFILE_CONFIG;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PROFILE_CONFIG, ...parsed };
  } catch {
    return DEFAULT_PROFILE_CONFIG;
  }
}

export function useProfileConfig() {
  const [config, setConfig] = useState<ProfileConfig>(loadConfig);

  const setOption = useCallback(<K extends keyof ProfileConfig>(key: K, value: ProfileConfig[K]) => {
    setConfig((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable — keep in-memory config */
      }
      return next;
    });
  }, []);

  const resetConfig = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setConfig(DEFAULT_PROFILE_CONFIG);
  }, []);

  return { config, setOption, resetConfig };
}
