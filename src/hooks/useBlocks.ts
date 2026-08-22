import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  attempt,
  BLOCK_MESSAGES,
  failure,
  REPORT_MESSAGES,
  success,
  type SocialResult,
} from "@/lib/community/social-result";

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

  /**
   * COM1-1 / P0-2. Blocking is two statements — record the block, then drop any
   * friendship — and neither used to be checked, so `FriendActionMenu` toasted
   * "X has been blocked" even when the insert was refused outright.
   *
   * ORDER MATTERS AND IS DELIBERATE. The block lands FIRST and the unfriend
   * only runs if it succeeded, so the failure mode is "blocked, still listed as
   * a friend" rather than "unfriended, not blocked" — the first is a stale list
   * the next refresh corrects (`refresh()` already filters blocked profiles
   * out), the second silently fails to protect the user who asked to be
   * protected.
   *
   * These two statements are still not ATOMIC. Making them one transaction
   * needs a SECURITY DEFINER RPC and is tracked separately; what this change
   * fixes is the reporting, which is what made the gap invisible.
   */
  const blockUser = async (targetProfileId: string): Promise<SocialResult> => {
    if (!myProfileId) return failure("unavailable", BLOCK_MESSAGES);

    const blocked = await attempt(
      () => supabase.from("user_blocks").insert({
        blocker_profile_id: myProfileId,
        blocked_profile_id: targetProfileId,
      }),
      BLOCK_MESSAGES,
    );
    if (!blocked.ok) {
      await refresh();
      return blocked;
    }

    const { data: friendships, error: readError } = await supabase
      .from("friendships")
      .select("id")
      .or(
        `and(requester_id.eq.${myProfileId},addressee_id.eq.${targetProfileId}),and(requester_id.eq.${targetProfileId},addressee_id.eq.${myProfileId})`
      );

    let unfriend: SocialResult = success();
    if (!readError && friendships && friendships.length > 0) {
      unfriend = await attempt(
        () => supabase.from("friendships").delete().in("id", friendships.map(f => f.id)),
        BLOCK_MESSAGES,
      );
    }
    await refresh();

    // The block IS in place, so this is reported as a success with a refetch
    // rather than a failure — saying "could not block" would be untrue and
    // would invite the user to retry something already done.
    if (readError || !unfriend.ok) return { ok: true, code: "already", refetch: true };
    return blocked;
  };

  const unblockUser = async (targetProfileId: string): Promise<SocialResult> => {
    if (!myProfileId) return failure("unavailable", BLOCK_MESSAGES);
    const result = await attempt(() =>
      supabase
        .from("user_blocks")
        .delete()
        .eq("blocker_profile_id", myProfileId)
        .eq("blocked_profile_id", targetProfileId));
    await refresh();
    return result;
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

  /**
   * COM1-1 / P0-2. This returned `undefined` on every path and could not throw
   * — supabase-js resolves with `{ error }` — so the `try/catch` around it in
   * `FriendActionMenu` was unreachable and "Report submitted. We'll review it
   * shortly." was printed whether or not a row was ever written.
   */
  const reportUser = async (
    targetProfileId: string, reason: string, details?: string,
  ): Promise<SocialResult> => {
    if (!myProfileId) return failure("unavailable", REPORT_MESSAGES);
    return attempt(
      () => supabase.from("user_reports").insert({
        reporter_profile_id: myProfileId,
        reported_profile_id: targetProfileId,
        reason,
        details,
      }),
      REPORT_MESSAGES,
      // Reporting the same person twice is not "already done" in a way the
      // reporter should be told about; a duplicate is simply accepted.
      { treatAlreadyAsSuccess: true },
    );
  };

  return { reportUser, myProfileId };
}
