import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SoundSettings {
  launch_chime: boolean;
  bubble_tap: boolean;
  swipe_tap: boolean;
  correct_chime: boolean;
  wrong_tone: boolean;
  anim_paper_rip: boolean;
  anim_shatter: boolean;
  anim_burn: boolean;
  anim_vaporize: boolean;
  anim_crush: boolean;
  shop_purchase: boolean;
  shop_diamond_tap: boolean;
  shop_powerup: boolean;
}

export const SOUND_DEFAULTS: SoundSettings = {
  launch_chime: true,
  bubble_tap: true,
  swipe_tap: true,
  correct_chime: true,
  wrong_tone: true,
  anim_paper_rip: true,
  anim_shatter: true,
  anim_burn: true,
  anim_vaporize: true,
  anim_crush: true,
  shop_purchase: true,
  shop_diamond_tap: true,
  shop_powerup: true,
};

export const SOUND_LABELS: Record<keyof SoundSettings, { label: string; group: string; description: string }> = {
  launch_chime: { label: "Launch Chime", group: "General", description: "Sound when tapping the Mogsy logo to enter" },
  bubble_tap: { label: "Bubble Tap", group: "General", description: "iOS-style pop when tapping category bubbles" },
  swipe_tap: { label: "Swipe Tap", group: "Swiping", description: "Haptic pop sound on each swipe action" },
  correct_chime: { label: "Correct Chime", group: "Swiping", description: "Ascending two-note chime on correct Elo guess" },
  wrong_tone: { label: "Wrong Tone", group: "Swiping", description: "Descending tone on wrong Elo guess" },
  anim_paper_rip: { label: "Paper Rip", group: "Card Animations", description: "Ripping sound for the Slice animation" },
  anim_shatter: { label: "Shatter", group: "Card Animations", description: "Glass shatter sound for the Shatter animation" },
  anim_burn: { label: "Burn", group: "Card Animations", description: "Fire whoosh sound for the Burn animation" },
  anim_vaporize: { label: "Vaporize", group: "Card Animations", description: "Sparkle dissolve sound for the Vaporize animation" },
  anim_crush: { label: "Crush", group: "Card Animations", description: "Heavy impact sound for the Crush animation" },
  shop_purchase: { label: "Purchase Chime", group: "Shop", description: "Ascending arpeggio on purchases" },
  shop_diamond_tap: { label: "Diamond Tap", group: "Shop", description: "Quick clink when tapping diamond items" },
  shop_powerup: { label: "Power-Up Whoosh", group: "Shop", description: "Rising whoosh for power-up actions" },
};

// Singleton cache so all hooks share one fetch
let cachedSettings: SoundSettings | null = null;
let fetchPromise: Promise<SoundSettings> | null = null;

async function fetchSoundSettings(): Promise<SoundSettings> {
  if (cachedSettings) return cachedSettings;
  if (fetchPromise) return fetchPromise;
  fetchPromise = (async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "sound_settings")
      .maybeSingle();
    const val = data?.value as Record<string, boolean> | null;
    cachedSettings = val ? { ...SOUND_DEFAULTS, ...val } : { ...SOUND_DEFAULTS };
    return cachedSettings;
  })();
  return fetchPromise;
}

export function invalidateSoundSettingsCache() {
  cachedSettings = null;
  fetchPromise = null;
}

function applyMute(s: SoundSettings): SoundSettings {
  try {
    if (typeof window !== "undefined" && localStorage.getItem("mogsy-sounds-muted") === "1") {
      const muted = { ...s };
      (Object.keys(muted) as (keyof SoundSettings)[]).forEach((k) => { muted[k] = false; });
      return muted;
    }
  } catch {}
  return s;
}

export function useSoundSettings() {
  const [settings, setSettings] = useState<SoundSettings>(applyMute(cachedSettings || SOUND_DEFAULTS));
  const [loading, setLoading] = useState(!cachedSettings);

  useEffect(() => {
    fetchSoundSettings().then((s) => {
      setSettings(applyMute(s));
      setLoading(false);
    });
    const onChange = () => {
      setSettings(applyMute(cachedSettings || SOUND_DEFAULTS));
    };
    window.addEventListener("mogsy-sounds-muted-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("mogsy-sounds-muted-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  return { soundSettings: settings, loading };
}
