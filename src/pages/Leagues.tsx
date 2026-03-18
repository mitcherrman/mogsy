import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Users, Layers, ArrowLeft, Crown, Search, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import type { PlayLayoutConfig } from "@/hooks/usePlayLayout";
import UserAvatar from "@/components/UserAvatar";
import TierBadge from "@/components/TierBadge";
import { getTierFromElo, getTierColor } from "@/lib/mock-data";
import { useIsMobile } from "@/hooks/use-mobile";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface LeagueWithTop5 {
  id: string;
  name: string;
  type: string;
  top5: {
    id: string;
    name: string;
    imageUrl: string;
    elo: number;
    tier: string;
  }[];
}

export default function Leagues() {
  const navigate = useNavigate();
  const { type: leagueType } = useParams<{ type: string }>();
  const [leagues, setLeagues] = useState<LeagueWithTop5[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const isMobile = useIsMobile();
  const isCompete = leagueType === "compete";

  useEffect(() => {
    loadLeagues();
  }, []);

  const loadLeagues = async () => {
    const filterType = isCompete ? "user" : "preset";

    const { data: layoutData } = await supabase
      .from("play_layout_config")
      .select("config")
      .eq("id", "published")
      .single();

    const layoutConfig = layoutData?.config as unknown as PlayLayoutConfig | null;

    const hiddenLeagueIds = new Set<string>();
    const hiddenCategoryKeys = new Set<string>();

    if (layoutConfig) {
      layoutConfig.leagues?.forEach(l => { if (l.hidden) hiddenLeagueIds.add(l.id); });
      layoutConfig.categories?.forEach(c => { if (c.hidden) hiddenCategoryKeys.add(c.key); });
    }

    const { data: allLeagues } = await supabase
      .from("leagues")
      .select("id, name, type, category")
      .eq("type", filterType)
      .order("created_at", { ascending: true });

    if (!allLeagues) { setLoading(false); return; }

    const visibleLeagues = allLeagues.filter(league => {
      if (hiddenLeagueIds.has(league.id)) return false;
      if (league.category && hiddenCategoryKeys.has(league.category)) return false;
      return true;
    });

    const promises = visibleLeagues.map(async (league) => {
      let top5: LeagueWithTop5["top5"] = [];

      if (league.type === "preset") {
        const { data: snapshots } = await supabase
          .from("global_elo_snapshots")
          .select("item_id, elo")
          .eq("league_id", league.id)
          .not("item_id", "is", null)
          .order("elo", { ascending: false })
          .limit(50);

        let eloMap = new Map<string, number>();
        if (snapshots) {
          for (const s of snapshots) {
            if (s.item_id && !eloMap.has(s.item_id)) {
              eloMap.set(s.item_id, s.elo);
            }
          }
        }

        const { data: items } = await supabase
          .from("preset_items")
          .select("id, name, image_url, elo")
          .eq("league_id", league.id)
          .order("elo", { ascending: false })
          .limit(5);

        if (items) {
          top5 = items.map((item) => {
            const elo = eloMap.get(item.id) ?? item.elo;
            return { id: item.id, name: item.name, imageUrl: item.image_url || "", elo, tier: getTierFromElo(elo) };
          });
          top5.sort((a, b) => b.elo - a.elo);
          top5 = top5.slice(0, 5);
        }
      } else {
        const { data: snapshots } = await supabase
          .from("global_elo_snapshots")
          .select("profile_id, elo")
          .eq("league_id", league.id)
          .not("profile_id", "is", null)
          .order("elo", { ascending: false })
          .limit(50);

        const eloMap = new Map<string, number>();
        if (snapshots) {
          for (const s of snapshots) {
            if (s.profile_id && !eloMap.has(s.profile_id)) {
              eloMap.set(s.profile_id, s.elo);
            }
          }
        }

        const { data: memberships } = await supabase
          .from("league_memberships")
          .select("profile_id, elo")
          .eq("league_id", league.id)
          .order("elo", { ascending: false })
          .limit(20);

        if (memberships) {
          for (const m of memberships) {
            if (!eloMap.has(m.profile_id)) {
              eloMap.set(m.profile_id, m.elo);
            }
          }
        }

        const sorted = [...eloMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
        const profileIds = sorted.map(([id]) => id);

        if (profileIds.length > 0) {
          const { data: profiles } = await supabase
            .from("public_profiles")
            .select("id, display_name, avatar_url")
            .in("id", profileIds);

          if (profiles) {
            const profileMap = new Map(profiles.map((p: any) => [p.id, p]));
            top5 = sorted
              .filter(([id]) => profileMap.has(id))
              .map(([id, elo]) => {
                const p = profileMap.get(id)!;
                return { id: p.id, name: p.display_name || "Unknown", imageUrl: p.avatar_url || "", elo, tier: getTierFromElo(elo) };
              });
          }
        }
      }

      return { id: league.id, name: league.name, type: league.type, top5 };
    });

    const resolved = await Promise.all(promises);
    setLeagues(resolved);
    setLoading(false);
  };

  const filteredLeagues = useMemo(() => {
    if (!searchQuery.trim()) return leagues;
    const q = searchQuery.toLowerCase();
    return leagues.filter(l => l.name.toLowerCase().includes(q));
  }, [leagues, searchQuery]);

  const goNext = () => setCurrentIndex(i => Math.min(i + 1, filteredLeagues.length - 1));
  const goPrev = () => setCurrentIndex(i => Math.max(i - 1, 0));

  // Reset index when search changes
  useEffect(() => { setCurrentIndex(0); }, [searchQuery]);

  if (loading) return <div className="min-h-screen" />;

  const title = isCompete ? "Compete" : "Collections";
  const currentLeague = filteredLeagues[currentIndex];

  return (
    <div className="min-h-screen px-4 py-8 pb-24">
      <div className="container mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground flex-shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground flex items-center gap-2">
              <Trophy className="h-6 w-6 sm:h-8 sm:w-8 text-primary" /> {title}
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">{filteredLeagues.length} leagues</p>
          </div>
          {isMobile && (
            <Button variant="outline" size="icon" onClick={() => setSearchOpen(true)} className="flex-shrink-0">
              <Search className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Desktop: search bar + grid */}
        {!isMobile && (
          <>
            <div className="mb-4 max-w-sm">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search leagues..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            {filteredLeagues.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {filteredLeagues.map((league, i) => (
                  <LeagueCard key={league.id} league={league} index={i} onClick={() => navigate(`/leaderboard/${league.id}`)} />
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">No leagues found.</p>
            )}
          </>
        )}

        {/* Mobile: single card carousel */}
        {isMobile && (
          <>
            {filteredLeagues.length > 0 && currentLeague ? (
              <div className="flex flex-col items-center gap-4">
                {/* Navigation controls */}
                <div className="flex items-center justify-between w-full">
                  <Button variant="ghost" size="icon" onClick={goPrev} disabled={currentIndex === 0} className="text-muted-foreground">
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <span className="text-xs text-muted-foreground font-medium">
                    {currentIndex + 1} / {filteredLeagues.length}
                  </span>
                  <Button variant="ghost" size="icon" onClick={goNext} disabled={currentIndex === filteredLeagues.length - 1} className="text-muted-foreground">
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>

                {/* Card */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentLeague.id}
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -30 }}
                    transition={{ duration: 0.2 }}
                    className="w-full"
                  >
                    <LeagueCard
                      league={currentLeague}
                      index={0}
                      onClick={() => navigate(`/leaderboard/${currentLeague.id}`)}
                      fullWidth
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                {searchQuery ? "No leagues found." : "No leagues available yet."}
              </p>
            )}

            {/* Search Sheet */}
            <Sheet open={searchOpen} onOpenChange={setSearchOpen}>
              <SheetContent side="top" className="h-[70vh]">
                <SheetHeader>
                  <SheetTitle>Find a League</SheetTitle>
                </SheetHeader>
                <div className="mt-4">
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search leagues..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-9"
                      autoFocus
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                  <ScrollArea className="h-[calc(70vh-140px)]">
                    <div className="space-y-1 pr-2">
                      {filteredLeagues.map((league, i) => (
                        <button
                          key={league.id}
                          onClick={() => {
                            setCurrentIndex(i);
                            setSearchOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between transition-colors ${
                            i === currentIndex ? "bg-primary/10 text-primary" : "hover:bg-muted"
                          }`}
                        >
                          <span className="font-medium text-sm truncate">{league.name}</span>
                          <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                            {league.top5.length > 0 ? `${league.top5.length} ranked` : "No data"}
                          </span>
                        </button>
                      ))}
                      {filteredLeagues.length === 0 && (
                        <p className="text-center text-muted-foreground py-6 text-sm">No leagues match your search.</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </SheetContent>
            </Sheet>
          </>
        )}
      </div>
    </div>
  );
}

function LeagueCard({ league, index, onClick, fullWidth }: { league: LeagueWithTop5; index: number; onClick: () => void; fullWidth?: boolean }) {
  const isUserLeague = league.type === "user";

  return (
    <motion.button
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={onClick}
      className={`rounded-xl border border-border bg-card p-4 sm:p-4 text-left card-hover hover:border-primary/30 transition-colors ${fullWidth ? "w-full" : "w-full"}`}
    >
      <h3 className={`font-bold text-foreground truncate mb-4 ${fullWidth ? "text-lg" : "text-sm"}`}>{league.name}</h3>

      {league.top5.length > 0 ? (
        <div className="space-y-3">
          {league.top5.map((entry, i) => {
            const rank = i + 1;
            const isTop3 = rank <= 3;
            const circleSize = fullWidth
              ? (isTop3 ? "w-14 h-14" : "w-10 h-10")
              : (isTop3 ? "w-16 h-16" : "w-12 h-12");

            return (
              <div key={entry.id} className="flex items-center gap-3">
                <div className="w-5 text-right flex-shrink-0">
                  {rank === 1 ? (
                    <Crown className="h-4 w-4 text-tier-gold inline" />
                  ) : (
                    <span className={`text-xs font-black ${isTop3 ? "text-tier-gold" : "text-muted-foreground"}`}>
                      {rank}
                    </span>
                  )}
                </div>
                {isUserLeague ? (
                  <UserAvatar
                    src={entry.imageUrl}
                    name={entry.name}
                    size={isTop3 ? "lg" : "md"}
                    className={isTop3 ? "avatar-ring" : "ring-1 ring-border"}
                  />
                ) : (
                  <div className={`${circleSize} rounded-full overflow-hidden flex-shrink-0 ${isTop3 ? "avatar-ring" : "ring-1 ring-border"}`}>
                    {entry.imageUrl ? (
                      <img src={entry.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
                        {entry.name.charAt(0)}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`font-bold text-foreground truncate ${fullWidth ? "text-sm" : "text-xs"}`}>{entry.name}</span>
                    <TierBadge tier={entry.tier} className="text-[8px] px-1.5 py-0" />
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`text-xs font-black ${getTierColor(entry.tier)}`}>{entry.elo}</div>
                  <div className="text-[8px] text-muted-foreground">AURA</div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground py-4 text-center">No rankings yet</p>
      )}
    </motion.button>
  );
}
