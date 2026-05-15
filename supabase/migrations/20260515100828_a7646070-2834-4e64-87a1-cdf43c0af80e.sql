-- Lock down listing on public storage buckets.
-- Files remain accessible via their public CDN URLs (bucket.public=true) but cannot be enumerated via the storage API.

DROP POLICY IF EXISTS "Anyone can view profile photos" ON storage.objects;
DROP POLICY IF EXISTS "Animation assets are publicly readable" ON storage.objects;