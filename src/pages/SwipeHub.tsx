import { useState, useEffect, useRef } from "react";
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

  // Split into two rows for auto-scrolling marquee
  const row1 = orderedOptions.filter((_, i) => i % 2 === 0);
  const row2 = orderedOptions.filter((_, i) => i % 2 === 1);
  const gap = bubbleSize > 200 ? 24 : bubbleSize > 120 ? 16 : 12;

  return (
    <>
      <SEOHead title="Swipe | Mogsy" description="Pick a category and start swiping!" />
      <div className="h-[100dvh] overflow-hidden px-4 py-6 flex flex-col">
        <div className="container mx-auto w-full flex-1 min-h-0 flex flex-col" style={{ maxWidth: "100%" }}>
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl font-extrabold text-center mb-6 shrink-0"
          >
            Swipe
          </motion.h1>

          <div className="flex-1 min-h-0 flex flex-col justify-center gap-4">
            <AutoScrollRow
              options={row1}
              leagues={leagues}
              bubbleSize={bubbleSize}
              shape={shape}
              gap={gap}
              direction={1}
              getBorderRadius={getBorderRadius}
              getButtonWidth={getButtonWidth}
              onSelect={handleSelect}
            />
            <AutoScrollRow
              options={row2}
              leagues={leagues}
              bubbleSize={bubbleSize}
              shape={shape}
              gap={gap}
              direction={1}
              getBorderRadius={getBorderRadius}
              getButtonWidth={getButtonWidth}
              onSelect={handleSelect}
            />
          </div>
        </div>
      </div>
    </>
  );
}

interface AutoScrollRowProps {
  options: SwipeOption[];
  leagues: Record<string, { id: string; imageUrl?: string | null }>;
  bubbleSize: number;
  shape: string;
  gap: number;
  direction: 1 | -1;
  getBorderRadius: () => string;
  getButtonWidth: () => number;
  onSelect: (o: SwipeOption) => void;
}

function AutoScrollRow({ options, leagues, bubbleSize, shape, gap, direction, getBorderRadius, getButtonWidth, onSelect }: AutoScrollRowProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (options.length === 0) return;
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    let last = performance.now();
    const speed = 30; // px per second
    let pos = el.scrollLeft;

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const half = el.scrollWidth / 2;
      if (half > 0) {
        pos += direction * speed * dt;
        if (pos >= half) pos -= half;
        if (pos < 0) pos += half;
        el.scrollLeft = pos;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [options.length, direction]);

  if (options.length === 0) return null;

  // Duplicate for seamless looping
  const items = [...options, ...options];
  const w = getButtonWidth();
  const h = bubbleSize;
  const br = getBorderRadius();

  const fadeMask =
    "linear-gradient(to right, transparent 0, #000 clamp(40px, 8%, 96px), #000 calc(100% - clamp(40px, 8%, 96px)), transparent 100%)";

  return (
    <div
      ref={scrollRef}
      className="overflow-x-auto swipe-thin-scroll group"
      style={{
        scrollbarWidth: "none",
        WebkitMaskImage: fadeMask,
        maskImage: fadeMask,
      }}
    >
      <div
        className="flex items-center"
        style={{
          gap,
          width: "max-content",
          paddingTop: bubbleSize * 0.1,
          paddingBottom: bubbleSize * 0.1,
          paddingLeft: bubbleSize * 0.5,
          paddingRight: bubbleSize * 0.5,
        }}
      >
        {items.map((option, i) => {
          const league = leagues[option.key];
          return (
            <div key={`${option.key}-${i}`} className="shrink-0">
              {shape === "circle" ? (
                <CategoryBubble
                  size={bubbleSize}
                  onClick={() => onSelect(option)}
                  imageUrl={league?.imageUrl}
                  label={option.label}
                  variant={option.type === "compete" ? "accent" : "card"}
                />
              ) : (
                <motion.button
                  onClick={() => onSelect(option)}
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.95 }}
                  className="relative flex flex-col items-center justify-center border-2 cursor-pointer select-none overflow-hidden border-border bg-card text-foreground"
                  style={{ width: w, height: h, borderRadius: br }}
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
