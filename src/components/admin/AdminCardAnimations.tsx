import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CARD_ANIMATIONS } from "@/lib/card-animations";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface AnimationConfig {
  [animationId: string]: {
    enabled: boolean;
    pro_only: boolean;
  };
}

interface UsageStats {
  animation_id: string;
  context: string;
  count: number;
}

export default function AdminCardAnimations() {
  const [config, setConfig] = useState<AnimationConfig>({});
  const [usage, setUsage] = useState<UsageStats[]>([]);
  const [activeUsers, setActiveUsers] = useState<{ animation: string; context: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    // Load config from app_settings
    const { data: settings } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "card_animations")
      .single();

    if (settings?.value) {
      setConfig(settings.value as unknown as AnimationConfig);
    } else {
      // Initialize defaults
      const defaults: AnimationConfig = {};
      CARD_ANIMATIONS.forEach(a => {
        defaults[a.id] = { enabled: true, pro_only: a.defaultProOnly };
      });
      setConfig(defaults);
    }

    // Load usage stats (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { data: logs } = await supabase
      .from("animation_usage_logs")
      .select("animation_id, context")
      .gte("created_at", thirtyDaysAgo.toISOString());

    if (logs) {
      const countMap = new Map<string, number>();
      logs.forEach((l: any) => {
        const key = `${l.animation_id}__${l.context}`;
        countMap.set(key, (countMap.get(key) || 0) + 1);
      });
      setUsage(
        Array.from(countMap.entries()).map(([key, count]) => {
          const [animation_id, context] = key.split("__");
          return { animation_id, context, count };
        }).sort((a, b) => b.count - a.count)
      );
    }

    // Load active user counts per animation
    const { data: profileSwipe } = await supabase
      .from("profiles")
      .select("swipe_animation")
      .not("swipe_animation", "is", null);
    
    const { data: profileElo } = await supabase
      .from("profiles")
      .select("elocheck_animation")
      .not("elocheck_animation", "is", null);

    const userCounts = new Map<string, number>();
    profileSwipe?.forEach((p: any) => {
      const key = `${p.swipe_animation}__swipe`;
      userCounts.set(key, (userCounts.get(key) || 0) + 1);
    });
    profileElo?.forEach((p: any) => {
      const key = `${p.elocheck_animation}__elocheck`;
      userCounts.set(key, (userCounts.get(key) || 0) + 1);
    });
    setActiveUsers(
      Array.from(userCounts.entries()).map(([key, count]) => {
        const [animation, context] = key.split("__");
        return { animation, context, count };
      }).sort((a, b) => b.count - a.count)
    );

    setLoading(false);
  };

  const saveConfig = async (newConfig: AnimationConfig) => {
    setConfig(newConfig);
    await supabase
      .from("app_settings")
      .upsert({ key: "card_animations", value: newConfig as any });
    toast.success("Animation config saved");
  };

  const toggleEnabled = (id: string) => {
    const updated = { ...config };
    if (!updated[id]) updated[id] = { enabled: true, pro_only: false };
    updated[id] = { ...updated[id], enabled: !updated[id].enabled };
    saveConfig(updated);
  };

  const toggleProOnly = (id: string) => {
    const updated = { ...config };
    if (!updated[id]) updated[id] = { enabled: true, pro_only: false };
    updated[id] = { ...updated[id], pro_only: !updated[id].pro_only };
    saveConfig(updated);
  };

  const getUsageCount = (animId: string, ctx?: string) => {
    return usage
      .filter(u => u.animation_id === animId && (!ctx || u.context === ctx))
      .reduce((s, u) => s + u.count, 0);
  };

  const getActiveUserCount = (animId: string, ctx?: string) => {
    return activeUsers
      .filter(u => u.animation === animId && (!ctx || u.context === ctx))
      .reduce((s, u) => s + u.count, 0);
  };

  if (loading) return <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>;

  const totalUsage = usage.reduce((s, u) => s + u.count, 0);

  return (
    <div className="space-y-6">
      {/* Overview stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-xs text-muted-foreground">Total Plays</p>
          <p className="text-xl font-black text-primary">{totalUsage.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">last 30 days</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-xs text-muted-foreground">Animations</p>
          <p className="text-xl font-black text-foreground">{CARD_ANIMATIONS.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-xs text-muted-foreground">Enabled</p>
          <p className="text-xl font-black text-foreground">
            {CARD_ANIMATIONS.filter(a => config[a.id]?.enabled !== false).length}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-xs text-muted-foreground">Pro Only</p>
          <p className="text-xl font-black text-foreground">
            {CARD_ANIMATIONS.filter(a => config[a.id]?.pro_only).length}
          </p>
        </div>
      </div>

      {/* Animation cards */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-foreground">Manage Animations</h3>
        {CARD_ANIMATIONS.map(anim => {
          const cfg = config[anim.id] || { enabled: true, pro_only: anim.defaultProOnly };
          const swipeUsage = getUsageCount(anim.id, "swipe");
          const eloUsage = getUsageCount(anim.id, "elocheck");
          const swipeUsers = getActiveUserCount(anim.id, "swipe");
          const eloUsers = getActiveUserCount(anim.id, "elocheck");

          return (
            <div key={anim.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{anim.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-foreground text-sm">{anim.name}</h4>
                    {cfg.pro_only && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">PRO</Badge>}
                    {!cfg.enabled && <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-destructive">OFF</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{anim.description}</p>
                  
                  {/* Usage stats */}
                  <div className="flex gap-4 mt-2 text-[10px] text-muted-foreground">
                    <span>Swipe: <strong className="text-foreground">{swipeUsage}</strong> plays · <strong className="text-foreground">{swipeUsers}</strong> users</span>
                    <span>Aura Check: <strong className="text-foreground">{eloUsage}</strong> plays · <strong className="text-foreground">{eloUsers}</strong> users</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-end shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Enabled</span>
                    <Switch checked={cfg.enabled} onCheckedChange={() => toggleEnabled(anim.id)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Pro only</span>
                    <Switch checked={cfg.pro_only} onCheckedChange={() => toggleProOnly(anim.id)} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Top usage leaderboard */}
      {usage.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-foreground mb-2">Usage Leaderboard (30d)</h3>
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {usage.slice(0, 10).map((u, i) => {
              const anim = CARD_ANIMATIONS.find(a => a.id === u.animation_id);
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-sm font-bold text-muted-foreground w-6">#{i + 1}</span>
                  <span className="text-lg">{anim?.icon || "❓"}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-foreground">{anim?.name || u.animation_id}</span>
                    <Badge variant="outline" className="ml-2 text-[9px] px-1 py-0">{u.context}</Badge>
                  </div>
                  <span className="text-sm font-bold text-primary">{u.count.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
