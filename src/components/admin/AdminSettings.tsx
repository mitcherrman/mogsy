// ---------------------------------------------------------------------------
// Admin · Platform settings (Operations › Configuration).
//
// LEGACY1 cut this panel down to the settings current Mogzy actually reads.
// What it used to write, and why each row went:
//
//   default_diamonds        starting balance for a currency Mogzy does not have
//   max_photos_per_user     profile photos — a retired dating field
//   favorites_mode          the deleted profile "Favorites" module
//   swipe_timer             the deleted Swipe product
//   shop_ad_config          the deleted /shop (its "Diamonds" ad type doubly so)
//   show_match_count        voting-product match counters
//   show_swipe_progress     the deleted Swipe product
//   card_bg_opacity         swipe card presentation
//   nav_tab_mode            the Play/Swipe navbar switch; its only reader was a
//                           branch behind the retired product's flag
//   maintenance_mode        written here, read by nothing — a switch that did
//                           not work is worse than no switch
//   allow_anonymous_browsing  likewise unread; guest access is decided by
//                           require_auth and Supabase anonymous sessions
//
// The `app_settings` rows are left in place (documented in LEGACY1_HANDOFF.md
// as historical residue) but no code writes or reads them any more.
//
// `require_auth` stays because it is live: useAuth reads it to decide whether a
// visitor is signed in anonymously, and useAppSettings publishes it.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Settings2, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SettingsState {
  require_auth: boolean;
}

export default function AdminSettings() {
  const [settings, setSettings] = useState<SettingsState>({ require_auth: true });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("key, value")
      .eq("key", "require_auth")
      .then(({ data }) => {
        if (data?.[0]) {
          const val = data[0].value as { enabled?: boolean } | null;
          setSettings({ require_auth: val?.enabled ?? true });
        }
        setLoading(false);
      });
  }, []);

  const toggleRequireAuth = async () => {
    const newVal = !settings.require_auth;
    setSettings({ require_auth: newVal });
    const { error } = await supabase
      .from("app_settings")
      .update({ value: { enabled: newVal }, updated_at: new Date().toISOString() })
      .eq("key", "require_auth");
    if (error) {
      toast.error("Failed to update setting");
      setSettings({ require_auth: !newVal });
      return;
    }
    toast.success("Setting updated");
  };

  if (loading) return null;

  return (
    <div className="space-y-6">
      <h3 className="font-bold text-foreground flex items-center gap-2">
        <Settings2 className="h-4 w-4" /> Master Admin Settings
      </h3>
      <p className="text-xs text-muted-foreground">These settings are only visible to the master admin.</p>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Shield className="h-3.5 w-3.5" /> Authentication &amp; Access
        </h4>
        <SettingToggle
          label="Require Account Sign-Up"
          description="When off, users can browse without creating an account"
          checked={settings.require_auth}
          onChange={toggleRequireAuth}
        />
      </div>
    </div>
  );
}

function SettingToggle({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
      <div>
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
