import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Megaphone, User } from "lucide-react";

interface SearchResult {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  is_pro: boolean | null;
  ads_enabled: boolean | null;
}

export default function AdminAds() {
  const [globalAds, setGlobalAds] = useState(true);
  const [loading, setLoading] = useState(true);
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
        if (data) setGlobalAds((data.value as any)?.enabled ?? true);
        setLoading(false);
      });
  }, []);

  const toggleGlobal = async () => {
    const newVal = !globalAds;
    setGlobalAds(newVal);
    const { error } = await supabase
      .from("app_settings")
      .update({ value: { enabled: newVal } as any, updated_at: new Date().toISOString() })
      .eq("key", "global_ads_enabled");
    if (error) {
      setGlobalAds(!newVal);
      toast.error("Failed to update");
      return;
    }
    toast.success(newVal ? "Ads enabled globally" : "Ads disabled globally");
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
    <div className="space-y-6">
      <h3 className="font-bold text-foreground flex items-center gap-2">
        <Megaphone className="h-4 w-4" /> Ad Management
      </h3>

      {/* Global toggle */}
      <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">Global Ads</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Toggle ads on/off for all users (overrides individual settings when off)
          </p>
        </div>
        <Switch checked={globalAds} onCheckedChange={toggleGlobal} />
      </div>

      {/* Per-user search */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground">Per-User Ad Control</h4>
        <p className="text-xs text-muted-foreground">Search for a user to toggle their ads individually.</p>
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
