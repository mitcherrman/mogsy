import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Trophy, Megaphone, ChevronDown, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useLocation } from "react-router-dom";

interface LeagueOption {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  isPromoted: boolean;
  promotedBrandName: string | null;
  icon: string;
  category: string | null;
  displayOrder: number;
}

const CATEGORY_ICONS: Record<string, string> = {
  Anime: "🎌",
  Movies: "🎬",
  "Video Games": "🎮",
  Celebrities: "⭐",
};

export default function Play() {
  const navigate = useNavigate();
  const [userLeagues, setUserLeagues] = useState<LeagueOption[]>([]);
  const [presetLeagues, setPresetLeagues] = useState<LeagueOption[]>([]);
  const [loading, setLoading] = useState(true);
  const locationState = useLocation().state as { openCategory?: string } | null;
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => {
    if (locationState?.openCategory) return new Set([locationState.openCategory]);
    return new Set();
  });

  // Drag state
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const toggleCategory = (cat: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  useEffect(() => {
    loadLeagues();
  }, []);

  const loadLeagues = async () => {
    const { data: leagues } = await supabase
      .from("leagues")
      .select("id, name, description, type, is_promoted, promoted_brand_name, category, display_order")
      .order("display_order", { ascending: true });

    if (!leagues) { setLoading(false); return; }

    const presetIds = leagues.filter((l) => l.type === "preset").map((l) => l.id);
    const { data: profileCount } = await supabase.from("profiles").select("id").neq("display_name", "");
    const totalProfiles = profileCount?.length || 0;

    const itemCountMap = new Map<string, number>();
    if (presetIds.length > 0) {
      const { data: items } = await supabase.from("preset_items").select("league_id").in("league_id", presetIds);
      items?.forEach((item) => itemCountMap.set(item.league_id, (itemCountMap.get(item.league_id) || 0) + 1));
    }

    const getIcon = (name: string, category: string | null) => {
      if (category && CATEGORY_ICONS[category]) return CATEGORY_ICONS[category];
      if (name.includes("Global")) return "🌍";
      if (name.includes("Restaurant")) return "🍽️";
      if (name.includes("Fast Food")) return "🍔";
      if (name.includes("Car")) return "🏎️";
      return "📋";
    };

    const users: LeagueOption[] = [];
    const presets: LeagueOption[] = [];

    leagues.forEach((l) => {
      const cat = (l as any).category || null;
      const entry: LeagueOption = {
        id: l.id,
        name: l.name,
        description: l.description || "",
        memberCount: l.type === "preset" ? (itemCountMap.get(l.id) || 0) : totalProfiles,
        isPromoted: l.is_promoted || false,
        promotedBrandName: l.promoted_brand_name,
        icon: getIcon(l.name, cat),
        category: cat,
        displayOrder: (l as any).display_order || 0,
      };
      if (l.type === "user") users.push(entry);
      else presets.push(entry);
    });

    users.sort((a, b) => a.displayOrder - b.displayOrder);
    presets.sort((a, b) => (b.isPromoted ? 1 : 0) - (a.isPromoted ? 1 : 0));
    setUserLeagues(users);
    setPresetLeagues(presets);
    setLoading(false);
  };

  const handleDragStart = (id: string) => {
    setDraggedId(id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    setDragOverId(id);
  };

  const handleDrop = async (targetId: string, list: LeagueOption[], setList: React.Dispatch<React.SetStateAction<LeagueOption[]>>) => {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    const fromIdx = list.findIndex(l => l.id === draggedId);
    const toIdx = list.findIndex(l => l.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const reordered = [...list];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    setList(reordered);
    setDraggedId(null);
    setDragOverId(null);

    // Persist order
    const updates = reordered.map((l, i) =>
      supabase.from("leagues").update({ display_order: i } as any).eq("id", l.id)
    );
    await Promise.all(updates);
  };

  const UserLeagueCard = ({ league }: { league: LeagueOption }) => (
    <div
      draggable
      onDragStart={() => handleDragStart(league.id)}
      onDragOver={(e) => handleDragOver(e, league.id)}
      onDrop={() => handleDrop(league.id, userLeagues, setUserLeagues)}
      onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
      className={`transition-all duration-200 ${draggedId === league.id ? "opacity-40" : ""} ${dragOverId === league.id && draggedId !== league.id ? "ring-2 ring-primary rounded-2xl" : ""}`}
    >
      <Link
        to="/swipe"
        className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 transition-all duration-200 hover:border-primary/30 hover:shadow-[0_0_20px_hsl(210_80%_60%/0.12)] hover:-translate-y-0.5 cursor-grab active:cursor-grabbing"
      >
        <div className="h-14 w-14 rounded-full bg-secondary flex items-center justify-center text-2xl">
          {league.icon}
        </div>
        <div className="text-center min-w-0 w-full">
          <h3 className="font-bold text-foreground text-sm truncate">{league.name}</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {league.memberCount} players
          </p>
        </div>
        {league.isPromoted && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary uppercase tracking-wider">
            <Megaphone className="h-2.5 w-2.5" /> Promoted
          </span>
        )}
      </Link>
    </div>
  );

  const LeagueCard = ({ league, type }: { league: LeagueOption; type: "user" | "preset" }) => {
    const swipeLink = type === "user" ? "/swipe" : `/swipe/preset/${league.id}`;
    const linkState = type === "preset" ? { from: "/play", openCategory: league.category } : undefined;
    return (
      <Link
        to={swipeLink}
        state={linkState}
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
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {userLeagues.map((league, i) => (
                <motion.div key={league.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <UserLeagueCard league={league} />
                </motion.div>
              ))}
              {userLeagues.length === 0 && (
                <p className="text-center text-muted-foreground py-8 col-span-full">No user leagues available.</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="presets">
            <div className="space-y-3">
              {Array.from(categories.entries()).map(([cat, leagues]) => (
                <Collapsible key={cat} open={openCategories.has(cat)} onOpenChange={() => toggleCategory(cat)}>
                  <CollapsibleTrigger className="flex w-full items-center justify-between rounded-2xl border border-border bg-card p-4 hover:border-primary/30 transition-colors">
                    <span className="flex items-center gap-3">
                      <span className="text-2xl">{CATEGORY_ICONS[cat] || "📂"}</span>
                      <span className="font-bold text-foreground text-lg">{cat}</span>
                      <span className="text-xs text-muted-foreground">{leagues.length} leagues</span>
                    </span>
                    <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${openCategories.has(cat) ? "rotate-180" : ""}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-2 mt-2 ml-2">
                      {leagues.map((league, i) => (
                        <motion.div key={league.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                          <LeagueCard league={league} type="preset" />
                        </motion.div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
              {uncategorized.length > 0 && (
                <Collapsible open={openCategories.has("__other")} onOpenChange={() => toggleCategory("__other")}>
                  <CollapsibleTrigger className="flex w-full items-center justify-between rounded-2xl border border-border bg-card p-4 hover:border-primary/30 transition-colors">
                    <span className="flex items-center gap-3">
                      <span className="text-2xl">📋</span>
                      <span className="font-bold text-foreground text-lg">Other</span>
                      <span className="text-xs text-muted-foreground">{uncategorized.length} leagues</span>
                    </span>
                    <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${openCategories.has("__other") ? "rotate-180" : ""}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-2 mt-2 ml-2">
                      {uncategorized.map((league, i) => (
                        <motion.div key={league.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                          <LeagueCard league={league} type="preset" />
                        </motion.div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
              {presetLeagues.length === 0 && (
                <p className="text-center text-muted-foreground py-8">No preset leagues available.</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
