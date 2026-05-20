
-- 1) Remove leftover broad realtime SELECT policy
DROP POLICY IF EXISTS "Authenticated can read realtime messages" ON realtime.messages;

-- 2) Restrict invite_links owner reads; expose safe RPC for referral code
DROP POLICY IF EXISTS "Users can read own invite links" ON public.invite_links;

CREATE OR REPLACE FUNCTION public.get_my_referral_code()
RETURNS TABLE(code text, times_used integer, is_active boolean, created_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT il.code, COALESCE(il.times_used, 0), COALESCE(il.is_active, true), il.created_at
  FROM public.invite_links il
  WHERE il.created_by_user_id = auth.uid()
    AND il.type = 'user'
  ORDER BY il.created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_referral_code() TO authenticated;

-- 3) Hide legacy admin_notes column on profiles from clients
REVOKE SELECT (admin_notes) ON public.profiles FROM authenticated, anon;
