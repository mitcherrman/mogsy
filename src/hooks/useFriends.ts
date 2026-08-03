import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fetchLeagueProfiles } from "@/lib/league-profiles";
import { subscribeFriendsChanged } from "@/lib/community/friends-refresh";

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

  const refresh = useCallback(async () => {
    if (!myProfileId) return;
    setLoading(true);

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
    setLoading(false);
  }, [myProfileId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // An admin action can create a friendship from a surface far away from this
  // hook. Subscribe to the explicit in-page signal so the drawer updates
  // immediately rather than waiting on the friendships realtime subscription.
  useEffect(() => subscribeFriendsChanged(() => void refresh()), [refresh]);

  const sendRequest = async (targetProfileId: string) => {
    if (!myProfileId) return;
    await supabase.from("friendships").insert({
      requester_id: myProfileId,
      addressee_id: targetProfileId,
    });
    await refresh();
  };

  const acceptRequest = async (friendshipId: string) => {
    await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", friendshipId);
    await refresh();
  };

  const declineRequest = async (friendshipId: string) => {
    await supabase.from("friendships").delete().eq("id", friendshipId);
    await refresh();
  };

  const removeFriend = async (friendshipId: string) => {
    await supabase.from("friendships").delete().eq("id", friendshipId);
    await refresh();
  };

  /** Withdraw a request this user sent. Same row delete as decline/remove,
   *  named separately so the drawer's intent is readable at the call site. */
  const cancelRequest = async (friendshipId: string) => {
    await supabase.from("friendships").delete().eq("id", friendshipId);
    await refresh();
  };

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

    const { data: myProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!myProfile) {
      setLoading(false);
      return;
    }

    const me = myProfile.id;

    // Check if blocked
    const { data: blockedRow } = await supabase
      .from("user_blocks")
      .select("id")
      .eq("blocker_profile_id", me)
      .eq("blocked_profile_id", targetProfileId)
      .maybeSingle();

    if (blockedRow) {
      setStatus("blocked");
      setFriendshipId(null);
      setLoading(false);
      return;
    }

    const { data: rows } = await supabase
      .from("friendships")
      .select("*")
      .or(
        `and(requester_id.eq.${me},addressee_id.eq.${targetProfileId}),and(requester_id.eq.${targetProfileId},addressee_id.eq.${me})`
      );

    if (!rows || rows.length === 0) {
      setStatus("none");
      setFriendshipId(null);
    } else {
      const row = rows[0];
      setFriendshipId(row.id);
      if (row.status === "accepted") {
        setStatus("friends");
      } else if (row.requester_id === me) {
        setStatus("pending_sent");
      } else {
        setStatus("pending_received");
      }
    }
    setLoading(false);
  }, [user, targetProfileId]);

  useEffect(() => {
    check();
  }, [check]);

  return { status, friendshipId, loading, refresh: check };
}
