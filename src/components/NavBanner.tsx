import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface BannerItem {
  name: string;
  image: string;
  elo: number;
  leagueName: string;
}

interface BannerConfig {
  rotation_delay: number;
  mode: "auto" | "manual";
  manual_items: { id: string; type: string; name: string; image: string; elo: number; league_name: string }[];
}

export default function NavBanner() {
  const [items, setItems] = useState<BannerItem[]>([]);
  const [index, setIndex] = useState(0);
  const [delay, setDelay] = useState(7000);
  const timer = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    if (items.length <= 1) return;
    timer.current = setInterval(() => {
      setIndex((i) => (i + 1) % items.length);
    }, delay);
    return () => clearInterval(timer.current);
  }, [items.length, delay]);

  const loadConfig = async () => {
    const { data: configData } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "navbar_banner_config")
      .single();

    const cfg = configData?.value as unknown as BannerConfig | null;
    if (cfg) setDelay(cfg.rotation_delay || 7000);

    if (cfg?.mode === "manual" && cfg.manual_items?.length > 0) {
      setItems(cfg.manual_items.map((m) => ({ name: m.name, image: m.image, elo: m.elo, leagueName: m.league_name })));
      return;
    }

    // Auto mode
    await loadAutoItems();
  };

  const loadAutoItems = async () => {
    const [{ data: presets }, { data: members }] = await Promise.all([
      supabase
        .from("preset_items")
        .select("name, image_url, elo, league_id, leagues!inner(name)")
        .not("image_url", "is", null)
        .not("image_url", "eq", "")
        .order("elo", { ascending: false })
        .limit(5),
      supabase
        .from("league_memberships")
        .select("elo, profile_id, league_id, leagues!inner(name)")
        .order("elo", { ascending: false })
        .limit(5),
    ]);

    const result: BannerItem[] = [];

    if (members && members.length > 0) {
      const pIds = [...new Set(members.map((m) => m.profile_id))];
      const { data: profiles } = await supabase.from("public_profiles").select("id, display_name, avatar_url").in("id", pIds);
      const pMap = new Map((profiles || []).map((p) => [p.id, p]));
      members.forEach((m: any) => {
        const p = pMap.get(m.profile_id);
        if (p?.avatar_url) {
          result.push({ name: p.display_name || "User", image: p.avatar_url, elo: m.elo, leagueName: m.leagues?.name || "" });
        }
      });
    }

    (presets || []).forEach((item: any) => {
      result.push({ name: item.name, image: item.image_url, elo: item.elo, leagueName: item.leagues?.name || "" });
    });

    result.sort((a, b) => b.elo - a.elo);
    setItems(result.slice(0, 6));
  };

  const current = items.length > 0 ? items[index] : null;

  return (
    <div
      className="relative h-9 sm:h-10 flex-1 mx-1 sm:mx-2 overflow-hidden rounded-lg border border-border bg-card/60"
    >
      {current && (
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 flex items-center gap-1 sm:gap-1.5 md:gap-2 px-1.5 sm:px-2"
          >
            <div className="h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7 rounded-full overflow-hidden border border-primary/30 flex-shrink-0">
              <img src={current.image} alt={current.name} className="w-full h-full object-cover" />
            </div>
            <div className="hidden md:flex flex-1 min-w-0 items-center gap-1">
              <Crown className="h-3 w-3 text-primary flex-shrink-0" />
              <span className="text-xs font-bold text-foreground truncate">{current.name}</span>
            </div>
            <span className="text-[9px] sm:text-[10px] font-bold text-primary flex-shrink-0">{current.elo}</span>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
