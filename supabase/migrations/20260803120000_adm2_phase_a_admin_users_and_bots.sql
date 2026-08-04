-- ===========================================================================
-- ADM2 Phase A — master-admin user observation and bot-persona management.
--
-- SCOPE
--   1. public.admin_audit_log                 (new table)
--   2. public.profiles.is_disabled            (new nullable column)
--   3. public.protect_profile_premium_fields  (REPLACE: protect is_disabled)
--   4. public.enforce_friendship_rules        (REPLACE: narrow master-admin exemption)
--   5. public.get_league_profiles(uuid[])     (DROP+CREATE: +1 boolean column)
--   6. public.is_bot_available(uuid)          (new helper, consumed by Phase B)
--   7. public.admin_link_friendship(uuid)     (new RPC)
--   8. public.admin_create_bot_profile(...)   (new RPC)
--   9. public.admin_update_bot_profile(...)   (new RPC)
--  10. app_settings 'show_bot_labels'         (new row, default false)
--
-- NO DATA IS DELETED. No column is dropped. No table is dropped. No RLS policy
-- is removed or weakened. notify_on_friendship_change is NOT modified.
--
-- APPLY AS `postgres`, IN THE SUPABASE SQL EDITOR, WRAPPED IN BEGIN/COMMIT.
-- Do NOT use `supabase db push`: the repo and the remote ledger have 117
-- drifted versions and a push would replay them.
--
-- PRECONDITIONS -- verify with supabase/verification/phase0_adm2_preconditions.sql
-- before applying. Section 4 below rewrites enforce_friendship_rules and
-- section 7 depends on notify_on_friendship_change having its documented shape.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Admin audit log
-- ---------------------------------------------------------------------------
-- The platform has no admin action audit trail today. admin_notifications is a
-- moderation inbox, not an audit log, and the only existing audit artifact is a
-- console.log line in the admin-user-actions edge function.
--
-- actor_user_id is stored because it is the only identifier that survives a
-- profile deletion, but it is NEVER returned to a browser: every read path in
-- this migration and in the frontend selects the profile columns instead.
--
-- Profile references use ON DELETE SET NULL rather than CASCADE. Deleting a
-- profile must not erase the record that an admin acted on it.
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id      uuid NOT NULL,
  actor_profile_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action             text NOT NULL,
  target_profile_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  result             text NOT NULL,
  detail             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx
  ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx
  ON public.admin_audit_log (target_profile_id, created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Read: admins only (has_role already treats master_admin as a superset).
-- There is deliberately NO INSERT, UPDATE or DELETE policy. Under RLS a table
-- with no policy for a command denies that command to every non-owner role, so
-- the only writers are the SECURITY DEFINER functions below, which are owned by
-- postgres and therefore bypass RLS. A client cannot forge, alter or erase an
-- audit row even with a valid admin session.
DROP POLICY IF EXISTS "Admins can read the audit log" ON public.admin_audit_log;
CREATE POLICY "Admins can read the audit log"
  ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- CORRECTION (ADM3): `authenticated` MUST be in the REVOKE list. This project's
-- ALTER DEFAULT PRIVILEGES grants arwdDxtm at table level to new public tables
-- for anon AND authenticated alike (documented in 20260730150000). Revoking from
-- PUBLIC and anon only left `authenticated` holding INSERT, UPDATE, DELETE,
-- TRUNCATE, REFERENCES and TRIGGER by inheritance -- confirmed live on the first
-- production apply, where post-apply checks 30/31/32 all read true.
--
-- The absence of a write POLICY does not save us here: a table grant and an RLS
-- policy are independent gates, and "no policy" only denies the command to roles
-- that reach RLS at all. With the grant present, an authenticated client could
-- have forged, rewritten or TRUNCATEd audit rows.
--
-- REVOKE ALL rather than an enumerated list, deliberately: the enumeration would
-- have to track MAINTAIN (PostgreSQL 17) and anything a future major adds. ALL is
-- complete by construction and version-independent. SELECT is then re-granted.
REVOKE ALL ON TABLE public.admin_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.admin_audit_log TO authenticated;

COMMENT ON TABLE public.admin_audit_log IS
  'Append-only record of privileged admin actions. Written only by SECURITY '
  'DEFINER admin functions; readable by admins; never writable from a client. '
  'actor_user_id is retained for forensics and must never be surfaced to a browser.';

-- Runtime assertion, in-transaction. The default-privileges trap is silent --
-- RLS probes and policy counts all pass while the grant is still open -- so the
-- grant state is asserted directly rather than inferred.
DO $assert_audit_grants$
DECLARE
  _priv text;
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.admin_audit_log', 'SELECT') THEN
    RAISE EXCEPTION 'ADM2 Phase A: authenticated must retain SELECT on admin_audit_log';
  END IF;

  FOREACH _priv IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']
  LOOP
    IF has_table_privilege('authenticated', 'public.admin_audit_log', _priv) THEN
      RAISE EXCEPTION 'ADM2 Phase A: authenticated still holds % on admin_audit_log -- the audit log would be forgeable', _priv;
    END IF;
    IF has_table_privilege('anon', 'public.admin_audit_log', _priv) THEN
      RAISE EXCEPTION 'ADM2 Phase A: anon still holds % on admin_audit_log', _priv;
    END IF;
  END LOOP;

  IF has_table_privilege('anon', 'public.admin_audit_log', 'SELECT') THEN
    RAISE EXCEPTION 'ADM2 Phase A: anon must have no access to admin_audit_log';
  END IF;
END
$assert_audit_grants$;


-- ---------------------------------------------------------------------------
-- 2. Soft-disable flag
-- ---------------------------------------------------------------------------
-- Phase A gives this column meaning ONLY for bot personas (is_bot = true). It
-- exists so a demo bot can be retired without deleting the profile, its
-- friendships, or any historical reference to it.
--
-- It is explicitly NOT a user ban / suspension mechanism. Moderation bans are
-- out of scope; nothing in this migration or in the Phase A frontend ever sets
-- this column on a non-bot profile, and admin_update_bot_profile refuses any
-- target whose is_bot is not true.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_disabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_disabled IS
  'Bot-persona soft-disable. Phase A scope: bots only (is_bot = true). A '
  'disabled bot keeps its profile, friendships and history but is withheld from '
  'ordinary user-facing surfaces and from new admin friend links, and Phase B '
  'will refuse to seat it in Stat Check. NOT a user ban mechanism.';


-- ---------------------------------------------------------------------------
-- 3. Protect is_disabled from non-admin writes
-- ---------------------------------------------------------------------------
-- protect_profile_premium_fields is the existing BEFORE UPDATE trigger that
-- restores privileged columns to their OLD value for non-admin writers. The new
-- column joins that list, so an ordinary user cannot set is_disabled on their
-- own row via a direct PostgREST update.
--
-- This is the ONLY change to this function: one added line. Every other line is
-- reproduced verbatim from 20260514052932_09a8480f-0a62-428a-951f-b383fb177b7c.sql,
-- the most recent definition, which is also the rollback text.
--
-- CORRECTION (ADM3): an earlier draft of this section was copied from the March
-- definition (20260312113949) instead, which silently reverted two later fixes:
--
--   * 20260514052932 added the `auth.uid() IS NOT NULL AND` guard so that
--     service-role and SECURITY DEFINER server writes (which have no auth.uid())
--     are NOT clamped. has_role() is SELECT EXISTS(...), so has_role(NULL,'admin')
--     is false, not NULL -- without the guard the trigger reverts every
--     service-role write. stripe-webhook updates profiles.is_pro with the
--     service-role key, so Pro subscription sync would have failed silently.
--   * 20260514051208 added active_boost_until to the protected list. Dropping it
--     would let a non-admin set their own boost expiry via PostgREST.
--
-- Both are restored below. The live production body was re-confirmed to carry
-- the guard and the active_boost_until line before this correction was written.
CREATE OR REPLACE FUNCTION public.protect_profile_premium_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Allow service-role / SECURITY DEFINER server writes (no auth.uid()) and admins
  IF auth.uid() IS NOT NULL AND NOT has_role(auth.uid(), 'admin') THEN
    NEW.is_pro := OLD.is_pro;
    NEW.diamonds := OLD.diamonds;
    NEW.boost_credits := OLD.boost_credits;
    NEW.elo_shields := OLD.elo_shields;
    NEW.reveals := OLD.reveals;
    NEW.rewinds := OLD.rewinds;
    NEW.is_bot := OLD.is_bot;
    NEW.is_disabled := OLD.is_disabled;   -- ADM2 Phase A
    NEW.is_flagged_underage := OLD.is_flagged_underage;
    NEW.admin_notes := OLD.admin_notes;
    NEW.ads_enabled := OLD.ads_enabled;
    NEW.active_boost_until := OLD.active_boost_until;
  END IF;
  RETURN NEW;
END;
$function$;

-- Static assertion, in-transaction. If this section is ever regressed again the
-- whole migration aborts rather than shipping a silently weakened trigger.
DO $assert_protect$
DECLARE
  _def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'protect_profile_premium_fields';

  IF _def IS NULL THEN
    RAISE EXCEPTION 'ADM2 Phase A: protect_profile_premium_fields is missing after CREATE';
  END IF;

  -- 1. service-role writes must remain unclamped
  IF _def NOT ILIKE '%auth.uid() IS NOT NULL AND%' THEN
    RAISE EXCEPTION 'ADM2 Phase A: the service-role guard (auth.uid() IS NOT NULL AND ...) is missing -- service-role writes such as the stripe-webhook is_pro sync would be silently reverted';
  END IF;

  -- 2. active_boost_until must remain protected
  IF _def NOT ILIKE '%NEW.active_boost_until := OLD.active_boost_until%' THEN
    RAISE EXCEPTION 'ADM2 Phase A: active_boost_until protection is missing -- a non-admin could self-grant an unlimited boost';
  END IF;

  -- 3. the new column must be protected
  IF _def NOT ILIKE '%NEW.is_disabled := OLD.is_disabled%' THEN
    RAISE EXCEPTION 'ADM2 Phase A: is_disabled protection is missing -- a non-admin could soft-disable their own row';
  END IF;
END
$assert_protect$;


-- ---------------------------------------------------------------------------
-- 4. Narrow master-admin exemption in the friendship guard
-- ---------------------------------------------------------------------------
-- The live INSERT branch rejects ANY row whose status is not 'pending', with no
-- admin bypass. That is why an admin-created accepted friendship is impossible
-- today for the browser, for service_role, and for a postgres-owned SECURITY
-- DEFINER function alike -- triggers fire regardless of role and regardless of
-- RLS.
--
-- The exemption below is the minimum that unblocks "Add to My Friends":
--
--   * the actor must hold master_admin  (is_master_admin, NOT has_role, so a
--     plain admin is still refused), AND
--   * the new row's status must be exactly 'accepted', AND
--   * NEW.requester_id must be the actor's OWN profile.
--
-- The third condition is what prevents a master admin from fabricating a
-- friendship between two third parties: they can only link themselves.
--
-- Everything else is preserved verbatim: the block check, the per-hour and
-- outstanding-request rate limits (which continue to apply to the ordinary
-- pending path), party immutability, and the legal-transition guard. The
-- friendships_no_self CHECK, the status CHECK and the partial live-pair unique
-- index are table constraints and are untouched, so they still apply to the
-- exempted row.
--
-- No GUC / session flag is used. There is deliberately no token an attacker
-- could forge: the exemption is a pure function of is_master_admin(auth.uid())
-- and the actor's own profile id.
CREATE OR REPLACE FUNCTION public.enforce_friendship_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _recent int;
  _open   int;
  _admin_self_link boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- ADM2 Phase A: master-admin linking THEMSELVES to a target, accepted.
    _admin_self_link :=
      NEW.status = 'accepted'
      AND auth.uid() IS NOT NULL
      AND public.is_master_admin(auth.uid())
      AND NEW.requester_id = (
        SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
      );

    IF NEW.status IS DISTINCT FROM 'pending' AND NOT _admin_self_link THEN
      RAISE EXCEPTION 'a new friendship must start as pending'
        USING ERRCODE = 'check_violation';
    END IF;

    IF public.is_blocked_between(NEW.requester_id, NEW.addressee_id) THEN
      RAISE EXCEPTION 'friend request refused: a block exists between these profiles'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Rate limits apply to the ordinary pending path. An admin self-link is a
    -- deliberate, audited, one-at-a-time action and is not a request burst.
    IF NOT _admin_self_link THEN
      SELECT count(*) INTO _recent
      FROM public.friendships f
      WHERE f.requester_id = NEW.requester_id
        AND f.created_at > now() - interval '1 hour';
      IF _recent >= 10 THEN
        RAISE EXCEPTION 'friend request rate limit exceeded (max 10 per hour)'
          USING ERRCODE = 'check_violation';
      END IF;

      SELECT count(*) INTO _open
      FROM public.friendships f
      WHERE f.requester_id = NEW.requester_id
        AND f.status = 'pending';
      IF _open >= 20 THEN
        RAISE EXCEPTION 'too many open friend requests (max 20 outstanding)'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.requester_id <> OLD.requester_id
       OR NEW.addressee_id <> OLD.addressee_id THEN
      RAISE EXCEPTION 'friendship parties are immutable'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined')) THEN
      RAISE EXCEPTION 'illegal friendship transition: % -> %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_friendship_rules() FROM PUBLIC, anon, authenticated;

-- NOTE: public.notify_on_friendship_change is deliberately NOT modified.
-- Its INSERT branch fires only for status = 'pending' and its UPDATE branch
-- only for a transition into 'accepted'. A direct accepted INSERT matches
-- neither, so an admin-created friendship is silent by construction and no
-- false "sent you a friend request" or "accepted your friend request"
-- notification can be produced.


-- ---------------------------------------------------------------------------
-- 5. Publish is_disabled on the League profile contract
-- ---------------------------------------------------------------------------
-- get_league_profiles is the SECURITY DEFINER RPC serving cross-user League
-- profile reads. Its fixed RETURNS TABLE list is the safety boundary, so any
-- change to it is deliberate and narrow.
--
-- WHY THIS COLUMN IS ADDED
--   Soft-disable must remove a retired bot from the owner's friends drawer.
--   Filtering the ROW out instead would make useFriends fall through to its
--   "Unknown" placeholder and render a ghost friend card, which is worse than
--   showing the bot. Publishing the flag lets the drawer drop the entry cleanly.
--
-- WHY IT IS SAFE
--   is_bot is already published in this contract, and is_disabled is strictly
--   less sensitive: it is an operational flag whose Phase A meaning is confined
--   to synthetic bot personas and which is false for every human row.
--
--   user_id remains ABSENT. That decision stands independently of the AUTH1
--   quiz-write fix, because routes/supabase_auth.py:resolve_user_id still
--   carries the legacy client-supplied fallback on READ paths.
--
-- CREATE OR REPLACE cannot change a function's return type, so this is a
-- DROP + CREATE. Inside the BEGIN/COMMIT block that is atomic -- no caller ever
-- observes the function missing. The REVOKE/GRANT pair must be re-applied
-- because a freshly created function inherits this project's permissive
-- ALTER DEFAULT PRIVILEGES.
DROP FUNCTION IF EXISTS public.get_league_profiles(uuid[]);

CREATE FUNCTION public.get_league_profiles(_profile_ids uuid[])
RETURNS TABLE (
  id            uuid,
  display_name  text,
  avatar_url    text,
  profile_frame text,
  is_pro        boolean,
  is_bot        boolean,
  is_anonymous  boolean,
  created_at    timestamptz,
  is_disabled   boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id,
         p.display_name,
         p.avatar_url,
         p.profile_frame,
         p.is_pro,
         p.is_bot,
         p.is_anonymous,
         p.created_at,
         COALESCE(p.is_disabled, false)
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.id = ANY(_profile_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_blocks b
      JOIN public.profiles me ON me.user_id = auth.uid()
      WHERE (b.blocker_profile_id = p.id  AND b.blocked_profile_id = me.id)
         OR (b.blocker_profile_id = me.id AND b.blocked_profile_id = p.id)
    )
  LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.get_league_profiles(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_league_profiles(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.get_league_profiles(uuid[]) IS
  'Authenticated cross-user League profile reads. Returns the approved League '
  'contract for the given profile ids, excluding profiles blocked in either '
  'direction. Deliberately omits user_id. is_disabled (ADM2 Phase A) is a '
  'bot-persona soft-disable flag and is false for every human profile.';


-- ---------------------------------------------------------------------------
-- 6. Bot availability helper
-- ---------------------------------------------------------------------------
-- The single authoritative answer to "may this bot persona be used?". Phase A
-- calls it from admin_link_friendship. Phase B's Stat Check invite path will
-- call it (through services/community_identity.py) before seating a bot, so
-- there is exactly one definition of bot availability across both phases.
--
-- SECURITY DEFINER because a caller cannot read another profile's row under RLS.
-- It returns a bare boolean and discloses nothing else: an id that does not
-- exist, is not a bot, or is disabled all yield false, indistinguishably.
CREATE OR REPLACE FUNCTION public.is_bot_available(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _profile_id
      AND COALESCE(p.is_bot, false) = true
      AND COALESCE(p.is_disabled, false) = false
  ) AND auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.is_bot_available(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_bot_available(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 7. Add to My Friends
-- ---------------------------------------------------------------------------
-- Creates an accepted friendship between the CALLING master admin and a target
-- profile. Every input except the target profile id is derived server-side.
--
-- RESULT CONTRACT -- jsonb { ok boolean, code text, friendship_id uuid|null }
--   created         a new accepted friendship row was inserted
--   already_friends an accepted row already joined the pair (either direction)
--   pending_exists  a pending row exists; NOT altered -- resolve it normally
--   self            the target is the actor's own profile
--   blocked         a block exists in one or both directions
--   target_not_found no such profile
--   target_disabled  the target is a soft-disabled bot persona
--   no_actor_profile the actor account has no profiles row
--
-- Business outcomes RETURN rather than RAISE, so the audit row commits with
-- them. `forbidden` is the one exception: it RAISES, because returning would
-- let a non-admin append rows to the audit table at will.
--
-- Never accepts a client-supplied actor id. Never returns an auth user id.
CREATE OR REPLACE FUNCTION public.admin_link_friendship(_target_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor_uid     uuid := auth.uid();
  _actor_profile uuid;
  _target_is_bot boolean;
  _target_off    boolean;
  _existing      record;
  _new_id        uuid;
  _code          text;
BEGIN
  IF _actor_uid IS NULL OR NOT public.is_master_admin(_actor_uid) THEN
    RAISE EXCEPTION 'master_admin authorization required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT p.id INTO _actor_profile
  FROM public.profiles p WHERE p.user_id = _actor_uid LIMIT 1;

  IF _actor_profile IS NULL THEN
    INSERT INTO public.admin_audit_log
      (actor_user_id, actor_profile_id, action, target_profile_id, result, detail)
    VALUES (_actor_uid, NULL, 'admin_link_friendship', _target_profile_id,
            'no_actor_profile', '{}'::jsonb);
    RETURN jsonb_build_object('ok', false, 'code', 'no_actor_profile',
                              'friendship_id', NULL);
  END IF;

  SELECT COALESCE(p.is_bot, false), COALESCE(p.is_disabled, false)
    INTO _target_is_bot, _target_off
  FROM public.profiles p WHERE p.id = _target_profile_id;

  IF NOT FOUND THEN
    _code := 'target_not_found';
  ELSIF _target_profile_id = _actor_profile THEN
    _code := 'self';
  ELSIF _target_is_bot AND _target_off THEN
    _code := 'target_disabled';
  ELSIF public.is_blocked_between(_actor_profile, _target_profile_id) THEN
    _code := 'blocked';
  END IF;

  IF _code IS NOT NULL THEN
    INSERT INTO public.admin_audit_log
      (actor_user_id, actor_profile_id, action, target_profile_id, result, detail)
    VALUES (_actor_uid, _actor_profile, 'admin_link_friendship',
            CASE WHEN _code = 'target_not_found' THEN NULL ELSE _target_profile_id END,
            _code, jsonb_build_object('requested_target', _target_profile_id));
    RETURN jsonb_build_object('ok', false, 'code', _code, 'friendship_id', NULL);
  END IF;

  -- Direction-agnostic: the M2 partial unique index guarantees at most one live
  -- row per pair, so this finds it whichever way round it was stored.
  SELECT f.id, f.status INTO _existing
  FROM public.friendships f
  WHERE f.status IN ('pending', 'accepted')
    AND least(f.requester_id, f.addressee_id)
        = least(_actor_profile, _target_profile_id)
    AND greatest(f.requester_id, f.addressee_id)
        = greatest(_actor_profile, _target_profile_id)
  LIMIT 1;

  IF FOUND AND _existing.status = 'accepted' THEN
    INSERT INTO public.admin_audit_log
      (actor_user_id, actor_profile_id, action, target_profile_id, result, detail)
    VALUES (_actor_uid, _actor_profile, 'admin_link_friendship', _target_profile_id,
            'already_friends', jsonb_build_object('friendship_id', _existing.id));
    RETURN jsonb_build_object('ok', true, 'code', 'already_friends',
                              'friendship_id', _existing.id);
  END IF;

  IF FOUND AND _existing.status = 'pending' THEN
    -- A real person's pending request is never silently converted. Accepting or
    -- declining it is an ordinary Community action and stays with the parties.
    INSERT INTO public.admin_audit_log
      (actor_user_id, actor_profile_id, action, target_profile_id, result, detail)
    VALUES (_actor_uid, _actor_profile, 'admin_link_friendship', _target_profile_id,
            'pending_exists', jsonb_build_object('friendship_id', _existing.id));
    RETURN jsonb_build_object('ok', false, 'code', 'pending_exists',
                              'friendship_id', _existing.id);
  END IF;

  -- Direct accepted insert. Permitted by the section-4 exemption; produces no
  -- notification because notify_on_friendship_change matches neither branch.
  INSERT INTO public.friendships (requester_id, addressee_id, status)
  VALUES (_actor_profile, _target_profile_id, 'accepted')
  RETURNING id INTO _new_id;

  INSERT INTO public.admin_audit_log
    (actor_user_id, actor_profile_id, action, target_profile_id, result, detail)
  VALUES (_actor_uid, _actor_profile, 'admin_link_friendship', _target_profile_id,
          'created', jsonb_build_object('friendship_id', _new_id,
                                        'target_is_bot', _target_is_bot));

  RETURN jsonb_build_object('ok', true, 'code', 'created', 'friendship_id', _new_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_link_friendship(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_link_friendship(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 8. Create a bot persona
-- ---------------------------------------------------------------------------
-- Creates a profile row with is_bot = true and, optionally, links it to the
-- calling master admin's friends in the SAME transaction.
--
-- NO auth.users ROW IS CREATED. No login is provisioned. No JWT is minted.
-- profiles.user_id is NOT NULL, so a random uuid is generated to satisfy the
-- column. That value is fabricated legacy storage, it has no corresponding
-- auth.users row, it is never treated as authentication identity, and it is
-- never returned by this function or exposed to any client.
--
-- RESULT -- jsonb { ok, code, profile_id, friendship jsonb|null }
--   code: 'created' | 'invalid_display_name'
--   friendship: the verbatim admin_link_friendship result, or null when
--               _add_to_my_friends was false.
--
-- Two audit rows are written when auto-friend is requested -- one for the bot
-- creation and one from admin_link_friendship -- so the trail records two
-- distinct actions even though one HTTP call carried them.
CREATE OR REPLACE FUNCTION public.admin_create_bot_profile(
  _display_name   text,
  _avatar_url     text    DEFAULT NULL,
  _profile_frame  text    DEFAULT NULL,
  _add_to_my_friends boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor_uid     uuid := auth.uid();
  _actor_profile uuid;
  _name          text := btrim(COALESCE(_display_name, ''));
  _new_profile   uuid;
  _friend_result jsonb := NULL;
BEGIN
  IF _actor_uid IS NULL OR NOT public.is_master_admin(_actor_uid) THEN
    RAISE EXCEPTION 'master_admin authorization required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT p.id INTO _actor_profile
  FROM public.profiles p WHERE p.user_id = _actor_uid LIMIT 1;

  IF _name = '' OR length(_name) > 60 THEN
    INSERT INTO public.admin_audit_log
      (actor_user_id, actor_profile_id, action, target_profile_id, result, detail)
    VALUES (_actor_uid, _actor_profile, 'admin_create_bot_profile', NULL,
            'invalid_display_name', '{}'::jsonb);
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_display_name',
                              'profile_id', NULL, 'friendship', NULL);
  END IF;

  INSERT INTO public.profiles (user_id, display_name, avatar_url,
                               profile_frame, is_bot, is_disabled)
  VALUES (gen_random_uuid(), _name,
          NULLIF(btrim(COALESCE(_avatar_url, '')), ''),
          NULLIF(btrim(COALESCE(_profile_frame, '')), ''),
          true, false)
  RETURNING id INTO _new_profile;

  INSERT INTO public.admin_audit_log
    (actor_user_id, actor_profile_id, action, target_profile_id, result, detail)
  VALUES (_actor_uid, _actor_profile, 'admin_create_bot_profile', _new_profile,
          'created', jsonb_build_object('display_name', _name,
                                        'auto_friend_requested', _add_to_my_friends));

  IF _add_to_my_friends THEN
    -- Reuse, never duplicate: there is exactly one place a friendship is
    -- admin-created, and it writes its own audit row.
    _friend_result := public.admin_link_friendship(_new_profile);
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', 'created',
                            'profile_id', _new_profile,
                            'friendship', _friend_result);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_bot_profile(text, text, text, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_bot_profile(text, text, text, boolean)
  TO authenticated;


-- ---------------------------------------------------------------------------
-- 9. Edit / disable / re-enable a bot persona
-- ---------------------------------------------------------------------------
-- Only the four presentation-and-state fields are writable. is_bot is NOT a
-- parameter, so this path can never demote a bot to a real user, and the target
-- must already be a bot, so it can never promote a real user to one.
--
-- NULL arguments mean "leave unchanged", which lets the toggle switch call the
-- same function as the edit form.
--
-- RESULT -- jsonb { ok, code, profile_id }
--   code: 'updated' | 'not_a_bot' | 'invalid_display_name'
CREATE OR REPLACE FUNCTION public.admin_update_bot_profile(
  _profile_id     uuid,
  _display_name   text    DEFAULT NULL,
  _avatar_url     text    DEFAULT NULL,
  _profile_frame  text    DEFAULT NULL,
  _is_disabled    boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor_uid     uuid := auth.uid();
  _actor_profile uuid;
  _is_bot        boolean;
  _was_disabled  boolean;
  _name          text := NULLIF(btrim(COALESCE(_display_name, '')), '');
BEGIN
  IF _actor_uid IS NULL OR NOT public.is_master_admin(_actor_uid) THEN
    RAISE EXCEPTION 'master_admin authorization required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT p.id INTO _actor_profile
  FROM public.profiles p WHERE p.user_id = _actor_uid LIMIT 1;

  SELECT COALESCE(p.is_bot, false), COALESCE(p.is_disabled, false)
    INTO _is_bot, _was_disabled
  FROM public.profiles p WHERE p.id = _profile_id;

  IF NOT FOUND OR NOT _is_bot THEN
    INSERT INTO public.admin_audit_log
      (actor_user_id, actor_profile_id, action, target_profile_id, result, detail)
    VALUES (_actor_uid, _actor_profile, 'admin_update_bot_profile', NULL,
            'not_a_bot', jsonb_build_object('requested_target', _profile_id));
    RETURN jsonb_build_object('ok', false, 'code', 'not_a_bot', 'profile_id', NULL);
  END IF;

  IF _display_name IS NOT NULL AND (_name IS NULL OR length(_name) > 60) THEN
    INSERT INTO public.admin_audit_log
      (actor_user_id, actor_profile_id, action, target_profile_id, result, detail)
    VALUES (_actor_uid, _actor_profile, 'admin_update_bot_profile', _profile_id,
            'invalid_display_name', '{}'::jsonb);
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_display_name',
                              'profile_id', _profile_id);
  END IF;

  UPDATE public.profiles p SET
    display_name  = COALESCE(_name, p.display_name),
    avatar_url    = CASE WHEN _avatar_url IS NULL THEN p.avatar_url
                         ELSE NULLIF(btrim(_avatar_url), '') END,
    profile_frame = CASE WHEN _profile_frame IS NULL THEN p.profile_frame
                         ELSE NULLIF(btrim(_profile_frame), '') END,
    is_disabled   = COALESCE(_is_disabled, p.is_disabled)
  WHERE p.id = _profile_id;

  INSERT INTO public.admin_audit_log
    (actor_user_id, actor_profile_id, action, target_profile_id, result, detail)
  VALUES (_actor_uid, _actor_profile,
          CASE WHEN _is_disabled IS DISTINCT FROM NULL
                    AND _is_disabled IS DISTINCT FROM _was_disabled
               THEN CASE WHEN _is_disabled THEN 'admin_disable_bot'
                                           ELSE 'admin_enable_bot' END
               ELSE 'admin_update_bot_profile' END,
          _profile_id, 'updated',
          jsonb_build_object('display_name_changed', _name IS NOT NULL,
                             'avatar_changed', _avatar_url IS NOT NULL,
                             'frame_changed', _profile_frame IS NOT NULL,
                             'disabled_from', _was_disabled,
                             'disabled_to', COALESCE(_is_disabled, _was_disabled)));

  RETURN jsonb_build_object('ok', true, 'code', 'updated', 'profile_id', _profile_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_bot_profile(uuid, text, text, text, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_bot_profile(uuid, text, text, text, boolean)
  TO authenticated;


-- ---------------------------------------------------------------------------
-- 10. Bot-label platform policy
-- ---------------------------------------------------------------------------
-- One more row in the EXISTING public.app_settings key/value store. Reads stay
-- public under the existing SELECT policy; writes stay admin-only under the
-- existing has_role INSERT/UPDATE policies; updated_by is stamped by the
-- existing stamp_app_settings_audit trigger from auth.uid(). No new settings
-- system, no new table, no new authorization model.
--
-- DEFAULT false, and this is the one policy key whose default is NOT true.
-- That is deliberate and it is what reproduces current production behaviour:
-- verified across origin/main, there is NO user-facing bot label anywhere
-- today. profiles.is_bot is read only for SEO noindex on /user/:profileId and
-- for admin analytics filtering. This toggle therefore INTRODUCES the "on"
-- path; it does not suppress an existing one, so false cannot be a regression.
--
-- ON CONFLICT DO NOTHING: re-running is a no-op and never resets a value an
-- admin has already changed.
INSERT INTO public.app_settings (key, value) VALUES
  ('show_bot_labels', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;
