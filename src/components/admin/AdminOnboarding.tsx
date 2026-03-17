import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles, Plus, Trash2, GripVertical, Eye, RotateCcw, Type, MessageSquare, User, Calendar, MapPin, Mail, Palette } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { profileThemes } from "@/lib/profile-themes";
import OnboardingFlow from "@/components/OnboardingFlow";

const THEME_COLORS: Record<string, [string, string]> = {
  light: ["hsl(209,40%,96%)", "hsl(210,80%,60%)"],
  dark: ["hsl(222,47%,11%)", "hsl(210,80%,65%)"],
  midnight: ["hsl(250,50%,25%)", "hsl(260,60%,50%)"],
  forest: ["hsl(150,40%,25%)", "hsl(130,50%,35%)"],
  sunset: ["hsl(20,80%,50%)", "hsl(340,70%,50%)"],
  aurora: ["hsl(170,60%,40%)", "hsl(220,60%,50%)"],
  royal: ["hsl(45,90%,50%)", "hsl(280,40%,30%)"],
  lol: ["hsl(45,100%,50%)", "hsl(200,60%,40%)"],
  cyberpunk: ["hsl(320,100%,50%)", "hsl(180,100%,50%)"],
};

interface ProfileFieldConfig {
  display_name: { enabled: boolean; required: boolean };
  age: { enabled: boolean; required: boolean };
  location: { enabled: boolean; required: boolean };
  photo: { enabled: boolean; required: boolean };
  email_link: { enabled: boolean; required: boolean };
}

interface ThemeIconOverride {
  [themeId: string]: string; // emoji or icon
}

interface OnboardingConfig {
  categories: { name: string; emoji: string }[];
  welcome_title: string;
  welcome_subtitle: string;
  welcome_description: string;
  category_title: string;
  category_subtitle: string;
  min_categories: number;
  show_theme_step: boolean;
  theme_title: string;
  theme_subtitle: string;
  profile_fields: ProfileFieldConfig;
  theme_icons: ThemeIconOverride;
}

const DEFAULT_PROFILE_FIELDS: ProfileFieldConfig = {
  display_name: { enabled: true, required: false },
  age: { enabled: true, required: false },
  location: { enabled: true, required: false },
  photo: { enabled: true, required: false },
  email_link: { enabled: true, required: false },
};

const DEFAULT_CONFIG: OnboardingConfig = {
  categories: [],
  welcome_title: "Welcome to Mogsy!",
  welcome_subtitle: "Swipe, rank, and discover who (or what) comes out on top.",
  welcome_description: "Pick your favorite in head-to-head matchups across collections — or compete against other users to climb the leaderboard.",
  category_title: "What are you into?",
  category_subtitle: "Pick at least {min} categories to personalize your experience.",
  min_categories: 3,
  show_theme_step: true,
  theme_title: "Choose Your Vibe",
  theme_subtitle: "Pick 1 premium theme to try for free.",
  profile_fields: DEFAULT_PROFILE_FIELDS,
  theme_icons: {},
};

const FIELD_META: { key: keyof ProfileFieldConfig; label: string; icon: typeof User; description: string }[] = [
  { key: "display_name", label: "Display Name", icon: User, description: "Username / display name field" },
  { key: "age", label: "Age", icon: Calendar, description: "Age input field" },
  { key: "location", label: "City / Location", icon: MapPin, description: "City autocomplete field" },
  { key: "photo", label: "Profile Photo", icon: Eye, description: "Photo upload button" },
  { key: "email_link", label: "Email & Password (anon)", icon: Mail, description: "Account linking for anonymous users" },
];

export default function AdminOnboarding() {
  const [config, setConfig] = useState<OnboardingConfig>(DEFAULT_CONFIG);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [newCatName, setNewCatName] = useState("");
  const [newCatEmoji, setNewCatEmoji] = useState("📁");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [showThemePreview, setShowThemePreview] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from("app_settings").select("key, value").in("key", ["onboarding_categories", "onboarding_config"]),
      supabase.from("leagues").select("category").not("category", "is", null),
    ]).then(([{ data: settingsData }, { data: leagueData }]) => {
      let cfg = { ...DEFAULT_CONFIG };

      if (settingsData) {
        for (const row of settingsData) {
          if (row.key === "onboarding_categories") {
            const val = row.value as any;
            if (val?.categories && Array.isArray(val.categories)) {
              cfg.categories = val.categories;
            }
          }
          if (row.key === "onboarding_config") {
            const val = row.value as any;
            if (val) {
              cfg = {
                ...cfg,
                ...val,
                categories: cfg.categories,
                profile_fields: { ...DEFAULT_PROFILE_FIELDS, ...(val.profile_fields || {}) },
                theme_icons: val.theme_icons || {},
              };
            }
          }
        }
      }

      if (leagueData) {
        const unique = [...new Set(leagueData.map((l) => l.category).filter(Boolean))] as string[];
        setAvailableCategories(unique.sort());
      }

      setConfig(cfg);
      setLoading(false);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    const { categories, ...configWithoutCategories } = config;
    const [r1, r2] = await Promise.all([
      supabase.from("app_settings").upsert(
        { key: "onboarding_categories", value: { categories } as any, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      ),
      supabase.from("app_settings").upsert(
        { key: "onboarding_config", value: configWithoutCategories as any, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      ),
    ]);
    setSaving(false);
    if (r1.error || r2.error) {
      toast.error("Failed to save onboarding settings");
      return;
    }
    toast.success("Onboarding settings saved");
  };

  const resetToDefaults = () => {
    setConfig({ ...DEFAULT_CONFIG, categories: config.categories });
    toast.info("Text reset to defaults (save to apply)");
  };

  const updateField = (key: keyof ProfileFieldConfig, prop: "enabled" | "required", val: boolean) => {
    setConfig((c) => ({
      ...c,
      profile_fields: {
        ...c.profile_fields,
        [key]: {
          ...c.profile_fields[key],
          [prop]: val,
          // If disabling, also un-require
          ...(prop === "enabled" && !val ? { required: false } : {}),
        },
      },
    }));
  };

  const updateThemeIcon = (themeId: string, icon: string) => {
    setConfig((c) => ({
      ...c,
      theme_icons: { ...c.theme_icons, [themeId]: icon },
    }));
  };

  if (loading) return null;

  const unusedCategories = availableCategories.filter(
    (c) => !config.categories.some((oc) => oc.name === c)
  );

  const proThemes = profileThemes.filter((t) => t.isPro && t.id !== "cycle");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-foreground flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> Onboarding Customization
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => setShowThemePreview(true)}>
            <Palette className="h-3 w-3" /> Theme Picker
          </Button>
          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => setShowFullPreview(true)}>
            <Eye className="h-3 w-3" /> Full Preview
          </Button>
        </div>
      </div>

      {/* Profile Step Field Toggles */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <User className="h-3 w-3" /> Profile Step Fields
        </h4>
        <p className="text-xs text-muted-foreground">
          Choose which fields appear and which are mandatory during the profile setup step.
        </p>
        <div className="space-y-2">
          {FIELD_META.map(({ key, label, icon: Icon, description }) => {
            const field = config.profile_fields[key];
            return (
              <div key={key} className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-[10px] text-muted-foreground">{description}</p>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="flex flex-col items-center gap-0.5">
                    <Switch
                      checked={field.enabled}
                      onCheckedChange={(v) => updateField(key, "enabled", v)}
                    />
                    <span className="text-[9px] text-muted-foreground">Show</span>
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <Switch
                      checked={field.required}
                      onCheckedChange={(v) => updateField(key, "required", v)}
                      disabled={!field.enabled}
                    />
                    <span className="text-[9px] text-muted-foreground">Required</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Welcome Step Customization */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Type className="h-3 w-3" /> Welcome Screen
        </h4>
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Title</Label>
            <Input
              value={config.welcome_title}
              onChange={(e) => setConfig((c) => ({ ...c, welcome_title: e.target.value }))}
              placeholder="Welcome to Mogsy!"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Subtitle</Label>
            <Input
              value={config.welcome_subtitle}
              onChange={(e) => setConfig((c) => ({ ...c, welcome_subtitle: e.target.value }))}
              placeholder="Swipe, rank, and discover..."
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Textarea
              value={config.welcome_description}
              onChange={(e) => setConfig((c) => ({ ...c, welcome_description: e.target.value }))}
              rows={2}
              className="text-sm"
            />
          </div>
        </div>
      </div>

      {/* Category Step Customization */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <MessageSquare className="h-3 w-3" /> Category Selection Step
        </h4>
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Title</Label>
            <Input
              value={config.category_title}
              onChange={(e) => setConfig((c) => ({ ...c, category_title: e.target.value }))}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Subtitle (use {"{min}"} for min count)</Label>
            <Input
              value={config.category_subtitle}
              onChange={(e) => setConfig((c) => ({ ...c, category_subtitle: e.target.value }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Minimum Categories</Label>
              <p className="text-xs text-muted-foreground">How many categories users must pick</p>
            </div>
            <Input
              type="number"
              min={1}
              max={10}
              value={config.min_categories}
              onChange={(e) => setConfig((c) => ({ ...c, min_categories: parseInt(e.target.value) || 3 }))}
              className="w-20"
            />
          </div>
        </div>
      </div>

      {/* Theme Step */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Palette className="h-3 w-3" /> Theme Selection Step
        </h4>
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div>
            <Label className="text-sm font-medium">Show Theme Step</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Include the "Choose Your Vibe" step in onboarding</p>
          </div>
          <Switch
            checked={config.show_theme_step}
            onCheckedChange={(v) => setConfig((c) => ({ ...c, show_theme_step: v }))}
          />
        </div>
        {config.show_theme_step && (
          <>
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Title</Label>
                <Input
                  value={config.theme_title}
                  onChange={(e) => setConfig((c) => ({ ...c, theme_title: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Subtitle</Label>
                <Input
                  value={config.theme_subtitle}
                  onChange={(e) => setConfig((c) => ({ ...c, theme_subtitle: e.target.value }))}
                />
              </div>
            </div>

            {/* Theme Icons */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div>
                <Label className="text-sm font-medium">Theme Icons</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Customize the emoji/icon shown under each theme bubble in the picker
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {proThemes.map((theme) => {
                  const colors = THEME_COLORS[theme.id] || ["#333", "#555"];
                  const currentIcon = config.theme_icons[theme.id] || "";
                  return (
                    <div key={theme.id} className="flex items-center gap-2 rounded-lg border border-border bg-background p-2">
                      <div
                        className="w-8 h-8 rounded-full shrink-0"
                        style={{ background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold text-foreground truncate">{theme.label}</p>
                        <Input
                          value={currentIcon}
                          onChange={(e) => updateThemeIcon(theme.id, e.target.value)}
                          placeholder="🎨"
                          className="h-7 text-center text-sm px-1 mt-0.5"
                          maxLength={4}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Categories Management */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Onboarding Categories</h4>
        <p className="text-xs text-muted-foreground">
          Manage which categories appear during onboarding. Drag to reorder.
        </p>

        <div className="space-y-2">
          {config.categories.map((cat, idx) => (
            <div key={idx} className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={cat.emoji}
                onChange={(e) => {
                  const updated = [...config.categories];
                  updated[idx] = { ...updated[idx], emoji: e.target.value };
                  setConfig((c) => ({ ...c, categories: updated }));
                }}
                className="w-16 text-center"
                maxLength={4}
              />
              <span className="text-sm font-medium text-foreground flex-1">{cat.name}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                onClick={() =>
                  setConfig((c) => ({
                    ...c,
                    categories: c.categories.filter((_, i) => i !== idx),
                  }))
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        {unusedCategories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground self-center mr-1">Add:</span>
            {unusedCategories.map((cat) => (
              <Button
                key={cat}
                variant="outline"
                size="sm"
                className="text-xs h-7 gap-1"
                onClick={() =>
                  setConfig((c) => ({
                    ...c,
                    categories: [...c.categories, { name: cat, emoji: "📁" }],
                  }))
                }
              >
                <Plus className="h-3 w-3" /> {cat}
              </Button>
            ))}
          </div>
        )}

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
              setConfig((c) => ({
                ...c,
                categories: [...c.categories, { name: newCatName.trim(), emoji: newCatEmoji || "📁" }],
              }));
              setNewCatName("");
              setNewCatEmoji("📁");
            }}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={resetToDefaults}>
          <RotateCcw className="h-3 w-3" /> Reset Text
        </Button>
      </div>

      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? "Saving…" : "Save Onboarding Settings"}
      </Button>

      {showFullPreview && (
        <OnboardingFlow onComplete={() => setShowFullPreview(false)} />
      )}
      {showThemePreview && (
        <OnboardingFlow skipToTheme onComplete={() => setShowThemePreview(false)} />
      )}
    </div>
  );
}