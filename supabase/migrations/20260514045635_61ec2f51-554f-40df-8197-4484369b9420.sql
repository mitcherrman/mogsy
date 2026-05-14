-- 1. Tighten image_clicks INSERT policy
DROP POLICY IF EXISTS "Users can insert image clicks" ON public.image_clicks;
CREATE POLICY "Users can insert own image clicks"
ON public.image_clicks
FOR INSERT
TO authenticated
WITH CHECK (
  profile_id IS NULL OR is_profile_owner(profile_id)
);

-- 2. Custom links: restrict public SELECT to non-grant columns via a view
DROP POLICY IF EXISTS "Anyone can read active custom links" ON public.custom_links;

-- Admins still have full access via existing "Admins can manage custom links" policy.
-- Authenticated/anon users use the public view below.

CREATE OR REPLACE VIEW public.custom_links_public
WITH (security_invoker = true) AS
SELECT
  id,
  slug,
  destination_type,
  league_id,
  recommended_categories,
  recommended_league_ids,
  default_theme,
  default_swipe_animation,
  label,
  is_active,
  visits,
  created_at
FROM public.custom_links
WHERE is_active = true;

-- The view itself relies on a base-table policy to be readable; add a minimal SELECT policy
-- that only returns rows when accessed through the view's column set is not enforceable, so
-- instead we add a policy returning is_active rows but the view filters which columns are
-- exposed. To prevent direct table SELECT of grant_* fields, restrict table SELECT to admins
-- only and have anon/authenticated read through the view (which uses security_invoker, so
-- it still requires a base policy). We add a dedicated policy for the view's needs:
CREATE POLICY "Active custom links readable for resolution"
ON public.custom_links
FOR SELECT
TO anon, authenticated
USING (is_active = true);

-- NOTE: The above policy still allows direct selection of grant_* columns from the table.
-- To truly hide them, we revoke column-level SELECT on the sensitive grant columns from
-- anon/authenticated and grant SELECT only on the safe columns.
REVOKE SELECT ON public.custom_links FROM anon, authenticated;
GRANT SELECT (
  id, slug, destination_type, league_id,
  recommended_categories, recommended_league_ids,
  default_theme, default_swipe_animation,
  label, is_active, visits, created_at, created_by_user_id
) ON public.custom_links TO anon, authenticated;

-- Grant access to the public view
GRANT SELECT ON public.custom_links_public TO anon, authenticated;

-- 3. Invite redemptions: allow redeemer to read own rows + prevent duplicate redemptions
CREATE POLICY "Users can view own redemptions"
ON public.invite_redemptions
FOR SELECT
TO authenticated
USING (auth.uid() = redeemed_by_user_id);

-- Deduplicate any existing duplicates before adding unique constraint
DELETE FROM public.invite_redemptions a
USING public.invite_redemptions b
WHERE a.ctid < b.ctid
  AND a.invite_link_id = b.invite_link_id
  AND a.redeemed_by_user_id = b.redeemed_by_user_id;

ALTER TABLE public.invite_redemptions
  ADD CONSTRAINT invite_redemptions_unique_redeemer
  UNIQUE (invite_link_id, redeemed_by_user_id);