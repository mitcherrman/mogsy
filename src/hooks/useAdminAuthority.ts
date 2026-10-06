// ---------------------------------------------------------------------------
// useAdminAuthority — "is the current viewer the owner, on a trusted session?"
//
// OWN1: there is one privileged account. The answer comes from the server's
// owner_auth_state() (via useOwnerAuth), never from user_roles, a profile
// column, or browser storage. It grants nothing and fails CLOSED.
// ---------------------------------------------------------------------------

import { useOwnerAuth } from "@/hooks/useOwnerAuth";

export interface AdminAuthorityState {
  /** True until the server has answered. Never treat as authorized. */
  loading: boolean;
  /** Server-confirmed owner on a trusted (aal2 / attested-device) session. */
  isAdmin: boolean;
}

export function useAdminAuthority(): AdminAuthorityState {
  const o = useOwnerAuth();
  return { loading: o.loading, isAdmin: !o.loading && o.isOwner && o.authorized };
}
