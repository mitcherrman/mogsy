-- USERS1 — traffic classification for the canonical analytics store.
--
-- Applied by hand through the Lovable Cloud SQL Editor, like every other
-- migration in this project (docs/USERS1_PRODUCTION_SQL.md, block B).
--
-- It is purely ADDITIVE: three columns on analytics_sessions, one small
-- override table, one function. Nothing is dropped and no existing row is
-- rewritten, so it is safe to apply before the frontend that writes the new
-- columns ships.
--
--
-- 1. WHY THE SESSION, AND NOT THE EVENT
--
-- The obvious shape is a traffic_class column on analytics_events. It is the
-- wrong one: it copies the same three values onto every one of hundreds of
-- thousands of rows, and it lets one session disagree with itself — half its
-- events automation, half human — which is not a state that can be true.
--
-- What is actually being classified is a BROWSING SESSION. One browser, one
-- visit, one verdict. An event inherits the verdict of its session; a visitor
-- rolls up from their sessions (strongest signal wins — see metrics.ts). So
-- the column lives once per session, which is also the only grain at which it
-- can be observed.
--
-- analytics_visitors deliberately gains nothing. A visitor's class is derived,
-- not stored, because a person's first session and their tenth can genuinely
-- differ (they installed a crawler? they let an agent drive their browser?)
-- and a stored visitor-level value would have to pick a moment to be right.
--
--
-- 2. WHY A CLIENT MAY NOT WRITE 'human'
--
-- The WITH CHECK below restricts anon and authenticated inserts to
-- 'automation', 'internal' and 'unknown'. A caller can therefore volunteer
-- that it is ours or that it is a robot — both of which REMOVE it from the
-- default KPI population — but it cannot add itself to the audience.
--
-- 'human' is reachable only through analytics_promote_session_human(), which
-- only ever moves a session OUT of 'unknown' and cannot demote, re-source or
-- revise anything. The worst a hostile caller can do with it is promote
-- sessions that were going to be counted anyway (the default population is
-- human + unknown), which is why this is a data-quality mechanism and not a
-- security one. Nothing in the product authorizes on traffic_class.
--
--
-- 3. THE LEDGER IS STILL APPEND-ONLY
--
-- No UPDATE or DELETE policy is added for any role. The promotion function is
-- SECURITY DEFINER and is the single, narrow exception, with its own guard
-- clause. Operator corrections do not touch these tables at all: they are
-- rows in analytics_traffic_overrides, which is a separate, admin-owned store
-- read at query time. The observation and the correction stay distinguishable
-- forever, which they would not be if an admin could overwrite the observation.

-- ---------------------------------------------------------------------------
-- analytics_sessions — the classification
-- ---------------------------------------------------------------------------

ALTER TABLE public.analytics_sessions
  ADD COLUMN IF NOT EXISTS traffic_class          text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS traffic_source         text,
  ADD COLUMN IF NOT EXISTS classification_reason  text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'analytics_sessions_traffic_class_known'
  ) THEN
    ALTER TABLE public.analytics_sessions
      ADD CONSTRAINT analytics_sessions_traffic_class_known
      CHECK (traffic_class IN ('human', 'automation', 'internal', 'unknown'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'analytics_sessions_traffic_source_len'
  ) THEN
    ALTER TABLE public.analytics_sessions
      ADD CONSTRAINT analytics_sessions_traffic_source_len
      CHECK (traffic_source IS NULL OR length(traffic_source) <= 64);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'analytics_sessions_classification_reason_len'
  ) THEN
    ALTER TABLE public.analytics_sessions
      ADD CONSTRAINT analytics_sessions_classification_reason_len
      CHECK (classification_reason IS NULL OR length(classification_reason) <= 200);
  END IF;
END $$;

COMMENT ON COLUMN public.analytics_sessions.traffic_class IS
  'human | automation | internal | unknown. Self-reported analytics metadata, never an authorization input. Existing rows default to unknown, which is the honest verdict on every session recorded before USERS1.';

-- Admin filters by class constantly; nothing else does.
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_traffic_class
  ON public.analytics_sessions (traffic_class, started_at DESC);

-- The insert policy is replaced, not added to: a policy cannot be narrowed in
-- place. The only change is the traffic_class clause.
DROP POLICY IF EXISTS "Anyone can record a session" ON public.analytics_sessions;

CREATE POLICY "Anyone can record a session"
  ON public.analytics_sessions
  FOR INSERT TO anon, authenticated
  WITH CHECK (traffic_class IN ('automation', 'internal', 'unknown'));

-- ---------------------------------------------------------------------------
-- Promotion to 'human'
-- ---------------------------------------------------------------------------
--
-- Called once per session, from the first trusted pointer/key event the
-- browser reports. It is idempotent by construction: the WHERE clause matches
-- only a session that is still 'unknown', so a second call changes nothing.

CREATE OR REPLACE FUNCTION public.analytics_promote_session_human(
  p_session_id uuid,
  p_reason     text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE public.analytics_sessions
     SET traffic_class = 'human',
         classification_reason = coalesce(left(p_reason, 200), 'trusted human input event')
   WHERE session_id = p_session_id
     AND traffic_class = 'unknown';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

COMMENT ON FUNCTION public.analytics_promote_session_human(uuid, text) IS
  'USERS1. Moves a session from unknown to human and does nothing else: it cannot demote, cannot reclassify automation or internal, and cannot touch any other column. The one write path to traffic_class = human.';

REVOKE ALL ON FUNCTION public.analytics_promote_session_human(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.analytics_promote_session_human(uuid, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- analytics_traffic_overrides — the operator's correction, kept separate
-- ---------------------------------------------------------------------------
--
-- Detection is not perfect and this document does not pretend it is. When an
-- operator knows better ("that visitor is my own phone", "that one is a
-- scraper we didn't recognise"), the correction is recorded HERE, keyed by
-- visitor, and applied at read time on top of the observed session classes.
-- The observation is never edited, so "what did we detect" and "what did we
-- decide" remain two different questions with two different answers.

CREATE TABLE IF NOT EXISTS public.analytics_traffic_overrides (
  visitor_id    uuid PRIMARY KEY,
  traffic_class text NOT NULL,
  traffic_source text,
  reason        text,
  set_by        uuid,
  set_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT analytics_traffic_overrides_class_known
    CHECK (traffic_class IN ('human', 'automation', 'internal', 'unknown')),
  CONSTRAINT analytics_traffic_overrides_source_len
    CHECK (traffic_source IS NULL OR length(traffic_source) <= 64),
  CONSTRAINT analytics_traffic_overrides_reason_len
    CHECK (reason IS NULL OR length(reason) <= 500)
);

ALTER TABLE public.analytics_traffic_overrides ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.analytics_traffic_overrides FROM anon;

DROP POLICY IF EXISTS "Admins can read traffic overrides" ON public.analytics_traffic_overrides;
CREATE POLICY "Admins can read traffic overrides"
  ON public.analytics_traffic_overrides
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.is_master_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can write traffic overrides" ON public.analytics_traffic_overrides;
CREATE POLICY "Admins can write traffic overrides"
  ON public.analytics_traffic_overrides
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role)
              OR public.is_master_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can revise traffic overrides" ON public.analytics_traffic_overrides;
CREATE POLICY "Admins can revise traffic overrides"
  ON public.analytics_traffic_overrides
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.is_master_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role)
              OR public.is_master_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can clear traffic overrides" ON public.analytics_traffic_overrides;
CREATE POLICY "Admins can clear traffic overrides"
  ON public.analytics_traffic_overrides
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.is_master_admin(auth.uid()));
