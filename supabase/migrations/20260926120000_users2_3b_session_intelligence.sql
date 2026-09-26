-- USERS2.3B — browser session intelligence (migration only; not applied here).

ALTER TABLE public.analytics_sessions
  ADD COLUMN IF NOT EXISTS active_ms bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz,
  ADD COLUMN IF NOT EXISTS session_end_reason text,
  ADD COLUMN IF NOT EXISTS session_end_observed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_browser_boundary text,
  ADD COLUMN IF NOT EXISTS last_browser_boundary_observed_at timestamptz,
  ADD COLUMN IF NOT EXISTS frontend_release text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'analytics_sessions_active_ms_nonnegative') THEN
    ALTER TABLE public.analytics_sessions ADD CONSTRAINT analytics_sessions_active_ms_nonnegative
      CHECK (active_ms >= 0 AND active_ms <= 31536000000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'analytics_sessions_end_reason_known') THEN
    ALTER TABLE public.analytics_sessions ADD CONSTRAINT analytics_sessions_end_reason_known
      CHECK (session_end_reason IS NULL OR session_end_reason IN ('explicit_end', 'inactivity_timeout'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'analytics_sessions_browser_boundary_known') THEN
    ALTER TABLE public.analytics_sessions ADD CONSTRAINT analytics_sessions_browser_boundary_known
      CHECK (last_browser_boundary IS NULL OR last_browser_boundary IN ('page_hidden', 'pagehide'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'analytics_sessions_frontend_release_len') THEN
    ALTER TABLE public.analytics_sessions ADD CONSTRAINT analytics_sessions_frontend_release_len
      CHECK (frontend_release IS NULL OR length(frontend_release) <= 64);
  END IF;
END $$;

COMMENT ON COLUMN public.analytics_sessions.active_ms IS
  'Monotonic browser-reported milliseconds accumulated only while visible, focused, and not idle; not wall-clock duration.';
COMMENT ON COLUMN public.analytics_sessions.session_end_observed_at IS
  'Database receipt time when an explicit end or inactivity rollover became observable; not an exact exit timestamp.';
COMMENT ON COLUMN public.analytics_sessions.session_end_reason IS
  'Nullable derived/explicit end only. Browser lifecycle boundaries never populate this field.';
COMMENT ON COLUMN public.analytics_sessions.last_browser_boundary IS
  'Latest best-effort browser lifecycle observation; not proof that the session ended.';

-- Public clients retain no direct UPDATE privilege. This narrowly-scoped RPC
-- accepts only monotonic cumulative state for the UUID pair already recorded.
CREATE OR REPLACE FUNCTION public.analytics_record_session_activity(
  p_session_id uuid,
  p_visitor_id uuid,
  p_active_ms bigint,
  p_last_active_at timestamptz DEFAULT NULL,
  p_end_reason text DEFAULT NULL,
  p_browser_boundary text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE changed_rows integer;
BEGIN
  IF p_active_ms < 0 OR p_active_ms > 31536000000 THEN RETURN false; END IF;
  IF p_last_active_at IS NOT NULL AND p_last_active_at > now() + interval '5 minutes' THEN RETURN false; END IF;
  IF p_end_reason IS NOT NULL AND p_end_reason NOT IN ('explicit_end', 'inactivity_timeout') THEN
    RETURN false;
  END IF;
  IF p_browser_boundary IS NOT NULL AND p_browser_boundary NOT IN ('page_hidden', 'pagehide') THEN
    RETURN false;
  END IF;

  UPDATE public.analytics_sessions
     SET active_ms = greatest(active_ms, p_active_ms),
         last_active_at = CASE
           WHEN p_last_active_at IS NULL THEN last_active_at
           ELSE greatest(coalesce(last_active_at, p_last_active_at), p_last_active_at)
         END,
         session_end_reason = CASE
           WHEN p_end_reason IS NULL THEN session_end_reason
           ELSE p_end_reason
         END,
         session_end_observed_at = CASE
           WHEN p_end_reason IS NULL THEN session_end_observed_at
           ELSE now()
         END,
         last_browser_boundary = CASE
           WHEN p_browser_boundary IS NULL THEN last_browser_boundary
           ELSE p_browser_boundary
         END,
         last_browser_boundary_observed_at = CASE
           WHEN p_browser_boundary IS NULL THEN last_browser_boundary_observed_at
           ELSE now()
         END
   WHERE session_id = p_session_id
     AND visitor_id = p_visitor_id;
  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  RETURN changed_rows = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_record_session_activity(uuid, uuid, bigint, timestamptz, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.analytics_record_session_activity(uuid, uuid, bigint, timestamptz, text, text) TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.analytics_visitor_user_links (
  visitor_id uuid NOT NULL,
  user_id uuid NOT NULL,
  first_observed_at timestamptz NOT NULL DEFAULT now(),
  last_observed_at timestamptz NOT NULL DEFAULT now(),
  observation_count bigint NOT NULL DEFAULT 1,
  PRIMARY KEY (visitor_id, user_id),
  CONSTRAINT analytics_visitor_user_links_count_positive CHECK (observation_count > 0)
);

CREATE INDEX IF NOT EXISTS idx_analytics_visitor_user_links_user
  ON public.analytics_visitor_user_links (user_id, last_observed_at DESC);

ALTER TABLE public.analytics_visitor_user_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_visitor_user_links FROM anon, authenticated;

CREATE POLICY "Admins can read visitor user links"
  ON public.analytics_visitor_user_links FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.is_master_admin(auth.uid()));

-- user_id is never accepted from the browser. auth.uid() is the authority;
-- unauthenticated callers cannot link, and no anonymous Auth user is created.
CREATE OR REPLACE FUNCTION public.analytics_link_visitor_user(p_visitor_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = caller AND is_anonymous = true) THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.analytics_visitors WHERE visitor_id = p_visitor_id) THEN
    RETURN false;
  END IF;

  INSERT INTO public.analytics_visitor_user_links (visitor_id, user_id)
  VALUES (p_visitor_id, caller)
  ON CONFLICT (visitor_id, user_id) DO UPDATE
    SET last_observed_at = now(),
        observation_count = public.analytics_visitor_user_links.observation_count + 1;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_link_visitor_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.analytics_link_visitor_user(uuid) TO authenticated;
