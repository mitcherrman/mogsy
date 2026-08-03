-- ===========================================================================
-- ADM2 Phase A — SQL behaviour tests. (v2)
--
-- ⚠  RUN ON A SCRATCH SUPABASE PROJECT ONLY. NEVER ON PRODUCTION.
--    It creates profiles, roles, blocks, friendships and bot personas. It ends
--    in ROLLBACK so nothing survives a successful run — but an interrupted run
--    on production would leave test rows behind, and several cases deliberately
--    provoke exceptions.
--
-- PREREQUISITE
--    Apply every repo migration INCLUDING
--    20260803120000_adm2_phase_a_admin_users_and_bots.sql to the scratch project
--    first.
--
--
-- WHY v2 EXISTS
-- ─────────────
-- The Supabase SQL Editor connects as `postgres`, which OWNS the public tables
-- and therefore BYPASSES row level security. v1 ran everything in that context,
-- so every assertion about client-visible RLS behaviour was meaningless:
-- F3/F4/F5 and H2 would have failed spuriously and F6/H3 would have passed
-- vacuously. v2 separates two privilege contexts explicitly.
--
--
-- THE TWO CONTEXTS
-- ────────────────
--   OWNER   `RESET ROLE`            -> back to the session user (postgres).
--                                     Used ONLY for fixture setup and for
--                                     ground-truth verification reads.
--   CLIENT  `SET LOCAL ROLE authenticated`
--                                     The role PostgREST uses for a signed-in
--                                     browser. EVERY behaviour under test runs
--                                     here, so grants, RLS policies and
--                                     triggers all apply exactly as they do in
--                                     production.
--
-- Both are transaction-local. `RESET ROLE` is always permitted back to the
-- session user, so the harness can alternate freely.
--
-- Ground-truth reads MUST be OWNER, not CLIENT. Two cases make this mandatory
-- rather than stylistic:
--   * public.user_notifications — a client sees only its own rows, so counting
--     as a client could not detect a notification wrongly sent to the OTHER
--     party, which is the exact thing B5b and D6d exist to catch.
--   * auth.users — `authenticated` has no access at all, so D3 would raise
--     "permission denied for schema auth" rather than assert anything.
--
--
-- NO pg_temp HELPERS
-- ──────────────────
-- v1 called pg_temp.assert()/impersonate(). A temporary schema's ACL grants
-- nothing to PUBLIC, so once the harness switches to `authenticated` those
-- calls would fail with "permission denied for schema pg_temp_N". Every
-- assertion is therefore inlined, and impersonation uses the built-in
-- set_config(), which any role may call.
--
--
-- IMPERSONATION
-- ─────────────
-- auth.uid() reads the `request.jwt.claims` GUC. Setting it transaction-locally
-- makes auth.uid() resolve to the chosen account exactly as PostgREST would
-- present it. Role and claims are independent: the ROLE decides grants and RLS,
-- the CLAIMS decide who auth.uid() says you are. Production sets both; so does
-- this harness.
--
-- Role switches and impersonation always happen OUTSIDE `BEGIN ... EXCEPTION`
-- blocks: those open a subtransaction, and an exception would roll back any GUC
-- change made inside it.
--
--
-- HOW TO RUN
--    Paste the whole file into the SQL Editor and Run.
--    SUCCESS = a final result row reading "ALL PHASE A SQL TESTS PASSED".
--    FAILURE = an error beginning "FAILED: " naming the exact assertion.
-- ===========================================================================

BEGIN;

DO $outer$
DECLARE
  -- Auth ids. No auth.users rows are needed: public.profiles.user_id has no FK
  -- to auth.users (which is why the legacy bot path could insert a random uuid).
  master_uid  uuid := '00000000-0000-4000-8000-000000000001';
  admin_uid   uuid := '00000000-0000-4000-8000-000000000002';
  plain_uid   uuid := '00000000-0000-4000-8000-000000000003';
  other_uid   uuid := '00000000-0000-4000-8000-000000000004';
  blocker_uid uuid := '00000000-0000-4000-8000-000000000005';
  absent_id   uuid := '00000000-0000-4000-8000-0000000000ff';

  -- Pre-built claim payloads, so each impersonation is a single readable line.
  c_master text; c_admin text; c_plain text; c_none text := '';

  master_p uuid; admin_p uuid; plain_p uuid; other_p uuid; blocker_p uuid;
  bot_p    uuid; bot2_p  uuid;

  r            jsonb;
  n            int;
  n2           int;
  affected     int;
  notif_before int;
  audit_before int;
  raised       boolean;
  ok           boolean;
BEGIN
  c_master := json_build_object('sub', master_uid::text, 'role', 'authenticated')::text;
  c_admin  := json_build_object('sub', admin_uid::text,  'role', 'authenticated')::text;
  c_plain  := json_build_object('sub', plain_uid::text,  'role', 'authenticated')::text;

  -- =========================================================================
  -- FIXTURES  — context: OWNER
  -- Necessarily owner: the profiles INSERT policy is own-row-only and the
  -- user_roles INSERT policy requires has_role(admin), which is a chicken and
  -- egg problem before any role rows exist.
  -- =========================================================================
  EXECUTE 'RESET ROLE';

  INSERT INTO public.profiles (user_id, display_name) VALUES (master_uid,  'Master')  RETURNING id INTO master_p;
  INSERT INTO public.profiles (user_id, display_name) VALUES (admin_uid,   'Admin')   RETURNING id INTO admin_p;
  INSERT INTO public.profiles (user_id, display_name) VALUES (plain_uid,   'Plain')   RETURNING id INTO plain_p;
  INSERT INTO public.profiles (user_id, display_name) VALUES (other_uid,   'Other')   RETURNING id INTO other_p;
  INSERT INTO public.profiles (user_id, display_name) VALUES (blocker_uid, 'Blocker') RETURNING id INTO blocker_p;

  INSERT INTO public.user_roles (user_id, role) VALUES (master_uid, 'master_admin');
  INSERT INTO public.user_roles (user_id, role) VALUES (admin_uid,  'admin');

  -- Sanity: the harness is worthless if the migration was not applied.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
                 WHERE ns.nspname = 'public' AND p.proname = 'admin_link_friendship') THEN
    RAISE EXCEPTION 'FAILED: PRE the Phase A migration is not applied to this database';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='profiles' AND column_name='is_disabled') THEN
    RAISE EXCEPTION 'FAILED: PRE profiles.is_disabled is missing';
  END IF;

  -- =========================================================================
  -- A. Authorization  — context: CLIENT
  -- =========================================================================
  PERFORM set_config('request.jwt.claims', c_plain, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  raised := false;
  BEGIN
    r := public.admin_link_friendship(other_p);
  EXCEPTION WHEN insufficient_privilege THEN raised := true;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'FAILED: A1 a non-admin must be refused'; END IF;

  PERFORM set_config('request.jwt.claims', c_admin, true);
  raised := false;
  BEGIN
    r := public.admin_link_friendship(other_p);
  EXCEPTION WHEN insufficient_privilege THEN raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'FAILED: A2 a PLAIN admin must be refused (is_master_admin, not has_role)';
  END IF;

  -- A3 authenticated role but no verified subject -> the function gate refuses.
  PERFORM set_config('request.jwt.claims', c_none, true);
  raised := false;
  BEGIN
    r := public.admin_link_friendship(other_p);
  EXCEPTION WHEN insufficient_privilege THEN raised := true;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'FAILED: A3 a caller with no subject must be refused'; END IF;

  -- A3b the anon role cannot even reach the function: EXECUTE was revoked.
  EXECUTE 'RESET ROLE';
  EXECUTE 'SET LOCAL ROLE anon';
  raised := false;
  BEGIN
    r := public.admin_link_friendship(other_p);
  EXCEPTION WHEN insufficient_privilege THEN raised := true;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'FAILED: A3b anon must not hold EXECUTE on admin_link_friendship'; END IF;

  -- A4 a refused call must not append audit rows, or it is a pollution vector.
  -- Counted as OWNER: a non-admin client sees zero audit rows under RLS, which
  -- would make this assertion vacuously true.
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO audit_before FROM public.admin_audit_log;

  PERFORM set_config('request.jwt.claims', c_plain, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN r := public.admin_link_friendship(other_p); EXCEPTION WHEN OTHERS THEN NULL; END;

  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO n FROM public.admin_audit_log;
  IF n <> audit_before THEN RAISE EXCEPTION 'FAILED: A4 a forbidden call must not write an audit row'; END IF;

  -- =========================================================================
  -- B. admin_link_friendship outcomes
  --    Calls run as CLIENT; every verification read is OWNER ground truth.
  -- =========================================================================
  PERFORM set_config('request.jwt.claims', c_master, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  r := public.admin_link_friendship(master_p);
  IF NOT (r->>'code' = 'self' AND (r->>'ok')::boolean = false) THEN
    RAISE EXCEPTION 'FAILED: B1 self must be rejected, got %', r::text;
  END IF;

  r := public.admin_link_friendship(absent_id);
  IF r->>'code' <> 'target_not_found' THEN
    RAISE EXCEPTION 'FAILED: B2 a missing target must be rejected, got %', r::text;
  END IF;

  -- B3 block in the target -> actor direction: the case an invoker-side query
  -- can never see, which is why is_blocked_between is SECURITY DEFINER.
  EXECUTE 'RESET ROLE';
  INSERT INTO public.user_blocks (blocker_profile_id, blocked_profile_id) VALUES (blocker_p, master_p);
  EXECUTE 'SET LOCAL ROLE authenticated';

  r := public.admin_link_friendship(blocker_p);
  IF r->>'code' <> 'blocked' THEN
    RAISE EXCEPTION 'FAILED: B3 a block target->actor must be rejected, got %', r::text;
  END IF;

  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO n FROM public.friendships
   WHERE least(requester_id, addressee_id)    = least(master_p, blocker_p)
     AND greatest(requester_id, addressee_id) = greatest(master_p, blocker_p);
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED: B3b a blocked pair must have no friendship row'; END IF;

  -- B4 block in the actor -> target direction.
  DELETE FROM public.user_blocks WHERE blocker_profile_id = blocker_p;
  INSERT INTO public.user_blocks (blocker_profile_id, blocked_profile_id) VALUES (master_p, blocker_p);
  EXECUTE 'SET LOCAL ROLE authenticated';

  r := public.admin_link_friendship(blocker_p);
  IF r->>'code' <> 'blocked' THEN
    RAISE EXCEPTION 'FAILED: B4 a block actor->target must be rejected, got %', r::text;
  END IF;

  EXECUTE 'RESET ROLE';
  DELETE FROM public.user_blocks WHERE blocker_profile_id = master_p;

  -- B5 created, and NO notification. This is the central guarantee of the
  -- whole design. user_notifications MUST be counted as OWNER: as a client we
  -- would only see our own rows and could not detect a notification wrongly
  -- delivered to `other`.
  SELECT count(*) INTO notif_before FROM public.user_notifications;
  EXECUTE 'SET LOCAL ROLE authenticated';

  r := public.admin_link_friendship(other_p);
  IF NOT (r->>'code' = 'created' AND (r->>'ok')::boolean) THEN
    RAISE EXCEPTION 'FAILED: B5 the friendship must be created, got %', r::text;
  END IF;

  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO n FROM public.user_notifications;
  IF n <> notif_before THEN
    RAISE EXCEPTION 'FAILED: B5b an admin-created friendship must produce ZERO user_notifications rows (was %, now %)',
                    notif_before, n;
  END IF;

  SELECT count(*) INTO n FROM public.friendships
   WHERE requester_id = master_p AND addressee_id = other_p AND status = 'accepted';
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED: B5c exactly one accepted row with the actor as requester'; END IF;

  -- B6 idempotent.
  EXECUTE 'SET LOCAL ROLE authenticated';
  r := public.admin_link_friendship(other_p);
  IF NOT (r->>'code' = 'already_friends' AND (r->>'ok')::boolean) THEN
    RAISE EXCEPTION 'FAILED: B6 a repeat call must be idempotent, got %', r::text;
  END IF;

  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO n FROM public.friendships
   WHERE least(requester_id, addressee_id)    = least(master_p, other_p)
     AND greatest(requester_id, addressee_id) = greatest(master_p, other_p);
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED: B6b still exactly one row after a repeat call'; END IF;

  -- B7 idempotent when the existing row is stored the OTHER way round.
  INSERT INTO public.friendships (requester_id, addressee_id, status) VALUES (plain_p, master_p, 'pending');
  UPDATE public.friendships SET status = 'accepted'
   WHERE requester_id = plain_p AND addressee_id = master_p;
  EXECUTE 'SET LOCAL ROLE authenticated';

  r := public.admin_link_friendship(plain_p);
  IF r->>'code' <> 'already_friends' THEN
    RAISE EXCEPTION 'FAILED: B7 a reverse-direction accepted row must be idempotent, got %', r::text;
  END IF;

  EXECUTE 'RESET ROLE';
  DELETE FROM public.friendships WHERE requester_id = plain_p AND addressee_id = master_p;

  -- B8 a real pending request is reported, never silently converted.
  -- The request itself is sent as a CLIENT, so the friendships INSERT policy
  -- and the guard trigger both apply exactly as they would in the app.
  PERFORM set_config('request.jwt.claims', c_plain, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.friendships (requester_id, addressee_id) VALUES (plain_p, master_p);

  PERFORM set_config('request.jwt.claims', c_master, true);
  r := public.admin_link_friendship(plain_p);
  IF NOT (r->>'code' = 'pending_exists' AND (r->>'ok')::boolean = false) THEN
    RAISE EXCEPTION 'FAILED: B8 an existing pending request must report pending_exists, got %', r::text;
  END IF;

  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO n FROM public.friendships
   WHERE requester_id = plain_p AND addressee_id = master_p AND status = 'pending';
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED: B8b the pending row must be left untouched'; END IF;
  DELETE FROM public.friendships WHERE requester_id = plain_p AND addressee_id = master_p;

  -- B9 no auth id in the result.
  EXECUTE 'SET LOCAL ROLE authenticated';
  r := public.admin_link_friendship(other_p);
  IF r::text LIKE '%' || master_uid::text || '%' THEN
    RAISE EXCEPTION 'FAILED: B9 the result must not contain an auth user id';
  END IF;
  IF r ? 'actor_user_id' THEN
    RAISE EXCEPTION 'FAILED: B9b the result must not carry an actor_user_id key';
  END IF;

  -- =========================================================================
  -- C. The trigger exemption is narrow  — context: CLIENT throughout
  --
  -- These are direct table writes standing in for ordinary app behaviour, so
  -- they must run as a client: grants, the friendships RLS policies and the
  -- BEFORE trigger all participate, exactly as in production.
  --
  -- Each handler accepts check_violation (the guard trigger) OR
  -- insufficient_privilege (an RLS refusal). Either is a correct rejection; the
  -- assertion is that the write does not succeed.
  -- =========================================================================
  PERFORM set_config('request.jwt.claims', c_plain, true);
  raised := false;
  BEGIN
    INSERT INTO public.friendships (requester_id, addressee_id, status)
    VALUES (plain_p, other_p, 'accepted');
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'FAILED: C1 an ordinary user must not insert an accepted friendship';
  END IF;

  PERFORM set_config('request.jwt.claims', c_admin, true);
  raised := false;
  BEGIN
    INSERT INTO public.friendships (requester_id, addressee_id, status)
    VALUES (admin_p, other_p, 'accepted');
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'FAILED: C2 a plain admin must not insert an accepted friendship';
  END IF;

  -- C3 the condition that stops a master admin fabricating a friendship
  -- between two people who are not them.
  PERFORM set_config('request.jwt.claims', c_master, true);
  raised := false;
  BEGIN
    INSERT INTO public.friendships (requester_id, addressee_id, status)
    VALUES (plain_p, other_p, 'accepted');
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'FAILED: C3 a master admin must not link two third parties';
  END IF;

  -- C4 the exemption requires the actor to be the REQUESTER, not merely a party.
  raised := false;
  BEGIN
    INSERT INTO public.friendships (requester_id, addressee_id, status)
    VALUES (other_p, master_p, 'accepted');
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN raised := true;
  END;
  IF NOT raised THEN
    RAISE EXCEPTION 'FAILED: C4 the exemption must require the actor to be the requester';
  END IF;

  -- C5 the ordinary pending path is unaffected for an ordinary user.
  PERFORM set_config('request.jwt.claims', c_plain, true);
  INSERT INTO public.friendships (requester_id, addressee_id) VALUES (plain_p, other_p);

  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO n FROM public.friendships
   WHERE requester_id = plain_p AND addressee_id = other_p AND status = 'pending';
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED: C5 the ordinary pending path must still work'; END IF;

  -- C6 the friendships_no_self CHECK still holds for everyone.
  PERFORM set_config('request.jwt.claims', c_master, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  raised := false;
  BEGIN
    INSERT INTO public.friendships (requester_id, addressee_id, status)
    VALUES (master_p, master_p, 'accepted');
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN raised := true;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'FAILED: C6 self-friendship must remain impossible'; END IF;

  -- =========================================================================
  -- D. Bot creation
  -- =========================================================================
  -- CLIENT: the RPC call itself.
  r := public.admin_create_bot_profile('Nova', 'https://x.test/a.png', 'gold', false);
  IF NOT ((r->>'ok')::boolean AND r->>'code' = 'created') THEN
    RAISE EXCEPTION 'FAILED: D1 the bot must be created, got %', r::text;
  END IF;
  bot_p := (r->>'profile_id')::uuid;

  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO n FROM public.profiles
   WHERE id = bot_p AND is_bot = true AND is_disabled = false AND display_name = 'Nova';
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED: D2 the bot row must have is_bot true and is_disabled false'; END IF;

  -- D3 no auth.users row. OWNER is mandatory here: `authenticated` has no
  -- access to the auth schema at all and would raise instead of asserting.
  SELECT count(*) INTO n FROM auth.users u
    JOIN public.profiles p ON p.user_id = u.id
   WHERE p.id = bot_p;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED: D3 bot creation must create NO auth.users row'; END IF;

  -- D4 the fabricated placeholder user_id never leaves the function.
  IF r ? 'user_id' THEN RAISE EXCEPTION 'FAILED: D4 the result must not carry a user_id key'; END IF;
  SELECT count(*) INTO n FROM public.profiles p
   WHERE p.id = bot_p AND r::text LIKE '%' || p.user_id::text || '%';
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED: D4b the placeholder user_id must not appear in the result'; END IF;

  SELECT count(*) INTO n FROM public.friendships
   WHERE least(requester_id, addressee_id)    = least(master_p, bot_p)
     AND greatest(requester_id, addressee_id) = greatest(master_p, bot_p);
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED: D5 add_to_my_friends=false must create no friendship'; END IF;

  -- D6 auto-friend: exactly one friendship, exactly two audit actions, and
  -- still no notification.
  SELECT count(*) INTO audit_before FROM public.admin_audit_log;
  SELECT count(*) INTO notif_before FROM public.user_notifications;
  EXECUTE 'SET LOCAL ROLE authenticated';

  r := public.admin_create_bot_profile('Vex', NULL, NULL, true);
  bot2_p := (r->>'profile_id')::uuid;
  IF r->'friendship'->>'code' <> 'created' THEN
    RAISE EXCEPTION 'FAILED: D6 the auto-friend step must report created, got %', r::text;
  END IF;

  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO n FROM public.friendships
   WHERE requester_id = master_p AND addressee_id = bot2_p AND status = 'accepted';
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED: D6b auto-friend must create exactly one friendship'; END IF;

  SELECT count(*) INTO n FROM public.admin_audit_log
   WHERE target_profile_id = bot2_p
     AND action IN ('admin_create_bot_profile', 'admin_link_friendship');
  IF n <> 2 THEN
    RAISE EXCEPTION 'FAILED: D6c two distinct audit actions must be recorded, found %', n;
  END IF;

  SELECT count(*) INTO n FROM public.admin_audit_log;
  IF n <> audit_before + 2 THEN
    RAISE EXCEPTION 'FAILED: D6c2 exactly two audit rows must be added, added %', n - audit_before;
  END IF;

  SELECT count(*) INTO n FROM public.user_notifications;
  IF n <> notif_before THEN
    RAISE EXCEPTION 'FAILED: D6d auto-friend must produce no notification either';
  END IF;

  -- D7 input validation.
  EXECUTE 'SET LOCAL ROLE authenticated';
  r := public.admin_create_bot_profile('   ', NULL, NULL, false);
  IF r->>'code' <> 'invalid_display_name' THEN
    RAISE EXCEPTION 'FAILED: D7 a blank display name must be refused, got %', r::text;
  END IF;

  -- D8 a plain admin cannot create a bot.
  PERFORM set_config('request.jwt.claims', c_admin, true);
  raised := false;
  BEGIN
    r := public.admin_create_bot_profile('Sneaky', NULL, NULL, false);
  EXCEPTION WHEN insufficient_privilege THEN raised := true;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'FAILED: D8 a plain admin must not create a bot'; END IF;

  -- =========================================================================
  -- E. Soft-disable
  -- =========================================================================
  PERFORM set_config('request.jwt.claims', c_master, true);

  r := public.admin_update_bot_profile(bot_p, NULL, NULL, NULL, true);
  IF r->>'code' <> 'updated' THEN RAISE EXCEPTION 'FAILED: E1 the bot must be disabled, got %', r::text; END IF;

  EXECUTE 'RESET ROLE';
  SELECT is_disabled INTO ok FROM public.profiles WHERE id = bot_p;
  IF NOT ok THEN RAISE EXCEPTION 'FAILED: E1b is_disabled must be true'; END IF;

  SELECT count(*) INTO n FROM public.admin_audit_log
   WHERE target_profile_id = bot_p AND action = 'admin_disable_bot';
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED: E2 disabling must be audited as its own action'; END IF;

  -- E3 a disabled bot is unavailable and cannot be newly friended.
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF public.is_bot_available(bot_p) THEN
    RAISE EXCEPTION 'FAILED: E3 a disabled bot must not be available';
  END IF;
  r := public.admin_link_friendship(bot_p);
  IF r->>'code' <> 'target_disabled' THEN
    RAISE EXCEPTION 'FAILED: E3b a disabled bot must refuse a new friend link, got %', r::text;
  END IF;

  -- E4 an EXISTING friendship survives disabling — soft-disable hides, it does
  -- not unfriend.
  r := public.admin_update_bot_profile(bot2_p, NULL, NULL, NULL, true);
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO n FROM public.friendships
   WHERE requester_id = master_p AND addressee_id = bot2_p AND status = 'accepted';
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED: E4 disabling must preserve the existing friendship row'; END IF;

  -- E5 re-enable restores everything.
  EXECUTE 'SET LOCAL ROLE authenticated';
  r := public.admin_update_bot_profile(bot_p, NULL, NULL, NULL, false);
  IF NOT public.is_bot_available(bot_p) THEN
    RAISE EXCEPTION 'FAILED: E5 a re-enabled bot must be available again';
  END IF;

  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO n FROM public.admin_audit_log
   WHERE target_profile_id = bot_p AND action = 'admin_enable_bot';
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED: E5b re-enabling must be audited'; END IF;

  EXECUTE 'SET LOCAL ROLE authenticated';
  r := public.admin_link_friendship(bot_p);
  IF r->>'code' <> 'created' THEN
    RAISE EXCEPTION 'FAILED: E5c a re-enabled bot must be friendable, got %', r::text;
  END IF;

  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO n FROM public.profiles WHERE id IN (bot_p, bot2_p);
  IF n <> 2 THEN RAISE EXCEPTION 'FAILED: E6 both bot profiles must still exist'; END IF;

  -- E7 a human profile is never a valid bot-update target.
  EXECUTE 'SET LOCAL ROLE authenticated';
  r := public.admin_update_bot_profile(plain_p, 'Hacked', NULL, NULL, true);
  IF r->>'code' <> 'not_a_bot' THEN
    RAISE EXCEPTION 'FAILED: E7 a human profile must be refused, got %', r::text;
  END IF;

  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO n FROM public.profiles
   WHERE id = plain_p AND display_name = 'Plain' AND is_disabled = false;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED: E7b the human profile must be unchanged'; END IF;

  -- E8 availability is false for a human and for an id that does not exist.
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF public.is_bot_available(plain_p) THEN
    RAISE EXCEPTION 'FAILED: E8 a human must not be an available bot';
  END IF;
  IF public.is_bot_available(absent_id) THEN
    RAISE EXCEPTION 'FAILED: E8b a missing id must not be an available bot';
  END IF;

  -- E9 a non-admin cannot set is_disabled on their OWN row. Runs as a CLIENT
  -- so both the profiles UPDATE policy and protect_profile_premium_fields
  -- participate, as they do for a real browser write.
  PERFORM set_config('request.jwt.claims', c_plain, true);
  UPDATE public.profiles SET is_disabled = true WHERE id = plain_p;

  EXECUTE 'RESET ROLE';
  SELECT is_disabled INTO ok FROM public.profiles WHERE id = plain_p;
  IF ok THEN
    RAISE EXCEPTION 'FAILED: E9 protect_profile_premium_fields must restore is_disabled for a non-admin';
  END IF;

  -- =========================================================================
  -- F. Audit log  — the section v1 could not test at all
  --
  -- `authenticated` holds SELECT and nothing else on admin_audit_log, so an
  -- INSERT/UPDATE/DELETE is refused at the GRANT level (42501) before RLS is
  -- even consulted. Each case accepts "raised" OR "changed nothing", then
  -- verifies the table as OWNER.
  -- =========================================================================
  SELECT count(*) INTO audit_before FROM public.admin_audit_log;

  PERFORM set_config('request.jwt.claims', c_master, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- F1 failures are recorded too.
  r := public.admin_link_friendship(master_p);  -- self
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO n FROM public.admin_audit_log WHERE result = 'self';
  IF n < 1 THEN RAISE EXCEPTION 'FAILED: F1 a failed outcome must be audited'; END IF;

  -- F2 the actor auth id is captured server-side from auth.uid().
  SELECT count(*) INTO n FROM public.admin_audit_log
   WHERE actor_user_id = master_uid AND action = 'admin_link_friendship';
  IF n < 1 THEN RAISE EXCEPTION 'FAILED: F2 actor_user_id must be captured from auth.uid()'; END IF;

  SELECT count(*) INTO audit_before FROM public.admin_audit_log;

  -- F3 a client cannot INSERT.
  PERFORM set_config('request.jwt.claims', c_plain, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  raised := false;
  BEGIN
    INSERT INTO public.admin_audit_log (actor_user_id, action, result)
    VALUES (plain_uid, 'forged', 'created');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN raised := true;
  END;
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO n FROM public.admin_audit_log WHERE action = 'forged';
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED: F3 a client must not be able to insert an audit row'; END IF;

  -- F3b a client cannot UPDATE.
  EXECUTE 'SET LOCAL ROLE authenticated';
  affected := 0;
  BEGIN
    UPDATE public.admin_audit_log SET result = 'tampered';
    GET DIAGNOSTICS affected = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN affected := 0;
  END;
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO n FROM public.admin_audit_log WHERE result = 'tampered';
  IF affected <> 0 OR n <> 0 THEN
    RAISE EXCEPTION 'FAILED: F3b a client must not be able to update an audit row';
  END IF;

  -- F4 a client cannot DELETE.
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    DELETE FROM public.admin_audit_log;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO n FROM public.admin_audit_log;
  IF n <> audit_before THEN
    RAISE EXCEPTION 'FAILED: F4 a client must not be able to delete audit rows (% -> %)', audit_before, n;
  END IF;

  -- F5 a non-admin reads zero rows. Genuine now: RLS actually applies.
  PERFORM set_config('request.jwt.claims', c_plain, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.admin_audit_log;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED: F5 a non-admin must read zero audit rows, read %', n; END IF;

  -- F6 an admin reads them. Compared against the OWNER count so a silently
  -- empty table could not make this pass.
  PERFORM set_config('request.jwt.claims', c_admin, true);
  SELECT count(*) INTO n FROM public.admin_audit_log;
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO n2 FROM public.admin_audit_log;
  IF n2 = 0 THEN RAISE EXCEPTION 'FAILED: F6pre the audit log is unexpectedly empty, so F6 could pass vacuously'; END IF;
  IF n <> n2 THEN
    RAISE EXCEPTION 'FAILED: F6 an admin must read every audit row (admin saw %, owner sees %)', n, n2;
  END IF;

  -- =========================================================================
  -- G. get_league_profiles contract  — context: CLIENT
  -- =========================================================================
  PERFORM set_config('request.jwt.claims', c_master, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO n FROM public.get_league_profiles(ARRAY[bot_p]) g WHERE g.is_disabled = false;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED: G1 an enabled bot must report is_disabled = false'; END IF;

  PERFORM public.admin_update_bot_profile(bot_p, NULL, NULL, NULL, true);

  SELECT count(*) INTO n FROM public.get_league_profiles(ARRAY[bot_p]) g WHERE g.is_disabled = true;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAILED: G2 a disabled bot must still be RETURNED and flagged, not dropped — dropping it makes the drawer render "Unknown"';
  END IF;

  -- G3 the contract must never publish an auth id.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public' AND p.proname = 'get_league_profiles'
       AND pg_get_function_result(p.oid) ILIKE '%user_id%'
  ) THEN
    RAISE EXCEPTION 'FAILED: G3 get_league_profiles must NOT expose user_id';
  END IF;

  -- G4 an unauthenticated caller gets nothing, even holding the grant.
  PERFORM set_config('request.jwt.claims', c_none, true);
  SELECT count(*) INTO n FROM public.get_league_profiles(ARRAY[bot_p]);
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED: G4 a caller with no subject must receive zero rows'; END IF;

  -- =========================================================================
  -- H. show_bot_labels  — the other section v1 could not test
  -- =========================================================================
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO n FROM public.app_settings
   WHERE key = 'show_bot_labels' AND value = '{"enabled": false}'::jsonb;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED: H1 show_bot_labels must be seeded and default to false'; END IF;

  -- H2 a non-admin cannot change it. The app_settings UPDATE policy requires
  -- has_role(admin), so with no matching policy the statement affects zero rows
  -- rather than raising.
  PERFORM set_config('request.jwt.claims', c_plain, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  affected := 0;
  BEGIN
    UPDATE public.app_settings SET value = '{"enabled": true}'::jsonb WHERE key = 'show_bot_labels';
    GET DIAGNOSTICS affected = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN affected := 0;
  END;
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO n FROM public.app_settings
   WHERE key = 'show_bot_labels' AND value = '{"enabled": false}'::jsonb;
  IF affected <> 0 OR n <> 1 THEN
    RAISE EXCEPTION 'FAILED: H2 a non-admin must not be able to change the policy (rows affected %)', affected;
  END IF;

  -- H3 an admin can. A grant-level refusal here would mean `authenticated`
  -- lacks UPDATE on app_settings, which would also break the production admin
  -- panel — so it is reported explicitly rather than surfacing as a raw 42501.
  PERFORM set_config('request.jwt.claims', c_admin, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  affected := -1;
  BEGIN
    UPDATE public.app_settings SET value = '{"enabled": true}'::jsonb WHERE key = 'show_bot_labels';
    GET DIAGNOSTICS affected = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'FAILED: H3 authenticated lacks the UPDATE grant on app_settings — the admin panel could not write either';
  END;

  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO n FROM public.app_settings
   WHERE key = 'show_bot_labels' AND value = '{"enabled": true}'::jsonb;
  IF affected <> 1 OR n <> 1 THEN
    RAISE EXCEPTION 'FAILED: H3 an admin must be able to change the policy (rows affected %)', affected;
  END IF;

  -- =========================================================================
  -- Done. Back to the session role so the trailing statements are unambiguous.
  -- =========================================================================
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);

  RAISE NOTICE '=========================================';
  RAISE NOTICE '  ALL PHASE A SQL TESTS PASSED';
  RAISE NOTICE '=========================================';
END
$outer$;

-- The SQL Editor frequently does not surface RAISE NOTICE, so the marker is
-- also returned as a result row. If the DO block raised, the transaction is
-- aborted and this statement never produces it.
SELECT 'ALL PHASE A SQL TESTS PASSED' AS result;

-- Nothing is kept. Every fixture, friendship, bot, block and audit row is
-- discarded. There is no COMMIT anywhere in this file.
ROLLBACK;
