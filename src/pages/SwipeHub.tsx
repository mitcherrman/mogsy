import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import SEOHead from "@/components/SEOHead";
import CategoryBubble from "@/components/CategoryBubble";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface SwipeOption {
  key: string;
  label: string;
  leagueName: string;
  type: "preset" | "compete";
}

const ALL_SWIPE_OPTIONS: SwipeOption[] = [
  { key: "anime", label: "Anime", leagueName: "Best Anime", type: "preset" },
  { key: "fastfood", label: "Best Fast Food", leagueName: "Best Fast Food", type: "preset" },
  { key: "movies", label: "Movies", leagueName: "Best Movie of All Time", type: "preset" },
  { key: "sports", label: "Sports", leagueName: "Best Sport of All Time", type: "preset" },
  { key: "marvel", label: "Marvel Movies", leagueName: "Best Marvel Movie", type: "preset" },
  { key: "videogames", label: "Video Games", leagueName: "Best Video Game of All Time", type: "preset" },
  { key: "lol", label: "League of Legends", leagueName: "Best Champion", type: "preset" },
  { key: "compete", label: "Compete", leagueName: "Global Rankings", type: "compete" },
];

interface SwipeTabConfig {
  bubble_size_mobile: number;
  bubble_size_desktop: number;
  items_per_row_mobile: number;
  items_per_row_desktop: number;
  shape: string;
  formation: string;
  button_order: string[];
  button_slugs: Record<string, string>;
}

const DEFAULT_CONFIG: SwipeTabConfig = {
  bubble_size_mobile: 110,
  bubble_size_desktop: 150,
  items_per_row_mobile: 3,
  items_per_row_desktop: 8,
  shape: "circle",
  formation: "wrap",
  button_order: ["anime", "fastfood", "movies", "sports", "marvel", "videogames", "lol", "compete"],
  button_slugs: {},
};

export default function SwipeHub() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [leagues, setLeagues] = useState<Record<string, { id: string; imageUrl?: string | null }>>({});
  const [config, setConfig] = useState<SwipeTabConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      // Load config
      const { data: settingsData } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "swipe_tab_config")
        .maybeSingle();
      
      if (settingsData?.value) {
        setConfig(c => ({ ...c, ...(settingsData.value as any) }));
      }

      // Load leagues
      const leagueNames = ALL_SWIPE_OPTIONS.filter(o => o.type === "preset").map(o => o.leagueName);
      const { data: leagueData } = await supabase
        .from("leagues")
        .select("id, name")
        .in("name", leagueNames);

      const map: Record<string, { id: string; imageUrl?: string | null }> = {};

      if (leagueData && leagueData.length > 0) {
        const leagueIds = leagueData.map(l => l.id);
        const { data: items } = await supabase
          .from("preset_items")
          .select("id, league_id")
          .in("league_id", leagueIds);

        if (items && items.length > 0) {
          const itemIds = items.map(i => i.id);
          const { data: images } = await supabase
            .from("preset_item_images")
            .select("preset_item_id, image_url")
            .in("preset_item_id", itemIds)
            .eq("is_hidden", false);

          const imagesByLeague: Record<string, string[]> = {};
          if (images) {
            const itemToLeague: Record<string, string> = {};
            for (const item of items) itemToLeague[item.id] = item.league_id;
            for (const img of images) {
              const lid = itemToLeague[img.preset_item_id];
              if (lid) {
                if (!imagesByLeague[lid]) imagesByLeague[lid] = [];
                imagesByLeague[lid].push(img.image_url);
              }
            }
          }

          for (const league of leagueData) {
            const option = ALL_SWIPE_OPTIONS.find(o => o.leagueName === league.name);
            if (option) {
              const imgs = imagesByLeague[league.id] || [];
              map[option.key] = {
                id: league.id,
                imageUrl: imgs.length > 0 ? imgs[Math.floor(Math.random() * imgs.length)] : null,
              };
            }
          }
        }
      }

      setLeagues(map);
      setLoading(false);
    };
    load();
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

  const bubbleSize = (isMobile ? config.bubble_size_mobile : config.bubble_size_desktop) * 2;
  const itemsPerRow = isMobile ? config.items_per_row_mobile : config.items_per_row_desktop;
  const { shape, formation } = config;

  // Order buttons per config
  const orderedOptions = config.button_order
    .map(key => ALL_SWIPE_OPTIONS.find(o => o.key === key))
    .filter(Boolean) as SwipeOption[];

  // Shape styles
  const getBorderRadius = () => {
    if (shape === "circle") return "50%";
    if (shape === "rounded") return "16px";
    if (shape === "pill") return "999px";
    return "50%";
  };

  const getButtonWidth = () => {
    if (shape === "pill") return bubbleSize * 1.8;
    return bubbleSize;
  };

  // Container styles based on formation
  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexWrap: formation === "horizontal" ? "nowrap" : "wrap",
    justifyContent: "center",
    gap: bubbleSize > 200 ? 24 : bubbleSize > 120 ? 16 : 12,
    overflowX: formation === "horizontal" ? "auto" : "visible",
    maxWidth: formation === "rows"
      ? `${(getButtonWidth() + (bubbleSize > 200 ? 24 : 16)) * itemsPerRow}px`
      : undefined,
  };

  return (
    <>
      <SEOHead title="Swipe | Mogsy" description="Pick a category and start swiping!" />
      <div className="h-[100dvh] overflow-hidden px-4 py-6">
        <div className="container mx-auto" style={{ maxWidth: formation === "horizontal" ? "100%" : "64rem" }}>
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl font-extrabold text-center mb-6"
          >
            Swipe
          </motion.h1>

          <div style={containerStyle} className="mx-auto">
            {orderedOptions.map((option, i) => {
              const league = leagues[option.key];
              const w = getButtonWidth();
              const h = bubbleSize;
              const br = getBorderRadius();

              return (
                <motion.div
                  key={option.key}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className="shrink-0"
                >
                  {shape === "circle" ? (
                    <CategoryBubble
                      size={bubbleSize}
                      onClick={() => handleSelect(option)}
                      imageUrl={league?.imageUrl}
                      label={option.label}
                      variant={option.type === "compete" ? "accent" : "card"}
                    />
                  ) : (
                    <motion.button
                      onClick={() => handleSelect(option)}
                      whileHover={{ scale: 1.06 }}
                      whileTap={{ scale: 0.95 }}
                      className="relative flex flex-col items-center justify-center border-2 cursor-pointer select-none overflow-hidden border-border bg-card text-foreground"
                      style={{
                        width: w,
                        height: h,
                        borderRadius: br,
                      }}
                    >
                      {league?.imageUrl && (
                        <>
                          <img
                            src={league.imageUrl}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover"
                            style={{ borderRadius: br }}
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-black/50" style={{ borderRadius: br }} />
                        </>
                      )}
                      <span className={`relative z-10 font-extrabold tracking-wide text-center px-2 leading-tight ${league?.imageUrl ? "text-white drop-shadow-lg" : ""} ${bubbleSize >= 200 ? "text-base" : bubbleSize >= 120 ? "text-xs" : "text-[10px]"}`}>
                        {option.label}
                      </span>
                    </motion.button>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
