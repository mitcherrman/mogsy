// ---------------------------------------------------------------------------
// useRankedBotAccess — may this viewer be OFFERED the Ranked bot option?
//
// Bot Ranked is canonical Ranked with a server-controlled opponent and no
// rating. It is offered to staff admins (operator override, invisible in copy)
// and to effectively-Premium accounts.
//
// This hook grants nothing. The backend re-decides authorization on every
// POST /api/ranked/queue — see docs/RANKED_BOT_WORKSTREAM_HANDOFF.md.
//
// TWO INDEPENDENT ROUTES TO YES
// -----------------------------
// Admin and Premium are separate answers, and admin does not pass through
// entitlement. Once the role read has landed and says admin, the control is
// offered immediately: no entitlement round trip is waited on, and an
// entitlement lookup that never answers — or that THROWS — cannot take staff
// access away. The operator override exists precisely for the case where the
// billing side of the system is the thing that is broken.
//
// For everyone else it fails CLOSED for VISIBILITY: loading, signed out, an
// unresolved lookup and a failed lookup all read `canPlayRankedBot: false`, so
// the control is never drawn on a guess and never flashes Premium-only access
// at an account that does not have it.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { fetchProEntitlement } from "@/lib/pro/entitlement";

export interface RankedBotAccess {
  /** True until an answer is known. Never treat as access. */
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
      let effective = false;
      try {
        const entitlement = await fetchProEntitlement();
        // A null answer is UNKNOWN, not Free — but both fail closed here.
        effective = entitlement?.effectivePro === true;
      } catch {
        // A REJECTED lookup is the same unknown as a null one. It must still
        // land, or `premium` stays null forever and the hook never leaves
        // loading — which is how an outage would silently hide the control
        // from everybody, admin included.
        effective = false;
      }
      if (!cancelled) setPremium(effective);
    })();
    return () => { cancelled = true; };
  }, []);

  // Admin identity is sufficient on its own, so it also ENDS the wait.
  const adminKnown = !rolesLoading && isAdmin;
  const loading = adminKnown ? false : rolesLoading || premium === null;
  return {
    loading,
    canPlayRankedBot: adminKnown || (!loading && premium === true),
    isAdmin,
  };
}
