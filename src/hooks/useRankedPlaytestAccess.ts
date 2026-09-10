// ---------------------------------------------------------------------------
// RB3 — may this viewer be OFFERED the guided playtest?
//
// A DIFFERENT QUESTION from `useRankedBotAccess`, and the difference is the
// whole point of the phase:
//
//   useRankedBotAccess       may this account use Bot Ranked?   (any Premium)
//   useRankedPlaytestAccess  is this account a playtester?      (a playtest
//                                                                grant only)
//
// Every playtester passes the first; almost nobody who passes the first passes
// this. An ordinary Premium subscriber must never be walked into a guided
// demonstration they did not ask for.
//
// No new mechanism: `profiles.pro_grant_kind` already carries exactly this
// value, PT1.4 already composes it, and `fetchProEntitlement` already returns
// it. This hook only asks the question.
//
// It GRANTS nothing. The server re-decides on every
// `POST /api/ranked/queue { preset: "playtest" }`. Loading, signed out, and a
// failed lookup all read false, so the entry is never drawn on a guess.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { fetchProEntitlement } from "@/lib/pro/entitlement";

export interface RankedPlaytestAccess {
  loading: boolean;
  /** Offer the guided playtest. */
  canPlayGuidedPlaytest: boolean;
}

export function useRankedPlaytestAccess(): RankedPlaytestAccess {
  const { isAdmin, loading: rolesLoading } = useAdminRoles();
  const [playtester, setPlaytester] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entitlement = await fetchProEntitlement();
      if (cancelled) return;
      // BOTH halves. A `playtest` grant kind on an account whose entitlement
      // is not actually in effect would describe a lapsed participation, and
      // the composition function nulls the kind in that case anyway — asking
      // for both is belt and braces, and it is what the server asks.
      setPlaytester(entitlement?.effectivePro === true
        && entitlement?.grantKind === "playtest");
    })();
    return () => { cancelled = true; };
  }, []);

  const loading = rolesLoading || playtester === null;
  return {
    loading,
    // Admin is the operator override, exactly as it is for bot access: staff
    // walk the sequence without minting themselves a grant.
    canPlayGuidedPlaytest: !loading && (isAdmin || playtester === true),
  };
}
