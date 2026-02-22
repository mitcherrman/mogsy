import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Megaphone, ChevronDown } from "lucide-react";
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

function DraggableGrid({
  items,
  onReorder,
  renderCard,
}: {
  items: LeagueOption[];
  onReorder: (reordered: LeagueOption[]) => void;
  renderCard: (league: LeagueOption) => React.ReactNode;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const getDisplayOrder = () => {
    if (dragIdx === null || overIdx === null || dragIdx === overIdx) return items;
    const reordered = [...items];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(overIdx, 0, moved);
    return reordered;
  };

  const handlePointerDown = (idx: number, e: React.PointerEvent) => {
    const target = e.currentTarget as HTMLElement;
    longPressTimer.current = setTimeout(() => {
      isDragging.current = true;
      setDragIdx(idx);
      setOverIdx(idx);
      target.setPointerCapture(e.pointerId);
      // Prevent scroll while dragging
      document.body.style.overflow = "hidden";
    }, 300);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    e.preventDefault();
    // Find which grid cell we're over
    const container = containerRef.current;
    const cards = Array.from(container.children) as HTMLElement[];
    const point = { x: e.clientX, y: e.clientY };
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      if (point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom) {
        setOverIdx(i);
        break;
      }
    }
  };

  const handlePointerUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    document.body.style.overflow = "";
    if (isDragging.current && dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
      const reordered = [...items];
      const [moved] = reordered.splice(dragIdx, 1);
      reordered.splice(overIdx, 0, moved);
      onReorder(reordered);
    }
    isDragging.current = false;
    setDragIdx(null);
    setOverIdx(null);
  };

  const handlePointerCancel = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    document.body.style.overflow = "";
    isDragging.current = false;
    setDragIdx(null);
    setOverIdx(null);
  };

  const displayed = getDisplayOrder();

  return (
    <div
      ref={containerRef}
      className="grid grid-cols-3 sm:grid-cols-4 gap-3"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {displayed.map((league, i) => {
        const originalIdx = items.findIndex(l => l.id === league.id);
        const isBeingDragged = dragIdx !== null && items[dragIdx]?.id === league.id;
        return (
          <motion.div
            key={league.id}
            layout
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: isBeingDragged ? 0.5 : 1, y: 0, scale: isBeingDragged ? 1.05 : 1 }}
            transition={{ duration: 0.2 }}
            onPointerDown={(e) => handlePointerDown(originalIdx, e)}
            className={`touch-none select-none ${isBeingDragged ? "z-10" : ""}`}
          >
            {renderCard(league)}
          </motion.div>
        );
      })}
    </div>
  );
}

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
    presets.sort((a, b) => a.displayOrder - b.displayOrder);
    setUserLeagues(users);
    setPresetLeagues(presets);
    setLoading(false);
  };

  const persistOrder = useCallback(async (reordered: LeagueOption[]) => {
    const updates = reordered.map((l, i) =>
      supabase.from("leagues").update({ display_order: i } as any).eq("id", l.id)
    );
    await Promise.all(updates);
  }, []);

  const handleUserReorder = useCallback((reordered: LeagueOption[]) => {
    setUserLeagues(reordered);
    persistOrder(reordered);
  }, [persistOrder]);

  const handlePresetReorder = useCallback((reordered: LeagueOption[]) => {
    setPresetLeagues(reordered);
    persistOrder(reordered);
  }, [persistOrder]);

  const renderLeagueCard = useCallback((league: LeagueOption, type: "user" | "preset") => {
    const swipeLink = type === "user" ? "/swipe" : `/swipe/preset/${league.id}`;
    const linkState = type === "preset" ? { from: "/play", openCategory: league.category } : undefined;
    return (
      <Link
        to={swipeLink}
        state={linkState}
        className={`flex flex-col items-center gap-2 rounded-2xl border bg-card p-4 transition-all duration-200 hover:border-primary/30 hover:shadow-[0_0_20px_hsl(210_80%_60%/0.12)] hover:-translate-y-0.5 h-full ${
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
    );
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Group presets by category
  const categoryMap = new Map<string, LeagueOption[]>();
  const uncategorized: LeagueOption[] = [];
  presetLeagues.forEach((l) => {
    if (l.category) {
      if (!categoryMap.has(l.category)) categoryMap.set(l.category, []);
      categoryMap.get(l.category)!.push(l);
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

        <p className="text-xs text-muted-foreground mb-4">Long-press and drag to reorder</p>

        <Tabs defaultValue="users" className="w-full">
          <TabsList className="w-full mb-6">
            <TabsTrigger value="users" className="flex-1">User Leagues</TabsTrigger>
            <TabsTrigger value="presets" className="flex-1">Preset Leagues</TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            {userLeagues.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No user leagues available.</p>
            ) : (
              <DraggableGrid
                items={userLeagues}
                onReorder={handleUserReorder}
                renderCard={(league) => renderLeagueCard(league, "user")}
              />
            )}
          </TabsContent>

          <TabsContent value="presets">
            <div className="space-y-3">
              {Array.from(categoryMap.entries()).map(([cat, leagues]) => (
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
                    <div className="mt-2 ml-1">
                      <DraggableGrid
                        items={leagues}
                        onReorder={(reordered) => {
                          // Update within the full presetLeagues list
                          const newPresets = presetLeagues.map(p => {
                            const idx = reordered.findIndex(r => r.id === p.id);
                            if (idx !== -1) return { ...p, displayOrder: idx };
                            return p;
                          });
                          newPresets.sort((a, b) => a.displayOrder - b.displayOrder);
                          setPresetLeagues(newPresets);
                          persistOrder(reordered);
                        }}
                        renderCard={(league) => renderLeagueCard(league, "preset")}
                      />
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
                    <div className="mt-2 ml-1">
                      <DraggableGrid
                        items={uncategorized}
                        onReorder={(reordered) => {
                          const newPresets = presetLeagues.map(p => {
                            const idx = reordered.findIndex(r => r.id === p.id);
                            if (idx !== -1) return { ...p, displayOrder: idx };
                            return p;
                          });
                          newPresets.sort((a, b) => a.displayOrder - b.displayOrder);
                          setPresetLeagues(newPresets);
                          persistOrder(reordered);
                        }}
                        renderCard={(league) => renderLeagueCard(league, "preset")}
                      />
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
