import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import SEOHead from "@/components/SEOHead";
import CategoryBubble from "@/components/CategoryBubble";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface SwipeOption {
  key: string;
  label: string;
  leagueName: string; // used to find league in DB
  type: "preset" | "compete";
  imageUrl?: string | null;
}

const SWIPE_OPTIONS: SwipeOption[] = [
  { key: "anime", label: "Anime", leagueName: "Best Anime", type: "preset" },
  { key: "fastfood", label: "Best Fast Food", leagueName: "Best Fast Food", type: "preset" },
  { key: "movies", label: "Movies", leagueName: "Best Movie of All Time", type: "preset" },
  { key: "sports", label: "Sports", leagueName: "Best Sport of All Time", type: "preset" },
  { key: "marvel", label: "Marvel Movies", leagueName: "Best Marvel Movie", type: "preset" },
  { key: "videogames", label: "Video Games", leagueName: "Best Video Game of All Time", type: "preset" },
  { key: "lol", label: "League of Legends", leagueName: "Best Champion", type: "preset" },
  { key: "compete", label: "Compete", leagueName: "Global Rankings", type: "compete" },
];

export default function SwipeHub() {
  const navigate = useNavigate();
  const [leagues, setLeagues] = useState<Record<string, { id: string; imageUrl?: string | null }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const leagueNames = SWIPE_OPTIONS.filter(o => o.type === "preset").map(o => o.leagueName);
    
    supabase
      .from("leagues")
      .select("id, name")
      .in("name", leagueNames)
      .then(async ({ data: leagueData }) => {
        const map: Record<string, { id: string; imageUrl?: string | null }> = {};
        
        if (leagueData) {
          // Get first image for each league
          const leagueIds = leagueData.map(l => l.id);
          const { data: items } = await supabase
            .from("preset_items")
            .select("league_id, image_url")
            .in("league_id", leagueIds)
            .limit(1);
          
          const imageMap: Record<string, string | null> = {};
          if (items) {
            for (const item of items) {
              if (!imageMap[item.league_id]) imageMap[item.league_id] = item.image_url;
            }
          }

          for (const league of leagueData) {
            const option = SWIPE_OPTIONS.find(o => o.leagueName === league.name);
            if (option) {
              map[option.key] = { id: league.id, imageUrl: imageMap[league.id] || null };
            }
          }
        }
        
        setLeagues(map);
        setLoading(false);
      });
  }, []);

  const handleSelect = (option: SwipeOption) => {
    if (option.type === "compete") {
      navigate("/swipe-game");
      return;
    }
    const league = leagues[option.key];
    if (league) {
      navigate(`/swipe/preset/${league.id}`, { state: { subcategory: option.label } });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <SEOHead title="Swipe | Mogsy" description="Pick a category and start swiping!" />
      <div className="min-h-screen px-4 py-6">
        <div className="container mx-auto max-w-lg">
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl font-extrabold text-center mb-6"
          >
            Swipe
          </motion.h1>

          <div className="flex flex-wrap justify-center gap-4">
            {SWIPE_OPTIONS.map((option, i) => {
              const league = leagues[option.key];
              return (
                <motion.div
                  key={option.key}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <CategoryBubble
                    size={110}
                    onClick={() => handleSelect(option)}
                    imageUrl={league?.imageUrl}
                    label={option.label}
                    variant={option.type === "compete" ? "accent" : "card"}
                  />
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
