-- Restrict SELECT on sensitive grant columns of invite_links from anon/authenticated.
-- Mirrors the column-level protection already applied to custom_links.
-- Admin reads should go through SECURITY DEFINER paths or service-role contexts.
REVOKE SELECT (grant_admin, grant_moderator, grant_pro, grant_diamonds, grant_boost_credits, grant_elo_shields, grant_reveals, grant_rewinds) ON public.invite_links FROM anon, authenticated;