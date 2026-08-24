// ---------------------------------------------------------------------------
// COM1-2B — mounts live social synchronisation for the signed-in account.
//
// Mounted ONCE, from Layout, because Layout is the only shell component that is
// always present: the Community drawer is suppressed on Stat Check surfaces and
// the HUD bell renders only for a full account, so neither can own the
// subscription. `startSocialRealtime` is reference-counted anyway, so a second
// mount would share the topic rather than duplicate it.
//
// TWO SIGNALS, ONE BUS.
//
//   1. Realtime (primary) — see lib/community/social-realtime.ts.
//   2. Return-to-tab (net) — a browser that was asleep, offline, or throttled in
//      a background tab can miss a realtime frame entirely, and the socket
//      resubscribes without replaying what it missed. Re-reading when the tab
//      becomes visible again costs one query and closes that hole. It is rate
//      limited so alt-tabbing is not a query storm.
//
// Anonymous sessions are excluded: `friendships` and `user_blocks` are both RLS
// scoped to a profile, and an anonymous visitor has no social state to keep in
// sync.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { notifyFriendsChanged } from "@/lib/community/friends-refresh";
import { startSocialRealtime } from "@/lib/community/social-realtime";

/** Shortest gap between two return-to-tab re-reads. */
export const REFOCUS_THROTTLE_MS = 5_000;

export function useSocialSync(): void {
  const { user } = useAuth();
  const [profileId, setProfileId] = useState<string | null>(null);

  // Resolve the caller's own public profile id. Cleared on sign-out and on an
  // account switch, so the previous account's channel is released before a new
  // one is opened rather than lingering under the new session.
  useEffect(() => {
    if (!user) {
      setProfileId(null);
      return;
    }
    let cancelled = false;
    void supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setProfileId(data?.id ?? null);
      });
    return () => {
      cancelled = true;
      setProfileId(null);
    };
  }, [user]);

  useEffect(() => {
    if (!profileId) return;
    return startSocialRealtime(profileId);
  }, [profileId]);

  const lastRefocusRef = useRef(0);
  useEffect(() => {
    if (!profileId) return;
    const onWake = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRefocusRef.current < REFOCUS_THROTTLE_MS) return;
      lastRefocusRef.current = now;
      void notifyFriendsChanged();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [profileId]);
}
