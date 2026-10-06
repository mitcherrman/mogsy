-- SEC2-B: persist the production upload guard for user profile media.
-- Applied manually to production during the security review on 2026-10-06;
-- this migration makes rebuilds/new environments reproduce that state.
--
-- Existing objects are not modified. Future uploads are capped at 15 MiB and
-- restricted to the image MIME types the current profile editor supports.

UPDATE storage.buckets
SET file_size_limit = 15728640,
    allowed_mime_types = ARRAY[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif'
    ]::text[]
WHERE id = 'profile-photos';
