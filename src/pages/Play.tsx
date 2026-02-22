import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion, Reorder, useDragControls } from "framer-motion";
import { ArrowLeft, Megaphone, GripVertical, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { getTierFromElo, getTierColor } from "@/lib/mock-data";
import TierBadge from "@/components/TierBadge";
import UserAvatar from "@/components/UserAvatar";

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

interface LeaderboardEntry {
  id: string;
  displayName: string;
  avatarUrl: string;
  elo: number;
  tier: "bronze" | "silver" | "gold" | "platinum";
  imageUrl?: string;
  isPresetItem?: boolean;
}

const CATEGORY_ICONS: Record<string, string> = {
  Anime: "🎌",
  Movies: "🎬",
  "Video Games": "🎮",
  Celebrities: "⭐",
};

/* ─── League card ─── */
function LeagueCard({
  league,
  type,
  reorderMode,
  controls,
}: {
  league: LeagueOption;
  type: "user" | "preset";
  reorderMode: boolean;
  controls?: ReturnType<typeof useDragControls>;
}) {
  const swipeLink = type === "user" ? "/swipe" : `/swipe/preset/${league.id}`;
  const linkState = type === "preset" ? { from: "/play", openCategory: league.category } : undefined;

  return (
    <div className="relative">
      {reorderMode && controls && (
        <button
          onPointerDown={(e) => controls.start(e)}
          className="absolute -top-1 -right-1 z-10 h-6 w-6 rounded-full bg-muted/80 backdrop-blur flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
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
  );
}

/* ─── Reorder wrapper ─── */
function DraggableLeagueCard({ league, type, reorderMode }: { league: LeagueOption; type: "user" | "preset"; reorderMode: boolean }) {
  const controls = useDragControls();

  if (!reorderMode) {
    return <LeagueCard league={league} type={type} reorderMode={false} />;
  }

  return (
    <Reorder.Item
      value={league}
      dragListener={false}
      dragControls={controls}
      className="touch-none"
      whileDrag={{ scale: 1.05, zIndex: 50, boxShadow: "0 8px 30px rgba(0,0,0,0.25)" }}
    >
      <LeagueCard league={league} type={type} reorderMode controls={controls} />
    </Reorder.Item>
  );
}

/* ─── Category card ─── */
function DraggableCategoryCard({
  cat,
  isOpen,
  onToggle,
  reorderMode,
}: {
  cat: CategoryItem;
  isOpen: boolean;
  onToggle: () => void;
  reorderMode: boolean;
}) {
  const controls = useDragControls();

  const inner = (
    <div className="relative">
      {reorderMode && (
        <button
          onPointerDown={(e) => controls.start(e)}
          className="absolute -top-1 -right-1 z-10 h-6 w-6 rounded-full bg-muted/80 backdrop-blur flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
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
          <p className="text-[10px] text-muted-foreground mt-0.5">{cat.count} leagues</p>
        </div>
      </button>
    </div>
  );

  if (!reorderMode) return inner;

  return (
    <Reorder.Item
      value={cat}
      dragListener={false}
      dragControls={controls}
      className="touch-none"
      whileDrag={{ scale: 1.05, zIndex: 50, boxShadow: "0 8px 30px rgba(0,0,0,0.25)" }}
    >
      {inner}
    </Reorder.Item>
  );
}

/* ─── Mini leaderboard preview ─── */
function LeaderboardPreview({ leagueId, leagueName, leagueType }: { leagueId: string; leagueName: string; leagueType: "user" | "preset" }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTop5();
  }, [leagueId]);

  const loadTop5 = async () => {
    if (leagueType === "preset") {
      const { data: items } = await supabase
        .from("preset_items")
        .select("id, name, image_url, elo")
        .eq("league_id", leagueId)
        .order("elo", { ascending: false })
        .limit(5);
      if (items) {
        setEntries(items.map((item) => ({
          id: item.id,
          displayName: item.name,
          avatarUrl: "",
          imageUrl: item.image_url || "",
          elo: item.elo,
          tier: getTierFromElo(item.elo),
          isPresetItem: true,
        })));
      }
    } else {
      const { data: memberships } = await supabase
        .from("league_memberships")
        .select("profile_id, elo")
        .eq("league_id", leagueId)
        .order("elo", { ascending: false })
        .limit(5);

      if (memberships && memberships.length > 0) {
        const profileIds = memberships.map((m) => m.profile_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", profileIds);
        const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);
        setEntries(memberships.map((m) => {
          const p = profileMap.get(m.profile_id);
          return {
            id: m.profile_id,
            displayName: p?.display_name || "Unknown",
            avatarUrl: p?.avatar_url || "",
            elo: m.elo,
            tier: getTierFromElo(m.elo),
          };
        }));
      }
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card/50 p-3">
        <div className="flex items-center gap-2 mb-2">
          <Trophy className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-bold text-foreground truncate">{leagueName}</span>
        </div>
        <div className="flex justify-center py-2">
          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card/50 p-3">
        <div className="flex items-center gap-2 mb-2">
          <Trophy className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-bold text-foreground truncate">{leagueName}</span>
        </div>
        <p className="text-[10px] text-muted-foreground text-center py-1">No rankings yet</p>
      </div>
    );
  }

  return (
    <Link to={`/leaderboard/${leagueId}`} className="block rounded-xl border border-border bg-card/50 p-3 hover:border-primary/30 transition-all">
      <div className="flex items-center gap-2 mb-2">
        <Trophy className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-bold text-foreground truncate">{leagueName}</span>
      </div>
      <div className="space-y-1.5">
        {entries.map((entry, i) => {
          const rank = i + 1;
          const isTop3 = rank <= 3;
          return (
            <div key={entry.id} className={`flex items-center gap-2 ${isTop3 ? "" : "opacity-70"}`}>
              <span className={`w-4 text-right text-[10px] font-black ${isTop3 ? "text-tier-gold" : "text-muted-foreground"}`}>
                {rank}
              </span>
              {entry.isPresetItem ? (
                <div className={`${isTop3 ? "h-7 w-7" : "h-5 w-5"} rounded-full overflow-hidden flex-shrink-0 bg-muted`}>
                  {entry.imageUrl ? (
                    <img src={entry.imageUrl} alt={entry.displayName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[8px] font-bold text-muted-foreground">
                      {entry.displayName.charAt(0)}
                    </div>
                  )}
                </div>
              ) : (
                <UserAvatar src={entry.avatarUrl} name={entry.displayName} size={isTop3 ? "sm" : "xs"} />
              )}
              <span className={`truncate ${isTop3 ? "text-xs font-bold text-foreground" : "text-[10px] text-muted-foreground"}`}>
                {entry.displayName}
              </span>
              <span className={`ml-auto text-[10px] font-bold ${getTierColor(entry.tier)}`}>
                {entry.elo}
              </span>
            </div>
          );
        })}
      </div>
    </Link>
  );
}

/* ─── Main Play page ─── */
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
  const [reorderMode, setReorderMode] = useState(false);
  const [showLeaderboards, setShowLeaderboards] = useState(false);

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

  const expandedCat = categoryItems.find((c) => c.key === expandedCategory);

  const renderGrid = (leagues: LeagueOption[], type: "user" | "preset", onReorder: (v: LeagueOption[]) => void) => {
    if (reorderMode) {
      return (
        <Reorder.Group
          axis="y"
          values={leagues}
          onReorder={onReorder}
          className="grid grid-cols-3 sm:grid-cols-4 gap-3 list-none p-0 m-0"
          as="div"
        >
          {leagues.map((league) => (
            <DraggableLeagueCard key={league.id} league={league} type={type} reorderMode />
          ))}
        </Reorder.Group>
      );
    }
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {leagues.map((league) => (
          <LeagueCard key={league.id} league={league} type={type} reorderMode={false} />
        ))}
      </div>
    );
  };

  const renderCategoryGrid = () => {
    if (reorderMode) {
      return (
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
              onToggle={() => setExpandedCategory((prev) => (prev === cat.key ? null : cat.key))}
              reorderMode
            />
          ))}
        </Reorder.Group>
      );
    }
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {categoryItems.map((cat) => (
          <DraggableCategoryCard
            key={cat.key}
            cat={cat}
            isOpen={expandedCategory === cat.key}
            onToggle={() => setExpandedCategory((prev) => (prev === cat.key ? null : cat.key))}
            reorderMode={false}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="container mx-auto max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-extrabold text-foreground">Play</h1>
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Switch checked={reorderMode} onCheckedChange={setReorderMode} />
            <span className="text-xs text-muted-foreground">Reorder</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={showLeaderboards} onCheckedChange={setShowLeaderboards} />
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Trophy className="h-3 w-3" /> Leaderboards
            </span>
          </div>
        </div>

        <Tabs defaultValue="users" className="w-full">
          <TabsList className="w-full mb-6">
            <TabsTrigger value="users" className="flex-1">User Leagues</TabsTrigger>
            <TabsTrigger value="presets" className="flex-1">Preset Leagues</TabsTrigger>
          </TabsList>

          {/* ─── User Leagues ─── */}
          <TabsContent value="users">
            {userLeagues.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No user leagues available.</p>
            ) : showLeaderboards ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {userLeagues.map((league) => (
                  <LeaderboardPreview key={league.id} leagueId={league.id} leagueName={league.name} leagueType="user" />
                ))}
              </div>
            ) : (
              renderGrid(userLeagues, "user", (newOrder) => {
                setUserLeagues(newOrder);
                persistLeagueOrder(newOrder);
              })
            )}
          </TabsContent>

          {/* ─── Preset Leagues ─── */}
          <TabsContent value="presets">
            <div className="space-y-4">
              {showLeaderboards ? (
                <>
                  {categoryItems.map((cat) => (
                    <div key={cat.key}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{cat.icon}</span>
                        <h3 className="font-bold text-foreground text-sm">{cat.name}</h3>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        {cat.leagues.map((league) => (
                          <LeaderboardPreview key={league.id} leagueId={league.id} leagueName={league.name} leagueType="preset" />
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  {renderCategoryGrid()}

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
                      {renderGrid(expandedCat.leagues, "preset", (newOrder) => {
                        setCategoryItems((prev) =>
                          prev.map((c) =>
                            c.key === expandedCat.key ? { ...c, leagues: newOrder } : c
                          )
                        );
                        persistLeagueOrder(newOrder);
                      })}
                    </motion.div>
                  )}

                  {presetLeagues.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">No preset leagues available.</p>
                  )}
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
