
-- Drop the overly permissive public SELECT policy on profile_photos
DROP POLICY IF EXISTS "Profile photos are publicly readable" ON public.profile_photos;

-- Create a new policy that requires authentication
CREATE POLICY "Authenticated users can view profile photos"
ON public.profile_photos
FOR SELECT
TO authenticated
USING (true);
