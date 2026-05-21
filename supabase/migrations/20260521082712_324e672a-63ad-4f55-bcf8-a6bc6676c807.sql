
CREATE TABLE public.gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id uuid,
  sender_email text,
  recipient_email text,
  recipient_user_id uuid,
  gift_type text NOT NULL,            -- 'pro_monthly' | 'pro_annual' | 'diamonds'
  diamond_amount integer DEFAULT 0,
  stripe_session_id text UNIQUE,
  stripe_price_id text,
  amount_cents integer,
  status text NOT NULL DEFAULT 'pending', -- pending | paid | redeemed | refunded
  redeem_code text NOT NULL UNIQUE DEFAULT upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
  message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  paid_at timestamptz,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_gifts_sender ON public.gifts(sender_user_id);
CREATE INDEX idx_gifts_recipient_email ON public.gifts(lower(recipient_email));
CREATE INDEX idx_gifts_recipient_user ON public.gifts(recipient_user_id);
CREATE INDEX idx_gifts_status ON public.gifts(status);

ALTER TABLE public.gifts ENABLE ROW LEVEL SECURITY;

-- Sender can view their own gifts
CREATE POLICY "Senders view their gifts"
  ON public.gifts FOR SELECT
  USING (auth.uid() IS NOT NULL AND sender_user_id = auth.uid());

-- Recipient (matched by user_id) can view gifts addressed to them
CREATE POLICY "Recipients view their gifts"
  ON public.gifts FOR SELECT
  USING (auth.uid() IS NOT NULL AND recipient_user_id = auth.uid());

-- Admins can view all
CREATE POLICY "Admins view all gifts"
  ON public.gifts FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_gifts_updated_at
  BEFORE UPDATE ON public.gifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function: recipient redeems a gift by code (after payment is confirmed)
CREATE OR REPLACE FUNCTION public.redeem_gift_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _gift gifts%ROWTYPE;
  _profile_id uuid;
  _user_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO _gift FROM gifts WHERE redeem_code = upper(_code);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_code');
  END IF;

  IF _gift.status = 'redeemed' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_redeemed');
  END IF;

  IF _gift.status <> 'paid' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_paid');
  END IF;

  SELECT id INTO _profile_id FROM profiles WHERE user_id = auth.uid();
  IF _profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_profile');
  END IF;

  -- Apply diamonds gifts immediately (Pro gifts are applied server-side by edge function).
  IF _gift.gift_type = 'diamonds' AND COALESCE(_gift.diamond_amount,0) > 0 THEN
    UPDATE profiles
       SET diamonds = COALESCE(diamonds,0) + _gift.diamond_amount
     WHERE id = _profile_id;
  END IF;

  UPDATE gifts
     SET status = 'redeemed',
         redeemed_at = now(),
         recipient_user_id = auth.uid()
   WHERE id = _gift.id;

  RETURN jsonb_build_object(
    'success', true,
    'gift_type', _gift.gift_type,
    'diamond_amount', _gift.diamond_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_gift_code(text) TO authenticated;
