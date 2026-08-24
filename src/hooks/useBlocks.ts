import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { blockProfile, unblockProfile } from "@/lib/community/discovery";
import {
  notifyFriendsChanged,
  subscribeFriendsChanged,
} from "@/lib/community/friends-refresh";
import {
  attempt,
  failure,
  REPORT_MESSAGES,
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

  // COM1-2B. `useBlocks` is instantiated separately inside every
  // FriendActionMenu, so a block performed from one menu left every other
  // instance — and the drawer's Blocked tab — holding a pre-block set. Same
  // bus, same canonical re-read.
  useEffect(() => subscribeFriendsChanged(refresh), [refresh]);

  /**
   * COM1-2. Blocking is now ONE call to `public.block_profile`, which records
   * the block and removes every friendship row with that profile inside a
   * single transaction, holding a pair-scoped advisory lock.
   *
   * WHAT THIS REPLACES. The previous path was three separate round trips with
   * no transaction around them: insert the block, read the friendships, delete
   * them. COM1-1 made a failure between them VISIBLE — it could not make it
   * impossible, and said so. Two states were reachable:
   *
   *   - block written, unfriend lost  -> blocked and still listed as a friend
   *   - a friend request committing between the read and the delete survived
   *     the block entirely
   *
   * Both are now unreachable: the writes commit together, and
   * `enforce_friendship_rules` takes the same pair lock before its block test,
   * so a request and a block on one pair are serialised rather than crossing.
   */
  const blockUser = async (targetProfileId: string): Promise<SocialResult> => {
    const result = await blockProfile(targetProfileId);
    // COM1-2B. `block_profile` deletes the friendship rows too, so a block
    // invalidates FRIENDS as well as blocks. Signalling the shared bus is what
    // makes the blocked user leave the Friends list of every mounted view at
    // once, instead of only the one that happened to own the menu.
    await notifyFriendsChanged();
    return result;
  };

  /**
   * COM1-2. Unblocking restores eligibility to interact. It deliberately does
   * NOT recreate the friendship the block removed — see the RPC comment.
   */
  const unblockUser = async (targetProfileId: string): Promise<SocialResult> => {
    const result = await unblockProfile(targetProfileId);
    await notifyFriendsChanged();
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
