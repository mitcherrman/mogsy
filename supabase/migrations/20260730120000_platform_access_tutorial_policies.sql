-- Global platform access + tutorial policies (admin-controlled).
--
-- Three new rows in the EXISTING public.app_settings key/value store — no new
-- settings system, no new table, no new authorization model. Reads stay public
-- (the existing "Settings are publicly readable" SELECT policy); writes stay
-- admin-only (the existing has_role(auth.uid(),'admin') INSERT/UPDATE policies).
--
--   combat_sim_tokens_required_for_non_pro
--     {"enabled": true}  -> non-Pro users must have and spend Combat Sim tokens
--                           (the daily Combat Lab simulation credits).
--     {"enabled": false} -> non-Pro users run Combat Sim without any token gate
--                           and WITHOUT decrementing their balance.
--     Pro behaviour is unaffected in both states (Pro was already unlimited and
--     already never metered).
--
--   tutorial_auto_popup_enabled
--     {"enabled": true}  -> the first-visit tutorial popup appears for new users.
--     {"enabled": false} -> no automatic popup. The tutorial itself still exists
--                           and remains manually startable.
--
--   tutorial_completion_required_for_new_users
--     {"enabled": true}  -> new users must finish the tutorial before the gated
--                           Leaguecraft routes (the existing redirect gate).
--     {"enabled": false} -> users continue without completing it.
--
-- ALL THREE DEFAULT TO true, which reproduces current production behaviour
-- exactly. ON CONFLICT DO NOTHING makes re-running a no-op and, critically,
-- never resets a value an admin has already changed.
--
-- Turning a toggle off never deletes or rewrites data: token balances live in
-- the backend's combat_lab_usage table and tutorial completion lives in
-- profiles.ranked_tutorial_completed_at. Neither is touched here or by the
-- policy code, so re-enabling a toggle restores the previous behaviour with no
-- migration or data repair.

INSERT INTO public.app_settings (key, value) VALUES
  ('combat_sim_tokens_required_for_non_pro', '{"enabled": true}'::jsonb),
  ('tutorial_auto_popup_enabled',            '{"enabled": true}'::jsonb),
  ('tutorial_completion_required_for_new_users', '{"enabled": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- --------------------------------------------------------------------------
-- Audit: who last changed a global setting.
--
-- app_settings already carried updated_at but nothing recorded the actor. The
-- column is nullable and backfills to NULL ("changed before auditing existed"),
-- so no existing row or reader is affected.
-- --------------------------------------------------------------------------
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS updated_by uuid;

COMMENT ON COLUMN public.app_settings.updated_by IS
  'auth.uid() of the admin whose write last modified this row. NULL = written before auditing existed, or by a non-user context (migration/service). Set by trigger only — never client-supplied.';

-- Stamped by a trigger rather than by the client so the audit value is derived
-- from the verified session (auth.uid()) and cannot be spoofed by the caller,
-- even though only admins can write at all. Explicit empty search_path per the
-- current security-hardening convention; every reference is schema-qualified.
CREATE OR REPLACE FUNCTION public.stamp_app_settings_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_settings_stamp_audit ON public.app_settings;

CREATE TRIGGER app_settings_stamp_audit
  BEFORE INSERT OR UPDATE ON public.app_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_app_settings_audit();
