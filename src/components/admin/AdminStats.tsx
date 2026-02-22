import { useEffect, useState } from "react";
import { Users, Layers, Swords, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Stats {
  totalUsers: number;
  totalBots: number;
  totalLeagues: number;
  totalMatches: number;
  totalPresetItems: number;
}

export default function AdminStats() {
  const [stats, setStats] = useState<Stats>({ totalUsers: 0, totalBots: 0, totalLeagues: 0, totalMatches: 0, totalPresetItems: 0 });

  useEffect(() => {
    Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_bot", false),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_bot", true),
      supabase.from("leagues").select("id", { count: "exact", head: true }),
      supabase.from("matches").select("id", { count: "exact", head: true }),
      supabase.from("preset_items").select("id", { count: "exact", head: true }),
    ]).then(([users, bots, leagues, matches, items]) => {
      setStats({
        totalUsers: users.count || 0,
        totalBots: bots.count || 0,
        totalLeagues: leagues.count || 0,
        totalMatches: matches.count || 0,
        totalPresetItems: items.count || 0,
      });
    });
  }, []);

  const cards = [
    { label: "Users", value: stats.totalUsers, icon: Users, color: "text-primary" },
    { label: "Bots", value: stats.totalBots, icon: Users, color: "text-secondary" },
    { label: "Leagues", value: stats.totalLeagues, icon: Trophy, color: "text-accent-foreground" },
    { label: "Matches", value: stats.totalMatches, icon: Swords, color: "text-destructive" },
    { label: "Preset Items", value: stats.totalPresetItems, icon: Layers, color: "text-primary" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-border bg-card p-4 text-center">
          <c.icon className={`h-5 w-5 mx-auto mb-1 ${c.color}`} />
          <p className="text-2xl font-extrabold text-foreground">{c.value}</p>
          <p className="text-xs text-muted-foreground">{c.label}</p>
        </div>
      ))}
    </div>
  );
}
