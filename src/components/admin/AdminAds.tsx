import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Search, Megaphone, User, Clock, Eye, ChevronDown,
  Shuffle, RotateCcw, Palette, Zap, Home, Trophy, UserCircle,
  ShoppingBag, Layout, Type, Plus, Trash2, ExternalLink, Image,
} from "lucide-react";
import SwipeAdCard from "@/components/SwipeAdCard";
import type { AdCreative } from "@/components/SwipeAdCard";

/* ───── Types ───── */

interface PlacementConfig {
  enabled: boolean;
  format: string;
  frequency: number;
  cooldown_seconds: number;
  pro_exempt: boolean;
  cta_text: string;
  theme: string;
  size: string;
  animation: string;
  start_delay_seconds: number;
  max_per_session: number;
  days_active: string[];
  ab_variant: string;
  ad_mode: string; // "popup" | "in_swipe" | "both" | "off"
  ad_source: string; // "custom" | "adsense" | "hybrid"
  adsense_slot: string;
}

interface AdSettings {
  global_enabled: boolean;
  adsense_client_id: string;
  placements: Record<string, PlacementConfig>;
}

interface DbCreative {
  id: string;
  title: string;
  image_url: string;
  brand_name: string;
  cta_text: string;
  destination_url: string;
  is_enabled: boolean;
  placement: string;
  view_duration_seconds: number;
  created_at: string;
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
  ad_mode: "popup",
  ad_source: "custom",
  adsense_slot: "",
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

const AD_MODES = [
  { value: "popup", label: "Popup Only" },
  { value: "in_swipe", label: "In-Swipe Card" },
  { value: "both", label: "Both (Alternate)" },
  { value: "off", label: "Off" },
];

const AD_SOURCES = [
  { value: "custom", label: "Custom Creatives", description: "Your own ad images and CTA links" },
  { value: "adsense", label: "Google AdSense", description: "Google serves ads automatically" },
  { value: "hybrid", label: "Hybrid", description: "Custom creatives with AdSense fallback" },
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
  adsense_client_id: "",
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

  // Creatives state
  const [creatives, setCreatives] = useState<DbCreative[]>([]);
  const [creativesLoading, setCreativesLoading] = useState(true);
  const [newCreative, setNewCreative] = useState({ title: "", image_url: "", brand_name: "", cta_text: "Learn More", destination_url: "", placement: "swipe", view_duration_seconds: 5 });
  const [previewCreative, setPreviewCreative] = useState<AdCreative | null>(null);

  useEffect(() => {
    Promise.all([loadSettings(), loadCreatives()]);
  }, []);

  const loadSettings = async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("key, value")
      .eq("key", "global_ads_enabled")
      .single();
    if (data) {
      const val = data.value as any;
      if (val && typeof val === "object" && val.placements) {
        setSettings({
          global_enabled: val.global_enabled ?? val.enabled ?? true,
          adsense_client_id: val.adsense_client_id ?? "",
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
        setSettings({
          global_enabled: val?.enabled ?? true,
          adsense_client_id: val?.adsense_client_id ?? "",
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
  };

  const loadCreatives = async () => {
    setCreativesLoading(true);
    const { data } = await supabase.from("ad_creatives").select("*").order("created_at", { ascending: false });
    if (data) setCreatives(data as DbCreative[]);
    setCreativesLoading(false);
  };

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

  // Creative CRUD
  const addCreative = async () => {
    if (!newCreative.title.trim() || !newCreative.brand_name.trim()) {
      toast.error("Title and brand name are required");
      return;
    }
    const { error } = await supabase.from("ad_creatives").insert(newCreative);
    if (error) { toast.error("Failed to create"); return; }
    toast.success("Creative added");
    setNewCreative({ title: "", image_url: "", brand_name: "", cta_text: "Learn More", destination_url: "", placement: "swipe", view_duration_seconds: 5 });
    loadCreatives();
  };

  const toggleCreative = async (id: string, enabled: boolean) => {
    setCreatives(prev => prev.map(c => c.id === id ? { ...c, is_enabled: enabled } : c));
    const { error } = await supabase.from("ad_creatives").update({ is_enabled: enabled }).eq("id", id);
    if (error) {
      setCreatives(prev => prev.map(c => c.id === id ? { ...c, is_enabled: !enabled } : c));
      toast.error("Failed to update");
    }
  };

  const deleteCreative = async (id: string) => {
    const { error } = await supabase.from("ad_creatives").delete().eq("id", id);
    if (error) { toast.error("Failed to delete"); return; }
    setCreatives(prev => prev.filter(c => c.id !== id));
    toast.success("Deleted");
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
        <Button size="sm" variant="outline" onClick={randomizeVariants} disabled={saving} className="text-xs">
          <Shuffle className="h-3 w-3 mr-1" /> Randomize A/B
        </Button>
        <Button size="sm" variant="outline" onClick={() => {
          const updated = { ...settings };
          for (const key of Object.keys(updated.placements)) updated.placements[key] = { ...updated.placements[key], enabled: true };
          save(updated);
        }} disabled={saving} className="text-xs">
          <Eye className="h-3 w-3 mr-1" /> Enable All
        </Button>
        <Button size="sm" variant="outline" onClick={() => {
          const updated = { ...settings };
          for (const key of Object.keys(updated.placements)) updated.placements[key] = { ...updated.placements[key], enabled: false };
          save(updated);
        }} disabled={saving} className="text-xs">
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
          <span className="text-[10px] text-muted-foreground">Creatives</span>
          <p className="text-sm font-bold text-foreground">{creatives.filter(c => c.is_enabled).length} live</p>
        </div>
        <div className="bg-secondary rounded-lg p-2 text-center">
          <span className="text-[10px] text-muted-foreground">A/B Testing</span>
          <p className="text-sm font-bold text-foreground">{Object.values(settings.placements).filter(p => p.ab_variant !== "control").length} variants</p>
        </div>
      </div>

      {/* ═══════ In-Swipe Creatives Manager ═══════ */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Image className="h-4 w-4" /> In-Swipe Ad Creatives
        </h4>
        <p className="text-[10px] sm:text-xs text-muted-foreground">
          Create ad cards that appear as matchup cards during swiping. Users see them inline and must wait before skipping.
        </p>

        {/* Add creative form */}
        <div className="rounded-xl border border-border bg-card p-3 sm:p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground">Add New Creative</p>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Title" value={newCreative.title} onChange={(e) => setNewCreative(p => ({ ...p, title: e.target.value }))} className="h-8 text-xs" />
            <Input placeholder="Brand name" value={newCreative.brand_name} onChange={(e) => setNewCreative(p => ({ ...p, brand_name: e.target.value }))} className="h-8 text-xs" />
          </div>
          <Input placeholder="Image URL" value={newCreative.image_url} onChange={(e) => setNewCreative(p => ({ ...p, image_url: e.target.value }))} className="h-8 text-xs" />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="CTA text" value={newCreative.cta_text} onChange={(e) => setNewCreative(p => ({ ...p, cta_text: e.target.value }))} className="h-8 text-xs" />
            <Input placeholder="Destination URL" value={newCreative.destination_url} onChange={(e) => setNewCreative(p => ({ ...p, destination_url: e.target.value }))} className="h-8 text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Placement</Label>
              <Select value={newCreative.placement} onValueChange={(v) => setNewCreative(p => ({ ...p, placement: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLACEMENTS.map(p => <SelectItem key={p.key} value={p.key} className="text-xs">{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">View Duration (s)</Label>
              <Input type="number" min={1} max={30} value={newCreative.view_duration_seconds} onChange={(e) => setNewCreative(p => ({ ...p, view_duration_seconds: parseInt(e.target.value) || 5 }))} className="h-8 text-xs" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={addCreative} className="text-xs gap-1">
              <Plus className="h-3 w-3" /> Add Creative
            </Button>
            <Button size="sm" variant="outline" className="text-xs" onClick={() => {
              setPreviewCreative({
                id: "preview",
                title: newCreative.title || "Sample Ad",
                image_url: newCreative.image_url,
                brand_name: newCreative.brand_name || "Brand",
                cta_text: newCreative.cta_text || "Learn More",
                destination_url: newCreative.destination_url,
                view_duration_seconds: newCreative.view_duration_seconds,
              });
            }}>
              <Eye className="h-3 w-3 mr-1" /> Preview
            </Button>
          </div>
        </div>

        {/* Preview modal */}
        {previewCreative && (
          <div className="rounded-xl border border-primary/30 bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-primary">Live Preview</p>
              <Button size="sm" variant="ghost" className="text-xs h-6" onClick={() => setPreviewCreative(null)}>Close</Button>
            </div>
            <div className="max-w-[200px] mx-auto">
              <SwipeAdCard creative={previewCreative} onSkip={() => setPreviewCreative(null)} />
            </div>
          </div>
        )}

        {/* Creative list */}
        {creativesLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : creatives.length === 0 ? (
          <p className="text-xs text-muted-foreground">No creatives yet. Add one above.</p>
        ) : (
          <div className="space-y-1.5">
            {creatives.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5">
                <div className="h-12 w-12 rounded-lg bg-secondary overflow-hidden shrink-0">
                  {c.image_url ? (
                    <img src={c.image_url} alt={c.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                      <Megaphone className="h-4 w-4" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{c.title}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">{c.brand_name}</span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0">{c.placement}</Badge>
                    <span className="text-[10px] text-muted-foreground">{c.view_duration_seconds}s</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setPreviewCreative({
                    id: c.id,
                    title: c.title,
                    image_url: c.image_url,
                    brand_name: c.brand_name,
                    cta_text: c.cta_text,
                    destination_url: c.destination_url,
                    view_duration_seconds: c.view_duration_seconds,
                  })}>
                    <Eye className="h-3 w-3" />
                  </Button>
                  <Switch checked={c.is_enabled} onCheckedChange={(v) => toggleCreative(c.id, v)} />
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteCreative(c.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══════ Placement Configurations ═══════ */}
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
                          <Badge variant="outline" className="text-[9px] px-1 py-0">{config.ab_variant}</Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">{description}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={config.enabled ? "default" : "secondary"} className={`text-[10px] px-1.5 ${config.enabled ? "bg-primary text-primary-foreground" : ""}`}>
                        {config.enabled ? "ON" : "OFF"}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground capitalize">{config.ad_mode || "popup"}</span>
                      <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </div>
                  </button>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="border-t border-border p-3 sm:p-4 space-y-4">
                    {/* Row 1: Enable + Ad Mode + Format */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="flex items-center gap-2">
                        <Switch checked={config.enabled} onCheckedChange={(v) => updatePlacement(key, { enabled: v })} disabled={saving} />
                        <Label className="text-xs">Enabled</Label>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground font-semibold">Ad System</Label>
                        <Select value={config.ad_mode || "popup"} onValueChange={(v) => updatePlacement(key, { ad_mode: v })}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {AD_MODES.map(m => <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
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
                    </div>

                    {/* Row 2: Size + Frequency + Cooldown */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Size</Label>
                        <Select value={config.size} onValueChange={(v) => updatePlacement(key, { size: v })}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {SIZES.map(s => <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" /> Frequency
                        </Label>
                        <Input type="number" min={1} max={100} value={config.frequency}
                          onChange={(e) => setSettings(s => ({ ...s, placements: { ...s.placements, [key]: { ...s.placements[key], frequency: parseInt(e.target.value) || 10 } } }))}
                          onBlur={() => save(settings)} className="h-7 text-xs"
                        />
                        <span className="text-[9px] text-muted-foreground">every N actions</span>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Cooldown (s)</Label>
                        <Input type="number" min={5} max={600} value={config.cooldown_seconds}
                          onChange={(e) => setSettings(s => ({ ...s, placements: { ...s.placements, [key]: { ...s.placements[key], cooldown_seconds: parseInt(e.target.value) || 30 } } }))}
                          onBlur={() => save(settings)} className="h-7 text-xs"
                        />
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
                        <Label className="text-[10px] text-muted-foreground">Max/Session</Label>
                        <Input type="number" min={0} max={50} value={config.max_per_session}
                          onChange={(e) => setSettings(s => ({ ...s, placements: { ...s.placements, [key]: { ...s.placements[key], max_per_session: parseInt(e.target.value) || 0 } } }))}
                          onBlur={() => save(settings)} className="h-7 text-xs"
                        />
                        <span className="text-[9px] text-muted-foreground">0 = unlimited</span>
                      </div>
                    </div>

                    {/* CTA Text */}
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Type className="h-2.5 w-2.5" /> Custom CTA Text
                      </Label>
                      <Input placeholder="e.g. 'Upgrade to Pro to remove ads'" value={config.cta_text}
                        onChange={(e) => setSettings(s => ({ ...s, placements: { ...s.placements, [key]: { ...s.placements[key], cta_text: e.target.value } } }))}
                        onBlur={() => save(settings)} className="h-7 text-xs"
                      />
                    </div>

                    {/* Pro Exempt + A/B */}
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <Switch checked={config.pro_exempt} onCheckedChange={(v) => updatePlacement(key, { pro_exempt: v })} disabled={saving} />
                        <Label className="text-[10px]">Pro exempt</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-[10px] text-muted-foreground">A/B:</Label>
                        <div className="flex gap-1">
                          {AB_VARIANTS.map(v => (
                            <button key={v} onClick={() => updatePlacement(key, { ab_variant: v })}
                              className={`text-[10px] font-medium px-2 py-0.5 rounded-full border transition-colors ${
                                config.ab_variant === v
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-card text-muted-foreground border-border hover:border-foreground/30"
                              }`}>
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
                            <button key={day} onClick={() => toggleDay(key, day)}
                              className={`text-[10px] font-medium w-8 h-6 rounded border transition-colors capitalize ${
                                active ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:border-foreground/30"
                              }`}>
                              {day.slice(0, 2)}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Reset */}
                    <div className="flex justify-end">
                      <Button size="sm" variant="ghost" onClick={() => resetPlacement(key)} className="text-[10px] h-6 text-muted-foreground">
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
            <Input placeholder="Search by name or user ID…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} className="pl-9" />
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
                    <span className="text-[10px] text-muted-foreground">Ads: {(p.ads_enabled ?? true) ? "On" : "Off"}</span>
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
