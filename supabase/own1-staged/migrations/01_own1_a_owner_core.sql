-- ===========================================================================
-- OWN1-A — Owner-only control plane: identity, trusted devices, helpers.
--
-- ADDITIVE ONLY. Applying this migration changes no existing authorization:
-- nothing references these helpers until OWN1-B (cutover). It deliberately
-- seeds NO owner. private.owner_config is populated at deployment time by the
-- operator (see docs/OWN1_OWNER_CONTROL_PLANE.md, "Rollout"); until then every
-- helper fails CLOSED (no one is the owner).
-- ===========================================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

-- --- canonical owner (singleton) -------------------------------------------
CREATE TABLE IF NOT EXISTS private.owner_config (
  singleton      boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  owner_user_id  uuid NOT NULL,
  configured_at  timestamptz NOT NULL DEFAULT now(),
  configured_by  text NOT NULL DEFAULT current_user
);
REVOKE ALL ON private.owner_config FROM PUBLIC, anon, authenticated;
GRANT SELECT ON private.owner_config TO service_role;

-- --- trusted devices: only SHA-256 hashes are stored -----------------------
CREATE TABLE IF NOT EXISTS private.owner_trusted_devices (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id      uuid NOT NULL,
  token_hash         bytea NOT NULL UNIQUE,
  label              text NOT NULL DEFAULT 'Trusted device' CHECK (char_length(label) <= 80),
  user_agent         text CHECK (user_agent IS NULL OR char_length(user_agent) <= 400),
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_session_id uuid,
  last_seen_at       timestamptz,
  expires_at         timestamptz NOT NULL,
  revoked_at         timestamptz
);
REVOKE ALL ON private.owner_trusted_devices FROM PUBLIC, anon, authenticated;
GRANT SELECT ON private.owner_trusted_devices TO service_role;

-- Short-lived attestation bound to ONE Supabase auth session (JWT session_id).
CREATE TABLE IF NOT EXISTS private.owner_device_attestations (
  session_id     uuid PRIMARY KEY,
  device_id      uuid NOT NULL REFERENCES private.owner_trusted_devices(id) ON DELETE CASCADE,
  owner_user_id  uuid NOT NULL,
  attested_at    timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL
);
REVOKE ALL ON private.owner_device_attestations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON private.owner_device_attestations TO service_role;

-- --- audit log: additive context columns -----------------------------------
ALTER TABLE public.admin_audit_log ADD COLUMN IF NOT EXISTS aal text;
ALTER TABLE public.admin_audit_log ADD COLUMN IF NOT EXISTS session_id uuid;

-- --- JWT readers -----------------------------------------------------------
CREATE OR REPLACE FUNCTION private.configured_owner_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.owner_user_id FROM private.owner_config c WHERE c.singleton LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.jwt_aal()
RETURNS text LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT COALESCE(auth.jwt() ->> 'aal', 'aal1')
$$;

CREATE OR REPLACE FUNCTION private.jwt_session_id()
RETURNS uuid LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  RETURN NULLIF(auth.jwt() ->> 'session_id', '')::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;

-- Most recent MFA verification time from the JWT `amr` claim.
CREATE OR REPLACE FUNCTION private.jwt_last_mfa_at()
RETURNS timestamptz LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT to_timestamp(max((e ->> 'timestamp')::bigint))
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(auth.jwt() -> 'amr') = 'array' THEN auth.jwt() -> 'amr' ELSE '[]'::jsonb END
  ) e
  WHERE e ->> 'method' IN ('totp', 'phone', 'webauthn')
    AND (e ->> 'timestamp') ~ '^[0-9]+$'
$$;

-- --- owner predicates ------------------------------------------------------
-- Identity only (no assurance level). Internal; not granted to clients.
CREATE OR REPLACE FUNCTION public.is_owner_user(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(_user_id IS NOT NULL AND _user_id = private.configured_owner_id(), false)
$$;

CREATE OR REPLACE FUNCTION private.has_device_attestation()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM private.owner_device_attestations a
    JOIN private.owner_trusted_devices d ON d.id = a.device_id
    WHERE a.session_id = private.jwt_session_id()
      AND a.owner_user_id = auth.uid()
      AND d.owner_user_id = auth.uid()
      AND a.expires_at > now()
      AND d.expires_at > now()
      AND d.revoked_at IS NULL
  )
$$;

CREATE OR REPLACE FUNCTION public.is_owner_aal2()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.is_owner_user(auth.uid()) AND private.jwt_aal() = 'aal2'
$$;

CREATE OR REPLACE FUNCTION public.is_owner_fresh_aal2(_max_age_seconds integer DEFAULT 600)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.is_owner_aal2()
     AND COALESCE(private.jwt_last_mfa_at() >= now() - make_interval(secs => GREATEST(LEAST(_max_age_seconds, 3600), 30)), false)
$$;

-- Admin access: owner AND (aal2 OR a live trusted-device attestation for THIS session).
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.is_owner_user(auth.uid())
     AND (private.jwt_aal() = 'aal2' OR private.has_device_attestation())
$$;

CREATE OR REPLACE FUNCTION public.assert_owner(_level text DEFAULT 'trusted')
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_owner_user(auth.uid()) THEN
    RAISE EXCEPTION 'owner_required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _level = 'trusted' THEN
    IF NOT public.is_owner() THEN
      RAISE EXCEPTION 'step_up_required' USING ERRCODE = 'insufficient_privilege', HINT = 'aal2_or_trusted_device';
    END IF;
  ELSIF _level = 'aal2' THEN
    IF NOT public.is_owner_aal2() THEN
      RAISE EXCEPTION 'step_up_required' USING ERRCODE = 'insufficient_privilege', HINT = 'aal2';
    END IF;
  ELSIF _level = 'fresh_aal2' THEN
    IF NOT public.is_owner_fresh_aal2() THEN
      RAISE EXCEPTION 'step_up_required' USING ERRCODE = 'insufficient_privilege', HINT = 'fresh_aal2';
    END IF;
  ELSE
    RAISE EXCEPTION 'owner_required' USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;

-- Read by the frontend gate and Edge Functions. Booleans only; a non-owner
-- learns nothing about the owner.
CREATE OR REPLACE FUNCTION public.owner_auth_state()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_owner_user(auth.uid()) THEN
    RETURN jsonb_build_object('is_owner', false, 'authorized', false);
  END IF;
  RETURN jsonb_build_object(
    'is_owner', true,
    'aal', private.jwt_aal(),
    'trusted_device', private.has_device_attestation(),
    'authorized', public.is_owner(),
    'fresh_aal2', public.is_owner_fresh_aal2(),
    'session_bound', private.jwt_session_id() IS NOT NULL
  );
END;
$$;

-- Service-role-only: lets Edge Functions cross-check OWNER_USER_ID.
CREATE OR REPLACE FUNCTION public.owner_configured_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.configured_owner_id()
$$;

-- --- durable audit ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_owner_action(
  _action text, _target_profile_id uuid DEFAULT NULL, _result text DEFAULT 'ok', _detail jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _id uuid; _profile uuid;
BEGIN
  IF NOT public.is_owner_user(auth.uid()) THEN
    RAISE EXCEPTION 'owner_required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _action IS NULL OR char_length(_action) > 80 THEN
    RAISE EXCEPTION 'invalid_action' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT p.id INTO _profile FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1;
  INSERT INTO public.admin_audit_log
    (actor_user_id, actor_profile_id, action, target_profile_id, result, detail, aal, session_id)
  VALUES (auth.uid(), _profile, _action, _target_profile_id, COALESCE(left(_result, 80), 'ok'),
          COALESCE(_detail, '{}'::jsonb), private.jwt_aal(), private.jwt_session_id())
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

-- --- trusted-device RPCs ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.owner_device_enroll(_label text DEFAULT NULL, _user_agent text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _token text; _id uuid; _expires timestamptz := now() + interval '30 days';
BEGIN
  PERFORM public.assert_owner('fresh_aal2');
  _token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  INSERT INTO private.owner_trusted_devices
    (owner_user_id, token_hash, label, user_agent, created_session_id, expires_at, last_seen_at)
  VALUES (auth.uid(), extensions.digest(_token, 'sha256'),
          COALESCE(NULLIF(left(btrim(_label), 80), ''), 'Trusted device'),
          left(_user_agent, 400), private.jwt_session_id(), _expires, now())
  RETURNING id INTO _id;
  PERFORM public.log_owner_action('owner_device_enroll', NULL, 'enrolled', jsonb_build_object('device_id', _id));
  -- The plaintext token is returned exactly once and never stored.
  RETURN jsonb_build_object('device_id', _id, 'token', _token, 'expires_at', _expires);
END;
$$;

CREATE OR REPLACE FUNCTION public.owner_device_attest(_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _session uuid := private.jwt_session_id(); _dev private.owner_trusted_devices%ROWTYPE; _exp timestamptz;
BEGIN
  IF NOT public.is_owner_user(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_owner');
  END IF;
  IF _session IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_session');
  END IF;
  IF _token IS NULL OR char_length(_token) NOT BETWEEN 32 AND 128 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_device');
  END IF;
  SELECT * INTO _dev FROM private.owner_trusted_devices d
  WHERE d.token_hash = extensions.digest(_token, 'sha256')
    AND d.owner_user_id = auth.uid()
    AND d.revoked_at IS NULL
    AND d.expires_at > now();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_device');
  END IF;
  _exp := LEAST(now() + interval '15 minutes', _dev.expires_at);
  INSERT INTO private.owner_device_attestations (session_id, device_id, owner_user_id, expires_at)
  VALUES (_session, _dev.id, auth.uid(), _exp)
  ON CONFLICT (session_id) DO UPDATE
    SET device_id = EXCLUDED.device_id, attested_at = now(), expires_at = EXCLUDED.expires_at
    WHERE private.owner_device_attestations.owner_user_id = auth.uid();
  UPDATE private.owner_trusted_devices SET last_seen_at = now() WHERE id = _dev.id;
  RETURN jsonb_build_object('ok', true, 'device_id', _dev.id, 'expires_at', _exp);
END;
$$;

CREATE OR REPLACE FUNCTION public.owner_device_list()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_owner('aal2');
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', d.id, 'label', d.label, 'user_agent', d.user_agent, 'created_at', d.created_at,
      'last_seen_at', d.last_seen_at, 'expires_at', d.expires_at, 'revoked_at', d.revoked_at)
      ORDER BY d.created_at DESC)
    FROM private.owner_trusted_devices d WHERE d.owner_user_id = auth.uid()), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.owner_device_revoke(_device_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _n integer;
BEGIN
  PERFORM public.assert_owner('fresh_aal2');
  UPDATE private.owner_trusted_devices SET revoked_at = now()
  WHERE id = _device_id AND owner_user_id = auth.uid() AND revoked_at IS NULL;
  GET DIAGNOSTICS _n = ROW_COUNT;
  DELETE FROM private.owner_device_attestations WHERE device_id = _device_id;
  PERFORM public.log_owner_action('owner_device_revoke', NULL, CASE WHEN _n > 0 THEN 'revoked' ELSE 'noop' END,
                                  jsonb_build_object('device_id', _device_id));
  RETURN jsonb_build_object('ok', _n > 0);
END;
$$;

-- --- EXECUTE grants: deny by default, open only what clients need ----------
REVOKE ALL ON FUNCTION private.configured_owner_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.has_device_attestation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_owner_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.owner_configured_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_configured_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_owner_user(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.is_owner() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_owner_aal2() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_owner_fresh_aal2(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assert_owner(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owner_auth_state() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_owner_action(text, uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owner_device_enroll(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owner_device_attest(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owner_device_list() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owner_device_revoke(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_owner_aal2() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_owner_fresh_aal2(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_owner(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owner_auth_state() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_owner_action(text, uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owner_device_enroll(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_device_attest(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_device_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_device_revoke(uuid) TO authenticated;
