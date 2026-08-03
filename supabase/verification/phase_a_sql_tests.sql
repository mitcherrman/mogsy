-- ===========================================================================
-- ADM2 Phase A — SQL behaviour tests.
--
-- ⚠  RUN ON A SCRATCH SUPABASE PROJECT ONLY. NEVER ON PRODUCTION.
--    It creates profiles, roles, blocks and friendships. It ends in ROLLBACK so
--    nothing survives a successful run — but an interrupted run on production
--    would leave test rows behind, and the `forbidden` cases deliberately
--    provoke exceptions.
--
-- PREREQUISITE
--    Apply every repo migration INCLUDING
--    20260803120000_adm2_phase_a_admin_users_and_bots.sql to the scratch project
--    first.
--
-- HOW IT WORKS
--    auth.uid() reads the `request.jwt.claims` GUC. `impersonate()` sets it, so
--    each block runs as a chosen account exactly as PostgREST would present it.
--    Every assertion RAISEs on failure; reaching the final NOTICE means all
--    passed.
--
-- HOW TO RUN
--    Paste the whole file into the SQL Editor and Run. Expect the final
--    "ALL PHASE A SQL TESTS PASSED" notice. Any other outcome is a failure and
--    the message names the assertion.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.impersonate(_uid uuid) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
                    json_build_object('sub', _uid::text, 'role', 'authenticated')::text,
                    true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.anonymous() RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert(_cond boolean, _what text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF _cond IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAILED: %', _what;
  END IF;
END;
$$;

DO $outer$
DECLARE
  -- Auth ids (scratch only; no auth.users rows are needed because
  -- public.profiles.user_id has no FK to auth.users).
  master_uid  uuid := '00000000-0000-4000-8000-000000000001';
  admin_uid   uuid := '00000000-0000-4000-8000-000000000002';
  plain_uid   uuid := '00000000-0000-4000-8000-000000000003';
  other_uid   uuid := '00000000-0000-4000-8000-000000000004';
  blocker_uid uuid := '00000000-0000-4000-8000-000000000005';

  master_p  uuid; admin_p uuid; plain_p uuid; other_p uuid; blocker_p uuid;
  bot_p     uuid; bot2_p  uuid; offbot_p uuid;
  r         jsonb;
  n         int;
  notif_before int;
  audit_before int;
  ok        boolean;
BEGIN
  -- -------------------------------------------------------------------------
  -- Fixtures
  -- -------------------------------------------------------------------------
  INSERT INTO public.profiles (user_id, display_name) VALUES (master_uid,  'Master')  RETURNING id INTO master_p;
  INSERT INTO public.profiles (user_id, display_name) VALUES (admin_uid,   'Admin')   RETURNING id INTO admin_p;
  INSERT INTO public.profiles (user_id, display_name) VALUES (plain_uid,   'Plain')   RETURNING id INTO plain_p;
  INSERT INTO public.profiles (user_id, display_name) VALUES (other_uid,   'Other')   RETURNING id INTO other_p;
  INSERT INTO public.profiles (user_id, display_name) VALUES (blocker_uid, 'Blocker') RETURNING id INTO blocker_p;

  INSERT INTO public.user_roles (user_id, role) VALUES (master_uid, 'master_admin');
  INSERT INTO public.user_roles (user_id, role) VALUES (admin_uid,  'admin');

  -- =========================================================================
  -- A. Authorization
  -- =========================================================================
  PERFORM pg_temp.impersonate(plain_uid);
  BEGIN
    r := public.admin_link_friendship(other_p);
    PERFORM pg_temp.assert(false, 'A1 non-admin must be refused, got ' || r::text);
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM pg_temp.impersonate(admin_uid);
  BEGIN
    r := public.admin_link_friendship(other_p);
    PERFORM pg_temp.assert(false, 'A2 a PLAIN admin must be refused (is_master_admin, not has_role)');
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM pg_temp.anonymous();
  BEGIN
    r := public.admin_link_friendship(other_p);
    PERFORM pg_temp.assert(false, 'A3 an unauthenticated caller must be refused');
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- A4: a refused call must not append audit rows (else it is a pollution vector).
  SELECT count(*) INTO audit_before FROM public.admin_audit_log;
  PERFORM pg_temp.impersonate(plain_uid);
  BEGIN r := public.admin_link_friendship(other_p); EXCEPTION WHEN OTHERS THEN NULL; END;
  SELECT count(*) INTO n FROM public.admin_audit_log;
  PERFORM pg_temp.assert(n = audit_before, 'A4 forbidden must not write an audit row');

  -- =========================================================================
  -- B. admin_link_friendship — outcomes
  -- =========================================================================
  PERFORM pg_temp.impersonate(master_uid);

  -- B1 self
  r := public.admin_link_friendship(master_p);
  PERFORM pg_temp.assert(r->>'code' = 'self' AND (r->>'ok')::boolean = false, 'B1 self rejected');

  -- B2 missing target
  r := public.admin_link_friendship('00000000-0000-4000-8000-0000000000ff');
  PERFORM pg_temp.assert(r->>'code' = 'target_not_found', 'B2 missing target rejected');

  -- B3 block, target -> actor direction (the one an invoker query cannot see)
  INSERT INTO public.user_blocks (blocker_profile_id, blocked_profile_id)
  VALUES (blocker_p, master_p);
  r := public.admin_link_friendship(blocker_p);
  PERFORM pg_temp.assert(r->>'code' = 'blocked', 'B3 block target->actor rejected');
  SELECT count(*) INTO n FROM public.friendships
   WHERE least(requester_id,addressee_id) = least(master_p, blocker_p)
     AND greatest(requester_id,addressee_id) = greatest(master_p, blocker_p);
  PERFORM pg_temp.assert(n = 0, 'B3b blocked pair must have no friendship row');

  -- B4 block, actor -> target direction
  DELETE FROM public.user_blocks WHERE blocker_profile_id = blocker_p;
  INSERT INTO public.user_blocks (blocker_profile_id, blocked_profile_id)
  VALUES (master_p, blocker_p);
  r := public.admin_link_friendship(blocker_p);
  PERFORM pg_temp.assert(r->>'code' = 'blocked', 'B4 block actor->target rejected');
  DELETE FROM public.user_blocks WHERE blocker_profile_id = master_p;

  -- B5 created + NO notification (the central guarantee)
  SELECT count(*) INTO notif_before FROM public.user_notifications;
  r := public.admin_link_friendship(other_p);
  PERFORM pg_temp.assert(r->>'code' = 'created' AND (r->>'ok')::boolean, 'B5 created');
  SELECT count(*) INTO n FROM public.user_notifications;
  PERFORM pg_temp.assert(n = notif_before,
    'B5b an admin-created friendship must produce ZERO user_notifications rows');

  SELECT count(*) INTO n FROM public.friendships
   WHERE requester_id = master_p AND addressee_id = other_p AND status = 'accepted';
  PERFORM pg_temp.assert(n = 1, 'B5c exactly one accepted row, actor is requester');

  -- B6 idempotent
  r := public.admin_link_friendship(other_p);
  PERFORM pg_temp.assert(r->>'code' = 'already_friends' AND (r->>'ok')::boolean, 'B6 idempotent');
  SELECT count(*) INTO n FROM public.friendships
   WHERE least(requester_id,addressee_id) = least(master_p, other_p)
     AND greatest(requester_id,addressee_id) = greatest(master_p, other_p);
  PERFORM pg_temp.assert(n = 1, 'B6b still exactly one row');

  -- B7 idempotent in the REVERSE direction too
  INSERT INTO public.friendships (requester_id, addressee_id, status)
  VALUES (plain_p, master_p, 'pending');
  UPDATE public.friendships SET status = 'accepted'
   WHERE requester_id = plain_p AND addressee_id = master_p;
  r := public.admin_link_friendship(plain_p);
  PERFORM pg_temp.assert(r->>'code' = 'already_friends', 'B7 reverse-direction accepted is idempotent');

  -- B8 a real pending request is reported, never silently converted
  DELETE FROM public.friendships WHERE requester_id = plain_p AND addressee_id = master_p;
  PERFORM pg_temp.impersonate(plain_uid);
  INSERT INTO public.friendships (requester_id, addressee_id) VALUES (plain_p, master_p);
  PERFORM pg_temp.impersonate(master_uid);
  r := public.admin_link_friendship(plain_p);
  PERFORM pg_temp.assert(r->>'code' = 'pending_exists' AND (r->>'ok')::boolean = false, 'B8 pending_exists');
  SELECT count(*) INTO n FROM public.friendships
   WHERE requester_id = plain_p AND addressee_id = master_p AND status = 'pending';
  PERFORM pg_temp.assert(n = 1, 'B8b the pending row is left untouched');
  DELETE FROM public.friendships WHERE requester_id = plain_p AND addressee_id = master_p;

  -- B9 no auth id in the result
  r := public.admin_link_friendship(other_p);
  PERFORM pg_temp.assert(r::text NOT LIKE '%' || master_uid::text || '%', 'B9 result leaks no auth id');
  PERFORM pg_temp.assert(NOT (r ? 'actor_user_id'), 'B9b result has no actor_user_id key');

  -- =========================================================================
  -- C. The trigger exemption is narrow
  -- =========================================================================
  -- C1 an ordinary user still cannot insert an accepted friendship
  PERFORM pg_temp.impersonate(plain_uid);
  BEGIN
    INSERT INTO public.friendships (requester_id, addressee_id, status)
    VALUES (plain_p, other_p, 'accepted');
    PERFORM pg_temp.assert(false, 'C1 ordinary user must not insert an accepted friendship');
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- C2 a plain admin still cannot
  PERFORM pg_temp.impersonate(admin_uid);
  BEGIN
    INSERT INTO public.friendships (requester_id, addressee_id, status)
    VALUES (admin_p, other_p, 'accepted');
    PERFORM pg_temp.assert(false, 'C2 plain admin must not insert an accepted friendship');
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- C3 a MASTER admin cannot link two THIRD parties
  PERFORM pg_temp.impersonate(master_uid);
  BEGIN
    INSERT INTO public.friendships (requester_id, addressee_id, status)
    VALUES (plain_p, other_p, 'accepted');
    PERFORM pg_temp.assert(false, 'C3 master admin must not link two third parties');
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- C4 a master admin cannot insert accepted with THEMSELVES as addressee
  BEGIN
    INSERT INTO public.friendships (requester_id, addressee_id, status)
    VALUES (other_p, master_p, 'accepted');
    PERFORM pg_temp.assert(false, 'C4 exemption requires the actor to be the REQUESTER');
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- C5 the ordinary pending path still works for everyone
  PERFORM pg_temp.impersonate(plain_uid);
  INSERT INTO public.friendships (requester_id, addressee_id) VALUES (plain_p, other_p);
  SELECT count(*) INTO n FROM public.friendships
   WHERE requester_id = plain_p AND addressee_id = other_p AND status = 'pending';
  PERFORM pg_temp.assert(n = 1, 'C5 the ordinary pending path is unaffected');

  -- C6 self-friendship is still impossible for anyone
  PERFORM pg_temp.impersonate(master_uid);
  BEGIN
    INSERT INTO public.friendships (requester_id, addressee_id, status)
    VALUES (master_p, master_p, 'accepted');
    PERFORM pg_temp.assert(false, 'C6 friendships_no_self must still hold');
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- =========================================================================
  -- D. Bot creation
  -- =========================================================================
  PERFORM pg_temp.impersonate(master_uid);

  r := public.admin_create_bot_profile('Nova', 'https://x.test/a.png', 'gold', false);
  PERFORM pg_temp.assert((r->>'ok')::boolean AND r->>'code' = 'created', 'D1 bot created');
  bot_p := (r->>'profile_id')::uuid;

  SELECT count(*) INTO n FROM public.profiles
   WHERE id = bot_p AND is_bot = true AND is_disabled = false AND display_name = 'Nova';
  PERFORM pg_temp.assert(n = 1, 'D2 bot row has is_bot = true and is_disabled = false');

  -- D3 no auth.users row is created
  SELECT count(*) INTO n FROM auth.users u
   JOIN public.profiles p ON p.user_id = u.id WHERE p.id = bot_p;
  PERFORM pg_temp.assert(n = 0, 'D3 bot creation must create NO auth.users row');

  -- D4 the fabricated user_id is never returned
  PERFORM pg_temp.assert(NOT (r ? 'user_id'), 'D4 result has no user_id key');
  SELECT count(*) INTO n FROM public.profiles p
   WHERE p.id = bot_p AND r::text LIKE '%' || p.user_id::text || '%';
  PERFORM pg_temp.assert(n = 0, 'D4b the placeholder user_id does not appear in the result');

  -- D5 no friendship when the flag is false
  SELECT count(*) INTO n FROM public.friendships
   WHERE least(requester_id,addressee_id) = least(master_p, bot_p)
     AND greatest(requester_id,addressee_id) = greatest(master_p, bot_p);
  PERFORM pg_temp.assert(n = 0, 'D5 add_to_my_friends=false creates no friendship');

  -- D6 auto-friend creates exactly one friendship and TWO audit actions
  SELECT count(*) INTO audit_before FROM public.admin_audit_log;
  SELECT count(*) INTO notif_before FROM public.user_notifications;
  r := public.admin_create_bot_profile('Vex', NULL, NULL, true);
  bot2_p := (r->>'profile_id')::uuid;
  PERFORM pg_temp.assert(r->'friendship'->>'code' = 'created', 'D6 auto-friend created');

  SELECT count(*) INTO n FROM public.friendships
   WHERE requester_id = master_p AND addressee_id = bot2_p AND status = 'accepted';
  PERFORM pg_temp.assert(n = 1, 'D6b exactly one friendship');

  SELECT count(*) INTO n FROM public.admin_audit_log
   WHERE target_profile_id = bot2_p
     AND action IN ('admin_create_bot_profile','admin_link_friendship');
  PERFORM pg_temp.assert(n = 2, 'D6c two distinct audit actions recorded');

  SELECT count(*) INTO n FROM public.user_notifications;
  PERFORM pg_temp.assert(n = notif_before, 'D6d auto-friend produces no notification either');

  -- D7 invalid display name
  r := public.admin_create_bot_profile('   ', NULL, NULL, false);
  PERFORM pg_temp.assert(r->>'code' = 'invalid_display_name', 'D7 blank name refused');

  -- D8 a plain admin cannot create a bot
  PERFORM pg_temp.impersonate(admin_uid);
  BEGIN
    r := public.admin_create_bot_profile('Sneaky', NULL, NULL, false);
    PERFORM pg_temp.assert(false, 'D8 plain admin must not create a bot');
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- =========================================================================
  -- E. Soft-disable
  -- =========================================================================
  PERFORM pg_temp.impersonate(master_uid);

  r := public.admin_update_bot_profile(bot_p, NULL, NULL, NULL, true);
  PERFORM pg_temp.assert(r->>'code' = 'updated', 'E1 bot disabled');
  SELECT is_disabled INTO ok FROM public.profiles WHERE id = bot_p;
  PERFORM pg_temp.assert(ok, 'E1b is_disabled is true');

  SELECT count(*) INTO n FROM public.admin_audit_log
   WHERE target_profile_id = bot_p AND action = 'admin_disable_bot';
  PERFORM pg_temp.assert(n = 1, 'E2 disable is audited as its own action');

  -- E3 a disabled bot is not available and cannot be newly friended
  PERFORM pg_temp.assert(public.is_bot_available(bot_p) = false, 'E3 disabled bot is unavailable');
  r := public.admin_link_friendship(bot_p);
  PERFORM pg_temp.assert(r->>'code' = 'target_disabled', 'E3b disabled bot refuses a new friend link');

  -- E4 an EXISTING friendship survives disabling
  r := public.admin_update_bot_profile(bot2_p, NULL, NULL, NULL, true);
  SELECT count(*) INTO n FROM public.friendships
   WHERE requester_id = master_p AND addressee_id = bot2_p AND status = 'accepted';
  PERFORM pg_temp.assert(n = 1, 'E4 disabling preserves the existing friendship row');

  -- E5 re-enable
  r := public.admin_update_bot_profile(bot_p, NULL, NULL, NULL, false);
  PERFORM pg_temp.assert(public.is_bot_available(bot_p), 'E5 re-enabled bot is available again');
  SELECT count(*) INTO n FROM public.admin_audit_log
   WHERE target_profile_id = bot_p AND action = 'admin_enable_bot';
  PERFORM pg_temp.assert(n = 1, 'E5b re-enable is audited');
  r := public.admin_link_friendship(bot_p);
  PERFORM pg_temp.assert(r->>'code' = 'created', 'E5c a re-enabled bot can be friended');

  -- E6 nothing was deleted
  SELECT count(*) INTO n FROM public.profiles WHERE id IN (bot_p, bot2_p);
  PERFORM pg_temp.assert(n = 2, 'E6 both bot profiles still exist');

  -- E7 a real user is never a valid bot-update target
  r := public.admin_update_bot_profile(plain_p, 'Hacked', NULL, NULL, true);
  PERFORM pg_temp.assert(r->>'code' = 'not_a_bot', 'E7 a human profile is refused');
  SELECT count(*) INTO n FROM public.profiles
   WHERE id = plain_p AND display_name = 'Plain' AND is_disabled = false;
  PERFORM pg_temp.assert(n = 1, 'E7b the human profile is unchanged');

  -- E8 is_bot_available is false for a human and for a missing id
  PERFORM pg_temp.assert(public.is_bot_available(plain_p) = false, 'E8 human is not an available bot');
  PERFORM pg_temp.assert(
    public.is_bot_available('00000000-0000-4000-8000-0000000000fe') = false,
    'E8b missing id is not an available bot');

  -- E9 a non-admin cannot set is_disabled on their own row
  PERFORM pg_temp.impersonate(plain_uid);
  UPDATE public.profiles SET is_disabled = true WHERE id = plain_p;
  SELECT is_disabled INTO ok FROM public.profiles WHERE id = plain_p;
  PERFORM pg_temp.assert(ok = false, 'E9 protect_profile_premium_fields must restore is_disabled');

  -- =========================================================================
  -- F. Audit log
  -- =========================================================================
  PERFORM pg_temp.impersonate(master_uid);

  -- F1 failures are recorded too
  r := public.admin_link_friendship(master_p);  -- self
  SELECT count(*) INTO n FROM public.admin_audit_log WHERE result = 'self';
  PERFORM pg_temp.assert(n >= 1, 'F1 a failed outcome is audited');

  -- F2 the actor auth id is recorded server-side
  SELECT count(*) INTO n FROM public.admin_audit_log
   WHERE actor_user_id = master_uid AND action = 'admin_link_friendship';
  PERFORM pg_temp.assert(n >= 1, 'F2 actor_user_id is captured from auth.uid()');

  -- F3 no client may insert, update or delete audit rows
  BEGIN
    INSERT INTO public.admin_audit_log (actor_user_id, action, result)
    VALUES (plain_uid, 'forged', 'created');
    PERFORM pg_temp.assert(false, 'F3 a client must not be able to insert an audit row');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
  END;

  BEGIN
    DELETE FROM public.admin_audit_log WHERE actor_user_id = master_uid;
    SELECT count(*) INTO n FROM public.admin_audit_log WHERE actor_user_id = master_uid;
    PERFORM pg_temp.assert(n > 0, 'F4 a client must not be able to delete audit rows');
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- F5 a non-admin cannot READ the audit log
  PERFORM pg_temp.impersonate(plain_uid);
  SELECT count(*) INTO n FROM public.admin_audit_log;
  PERFORM pg_temp.assert(n = 0, 'F5 a non-admin reads zero audit rows');

  -- F6 an admin CAN read it
  PERFORM pg_temp.impersonate(admin_uid);
  SELECT count(*) INTO n FROM public.admin_audit_log;
  PERFORM pg_temp.assert(n > 0, 'F6 an admin can read the audit log');

  -- =========================================================================
  -- G. get_league_profiles contract
  -- =========================================================================
  PERFORM pg_temp.impersonate(master_uid);
  SELECT count(*) INTO n FROM public.get_league_profiles(ARRAY[bot_p]) g WHERE g.is_disabled = false;
  PERFORM pg_temp.assert(n = 1, 'G1 an enabled bot reports is_disabled = false');

  PERFORM public.admin_update_bot_profile(bot_p, NULL, NULL, NULL, true);
  SELECT count(*) INTO n FROM public.get_league_profiles(ARRAY[bot_p]) g WHERE g.is_disabled = true;
  PERFORM pg_temp.assert(n = 1,
    'G2 a disabled bot is still RETURNED (flagged), not dropped -- else the drawer shows "Unknown"');

  SELECT count(*) INTO n
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'profiles';  -- sanity only
  PERFORM pg_temp.assert(
    NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
      WHERE ns.nspname='public' AND p.proname='get_league_profiles'
        AND pg_get_function_result(p.oid) ILIKE '%user_id%'),
    'G3 get_league_profiles must NOT expose user_id');

  -- =========================================================================
  -- H. show_bot_labels
  -- =========================================================================
  SELECT count(*) INTO n FROM public.app_settings
   WHERE key = 'show_bot_labels' AND value = '{"enabled": false}'::jsonb;
  PERFORM pg_temp.assert(n = 1, 'H1 show_bot_labels is seeded and defaults to false');

  PERFORM pg_temp.impersonate(plain_uid);
  UPDATE public.app_settings SET value = '{"enabled": true}'::jsonb WHERE key = 'show_bot_labels';
  SELECT count(*) INTO n FROM public.app_settings
   WHERE key = 'show_bot_labels' AND value = '{"enabled": false}'::jsonb;
  PERFORM pg_temp.assert(n = 1, 'H2 a non-admin must not be able to change the policy');

  PERFORM pg_temp.impersonate(admin_uid);
  UPDATE public.app_settings SET value = '{"enabled": true}'::jsonb WHERE key = 'show_bot_labels';
  SELECT count(*) INTO n FROM public.app_settings
   WHERE key = 'show_bot_labels' AND value = '{"enabled": true}'::jsonb;
  PERFORM pg_temp.assert(n = 1, 'H3 an admin CAN change the policy');

  RAISE NOTICE '=========================================';
  RAISE NOTICE '  ALL PHASE A SQL TESTS PASSED';
  RAISE NOTICE '=========================================';
END
$outer$;

-- Nothing is kept. Every fixture, friendship, bot and audit row is discarded.
ROLLBACK;
