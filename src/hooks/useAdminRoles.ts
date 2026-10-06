// ---------------------------------------------------------------------------
// useAdminRoles — DEPRECATED compatibility shim (OWN1).
//
// The admin/master_admin/moderator hierarchy is retired: there is one owner.
// Existing callers keep compiling, but every flag now derives from the
// server-side owner check. `isModerator` is always false (no separate tier),
// and `roles` no longer reflects user_roles (which grants nothing). Delete
// once remaining callers read useAdminAuthority directly.
// ---------------------------------------------------------------------------

import { useAdminAuthority } from "@/hooks/useAdminAuthority";

export interface AdminRoleState {
  loading: boolean;
  roles: string[];
  isAdmin: boolean;
  isMasterAdmin: boolean;
  isModerator: boolean;
}

export function useAdminRoles(): AdminRoleState {
  const { loading, isAdmin } = useAdminAuthority();
  return {
    loading,
    roles: isAdmin ? ["owner"] : [],
    isAdmin,
    isMasterAdmin: isAdmin,
    isModerator: false,
  };
}
