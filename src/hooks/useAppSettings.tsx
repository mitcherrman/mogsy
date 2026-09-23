import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_PLATFORM_POLICY,
  parsePlatformPolicy,
  type PlatformPolicy,
} from "@/lib/platform-policy/policy";

// LEGACY1 — this hook used to also carry `card_stats_config` (the retired
// voting product's card stat overlay) and `nav_tab_mode` (its Play/Swipe navbar
// switch). Both product surfaces are deleted and nothing read either value any
// more, so the rows are historical residue with no reader rather than settings.

interface AppSettings {
  require_auth: boolean;
  /**
   * Admin-controlled global platform policy (Combat Sim tokens + tutorial).
   * Read from the same app_settings rows the backend reads, so there is exactly
   * one storage authority. Fail-closed defaults reproduce current behaviour.
   */
  policy: PlatformPolicy;
}

const defaults: AppSettings = {
  require_auth: true,
  policy: DEFAULT_PLATFORM_POLICY,
};

// `app_settings.value` is a Json column and each key stores its own object
// shape. This describes the single-field row this hook reads, so a typo in a
// property name is a compile error instead of a silent `undefined`.
type RequireAuthValue = { enabled?: boolean };

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
            if (row.key === "require_auth") s.require_auth = (row.value as RequireAuthValue | null)?.enabled ?? true;
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
