import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface AppSettings {
  require_auth: boolean;
}

const defaults: AppSettings = { require_auth: true };

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
          }
          setSettings(s);
        }
        setLoading(false);
      });
  }, []);

  return { settings, loading };
}
