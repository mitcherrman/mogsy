-- ===========================================================================
-- EMAIL1 — optional newsletter / Daily Challenge reminder subscriptions.
--
-- STAGED, NOT APPLIED. Lives under supabase/email1-staged/ (like OWN1's staged
-- SQL) so that merging this branch cannot auto-apply it. Promotion steps are in
-- EMAIL1_HANDOFF.md. Rollback: ../rollback/01_email1_rollback.sql.
--
-- WHAT THIS IS
--   Marketing consent is its own system. It is NOT Supabase auth's email
--   confirmation: that proves a mailbox can receive a login link, which is not
--   consent to be marketed to. A subscription becomes active only when the
--   mailbox owner clicks a link we emailed to the exact address (double
--   opt-in), and every state change is written to an append-only audit table.
--
-- WHAT THIS IS NOT
--   * It does not read, copy or backfill any existing user. There is no
--     INSERT ... SELECT anywhere in this file and no trigger on auth.users or
--     profiles: an account that never asks is never subscribed
--     (src/test/security/email1SubscriptionSql.test.ts asserts both).
--   * It does not send anything. Sending is an Edge Function behind a
--     kill-switch that ships OFF.
--
-- ACCESS MODEL
--   * Browser roles can SELECT only their OWN subscription row and consent
--     history, and only the non-secret columns. They cannot write any table.
--   * Every write goes through a SECURITY DEFINER function executable by
--     service_role only (the Edge Functions), or an owner-gated admin RPC
--     (public.assert_owner, the OWN1 gate).
--   * Tokens are stored as SHA-256 hashes; the raw value exists only in the
--     email we sent.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_subscriptions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Which account asked. Nullable + SET NULL: deleting an account must not
  -- delete the fact that a mailbox opted out or was suppressed.
  user_id                   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email                     text NOT NULL,
  email_normalized          text NOT NULL UNIQUE,
  status                    text NOT NULL DEFAULT 'none',
  topics                    text[] NOT NULL DEFAULT '{}',
  pending_topics            text[] NOT NULL DEFAULT '{}',
  requested_at              timestamptz,
  confirmed_at              timestamptz,
  unsubscribed_at           timestamptz,
  last_confirmation_sent_at timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_subscriptions_status_chk
    CHECK (status IN ('none', 'pending', 'subscribed', 'unsubscribed', 'suppressed')),
  CONSTRAINT email_subscriptions_email_chk
    CHECK (email_normalized = lower(btrim(email_normalized))
           AND position('@' IN email_normalized) > 1
           AND char_length(email_normalized) <= 320),
  CONSTRAINT email_subscriptions_topics_chk
    CHECK (topics <@ ARRAY['daily_reminder', 'product_news', 'events', 'promotions']::text[]),
  CONSTRAINT email_subscriptions_pending_topics_chk
    CHECK (pending_topics <@ ARRAY['daily_reminder', 'product_news', 'events', 'promotions']::text[]),
  -- Topics are live only while subscribed; pending topics only while pending.
  CONSTRAINT email_subscriptions_topics_state_chk
    CHECK ((status = 'subscribed' AND cardinality(topics) > 0) OR (status <> 'subscribed' AND cardinality(topics) = 0)),
  CONSTRAINT email_subscriptions_pending_state_chk
    CHECK (status = 'pending' OR cardinality(pending_topics) = 0)
);
CREATE INDEX IF NOT EXISTS email_subscriptions_user_idx ON public.email_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS email_subscriptions_status_idx ON public.email_subscriptions (status);

-- Append-only consent evidence. No FK to the subscription: the record of what
-- someone agreed to must survive the row it describes.
CREATE TABLE IF NOT EXISTS public.email_consent_events (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subscription_id   uuid,
  user_id           uuid,
  email_normalized  text NOT NULL,
  event_type        text NOT NULL,
  topics            text[] NOT NULL DEFAULT '{}',
  source            text NOT NULL,
  consent_version   text,
  consent_text      text,
  ip_hash           text,
  user_agent        text,
  provider_event_id text UNIQUE,
  detail            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_consent_events_type_chk CHECK (event_type IN (
    'opt_in_requested', 'opt_in_confirmed', 'preferences_changed',
    'unsubscribed', 'suppressed', 'rebound')),
  CONSTRAINT email_consent_events_ua_chk CHECK (user_agent IS NULL OR char_length(user_agent) <= 300),
  CONSTRAINT email_consent_events_text_chk CHECK (consent_text IS NULL OR char_length(consent_text) <= 2000)
);
CREATE INDEX IF NOT EXISTS email_consent_events_user_idx ON public.email_consent_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS email_consent_events_email_idx ON public.email_consent_events (email_normalized, created_at DESC);

CREATE OR REPLACE FUNCTION public._email_consent_events_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'email_consent_events is append-only' USING ERRCODE = 'insufficient_privilege';
END $$;
DROP TRIGGER IF EXISTS email_consent_events_no_change ON public.email_consent_events;
CREATE TRIGGER email_consent_events_no_change
  BEFORE UPDATE OR DELETE ON public.email_consent_events
  FOR EACH ROW EXECUTE FUNCTION public._email_consent_events_immutable();
DROP TRIGGER IF EXISTS email_consent_events_no_truncate ON public.email_consent_events;
CREATE TRIGGER email_consent_events_no_truncate
  BEFORE TRUNCATE ON public.email_consent_events
  FOR EACH STATEMENT EXECUTE FUNCTION public._email_consent_events_immutable();

CREATE TABLE IF NOT EXISTS public.email_confirmation_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.email_subscriptions(id) ON DELETE CASCADE,
  token_hash      text NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  topics          text[] NOT NULL,
  expires_at      timestamptz NOT NULL,
  consumed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_confirmation_tokens_sub_idx ON public.email_confirmation_tokens (subscription_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  email_normalized  text PRIMARY KEY CHECK (email_normalized = lower(btrim(email_normalized))),
  reason            text NOT NULL CHECK (reason IN ('hard_bounce', 'complaint', 'manual')),
  source            text NOT NULL,
  provider_event_id text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.newsletter_campaigns (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  subject                   text NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 1 AND 150),
  preheader                 text CHECK (preheader IS NULL OR char_length(preheader) <= 200),
  body_markdown             text NOT NULL CHECK (char_length(body_markdown) BETWEEN 1 AND 20000),
  topic                     text NOT NULL CHECK (topic IN ('daily_reminder', 'product_news', 'events', 'promotions')),
  status                    text NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'ready', 'sending', 'sent', 'cancelled')),
  created_by                uuid,
  approved_by               uuid,
  approved_at               timestamptz,
  approved_recipient_count  integer,
  test_sent_at              timestamptz,
  send_started_at           timestamptz,
  send_completed_at         timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.newsletter_deliveries (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id         uuid NOT NULL REFERENCES public.newsletter_campaigns(id) ON DELETE CASCADE,
  subscription_id     uuid NOT NULL REFERENCES public.email_subscriptions(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'skipped')),
  attempts            integer NOT NULL DEFAULT 0,
  claimed_at          timestamptz,
  sent_at             timestamptz,
  provider_message_id text,
  error_code          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, subscription_id)
);
CREATE INDEX IF NOT EXISTS newsletter_deliveries_queue_idx ON public.newsletter_deliveries (campaign_id, status);

-- ---------------------------------------------------------------------------
-- 2. RLS and privileges
-- ---------------------------------------------------------------------------

ALTER TABLE public.email_subscriptions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_consent_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_confirmation_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_suppressions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_campaigns    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_deliveries   ENABLE ROW LEVEL SECURITY;

-- Supabase grants new tables to browser roles by default. Take it all back,
-- then give back exactly two narrow reads.
REVOKE ALL ON public.email_subscriptions, public.email_consent_events,
              public.email_confirmation_tokens, public.email_suppressions,
              public.newsletter_campaigns, public.newsletter_deliveries
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
GRANT ALL ON public.email_subscriptions, public.email_consent_events,
             public.email_confirmation_tokens, public.email_suppressions,
             public.newsletter_campaigns, public.newsletter_deliveries
  TO service_role;

GRANT SELECT (id, user_id, email_normalized, status, topics, pending_topics,
              requested_at, confirmed_at, unsubscribed_at, updated_at)
  ON public.email_subscriptions TO authenticated;
GRANT SELECT (id, event_type, topics, source, consent_version, created_at, user_id)
  ON public.email_consent_events TO authenticated;

DROP POLICY IF EXISTS email_subscriptions_select_own ON public.email_subscriptions;
CREATE POLICY email_subscriptions_select_own ON public.email_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS email_consent_events_select_own ON public.email_consent_events;
CREATE POLICY email_consent_events_select_own ON public.email_consent_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Everything else has RLS enabled with NO policy: default deny for every role
-- that is subject to RLS. service_role bypasses RLS by design.

-- ---------------------------------------------------------------------------
-- 3. Internal helpers (not callable by browser roles)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._email_norm(_e text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT lower(btrim(_e)) $$;

CREATE OR REPLACE FUNCTION public._email_mask(_e text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN position('@' IN _e) < 2 THEN '***'
    ELSE left(split_part(_e, '@', 1), 1) || '***@' || split_part(_e, '@', 2) END
$$;

CREATE OR REPLACE FUNCTION public._email_topics_ok(_t text[])
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT _t IS NOT NULL AND cardinality(_t) BETWEEN 1 AND 4
     AND _t <@ ARRAY['daily_reminder', 'product_news', 'events', 'promotions']::text[]
$$;

CREATE OR REPLACE FUNCTION public._email_log(
  _sub uuid, _user uuid, _email text, _type text, _topics text[], _source text,
  _version text, _text text, _ip text, _ua text, _provider_event text, _detail jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE sql SET search_path = '' AS $$
  INSERT INTO public.email_consent_events
    (subscription_id, user_id, email_normalized, event_type, topics, source,
     consent_version, consent_text, ip_hash, user_agent, provider_event_id, detail)
  VALUES (_sub, _user, _email, _type, COALESCE(_topics, '{}'), _source,
          _version, _text, _ip, left(_ua, 300), _provider_event, COALESCE(_detail, '{}'::jsonb))
$$;

-- ---------------------------------------------------------------------------
-- 4. Subscriber lifecycle (service_role only; called by the Edge Functions)
-- ---------------------------------------------------------------------------

-- Ask to subscribe. Never subscribes by itself: it records a PENDING request and
-- hands back whether a confirmation email should be sent.
CREATE OR REPLACE FUNCTION public.email_request_subscription(
  _user_id uuid, _email text, _topics text[], _source text,
  _consent_version text, _consent_text text, _ip_hash text, _user_agent text,
  _token_hash text, _ttl_hours integer DEFAULT 72)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _norm text := public._email_norm(_email);
  _auth_email text;
  _anon boolean;
  s public.email_subscriptions%ROWTYPE;
  _existed boolean := true;
  _recent integer;
BEGIN
  IF NOT public._email_topics_ok(_topics) THEN RAISE EXCEPTION 'invalid_topics'; END IF;
  IF _source NOT IN ('signup_direct', 'signup_upgrade', 'signup_intent', 'settings') THEN
    RAISE EXCEPTION 'invalid_source';
  END IF;
  IF _token_hash IS NULL OR char_length(_token_hash) <> 64 THEN RAISE EXCEPTION 'invalid_token'; END IF;

  -- The address must be the account's own. A caller can never subscribe a
  -- mailbox that is not the one on their auth user.
  SELECT lower(btrim(u.email)), COALESCE(u.is_anonymous, false) INTO _auth_email, _anon
    FROM auth.users u WHERE u.id = _user_id;
  IF _auth_email IS NULL OR _anon OR _auth_email <> _norm THEN
    RETURN jsonb_build_object('result', 'email_mismatch');
  END IF;

  IF EXISTS (SELECT 1 FROM public.email_suppressions x WHERE x.email_normalized = _norm) THEN
    RETURN jsonb_build_object('result', 'suppressed');
  END IF;

  SELECT * INTO s FROM public.email_subscriptions WHERE email_normalized = _norm FOR UPDATE;
  IF NOT FOUND THEN
    _existed := false;
    INSERT INTO public.email_subscriptions (user_id, email, email_normalized, status)
      VALUES (_user_id, _email, _norm, 'none') RETURNING * INTO s;
  ELSIF s.user_id IS DISTINCT FROM _user_id THEN
    -- Same mailbox, different account (the old account was deleted or the
    -- address was reassigned). Whatever the previous holder agreed to is not
    -- this person's consent. An explicit opt-OUT is kept: it is about the
    -- mailbox, and only a deliberate new request moves it.
    IF s.status IN ('subscribed', 'pending') THEN
      PERFORM public._email_log(s.id, _user_id, _norm, 'rebound', s.topics, _source, NULL, NULL, _ip_hash, _user_agent, NULL,
        jsonb_build_object('previous_status', s.status));
      UPDATE public.email_subscriptions
         SET status = 'none', topics = '{}', pending_topics = '{}', updated_at = now()
       WHERE id = s.id;
      DELETE FROM public.email_confirmation_tokens WHERE subscription_id = s.id;
    END IF;
    -- The previous holder's throttle window is not this person's.
    UPDATE public.email_subscriptions
       SET user_id = _user_id, email = _email, last_confirmation_sent_at = NULL, updated_at = now()
     WHERE id = s.id RETURNING * INTO s;
  END IF;

  -- A signup-time intent is a hint, never an override: it may create the first
  -- request for a mailbox and nothing else. It cannot re-subscribe someone who
  -- opted out, restart a pending request, or touch a live subscription.
  IF _source = 'signup_intent' AND (_existed AND s.status <> 'none') THEN
    RETURN jsonb_build_object('result', 'exists', 'status', s.status);
  END IF;

  IF s.status = 'subscribed' THEN
    IF _topics <@ s.topics THEN
      RETURN jsonb_build_object('result', 'already_subscribed', 'topics', to_jsonb(s.topics));
    END IF;
    -- Mailbox already proven; an authenticated owner of this address widening
    -- their own topics needs no second link.
    UPDATE public.email_subscriptions
       SET topics = ARRAY(SELECT DISTINCT t FROM unnest(s.topics || _topics) t ORDER BY t), updated_at = now()
     WHERE id = s.id RETURNING * INTO s;
    PERFORM public._email_log(s.id, _user_id, _norm, 'preferences_changed', s.topics, _source,
      _consent_version, _consent_text, _ip_hash, _user_agent, NULL, '{}'::jsonb);
    RETURN jsonb_build_object('result', 'updated', 'topics', to_jsonb(s.topics));
  END IF;

  -- Throttle: one confirmation email a minute, five a day per mailbox. In the
  -- database so it holds across Edge Function instances.
  IF s.last_confirmation_sent_at IS NOT NULL AND s.last_confirmation_sent_at > now() - interval '60 seconds' THEN
    RETURN jsonb_build_object('result', 'throttled');
  END IF;
  SELECT count(*) INTO _recent FROM public.email_consent_events
   WHERE subscription_id = s.id AND user_id = _user_id
     AND event_type = 'opt_in_requested' AND created_at > now() - interval '24 hours';
  IF _recent >= 5 THEN
    RETURN jsonb_build_object('result', 'throttled');
  END IF;

  DELETE FROM public.email_confirmation_tokens WHERE subscription_id = s.id AND consumed_at IS NULL;
  UPDATE public.email_subscriptions
     SET status = 'pending', pending_topics = _topics, topics = '{}', requested_at = now(),
         last_confirmation_sent_at = now(), updated_at = now()
   WHERE id = s.id;
  INSERT INTO public.email_confirmation_tokens (subscription_id, token_hash, topics, expires_at)
    VALUES (s.id, _token_hash, _topics, now() + make_interval(hours => GREATEST(1, LEAST(_ttl_hours, 168))));
  PERFORM public._email_log(s.id, _user_id, _norm, 'opt_in_requested', _topics, _source,
    _consent_version, _consent_text, _ip_hash, _user_agent, NULL, '{}'::jsonb);

  RETURN jsonb_build_object('result', 'confirmation_required', 'subscription_id', s.id, 'topics', to_jsonb(_topics));
END $$;

-- Confirm from the emailed link. Possession of the token IS the proof the
-- mailbox owner agreed; it is consumed on first use.
CREATE OR REPLACE FUNCTION public.email_confirm_subscription(_token_hash text, _ip_hash text, _user_agent text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  t public.email_confirmation_tokens%ROWTYPE;
  s public.email_subscriptions%ROWTYPE;
BEGIN
  IF _token_hash IS NULL OR char_length(_token_hash) <> 64 THEN
    RETURN jsonb_build_object('result', 'invalid');
  END IF;
  SELECT * INTO t FROM public.email_confirmation_tokens WHERE token_hash = _token_hash FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'invalid'); END IF;
  SELECT * INTO s FROM public.email_subscriptions WHERE id = t.subscription_id FOR UPDATE;

  IF t.consumed_at IS NOT NULL THEN
    -- A double-click, or a mail scanner that followed the link first.
    IF s.status = 'subscribed' THEN
      RETURN jsonb_build_object('result', 'already_confirmed', 'email_masked', public._email_mask(s.email_normalized));
    END IF;
    RETURN jsonb_build_object('result', 'invalid');
  END IF;
  IF t.expires_at < now() THEN RETURN jsonb_build_object('result', 'expired'); END IF;
  IF s.status = 'suppressed' OR EXISTS (SELECT 1 FROM public.email_suppressions x WHERE x.email_normalized = s.email_normalized) THEN
    RETURN jsonb_build_object('result', 'suppressed');
  END IF;
  IF s.status <> 'pending' THEN RETURN jsonb_build_object('result', 'invalid'); END IF;

  UPDATE public.email_confirmation_tokens SET consumed_at = now() WHERE id = t.id;
  UPDATE public.email_subscriptions
     SET status = 'subscribed', topics = t.topics, pending_topics = '{}', confirmed_at = now(),
         unsubscribed_at = NULL, updated_at = now()
   WHERE id = s.id;
  PERFORM public._email_log(s.id, s.user_id, s.email_normalized, 'opt_in_confirmed', t.topics, 'confirmation_link',
    NULL, NULL, _ip_hash, _user_agent, NULL, '{}'::jsonb);
  RETURN jsonb_build_object('result', 'confirmed', 'topics', to_jsonb(t.topics),
                            'email_masked', public._email_mask(s.email_normalized));
END $$;

-- Change the topics of an already-confirmed subscription (Settings).
-- An empty list is an unsubscribe.
CREATE OR REPLACE FUNCTION public.email_set_topics(
  _user_id uuid, _email text, _topics text[], _ip_hash text, _user_agent text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _norm text := public._email_norm(_email);
  _auth_email text;
  s public.email_subscriptions%ROWTYPE;
BEGIN
  SELECT lower(btrim(u.email)) INTO _auth_email FROM auth.users u WHERE u.id = _user_id;
  IF _auth_email IS NULL OR _auth_email <> _norm THEN RETURN jsonb_build_object('result', 'email_mismatch'); END IF;
  SELECT * INTO s FROM public.email_subscriptions WHERE email_normalized = _norm AND user_id = _user_id FOR UPDATE;
  IF NOT FOUND OR s.status <> 'subscribed' THEN RETURN jsonb_build_object('result', 'not_subscribed'); END IF;
  IF _topics IS NULL OR cardinality(_topics) = 0 THEN
    RETURN public.email_unsubscribe(s.id, 'settings', _ip_hash, _user_agent);
  END IF;
  IF NOT public._email_topics_ok(_topics) THEN RAISE EXCEPTION 'invalid_topics'; END IF;
  -- Narrowing is always allowed. Widening a confirmed mailbox is allowed here
  -- only because the caller is the authenticated owner of this exact address.
  UPDATE public.email_subscriptions
     SET topics = ARRAY(SELECT DISTINCT t FROM unnest(_topics) t ORDER BY t), updated_at = now()
   WHERE id = s.id RETURNING * INTO s;
  PERFORM public._email_log(s.id, _user_id, _norm, 'preferences_changed', s.topics, 'settings',
    NULL, NULL, _ip_hash, _user_agent, NULL, '{}'::jsonb);
  RETURN jsonb_build_object('result', 'updated', 'topics', to_jsonb(s.topics));
END $$;

-- Opt out of everything. Idempotent; keeps a suppressed mailbox suppressed.
CREATE OR REPLACE FUNCTION public.email_unsubscribe(
  _subscription_id uuid, _source text, _ip_hash text, _user_agent text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.email_subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.email_subscriptions WHERE id = _subscription_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'not_found'); END IF;
  IF s.status IN ('unsubscribed', 'suppressed') THEN
    RETURN jsonb_build_object('result', 'already_unsubscribed', 'email_masked', public._email_mask(s.email_normalized));
  END IF;
  DELETE FROM public.email_confirmation_tokens WHERE subscription_id = s.id;
  UPDATE public.email_subscriptions
     SET status = 'unsubscribed', topics = '{}', pending_topics = '{}', unsubscribed_at = now(), updated_at = now()
   WHERE id = s.id;
  PERFORM public._email_log(s.id, s.user_id, s.email_normalized, 'unsubscribed', s.topics, _source,
    NULL, NULL, _ip_hash, _user_agent, NULL, jsonb_build_object('previous_status', s.status));
  RETURN jsonb_build_object('result', 'unsubscribed', 'email_masked', public._email_mask(s.email_normalized));
END $$;

-- What the unsubscribe page may say before the user presses the button.
CREATE OR REPLACE FUNCTION public.email_unsubscribe_preview(_subscription_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object('result', 'ok', 'status', s.status, 'email_masked', public._email_mask(s.email_normalized))
       FROM public.email_subscriptions s WHERE s.id = _subscription_id),
    jsonb_build_object('result', 'not_found'))
$$;

-- The subscription row that belongs to this account's CURRENT mailbox.
CREATE OR REPLACE FUNCTION public.email_find_subscription_id(_user_id uuid, _email text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.id FROM public.email_subscriptions s
   WHERE s.user_id = _user_id AND s.email_normalized = public._email_norm(_email)
$$;

-- Provider bounce / complaint. Idempotent on the provider's event id.
CREATE OR REPLACE FUNCTION public.email_apply_suppression(
  _email text, _reason text, _source text, _provider_event_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _norm text := public._email_norm(_email);
  s public.email_subscriptions%ROWTYPE;
BEGIN
  IF _reason NOT IN ('hard_bounce', 'complaint', 'manual') THEN RAISE EXCEPTION 'invalid_reason'; END IF;
  IF _provider_event_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.email_consent_events WHERE provider_event_id = _provider_event_id) THEN
    RETURN jsonb_build_object('result', 'duplicate');
  END IF;
  INSERT INTO public.email_suppressions (email_normalized, reason, source, provider_event_id)
    VALUES (_norm, _reason, _source, _provider_event_id)
    ON CONFLICT (email_normalized) DO NOTHING;
  SELECT * INTO s FROM public.email_subscriptions WHERE email_normalized = _norm FOR UPDATE;
  IF FOUND THEN
    DELETE FROM public.email_confirmation_tokens WHERE subscription_id = s.id;
    UPDATE public.email_subscriptions
       SET status = 'suppressed', topics = '{}', pending_topics = '{}', updated_at = now()
     WHERE id = s.id;
  END IF;
  PERFORM public._email_log(s.id, s.user_id, _norm, 'suppressed', COALESCE(s.topics, '{}'), _source,
    NULL, NULL, NULL, NULL, _provider_event_id, jsonb_build_object('reason', _reason));
  RETURN jsonb_build_object('result', 'suppressed');
END $$;

-- ---------------------------------------------------------------------------
-- 5. Audience + send pipeline (service_role only)
-- ---------------------------------------------------------------------------

-- The ONLY definition of "may be emailed this topic". Every count, preview and
-- send uses it, so what the owner approves is what is sent.
CREATE OR REPLACE FUNCTION public._newsletter_eligible(_topic text)
RETURNS TABLE (subscription_id uuid, user_id uuid, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.id, s.user_id, s.email
    FROM public.email_subscriptions s
    JOIN auth.users u ON u.id = s.user_id
   WHERE s.status = 'subscribed'
     AND _topic = ANY (s.topics)
     AND COALESCE(u.is_anonymous, false) = false
     AND lower(btrim(u.email)) = s.email_normalized          -- the mailbox that consented is still the account's
     AND NOT EXISTS (SELECT 1 FROM public.email_suppressions x WHERE x.email_normalized = s.email_normalized)
$$;

CREATE OR REPLACE FUNCTION public.newsletter_audience_count(_topic text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT count(*)::integer FROM public._newsletter_eligible(_topic)
$$;

CREATE OR REPLACE FUNCTION public.newsletter_load_campaign(_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT to_jsonb(c) FROM public.newsletter_campaigns c WHERE c.id = _id
$$;

CREATE OR REPLACE FUNCTION public.newsletter_begin_send(_campaign_id uuid, _expected_count integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.newsletter_campaigns%ROWTYPE; _n integer;
BEGIN
  SELECT * INTO c FROM public.newsletter_campaigns WHERE id = _campaign_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'not_found'); END IF;
  IF c.status = 'sending' THEN
    RETURN jsonb_build_object('result', 'already_sending');
  END IF;
  IF c.status <> 'ready' THEN RETURN jsonb_build_object('result', 'not_ready', 'status', c.status); END IF;
  SELECT count(*)::integer INTO _n FROM public._newsletter_eligible(c.topic);
  IF _n <> _expected_count THEN
    RETURN jsonb_build_object('result', 'count_changed', 'current', _n);
  END IF;
  INSERT INTO public.newsletter_deliveries (campaign_id, subscription_id)
    SELECT c.id, e.subscription_id FROM public._newsletter_eligible(c.topic) e
    ON CONFLICT (campaign_id, subscription_id) DO NOTHING;
  UPDATE public.newsletter_campaigns SET status = 'sending', send_started_at = now(), updated_at = now() WHERE id = c.id;
  RETURN jsonb_build_object('result', 'started', 'queued', _n);
END $$;

-- Hand out the next batch. Re-checks eligibility at the moment of sending, so
-- someone who unsubscribed after the campaign was queued is skipped, not mailed.
CREATE OR REPLACE FUNCTION public.newsletter_claim_batch(_campaign_id uuid, _limit integer)
RETURNS TABLE (delivery_id bigint, subscription_id uuid, email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.newsletter_campaigns%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.newsletter_campaigns WHERE id = _campaign_id;
  IF NOT FOUND OR c.status <> 'sending' THEN RETURN; END IF;
  UPDATE public.newsletter_deliveries d
     SET status = 'skipped', error_code = 'no_longer_eligible'
   WHERE d.campaign_id = _campaign_id AND d.status IN ('queued', 'sending')
     AND NOT EXISTS (SELECT 1 FROM public._newsletter_eligible(c.topic) e WHERE e.subscription_id = d.subscription_id);
  RETURN QUERY
  WITH picked AS (
    SELECT d.id FROM public.newsletter_deliveries d
     WHERE d.campaign_id = _campaign_id
       AND (d.status = 'queued' OR (d.status = 'sending' AND d.claimed_at < now() - interval '10 minutes'))
     ORDER BY d.id
     LIMIT GREATEST(1, LEAST(_limit, 200))
     FOR UPDATE SKIP LOCKED)
  UPDATE public.newsletter_deliveries d
     SET status = 'sending', claimed_at = now(), attempts = d.attempts + 1
    FROM picked, public.email_subscriptions s
   WHERE d.id = picked.id AND s.id = d.subscription_id
  RETURNING d.id, d.subscription_id, s.email;
END $$;

CREATE OR REPLACE FUNCTION public.newsletter_record_delivery(
  _delivery_id bigint, _ok boolean, _provider_message_id text, _error_code text, _retryable boolean)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.newsletter_deliveries d
     SET status = CASE WHEN _ok THEN 'sent'
                       WHEN _retryable AND d.attempts < 3 THEN 'queued'
                       ELSE 'failed' END,
         sent_at = CASE WHEN _ok THEN now() ELSE d.sent_at END,
         provider_message_id = COALESCE(_provider_message_id, d.provider_message_id),
         error_code = CASE WHEN _ok THEN NULL ELSE left(_error_code, 80) END
   WHERE d.id = _delivery_id AND d.status = 'sending'
$$;

CREATE OR REPLACE FUNCTION public.newsletter_progress(_campaign_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r jsonb;
BEGIN
  SELECT jsonb_build_object(
      'queued',  count(*) FILTER (WHERE status = 'queued'),
      'sending', count(*) FILTER (WHERE status = 'sending'),
      'sent',    count(*) FILTER (WHERE status = 'sent'),
      'failed',  count(*) FILTER (WHERE status = 'failed'),
      'skipped', count(*) FILTER (WHERE status = 'skipped'))
    INTO r FROM public.newsletter_deliveries WHERE campaign_id = _campaign_id;
  IF (r->>'queued')::int = 0 AND (r->>'sending')::int = 0 THEN
    UPDATE public.newsletter_campaigns SET status = 'sent', send_completed_at = now(), updated_at = now()
     WHERE id = _campaign_id AND status = 'sending';
  END IF;
  RETURN r;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Owner-gated admin RPCs (OWN1: public.assert_owner)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_email_subscription_status(_user_ids uuid[])
RETURNS TABLE (user_id uuid, status text, topics text[], pending_topics text[], confirmed_at timestamptz,
               suppressed boolean, address_current boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_owner('trusted'); -- OWN1
  IF _user_ids IS NULL OR cardinality(_user_ids) > 200 THEN RAISE EXCEPTION 'too_many_ids'; END IF;
  RETURN QUERY
  SELECT DISTINCT ON (s.user_id)
         s.user_id, s.status, s.topics, s.pending_topics, s.confirmed_at,
         EXISTS (SELECT 1 FROM public.email_suppressions x WHERE x.email_normalized = s.email_normalized),
         COALESCE(lower(btrim(u.email)) = s.email_normalized, false)
    FROM public.email_subscriptions s
    LEFT JOIN auth.users u ON u.id = s.user_id
   WHERE s.user_id = ANY (_user_ids)
   ORDER BY s.user_id, (lower(btrim(u.email)) = s.email_normalized) DESC NULLS LAST, s.updated_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.admin_email_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE r jsonb;
BEGIN
  PERFORM public.assert_owner('trusted'); -- OWN1
  SELECT jsonb_build_object(
    'by_status', COALESCE((SELECT jsonb_object_agg(status, n) FROM
                     (SELECT status, count(*) n FROM public.email_subscriptions GROUP BY status) q), '{}'::jsonb),
    'eligible_by_topic', jsonb_build_object(
       'daily_reminder', public.newsletter_audience_count('daily_reminder'),
       'product_news',   public.newsletter_audience_count('product_news'),
       'events',         public.newsletter_audience_count('events'),
       'promotions',     public.newsletter_audience_count('promotions')),
    'suppressed', (SELECT count(*) FROM public.email_suppressions),
    'opt_ins_30d', (SELECT count(*) FROM public.email_consent_events
                     WHERE event_type = 'opt_in_confirmed' AND created_at > now() - interval '30 days'),
    'unsubscribes_30d', (SELECT count(*) FROM public.email_consent_events
                          WHERE event_type = 'unsubscribed' AND created_at > now() - interval '30 days')
  ) INTO r;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.admin_email_list_subscribers(
  _status text DEFAULT NULL, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS TABLE (subscription_id uuid, user_id uuid, email text, status text, topics text[],
               confirmed_at timestamptz, unsubscribed_at timestamptz, suppressed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_owner('trusted'); -- OWN1
  IF _status IS NOT NULL AND _status NOT IN ('none', 'pending', 'subscribed', 'unsubscribed', 'suppressed') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;
  -- Reading a mailing list is reading personal data: it leaves an audit row.
  PERFORM public.log_owner_action('newsletter_list_subscribers', NULL, 'ok',
    jsonb_build_object('status', _status, 'limit', _limit, 'offset', _offset));
  RETURN QUERY
  SELECT s.id, s.user_id, s.email, s.status, s.topics, s.confirmed_at, s.unsubscribed_at,
         EXISTS (SELECT 1 FROM public.email_suppressions x WHERE x.email_normalized = s.email_normalized)
    FROM public.email_subscriptions s
   WHERE _status IS NULL OR s.status = _status
   ORDER BY s.updated_at DESC
   LIMIT GREATEST(1, LEAST(_limit, 100)) OFFSET GREATEST(0, _offset);
END $$;

CREATE OR REPLACE FUNCTION public.admin_newsletter_audience(_topic text)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_owner('trusted'); -- OWN1
  IF _topic NOT IN ('daily_reminder', 'product_news', 'events', 'promotions') THEN RAISE EXCEPTION 'invalid_topic'; END IF;
  RETURN public.newsletter_audience_count(_topic);
END $$;

CREATE OR REPLACE FUNCTION public.admin_newsletter_list_campaigns()
RETURNS SETOF public.newsletter_campaigns
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_owner('trusted'); -- OWN1
  RETURN QUERY SELECT * FROM public.newsletter_campaigns ORDER BY created_at DESC LIMIT 100;
END $$;

-- Create (_id NULL) or edit a DRAFT. A ready/sending/sent campaign is frozen:
-- what was approved is what is sent.
CREATE OR REPLACE FUNCTION public.admin_newsletter_save_campaign(
  _id uuid, _name text, _subject text, _preheader text, _body_markdown text, _topic text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _out uuid; _st text;
BEGIN
  PERFORM public.assert_owner('trusted'); -- OWN1
  IF _id IS NULL THEN
    INSERT INTO public.newsletter_campaigns (name, subject, preheader, body_markdown, topic, created_by)
      VALUES (_name, _subject, NULLIF(btrim(_preheader), ''), _body_markdown, _topic, auth.uid())
      RETURNING id INTO _out;
    PERFORM public.log_owner_action('newsletter_campaign_create', NULL, 'ok', jsonb_build_object('campaign_id', _out));
    RETURN _out;
  END IF;
  SELECT status INTO _st FROM public.newsletter_campaigns WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
  IF _st <> 'draft' THEN RAISE EXCEPTION 'campaign_not_editable'; END IF;
  UPDATE public.newsletter_campaigns
     SET name = _name, subject = _subject, preheader = NULLIF(btrim(_preheader), ''),
         body_markdown = _body_markdown, topic = _topic, updated_at = now()
   WHERE id = _id;
  PERFORM public.log_owner_action('newsletter_campaign_update', NULL, 'ok', jsonb_build_object('campaign_id', _id));
  RETURN _id;
END $$;

-- draft -> ready needs a fresh MFA and records the audience the owner saw.
CREATE OR REPLACE FUNCTION public.admin_newsletter_set_status(_id uuid, _status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.newsletter_campaigns%ROWTYPE; _n integer;
BEGIN
  IF _status NOT IN ('draft', 'ready', 'cancelled') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  PERFORM public.assert_owner(CASE WHEN _status = 'ready' THEN 'fresh_aal2' ELSE 'trusted' END); -- OWN1
  SELECT * INTO c FROM public.newsletter_campaigns WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
  IF c.status IN ('sending', 'sent') THEN RAISE EXCEPTION 'campaign_locked'; END IF;
  IF _status = 'ready' THEN
    IF c.status <> 'draft' THEN RAISE EXCEPTION 'campaign_not_draft'; END IF;
    _n := public.newsletter_audience_count(c.topic);
    UPDATE public.newsletter_campaigns
       SET status = 'ready', approved_by = auth.uid(), approved_at = now(), approved_recipient_count = _n, updated_at = now()
     WHERE id = _id;
  ELSIF _status = 'draft' THEN
    UPDATE public.newsletter_campaigns
       SET status = 'draft', approved_by = NULL, approved_at = NULL, approved_recipient_count = NULL, updated_at = now()
     WHERE id = _id AND status IN ('ready', 'cancelled');
  ELSE
    UPDATE public.newsletter_campaigns SET status = 'cancelled', updated_at = now() WHERE id = _id;
  END IF;
  PERFORM public.log_owner_action('newsletter_campaign_' || _status, NULL, 'ok',
    jsonb_build_object('campaign_id', _id, 'audience', _n));
  RETURN jsonb_build_object('result', 'ok', 'status', _status, 'audience', _n);
END $$;

-- ---------------------------------------------------------------------------
-- 7. Function privileges. Supabase grants EXECUTE to PUBLIC by default.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION
  public._email_norm(text), public._email_mask(text), public._email_topics_ok(text[]),
  public._email_log(uuid, uuid, text, text, text[], text, text, text, text, text, text, jsonb),
  public._email_consent_events_immutable(),
  public.email_request_subscription(uuid, text, text[], text, text, text, text, text, text, integer),
  public.email_confirm_subscription(text, text, text),
  public.email_set_topics(uuid, text, text[], text, text),
  public.email_unsubscribe(uuid, text, text, text),
  public.email_unsubscribe_preview(uuid),
  public.email_find_subscription_id(uuid, text),
  public.email_apply_suppression(text, text, text, text),
  public._newsletter_eligible(text),
  public.newsletter_audience_count(text),
  public.newsletter_begin_send(uuid, integer),
  public.newsletter_load_campaign(uuid),
  public.newsletter_claim_batch(uuid, integer),
  public.newsletter_record_delivery(bigint, boolean, text, text, boolean),
  public.newsletter_progress(uuid),
  public.admin_email_subscription_status(uuid[]),
  public.admin_email_stats(),
  public.admin_email_list_subscribers(text, integer, integer),
  public.admin_newsletter_audience(text),
  public.admin_newsletter_list_campaigns(),
  public.admin_newsletter_save_campaign(uuid, text, text, text, text, text),
  public.admin_newsletter_set_status(uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public._email_norm(text), public._email_mask(text), public._email_topics_ok(text[]),
  public._email_log(uuid, uuid, text, text, text[], text, text, text, text, text, text, jsonb),
  public.email_request_subscription(uuid, text, text[], text, text, text, text, text, text, integer),
  public.email_confirm_subscription(text, text, text),
  public.email_set_topics(uuid, text, text[], text, text),
  public.email_unsubscribe(uuid, text, text, text),
  public.email_unsubscribe_preview(uuid),
  public.email_find_subscription_id(uuid, text),
  public.email_apply_suppression(text, text, text, text),
  public._newsletter_eligible(text),
  public.newsletter_audience_count(text),
  public.newsletter_begin_send(uuid, integer),
  public.newsletter_load_campaign(uuid),
  public.newsletter_claim_batch(uuid, integer),
  public.newsletter_record_delivery(bigint, boolean, text, text, boolean),
  public.newsletter_progress(uuid)
  TO service_role;

-- Admin RPCs: browser role may call them, public.assert_owner is the gate.
GRANT EXECUTE ON FUNCTION
  public.admin_email_subscription_status(uuid[]),
  public.admin_email_stats(),
  public.admin_email_list_subscribers(text, integer, integer),
  public.admin_newsletter_audience(text),
  public.admin_newsletter_list_campaigns(),
  public.admin_newsletter_save_campaign(uuid, text, text, text, text, text),
  public.admin_newsletter_set_status(uuid, text)
  TO authenticated, service_role;
