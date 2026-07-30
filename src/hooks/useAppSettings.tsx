import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_PLATFORM_POLICY,
  parsePlatformPolicy,
  type PlatformPolicy,
} from "@/lib/platform-policy/policy";

export interface CardStatsConfig {
  position: "bottom-center" | "bottom-left" | "bottom-right" | "below-name" | "overlay-bottom";
  show_aura: boolean;
  show_rank: boolean;
  show_global: boolean;
  show_elo_change: boolean;
  aura_label: string;
  rank_label: string;
  font_size: string;
  font_weight: string;
  color_scheme: "default" | "muted" | "accent" | "custom";
  use_default_layout: boolean;
}

export const DEFAULT_CARD_STATS_CONFIG: CardStatsConfig = {
  position: "bottom-center",
  show_aura: true,
  show_rank: true,
  show_global: true,
  show_elo_change: true,
  aura_label: "Aura",
  rank_label: "#",
  font_size: "xs",
  font_weight: "semibold",
  color_scheme: "default",
  use_default_layout: true,
};

interface AppSettings {
  require_auth: boolean;
  card_stats_config: CardStatsConfig;
  nav_tab_mode: "play" | "swipe";
  /**
   * Admin-controlled global platform policy (Combat Sim tokens + tutorial).
   * Read from the same app_settings rows the backend reads, so there is exactly
   * one storage authority. Fail-closed defaults reproduce current behaviour.
   */
  policy: PlatformPolicy;
}

const defaults: AppSettings = {
  require_auth: true,
  card_stats_config: DEFAULT_CARD_STATS_CONFIG,
  nav_tab_mode: "play",
  policy: DEFAULT_PLATFORM_POLICY,
};

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(defaults);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("key, value")
      .then(({ data }) => {
        if (data) {
          const s = { ...defaults };
          for (const row of data) {
            if (row.key === "require_auth") s.require_auth = (row.value as any)?.enabled ?? true;
            if (row.key === "card_stats_config") {
              s.card_stats_config = { ...DEFAULT_CARD_STATS_CONFIG, ...(row.value as any) };
            }
            if (row.key === "nav_tab_mode") s.nav_tab_mode = (row.value as any)?.mode ?? "play";
          }
          // Policy rows are parsed by the shared pure contract, not inline, so
          // the guard, the hub, the admin panel, and the tests agree by
          // construction. A failed read leaves `data` null → defaults stand.
          s.policy = parsePlatformPolicy(data as { key: string; value: unknown }[]);
          setSettings(s);
        }
        setLoading(false);
      });
  }, []);

  return { settings, loading };
}
