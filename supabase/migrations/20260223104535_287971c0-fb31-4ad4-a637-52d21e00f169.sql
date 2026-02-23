
-- 1. Auto-flag underage via trigger (server-side enforcement)
CREATE OR REPLACE FUNCTION public.auto_flag_underage()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.age IS NOT NULL AND NEW.age < 18 THEN
    NEW.is_flagged_underage := true;
  ELSIF NEW.age IS NOT NULL AND NEW.age >= 18 THEN
    NEW.is_flagged_underage := false;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_underage_flag
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.auto_flag_underage();

-- 2. Restrict admin_notifications INSERT to authenticated users only
DROP POLICY IF EXISTS "Anyone can insert notifications" ON public.admin_notifications;
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.admin_notifications;

CREATE POLICY "Authenticated users can insert notifications"
  ON public.admin_notifications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
