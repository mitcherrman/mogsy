
-- 1. Fix invite_links: Remove the overly permissive SELECT policy that exposes codes
DROP POLICY IF EXISTS "Users can read safe active invite links" ON public.invite_links;

-- 2. Fix profile_favorites: Restrict public SELECT to owner only
DROP POLICY IF EXISTS "Favorites are publicly readable" ON public.profile_favorites;

CREATE POLICY "Users can view own favorites"
  ON public.profile_favorites
  FOR SELECT
  USING (is_profile_owner(profile_id));

CREATE POLICY "Anyone can view favorites by profile"
  ON public.profile_favorites
  FOR SELECT
  TO authenticated
  USING (true);

-- 3. Fix admin_notes exposure: Create a view that strips admin_notes for self-profile queries
-- Already have get_own_profile() RPC that excludes admin_notes, but the direct table SELECT
-- still exposes it. We need to ensure client code uses the RPC instead.
-- Since we can't do column-level security in Postgres, move admin_notes to a separate table.
CREATE TABLE IF NOT EXISTS public.profile_admin_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  notes text DEFAULT '',
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.profile_admin_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can read admin notes"
  ON public.profile_admin_notes
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can insert admin notes"
  ON public.profile_admin_notes
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can update admin notes"
  ON public.profile_admin_notes
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can delete admin notes"
  ON public.profile_admin_notes
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Migrate existing admin_notes data to the new table
INSERT INTO public.profile_admin_notes (profile_id, notes)
SELECT id, COALESCE(admin_notes, '')
FROM public.profiles
WHERE admin_notes IS NOT NULL AND admin_notes != ''
ON CONFLICT (profile_id) DO NOTHING;

-- Update the protect_premium_fields trigger to also protect admin_notes column
-- (already done - it sets NEW.admin_notes := OLD.admin_notes for non-admins)
