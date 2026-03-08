CREATE POLICY "Admins can upload to profile-photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-photos'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can delete from profile-photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);