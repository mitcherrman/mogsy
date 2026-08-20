/**
 * LC1 — the signed-in account's own display identity, for surfaces that show
 * "this is you" (the Leaguecraft hub's personal column).
 *
 * Reads the SAME `profiles` row the rest of the app already treats as the
 * canonical display identity (display name + avatar), keyed by `user_id`.
 * It writes nothing, and it invents nothing: a guest, a missing row, or a
 * failed read all resolve to `null` fields, and the caller then renders its
 * signed-out state rather than a placeholder name.
 *
 * The account's email is deliberately never used as a fallback display name.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ProfileIdentity {
  loading: boolean;
  /** The account's chosen display name, or null when there isn't one. */
  displayName: string | null;
  /** The account's avatar URL, or null when it has none. */
  avatarUrl: string | null;
}

export function useProfileIdentity(userId: string | null | undefined): ProfileIdentity {
  const [state, setState] = useState<ProfileIdentity>({
    loading: !!userId,
    displayName: null,
    avatarUrl: null,
  });

  useEffect(() => {
    if (!userId) {
      setState({ loading: false, displayName: null, avatarUrl: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("user_id", userId)
          .maybeSingle();
        if (cancelled) return;
        setState({
          loading: false,
          displayName: data?.display_name?.trim() || null,
          avatarUrl: data?.avatar_url || null,
        });
      } catch {
        if (cancelled) return;
        // No identity to show is a normal state here, not a page failure.
        setState({ loading: false, displayName: null, avatarUrl: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return state;
}
