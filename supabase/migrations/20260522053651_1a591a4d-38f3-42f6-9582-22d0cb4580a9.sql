
-- 1. Comments: filter out hidden comments from public reads
DROP POLICY IF EXISTS "Comments are publicly readable" ON public.comments;

CREATE POLICY "Non-hidden comments are publicly readable"
ON public.comments
FOR SELECT
USING (
  COALESCE(is_hidden, false) = false
  AND COALESCE(hidden_by_admin, false) = false
);

-- Authors can still see their own comments (even if hidden)
CREATE POLICY "Users can view own comments"
ON public.comments
FOR SELECT
USING (public.is_profile_owner(profile_id));

-- Admins/moderators can see everything
CREATE POLICY "Admins can view all comments"
ON public.comments
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'moderator')
);

-- 2. Profiles: hide admin_notes and is_flagged_underage from regular reads
REVOKE SELECT (admin_notes, is_flagged_underage) ON public.profiles FROM anon, authenticated;

-- Admin-only RPC to read full profile rows (used by the admin panel)
CREATE OR REPLACE FUNCTION public.admin_list_profiles()
RETURNS SETOF public.profiles
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY SELECT * FROM public.profiles;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_profiles() TO authenticated;

-- 3. Feedback: hide admin_notes from the submitting user
REVOKE SELECT (admin_notes) ON public.feedback FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_feedback(_show_archived boolean DEFAULT false)
RETURNS SETOF public.feedback
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT * FROM public.feedback
    WHERE is_archived = _show_archived
    ORDER BY created_at DESC
    LIMIT 200;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_feedback(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_feedback(boolean) TO authenticated;
