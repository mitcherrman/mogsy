
-- Update handle_new_user to create anonymous profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  anon_count integer;
  anon_name text;
BEGIN
  IF NEW.is_anonymous = true THEN
    SELECT COUNT(*) + 1 INTO anon_count FROM public.profiles WHERE is_anonymous = true;
    anon_name := 'Anonymous' || anon_count;
    INSERT INTO public.profiles (user_id, display_name, is_anonymous)
    VALUES (NEW.id, anon_name, true);
  ELSE
    INSERT INTO public.profiles (user_id, display_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', ''));
  END IF;
  RETURN NEW;
END;
$function$;

-- Also allow anonymous users to insert their own profile
CREATE POLICY "Anonymous users can insert own profile"
ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() = user_id AND is_anonymous = true);
