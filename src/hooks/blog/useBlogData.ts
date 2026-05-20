import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Fetch a single preset item with its primary image + league name. */
export function useBlogItem(itemId?: string | null) {
  return useQuery({
    queryKey: ["blog-item", itemId],
    enabled: !!itemId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: item } = await supabase
        .from("preset_items")
        .select("id, name, subtitle, image_url, elo, league_id")
        .eq("id", itemId!)
        .maybeSingle();
      if (!item) return null;
      const { data: league } = await supabase
        .from("leagues")
        .select("id, name, category")
        .eq("id", item.league_id)
        .maybeSingle();
      const { data: img } = await supabase
        .from("preset_item_images")
        .select("image_url")
        .eq("preset_item_id", item.id)
        .eq("is_hidden", false)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      return {
        ...item,
        image_url: img?.image_url || item.image_url,
        league_name: league?.name ?? null,
      };
    },
  });
}

/** Fetch a profile (uses public_profiles for RLS safety). */
export function useBlogProfile(profileId?: string | null) {
  return useQuery({
    queryKey: ["blog-profile", profileId],
    enabled: !!profileId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("public_profiles")
        .select("id, display_name, avatar_url, global_elo, is_pro")
        .eq("id", profileId!)
        .maybeSingle();
      return data;
    },
  });
}

/** Fetch top-N for a league. */
export function useBlogLeaderboard(leagueId?: string | null, limit = 10) {
  return useQuery({
    queryKey: ["blog-leaderboard", leagueId, limit],
    enabled: !!leagueId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: league } = await supabase
        .from("leagues")
        .select("id, name, type")
        .eq("id", leagueId!)
        .maybeSingle();
      if (!league) return { league: null, rows: [] };

      if (league.type === "preset") {
        const { data } = await supabase
          .from("preset_items")
          .select("id, name, image_url, elo")
          .eq("league_id", leagueId!)
          .order("elo", { ascending: false })
          .limit(limit);
        return {
          league,
          rows: (data ?? []).map((r) => ({
            id: r.id,
            name: r.name,
            image_url: r.image_url,
            elo: r.elo,
          })),
        };
      }
      // user league
      const { data: memberships } = await supabase
        .from("league_memberships")
        .select("id, profile_id, elo")
        .eq("league_id", leagueId!)
        .order("elo", { ascending: false })
        .limit(limit);
      const ids = (memberships ?? []).map((m) => m.profile_id);
      const { data: profiles } = ids.length
        ? await supabase
            .from("public_profiles")
            .select("id, display_name, avatar_url")
            .in("id", ids)
        : { data: [] as any[] };
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      return {
        league,
        rows: (memberships ?? []).map((m) => {
          const p = profileMap.get(m.profile_id) as any;
          return {
            id: m.profile_id,
            name: p?.display_name ?? "Anonymous",
            image_url: p?.avatar_url ?? null,
            elo: m.elo,
          };
        }),
      };
    },
  });
}

/** Aura history line chart — global_elo_snapshots for either an item or profile. */
export function useBlogAuraHistory(opts: { itemId?: string | null; profileId?: string | null; days?: number }) {
  const days = opts.days ?? 30;
  return useQuery({
    queryKey: ["blog-aura-history", opts.itemId, opts.profileId, days],
    enabled: !!(opts.itemId || opts.profileId),
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase
        .from("global_elo_snapshots")
        .select("elo, snapshot_at")
        .gte("snapshot_at", new Date(Date.now() - days * 24 * 3600 * 1000).toISOString())
        .order("snapshot_at", { ascending: true })
        .limit(500);
      if (opts.itemId) q = q.eq("item_id", opts.itemId);
      if (opts.profileId) q = q.eq("profile_id", opts.profileId);
      const { data } = await q;
      return (data ?? []).map((r) => ({
        date: new Date(r.snapshot_at).toISOString().slice(5, 10),
        elo: r.elo,
      }));
    },
  });
}

/** Matchup counts per item in a league. */
export function useBlogMatchupCounts(leagueId?: string | null, limit = 8) {
  return useQuery({
    queryKey: ["blog-matchup-counts", leagueId, limit],
    enabled: !!leagueId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: matches } = await supabase
        .from("matches")
        .select("winner_item_id, loser_item_id")
        .eq("league_id", leagueId!)
        .limit(1000);
      const tally = new Map<string, { wins: number; losses: number }>();
      for (const m of matches ?? []) {
        if (m.winner_item_id) {
          const t = tally.get(m.winner_item_id) ?? { wins: 0, losses: 0 };
          t.wins++;
          tally.set(m.winner_item_id, t);
        }
        if (m.loser_item_id) {
          const t = tally.get(m.loser_item_id) ?? { wins: 0, losses: 0 };
          t.losses++;
          tally.set(m.loser_item_id, t);
        }
      }
      const ids = [...tally.keys()];
      const { data: items } = ids.length
        ? await supabase.from("preset_items").select("id, name").in("id", ids)
        : { data: [] as any[] };
      const nameMap = new Map((items ?? []).map((i: any) => [i.id, i.name]));
      return [...tally.entries()]
        .map(([id, t]) => ({
          name: nameMap.get(id) ?? "—",
          wins: t.wins,
          losses: t.losses,
          total: t.wins + t.losses,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, limit);
    },
  });
}
