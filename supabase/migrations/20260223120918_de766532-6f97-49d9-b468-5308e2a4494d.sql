
-- 1. Add last_seen_at column to profiles for tracking activity
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now();

-- 2. Update has_role to also grant master_admin all admin privileges
-- Use text cast to avoid the enum commit issue
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (role = _role OR role::text = 'master_admin')
  )
$$;

-- 3. Create a function to check master_admin specifically
CREATE OR REPLACE FUNCTION public.is_master_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text = 'master_admin'
  )
$$;

-- 4. Allow admins to manage user_roles (needed for granting admin to users)
CREATE POLICY "Admins can delete roles"
ON public.user_roles
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update roles"
ON public.user_roles
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- 5. Add app_settings rows for new master admin settings
INSERT INTO public.app_settings (key, value) VALUES 
  ('maintenance_mode', '{"enabled": false}'::jsonb),
  ('max_photos_per_user', '{"count": 6}'::jsonb),
  ('default_diamonds', '{"count": 0}'::jsonb),
  ('allow_anonymous_browsing', '{"enabled": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;
