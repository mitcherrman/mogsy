import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type FriendStatus = "none" | "pending_sent" | "pending_received" | "friends" | "blocked";

interface FriendProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_pro: boolean | null;
  is_bot?: boolean | null;
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

    let profileMap = new Map<string, FriendProfile>();
    if (otherIds.length > 0) {
      const { data: profiles } = await supabase
        .from("public_profiles")
        .select("id, display_name, avatar_url, is_pro")
        .in("id", otherIds);
      if (profiles) {
        profiles.forEach((p) => {
          if (p.id) profileMap.set(p.id, p as FriendProfile);
        });
      }
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

    setFriends(enriched.filter((r) => r.status === "accepted"));
    setPendingRequests(
      enriched.filter(
        (r) => r.status === "pending" && r.addressee_id === myProfileId
      )
    );
    setLoading(false);
  }, [myProfileId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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

  return {
    myProfileId,
    friends,
    pendingRequests,
    loading,
    sendRequest,
    acceptRequest,
    declineRequest,
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
