
-- Fix 1: Remove overly permissive public SELECT on profiles table
-- The public_profiles view already exists for public access, so direct table access should be restricted
DROP POLICY IF EXISTS "Public profiles readable" ON public.profiles;

-- Fix 2: Restrict admin_notifications INSERT to authenticated users only
DROP POLICY IF EXISTS "Anyone can insert notifications" ON public.admin_notifications;

CREATE POLICY "Authenticated users can insert notifications"
ON public.admin_notifications
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);
