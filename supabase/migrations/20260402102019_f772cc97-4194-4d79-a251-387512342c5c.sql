-- 1. Fix ad_events INSERT policy: validate profile_id ownership and event_type
DROP POLICY IF EXISTS "Users can insert ad events" ON public.ad_events;

CREATE POLICY "Users can insert own ad events"
  ON public.ad_events FOR INSERT TO authenticated
  WITH CHECK (
    (profile_id IS NULL OR is_profile_owner(profile_id))
    AND event_type IN ('impression', 'click', 'skip', 'cta_click')
  );

-- 2. Fix invite_links: remove broad authenticated SELECT that exposes admin-granting links
DROP POLICY IF EXISTS "Authenticated users can read active invite links" ON public.invite_links;

-- Only allow reading active links that do NOT grant admin/moderator privileges
-- Admin-granting links are only visible to admins (covered by "Admins can manage invite links" ALL policy)
CREATE POLICY "Users can read safe active invite links"
  ON public.invite_links FOR SELECT TO authenticated
  USING (
    is_active = true
    AND (grant_admin IS NOT TRUE)
    AND (grant_moderator IS NOT TRUE)
  );