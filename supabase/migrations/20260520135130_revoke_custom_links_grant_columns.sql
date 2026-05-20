-- Defense-in-depth: explicitly revoke column-level SELECT on grant_* and
-- admin-control columns from non-admin roles. custom_links is already
-- admin-only via RLS; this ensures grant columns stay protected if a
-- permissive SELECT policy is ever added in the future. The
-- resolve_custom_link() SECURITY DEFINER function returns only safe
-- columns and is unaffected.
REVOKE SELECT (
  grant_pro,
  grant_diamonds,
  created_by_user_id
) ON public.custom_links FROM anon, authenticated;
