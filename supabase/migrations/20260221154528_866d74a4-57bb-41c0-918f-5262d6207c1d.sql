
-- Create admin role enum and user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
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
      AND role = _role
  )
$$;

-- Only admins can read user_roles
CREATE POLICY "Admins can read roles"
ON public.user_roles
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can insert roles
CREATE POLICY "Admins can insert roles"
ON public.user_roles
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add is_bot column to profiles for bot/dummy profiles
ALTER TABLE public.profiles ADD COLUMN is_bot boolean DEFAULT false;

-- Allow admins to insert bot profiles (bypass the user_id = auth.uid() check)
CREATE POLICY "Admins can insert bot profiles"
ON public.profiles
FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin') AND is_bot = true
);

-- Allow admins to update any profile
CREATE POLICY "Admins can update any profile"
ON public.profiles
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete bot profiles
CREATE POLICY "Admins can delete bot profiles"
ON public.profiles
FOR DELETE
USING (public.has_role(auth.uid(), 'admin') AND is_bot = true);

-- Allow admins to manage all preset items (they already can via is_league_creator, but let's add admin override)
CREATE POLICY "Admins can insert preset items"
ON public.preset_items
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update preset items"
ON public.preset_items
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete preset items"
ON public.preset_items
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));
