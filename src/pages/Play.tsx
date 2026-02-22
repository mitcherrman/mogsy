import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Trophy, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

interface LeagueOption {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  isPromoted: boolean;
  promotedBrandName: string | null;
  icon: string;
  category: string | null;
}

export default function Play() {
  const navigate = useNavigate();
  const [userLeagues, setUserLeagues] = useState<LeagueOption[]>([]);
  const [presetLeagues, setPresetLeagues] = useState<LeagueOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeagues();
  }, []);

  const loadLeagues = async () => {
    const { data: leagues } = await supabase
      .from("leagues")
      .select("id, name, description, type, is_promoted, promoted_brand_name, category")
      .order("created_at", { ascending: true });

    if (!leagues) { setLoading(false); return; }

    const presetIds = leagues.filter((l) => l.type === "preset").map((l) => l.id);
    const { data: profileCount } = await supabase.from("profiles").select("id").neq("display_name", "");
    const totalProfiles = profileCount?.length || 0;

    const itemCountMap = new Map<string, number>();
    if (presetIds.length > 0) {
      const { data: items } = await supabase.from("preset_items").select("league_id").in("league_id", presetIds);
      items?.forEach((item) => itemCountMap.set(item.league_id, (itemCountMap.get(item.league_id) || 0) + 1));
    }

    const getIcon = (name: string) => {
      if (name.includes("Global")) return "🌍";
      if (name.includes("North")) return "🇺🇸";
      if (name.includes("Europe")) return "🇪🇺";
      if (name.includes("Asia")) return "🌏";
      if (name.includes("Restaurant")) return "🍽️";
      if (name.includes("Fast Food")) return "🍔";
      if (name.includes("2025")) return "🎬";
      if (name.includes("All Time")) return "🏆";
      if (name.includes("Celebrity")) return "⭐";
      if (name.includes("Car")) return "🏎️";
      if (name.includes("Anime")) return "🎌";
      return "📋";
    };

    const users: LeagueOption[] = [];
    const presets: LeagueOption[] = [];

    leagues.forEach((l) => {
      const entry: LeagueOption = {
        id: l.id,
        name: l.name,
        description: l.description || "",
        memberCount: l.type === "preset" ? (itemCountMap.get(l.id) || 0) : totalProfiles,
        isPromoted: l.is_promoted || false,
        promotedBrandName: l.promoted_brand_name,
        icon: getIcon(l.name),
        category: (l as any).category || null,
      };
      if (l.type === "user") users.push(entry);
      else presets.push(entry);
    });

    // Sort promoted first
    presets.sort((a, b) => (b.isPromoted ? 1 : 0) - (a.isPromoted ? 1 : 0));
    setUserLeagues(users);
    setPresetLeagues(presets);
    setLoading(false);
  };

  const LeagueCard = ({ league, type }: { league: LeagueOption; type: "user" | "preset" }) => {
    const swipeLink = type === "user" ? "/swipe" : `/swipe/preset/${league.id}`;
    return (
      <Link
        to={swipeLink}
        className={`flex items-center gap-4 rounded-2xl border bg-card p-5 transition-all duration-200 hover:border-primary/30 hover:shadow-[0_0_20px_hsl(210_80%_60%/0.12)] hover:-translate-y-0.5 ${
          league.isPromoted ? "border-primary/40" : "border-border"
        }`}
      >
        <span className="text-3xl flex-shrink-0">{league.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-foreground truncate">{league.name}</h3>
            {league.isPromoted && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary uppercase tracking-wider flex-shrink-0">
                <Megaphone className="h-3 w-3" /> Promoted
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {league.memberCount} {type === "preset" ? "items" : "players"} · Swipe now
          </p>
        </div>
        <Trophy className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      </Link>
    );
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="container mx-auto max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-extrabold text-foreground">Play</h1>
        </div>

        <Tabs defaultValue="users" className="w-full">
          <TabsList className="w-full mb-6">
            <TabsTrigger value="users" className="flex-1">User Leagues</TabsTrigger>
            <TabsTrigger value="presets" className="flex-1">Preset Leagues</TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <div className="space-y-3">
              {userLeagues.map((league, i) => (
                <motion.div key={league.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <LeagueCard league={league} type="user" />
                </motion.div>
              ))}
              {userLeagues.length === 0 && (
                <p className="text-center text-muted-foreground py-8">No user leagues available.</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="presets">
            {(() => {
              const categories = new Map<string, LeagueOption[]>();
              const uncategorized: LeagueOption[] = [];
              presetLeagues.forEach((l) => {
                if (l.category) {
                  if (!categories.has(l.category)) categories.set(l.category, []);
                  categories.get(l.category)!.push(l);
                } else {
                  uncategorized.push(l);
                }
              });
              return (
                <div className="space-y-6">
                  {Array.from(categories.entries()).map(([cat, leagues]) => (
                    <div key={cat}>
                      <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
                        {cat === "Anime" ? "🎌" : "📂"} {cat}
                      </h2>
                      <div className="space-y-3">
                        {leagues.map((league, i) => (
                          <motion.div key={league.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                            <LeagueCard league={league} type="preset" />
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {uncategorized.length > 0 && (
                    <div>
                      {categories.size > 0 && <h2 className="text-lg font-bold text-foreground mb-3">📋 Other</h2>}
                      <div className="space-y-3">
                        {uncategorized.map((league, i) => (
                          <motion.div key={league.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                            <LeagueCard league={league} type="preset" />
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}
                  {presetLeagues.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">No preset leagues available.</p>
                  )}
                </div>
              );
            })()}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
