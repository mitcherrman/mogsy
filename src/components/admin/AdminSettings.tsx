import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Settings2, Shield, Users, Diamond, ImageIcon, Wrench, Heart, Palette, Sparkles, Plus, Trash2, GripVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import OnboardingFlow from "@/components/OnboardingFlow";

interface SettingsState {
  require_auth: boolean;
  maintenance_mode: boolean;
  max_photos: number;
  default_diamonds: number;
  allow_anonymous_browsing: boolean;
  favorites_mode: "auto" | "manual";
  sitewide_themes_enabled: boolean;
}

export default function AdminSettings() {
  const [settings, setSettings] = useState<SettingsState>({
    require_auth: true,
    maintenance_mode: false,
    max_photos: 6,
    default_diamonds: 0,
    allow_anonymous_browsing: true,
    favorites_mode: "auto",
    sitewide_themes_enabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showThemePreview, setShowThemePreview] = useState(false);

  // Onboarding categories state
  const [onboardingCategories, setOnboardingCategories] = useState<{ name: string; emoji: string }[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [newCatName, setNewCatName] = useState("");
  const [newCatEmoji, setNewCatEmoji] = useState("📁");
  const [savingCategories, setSavingCategories] = useState(false);

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
              case "sitewide_themes_enabled": s.sitewide_themes_enabled = val?.enabled ?? false; break;
              case "onboarding_categories":
                if (val?.categories && Array.isArray(val.categories)) {
                  setOnboardingCategories(val.categories);
                }
                break;
            }
          }
          setSettings(s);
        }
        setLoading(false);
      });

    // Load available categories from leagues
    supabase
      .from("leagues")
      .select("category")
      .not("category", "is", null)
      .then(({ data }) => {
        if (data) {
          const unique = [...new Set(data.map(l => l.category).filter(Boolean))] as string[];
          setAvailableCategories(unique.sort());
        }
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
        <SettingToggle
          label="Require Account Sign-Up"
          description="When off, users can browse without creating an account"
          checked={settings.require_auth}
          onChange={() => toggleSetting("require_auth", "require_auth")}
        />
        <SettingToggle
          label="Allow Anonymous Browsing"
          description="Let non-signed-up users use the app with limited features"
          checked={settings.allow_anonymous_browsing}
          onChange={() => toggleSetting("allow_anonymous_browsing", "allow_anonymous_browsing")}
        />
        <SettingToggle
          label="Maintenance Mode"
          description="Show a maintenance page to all non-admin users"
          checked={settings.maintenance_mode}
          onChange={() => toggleSetting("maintenance_mode", "maintenance_mode")}
        />
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
            <Input
              type="number"
              min={1}
              max={20}
              value={settings.max_photos}
              onChange={(e) => setSettings((s) => ({ ...s, max_photos: parseInt(e.target.value) || 6 }))}
              className="w-20"
            />
            <Button size="sm" variant="outline" disabled={saving} onClick={() => saveNumericSetting("max_photos", "max_photos_per_user")}>
              Save
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div>
            <Label className="text-sm font-medium flex items-center gap-1"><Diamond className="h-3 w-3" /> Default Diamonds for New Users</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Starting diamond balance for new accounts</p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={10000}
              value={settings.default_diamonds}
              onChange={(e) => setSettings((s) => ({ ...s, default_diamonds: parseInt(e.target.value) || 0 }))}
              className="w-20"
            />
            <Button size="sm" variant="outline" disabled={saving} onClick={() => saveNumericSetting("default_diamonds", "default_diamonds")}>
              Save
            </Button>
          </div>
        </div>
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
              {settings.favorites_mode === "auto" 
                ? "Auto: Shows items based on user's swiping preferences" 
                : "Manual: Users pick their own favorite items/profiles"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={settings.favorites_mode === "auto" ? "default" : "outline"}
              onClick={async () => {
                setSettings((s) => ({ ...s, favorites_mode: "auto" }));
                await updateSetting("favorites_mode", { mode: "auto" });
              }}
              className="text-xs"
            >
              Auto
            </Button>
            <Button
              type="button"
              size="sm"
              variant={settings.favorites_mode === "manual" ? "default" : "outline"}
              onClick={async () => {
                setSettings((s) => ({ ...s, favorites_mode: "manual" }));
                await updateSetting("favorites_mode", { mode: "manual" });
              }}
              className="text-xs"
            >
              Manual
            </Button>
          </div>
        </div>
      </div>

      {/* Sitewide Themes */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Palette className="h-3.5 w-3.5" /> Sitewide Themes
        </h4>
        <SettingToggle
          label="Enable Sitewide Themes (Pro Feature)"
          description="Allow Pro users to apply their profile theme across the entire app, including backgrounds, overlays, and themed UI elements"
          checked={settings.sitewide_themes_enabled}
          onChange={() => toggleSetting("sitewide_themes_enabled", "sitewide_themes_enabled")}
        />
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div>
            <Label className="text-sm font-medium">Preview Theme Picker</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Preview the onboarding theme selection dialog that new users see</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowThemePreview(true)}
            className="text-xs gap-1"
          >
            <Palette className="h-3 w-3" /> Preview
          </Button>
        </div>
      </div>

      {/* Onboarding Categories */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5" /> Onboarding Categories
        </h4>
        <p className="text-xs text-muted-foreground">
          Manage which categories new users can pick during onboarding. These are sourced from your available collections.
        </p>

        {/* Current categories */}
        <div className="space-y-2">
          {onboardingCategories.map((cat, idx) => (
            <div key={idx} className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={cat.emoji}
                onChange={(e) => {
                  const updated = [...onboardingCategories];
                  updated[idx] = { ...updated[idx], emoji: e.target.value };
                  setOnboardingCategories(updated);
                }}
                className="w-16 text-center"
                maxLength={4}
              />
              <span className="text-sm font-medium text-foreground flex-1">{cat.name}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                onClick={() => setOnboardingCategories(prev => prev.filter((_, i) => i !== idx))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        {/* Add from available */}
        {availableCategories.filter(c => !onboardingCategories.some(oc => oc.name === c)).length > 0 && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground self-center mr-1">Add:</span>
            {availableCategories
              .filter(c => !onboardingCategories.some(oc => oc.name === c))
              .map(cat => (
                <Button
                  key={cat}
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 gap-1"
                  onClick={() => setOnboardingCategories(prev => [...prev, { name: cat, emoji: "📁" }])}
                >
                  <Plus className="h-3 w-3" /> {cat}
                </Button>
              ))}
          </div>
        )}

        {/* Custom category */}
        <div className="flex items-center gap-2">
          <Input
            value={newCatEmoji}
            onChange={(e) => setNewCatEmoji(e.target.value)}
            className="w-16 text-center"
            maxLength={4}
            placeholder="📁"
          />
          <Input
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            className="flex-1"
            placeholder="Custom category name…"
          />
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            disabled={!newCatName.trim()}
            onClick={() => {
              setOnboardingCategories(prev => [...prev, { name: newCatName.trim(), emoji: newCatEmoji || "📁" }]);
              setNewCatName("");
              setNewCatEmoji("📁");
            }}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>

        <Button
          size="sm"
          disabled={savingCategories}
          onClick={async () => {
            setSavingCategories(true);
            // Upsert the onboarding_categories setting
            const { error } = await supabase
              .from("app_settings")
              .upsert({
                key: "onboarding_categories",
                value: { categories: onboardingCategories } as any,
                updated_at: new Date().toISOString(),
              }, { onConflict: "key" });
            setSavingCategories(false);
            if (error) {
              toast.error("Failed to save categories");
              return;
            }
            toast.success("Onboarding categories saved");
          }}
          className="w-full"
        >
          {savingCategories ? "Saving…" : "Save Onboarding Categories"}
        </Button>
      </div>

      {showThemePreview && (
        <OnboardingFlow
          skipToTheme
          onComplete={() => setShowThemePreview(false)}
        />
      )}
    </div>
  );
}

function SettingToggle({ label, description, checked, onChange }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
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
