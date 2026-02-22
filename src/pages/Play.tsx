import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion, Reorder, useDragControls } from "framer-motion";
import { ArrowLeft, Megaphone, ChevronDown, GripVertical } from "lucide-react";
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
  displayOrder: number;
}

interface CategoryItem {
  key: string;
  icon: string;
  name: string;
  count: number;
  leagues: LeagueOption[];
}

const CATEGORY_ICONS: Record<string, string> = {
  Anime: "🎌",
  Movies: "🎬",
  "Video Games": "🎮",
  Celebrities: "⭐",
};

/* ─── Reorder-aware card wrapper ─── */
function DraggableLeagueCard({ league, type }: { league: LeagueOption; type: "user" | "preset" }) {
  const controls = useDragControls();
  const swipeLink = type === "user" ? "/swipe" : `/swipe/preset/${league.id}`;
  const linkState = type === "preset" ? { from: "/play", openCategory: league.category } : undefined;

  return (
    <Reorder.Item
      value={league}
      dragListener={false}
      dragControls={controls}
      className="touch-none"
      whileDrag={{ scale: 1.05, zIndex: 50, boxShadow: "0 8px 30px rgba(0,0,0,0.25)" }}
    >
      <div className="relative">
        {/* Drag handle – sits on top-right corner */}
        <button
          onPointerDown={(e) => controls.start(e)}
          className="absolute -top-1 -right-1 z-10 h-6 w-6 rounded-full bg-muted/80 backdrop-blur flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="h-3 w-3 text-muted-foreground" />
        </button>
        <Link
          to={swipeLink}
          state={linkState}
          className={`flex flex-col items-center gap-2 rounded-2xl border bg-card p-4 transition-all duration-200 hover:border-primary/30 hover:shadow-[0_0_20px_hsl(210_80%_60%/0.12)] h-full ${
            league.isPromoted ? "border-primary/40" : "border-border"
          }`}
        >
          <div className="h-14 w-14 rounded-full bg-secondary flex items-center justify-center text-2xl flex-shrink-0">
            {league.icon}
          </div>
          <div className="text-center min-w-0 w-full">
            <h3 className="font-bold text-foreground text-sm truncate">{league.name}</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {league.memberCount} {type === "preset" ? "items" : "players"}
            </p>
          </div>
          {league.isPromoted && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary uppercase tracking-wider">
              <Megaphone className="h-2.5 w-2.5" /> Promoted
            </span>
          )}
        </Link>
      </div>
    </Reorder.Item>
  );
}

/* ─── Draggable category square card ─── */
function DraggableCategoryCard({
  cat,
  isOpen,
  onToggle,
}: {
  cat: CategoryItem;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={cat}
      dragListener={false}
      dragControls={controls}
      className="touch-none"
      whileDrag={{ scale: 1.05, zIndex: 50, boxShadow: "0 8px 30px rgba(0,0,0,0.25)" }}
    >
      <div className="relative">
        <button
          onPointerDown={(e) => controls.start(e)}
          className="absolute -top-1 -right-1 z-10 h-6 w-6 rounded-full bg-muted/80 backdrop-blur flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="h-3 w-3 text-muted-foreground" />
        </button>
        <button
          onClick={onToggle}
          className={`flex flex-col items-center gap-2 rounded-2xl border bg-card p-4 transition-all duration-200 hover:border-primary/30 hover:shadow-[0_0_20px_hsl(210_80%_60%/0.12)] w-full h-full ${
            isOpen ? "border-primary/40 ring-1 ring-primary/20" : "border-border"
          }`}
        >
          <div className="h-14 w-14 rounded-full bg-secondary flex items-center justify-center text-2xl flex-shrink-0">
            {cat.icon}
          </div>
          <div className="text-center min-w-0 w-full">
            <h3 className="font-bold text-foreground text-sm truncate">{cat.name}</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {cat.count} leagues
            </p>
          </div>
        </button>
      </div>
    </Reorder.Item>
  );
}

export default function Play() {
  const navigate = useNavigate();
  const [userLeagues, setUserLeagues] = useState<LeagueOption[]>([]);
  const [presetLeagues, setPresetLeagues] = useState<LeagueOption[]>([]);
  const [categoryItems, setCategoryItems] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const locationState = useLocation().state as { openCategory?: string } | null;
  const [expandedCategory, setExpandedCategory] = useState<string | null>(
    locationState?.openCategory || null
  );

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
    presets.sort((a, b) => a.displayOrder - b.displayOrder);
    setUserLeagues(users);
    setPresetLeagues(presets);

    // Build category items
    const catMap = new Map<string, LeagueOption[]>();
    const uncat: LeagueOption[] = [];
    presets.forEach((l) => {
      if (l.category) {
        if (!catMap.has(l.category)) catMap.set(l.category, []);
        catMap.get(l.category)!.push(l);
      } else {
        uncat.push(l);
      }
    });

    const cats: CategoryItem[] = [];
    catMap.forEach((leagues, key) => {
      cats.push({ key, icon: CATEGORY_ICONS[key] || "📂", name: key, count: leagues.length, leagues });
    });
    if (uncat.length > 0) {
      cats.push({ key: "__other", icon: "📋", name: "Other", count: uncat.length, leagues: uncat });
    }
    setCategoryItems(cats);
    setLoading(false);
  };

  const persistLeagueOrder = useCallback(async (reordered: LeagueOption[]) => {
    const updates = reordered.map((l, i) =>
      supabase.from("leagues").update({ display_order: i } as any).eq("id", l.id)
    );
    await Promise.all(updates);
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const expandedCat = categoryItems.find(c => c.key === expandedCategory);

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="container mx-auto max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-extrabold text-foreground">Play</h1>
        </div>

        <p className="text-xs text-muted-foreground mb-4">Drag the ⠿ handle to reorder</p>

        <Tabs defaultValue="users" className="w-full">
          <TabsList className="w-full mb-6">
            <TabsTrigger value="users" className="flex-1">User Leagues</TabsTrigger>
            <TabsTrigger value="presets" className="flex-1">Preset Leagues</TabsTrigger>
          </TabsList>

          {/* ─── User Leagues ─── */}
          <TabsContent value="users">
            {userLeagues.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No user leagues available.</p>
            ) : (
              <Reorder.Group
                axis="y"
                values={userLeagues}
                onReorder={(newOrder) => {
                  setUserLeagues(newOrder);
                  persistLeagueOrder(newOrder);
                }}
                className="grid grid-cols-3 sm:grid-cols-4 gap-3 list-none p-0 m-0"
                as="div"
              >
                {userLeagues.map((league) => (
                  <DraggableLeagueCard key={league.id} league={league} type="user" />
                ))}
              </Reorder.Group>
            )}
          </TabsContent>

          {/* ─── Preset Leagues ─── */}
          <TabsContent value="presets">
            <div className="space-y-4">
              {/* Category grid */}
              <Reorder.Group
                axis="y"
                values={categoryItems}
                onReorder={setCategoryItems}
                className="grid grid-cols-3 sm:grid-cols-4 gap-3 list-none p-0 m-0"
                as="div"
              >
                {categoryItems.map((cat) => (
                  <DraggableCategoryCard
                    key={cat.key}
                    cat={cat}
                    isOpen={expandedCategory === cat.key}
                    onToggle={() =>
                      setExpandedCategory((prev) => (prev === cat.key ? null : cat.key))
                    }
                  />
                ))}
              </Reorder.Group>

              {/* Expanded category sub-leagues */}
              {expandedCat && (
                <motion.div
                  key={expandedCat.key}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-2xl border border-primary/20 bg-card/50 p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xl">{expandedCat.icon}</span>
                    <h3 className="font-bold text-foreground">{expandedCat.name}</h3>
                    <span className="text-xs text-muted-foreground">({expandedCat.count} leagues)</span>
                  </div>
                  <Reorder.Group
                    axis="y"
                    values={expandedCat.leagues}
                    onReorder={(newOrder) => {
                      // Update the category's leagues
                      setCategoryItems((prev) =>
                        prev.map((c) =>
                          c.key === expandedCat.key ? { ...c, leagues: newOrder } : c
                        )
                      );
                      persistLeagueOrder(newOrder);
                    }}
                    className="grid grid-cols-3 sm:grid-cols-4 gap-3 list-none p-0 m-0"
                    as="div"
                  >
                    {expandedCat.leagues.map((league) => (
                      <DraggableLeagueCard key={league.id} league={league} type="preset" />
                    ))}
                  </Reorder.Group>
                </motion.div>
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
