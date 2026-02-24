import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Megaphone, User, Clock, LayoutList, Eye, Settings2 } from "lucide-react";

interface SearchResult {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  is_pro: boolean | null;
  ads_enabled: boolean | null;
}

interface AdSettings {
  enabled: boolean;
  swipe_interval: number;
  format: string;
  placement: string[];
  pro_exempt: boolean;
  cooldown_seconds: number;
}

const defaultAdSettings: AdSettings = {
  enabled: true,
  swipe_interval: 10,
  format: "interstitial",
  placement: ["swipe", "leaderboard"],
  pro_exempt: true,
  cooldown_seconds: 30,
};

const AD_FORMATS = [
  { value: "interstitial", label: "Interstitial (Full Screen)" },
  { value: "banner", label: "Banner (Top/Bottom)" },
  { value: "native", label: "Native (In-Feed)" },
];

const AD_PLACEMENTS = [
  { value: "swipe", label: "Swipe Game" },
  { value: "leaderboard", label: "Leaderboard" },
  { value: "home", label: "Home Feed" },
  { value: "profile", label: "Profile View" },
  { value: "shop", label: "Shop" },
];

export default function AdminAds() {
  const [settings, setSettings] = useState<AdSettings>(defaultAdSettings);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("key, value")
      .eq("key", "global_ads_enabled")
      .single()
      .then(({ data }) => {
        if (data) {
          const val = data.value as any;
          setSettings({
            enabled: val?.enabled ?? true,
            swipe_interval: val?.swipe_interval ?? 10,
            format: val?.format ?? "interstitial",
            placement: val?.placement ?? ["swipe", "leaderboard"],
            pro_exempt: val?.pro_exempt ?? true,
            cooldown_seconds: val?.cooldown_seconds ?? 30,
          });
        }
        setLoading(false);
      });
  }, []);

  const saveSettings = async (newSettings: AdSettings) => {
    setSaving(true);
    setSettings(newSettings);
    const { error } = await supabase
      .from("app_settings")
      .update({ value: newSettings as any, updated_at: new Date().toISOString() })
      .eq("key", "global_ads_enabled");
    if (error) {
      toast.error("Failed to save settings");
    } else {
      toast.success("Ad settings saved");
    }
    setSaving(false);
  };

  const toggleGlobal = () => saveSettings({ ...settings, enabled: !settings.enabled });
  const toggleProExempt = () => saveSettings({ ...settings, pro_exempt: !settings.pro_exempt });

  const togglePlacement = (place: string) => {
    const newPlacements = settings.placement.includes(place)
      ? settings.placement.filter((p) => p !== place)
      : [...settings.placement, place];
    saveSettings({ ...settings, placement: newPlacements });
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
    setResults((prev) =>
      prev.map((p) => (p.id === profile.id ? { ...p, ads_enabled: newVal } : p))
    );
    const { error } = await supabase
      .from("profiles")
      .update({ ads_enabled: newVal } as any)
      .eq("id", profile.id);
    if (error) {
      setResults((prev) =>
        prev.map((p) => (p.id === profile.id ? { ...p, ads_enabled: !newVal } : p))
      );
      toast.error("Failed to update");
      return;
    }
    toast.success(`Ads ${newVal ? "enabled" : "disabled"} for ${profile.display_name}`);
  };

  if (loading) return null;

  return (
    <div className="space-y-4 sm:space-y-6">
      <h3 className="font-bold text-foreground flex items-center gap-2">
        <Megaphone className="h-4 w-4" /> Ad Management
      </h3>

      {/* Global toggle */}
      <div className="rounded-xl border border-border bg-card p-3 sm:p-4 flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">Global Ads</Label>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
            Master switch — disabling turns off all ads instantly
          </p>
        </div>
        <Switch checked={settings.enabled} onCheckedChange={toggleGlobal} disabled={saving} />
      </div>

      {/* Ad Configuration */}
      <div className="rounded-xl border border-border bg-card p-3 sm:p-4 space-y-4">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Settings2 className="h-3.5 w-3.5" /> Configuration
        </h4>

        {/* Format */}
        <div className="space-y-1">
          <Label className="text-xs">Ad Format</Label>
          <Select value={settings.format} onValueChange={(v) => saveSettings({ ...settings, format: v })}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AD_FORMATS.map((f) => (
                <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Swipe interval */}
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1">
            <Clock className="h-3 w-3" /> Show ad every N swipes
          </Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={3}
              max={50}
              value={settings.swipe_interval}
              onChange={(e) => {
                const v = parseInt(e.target.value) || 10;
                setSettings({ ...settings, swipe_interval: v });
              }}
              onBlur={() => saveSettings(settings)}
              className="h-8 text-xs w-24"
            />
            <span className="text-[10px] text-muted-foreground">swipes (min 3)</span>
          </div>
        </div>

        {/* Cooldown */}
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1">
            <Clock className="h-3 w-3" /> Cooldown between ads (seconds)
          </Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={10}
              max={300}
              value={settings.cooldown_seconds}
              onChange={(e) => {
                const v = parseInt(e.target.value) || 30;
                setSettings({ ...settings, cooldown_seconds: v });
              }}
              onBlur={() => saveSettings(settings)}
              className="h-8 text-xs w-24"
            />
            <span className="text-[10px] text-muted-foreground">seconds</span>
          </div>
        </div>

        {/* Pro exempt */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs">Pro users exempt from ads</Label>
            <p className="text-[10px] text-muted-foreground">Pro subscribers never see ads</p>
          </div>
          <Switch checked={settings.pro_exempt} onCheckedChange={toggleProExempt} disabled={saving} />
        </div>
      </div>

      {/* Placement */}
      <div className="rounded-xl border border-border bg-card p-3 sm:p-4 space-y-3">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <LayoutList className="h-3.5 w-3.5" /> Placement
        </h4>
        <div className="flex flex-wrap gap-2">
          {AD_PLACEMENTS.map((p) => {
            const active = settings.placement.includes(p.value);
            return (
              <button
                key={p.value}
                onClick={() => togglePlacement(p.value)}
                disabled={saving}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:border-foreground/30"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground">Select where ads appear in the app</p>
      </div>

      {/* Preview */}
      <div className="rounded-xl border border-border bg-card p-3 sm:p-4 space-y-2">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5" /> Current Config Summary
        </h4>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="bg-secondary rounded-lg p-2">
            <span className="text-muted-foreground">Status</span>
            <p className="font-bold text-foreground">{settings.enabled ? "🟢 Active" : "🔴 Off"}</p>
          </div>
          <div className="bg-secondary rounded-lg p-2">
            <span className="text-muted-foreground">Format</span>
            <p className="font-bold text-foreground capitalize">{settings.format}</p>
          </div>
          <div className="bg-secondary rounded-lg p-2">
            <span className="text-muted-foreground">Frequency</span>
            <p className="font-bold text-foreground">Every {settings.swipe_interval} swipes</p>
          </div>
          <div className="bg-secondary rounded-lg p-2">
            <span className="text-muted-foreground">Cooldown</span>
            <p className="font-bold text-foreground">{settings.cooldown_seconds}s</p>
          </div>
        </div>
      </div>

      {/* Per-user search */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground">Per-User Ad Control</h4>
        <p className="text-[10px] sm:text-xs text-muted-foreground">Search for a user to toggle their ads individually.</p>
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
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
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
                <Switch
                  checked={p.ads_enabled ?? true}
                  onCheckedChange={() => toggleUserAds(p)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
