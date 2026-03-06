import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Palette, Crown, Eye, Lock, Unlock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { profileThemes } from "@/lib/profile-themes";
import OnboardingFlow from "@/components/OnboardingFlow";

const THEME_COLORS: Record<string, [string, string]> = {
  midnight: ["hsl(250,50%,25%)", "hsl(260,60%,50%)"],
  forest: ["hsl(150,40%,25%)", "hsl(130,50%,35%)"],
  sunset: ["hsl(20,80%,50%)", "hsl(340,70%,50%)"],
  aurora: ["hsl(170,60%,40%)", "hsl(220,60%,50%)"],
  royal: ["hsl(45,90%,50%)", "hsl(280,40%,30%)"],
  lol: ["hsl(45,100%,50%)", "hsl(200,60%,40%)"],
  cyberpunk: ["hsl(320,100%,50%)", "hsl(180,100%,50%)"],
};

interface ThemeConfig {
  enabled: boolean;
  sitewide_enabled: boolean;
  free_themes: string[]; // theme ids available to everyone
  pro_themes: string[]; // theme ids only for pro
  disabled_themes: string[]; // themes hidden entirely
  default_theme: string;
}

const DEFAULT_CONFIG: ThemeConfig = {
  enabled: true,
  sitewide_enabled: false,
  free_themes: ["default", "midnight", "forest"],
  pro_themes: ["sunset", "aurora", "royal", "lol", "cyberpunk"],
  disabled_themes: [],
  default_theme: "default",
};

export default function AdminThemes() {
  const [config, setConfig] = useState<ThemeConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showThemePreview, setShowThemePreview] = useState(false);
  const [previewTheme, setPreviewTheme] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("app_settings").select("key, value").in("key", ["sitewide_themes_enabled", "theme_config"]),
    ]).then(([{ data }]) => {
      if (data) {
        let cfg = { ...DEFAULT_CONFIG };
        for (const row of data) {
          if (row.key === "sitewide_themes_enabled") {
            cfg.sitewide_enabled = (row.value as any)?.enabled ?? false;
          }
          if (row.key === "theme_config") {
            const val = row.value as any;
            if (val) {
              cfg = { ...cfg, ...val };
            }
          }
        }
        setConfig(cfg);
      }
      setLoading(false);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    const [r1, r2] = await Promise.all([
      supabase.from("app_settings").upsert(
        { key: "sitewide_themes_enabled", value: { enabled: config.sitewide_enabled } as any, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      ),
      supabase.from("app_settings").upsert(
        { key: "theme_config", value: config as any, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      ),
    ]);
    setSaving(false);
    if (r1.error || r2.error) {
      toast.error("Failed to save theme settings");
      return;
    }
    toast.success("Theme settings saved");
  };

  const getThemeStatus = (id: string): "free" | "pro" | "disabled" => {
    if (config.disabled_themes.includes(id)) return "disabled";
    if (config.pro_themes.includes(id)) return "pro";
    return "free";
  };

  const cycleThemeStatus = (id: string) => {
    if (id === "default") return; // default can't be changed
    const current = getThemeStatus(id);
    setConfig((prev) => {
      const next = { ...prev };
      // Remove from all lists
      next.free_themes = next.free_themes.filter((t) => t !== id);
      next.pro_themes = next.pro_themes.filter((t) => t !== id);
      next.disabled_themes = next.disabled_themes.filter((t) => t !== id);
      // Cycle: free -> pro -> disabled -> free
      if (current === "free") next.pro_themes.push(id);
      else if (current === "pro") next.disabled_themes.push(id);
      else next.free_themes.push(id);
      return next;
    });
  };

  if (loading) return null;

  const nonDefaultThemes = profileThemes.filter((t) => t.id !== "default");

  return (
    <div className="space-y-6">
      <h3 className="font-bold text-foreground flex items-center gap-2">
        <Palette className="h-4 w-4" /> Theme Management
      </h3>

      {/* Global toggles */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Global Settings</h4>
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div>
            <Label className="text-sm font-medium">Enable Theme System</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Allow users to select and apply themes</p>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={(v) => setConfig((c) => ({ ...c, enabled: v }))}
          />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div>
            <Label className="text-sm font-medium">Sitewide Theme Application</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Allow themes to override the entire app appearance (Pro feature)</p>
          </div>
          <Switch
            checked={config.sitewide_enabled}
            onCheckedChange={(v) => setConfig((c) => ({ ...c, sitewide_enabled: v }))}
          />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div>
            <Label className="text-sm font-medium">Default Theme for New Users</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Theme applied when a user first signs up</p>
          </div>
          <select
            value={config.default_theme}
            onChange={(e) => setConfig((c) => ({ ...c, default_theme: e.target.value }))}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          >
            {profileThemes.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Theme availability grid */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Theme Availability</h4>
        <p className="text-xs text-muted-foreground">Click a theme to cycle: <span className="text-green-500 font-semibold">Free</span> → <span className="text-yellow-500 font-semibold">Pro Only</span> → <span className="text-destructive font-semibold">Disabled</span></p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {nonDefaultThemes.map((theme) => {
            const status = getThemeStatus(theme.id);
            const colors = THEME_COLORS[theme.id] || ["#333", "#555"];
            return (
              <button
                key={theme.id}
                onClick={() => cycleThemeStatus(theme.id)}
                className={`relative rounded-xl border-2 p-3 transition-all text-left ${
                  status === "disabled"
                    ? "border-destructive/40 opacity-50"
                    : status === "pro"
                    ? "border-yellow-500/50"
                    : "border-green-500/50"
                }`}
              >
                <div
                  className="w-full h-10 rounded-lg mb-2"
                  style={{ background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` }}
                />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-foreground">{theme.label}</span>
                  {status === "pro" && <Crown className="h-3.5 w-3.5 text-yellow-500" />}
                  {status === "disabled" && <Lock className="h-3.5 w-3.5 text-destructive" />}
                  {status === "free" && <Unlock className="h-3.5 w-3.5 text-green-500" />}
                </div>
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                  status === "free" ? "text-green-500" : status === "pro" ? "text-yellow-500" : "text-destructive"
                }`}>
                  {status === "free" ? "Everyone" : status === "pro" ? "Pro Only" : "Hidden"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Preview tools */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preview & Tools</h4>
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div>
            <Label className="text-sm font-medium">Preview Theme Picker</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Preview the onboarding theme selection dialog</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowThemePreview(true)} className="text-xs gap-1">
            <Eye className="h-3 w-3" /> Preview
          </Button>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div>
            <Label className="text-sm font-medium">Live Preview Theme</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Temporarily apply a theme to see how it looks</p>
          </div>
          <div className="flex gap-2">
            <select
              value={previewTheme || ""}
              onChange={(e) => {
                const val = e.target.value;
                setPreviewTheme(val || null);
                // Apply temporary theme class
                document.documentElement.classList.remove(
                  ...profileThemes.map((t) => `theme-${t.id}`).filter((c) => c !== "theme-default")
                );
                if (val && val !== "default") {
                  document.documentElement.classList.add(`theme-${val}`);
                }
              }}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            >
              <option value="">None</option>
              {profileThemes.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            {previewTheme && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => {
                  setPreviewTheme(null);
                  document.documentElement.classList.remove(
                    ...profileThemes.map((t) => `theme-${t.id}`).filter((c) => c !== "theme-default")
                  );
                }}
              >
                Reset
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Stats summary */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Summary</h4>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-lg font-bold text-green-500">{config.free_themes.length}</p>
            <p className="text-[10px] text-muted-foreground">Free Themes</p>
          </div>
          <div>
            <p className="text-lg font-bold text-yellow-500">{config.pro_themes.length}</p>
            <p className="text-[10px] text-muted-foreground">Pro Themes</p>
          </div>
          <div>
            <p className="text-lg font-bold text-destructive">{config.disabled_themes.length}</p>
            <p className="text-[10px] text-muted-foreground">Disabled</p>
          </div>
        </div>
      </div>

      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? "Saving…" : "Save Theme Settings"}
      </Button>

      {showThemePreview && (
        <OnboardingFlow skipToTheme onComplete={() => setShowThemePreview(false)} />
      )}
    </div>
  );
}
