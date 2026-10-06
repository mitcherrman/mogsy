-- ===========================================================================
-- OWN1-C — Authoritative display-name enforcement on direct profile writes.
--
-- Defect: a client could PATCH profiles.display_name directly and skip
-- set_display_name()/display_name_problem() (incl. reserved names). This
-- trigger applies the same rules to every client-originated write.
--   * Only client requests (JWT role anon/authenticated) are checked; the
--     signup trigger, service-role jobs, and migrations are system paths.
--   * Only CHANGED claimed names are checked on UPDATE (existing rows untouched).
--   * Bot names may be written only by the owner through an owner RPC that sets
--     the transaction-local own1.owner_write marker (OWN1-B), and then use
--     bot_display_name_problem().
-- Independent of OWN1-B for user rows; bot writes require OWN1-A helpers.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.enforce_profile_display_name_rules()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _claims jsonb := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  _role text := COALESCE(_claims ->> 'role', NULLIF(current_setting('request.jwt.claim.role', true), ''));
  _problem text;
BEGIN
  IF _role IS NULL OR _role NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.display_name IS NOT DISTINCT FROM OLD.display_name THEN
    RETURN NEW;
  END IF;
  IF NOT public.is_claimed_display_name(NEW.display_name, COALESCE(NEW.is_anonymous, false)) THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.is_bot, false) THEN
    IF NOT (public.is_owner() AND current_setting('own1.owner_write', true) = 'on') THEN
      RAISE EXCEPTION 'display_name_owner_only' USING ERRCODE = 'insufficient_privilege';
    END IF;
    _problem := public.bot_display_name_problem(public.clean_display_name(NEW.display_name), NEW.id);
  ELSE
    _problem := public.display_name_problem(NEW.display_name);
  END IF;

  IF _problem IS NOT NULL THEN
    RAISE EXCEPTION 'display_name_rejected:%', _problem USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_profile_display_name_rules() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zz_enforce_display_name_rules ON public.profiles;
CREATE TRIGGER zz_enforce_display_name_rules
  BEFORE INSERT OR UPDATE OF display_name ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_display_name_rules();
