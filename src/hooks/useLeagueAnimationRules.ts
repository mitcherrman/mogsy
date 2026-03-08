import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AnimationRule {
  id: string;
  league_id: string;
  animation_id: string;
  every_n_swipes: number;
  is_enabled: boolean;
  sort_order: number;
}

export function useLeagueAnimationRules(leagueId: string | null | undefined) {
  const [rules, setRules] = useState<AnimationRule[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRules = useCallback(async () => {
    if (!leagueId) { setRules([]); setLoading(false); return; }
    const { data } = await supabase
      .from("league_animation_rules")
      .select("*")
      .eq("league_id", leagueId)
      .eq("is_enabled", true)
      .order("sort_order");
    setRules((data as AnimationRule[]) || []);
    setLoading(false);
  }, [leagueId]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  return { rules, loading, refetch: fetchRules };
}

/**
 * Given a swipe count and rules array, returns the animation override (if any).
 * First matching rule wins (by sort_order).
 */
export function getAnimationOverride(swipeCount: number, rules: AnimationRule[]): string | null {
  if (swipeCount === 0) return null;
  for (const rule of rules) {
    if (rule.every_n_swipes > 0 && swipeCount % rule.every_n_swipes === 0) {
      return rule.animation_id;
    }
  }
  return null;
}
