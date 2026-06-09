-- Hide internal admin-only profile columns from authenticated users.
-- Admins continue to access them via the SECURITY DEFINER `admin_list_profiles()` RPC,
-- and server-side triggers/functions are unaffected by column GRANTs.
REVOKE SELECT (admin_notes, is_flagged_underage) ON public.profiles FROM authenticated;
REVOKE SELECT (admin_notes, is_flagged_underage) ON public.profiles FROM anon;