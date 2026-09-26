-- PLAY1 — Playtest Director foundation.
--
-- Four tables, and nothing else, per docs/PLAYTEST_DIRECTOR_HANDOFF.md §3:
--
--   playtest_cohorts         durable cohort + its invitation capability
--   playtest_enrollments     one tester in one cohort (+ a HOST-FACING
--                            progress projection, never an analytical source)
--   playtest_director_state  THE authoritative presentation state, one row per
--                            cohort, published to Realtime
--   playtest_feedback        structured answers, one per enrollment × prompt
--
-- Telemetry stays in analytics_events. Daily results stay in the canonical
-- Daily/Ranked persistence on Railway — nothing here copies Daily truth.
-- Presence is transient (PLAY2) and payment truth is Stripe/Premium's (PLAY2+).
--
-- Applied by hand through the Lovable Cloud SQL editor, like every other
-- migration here. It is purely additive: no existing table, policy or function
-- is touched, so it is invisible to a frontend that does not yet use it.
-- APPLY BEFORE shipping a frontend that routes /playtest/:slug.
--
--
-- AUTHORITY MODEL
--
-- Every write is a SECURITY DEFINER function. Browsers get SELECT only, and
-- only through RLS. That is what makes each rule below un-forgeable:
--
--   · enrollment requires the invitation slug (≈244 random bits), is derived
--     from auth.uid(), refuses anonymous sessions and is idempotent;
--   · only has_role(…,'admin') can create cohorts or move the Director, and
--     the Director moves by compare-and-set on `revision`, so a stale or
--     repeated host click is a no-op rather than a double advance;
--   · a tester can report progress and feedback only for their own enrollment.
--
-- A postgres_changes DELETE bypasses RLS filtering in Realtime, so nothing in
-- this model attaches meaning to deletes; state moves by UPDATE.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.playtest_cohorts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The invitation capability. Generated server-side from two v4 UUIDs
  -- (≈244 random bits); never sequential, never client-chosen.
  invite_slug      text NOT NULL UNIQUE
                     CHECK (invite_slug ~ '^[a-z0-9]{32,64}$'),
  name             text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  -- Identity of the CODE-OWNED manifest the cohort runs
  -- (src/features/playtest-director/manifest.ts). Not a copy of it.
  manifest_id      text NOT NULL CHECK (manifest_id ~ '^[a-z][a-z0-9_]{2,63}$'),
  manifest_version integer NOT NULL CHECK (manifest_version >= 1),
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.playtest_director_state (
  cohort_id   uuid PRIMARY KEY REFERENCES public.playtest_cohorts(id) ON DELETE CASCADE,
  scene_id    text NOT NULL CHECK (scene_id ~ '^[a-z][a-z0-9_]{1,63}$'),
  build_step  integer NOT NULL DEFAULT 0 CHECK (build_step BETWEEN 0 AND 100),
  revision    bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.playtest_enrollments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id           uuid NOT NULL REFERENCES public.playtest_cohorts(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- HOST-FACING PROJECTION. Monotonic; see playtest_report_progress.
  status              text NOT NULL DEFAULT 'joined'
                        CHECK (status IN ('joined', 'in_gameplay', 'checkpoint_reached',
                                          'feedback_submitted', 'completed')),
  -- Canonical browser correlation at join (FUNNEL1/USERS2 ids). Join keys into
  -- analytics_events only; they authorize nothing.
  visitor_id          uuid,
  session_id          uuid,
  -- Daily IDENTITY plus a display-only cache of the last observed snapshot.
  -- The authority is Railway's daily_runs; nothing reads these analytically.
  daily_run_id        text CHECK (daily_run_id IS NULL OR char_length(daily_run_id) <= 128),
  daily_plan_date     date,
  daily_run_status    text CHECK (daily_run_status IS NULL OR daily_run_status IN ('active', 'completed')),
  daily_stage_index   integer CHECK (daily_stage_index IS NULL OR daily_stage_index BETWEEN 0 AND 20),
  daily_stage_status  text CHECK (daily_stage_status IS NULL OR daily_stage_status ~ '^[a-z_]{1,32}$'),
  progress_scene_id   text CHECK (progress_scene_id IS NULL OR progress_scene_id ~ '^[a-z][a-z0-9_]{1,63}$'),
  progress_updated_at timestamptz,
  joined_at           timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT playtest_enrollments_one_per_cohort UNIQUE (cohort_id, user_id)
);

CREATE INDEX IF NOT EXISTS playtest_enrollments_user_idx
  ON public.playtest_enrollments (user_id);

CREATE TABLE IF NOT EXISTS public.playtest_feedback (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id     uuid NOT NULL REFERENCES public.playtest_cohorts(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES public.playtest_enrollments(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt_key    text NOT NULL CHECK (prompt_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  scene_id      text NOT NULL CHECK (scene_id ~ '^[a-z][a-z0-9_]{1,63}$'),
  response      jsonb NOT NULL
                  CHECK (jsonb_typeof(response) = 'object' AND length(response::text) <= 4096),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT playtest_feedback_one_per_prompt UNIQUE (enrollment_id, prompt_key)
);

CREATE INDEX IF NOT EXISTS playtest_feedback_cohort_idx
  ON public.playtest_feedback (cohort_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Privileges and RLS — browsers READ through RLS, WRITE through functions
-- ---------------------------------------------------------------------------

ALTER TABLE public.playtest_cohorts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playtest_director_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playtest_enrollments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playtest_feedback       ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.playtest_cohorts, public.playtest_director_state,
              public.playtest_enrollments, public.playtest_feedback
  FROM anon, authenticated;
GRANT SELECT ON public.playtest_cohorts, public.playtest_director_state,
                public.playtest_enrollments, public.playtest_feedback
  TO authenticated;

DROP POLICY IF EXISTS "Admins read playtest cohorts" ON public.playtest_cohorts;
-- Cohorts (which carry the invitation slug) are admin-only. A tester learns
-- the participant-safe subset from playtest_join's return value.
CREATE POLICY "Admins read playtest cohorts" ON public.playtest_cohorts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Enrolled testers and admins read director state" ON public.playtest_director_state;
-- The Realtime postgres_changes filter relies on this same policy.
CREATE POLICY "Enrolled testers and admins read director state" ON public.playtest_director_state
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.playtest_enrollments e
      WHERE e.cohort_id = playtest_director_state.cohort_id
        AND e.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Own enrollment or admin" ON public.playtest_enrollments;
CREATE POLICY "Own enrollment or admin" ON public.playtest_enrollments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Own playtest feedback or admin" ON public.playtest_feedback;
CREATE POLICY "Own playtest feedback or admin" ON public.playtest_feedback
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- No INSERT / UPDATE / DELETE policy exists on any of the four tables, and no
-- such privilege is granted: every write below is a SECURITY DEFINER function.

-- ---------------------------------------------------------------------------
-- 3. Admin: create a cohort (and its director row) atomically
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.playtest_create_cohort(
  p_name text,
  p_manifest_id text,
  p_manifest_version integer,
  p_initial_scene_id text
)
RETURNS public.playtest_cohorts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  cohort public.playtest_cohorts;
BEGIN
  IF caller IS NULL OR NOT public.has_role(caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'playtest_admin_required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.playtest_cohorts (invite_slug, name, manifest_id, manifest_version, created_by)
  VALUES (
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
    btrim(p_name), p_manifest_id, p_manifest_version, caller
  )
  RETURNING * INTO cohort;

  INSERT INTO public.playtest_director_state (cohort_id, scene_id, build_step, revision, updated_by)
  VALUES (cohort.id, p_initial_scene_id, 0, 0, caller);

  RETURN cohort;
END;
$$;

CREATE OR REPLACE FUNCTION public.playtest_set_cohort_status(p_cohort_id uuid, p_status text)
RETURNS public.playtest_cohorts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cohort public.playtest_cohorts;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'playtest_admin_required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.playtest_cohorts SET status = p_status, updated_at = now()
  WHERE id = p_cohort_id
  RETURNING * INTO cohort;
  IF cohort.id IS NULL THEN
    RAISE EXCEPTION 'playtest_cohort_not_found';
  END IF;
  RETURN cohort;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Admin: advance the Director — compare-and-set on revision
-- ---------------------------------------------------------------------------
-- The browser computes the TARGET (scene_id, build_step) from the code-owned
-- manifest; the database guarantees ORDER. Exactly one caller holding
-- expected_revision = N can move the row to N+1. Every other caller — a stale
-- tab, a double click, a retried request — gets applied = false and the
-- current row, and nothing changes.

CREATE OR REPLACE FUNCTION public.playtest_director_advance(
  p_cohort_id uuid,
  p_expected_revision bigint,
  p_scene_id text,
  p_build_step integer
)
RETURNS TABLE (applied boolean, scene_id text, build_step integer, revision bigint, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  moved public.playtest_director_state;
BEGIN
  IF caller IS NULL OR NOT public.has_role(caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'playtest_admin_required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.playtest_director_state d
     SET scene_id = p_scene_id,
         build_step = p_build_step,
         revision = d.revision + 1,
         updated_by = caller,
         updated_at = now()
   WHERE d.cohort_id = p_cohort_id
     AND d.revision = p_expected_revision
  RETURNING d.* INTO moved;

  IF moved.cohort_id IS NOT NULL THEN
    RETURN QUERY SELECT true, moved.scene_id, moved.build_step, moved.revision, moved.updated_at;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.playtest_director_state d WHERE d.cohort_id = p_cohort_id) THEN
    RAISE EXCEPTION 'playtest_cohort_not_found';
  END IF;

  RETURN QUERY
    SELECT false, d.scene_id, d.build_step, d.revision, d.updated_at
      FROM public.playtest_director_state d
     WHERE d.cohort_id = p_cohort_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Tester: join (create-or-resume) by invitation
-- ---------------------------------------------------------------------------
-- The ONLY way to become enrolled. The caller proves possession of the slug;
-- the user id comes from auth.uid(), never from the request. An unknown slug
-- and a cohort closed to NEW testers fail identically, so the RPC is not an
-- oracle for which slugs exist. An existing enrollee may resume a closed
-- cohort. Repeated calls return the same enrollment.

CREATE OR REPLACE FUNCTION public.playtest_join(
  p_invite_slug text,
  p_visitor_id uuid DEFAULT NULL,
  p_session_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  cohort public.playtest_cohorts;
  enrollment public.playtest_enrollments;
  created boolean := false;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'playtest_account_required' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = caller AND is_anonymous = true) THEN
    RAISE EXCEPTION 'playtest_account_required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO cohort FROM public.playtest_cohorts WHERE invite_slug = p_invite_slug;
  IF cohort.id IS NULL THEN
    RAISE EXCEPTION 'playtest_invitation_invalid';
  END IF;

  SELECT * INTO enrollment FROM public.playtest_enrollments
   WHERE cohort_id = cohort.id AND user_id = caller;

  IF enrollment.id IS NULL THEN
    IF cohort.status <> 'open' THEN
      RAISE EXCEPTION 'playtest_invitation_invalid';
    END IF;
    INSERT INTO public.playtest_enrollments (cohort_id, user_id, visitor_id, session_id)
    VALUES (cohort.id, caller, p_visitor_id, p_session_id)
    ON CONFLICT (cohort_id, user_id) DO NOTHING
    RETURNING * INTO enrollment;
    IF enrollment.id IS NULL THEN
      -- Lost a race with our own concurrent join: resume the winner.
      SELECT * INTO enrollment FROM public.playtest_enrollments
       WHERE cohort_id = cohort.id AND user_id = caller;
    ELSE
      created := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'cohort_id', cohort.id,
    'cohort_name', cohort.name,
    'cohort_status', cohort.status,
    'manifest_id', cohort.manifest_id,
    'manifest_version', cohort.manifest_version,
    'enrollment_id', enrollment.id,
    'enrollment_status', enrollment.status,
    'created', created,
    'answered_prompt_keys', COALESCE((
      SELECT jsonb_agg(f.prompt_key ORDER BY f.created_at)
        FROM public.playtest_feedback f WHERE f.enrollment_id = enrollment.id
    ), '[]'::jsonb)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Tester: report the host-facing progress projection
-- ---------------------------------------------------------------------------
-- Own enrollment only. Status is monotonic (a late or duplicated report never
-- moves a tester backwards); the Daily fields are a last-observed display
-- cache and simply overwrite. None of this is gameplay truth.

CREATE OR REPLACE FUNCTION public.playtest_status_rank(p_status text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_status
    WHEN 'joined' THEN 0
    WHEN 'in_gameplay' THEN 1
    WHEN 'checkpoint_reached' THEN 2
    WHEN 'feedback_submitted' THEN 3
    WHEN 'completed' THEN 4
  END
$$;

CREATE OR REPLACE FUNCTION public.playtest_report_progress(
  p_enrollment_id uuid,
  p_status text,
  p_scene_id text DEFAULT NULL,
  p_daily_run_id text DEFAULT NULL,
  p_daily_plan_date date DEFAULT NULL,
  p_daily_run_status text DEFAULT NULL,
  p_daily_stage_index integer DEFAULT NULL,
  p_daily_stage_status text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_status text;
BEGIN
  IF public.playtest_status_rank(p_status) IS NULL THEN
    RAISE EXCEPTION 'playtest_status_invalid';
  END IF;

  SELECT status INTO current_status FROM public.playtest_enrollments
   WHERE id = p_enrollment_id AND user_id = auth.uid()
   FOR UPDATE;
  IF current_status IS NULL THEN
    RAISE EXCEPTION 'playtest_enrollment_not_found' USING ERRCODE = '42501';
  END IF;

  UPDATE public.playtest_enrollments SET
    status = CASE WHEN public.playtest_status_rank(p_status) > public.playtest_status_rank(status)
                  THEN p_status ELSE status END,
    progress_scene_id  = COALESCE(p_scene_id, progress_scene_id),
    daily_run_id       = COALESCE(p_daily_run_id, daily_run_id),
    daily_plan_date    = COALESCE(p_daily_plan_date, daily_plan_date),
    daily_run_status   = COALESCE(p_daily_run_status, daily_run_status),
    daily_stage_index  = COALESCE(p_daily_stage_index, daily_stage_index),
    daily_stage_status = COALESCE(p_daily_stage_status, daily_stage_status),
    progress_updated_at = now(),
    updated_at = now()
  WHERE id = p_enrollment_id
  RETURNING status INTO current_status;

  RETURN current_status;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Tester: submit one structured feedback answer
-- ---------------------------------------------------------------------------
-- One answer per (enrollment, prompt). The first answer stands; a repeat
-- submit is a harmless no-op that reports created = false.

CREATE OR REPLACE FUNCTION public.playtest_submit_feedback(
  p_enrollment_id uuid,
  p_prompt_key text,
  p_scene_id text,
  p_response jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  enrollment public.playtest_enrollments;
  new_id uuid;
BEGIN
  SELECT * INTO enrollment FROM public.playtest_enrollments
   WHERE id = p_enrollment_id AND user_id = auth.uid();
  IF enrollment.id IS NULL THEN
    RAISE EXCEPTION 'playtest_enrollment_not_found' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.playtest_feedback (cohort_id, enrollment_id, user_id, prompt_key, scene_id, response)
  VALUES (enrollment.cohort_id, enrollment.id, enrollment.user_id, p_prompt_key, p_scene_id, p_response)
  ON CONFLICT (enrollment_id, prompt_key) DO NOTHING
  RETURNING id INTO new_id;

  IF public.playtest_status_rank('feedback_submitted') > public.playtest_status_rank(enrollment.status) THEN
    UPDATE public.playtest_enrollments
       SET status = 'feedback_submitted', progress_scene_id = p_scene_id,
           progress_updated_at = now(), updated_at = now()
     WHERE id = enrollment.id;
  END IF;

  RETURN jsonb_build_object('created', new_id IS NOT NULL, 'prompt_key', p_prompt_key);
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Admin: the Director roster (enrollments + display names + feedback)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.playtest_admin_roster(p_cohort_id uuid)
RETURNS TABLE (
  enrollment_id uuid, user_id uuid, display_name text, status text,
  progress_scene_id text, daily_run_id text, daily_plan_date date,
  daily_run_status text, daily_stage_index integer, daily_stage_status text,
  progress_updated_at timestamptz, joined_at timestamptz, feedback jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'playtest_admin_required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT e.id, e.user_id,
           (SELECT p.display_name FROM public.profiles p WHERE p.user_id = e.user_id LIMIT 1),
           e.status, e.progress_scene_id, e.daily_run_id, e.daily_plan_date,
           e.daily_run_status, e.daily_stage_index, e.daily_stage_status,
           e.progress_updated_at, e.joined_at,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'prompt_key', f.prompt_key, 'scene_id', f.scene_id,
                      'response', f.response, 'created_at', f.created_at)
                    ORDER BY f.created_at)
               FROM public.playtest_feedback f WHERE f.enrollment_id = e.id
           ), '[]'::jsonb)
      FROM public.playtest_enrollments e
     WHERE e.cohort_id = p_cohort_id
     ORDER BY e.joined_at;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Function privileges
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.playtest_create_cohort(text, text, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.playtest_set_cohort_status(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.playtest_director_advance(uuid, bigint, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.playtest_join(text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.playtest_report_progress(uuid, text, text, text, date, text, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.playtest_submit_feedback(uuid, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.playtest_admin_roster(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.playtest_create_cohort(text, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.playtest_set_cohort_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.playtest_director_advance(uuid, bigint, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.playtest_join(text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.playtest_report_progress(uuid, text, text, text, date, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.playtest_submit_feedback(uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.playtest_admin_roster(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. Realtime
-- ---------------------------------------------------------------------------
-- director_state is the participant's live channel. enrollments and feedback
-- are published for the Director's live table; RLS scopes what each
-- subscriber receives. Guarded so a hand re-run does not abort.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['playtest_director_state', 'playtest_enrollments', 'playtest_feedback'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END;
$$;

COMMIT;
