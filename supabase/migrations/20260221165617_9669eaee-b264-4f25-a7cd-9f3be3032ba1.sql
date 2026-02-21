
-- Add power-up columns to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS elo_shields integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS reveals integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS rewinds integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS profile_frame text DEFAULT 'default',
ADD COLUMN IF NOT EXISTS custom_theme text DEFAULT 'default';

-- Add promoted flag and branding to leagues
ALTER TABLE public.leagues
ADD COLUMN IF NOT EXISTS is_promoted boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS promoted_brand_name text,
ADD COLUMN IF NOT EXISTS promoted_brand_logo text,
ADD COLUMN IF NOT EXISTS promoted_until timestamp with time zone;

-- Create purchases table for mock transaction history
CREATE TABLE public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  item_type text NOT NULL, -- 'pro_subscription', 'boost', 'elo_shield', 'reveal', 'rewind'
  amount_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own purchases"
ON public.purchases
FOR SELECT
USING (is_profile_owner(profile_id));

CREATE POLICY "Users can insert own purchases"
ON public.purchases
FOR INSERT
WITH CHECK (is_profile_owner(profile_id));

-- Allow admins to update leagues (for promoted status)
-- Already have league creator update policy, add admin update
CREATE POLICY "Admins can update any league"
ON public.leagues
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));
