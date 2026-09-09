// ---------------------------------------------------------------------------
// useRankedBotAccess — may this viewer be OFFERED the Ranked bot option?
//
// Bot Ranked is canonical Ranked with a server-controlled opponent and no
// rating. It is offered to staff admins (operator override, invisible in copy)
// and to effectively-Premium accounts.
//
// This hook grants nothing. The backend re-decides authorization on every
// POST /api/ranked/queue, and it currently still rejects non-admin
// match_with_bot — see docs/RANKED_BOT_WORKSTREAM_HANDOFF.md.
//
// It fails CLOSED for VISIBILITY: loading, signed out, and a failed
// entitlement lookup all read `canPlayRankedBot: false`, so the control is
// never drawn on a guess.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { fetchProEntitlement } from "@/lib/pro/entitlement";

export interface RankedBotAccess {
  /** True until both answers are known. Never treat as access. */
  loading: boolean;
  /** Offer the Match with Bot control. */
  canPlayRankedBot: boolean;
  /** Whether access comes from staff role (kept out of user-facing copy). */
  isAdmin: boolean;
}

export function useRankedBotAccess(): RankedBotAccess {
  const { isAdmin, loading: rolesLoading } = useAdminRoles();
  const [premium, setPremium] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entitlement = await fetchProEntitlement();
      if (cancelled) return;
      // A null answer is UNKNOWN, not Free — but both fail closed here.
      setPremium(entitlement?.effectivePro === true);
    })();
    return () => { cancelled = true; };
  }, []);

  const loading = rolesLoading || premium === null;
  return {
    loading,
    canPlayRankedBot: !loading && (isAdmin || premium === true),
    isAdmin,
  };
}
