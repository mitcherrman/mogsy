import { useEffect, useState } from "react";
import { Users, Layers, Swords, Trophy, MousePointerClick } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Stats {
  totalUsers: number;
  totalBots: number;
  totalLeagues: number;
  totalMatches: number;
  totalPresetItems: number;
  totalImageClicks: number;
}

export default function AdminStats() {
  const [stats, setStats] = useState<Stats>({ totalUsers: 0, totalBots: 0, totalLeagues: 0, totalMatches: 0, totalPresetItems: 0, totalImageClicks: 0 });

  useEffect(() => {
    Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_bot", false),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_bot", true),
      supabase.from("leagues").select("id", { count: "exact", head: true }),
      supabase.from("matches").select("id", { count: "exact", head: true }),
      supabase.from("preset_items").select("id", { count: "exact", head: true }),
      supabase.from("image_clicks").select("id", { count: "exact", head: true }),
    ]).then(([users, bots, leagues, matches, items, clicks]) => {
      setStats({
        totalUsers: users.count || 0,
        totalBots: bots.count || 0,
        totalLeagues: leagues.count || 0,
        totalMatches: matches.count || 0,
        totalPresetItems: items.count || 0,
        totalImageClicks: clicks.count || 0,
      });
    });
  }, []);

  const cards = [
    { label: "Users", value: stats.totalUsers, icon: Users, color: "text-primary" },
    { label: "Bots", value: stats.totalBots, icon: Users, color: "text-secondary" },
    { label: "Leagues", value: stats.totalLeagues, icon: Trophy, color: "text-accent-foreground" },
    { label: "Matches", value: stats.totalMatches, icon: Swords, color: "text-destructive" },
    { label: "Items", value: stats.totalPresetItems, icon: Layers, color: "text-primary" },
    { label: "Img Clicks", value: stats.totalImageClicks, icon: MousePointerClick, color: "text-accent-foreground" },
  ];

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 sm:gap-3">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg sm:rounded-xl border border-border bg-card p-1.5 sm:p-4 text-center">
          <c.icon className={`h-3 w-3 sm:h-5 sm:w-5 mx-auto mb-0.5 sm:mb-1 ${c.color}`} />
          <p className="text-sm sm:text-2xl font-extrabold text-foreground leading-tight">{c.value}</p>
          <p className="text-[9px] sm:text-xs text-muted-foreground leading-tight">{c.label}</p>
        </div>
      ))}
    </div>
  );
}