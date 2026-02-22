-- Remove public SELECT policy on profiles table to prevent sensitive field exposure
DROP POLICY IF EXISTS "Public profiles readable" ON public.profiles;