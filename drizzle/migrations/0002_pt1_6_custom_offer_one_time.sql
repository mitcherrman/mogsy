-- PT1.6 — Owner-controlled custom one-time Premium offer ($50 / 12 months, no auto-renew).
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_pro_grant_kind_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pro_grant_kind_check
  CHECK (pro_grant_kind IS NULL
         OR pro_grant_kind IN ('manual', 'playtest', 'promo', 'gift', 'purchase'));

CREATE OR REPLACE FUNCTION public.apply_pro_grant(
  _profile_id uuid,
  _kind text,
  _expires_at timestamptz,
  _reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _existing_kind    text;
  _existing_expires timestamptz;
BEGIN
  IF _kind IS NULL OR _kind NOT IN ('manual', 'playtest', 'promo', 'gift', 'purchase') THEN
    RAISE EXCEPTION 'Unknown grant kind: %', _kind;
  END IF;
  SELECT p.pro_grant_kind, p.pro_grant_expires_at
    INTO _existing_kind, _existing_expires
  FROM public.profiles p
  WHERE p.id = _profile_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF public.pro_grant_is_valid(_existing_kind, _existing_expires) THEN
    IF _existing_expires IS NULL THEN
      RETURN false;
    END IF;
    IF _expires_at IS NOT NULL AND _expires_at <= _existing_expires THEN
      RETURN false;
    END IF;
  END IF;
  UPDATE public.profiles SET
    pro_grant_kind       = _kind,
    pro_grant_expires_at = _expires_at,
    pro_grant_reason     = _reason,
    pro_grant_granted_at = now(),
    pro_grant_granted_by = NULL
  WHERE id = _profile_id;
  RETURN true;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.apply_pro_grant(uuid, text, timestamptz, text) FROM public, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.custom_offer_claims (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash         text NOT NULL UNIQUE,
  note               text,
  created_by         uuid NOT NULL,
  expires_at         timestamptz NOT NULL,
  redeemed_by_user_id uuid,
  redeemed_at        timestamptz,
  stripe_session_id  text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.custom_offer_claims ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.custom_offer_claims TO service_role;

CREATE TABLE IF NOT EXISTS public.custom_offer_purchases (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL,
  profile_id             uuid NOT NULL,
  claim_id               uuid NOT NULL REFERENCES public.custom_offer_claims(id),
  stripe_session_id      text NOT NULL UNIQUE,
  stripe_payment_intent_id text,
  amount_cents           integer NOT NULL,
  currency               text NOT NULL,
  status                 text NOT NULL DEFAULT 'paid'
                         CHECK (status IN ('paid', 'refunded')),
  entitlement_ends_at    timestamptz NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.custom_offer_purchases ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.custom_offer_purchases TO service_role;

CREATE OR REPLACE FUNCTION public.owner_create_custom_offer_claim(
  _note text DEFAULT NULL,
  _expires_at timestamptz DEFAULT (now() + interval '30 days')
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _token text;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'owner_required';
  END IF;
  IF _expires_at IS NULL OR _expires_at <= now() THEN
    RAISE EXCEPTION 'expiry_must_be_future';
  END IF;
  _token := 'mgy1_' || encode(extensions.gen_random_bytes(24), 'hex');
  INSERT INTO public.custom_offer_claims (token_hash, note, created_by, expires_at)
  VALUES (
    encode(extensions.digest(_token, 'sha256'), 'hex'),
    left(coalesce(_note, ''), 200),
    auth.uid(),
    _expires_at
  );
  RETURN _token;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.owner_create_custom_offer_claim(text, timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.owner_create_custom_offer_claim(text, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.redeem_custom_offer_claim(
  _token_hash text,
  _user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _claim_id uuid;
BEGIN
  UPDATE public.custom_offer_claims
  SET redeemed_by_user_id = _user_id, redeemed_at = now()
  WHERE token_hash = _token_hash
    AND redeemed_at IS NULL
    AND expires_at > now()
  RETURNING id INTO _claim_id;
  RETURN _claim_id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.redeem_custom_offer_claim(text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_custom_offer_claim(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.restore_custom_offer_claim(_claim_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.custom_offer_claims
  SET redeemed_by_user_id = NULL, redeemed_at = NULL
  WHERE id = _claim_id AND stripe_session_id IS NULL;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.restore_custom_offer_claim(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_custom_offer_claim(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.record_custom_offer_purchase(
  _user_id uuid,
  _claim_id uuid,
  _stripe_session_id text,
  _stripe_payment_intent_id text,
  _amount_cents integer,
  _currency text,
  _entitlement_ends_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _profile_id uuid;
  _claim record;
BEGIN
  IF EXISTS (SELECT 1 FROM public.custom_offer_purchases WHERE stripe_session_id = _stripe_session_id) THEN
    RETURN 'duplicate';
  END IF;
  SELECT id INTO _profile_id FROM public.profiles WHERE user_id = _user_id;
  IF _profile_id IS NULL THEN
    RETURN 'error';
  END IF;
  SELECT * INTO _claim FROM public.custom_offer_claims
  WHERE id = _claim_id AND redeemed_by_user_id = _user_id AND stripe_session_id IS NULL;
  IF NOT FOUND THEN
    RETURN 'error';
  END IF;
  INSERT INTO public.custom_offer_purchases (
    user_id, profile_id, claim_id, stripe_session_id, stripe_payment_intent_id,
    amount_cents, currency, status, entitlement_ends_at
  ) VALUES (
    _user_id, _profile_id, _claim_id, _stripe_session_id, _stripe_payment_intent_id,
    _amount_cents, _currency, 'paid', _entitlement_ends_at
  );
  UPDATE public.custom_offer_claims
  SET stripe_session_id = _stripe_session_id
  WHERE id = _claim_id;
  IF NOT public.apply_pro_grant(
    _profile_id, 'purchase', _entitlement_ends_at,
    'custom one-time 12-month Premium ($50) — session ' || _stripe_session_id
  ) THEN
    INSERT INTO public.admin_audit_log (actor_user_id, action, result, detail, target_profile_id)
    VALUES (NULL, 'custom_offer_grant_kept_existing', 'ok', jsonb_build_object(
      'stripe_session_id', _stripe_session_id, 'entitlement_ends_at', _entitlement_ends_at
    ), _profile_id);
  END IF;
  INSERT INTO public.admin_audit_log (actor_user_id, action, result, detail, target_profile_id)
  VALUES (NULL, 'custom_offer_purchase', 'ok', jsonb_build_object(
    'user_id', _user_id, 'stripe_session_id', _stripe_session_id,
    'amount_cents', _amount_cents, 'currency', _currency,
    'entitlement_ends_at', _entitlement_ends_at
  ), _profile_id);
  RETURN 'recorded';
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.record_custom_offer_purchase(uuid, uuid, text, text, integer, text, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_custom_offer_purchase(uuid, uuid, text, text, integer, text, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.refund_custom_offer_purchase(
  _stripe_payment_intent_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _purchase record;
  _current record;
BEGIN
  SELECT * INTO _purchase FROM public.custom_offer_purchases
  WHERE stripe_payment_intent_id = _stripe_payment_intent_id;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF _purchase.status = 'refunded' THEN
    RETURN 'already_refunded';
  END IF;
  UPDATE public.custom_offer_purchases
  SET status = 'refunded', updated_at = now()
  WHERE id = _purchase.id;
  SELECT pro_grant_kind, pro_grant_expires_at INTO _current
  FROM public.profiles WHERE id = _purchase.profile_id;
  IF _current.pro_grant_kind = 'purchase'
     AND _current.pro_grant_expires_at IS NOT DISTINCT FROM _purchase.entitlement_ends_at THEN
    UPDATE public.profiles SET
      pro_grant_kind       = NULL,
      pro_grant_expires_at = NULL,
      pro_grant_reason     = NULL,
      pro_grant_granted_at = NULL,
      pro_grant_granted_by = NULL
    WHERE id = _purchase.profile_id;
  END IF;
  INSERT INTO public.admin_audit_log (actor_user_id, action, result, detail, target_profile_id)
  VALUES (NULL, 'custom_offer_refund', 'ok', jsonb_build_object(
    'stripe_payment_intent_id', _stripe_payment_intent_id,
    'stripe_session_id', _purchase.stripe_session_id
  ), _purchase.profile_id);
  RETURN 'refunded';
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.refund_custom_offer_purchase(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_custom_offer_purchase(text) TO service_role;