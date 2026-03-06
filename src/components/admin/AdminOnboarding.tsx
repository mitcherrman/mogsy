import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles, Plus, Trash2, GripVertical, Eye, EyeOff, RotateCcw, Type, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import OnboardingFlow from "@/components/OnboardingFlow";

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
}

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
};

export default function AdminOnboarding() {
  const [config, setConfig] = useState<OnboardingConfig>(DEFAULT_CONFIG);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [newCatName, setNewCatName] = useState("");
  const [newCatEmoji, setNewCatEmoji] = useState("📁");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showFullPreview, setShowFullPreview] = useState(false);

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
              cfg = { ...cfg, ...val, categories: cfg.categories };
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

  if (loading) return null;

  const unusedCategories = availableCategories.filter(
    (c) => !config.categories.some((oc) => oc.name === c)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-foreground flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> Onboarding Customization
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => setShowFullPreview(true)}>
            <Eye className="h-3 w-3" /> Full Preview
          </Button>
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
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Theme Selection Step</h4>
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
    </div>
  );
}
