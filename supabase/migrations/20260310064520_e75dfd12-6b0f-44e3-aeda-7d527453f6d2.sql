
-- 1. Storage policy: allow moderators to upload to profile-photos bucket
CREATE POLICY "Moderators can upload to profile-photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'profile-photos' AND
  has_role(auth.uid(), 'moderator'::app_role)
);

-- 2. Add grant_moderator column to invite_links
ALTER TABLE public.invite_links ADD COLUMN grant_moderator boolean DEFAULT false;
