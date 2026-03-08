import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Monitor, Smartphone, Clock, Search, GripVertical, Trash2, Plus, ArrowUp, ArrowDown } from "lucide-react";

interface BannerConfig {
  rotation_delay: number;
  mode: "auto" | "manual";
  manual_items: ManualItem[];
}

interface ManualItem {
  id: string;
  type: "user" | "preset";
  name: string;
  image: string;
  elo: number;
  league_name: string;
}

interface SearchResult {
  id: string;
  type: "user" | "preset";
  name: string;
  image: string;
  elo: number;
  league_name: string;
}

const defaultConfig: BannerConfig = { rotation_delay: 4000, mode: "auto", manual_items: [] };

function BannerEditor({ configKey, label, icon: Icon }: { configKey: string; label: string; icon: React.ElementType }) {
  const [config, setConfig] = useState<BannerConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", configKey)
      .single()
      .then(({ data }) => {
        if (data) {
          const v = data.value as any;
          setConfig({
            rotation_delay: v?.rotation_delay ?? (configKey.includes("navbar") ? 7000 : 4000),
            mode: v?.mode ?? "auto",
            manual_items: v?.manual_items ?? [],
          });
        }
        setLoading(false);
      });
  }, [configKey]);

  const save = async (newConfig: BannerConfig) => {
    setSaving(true);
    setConfig(newConfig);
    const { error } = await supabase
      .from("app_settings")
      .update({ value: newConfig as any, updated_at: new Date().toISOString() })
      .eq("key", configKey);
    if (error) toast.error("Failed to save");
    else toast.success("Banner settings saved");
    setSaving(false);
  };

  const handleSearch = async () => {
    if (!search.trim()) return;
    setSearching(true);
    const q = search.trim().toLowerCase();

    const [{ data: presets }, { data: members }] = await Promise.all([
      supabase
        .from("preset_items")
        .select("id, name, image_url, elo, league_id, leagues!inner(name)")
        .ilike("name", `%${q}%`)
        .not("image_url", "is", null)
        .not("image_url", "eq", "")
        .limit(10),
      supabase
        .from("league_memberships")
        .select("profile_id, elo, league_id, leagues!inner(name)")
        .order("elo", { ascending: false })
        .limit(50),
    ]);

    const results: SearchResult[] = [];

    // Search presets
    (presets || []).forEach((item: any) => {
      results.push({
        id: item.id,
        type: "preset",
        name: item.name,
        image: item.image_url || "",
        elo: item.elo,
        league_name: item.leagues?.name || "",
      });
    });

    // Search users by name
    if (members && members.length > 0) {
      const pIds = [...new Set(members.map((m) => m.profile_id))];
      const { data: profiles } = await supabase
        .from("public_profiles")
        .select("id, display_name, avatar_url")
        .in("id", pIds)
        .ilike("display_name", `%${q}%`);
      const pMap = new Map((profiles || []).map((p) => [p.id, p]));
      members.forEach((m: any) => {
        const p = pMap.get(m.profile_id);
        if (p?.avatar_url && p.display_name?.toLowerCase().includes(q)) {
          if (!results.find((r) => r.id === m.profile_id && r.type === "user")) {
            results.push({
              id: m.profile_id,
              type: "user",
              name: p.display_name || "User",
              image: p.avatar_url,
              elo: m.elo,
              league_name: m.leagues?.name || "",
            });
          }
        }
      });
    }

    setSearchResults(results);
    setSearching(false);
  };

  const addItem = (item: SearchResult) => {
    if (config.manual_items.find((m) => m.id === item.id && m.type === item.type)) {
      toast.error("Already in list");
      return;
    }
    save({ ...config, manual_items: [...config.manual_items, item] });
    setSearchResults([]);
    setSearch("");
  };

  const removeItem = (idx: number) => {
    const newItems = config.manual_items.filter((_, i) => i !== idx);
    save({ ...config, manual_items: newItems });
  };

  const moveItem = (idx: number, dir: -1 | 1) => {
    const newItems = [...config.manual_items];
    const target = idx + dir;
    if (target < 0 || target >= newItems.length) return;
    [newItems[idx], newItems[target]] = [newItems[target], newItems[idx]];
    save({ ...config, manual_items: newItems });
  };

  if (loading) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-bold text-foreground">{label}</h4>
      </div>

      {/* Mode toggle */}
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs">Manual curation</Label>
          <p className="text-[10px] text-muted-foreground">
            {config.mode === "manual" ? "Showing your curated list" : "Auto-showing top Aura items"}
          </p>
        </div>
        <Switch
          checked={config.mode === "manual"}
          onCheckedChange={(v) => save({ ...config, mode: v ? "manual" : "auto" })}
          disabled={saving}
        />
      </div>

      {/* Rotation delay */}
      <div className="space-y-1">
        <Label className="text-xs flex items-center gap-1">
          <Clock className="h-3 w-3" /> Rotation delay (seconds)
        </Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={2}
            max={30}
            value={config.rotation_delay / 1000}
            onChange={(e) => {
              const v = Math.max(2, Math.min(30, parseFloat(e.target.value) || 4));
              setConfig({ ...config, rotation_delay: v * 1000 });
            }}
            onBlur={() => save(config)}
            className="h-8 text-xs w-20"
          />
          <span className="text-[10px] text-muted-foreground">seconds</span>
        </div>
      </div>

      {/* Manual items list */}
      {config.mode === "manual" && (
        <div className="space-y-2">
          <Label className="text-xs">Banner items ({config.manual_items.length})</Label>

          {config.manual_items.length === 0 && (
            <p className="text-[10px] text-muted-foreground italic">No items added yet. Search below to add.</p>
          )}

          <div className="space-y-1 max-h-60 overflow-y-auto">
            {config.manual_items.map((item, idx) => (
              <div key={`${item.type}-${item.id}-${idx}`} className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 p-2">
                <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
                <div className="h-7 w-7 rounded-full overflow-hidden border border-border shrink-0">
                  <img src={item.image} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-foreground truncate">{item.name}</p>
                  <p className="text-[9px] text-muted-foreground">{item.elo} ELO · {item.league_name} · {item.type}</p>
                </div>
                <div className="flex gap-0.5 shrink-0">
                  <button onClick={() => moveItem(idx, -1)} disabled={idx === 0} className="p-1 rounded hover:bg-secondary disabled:opacity-30">
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button onClick={() => moveItem(idx, 1)} disabled={idx === config.manual_items.length - 1} className="p-1 rounded hover:bg-secondary disabled:opacity-30">
                    <ArrowDown className="h-3 w-3" />
                  </button>
                  <button onClick={() => removeItem(idx)} className="p-1 rounded hover:bg-destructive/20 text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Search to add */}
          <div className="space-y-1.5 pt-2 border-t border-border">
            <Label className="text-xs flex items-center gap-1"><Plus className="h-3 w-3" /> Add items</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search users or collection items…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-8 h-8 text-xs"
                />
              </div>
              <Button size="sm" onClick={handleSearch} disabled={searching} className="h-8 text-xs">
                {searching ? "…" : "Search"}
              </Button>
            </div>

            {searchResults.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {searchResults.map((r) => (
                  <button
                    key={`${r.type}-${r.id}`}
                    onClick={() => addItem(r)}
                    className="w-full flex items-center gap-2 rounded-lg border border-border bg-card p-2 hover:bg-secondary/50 transition-colors text-left"
                  >
                    <div className="h-6 w-6 rounded-full overflow-hidden border border-border shrink-0">
                      <img src={r.image} alt="" className="h-full w-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-foreground truncate">{r.name}</p>
                      <p className="text-[9px] text-muted-foreground">{r.elo} ELO · {r.league_name} · {r.type}</p>
                    </div>
                    <Plus className="h-3.5 w-3.5 text-primary shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminBanners() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <h3 className="font-bold text-foreground flex items-center gap-2">
        🎠 Banner Management
      </h3>
      <BannerEditor configKey="navbar_banner_config" label="Top Bar Banner" icon={Monitor} />
      <BannerEditor configKey="home_banner_config" label="Home Screen Banner" icon={Smartphone} />
    </div>
  );
}
