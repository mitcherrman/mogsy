import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Settings2, Shield, Users, Diamond, ImageIcon, Heart, Timer, Megaphone, Eye, Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SettingsState {
  require_auth: boolean;
  maintenance_mode: boolean;
  max_photos: number;
  default_diamonds: number;
  allow_anonymous_browsing: boolean;
  favorites_mode: "auto" | "manual";
  swipe_timer_enabled: boolean;
  swipe_timer_duration: number;
  shop_ad_enabled: boolean;
  shop_ad_type: "pro" | "diamonds";
  shop_ad_headline: string;
  shop_ad_subtext: string;
  show_match_count: boolean;
  show_swipe_progress: boolean;
  card_bg_opacity: number;
  nav_tab_mode: "play" | "swipe";
}

export default function AdminSettings() {
  const [settings, setSettings] = useState<SettingsState>({
    require_auth: true,
    maintenance_mode: false,
    max_photos: 6,
    default_diamonds: 0,
    allow_anonymous_browsing: true,
    favorites_mode: "auto",
    swipe_timer_enabled: false,
    swipe_timer_duration: 10,
    shop_ad_enabled: false,
    shop_ad_type: "pro",
    shop_ad_headline: "Upgrade to Pro!",
    shop_ad_subtext: "Unlock premium themes, animations, and more.",
    show_match_count: true,
    show_swipe_progress: true,
    card_bg_opacity: 20,
    nav_tab_mode: "play",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("key, value")
      .then(({ data }) => {
        if (data) {
          const s = { ...settings };
          for (const row of data) {
            const val = row.value as any;
            switch (row.key) {
              case "require_auth": s.require_auth = val?.enabled ?? true; break;
              case "maintenance_mode": s.maintenance_mode = val?.enabled ?? false; break;
              case "max_photos_per_user": s.max_photos = val?.count ?? 6; break;
              case "default_diamonds": s.default_diamonds = val?.count ?? 0; break;
              case "allow_anonymous_browsing": s.allow_anonymous_browsing = val?.enabled ?? true; break;
              case "favorites_mode": s.favorites_mode = val?.mode ?? "auto"; break;
              case "swipe_timer": s.swipe_timer_enabled = val?.enabled ?? false; s.swipe_timer_duration = val?.duration_seconds ?? 10; break;
              case "shop_ad_config": s.shop_ad_enabled = val?.enabled ?? false; s.shop_ad_type = val?.type ?? "pro"; s.shop_ad_headline = val?.headline ?? "Upgrade to Pro!"; s.shop_ad_subtext = val?.subtext ?? "Unlock premium themes, animations, and more."; break;
              case "show_match_count": s.show_match_count = val?.enabled ?? true; break;
              case "show_swipe_progress": s.show_swipe_progress = val?.enabled ?? true; break;
              case "card_bg_opacity": s.card_bg_opacity = val?.opacity ?? 20; break;
              case "nav_tab_mode": s.nav_tab_mode = val?.mode ?? "play"; break;
            }
          }
          setSettings(s);
        }
        setLoading(false);
      });
  }, []);

  const updateSetting = async (key: string, value: any) => {
    const { error } = await supabase
      .from("app_settings")
      .update({ value, updated_at: new Date().toISOString() })
      .eq("key", key);
    if (error) {
      toast.error("Failed to update setting");
      return false;
    }
    toast.success("Setting updated");
    return true;
  };

  const toggleSetting = async (field: keyof SettingsState, key: string) => {
    const newVal = !settings[field];
    setSettings((s) => ({ ...s, [field]: newVal }));
    const ok = await updateSetting(key, { enabled: newVal });
    if (!ok) setSettings((s) => ({ ...s, [field]: !newVal }));
  };

  const saveNumericSetting = async (field: "max_photos" | "default_diamonds", key: string) => {
    setSaving(true);
    await updateSetting(key, { count: settings[field] });
    setSaving(false);
  };

  if (loading) return null;

  return (
    <div className="space-y-6">
      <h3 className="font-bold text-foreground flex items-center gap-2">
        <Settings2 className="h-4 w-4" /> Master Admin Settings
      </h3>
      <p className="text-xs text-muted-foreground">These settings are only visible to the master admin.</p>

      {/* Auth & Access */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Shield className="h-3.5 w-3.5" /> Authentication & Access
        </h4>
        <SettingToggle label="Require Account Sign-Up" description="When off, users can browse without creating an account" checked={settings.require_auth} onChange={() => toggleSetting("require_auth", "require_auth")} />
        <SettingToggle label="Allow Anonymous Browsing" description="Let non-signed-up users use the app with limited features" checked={settings.allow_anonymous_browsing} onChange={() => toggleSetting("allow_anonymous_browsing", "allow_anonymous_browsing")} />
        <SettingToggle label="Maintenance Mode" description="Show a maintenance page to all non-admin users" checked={settings.maintenance_mode} onChange={() => toggleSetting("maintenance_mode", "maintenance_mode")} />
      </div>

      {/* User Defaults */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Users className="h-3.5 w-3.5" /> User Defaults
        </h4>
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div>
            <Label className="text-sm font-medium flex items-center gap-1"><ImageIcon className="h-3 w-3" /> Max Photos Per User</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Maximum number of profile photos allowed</p>
          </div>
          <div className="flex items-center gap-2">
            <Input type="number" min={1} max={20} value={settings.max_photos} onChange={(e) => setSettings((s) => ({ ...s, max_photos: parseInt(e.target.value) || 6 }))} className="w-20" />
            <Button size="sm" variant="outline" disabled={saving} onClick={() => saveNumericSetting("max_photos", "max_photos_per_user")}>Save</Button>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div>
            <Label className="text-sm font-medium flex items-center gap-1"><Diamond className="h-3 w-3" /> Default Diamonds for New Users</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Starting diamond balance for new accounts</p>
          </div>
          <div className="flex items-center gap-2">
            <Input type="number" min={0} max={10000} value={settings.default_diamonds} onChange={(e) => setSettings((s) => ({ ...s, default_diamonds: parseInt(e.target.value) || 0 }))} className="w-20" />
            <Button size="sm" variant="outline" disabled={saving} onClick={() => saveNumericSetting("default_diamonds", "default_diamonds")}>Save</Button>
          </div>
        </div>
      </div>

      {/* Swipe UI */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Eye className="h-3.5 w-3.5" /> Swipe UI
        </h4>
        <SettingToggle
          label="Show Match Count"
          description="Display the swords icon and match count number during swiping"
          checked={settings.show_match_count}
          onChange={() => toggleSetting("show_match_count", "show_match_count")}
        />
        <SettingToggle
          label="Show Swipe Progress Bar"
          description="Display the progress bar in preset/collection leagues"
          checked={settings.show_swipe_progress}
          onChange={() => toggleSetting("show_swipe_progress", "show_swipe_progress")}
        />
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div className="flex-1 mr-4">
            <Label className="text-sm font-medium flex items-center gap-1"><ImageIcon className="h-3 w-3" /> Card Background Opacity</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Opacity of the blurred background image on swipe cards ({settings.card_bg_opacity}%)</p>
          </div>
          <div className="flex items-center gap-3 min-w-[180px]">
            <Slider
              value={[settings.card_bg_opacity]}
              onValueChange={([v]) => setSettings(s => ({ ...s, card_bg_opacity: v }))}
              min={0}
              max={100}
              step={5}
              className="flex-1"
            />
            <Button size="sm" variant="outline" disabled={saving} onClick={async () => {
              setSaving(true);
              await updateSetting("card_bg_opacity", { opacity: settings.card_bg_opacity });
              setSaving(false);
            }}>Save</Button>
          </div>
        </div>
      </div>

      {/* Swipe Timer */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Timer className="h-3.5 w-3.5" /> Swipe Timer
        </h4>
        <SettingToggle
          label="Enable Swipe Timer"
          description="Players have a set time to choose or the match auto-skips"
          checked={settings.swipe_timer_enabled}
          onChange={async () => {
            const newVal = !settings.swipe_timer_enabled;
            setSettings(s => ({ ...s, swipe_timer_enabled: newVal }));
            const ok = await updateSetting("swipe_timer", { enabled: newVal, duration_seconds: settings.swipe_timer_duration });
            if (!ok) setSettings(s => ({ ...s, swipe_timer_enabled: !newVal }));
          }}
        />
        {settings.swipe_timer_enabled && (
          <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
            <div>
              <Label className="text-sm font-medium">Timer Duration (seconds)</Label>
              <p className="text-xs text-muted-foreground mt-0.5">How long players have to make a choice</p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={3}
                max={60}
                value={settings.swipe_timer_duration}
                onChange={(e) => setSettings(s => ({ ...s, swipe_timer_duration: parseInt(e.target.value) || 10 }))}
                className="w-20"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  await updateSetting("swipe_timer", { enabled: settings.swipe_timer_enabled, duration_seconds: settings.swipe_timer_duration });
                  setSaving(false);
                }}
              >
                Save
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Profile Favorites */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Heart className="h-3.5 w-3.5" /> Profile Favorites
        </h4>
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div>
            <Label className="text-sm font-medium">Favorites Mode</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {settings.favorites_mode === "auto" ? "Auto: Shows items based on user's swiping preferences" : "Manual: Users pick their own favorite items/profiles"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant={settings.favorites_mode === "auto" ? "default" : "outline"} onClick={async () => { setSettings((s) => ({ ...s, favorites_mode: "auto" })); await updateSetting("favorites_mode", { mode: "auto" }); }} className="text-xs">Auto</Button>
            <Button type="button" size="sm" variant={settings.favorites_mode === "manual" ? "default" : "outline"} onClick={async () => { setSettings((s) => ({ ...s, favorites_mode: "manual" })); await updateSetting("favorites_mode", { mode: "manual" }); }} className="text-xs">Manual</Button>
          </div>
        </div>
      </div>

      {/* Shop Ad */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Megaphone className="h-3.5 w-3.5" /> Shop Ad Banner
        </h4>
        <SettingToggle
          label="Enable Shop Ad"
          description="Show a promotional banner in the shop for non-Pro users"
          checked={settings.shop_ad_enabled}
          onChange={async () => {
            const newVal = !settings.shop_ad_enabled;
            setSettings(s => ({ ...s, shop_ad_enabled: newVal }));
            await updateSetting("shop_ad_config", { enabled: newVal, type: settings.shop_ad_type, headline: settings.shop_ad_headline, subtext: settings.shop_ad_subtext });
          }}
        />
        {settings.shop_ad_enabled && (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
              <div>
                <Label className="text-sm font-medium">Ad Type</Label>
                <p className="text-xs text-muted-foreground mt-0.5">What the ad promotes</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant={settings.shop_ad_type === "pro" ? "default" : "outline"} onClick={() => setSettings(s => ({ ...s, shop_ad_type: "pro" }))} className="text-xs">Pro</Button>
                <Button size="sm" variant={settings.shop_ad_type === "diamonds" ? "default" : "outline"} onClick={() => setSettings(s => ({ ...s, shop_ad_type: "diamonds" }))} className="text-xs">Diamonds</Button>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <div>
                <Label className="text-xs">Headline</Label>
                <Input value={settings.shop_ad_headline} onChange={e => setSettings(s => ({ ...s, shop_ad_headline: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Subtext</Label>
                <Input value={settings.shop_ad_subtext} onChange={e => setSettings(s => ({ ...s, shop_ad_subtext: e.target.value }))} />
              </div>
              <Button size="sm" variant="outline" disabled={saving} onClick={async () => {
                setSaving(true);
                await updateSetting("shop_ad_config", { enabled: settings.shop_ad_enabled, type: settings.shop_ad_type, headline: settings.shop_ad_headline, subtext: settings.shop_ad_subtext });
                setSaving(false);
              }}>Save Ad Config</Button>
            </div>
          </div>
        )}
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
