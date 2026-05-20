-- Defense-in-depth: even though custom_links is admin-only via RLS,
-- explicitly revoke column-level SELECT on grant_* and admin-control columns
-- from non-admin roles so they remain protected if a permissive policy is
-- ever added in the future. The `resolve_custom_link` SECURITY DEFINER
-- function (used by public link resolution) returns only safe columns and
-- is unaffected by these revokes.

REVOKE SELECT (
  grant_pro,
  grant_diamonds,
  grant_boost_credits,
  grant_elo_shields,
  grant_reveals,
  grant_rewinds,
  grant_admin,
  grant_moderator,
  max_uses,
  times_used,
  expires_at,
  is_active,
  created_by_user_id
) ON public.custom_links FROM anon, authenticated;
