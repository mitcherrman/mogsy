import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Search, Megaphone, User, Clock, Eye, Settings2, ChevronDown,
  Shuffle, RotateCcw, Palette, Zap, Home, Trophy, UserCircle,
  ShoppingBag, Layout, Type, Image, Percent,
} from "lucide-react";

/* ───── Types ───── */

interface PlacementConfig {
  enabled: boolean;
  format: string;
  frequency: number; // e.g. every N swipes, or impressions per session
  cooldown_seconds: number;
  pro_exempt: boolean;
  cta_text: string;
  theme: string; // "auto" | "dark" | "light" | "brand"
  size: string; // "small" | "medium" | "large" | "fullscreen"
  animation: string; // "none" | "fade" | "slide" | "bounce"
  start_delay_seconds: number; // delay before first ad
  max_per_session: number; // 0 = unlimited
  days_active: string[]; // ["mon","tue",...] empty = all
  ab_variant: string; // "A" | "B" | "control"
}

interface AdSettings {
  global_enabled: boolean;
  placements: Record<string, PlacementConfig>;
}

const PLACEMENT_DEFAULTS: PlacementConfig = {
  enabled: true,
  format: "banner",
  frequency: 10,
  cooldown_seconds: 30,
  pro_exempt: true,
  cta_text: "",
  theme: "auto",
  size: "medium",
  animation: "fade",
  start_delay_seconds: 0,
  max_per_session: 0,
  days_active: [],
  ab_variant: "control",
};

const PLACEMENTS = [
  { key: "swipe", label: "Swipe Game", icon: Shuffle, description: "Interstitial between swipes" },
  { key: "navbar_banner", label: "Nav Banner", icon: Layout, description: "Rotating top navigation bar" },
  { key: "home_banner", label: "Home Banner", icon: Home, description: "Home page hero/banner area" },
  { key: "leaderboard", label: "Leaderboard", icon: Trophy, description: "Between leaderboard rows" },
  { key: "profile", label: "Profile View", icon: UserCircle, description: "On user profile pages" },
  { key: "shop", label: "Shop", icon: ShoppingBag, description: "In the shop/store page" },
  { key: "post_match", label: "Post-Match", icon: Zap, description: "After match result screen" },
];

const FORMATS = [
  { value: "banner", label: "Banner" },
  { value: "interstitial", label: "Interstitial" },
  { value: "native", label: "Native In-Feed" },
  { value: "rewarded", label: "Rewarded" },
  { value: "sticky", label: "Sticky Bottom" },
];

const THEMES = [
  { value: "auto", label: "Auto (Match App)" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "brand", label: "Brand Colors" },
];

const SIZES = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "fullscreen", label: "Full Screen" },
];

const ANIMATIONS = [
  { value: "none", label: "None" },
  { value: "fade", label: "Fade In" },
  { value: "slide", label: "Slide Up" },
  { value: "bounce", label: "Bounce" },
];

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const AB_VARIANTS = ["control", "A", "B"];

interface SearchResult {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  is_pro: boolean | null;
  ads_enabled: boolean | null;
}

const defaultSettings: AdSettings = {
  global_enabled: true,
  placements: Object.fromEntries(PLACEMENTS.map(p => [p.key, { ...PLACEMENT_DEFAULTS }])),
};

export default function AdminAds() {
  const [settings, setSettings] = useState<AdSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openPlacements, setOpenPlacements] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("key, value")
      .eq("key", "global_ads_enabled")
      .single()
      .then(({ data }) => {
        if (data) {
          const val = data.value as any;
          // Migrate old format
          if (val && typeof val === "object" && val.placements) {
            setSettings({
              global_enabled: val.global_enabled ?? val.enabled ?? true,
              placements: {
                ...defaultSettings.placements,
                ...Object.fromEntries(
                  Object.entries(val.placements).map(([k, v]: [string, any]) => [
                    k,
                    { ...PLACEMENT_DEFAULTS, ...v },
                  ])
                ),
              },
            });
          } else {
            // Old flat format - migrate
            setSettings({
              global_enabled: val?.enabled ?? true,
              placements: {
                ...defaultSettings.placements,
                swipe: {
                  ...PLACEMENT_DEFAULTS,
                  enabled: val?.enabled ?? true,
                  format: val?.format ?? "interstitial",
                  frequency: val?.swipe_interval ?? 10,
                  cooldown_seconds: val?.cooldown_seconds ?? 30,
                  pro_exempt: val?.pro_exempt ?? true,
                },
              },
            });
          }
        }
        setLoading(false);
      });
  }, []);

  const save = async (newSettings: AdSettings) => {
    setSaving(true);
    setSettings(newSettings);
    const { error } = await supabase
      .from("app_settings")
      .update({ value: newSettings as any, updated_at: new Date().toISOString() })
      .eq("key", "global_ads_enabled");
    if (error) toast.error("Failed to save");
    else toast.success("Saved");
    setSaving(false);
  };

  const updatePlacement = (key: string, patch: Partial<PlacementConfig>) => {
    const updated = {
      ...settings,
      placements: {
        ...settings.placements,
        [key]: { ...settings.placements[key], ...patch },
      },
    };
    save(updated);
  };

  const toggleDay = (placementKey: string, day: string) => {
    const current = settings.placements[placementKey]?.days_active || [];
    const newDays = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day];
    updatePlacement(placementKey, { days_active: newDays });
  };

  const randomizeVariants = () => {
    const updated = { ...settings };
    for (const key of Object.keys(updated.placements)) {
      updated.placements[key] = {
        ...updated.placements[key],
        ab_variant: AB_VARIANTS[Math.floor(Math.random() * AB_VARIANTS.length)],
      };
    }
    save(updated);
    toast.success("A/B variants randomized!");
  };

  const resetPlacement = (key: string) => {
    updatePlacement(key, { ...PLACEMENT_DEFAULTS });
    toast.success("Reset to defaults");
  };

  const handleSearch = async () => {
    if (!search.trim()) return;
    setSearching(true);
    const q = search.trim().toLowerCase();
    const { data } = await supabase
      .from("profiles")
      .select("id, user_id, display_name, avatar_url, is_pro, ads_enabled")
      .eq("is_bot", false)
      .or(`display_name.ilike.%${q}%,user_id.eq.${q.length === 36 ? q : "00000000-0000-0000-0000-000000000000"}`)
      .limit(20);
    setResults((data as SearchResult[]) || []);
    setSearching(false);
  };

  const toggleUserAds = async (profile: SearchResult) => {
    const newVal = !(profile.ads_enabled ?? true);
    setResults(prev => prev.map(p => p.id === profile.id ? { ...p, ads_enabled: newVal } : p));
    const { error } = await supabase.from("profiles").update({ ads_enabled: newVal } as any).eq("id", profile.id);
    if (error) {
      setResults(prev => prev.map(p => p.id === profile.id ? { ...p, ads_enabled: !newVal } : p));
      toast.error("Failed to update");
      return;
    }
    toast.success(`Ads ${newVal ? "enabled" : "disabled"} for ${profile.display_name}`);
  };

  if (loading) return null;

  const enabledCount = Object.values(settings.placements).filter(p => p.enabled).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-foreground flex items-center gap-2">
          <Megaphone className="h-4 w-4" /> Ad Management
        </h3>
        <Badge variant="secondary" className="text-[10px]">
          {enabledCount}/{PLACEMENTS.length} active
        </Badge>
      </div>

      {/* Global toggle */}
      <div className="rounded-xl border border-border bg-card p-3 sm:p-4 flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">Global Kill Switch</Label>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
            Disabling turns off ALL ads instantly across every placement
          </p>
        </div>
        <Switch
          checked={settings.global_enabled}
          onCheckedChange={(v) => save({ ...settings, global_enabled: v })}
          disabled={saving}
        />
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={randomizeVariants}
          disabled={saving}
          className="text-xs"
        >
          <Shuffle className="h-3 w-3 mr-1" /> Randomize A/B
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const updated = { ...settings };
            for (const key of Object.keys(updated.placements)) {
              updated.placements[key] = { ...updated.placements[key], enabled: true };
            }
            save(updated);
          }}
          disabled={saving}
          className="text-xs"
        >
          <Eye className="h-3 w-3 mr-1" /> Enable All
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const updated = { ...settings };
            for (const key of Object.keys(updated.placements)) {
              updated.placements[key] = { ...updated.placements[key], enabled: false };
            }
            save(updated);
          }}
          disabled={saving}
          className="text-xs"
        >
          Disable All
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-secondary rounded-lg p-2 text-center">
          <span className="text-[10px] text-muted-foreground">Status</span>
          <p className="text-sm font-bold text-foreground">{settings.global_enabled ? "🟢 Live" : "🔴 Off"}</p>
        </div>
        <div className="bg-secondary rounded-lg p-2 text-center">
          <span className="text-[10px] text-muted-foreground">Placements</span>
          <p className="text-sm font-bold text-foreground">{enabledCount} active</p>
        </div>
        <div className="bg-secondary rounded-lg p-2 text-center">
          <span className="text-[10px] text-muted-foreground">Formats</span>
          <p className="text-sm font-bold text-foreground">{[...new Set(Object.values(settings.placements).filter(p => p.enabled).map(p => p.format))].length}</p>
        </div>
        <div className="bg-secondary rounded-lg p-2 text-center">
          <span className="text-[10px] text-muted-foreground">A/B Testing</span>
          <p className="text-sm font-bold text-foreground">{Object.values(settings.placements).filter(p => p.ab_variant !== "control").length} variants</p>
        </div>
      </div>

      {/* Individual Placement Configs */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-foreground">Placement Configurations</h4>
        {PLACEMENTS.map(({ key, label, icon: Icon, description }) => {
          const config = settings.placements[key] || PLACEMENT_DEFAULTS;
          const isOpen = openPlacements[key] || false;

          return (
            <Collapsible
              key={key}
              open={isOpen}
              onOpenChange={(v) => setOpenPlacements(prev => ({ ...prev, [key]: v }))}
            >
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center gap-3 p-3 sm:p-4 hover:bg-secondary/50 transition-colors text-left">
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{label}</span>
                        {config.ab_variant !== "control" && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0">
                            {config.ab_variant}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">{description}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant={config.enabled ? "default" : "secondary"}
                        className={`text-[10px] px-1.5 ${config.enabled ? "bg-primary text-primary-foreground" : ""}`}
                      >
                        {config.enabled ? "ON" : "OFF"}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground capitalize">{config.format}</span>
                      <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </div>
                  </button>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="border-t border-border p-3 sm:p-4 space-y-4">
                    {/* Row 1: Enable + Format + Size */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={config.enabled}
                          onCheckedChange={(v) => updatePlacement(key, { enabled: v })}
                          disabled={saving}
                        />
                        <Label className="text-xs">Enabled</Label>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Format</Label>
                        <Select value={config.format} onValueChange={(v) => updatePlacement(key, { format: v })}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {FORMATS.map(f => <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Size</Label>
                        <Select value={config.size} onValueChange={(v) => updatePlacement(key, { size: v })}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {SIZES.map(s => <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Row 2: Frequency + Cooldown + Max per session */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" /> Frequency
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          value={config.frequency}
                          onChange={(e) => setSettings(s => ({
                            ...s,
                            placements: { ...s.placements, [key]: { ...s.placements[key], frequency: parseInt(e.target.value) || 10 } },
                          }))}
                          onBlur={() => save(settings)}
                          className="h-7 text-xs"
                        />
                        <span className="text-[9px] text-muted-foreground">every N actions</span>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Cooldown (s)</Label>
                        <Input
                          type="number"
                          min={5}
                          max={600}
                          value={config.cooldown_seconds}
                          onChange={(e) => setSettings(s => ({
                            ...s,
                            placements: { ...s.placements, [key]: { ...s.placements[key], cooldown_seconds: parseInt(e.target.value) || 30 } },
                          }))}
                          onBlur={() => save(settings)}
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Max/Session</Label>
                        <Input
                          type="number"
                          min={0}
                          max={50}
                          value={config.max_per_session}
                          onChange={(e) => setSettings(s => ({
                            ...s,
                            placements: { ...s.placements, [key]: { ...s.placements[key], max_per_session: parseInt(e.target.value) || 0 } },
                          }))}
                          onBlur={() => save(settings)}
                          className="h-7 text-xs"
                        />
                        <span className="text-[9px] text-muted-foreground">0 = unlimited</span>
                      </div>
                    </div>

                    {/* Row 3: Theme + Animation + Start Delay */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Palette className="h-2.5 w-2.5" /> Theme
                        </Label>
                        <Select value={config.theme} onValueChange={(v) => updatePlacement(key, { theme: v })}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {THEMES.map(t => <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Animation</Label>
                        <Select value={config.animation} onValueChange={(v) => updatePlacement(key, { animation: v })}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ANIMATIONS.map(a => <SelectItem key={a.value} value={a.value} className="text-xs">{a.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Start Delay (s)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={120}
                          value={config.start_delay_seconds}
                          onChange={(e) => setSettings(s => ({
                            ...s,
                            placements: { ...s.placements, [key]: { ...s.placements[key], start_delay_seconds: parseInt(e.target.value) || 0 } },
                          }))}
                          onBlur={() => save(settings)}
                          className="h-7 text-xs"
                        />
                      </div>
                    </div>

                    {/* CTA Text */}
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Type className="h-2.5 w-2.5" /> Custom CTA Text
                      </Label>
                      <Input
                        placeholder="e.g. 'Upgrade to Pro to remove ads'"
                        value={config.cta_text}
                        onChange={(e) => setSettings(s => ({
                          ...s,
                          placements: { ...s.placements, [key]: { ...s.placements[key], cta_text: e.target.value } },
                        }))}
                        onBlur={() => save(settings)}
                        className="h-7 text-xs"
                      />
                    </div>

                    {/* Pro Exempt + A/B */}
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={config.pro_exempt}
                          onCheckedChange={(v) => updatePlacement(key, { pro_exempt: v })}
                          disabled={saving}
                        />
                        <Label className="text-[10px]">Pro exempt</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-[10px] text-muted-foreground">A/B:</Label>
                        <div className="flex gap-1">
                          {AB_VARIANTS.map(v => (
                            <button
                              key={v}
                              onClick={() => updatePlacement(key, { ab_variant: v })}
                              className={`text-[10px] font-medium px-2 py-0.5 rounded-full border transition-colors ${
                                config.ab_variant === v
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-card text-muted-foreground border-border hover:border-foreground/30"
                              }`}
                            >
                              {v === "control" ? "Ctrl" : v}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Day scheduling */}
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground">Active Days (empty = all)</Label>
                      <div className="flex gap-1">
                        {DAYS.map(day => {
                          const active = (config.days_active || []).includes(day);
                          return (
                            <button
                              key={day}
                              onClick={() => toggleDay(key, day)}
                              className={`text-[10px] font-medium w-8 h-6 rounded border transition-colors capitalize ${
                                active
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-card text-muted-foreground border-border hover:border-foreground/30"
                              }`}
                            >
                              {day.slice(0, 2)}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Reset */}
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => resetPlacement(key)}
                        className="text-[10px] h-6 text-muted-foreground"
                      >
                        <RotateCcw className="h-3 w-3 mr-1" /> Reset Defaults
                      </Button>
                    </div>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>

      {/* Per-user search */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground">Per-User Ad Control</h4>
        <p className="text-[10px] sm:text-xs text-muted-foreground">Toggle ads for individual users.</p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or user ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-9"
            />
          </div>
          <Button size="sm" onClick={handleSearch} disabled={searching}>
            {searching ? "…" : "Search"}
          </Button>
        </div>

        {results.length > 0 && (
          <div className="space-y-1">
            {results.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{p.display_name}</p>
                  <div className="flex items-center gap-2">
                    {p.is_pro && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Pro</Badge>}
                    <span className="text-[10px] text-muted-foreground">
                      Ads: {(p.ads_enabled ?? true) ? "On" : "Off"}
                    </span>
                  </div>
                </div>
                <Switch checked={p.ads_enabled ?? true} onCheckedChange={() => toggleUserAds(p)} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
