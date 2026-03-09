import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface TutorialTip {
  id: string;
  page_route: string;
  title: string;
  message: string;
  target_selector: string | null;
  position: string;
  sort_order: number;
  is_enabled: boolean;
}

export function useTutorialTips(currentRoute: string) {
  const { user } = useAuth();
  const [tips, setTips] = useState<TutorialTip[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setMyProfileId(data.id);
      });
  }, [user]);

  useEffect(() => {
    if (!myProfileId || !currentRoute) return;

    const load = async () => {
      setLoading(true);
      const [tipsRes, dismissRes] = await Promise.all([
        supabase
          .from("tutorial_tips")
          .select("*")
          .eq("is_enabled", true)
          .order("sort_order"),
        supabase
          .from("tutorial_tip_dismissals")
          .select("tip_id")
          .eq("profile_id", myProfileId),
      ]);

      const allTips = (tipsRes.data || []) as TutorialTip[];
      const dismissed = new Set((dismissRes.data || []).map((d: any) => d.tip_id));

      // Match tips to current route (handle dynamic params like :leagueId)
      const matchingTips = allTips.filter((t) => {
        if (t.page_route === currentRoute) return true;
        // Convert route pattern to regex
        const pattern = t.page_route.replace(/:[^/]+/g, "[^/]+");
        return new RegExp(`^${pattern}$`).test(currentRoute);
      });

      setTips(matchingTips);
      setDismissedIds(dismissed);
      setLoading(false);
    };

    load();
  }, [myProfileId, currentRoute]);

  const dismissTip = useCallback(
    async (tipId: string) => {
      if (!myProfileId) return;
      setDismissedIds((prev) => new Set(prev).add(tipId));
      await supabase.from("tutorial_tip_dismissals").insert({
        profile_id: myProfileId,
        tip_id: tipId,
      });
    },
    [myProfileId]
  );

  const visibleTips = tips.filter((t) => !dismissedIds.has(t.id));

  return { tips: visibleTips, loading, dismissTip, allTips: tips };
}
