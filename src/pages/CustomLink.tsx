import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "./NotFound";

const CURATED_STORAGE_KEY = "mogsy_curated_link";

export interface CuratedConfig {
  recommended_league_ids: string[];
  recommended_categories: string[];
  default_theme: string;
  default_swipe_animation: string;
  grant_diamonds: number;
  grant_pro: boolean;
  slug: string;
}

export function getCuratedConfig(): CuratedConfig | null {
  try {
    const raw = localStorage.getItem(CURATED_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearCuratedConfig() {
  localStorage.removeItem(CURATED_STORAGE_KEY);
}

export default function CustomLink() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) { setNotFound(true); return; }
    resolveSlug(slug);
  }, [slug]);

  const resolveSlug = async (s: string) => {
    const lower = s.toLowerCase();

    // Check swipe tab config for button slugs first
    const { data: swipeConfig } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "swipe_tab_config")
      .maybeSingle();

    if (swipeConfig?.value) {
      const cfg = swipeConfig.value as any;
      const buttonSlugs: Record<string, string> = cfg.button_slugs || {};
      // Find which button key this slug maps to
      const matchedKey = Object.entries(buttonSlugs).find(
        ([, slug]) => slug === lower
      )?.[0];

      if (matchedKey) {
        // Resolve the button key to a league
        const swipeOptions: Record<string, { leagueName: string; type: string }> = {
          anime: { leagueName: "Best Anime", type: "preset" },
          fastfood: { leagueName: "Best Fast Food", type: "preset" },
          movies: { leagueName: "Best Movie of All Time", type: "preset" },
          sports: { leagueName: "Best Sport of All Time", type: "preset" },
          marvel: { leagueName: "Best Marvel Movie", type: "preset" },
          videogames: { leagueName: "Best Video Game of All Time", type: "preset" },
          lol: { leagueName: "Best Champion", type: "preset" },
          compete: { leagueName: "Global Rankings", type: "compete" },
        };

        const option = swipeOptions[matchedKey];
        if (option) {
          if (option.type === "compete") {
            navigate("/swipe-game", { replace: true });
            return;
          }
          const { data: league } = await supabase
            .from("leagues")
            .select("id")
            .eq("name", option.leagueName)
            .maybeSingle();
          if (league) {
            navigate(`/swipe/preset/${league.id}`, { replace: true });
            return;
          }
        }
      }
    }

    // Resolve via SECURITY DEFINER RPC (only safe columns are returned)
    const { data: resolved, error } = await supabase
      .rpc("resolve_custom_link" as any, { _slug: lower });
    const data = Array.isArray(resolved) ? resolved[0] : resolved;
    if (!error && data) {
      handleCustomLink(s, data);
      return;
    }

    // Fallback: check invite_links table (referral / invite codes)
    const { data: inviteData } = await supabase
      .from("invite_links")
      .select("code")
      .eq("code", s.toUpperCase())
      .eq("is_active", true)
      .maybeSingle();

    if (inviteData) {
      navigate(`/auth?invite=${inviteData.code}`, { replace: true });
      return;
    }

    setNotFound(true);
  };

  const handleCustomLink = (s: string, data: any) => {

    // Increment visits (fire-and-forget) via SECURITY DEFINER RPC
    supabase.rpc("increment_custom_link_visits" as any, { _slug: s.toLowerCase() }).then(() => {});

    if (data.destination_type === "league" && data.league_id) {
      navigate(`/swipe/preset/${data.league_id}`, { replace: true, state: { subcategory: data.label || undefined } });
      return;
    }

    // Curated type — store config and redirect
    const config: CuratedConfig = {
      recommended_league_ids: (data.recommended_league_ids as string[]) || [],
      recommended_categories: (data.recommended_categories as string[]) || [],
      default_theme: (data as any).default_theme || "default",
      default_swipe_animation: (data as any).default_swipe_animation || "default",
      // grant_* fields are intentionally not exposed to the public; they apply server-side only
      grant_diamonds: 0,
      grant_pro: false,
      slug: s,
    };
    localStorage.setItem(CURATED_STORAGE_KEY, JSON.stringify(config));

    if (user) {
      navigate("/home", { replace: true });
    } else {
      navigate("/auth", { replace: true });
    }
  };

  if (notFound) return <NotFound />;

  return <div className="min-h-dvh bg-background flex items-center justify-center">
    <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
  </div>;
}
