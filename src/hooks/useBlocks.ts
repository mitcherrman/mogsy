import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useBlocks() {
  const { user } = useAuth();
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
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

  const refresh = useCallback(async () => {
    if (!myProfileId) return;
    setLoading(true);
    const { data } = await supabase
      .from("user_blocks")
      .select("blocked_profile_id")
      .eq("blocker_profile_id", myProfileId);
    setBlockedIds(new Set((data || []).map((r: any) => r.blocked_profile_id)));
    setLoading(false);
  }, [myProfileId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const blockUser = async (targetProfileId: string) => {
    if (!myProfileId) return;
    // Block
    await supabase.from("user_blocks").insert({
      blocker_profile_id: myProfileId,
      blocked_profile_id: targetProfileId,
    });
    // Also remove any friendship
    const { data: friendships } = await supabase
      .from("friendships")
      .select("id")
      .or(
        `and(requester_id.eq.${myProfileId},addressee_id.eq.${targetProfileId}),and(requester_id.eq.${targetProfileId},addressee_id.eq.${myProfileId})`
      );
    if (friendships && friendships.length > 0) {
      await supabase.from("friendships").delete().in("id", friendships.map(f => f.id));
    }
    await refresh();
  };

  const unblockUser = async (targetProfileId: string) => {
    if (!myProfileId) return;
    await supabase
      .from("user_blocks")
      .delete()
      .eq("blocker_profile_id", myProfileId)
      .eq("blocked_profile_id", targetProfileId);
    await refresh();
  };

  const isBlocked = (profileId: string) => blockedIds.has(profileId);

  return { blockedIds, loading, blockUser, unblockUser, isBlocked, myProfileId, refresh };
}

export function useReportUser() {
  const { user } = useAuth();
  const [myProfileId, setMyProfileId] = useState<string | null>(null);

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

  const reportUser = async (targetProfileId: string, reason: string, details?: string) => {
    if (!myProfileId) return;
    await supabase.from("user_reports").insert({
      reporter_profile_id: myProfileId,
      reported_profile_id: targetProfileId,
      reason,
      details,
    });
  };

  return { reportUser, myProfileId };
}
