
CREATE OR REPLACE FUNCTION public.protect_profile_premium_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    NEW.is_pro := OLD.is_pro;
    NEW.diamonds := OLD.diamonds;
    NEW.boost_credits := OLD.boost_credits;
    NEW.elo_shields := OLD.elo_shields;
    NEW.reveals := OLD.reveals;
    NEW.rewinds := OLD.rewinds;
    NEW.is_bot := OLD.is_bot;
    NEW.is_flagged_underage := OLD.is_flagged_underage;
    NEW.admin_notes := OLD.admin_notes;
    NEW.ads_enabled := OLD.ads_enabled;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_premium_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_premium_fields();
