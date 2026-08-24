import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fetchLeagueProfiles } from "@/lib/league-profiles";
import {
  notifyFriendsChanged,
  subscribeFriendsChanged,
} from "@/lib/community/friends-refresh";
import { fetchRelationshipState } from "@/lib/community/discovery";
import type { Relationship } from "@/lib/community/relationship";
import {
  attempt,
  SEND_REQUEST_MESSAGES,
  type SocialResult,
} from "@/lib/community/social-result";

export type FriendStatus = "none" | "pending_sent" | "pending_received" | "friends" | "blocked";

interface FriendProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_pro: boolean | null;
  is_bot?: boolean | null;
  is_disabled?: boolean | null;
}

export interface FriendRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  created_at: string;
  profile: FriendProfile;
}

export function useFriends() {
  const { user } = useAuth();
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [pendingRequests, setPendingRequests] = useState<FriendRow[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Get my profile id
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

  // True until the FIRST read completes. Every later read is silent: this hook
  // is now driven by realtime and by a return-to-tab signal, and flipping
  // `loading` on a background refresh would flash "Loading..." over a list the
  // user is reading, or blank HomeFriendsSection mid-scroll.
  const hasLoadedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!myProfileId) return;
    if (!hasLoadedRef.current) setLoading(true);

    // Get blocked users to filter them out
    const { data: blockedRows } = await supabase
      .from("user_blocks")
      .select("blocked_profile_id")
      .eq("blocker_profile_id", myProfileId);
    const blockedIds = new Set((blockedRows || []).map(b => b.blocked_profile_id));

    const { data: rows } = await supabase
      .from("friendships")
      .select("*")
      .or(`requester_id.eq.${myProfileId},addressee_id.eq.${myProfileId}`);

    if (!rows) {
      setFriends([]);
      setPendingRequests([]);
      setSentRequests([]);
      hasLoadedRef.current = true;
      setLoading(false);
      return;
    }

    // Filter out blocked users
    const filteredRows = rows.filter(r => {
      const otherId = r.requester_id === myProfileId ? r.addressee_id : r.requester_id;
      return !blockedIds.has(otherId);
    });

    // Collect all other profile IDs from filtered rows
    const otherIds = filteredRows.map((r) =>
      r.requester_id === myProfileId ? r.addressee_id : r.requester_id
    );

    const profileMap = new Map<string, FriendProfile>();
    if (otherIds.length > 0) {
      // get_league_profiles, not public_profiles: the view is security_invoker,
      // so every other user's row resolved to zero rows and each friend fell
      // through to the "Unknown" placeholder below.
      const profiles = await fetchLeagueProfiles(otherIds);
      profiles.forEach((p) => {
        if (p.id) profileMap.set(p.id, p);
      });
    }

    const enriched = filteredRows.map((r) => {
      const otherId = r.requester_id === myProfileId ? r.addressee_id : r.requester_id;
      return {
        ...r,
        profile: profileMap.get(otherId) || {
          id: otherId,
          display_name: "Unknown",
          avatar_url: null,
          is_pro: false,
        },
      };
    });

    // A soft-disabled bot persona is withheld from this ordinary user-facing
    // list. The friendship ROW is untouched and reappears the moment the bot is
    // re-enabled — this hides the entry, it does not unfriend anything. Only a
    // profile we positively know is a disabled bot is dropped, so a genuinely
    // missing profile still falls through to the "Unknown" placeholder below
    // rather than silently vanishing.
    const visible = enriched.filter(
      (r) => !(r.profile.is_bot === true && r.profile.is_disabled === true),
    );

    setFriends(visible.filter((r) => r.status === "accepted"));
    setPendingRequests(
      visible.filter(
        (r) => r.status === "pending" &&r.addressee_id === myProfileId
      )
    );
    // Outgoing: requests this user sent that the other side has not answered.
    setSentRequests(
      visible.filter(
        (r) => r.status === "pending" &&r.requester_id === myProfileId
      )
    );
    hasLoadedRef.current = true;
    setLoading(false);
  }, [myProfileId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * The ONE invalidation path. Every source of "your friends may have changed"
   * arrives here: this hook's own mutations, another component's mutation, an
   * admin action, a realtime frame for a friendship or block row, and the
   * return-to-tab net. They all call `notifyFriendsChanged()` and this listener
   * re-reads from the server — no source ever hands this hook a row.
   *
   * COM1-2B. `useFriends` is a per-instance hook, so FloatingFriendsButton,
   * HomeFriendsSection, InvitePlayView and MultiplayerLobby each hold their own
   * copy of this state. Before this, only the instance that issued a mutation
   * refreshed; the rest showed the pre-mutation world until a page reload.
   */
  useEffect(() => subscribeFriendsChanged(refresh), [refresh]);

  /**
   * COM1-1 / P0-2. Every mutation below now REPORTS. They used to be
   * fire-and-forget `await supabase...` calls whose `{ error }` was discarded,
   * so a request refused by `enforce_friendship_rules` — a block, a rate
   * limit, an outstanding-request cap — was indistinguishable from one that
   * landed, and the UI showed neither a change nor a reason.
   *
   * COM1-2B. Each one now signals `notifyFriendsChanged()` rather than
   * refreshing only itself, so EVERY mounted social view re-reads — including
   * the other party's, once their realtime frame lands. The signal is awaited,
   * so the caller's own list is already correct when the promise resolves.
   *
   * It fires on every path, success or failure: a refusal often means the
   * caller's view is the thing that was wrong.
   */
  const sendRequest = async (targetProfileId: string): Promise<SocialResult> => {
    if (!myProfileId) return { ok: false, code: "unavailable", error: "Sign in to add friends." };
    const result = await attempt(
      () => supabase.from("friendships").insert({
        requester_id: myProfileId,
        addressee_id: targetProfileId,
      }),
      SEND_REQUEST_MESSAGES,
    );
    await notifyFriendsChanged();
    return result;
  };

  const acceptRequest = async (friendshipId: string): Promise<SocialResult> => {
    const result = await attempt(() =>
      supabase.from("friendships").update({ status: "accepted" }).eq("id", friendshipId));
    await notifyFriendsChanged();
    return result;
  };

  /**
   * Decline, cancel and remove are the SAME statement — a row delete — and are
   * named separately so each call site reads as its own intent. A delete that
   * matches nothing is not an error: the row is already gone, which is the end
   * state the caller asked for.
   */
  const deleteFriendship = async (friendshipId: string): Promise<SocialResult> => {
    const result = await attempt(() =>
      supabase.from("friendships").delete().eq("id", friendshipId));
    await notifyFriendsChanged();
    return result;
  };

  const declineRequest = (friendshipId: string) => deleteFriendship(friendshipId);
  const removeFriend = (friendshipId: string) => deleteFriendship(friendshipId);
  const cancelRequest = (friendshipId: string) => deleteFriendship(friendshipId);

  return {
    myProfileId,
    friends,
    pendingRequests,
    sentRequests,
    loading,
    sendRequest,
    acceptRequest,
    declineRequest,
    cancelRequest,
    removeFriend,
    refresh,
  };
}

/**
 * COM1-2. The A<->B state for one profile, read from
 * `public.get_relationship_state` instead of being re-derived in the client.
 *
 * WHAT WAS WRONG. This hook used to run two queries of its own: a `user_blocks`
 * lookup limited to blocks THIS user created, then `friendships` with
 * `rows[0]` and no ordering. It therefore could not see a block the other party
 * created — so the button read "Add Friend", the insert was refused by
 * `enforce_friendship_rules`, and (before COM1-1) nothing was reported. And
 * `rows[0]` is only deterministic while nothing writes 'declined'; the RPC uses
 * the M2 pair predicate, which is.
 *
 * The `blocked` state still means "I blocked them" and only that. A block the
 * OTHER party created is deliberately reported as `none` — the refusal happens
 * at the write and arrives as a neutral sentence.
 *
 * The `FriendStatus` names are preserved so existing call sites
 * (`/user/:profileId`) are untouched.
 */
export function useFriendStatus(targetProfileId: string | undefined) {
  const { user } = useAuth();
  const [status, setStatus] = useState<FriendStatus>("none");
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    if (!user || !targetProfileId) {
      setLoading(false);
      return;
    }
    const state = await fetchRelationshipState(targetProfileId);
    setFriendshipId(state.friendshipId);
    setStatus(RELATIONSHIP_TO_FRIEND_STATUS[state.relationship]);
    setLoading(false);
  }, [user, targetProfileId]);

  useEffect(() => {
    check();
  }, [check]);

  // COM1-2B. `/user/:profileId` is a long-lived page: the other party can
  // accept, decline or unfriend while it is open, and blocking from the menu on
  // this very page used to leave every OTHER social view stale. One signal, one
  // canonical re-read of `get_relationship_state` — the button text is never
  // derived from what we think we just did.
  useEffect(() => subscribeFriendsChanged(check), [check]);

  return { status, friendshipId, loading, refresh: check };
}

/**
 * The legacy `FriendStatus` union has no word for `self` or `unavailable`, and
 * both are states in which no friend action is offered. They map to "none"
 * for the status string; the call sites that matter (`/user/:profileId`)
 * already suppress the controls on your own profile by a separate check.
 */
const RELATIONSHIP_TO_FRIEND_STATUS: Record<Relationship, FriendStatus> = {
  none: "none",
  outgoing: "pending_sent",
  incoming: "pending_received",
  friends: "friends",
  blocked: "blocked",
  self: "none",
  unavailable: "none",
};
