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
    // First check custom_links table
    const { data, error } = await supabase
      .from("custom_links")
      .select("*")
      .eq("slug", s.toLowerCase())
      .eq("is_active", true)
      .maybeSingle();

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

    // Increment visits (fire-and-forget)
    supabase.rpc("increment_custom_link_visits" as any, { _slug: s.toLowerCase() }).then(() => {});
    // Fallback: direct update if RPC doesn't exist
    supabase.from("custom_links").update({ visits: (data.visits ?? 0) + 1 } as any).eq("id", data.id).then(() => {});

    if (data.destination_type === "league" && data.league_id) {
      navigate(`/swipe/preset/${data.league_id}`, { replace: true });
      return;
    }

    // Curated type — store config and redirect
    const config: CuratedConfig = {
      recommended_league_ids: (data.recommended_league_ids as string[]) || [],
      recommended_categories: (data.recommended_categories as string[]) || [],
      default_theme: (data as any).default_theme || "default",
      default_swipe_animation: (data as any).default_swipe_animation || "default",
      grant_diamonds: (data as any).grant_diamonds || 0,
      grant_pro: (data as any).grant_pro || false,
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

  return <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
  </div>;
}
