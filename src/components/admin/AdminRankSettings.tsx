import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getTierColor, getTierBgColor } from "@/lib/mock-data";

interface TierRow {
  name: string;
  min_percentile: number;
  max_percentile: number;
}

const DEFAULT_TIERS: TierRow[] = [
  { name: "unranked", min_percentile: 0, max_percentile: 60 },
  { name: "bronze", min_percentile: 60, max_percentile: 75 },
  { name: "silver", min_percentile: 75, max_percentile: 90 },
  { name: "gold", min_percentile: 90, max_percentile: 99 },
  { name: "diamond", min_percentile: 99, max_percentile: 100 },
];

const TIER_LABELS: Record<string, string> = {
  unranked: "Unranked",
  bronze: "Bronze 🥉",
  silver: "Silver 🥈",
  gold: "Gold 🥇",
  diamond: "Diamond 💎",
};

export default function AdminRankSettings() {
  const [enabled, setEnabled] = useState(true);
  const [tiers, setTiers] = useState<TierRow[]>(DEFAULT_TIERS);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "rank_tiers")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          const val = data.value as any;
          setEnabled(val.enabled ?? true);
          if (Array.isArray(val.tiers) && val.tiers.length > 0) {
            setTiers(val.tiers);
          }
        }
        setLoading(false);
      });
  }, []);

  const updateTier = (index: number, field: "min_percentile" | "max_percentile", value: number) => {
    setTiers((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSave = async () => {
    // Validate: tiers should cover 0-100 without gaps
    const sorted = [...tiers].sort((a, b) => a.min_percentile - b.min_percentile);
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].max_percentile !== sorted[i + 1].min_percentile) {
        toast.error(`Gap between ${sorted[i].name} and ${sorted[i + 1].name}: ${sorted[i].max_percentile}% to ${sorted[i + 1].min_percentile}%`);
        return;
      }
    }
    if (sorted[0].min_percentile !== 0 || sorted[sorted.length - 1].max_percentile !== 100) {
      toast.error("Tiers must cover 0% to 100%");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .update({ value: { enabled, tiers }, updated_at: new Date().toISOString() })
      .eq("key", "rank_tiers");

    if (error) {
      // Try insert if not exists
      await supabase.from("app_settings").insert({ key: "rank_tiers", value: { enabled, tiers } as any });
    }
    toast.success("Rank settings saved");
    setSaving(false);
  };

  const handleToggle = async () => {
    const newVal = !enabled;
    setEnabled(newVal);
    await supabase
      .from("app_settings")
      .update({ value: { enabled: newVal, tiers } as any, updated_at: new Date().toISOString() })
      .eq("key", "rank_tiers");
    toast.success(newVal ? "Rank system enabled" : "Rank system disabled");
  };

  if (loading) return null;

  return (
    <div className="space-y-6">
      <h3 className="font-bold text-foreground flex items-center gap-2">
        <Trophy className="h-4 w-4" /> Rank System
      </h3>
      <p className="text-xs text-muted-foreground">
        Configure percentile-based rank tiers for Compete leagues. Ranks are assigned based on a player's position relative to all players in the league.
      </p>

      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
        <div>
          <Label className="text-sm font-medium">Enable Rank System</Label>
          <p className="text-xs text-muted-foreground mt-0.5">Show tier badges and leaderboard highlighting for Compete leagues</p>
        </div>
        <Switch checked={enabled} onCheckedChange={handleToggle} />
      </div>

      {enabled && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Tier Thresholds</h4>
          <p className="text-xs text-muted-foreground">
            Define percentile ranges for each tier. Bottom of range is inclusive, top is exclusive (except Diamond top = 100%).
          </p>

          <div className="space-y-2">
            {tiers.map((tier, i) => (
              <div
                key={tier.name}
                className={`flex items-center gap-3 rounded-xl border p-3 ${getTierBgColor(tier.name)}`}
              >
                <div className="w-24 shrink-0">
                  <span className={`text-sm font-bold ${getTierColor(tier.name)}`}>
                    {TIER_LABELS[tier.name] || tier.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={tier.min_percentile}
                    onChange={(e) => updateTier(i, "min_percentile", parseInt(e.target.value) || 0)}
                    className="w-20 text-center"
                    disabled={i === 0}
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={tier.max_percentile}
                    onChange={(e) => updateTier(i, "max_percentile", parseInt(e.target.value) || 0)}
                    className="w-20 text-center"
                    disabled={i === tiers.length - 1}
                  />
                  <span className="text-xs text-muted-foreground">%ile</span>
                </div>
              </div>
            ))}
          </div>

          {/* Visual preview bar */}
          <div className="rounded-lg overflow-hidden h-6 flex">
            {tiers.map((tier) => {
              const width = tier.max_percentile - tier.min_percentile;
              const bgMap: Record<string, string> = {
                unranked: "bg-muted",
                bronze: "bg-tier-bronze",
                silver: "bg-tier-silver",
                gold: "bg-tier-gold",
                diamond: "bg-tier-diamond",
              };
              return (
                <div
                  key={tier.name}
                  className={`${bgMap[tier.name] || "bg-muted"} flex items-center justify-center text-[9px] font-bold text-white/90`}
                  style={{ width: `${width}%` }}
                >
                  {width >= 8 && `${tier.name.charAt(0).toUpperCase()}${tier.name.slice(1)}`}
                </div>
              );
            })}
          </div>

          <Button size="sm" variant="outline" disabled={saving} onClick={handleSave}>
            {saving ? "Saving..." : "Save Tier Config"}
          </Button>
        </div>
      )}
    </div>
  );
}
